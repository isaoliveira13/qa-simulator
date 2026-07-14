// Armazenamento da sessão de teste entre chamadas — equivalente ao
// `$getWorkflowStaticData('global').sessoes` do n8n, só que num lugar
// que sobrevive entre invocações de funções serverless (Vercel KV / Redis).
//
// Requer as variáveis de ambiente KV_REST_API_URL e KV_REST_API_TOKEN,
// criadas automaticamente ao conectar um banco Vercel KV ao projeto.

const { kv } = require('@vercel/kv');

const TTL_SEGUNDOS = 60 * 60; // 1 hora — sessão de teste é sempre curta; expira sozinha se abandonada.
const PREFIXO = 'qa-conversacional:sessao:';

function chave(conversationId) {
  return PREFIXO + conversationId;
}

async function getSession(conversationId) {
  return kv.get(chave(conversationId));
}

async function setSession(conversationId, session) {
  await kv.set(chave(conversationId), session, { ex: TTL_SEGUNDOS });
}

async function deleteSession(conversationId) {
  await kv.del(chave(conversationId));
}

module.exports = {
  getSession,
  setSession,
  deleteSession
};
