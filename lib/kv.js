// Client Redis (Upstash via Vercel Marketplace) compartilhado entre as funções.
// As variáveis vêm com prefixo KV_ (KV_REST_API_URL / KV_REST_API_TOKEN), então
// construímos o client manualmente — mesmo padrão do sessionStore.
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

module.exports = { redis };
