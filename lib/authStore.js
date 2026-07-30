// Armazenamento de usuários e sessões no mesmo Redis (Upstash) já usado pelo app.
//   Usuário:  qa:user:<email>      -> { email, passwordHash, createdAt }
//   Sessão:   qa:session:<token>   -> { email, createdAt }  (expira em 30 dias)
const { redis } = require('./kv');
const { randomBytes } = require('crypto');

const USER_PREFIX = 'qa:user:';
const SESSION_PREFIX = 'qa:session:';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 dias em segundos

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function getUser(email) {
  return redis.get(USER_PREFIX + normalizeEmail(email));
}

async function createUser(email, passwordHash) {
  const norm = normalizeEmail(email);
  const user = { email: norm, passwordHash, createdAt: new Date().toISOString() };
  await redis.set(USER_PREFIX + norm, user);
  return user;
}

async function createSession(email) {
  const token = randomBytes(32).toString('hex');
  await redis.set(SESSION_PREFIX + token, { email: normalizeEmail(email), createdAt: Date.now() }, { ex: SESSION_TTL });
  return token;
}

async function getSession(token) {
  if (!token) return null;
  return redis.get(SESSION_PREFIX + token);
}

async function deleteSession(token) {
  if (!token) return;
  await redis.del(SESSION_PREFIX + token);
}

module.exports = {
  normalizeEmail,
  getUser,
  createUser,
  createSession,
  getSession,
  deleteSession,
  SESSION_TTL
};
