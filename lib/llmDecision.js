// Decisão do "simulador" via IA — equivalente aos nodes "Decidir Resposta (IA)"
// e "Mesclar Estado" no n8n. Antes rodava via node de LangChain do n8n; aqui
// chama a OpenAI diretamente, com o MESMO prompt.

const { hasSuccessEvidence, checarLimitesDeLoop } = require('./heuristics');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// Nota: o workflow original usava "gpt-5.4-nano" — confirme o nome exato do
// modelo disponível na sua conta OpenAI antes de subir para produção.

function montarPrompt(session) {
  const avatarHistRecente = JSON.stringify((session.avatarHist || []).slice(-4));
  return `Você está simulando uma pessoa real que está conversando com uma IA (assistente virtual, avatar de atendimento, chatbot etc. — qualquer que seja o tipo). Responda SEMPRE em português, de forma natural e curta (1 a 3 frases).

--- CENÁRIO (quem você é e como deve se comportar) ---
${session.cenario}

--- CRITÉRIO DE SUCESSO DO TESTE ---
${session.criterioSucesso}

--- DADOS QUE VOCÊ PODE PRECISAR INFORMAR ---
Se a IA pedir alguma informação sua (nome, contato, ou qualquer outro dado) que não esteja explicitamente definida no CENÁRIO, invente um dado fictício plausível e coerente com o que o CENÁRIO descreve sobre você — e reutilize EXATAMENTE o mesmo dado em todas as respostas seguintes desta conversa (nunca troque de um turno para o outro).

--- HISTÓRICO RECENTE DA IA (mais antigo → mais novo) ---
${avatarHistRecente}

--- ÚLTIMA MENSAGEM DA IA ---
"""
${session.avatarMessage}
"""

--- REGRAS ---
1. Siga SEMPRE, fielmente, o comportamento e as instruções descritas no CENÁRIO — seja ele qual for (cooperativo, resistente, curioso, apressado, técnico, indiferente etc.). O CENÁRIO manda mais do que qualquer suposição sua sobre como uma pessoa 'normal' agiria.
2. Responda apenas ao que foi perguntado ou proposto pela IA; não adiante informações que não foram pedidas.
3. Marque acao = "sucesso" SOMENTE se a ÚLTIMA MENSAGEM DA IA demonstrar, de forma clara e definitiva, que o CRITÉRIO DE SUCESSO foi cumprido como conclusão da interação. NÃO marque sucesso se: (a) o critério foi mencionado apenas de forma lateral/incidental, enquanto a interação principal ainda está em andamento; ou (b) a ÚLTIMA MENSAGEM DA IA ainda está pedindo alguma ação ou informação sua para prosseguir — isso significa que a interação NÃO terminou, mesmo que o critério já tenha aparecido antes no HISTÓRICO RECENTE. Use o HISTÓRICO apenas como contexto de continuidade, nunca como motivo isolado para decidir sucesso.
4. Se a interação travar (a IA repetindo 3x a mesma coisa sem avançar), use acao = "erro".
5. Caso contrário, use acao = "continuar".

--- FORMATO DE SAÍDA (OBRIGATÓRIO) ---
Responda APENAS com JSON válido, SEM blocos de código, SEM texto antes ou depois:
{"acao":"continuar","resposta":"...","motivo":null}`;
}

// Chama a OpenAI e devolve o texto bruto da resposta.
async function chamarOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  const texto = await res.text();
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${texto.slice(0, 300)}`);

  const data = JSON.parse(texto);
  return data.choices?.[0]?.message?.content || '';
}

// Parser tolerante do JSON de saída da IA — equivalente ao trecho inicial
// do node "Mesclar Estado" (remove blocos de código, corta lixo antes/depois do JSON).
function parseDecisaoBruta(rawOutput) {
  let txt = String(rawOutput || '').trim()
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
  if (i !== -1 && j !== -1) txt = txt.slice(i, j + 1);

  try {
    return JSON.parse(txt);
  } catch (e) {
    return { acao: 'erro', resposta: '', motivo: 'Falha ao interpretar IA: ' + txt };
  }
}

// Pede a decisão à IA e já devolve a sessão atualizada (equivalente aos dois
// nodes "Decidir Resposta (IA)" + "Mesclar Estado" juntos).
async function decidirProximoPasso(session) {
  const prompt = montarPrompt(session);
  const rawOutput = await chamarOpenAI(prompt);
  const decisaoBruta = parseDecisaoBruta(rawOutput);

  let acao = String(decisaoBruta.acao || 'continuar').toLowerCase();
  let nextQuestion = decisaoBruta.resposta || '';
  let motivo = decisaoBruta.motivo || null;

  if (acao === 'sucesso') {
    const textosRecentes = [session.avatarMessage, ...(session.avatarHist || [])];
    if (!hasSuccessEvidence(session.criterioSucesso, textosRecentes)) {
      acao = 'continuar';
      motivo = null;
    }
  }

  const lastProgressIter = nextQuestion ? session.iteration : (session.lastProgressIter || 0);

  if (session.erroHttp) {
    acao = 'erro';
    motivo = motivo || ('Falha HTTP: ' + session.erroHttp);
  }

  if (acao === 'continuar') {
    const sessaoParaChecar = { ...session, lastProgressIter };
    const { forcarErro, motivo: motivoLimite } = checarLimitesDeLoop(sessaoParaChecar);
    if (forcarErro) {
      acao = 'erro';
      motivo = motivo || motivoLimite;
    }
  }

  return { ...session, status: acao, motivo, nextQuestion, lastProgressIter };
}

module.exports = {
  montarPrompt,
  chamarOpenAI,
  parseDecisaoBruta,
  decidirProximoPasso
};
