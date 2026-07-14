// Chamadas à API do Zenta — equivalentes às chamadas httpRequest espalhadas
// pelos nodes "Inicializar Sessão", "Enviar ao Avatar" e "Finalizar" no n8n.

const RETRY_STATUS = [408, 429, 500, 502, 503, 504];

async function httpJSON(url, { method = 'GET', headers = {}, body, timeout = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const texto = await res.text();
    let data = null;
    try { data = texto ? JSON.parse(texto) : null; } catch (e) { /* resposta não-JSON */ }
    if (!res.ok) {
      const erro = new Error(`HTTP ${res.status}${texto ? ': ' + texto.slice(0, 300) : ''}`);
      erro.statusCode = res.status;
      throw erro;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve host_token a partir do host_slug, usando o domain_token — equivalente
// ao trecho de resolução de credenciais dentro do node "Inicializar Sessão".
async function resolveHostToken({ baseUrl, hostSlug, hostId, domainToken }) {
  if (!domainToken) {
    throw new Error('Forneça host_token no config OU configure ZENTA_DOMAIN_TOKEN.');
  }
  const domainHeaders = { Authorization: `Bearer ${domainToken}` };
  const tokensUrl = `${baseUrl}/api/externalAPIs/public/domainAccess/getAccessTokens`;

  const list = await httpJSON(tokensUrl, { headers: domainHeaders });
  const hosts = (list && list.data) ? list.data : (Array.isArray(list) ? list : []);
  const host = hosts.find(h => (h.host_slug || h.slug) === hostSlug);
  if (!host) throw new Error(`Host "${hostSlug}" não encontrado.`);

  const pickToken = h => (h && (h.host_token || h.our_token || h.token || h.access_token)) || '';
  const pickId = h => (h && (h.host_id || h.hostId || h.id)) || '';

  let resolvedHostId = hostId || pickId(host);
  let hostToken = pickToken(host);

  if (!hostToken) {
    const one = await httpJSON(`${tokensUrl}?choosenHostId=${encodeURIComponent(resolvedHostId)}`, { headers: domainHeaders });
    const arr = (one && one.data) ? one.data : (Array.isArray(one) ? one : []);
    const hd = arr.find(h => pickId(h) === resolvedHostId) || arr[0] || {};
    hostToken = pickToken(hd);
    if (!hostToken) throw new Error('host_token não retornado pela API.');
  }

  return { hostId: resolvedHostId, hostToken };
}

// Cria a conversa no Zenta — equivalente à chamada conversations/create.
async function createConversation({ baseUrl, hostId, hostToken, subSlug }) {
  const body = { hostId };
  if (subSlug) body.subSlug = subSlug;

  const resp = await httpJSON(`${baseUrl}/api/externalAPIs/public/zentaReasoning/conversations/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hostToken}` },
    body
  });

  const conversationId = (resp && (resp.conversationId || (resp.data && resp.data.conversationId))) || null;
  if (!conversationId) throw new Error('conversations/create sem conversationId. Resp: ' + JSON.stringify(resp).slice(0, 300));
  return conversationId;
}

// Manda a mensagem do "simulador" e recebe a resposta do avatar, com até 3 tentativas
// em caso de erro transitório. Equivalente ao node "Enviar ao Avatar".
async function callReasoning({ baseUrl, hostId, hostToken, conversationId, question, subSlug }) {
  const url = `${baseUrl}/api/externalAPIs/public/zentaReasoning/callReasoning`;
  const body = { hostId, question, returnDialogue: true, reasoningConfig: { returnDialogue: true, zentaCompleteLog: true } };
  if (conversationId) body.conversationId = conversationId;
  if (subSlug) body.subSlug = subSlug;

  let resp = null, erroHttp = null, statusCode = null, tentativas = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    tentativas = attempt;
    try {
      resp = await httpJSON(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` },
        body,
        timeout: 60000
      });
      erroHttp = null;
      statusCode = 200;
      break;
    } catch (e) {
      statusCode = e.statusCode || null;
      erroHttp = e.message || String(e);
      if (attempt < 3 && (!statusCode || RETRY_STATUS.includes(Number(statusCode)))) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      break;
    }
  }

  let avatarMessage = '', okStatus = false, novoConversationId = conversationId;
  if (resp) {
    const d = resp.data || {};
    avatarMessage = (d.assistantResponse && d.assistantResponse.string) ? d.assistantResponse.string : '';
    okStatus = d.responseStatus && d.responseStatus.ok === true;
    novoConversationId = d.conversationId || conversationId;
  }

  return { avatarMessage, okStatus, conversationId: novoConversationId, statusCode, tentativas, erroHttp };
}

// Busca resumo/sentimento da conversa completa — equivalente à chamada dentro do node "Finalizar".
// Não lança erro: se falhar, retorna null (igual o try/catch vazio original).
async function getConversationInformation({ baseUrl, hostToken, conversationId }) {
  try {
    const r = await httpJSON(`${baseUrl}/api/externalAPIs/public/zentaReasoning/conversations/getConversationInformation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
      body: { conversationId, noCache: true },
      timeout: 30000
    });
    return (r && r.data) ? r.data : r;
  } catch (e) {
    return null;
  }
}

module.exports = {
  resolveHostToken,
  createConversation,
  callReasoning,
  getConversationInformation
};
