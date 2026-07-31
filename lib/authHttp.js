// Helpers de cookie de sessão e leitura do usuário autenticado a partir do request.
const { getSession } = require('./authStore');

const COOKIE_NAME = 'qa_sid';

function parseCookies(req) {
  const header = (req.headers && req.headers.cookie) || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function cookieAttrs(maxAgeSec) {
  const attrs = ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=' + maxAgeSec];
  // Secure só em produção (na Vercel é https); em dev local via http o Secure
  // impediria o cookie de ser gravado.
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs;
}

function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader('Set-Cookie', [COOKIE_NAME + '=' + token, ...cookieAttrs(maxAgeSec)].join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [COOKIE_NAME + '=', ...cookieAttrs(0)].join('; '));
}

async function getAuthedEmail(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  const session = await getSession(token);
  return session && session.email ? session.email : null;
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  getAuthedEmail
};
