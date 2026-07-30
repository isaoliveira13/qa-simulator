// GET -> { email } se houver sessão válida; 401 caso contrário.
// Usado pelo frontend no carregamento para decidir se mostra o app ou o login.
const { getAuthedEmail } = require('../../lib/authHttp');

module.exports = async function handler(req, res) {
  try {
    const email = await getAuthedEmail(req);
    if (!email) return res.status(401).json({ erro: 'Não autenticado.' });
    return res.status(200).json({ email });
  } catch (e) {
    console.error('[auth/me]', e && e.stack ? e.stack : e);
    return res.status(401).json({ erro: 'Não autenticado.' });
  }
};
