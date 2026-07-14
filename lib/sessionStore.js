// Armazenamento da sessão de teste entre chamadas — equivalente ao
// `$getWorkflowStaticData('global').sessoes` do n8n, só que num lugar
// que sobrevive entre invocações de funções serverless (Redis via Upstash).
//
// Requer as variáveis de ambiente UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN,
// criadas automaticamente ao instalar a integração "Upstash for Redis" (Vercel Marketplace)
// e conectá-la a este projeto.

const { Redis } = require('@upstash/redis');

const redis = Redis.fromEnv();

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
