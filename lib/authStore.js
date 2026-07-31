// Armazenamento de usuários e sessões no mesmo Redis (Upstash) já usado pelo app.
//   Usuário:   qa:user:<email>            -> { email, passwordHash, createdAt }
//   Sessão:    qa:session:<token>         -> { email, createdAt }   (expira em 30 dias)
//   Sessões do usuário: qa:usersessions:<email> -> Set de tokens de sessão ativos
//   Reset:     qa:reset:<hash(token)>     -> { email, createdAt }   (expira em 30 min)
const { redis } = require('./kv');
const { randomBytes, createHash, randomInt } = require('crypto');

const USER_PREFIX = 'qa:user:';
const SESSION_PREFIX = 'qa:session:';
const USER_SESSIONS_PREFIX = 'qa:usersessions:';
const RESET_PREFIX = 'qa:reset:';
const PENDING_PREFIX = 'qa:pendingreg:';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 dias em segundos
const RESET_TTL = 60 * 30;             // 30 minutos em segundos
const PENDING_TTL = 60 * 15;           // 15 minutos em segundos
const MAX_CODE_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

// Código numérico de 6 dígitos para confirmação de email no cadastro.
function generateCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
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

async function updatePassword(email, passwordHash) {
  const norm = normalizeEmail(email);
  const user = await redis.get(USER_PREFIX + norm);
  if (!user) return false;
  user.passwordHash = passwordHash;
  user.pwdChangedAt = new Date().toISOString();
  await redis.set(USER_PREFIX + norm, user);
  return true;
}

async function createSession(email) {
  const norm = normalizeEmail(email);
  const token = randomBytes(32).toString('hex');
  await redis.set(SESSION_PREFIX + token, { email: norm, createdAt: Date.now() }, { ex: SESSION_TTL });
  await redis.sadd(USER_SESSIONS_PREFIX + norm, token);
  return token;
}

async function getSession(token) {
  if (!token) return null;
  return redis.get(SESSION_PREFIX + token);
}

async function deleteSession(token) {
  if (!token) return;
  const session = await redis.get(SESSION_PREFIX + token);
  await redis.del(SESSION_PREFIX + token);
  if (session && session.email) {
    await redis.srem(USER_SESSIONS_PREFIX + normalizeEmail(session.email), token);
  }
}

// Encerra todas as sessões ativas de um usuário (usado ao redefinir a senha —
// quem tiver uma sessão aberta é desconectado).
async function invalidateAllSessions(email) {
  const norm = normalizeEmail(email);
  const tokens = await redis.smembers(USER_SESSIONS_PREFIX + norm);
  if (Array.isArray(tokens)) {
    for (const t of tokens) await redis.del(SESSION_PREFIX + t);
  }
  await redis.del(USER_SESSIONS_PREFIX + norm);
}

// Cria um token de redefinição de uso único; guardamos só o hash no banco e
// devolvemos o token puro para ir no link do email.
async function createResetToken(email) {
  const token = randomBytes(32).toString('hex');
  await redis.set(RESET_PREFIX + hashToken(token), { email: normalizeEmail(email), createdAt: Date.now() }, { ex: RESET_TTL });
  return token;
}

// Valida e consome (single-use) um token de redefinição; devolve o email ou null.
async function consumeResetToken(token) {
  if (!token) return null;
  const key = RESET_PREFIX + hashToken(token);
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key);
  return data.email || null;
}

// ----- Cadastro pendente (verificação de email por código) -----
// Guardamos o cadastro "pré-confirmado" (email + senha já com hash + hash do
// código) até a pessoa digitar o código certo. Só então viramos usuário de fato.
async function createPendingRegistration(email, passwordHash) {
  const norm = normalizeEmail(email);
  const code = generateCode();
  await redis.set(PENDING_PREFIX + norm, {
    email: norm,
    passwordHash,
    codeHash: hashToken(code),
    attempts: 0,
    createdAt: Date.now()
  }, { ex: PENDING_TTL });
  return code; // devolvido só para ser enviado por email
}

async function getPendingRegistration(email) {
  return redis.get(PENDING_PREFIX + normalizeEmail(email));
}

async function registerPendingAttempt(email, pending) {
  pending.attempts = (pending.attempts || 0) + 1;
  await redis.set(PENDING_PREFIX + normalizeEmail(email), pending, { ex: PENDING_TTL });
  return pending.attempts;
}

async function deletePendingRegistration(email) {
  await redis.del(PENDING_PREFIX + normalizeEmail(email));
}

// Verifica o código; se bater, promove o cadastro pendente a usuário real.
// Retorna { ok, email } ou { ok:false, reason }.
async function confirmRegistration(email, code) {
  const norm = normalizeEmail(email);
  const pending = await getPendingRegistration(norm);
  if (!pending) return { ok: false, reason: 'expired' };
  if ((pending.attempts || 0) >= MAX_CODE_ATTEMPTS) {
    await deletePendingRegistration(norm);
    return { ok: false, reason: 'too_many' };
  }
  if (hashToken(code) !== pending.codeHash) {
    await registerPendingAttempt(norm, pending);
    return { ok: false, reason: 'wrong' };
  }
  await createUser(norm, pending.passwordHash);
  await deletePendingRegistration(norm);
  return { ok: true, email: norm };
}

module.exports = {
  normalizeEmail,
  getUser,
  createUser,
  updatePassword,
  createSession,
  getSession,
  deleteSession,
  invalidateAllSessions,
  createResetToken,
  consumeResetToken,
  createPendingRegistration,
  getPendingRegistration,
  confirmRegistration,
  deletePendingRegistration,
  SESSION_TTL
};
