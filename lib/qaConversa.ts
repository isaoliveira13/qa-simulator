/**
 * O motor da simulacao — o que antes era o repo irmao `coisasdaisa`
 * (api/qa-conversacional-pai.js + lib/finalReport.js). Desde 27/08/2026 mora
 * aqui: nao existe mais COISASDAISA_URL, nem deploy separado pra ficar fora
 * do ar, nem Redis proprio.
 *
 * Uma conversa e um vaivem de tres tempos, e este arquivo e so isso:
 *
 *   novo      -> abre a conversa na Zenta e roda o primeiro turno
 *   continuar -> roda mais um turno de onde parou
 *   encerrar  -> fecha na marra e emite o relatorio do que houve ate ali
 *
 * A cada turno: manda a fala da pessoa pro avatar (lib/zenta.ts), pergunta pra
 * IA o que a pessoa faria em seguida (lib/qaSimulador.ts), e deixa as
 * heuristicas (lib/qaHeuristicas.ts) vetarem a decisao dela quando a conversa
 * esta em loop ou o "sucesso" nao tem lastro. Quando para de ser "continuar",
 * vira relatorio final e a sessao e apagada.
 */

import { AvatarTurn, QuandoEmbaralhar, TurnoRoteiro } from "./types";
import { ApiAmbiente, AMBIENTES_ZENTA } from "./destinos";
import {
  createConversation,
  tokensDeDominio,
  getConversationInformation,
  gerarRespostaAvatarFicticia,
  resolveHostToken,
} from "./zenta";
import { SessaoConversa, comporAbertura, criterioCumpridoNaTranscricao, decidirProximoPasso } from "./qaSimulador";
import { entradaDoTurno } from "./roteiroTurnos";
import { ajustarOcorrencias, ParOcorrencia } from "./embaralhar";
import { updateLoopCounters } from "./qaHeuristicas";
import { deleteSession, getSession, limparSessoesVencidas, setSession } from "./qaSessao";

const ZENTA_BASE_URL_PADRAO = AMBIENTES_ZENTA.prod;

/**
 * MODO DEMO: limite absoluto de turnos por conversa, pra não sobrecarregar —
 * vale por cima de QUALQUER max_turnos vindo de um teste salvo ou avulso.
 */
const LIMITE_TURNOS_DEMO = 10;

export interface ConfigConversa {
  host_slug?: string;
  sub_slug?: string | null;
  base_url?: string | null;
  /**
   * Texto da primeira mensagem quando NAO ha roteiro (switch "Escrever a
   * mensagem de cada turno" desligado). Com roteiro, quem manda na abertura e
   * o turno 1 dele. Campo legado: o assistente nao mostra mais essa caixa
   * desde 02/09/2026, mas simulacoes antigas ainda trazem o valor salvo.
   */
  saudacao_inicial?: string;
  max_turnos?: number;
  /**
   * Roteiro de turnos ja resolvido pra pessoa desta conversa (a rota /run
   * troca os {placeholders} antes de chamar aqui). Ausente ou vazio = a
   * pessoa improvisa a partir do cenario, como sempre foi.
   */
  roteiro_turnos?: TurnoRoteiro[] | null;
  /**
   * Switch "rodar o roteiro inteiro" (08/09/2026): com roteiro ligado, o
   * criterio de sucesso nao encerra a conversa no meio — ela vai ate o fim do
   * roteiro e o veredito sai depois. Ver decidirProximoPasso.
   */
  rodar_roteiro_completo?: boolean;
  /**
   * Embaralhamento de dados (etapa 4). Os dados desta conversa ja chegam aqui
   * trocados (a rota /run faz isso antes de preencher cenario e roteiro);
   * isto aqui e so o que a regra de ocorrencia precisa pra desfazer a troca
   * nas vezes em que o dado deve sair certo, mais o de-para pro historico.
   */
  embaralho?: { pares: ParOcorrencia[]; quando: QuandoEmbaralhar; resumo: string } | null;
}

export interface RespostaTurno {
  status: "continuar";
  conversation_id: string;
  turno_atual: number;
  max_turnos: number;
  ultimo_turno: AvatarTurn | null;
  cenario: string;
  criterio_sucesso: string;
}

export interface RelatorioFinal {
  /**
   * Nunca presente — declarado so pra `status === "continuar"` distinguir um
   * turno de um relatorio final numa uniao. E o mesmo truque que
   * lib/useLoteBatch.ts ja usava do lado do navegador.
   */
  status?: undefined;
  resultado: "SUCESSO" | "FALHA" | "ENCERRADO";
  motivo_encerramento: string;
  conversation_id: string;
  cenario: string;
  criterio_sucesso: string;
  total_turnos: number;
  max_turnos: number;
  tempo_segundos: number;
  inicio: string;
  fim: string;
  transcricao: SessaoConversa["turnsLog"];
  /** De-para do embaralhamento de dados desta conversa, vazio quando nao houve. */
  embaralhamento?: string;
  sentimento_zenta: { resumo: string | null; sentimento_score: number | null; heat_score: number | null } | null;
}

/**
 * Qual das tres APIs da Zenta uma base_url e. Serve so pra escolher o token
 * do dominio certo quando ha um por ambiente configurado; sem eles, todos
 * caem no ZENTA_DOMAIN_TOKEN unico e essa distincao nao muda nada.
 */
function apiDaBaseUrl(baseUrl: string): ApiAmbiente {
  const limpa = baseUrl.replace(/\/$/, "");
  if (limpa === AMBIENTES_ZENTA.homolog) return "homolog";
  if (limpa === AMBIENTES_ZENTA.stage) return "stage";
  return "prod";
}

/** Abre a conversa na Zenta e monta o estado inicial. */
export async function inicializarSessao(body: {
  config?: ConfigConversa;
  cenario: string;
  criterio_sucesso?: string;
  dados_fixos?: Record<string, unknown> | null;
}): Promise<SessaoConversa> {
  const cfg = body.config || {};

  if (!body.cenario) throw new Error("Obrigatorio: cenario");

  // Criterio de sucesso continua opcional: sem ele a conversa roda ate o
  // limite de turnos e isso e o desfecho esperado, nao uma falha.
  const maxTurnosPedido = cfg.max_turnos ? parseInt(String(cfg.max_turnos), 10) : LIMITE_TURNOS_DEMO;
  if (!Number.isFinite(maxTurnosPedido) || maxTurnosPedido < 1) {
    throw new Error("config.max_turnos, se informado, deve ser >= 1");
  }
  // MODO DEMO: nunca deixa passar de 10 turnos, mesmo que o teste salvo peça mais.
  const maxTurnos = Math.min(maxTurnosPedido, LIMITE_TURNOS_DEMO);

  const baseUrl = (cfg.base_url || process.env.ZENTA_BASE_URL || ZENTA_BASE_URL_PADRAO).replace(/\/$/, "");
  const hostSlug = cfg.host_slug || "us";
  const subSlug = cfg.sub_slug || null;
  const saudacao = cfg.saudacao_inicial || "Olá! Gostaria de mais informações.";

  const { hostId, hostToken } = await resolveHostToken({
    baseUrl,
    hostSlug,
    tokens: tokensDeDominio(apiDaBaseUrl(baseUrl)),
  });

  const conversationId = await createConversation({ baseUrl, hostId, hostToken, subSlug });

  const roteiroTurnos = cfg.roteiro_turnos && cfg.roteiro_turnos.length ? cfg.roteiro_turnos : null;

  const session: SessaoConversa = {
    baseUrl,
    hostId,
    hostToken,
    hostSlug,
    subSlug,
    conversationId,
    cenario: String(body.cenario),
    criterioSucesso: body.criterio_sucesso ? String(body.criterio_sucesso) : "",
    dadosFixos: body.dados_fixos && typeof body.dados_fixos === "object" ? body.dados_fixos : null,
    maxTurnos,
    saudacao,
    roteiroTurnos,
    rodarRoteiroCompleto: !!cfg.rodar_roteiro_completo,
    sucessoSeguradoNoTurno: null,
    embaralhoPares: cfg.embaralho ? cfg.embaralho.pares : null,
    embaralhoQuando: cfg.embaralho ? cfg.embaralho.quando : null,
    embaralhoContagem: {},
    embaralhoResumo: cfg.embaralho ? cfg.embaralho.resumo : null,
    startISO: new Date().toISOString(),
    startMs: Date.now(),
    iteration: 0,
    status: "continuar",
    motivo: null,
    // Preenchido logo abaixo: a abertura pode precisar de uma chamada de IA.
    nextQuestion: saudacao,
    turnsLog: [],
    avatarHist: [],
    consecSimilar: 0,
    repeatExact: 0,
    lastProgressIter: 0,
  };

  session.nextQuestion = await mensagemDeAbertura(session, roteiroTurnos, saudacao);

  await limparSessoesVencidas();
  await setSession(conversationId, session);
  return session;
}

/**
 * A primeira mensagem da conversa — o turno 1 (02/09/2026: deixou de ser um
 * campo "saudacao" fora da contagem e virou a primeira linha do roteiro).
 *
 * Sem roteiro (switch desligado), continua sendo o texto salvo/padrao, igual
 * a antes. Com roteiro, o turno 1 vale nos tres modos:
 *   - "exato":     manda a frase literal;
 *   - "instrucao": a IA escreve a abertura seguindo o pedido;
 *   - "livre":     a IA abre a conversa a partir do cenario.
 */
async function mensagemDeAbertura(
  session: SessaoConversa,
  roteiro: TurnoRoteiro[] | null,
  padrao: string
): Promise<string> {
  if (!roteiro || !roteiro.length) return padrao;
  // entradaDoTurno devolve null no modo "livre" — e ai a abertura e escrita
  // pela IA sem instrucao nenhuma, so com o cenario.
  const entrada = entradaDoTurno(roteiro, 1);
  if (entrada && entrada.modo === "exato") return entrada.texto.trim() || padrao;
  return comporAbertura(session, entrada, padrao);
}

/** Um turno inteiro: fala, resposta, decisao, e o que fazer com ela. */
export async function rodarTurno(session: SessaoConversa): Promise<RespostaTurno | RelatorioFinal> {
  // Regra de ocorrencia do embaralhamento: a fala ja vem com os dados
  // trocados, e aqui as vezes que deveriam sair certas voltam ao valor
  // verdadeiro. Com "toda vez" (o padrao) isto devolve o texto intacto.
  const ajuste = ajustarOcorrencias(
    session.nextQuestion,
    session.embaralhoPares || [],
    session.embaralhoQuando || { tipo: "sempre" },
    session.embaralhoContagem || {}
  );
  const pergunta = ajuste.texto;

  const iteration = (session.iteration || 0) + 1;

  // MODO DEMO: a decisão de "resolver o critério agora" é tomada AQUI, antes
  // de gerar a fala do avatar fictício — assim o texto do avatar já nasce
  // ecoando o critério quando for o caso, e decidirProximoPasso (em
  // qaSimulador.ts) só precisa LER essa decisão, nunca adivinhar de novo.
  // Chance cresce a cada turno pra quase sempre resolver bem antes do limite
  // de turnos, sem nunca resolver no primeiríssimo turno (turno 1 é só a
  // saudação do avatar) nem quando o sucesso já está garantido esperando o
  // fim do roteiro.
  const temCriterio = !!(session.criterioSucesso && session.criterioSucesso.trim());
  const jaGarantido = session.sucessoSeguradoNoTurno != null;
  const chanceDeResolver = temCriterio && !jaGarantido && iteration >= 2 ? Math.min(0.85, 0.08 * iteration) : 0;
  const resolverAgora = chanceDeResolver > 0 && Math.random() < chanceDeResolver;

  const avatarMessage = gerarRespostaAvatarFicticia({
    question: pergunta,
    cenario: session.cenario,
    criterioSucesso: session.criterioSucesso,
    turno: iteration,
    resolverAgora,
  });
  const okStatus = true;
  const conversationId: string | null = session.conversationId;
  const statusCode = 200;
  const tentativas = 1;
  const erroHttp: string | null = null;

  const { consecSimilar, avatarHist, repeatExact } = updateLoopCounters(session, avatarMessage);

  const turnsLog = [
    ...(session.turnsLog || []),
    {
      turno: iteration,
      enviado: pergunta,
      resposta_avatar: avatarMessage,
      responseStatus_ok: okStatus,
      http_status: statusCode,
      tentativas,
      erro_http: erroHttp,
    },
  ];

  const sessaoAposEnvio: SessaoConversa = {
    ...session,
    conversationId: conversationId || session.conversationId,
    iteration,
    embaralhoContagem: ajuste.contagem,
    avatarMessage,
    okStatus,
    erroHttp,
    statusCode,
    tentativas,
    turnsLog,
    avatarHist,
    consecSimilar,
    repeatExact,
    avatarResolveuAgora: resolverAgora,
  };

  const sessaoDecidida = await decidirProximoPasso(sessaoAposEnvio);

  if (sessaoDecidida.status === "continuar") {
    await setSession(sessaoDecidida.conversationId, sessaoDecidida);
    return montarRespostaDeTurno(sessaoDecidida);
  }

  const final = await montarRelatorioFinal(sessaoDecidida);
  await deleteSession(sessaoDecidida.conversationId);
  return final;
}

function montarRespostaDeTurno(session: SessaoConversa): RespostaTurno {
  const ultimo = session.turnsLog && session.turnsLog.length ? session.turnsLog[session.turnsLog.length - 1] : null;
  return {
    status: "continuar",
    conversation_id: session.conversationId,
    turno_atual: session.iteration,
    max_turnos: session.maxTurnos,
    ultimo_turno: ultimo
      ? { turno: ultimo.turno, enviado: ultimo.enviado, resposta_avatar: ultimo.resposta_avatar }
      : null,
    cenario: session.cenario,
    criterio_sucesso: session.criterioSucesso,
  };
}

/**
 * Relatorio final. Duas sutilezas que valem guardar:
 *
 *  - quando NAO havia criterio de sucesso, bater o limite de turnos e o
 *    desfecho combinado — vira ENCERRADO, nao FALHA. Marcar isso como falha
 *    enchia o historico de vermelho em teste que rodou exatamente como devia.
 *  - quando HAVIA criterio e a conversa acabou sem sucesso, a IA le a
 *    transcricao inteira antes de cravar FALHA (criterioCumpridoNaTranscricao):
 *    criterio cumprido em QUALQUER turno vale, mesmo que a conversa tenha
 *    seguido depois. Falha de HTTP e encerramento manual nao passam por essa
 *    revisao — nos dois casos o desfecho nao e sobre o criterio.
 */
export async function montarRelatorioFinal(session: SessaoConversa): Promise<RelatorioFinal> {
  const tempoSeg = Math.round((Date.now() - (session.startMs || Date.now())) / 10) / 100;
  const manual = session.encerradoManualmente === true;

  let sucesso = session.status === "sucesso";
  let sucessoNaRevisao = false;
  if (!sucesso && !manual && !session.erroHttp && session.criterioSucesso && session.criterioSucesso.trim()) {
    sucessoNaRevisao = await criterioCumpridoNaTranscricao(session);
    sucesso = sucessoNaRevisao;
  }

  const infoZenta = await getConversationInformation({
    baseUrl: session.baseUrl,
    hostToken: session.hostToken,
    conversationId: session.conversationId,
  });

  const temCriterio = !!(session.criterioSucesso && session.criterioSucesso.trim());
  const limiteDeTurnosAtingido = !sucesso && /Limite de \d+ turnos atingido/.test(session.motivo || "");
  const semCriterioELimite = !manual && !temCriterio && limiteDeTurnosAtingido;

  const resultado: RelatorioFinal["resultado"] = manual
    ? "ENCERRADO"
    : sucesso
      ? "SUCESSO"
      : semCriterioELimite
        ? "ENCERRADO"
        : "FALHA";

  const motivoBase = manual
    ? "Teste encerrado manualmente pelo usuário."
    : sucesso
      ? sucessoNaRevisao
        ? "Critério atingido durante a conversa (identificado na revisão final da transcrição)"
        : session.sucessoSeguradoNoTurno != null
          ? `Critério atingido no turno ${session.sucessoSeguradoNoTurno}; a conversa seguiu até o fim do roteiro.`
          : "Critério atingido"
      : semCriterioELimite
        ? "Conversa concluída ao atingir o limite de turnos (nenhum critério de sucesso foi definido para este teste)."
        : session.motivo || "Não concluído";

  // MODO DEMO: deixa explícito, no próprio relatório, que nada disso
  // aconteceu de verdade — nenhuma chamada real à Zenta ou a qualquer IA.
  const motivo_encerramento = `${motivoBase} (demonstração — conversa e respostas fictícias, geradas localmente, sem nenhuma chamada real)`;

  return {
    resultado,
    motivo_encerramento,
    conversation_id: session.conversationId,
    cenario: session.cenario,
    criterio_sucesso: session.criterioSucesso,
    total_turnos: session.iteration,
    max_turnos: session.maxTurnos,
    tempo_segundos: tempoSeg,
    inicio: session.startISO,
    fim: new Date().toISOString(),
    transcricao: session.turnsLog,
    ...(session.embaralhoResumo ? { embaralhamento: session.embaralhoResumo } : {}),
    sentimento_zenta: infoZenta
      ? {
          resumo: infoZenta.dialogue_summary || null,
          sentimento_score: infoZenta.sentiment_score ?? null,
          heat_score: infoZenta.heat_score ?? null,
        }
      : null,
  };
}

/**
 * A conversa inteira vista de fora — o mesmo contrato que a rota /run
 * repassava pro coisasdaisa, agora atendido aqui dentro.
 */
export async function conversar(body: {
  conversationId?: string | null;
  encerrar?: boolean;
  config?: ConfigConversa;
  cenario?: string;
  criterio_sucesso?: string;
  dados_fixos?: Record<string, unknown> | null;
}): Promise<RespostaTurno | RelatorioFinal> {
  if (!body.conversationId) {
    const session = await inicializarSessao({
      config: body.config,
      cenario: body.cenario || "",
      criterio_sucesso: body.criterio_sucesso,
      dados_fixos: body.dados_fixos ?? null,
    });
    return rodarTurno(session);
  }

  const session = await getSession(body.conversationId);
  if (!session) {
    throw new Error(
      `Sessão não encontrada ou expirada para a conversa ${body.conversationId} (sessões duram 1 hora). Rode a simulação de novo.`
    );
  }

  if (body.encerrar === true) {
    const final = await montarRelatorioFinal({ ...session, encerradoManualmente: true });
    await deleteSession(body.conversationId);
    return final;
  }

  return rodarTurno(session);
}
