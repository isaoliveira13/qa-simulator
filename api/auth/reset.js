// POST { token, password } -> valida o token de redefinição (uso único, 30 min),
// troca a senha e encerra todas as sessões ativas do usuário. Sem token válido,
// nada acontece — é o que impede redefinir a senha de outra pessoa sem acesso
// ao email dela.
const { consumeResetToken, updatePassword, invalidateAllSessions } = require('../../lib/authStore');
const { hashPassword } = require('../../lib/passwords');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    const body = req.body || {};
    const token = String(body.token || '');
    const password = String(body.password || '');

    if (!token) return res.status(400).json({ erro: 'Link inválido.' });
    if (password.length < 8) return res.status(400).json({ erro: 'A senha precisa ter ao menos 8 caracteres.' });

    const email = await consumeResetToken(token);
    if (!email) return res.status(400).json({ erro: 'Link inválido ou expirado. Peça um novo.' });

    const hash = await hashPassword(password);
    await updatePassword(email, hash);
    await invalidateAllSessions(email);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[auth/reset]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao redefinir a senha.' });
  }
};
