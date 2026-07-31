// POST { email, code } -> confirma o cadastro pendente. Se o código de 6 dígitos
// bater, a conta é criada de fato e a sessão é iniciada. Limite de tentativas e
// expiração são tratados no authStore (confirmRegistration).
const { confirmRegistration, createSession, normalizeEmail, SESSION_TTL } = require('../../lib/authStore');
const { setSessionCookie } = require('../../lib/authHttp');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ erro: 'Digite o código de 6 dígitos enviado por email.' });
    }

    const result = await confirmRegistration(email, code);
    if (!result.ok) {
      if (result.reason === 'expired') {
        return res.status(400).json({ erro: 'Cadastro não encontrado ou expirado. Faça o cadastro novamente.' });
      }
      if (result.reason === 'too_many') {
        return res.status(429).json({ erro: 'Muitas tentativas. Faça o cadastro novamente para receber um novo código.' });
      }
      return res.status(401).json({ erro: 'Código incorreto. Confira e tente de novo.' });
    }

    const token = await createSession(result.email);
    setSessionCookie(res, token, SESSION_TTL);
    return res.status(200).json({ email: result.email });
  } catch (e) {
    console.error('[auth/verify]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao confirmar o cadastro.' });
  }
};
