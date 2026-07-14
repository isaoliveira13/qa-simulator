// Decisão do "simulador" via IA — equivalente aos nodes "Decidir Resposta (IA)"
// e "Mesclar Estado" no n8n. Antes rodava via node de LangChain do n8n; aqui
// chama a OpenAI diretamente.
//
// O papel do personagem (cenário, regras, formato de saída) vai em uma mensagem
// "system" separada da última fala da IA testada (mensagem "user"). Enviar tudo
// junto em uma única mensagem "user" fazia o modelo, vez ou outra, "esquecer" que
// deveria representar o usuário e responder como se fosse o próprio assistente
// de atendimento (ex.: perguntando "como posso ajudar?"). Separar os papéis reduz
// bastante esse tipo de inversão.

const { hasSuccessEvidence, checarLimitesDeLoop } = require('./heuristics');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Rótulos em português para os campos de dados_fixos (nome, cpf, telefone etc.).
// Manter esse bloco separado do CENÁRIO em texto livre é bem mais confiável do
// que confiar no modelo para extrair o nome/CPF/etc. de dentro de uma frase corrida
// — sem isso, modelos menores (ex.: gpt-4o-mini) por vezes "esquecem" o dado real
// e caem num nome de exemplo genérico (observado na prática: variações de "Ana").
const ROTULOS_DADOS_FIXOS = {
  nome: 'Nome completo',
  cpf: 'CPF',
  telefone: 'Telefone',
  genero: 'Gênero',
  email: 'Email',
  nascimento: 'Data de nascimento',
  cidade: 'Cidade'
};

function formatarDadosFixos(dadosFixos) {
  if (!dadosFixos) return '';
  const linhas = Object.keys(ROTULOS_DADOS_FIXOS)
    .filter(chave => dadosFixos[chave])
    .map(chave => `${ROTULOS_DADOS_FIXOS[chave]}: ${dadosFixos[chave]}`);
  if (!linhas.length) return '';
  return `\n\n--- DADOS FIXOS DESTA PESSOA (fatos reais — use EXATAMENTE estes valores sempre que a IA perguntar por eles; NUNCA invente um substituto, mesmo que pareça mais natural) ---\n${linhas.join('\n')}`;
}

function montarPromptSistema(session) {
  const blocoDadosFixos = formatarDadosFixos(session.dadosFixos);
  return `Você está simulando uma pessoa REAL, um usuário qualquer, em uma conversa com uma IA de atendimento (assistente virtual, avatar, chatbot etc.). Você é o USUÁRIO desta conversa — NUNCA o assistente. Nunca ofereça ajuda, nunca pergunte "como posso ajudar" ou similar, nunca assuma o papel de quem atende. Responda SEMPRE em português, de forma natural e curta (1 a 3 frases), como se você mesmo estivesse escrevendo para a IA.
${blocoDadosFixos}

--- CENÁRIO (quem você é e como deve se comportar) ---
${session.cenario}

--- CRITÉRIO DE SUCESSO DO TESTE ---
${session.criterioSucesso}

--- DADOS QUE VOCÊ PODE PRECISAR INFORMAR ---
Se um dado (nome, CPF, telefone, email, data de nascimento, cidade etc.) JÁ estiver definido no bloco "DADOS FIXOS DESTA PESSOA" acima OU explicitamente no CENÁRIO, use EXATAMENTE esse valor sempre que a IA perguntar por ele — nunca invente um substituto, mesmo que o valor pareça um exemplo ou não tenha sido mencionado ainda na conversa. Invente um dado fictício plausível SOMENTE para informações que a IA pedir e que não estejam definidas em nenhum dos dois lugares — e, nesse caso, reutilize EXATAMENTE o mesmo dado inventado em todas as respostas seguintes desta conversa (nunca troque de um turno para o outro).

--- REGRAS ---
1. Siga SEMPRE, fielmente, o comportamento e as instruções descritas no CENÁRIO — seja ele qual for (cooperativo, resistente, curioso, apressado, técnico, indiferente etc.). O CENÁRIO manda mais do que qualquer suposição sua sobre como uma pessoa 'normal' agiria. Isso vale em especial para dados de identificação (nome, CPF, telefone, email, nascimento, cidade): se estiverem no bloco "DADOS FIXOS DESTA PESSOA" ou no CENÁRIO, são fatos fixos sobre você, não sugestões — NUNCA troque por outro valor.
2. Você está sendo atendido, não atendendo. Responda apenas ao que foi perguntado ou proposto pela IA; não adiante informações que não foram pedidas, e nunca inverta os papéis.
3. Marque acao = "sucesso" SOMENTE se a ÚLTIMA MENSAGEM DA IA demonstrar, de forma clara e definitiva, que o CRITÉRIO DE SUCESSO foi cumprido como conclusão da interação. NÃO marque sucesso se: (a) o critério foi mencionado apenas de forma lateral/incidental, enquanto a interação principal ainda está em andamento; ou (b) a ÚLTIMA MENSAGEM DA IA ainda está pedindo alguma ação ou informação sua para prosseguir — isso significa que a interação NÃO terminou, mesmo que o critério já tenha aparecido antes no HISTÓRICO RECENTE. Use o HISTÓRICO apenas como contexto de continuidade, nunca como motivo isolado para decidir sucesso.
4. Se a interação travar (a IA repetindo 3x a mesma coisa sem avançar), use acao = "erro".
5. Caso contrário, use acao = "continuar".

--- FORMATO DE SAÍDA (OBRIGATÓRIO) ---
Responda APENAS com JSON válido, SEM blocos de código, SEM texto antes ou depois:
{"acao":"continuar","resposta":"...","motivo":null}`;
}

function montarPromptUsuario(session) {
  const avatarHistRecente = JSON.stringify((session.avatarHist || []).slice(-4));
  return `--- HISTÓRICO RECENTE DA IA (mais antigo → mais novo) ---
${avatarHistRecente}

--- ÚLTIMA MENSAGEM DA IA ---
"""
${session.avatarMessage}
"""`;
}

// Chama a OpenAI e devolve o texto bruto da resposta.
async function chamarOpenAI(promptSistema, promptUsuario) {
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
      messages: [
        { role: 'system', content: promptSistema },
        { role: 'user', content: promptUsuario }
      ],
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
  const promptSistema = montarPromptSistema(session);
  const promptUsuario = montarPromptUsuario(session);
  const rawOutput = await chamarOpenAI(promptSistema, promptUsuario);
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
  montarPromptSistema,
  montarPromptUsuario,
  chamarOpenAI,
  parseDecisaoBruta,
  decidirProximoPasso
};
