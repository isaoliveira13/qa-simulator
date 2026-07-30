// POST -> apaga a sessão no banco e limpa o cookie.
const { parseCookies, clearSessionCookie, COOKIE_NAME } = require('../../lib/authHttp');
const { deleteSession } = require('../../lib/authStore');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    await deleteSession(token);
  } catch (e) {
    console.error('[auth/logout]', e && e.stack ? e.stack : e);
  }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
