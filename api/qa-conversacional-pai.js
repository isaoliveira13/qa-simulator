// Handler principal — equivalente a TODO o workflow PAI do n8n:
// Webhook → Rotear Entrada → É teste novo? → Inicializar Sessão / Carregar Estado
// → Encerrar solicitado? → Enviar ao Avatar → Decidir Resposta (IA) → Mesclar Estado
// → Persistir Estado → Continuar conversa? → Resposta de Turno / Finalizar → Responder Webhook
//
// Contrato com o index.html (não muda nada aqui — só a URL do webhook na interface):
//   novo:      POST { config, cenario, criterio_sucesso }
//   continuar: POST { conversation_id }
//   encerrar:  POST { conversation_id, encerrar: true }
// Resposta: { status: 'continuar', ... } OU o relatório final { resultado, ... }

const sessionStore = require('../lib/sessionStore');
const zentaClient = require('../lib/zentaClient');
const { decidirProximoPasso } = require('../lib/llmDecision');
const { updateLoopCounters } = require('../lib/heuristics');
const { buildFinalReport } = require('../lib/finalReport');

const ZENTA_BASE_URL_PADRAO = 'https://api.zenta.to';

// Equivalente ao node "Inicializar Sessão".
async function inicializarSessao(body) {
  const cfg = body.config || {};

  if (!body.cenario) throw new Error('Obrigatório: cenario');
  // criterio_sucesso é opcional: se não informado, a conversa segue normalmente
  // até atingir o limite de turnos, sem que a IA possa marcar "sucesso".

  const maxTurnos = cfg.max_turnos ? parseInt(cfg.max_turnos) : 3;
  if (!Number.isFinite(maxTurnos) || maxTurnos < 1) {
    throw new Error('config.max_turnos, se informado, deve ser >= 1');
  }

  const baseUrl = (cfg.base_url || process.env.ZENTA_BASE_URL || ZENTA_BASE_URL_PADRAO).replace(/\/$/, '');
  const hostSlug = cfg.host_slug || 'us';
  const subSlug = cfg.sub_slug || null;
  const saudacao = cfg.saudacao_inicial || 'Olá! Gostaria de mais informações.';

  let hostId = cfg.host_id || '';
  let hostToken = cfg.host_token || '';

  if (!hostToken) {
    const resolvido = await zentaClient.resolveHostToken({
      baseUrl,
      hostSlug,
      hostId,
      domainToken: cfg.domain_token || process.env.ZENTA_DOMAIN_TOKEN || ''
    });
    hostId = resolvido.hostId;
    hostToken = resolvido.hostToken;
  }

  const conversationId = await zentaClient.createConversation({ baseUrl, hostId, hostToken, subSlug });

  const session = {
    baseUrl, hostId, hostToken, hostSlug, subSlug,
    conversationId,
    cenario: String(body.cenario),
    criterioSucesso: body.criterio_sucesso ? String(body.criterio_sucesso) : '',
    dadosFixos: (body.dados_fixos && typeof body.dados_fixos === 'object') ? body.dados_fixos : null,
    maxTurnos,
    saudacao,
    startISO: new Date().toISOString(),
    startMs: Date.now(),
    iteration: 0,
    status: 'continuar',
    motivo: null,
    nextQuestion: saudacao,
    turnsLog: [],
    avatarHist: [],
    consecSimilar: 0,
    repeatExact: 0,
    lastProgressIter: 0
  };

  await sessionStore.setSession(conversationId, session);
  return session;
}

// Equivalente aos nodes "Enviar ao Avatar" → "Decidir Resposta (IA)" → "Mesclar Estado" → "Persistir Estado".
async function rodarTurno(session) {
  const resultadoZenta = await zentaClient.callReasoning({
    baseUrl: session.baseUrl,
    hostId: session.hostId,
    hostToken: session.hostToken,
    conversationId: session.conversationId,
    question: session.nextQuestion,
    subSlug: session.subSlug
  });

  const { avatarMessage, okStatus, conversationId, statusCode, tentativas, erroHttp } = resultadoZenta;
  const { consecSimilar, avatarHist, repeatExact } = updateLoopCounters(session, avatarMessage);

  const iteration = (session.iteration || 0) + 1;
  const turnsLog = [...(session.turnsLog || []), {
    turno: iteration,
    enviado: session.nextQuestion,
    resposta_avatar: avatarMessage,
    responseStatus_ok: okStatus,
    http_status: statusCode,
    tentativas,
    erro_http: erroHttp
  }];

  const sessaoAposEnvio = {
    ...session, conversationId, iteration, avatarMessage, okStatus,
    erroHttp, statusCode, tentativas, turnsLog, avatarHist, consecSimilar, repeatExact
  };

  const sessaoDecidida = await decidirProximoPasso(sessaoAposEnvio);

  if (sessaoDecidida.status === 'continuar') {
    await sessionStore.setSession(sessaoDecidida.conversationId, sessaoDecidida);
    return montarRespostaDeTurno(sessaoDecidida);
  }

  const final = await buildFinalReport(sessaoDecidida);
  await sessionStore.deleteSession(sessaoDecidida.conversationId);
  return final;
}

// Equivalente ao node "Resposta de Turno".
function montarRespostaDeTurno(session) {
  const ultimo = (session.turnsLog && session.turnsLog.length) ? session.turnsLog[session.turnsLog.length - 1] : null;
  return {
    status: 'continuar',
    conversation_id: session.conversationId,
    turno_atual: session.iteration,
    max_turnos: session.maxTurnos,
    ultimo_turno: ultimo ? { turno: ultimo.turno, enviado: ultimo.enviado, resposta_avatar: ultimo.resposta_avatar } : null,
    cenario: session.cenario,
    criterio_sucesso: session.criterioSucesso
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido, use POST.' });
  }

  const body = req.body || {};
  const conversationId = body.conversation_id || null;
  const tipo = !conversationId ? 'novo' : (body.encerrar === true ? 'encerrar' : 'continuar');

  try {
    if (tipo === 'novo') {
      const session = await inicializarSessao(body);
      const resposta = await rodarTurno(session);
      return res.status(200).json(resposta);
    }

    const session = await sessionStore.getSession(conversationId);
    if (!session) {
      // Importante: responder 200 com um corpo de erro em vez de deixar a exceção
      // "vazar" sem corpo — é exatamente esse tipo de falha silenciosa que causava
      // o "Unexpected end of JSON input" no cliente quando isso acontecia no n8n.
      console.error('[qa-conversacional-pai] sessão não encontrada:', conversationId);
      return res.status(200).json({
        status: 'erro',
        erro: `Sessão não encontrada ou expirada para conversation_id: ${conversationId}. Inicie um novo teste.`
      });
    }

    if (tipo === 'encerrar') {
      const final = await buildFinalReport({ ...session, encerradoManualmente: true });
      await sessionStore.deleteSession(conversationId);
      return res.status(200).json(final);
    }

    // continuar
    const resposta = await rodarTurno(session);
    return res.status(200).json(resposta);
  } catch (e) {
    // Loga de verdade nos Runtime Logs da Vercel — a resposta HTTP fica 200 de
    // propósito (evita corpo vazio no cliente), então sem isso o erro real
    // fica invisível nos logs, só aparecendo como "200 OK" genérico.
    console.error('[qa-conversacional-pai] erro:', e && e.stack ? e.stack : e);
    return res.status(200).json({ status: 'erro', erro: e.message || String(e) });
  }
};
