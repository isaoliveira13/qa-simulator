// Armazenamento da sessão de teste entre chamadas — equivalente ao
// `$getWorkflowStaticData('global').sessoes` do n8n, só que num lugar
// que sobrevive entre invocações de funções serverless (Redis via Upstash).
//
// A integração "Upstash for Redis" via Vercel Marketplace cria as variáveis
// com prefixo KV_ (KV_REST_API_URL / KV_REST_API_TOKEN), não UPSTASH_REDIS_REST_URL/TOKEN
// — por isso construímos o client manualmente em vez de usar Redis.fromEnv().

const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

const TTL_SEGUNDOS = 60 * 60; // 1 hora — sessão de teste é sempre curta; expira sozinha se abandonada.
const PREFIXO = 'qa-conversacional:sessao:';

function chave(conversationId) {
  return PREFIXO + conversationId;
}

async function getSession(conversationId) {
  return redis.get(chave(conversationId));
}

async function setSession(conversationId, session) {
  await redis.set(chave(conversationId), session, { ex: TTL_SEGUNDOS });
}

async function deleteSession(conversationId) {
  await redis.del(chave(conversationId));
}

module.exports = {
  getSession,
  setSession,
  deleteSession
};
