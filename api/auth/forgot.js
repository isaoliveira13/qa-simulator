// POST { email } -> se existir conta com esse email, envia um link de
// redefinição para o próprio email (prova de posse). Resposta SEMPRE genérica,
// para não revelar quais emails têm conta cadastrada.
const { getUser, createResetToken, normalizeEmail } = require('../../lib/authStore');
const { sendEmail } = require('../../lib/email');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });

  const generico = {
    ok: true,
    mensagem: 'Se existe uma conta com esse email, enviamos um link para redefinir a senha. Verifique sua caixa de entrada (e o spam).'
  };

  try {
    const email = normalizeEmail((req.body || {}).email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(200).json(generico);

    const user = await getUser(email);
    if (user) {
      const token = await createResetToken(email);
      const base = (process.env.APP_BASE_URL || ('https://' + (req.headers.host || ''))).replace(/\/$/, '');
      const link = base + '/?reset_token=' + token;
      await sendEmail({
        to: email,
        subject: 'Redefinição de senha — ISA QA',
        text: 'Você pediu para redefinir sua senha no ISA QA.\n\nAbra o link abaixo (válido por 30 minutos):\n' + link + '\n\nSe não foi você, ignore este email — sua senha continua a mesma.',
        html: '<p>Você pediu para redefinir sua senha no <strong>ISA QA</strong>.</p>' +
              '<p><a href="' + link + '">Clique aqui para definir uma nova senha</a> (válido por 30 minutos).</p>' +
              '<p>Se não foi você, ignore este email — sua senha continua a mesma.</p>'
      });
    }

    return res.status(200).json(generico);
  } catch (e) {
    console.error('[auth/forgot]', e && e.stack ? e.stack : e);
    // Mesmo em erro, resposta genérica (não vaza informação nem quebra o fluxo).
    return res.status(200).json(generico);
  }
};
