// POST { email, password } -> valida o par email+senha contra o banco.
// Distingue os dois casos de falha para orientar o usuário:
//   - conta não existe  -> 404 code:'no_account'  ("crie uma conta")
//   - senha não confere  -> 401 code:'invalid'     ("algum dado está inválido")
const { getUser, createSession, normalizeEmail, SESSION_TTL } = require('../../lib/authStore');
const { verifyPassword } = require('../../lib/passwords');
const { setSessionCookie } = require('../../lib/authHttp');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    const user = await getUser(email);
    if (!user) {
      return res.status(404).json({ code: 'no_account', erro: 'Não existe conta com esse email. Crie uma conta para continuar.' });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ code: 'invalid', erro: 'Algum dos dados está inválido. Confira o email e a senha.' });
    }

    const token = await createSession(email);
    setSessionCookie(res, token, SESSION_TTL);
    return res.status(200).json({ email });
  } catch (e) {
    console.error('[auth/login]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao entrar.' });
  }
};
