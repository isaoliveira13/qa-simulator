// POST { email, password } -> cria a conta, já autentica (cookie de sessão) e
// devolve { email }. Opcional: ALLOWED_EMAIL_DOMAIN restringe quem pode cadastrar.
const { getUser, createUser, createSession, normalizeEmail, SESSION_TTL } = require('../../lib/authStore');
const { hashPassword } = require('../../lib/passwords');
const { setSessionCookie } = require('../../lib/authHttp');

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ erro: 'Email inválido.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ erro: 'A senha precisa ter ao menos 8 caracteres.' });
    }
    if (ALLOWED_DOMAIN && !email.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({ erro: 'Somente emails @' + ALLOWED_DOMAIN + ' podem se cadastrar.' });
    }

    const existing = await getUser(email);
    if (existing) return res.status(409).json({ erro: 'Já existe uma conta com esse email. Faça login.' });

    const passwordHash = await hashPassword(password);
    await createUser(email, passwordHash);

    const token = await createSession(email);
    setSessionCookie(res, token, SESSION_TTL);
    return res.status(200).json({ email });
  } catch (e) {
    console.error('[auth/register]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao criar conta.' });
  }
};
