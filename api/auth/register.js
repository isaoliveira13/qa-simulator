// POST { email, password } -> NÃO cria a conta ainda. Valida, guarda um cadastro
// pendente e envia um código de 6 dígitos para o email (prova de posse). A conta
// só é criada em /api/auth/verify, depois que a pessoa digita o código certo.
// ALLOWED_EMAIL_DOMAIN restringe quem pode se cadastrar (ex.: zenta.to).
const { getUser, createPendingRegistration, deletePendingRegistration, normalizeEmail } = require('../../lib/authStore');
const { hashPassword } = require('../../lib/passwords');
const { sendEmail } = require('../../lib/email');

// Domínio permitido para cadastro. Padrão zenta.to: mesmo sem a env var definida,
// só emails @zenta.to conseguem criar conta. Para liberar geral, defina
// ALLOWED_EMAIL_DOMAIN='*' (não recomendado em produção).
const RAW_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'zenta.to').trim().toLowerCase();
const ALLOWED_DOMAIN = RAW_DOMAIN === '*' ? '' : RAW_DOMAIN;

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
    const code = await createPendingRegistration(email, passwordHash);

    const emailResult = await sendEmail({
      to: email,
      subject: 'Seu código de confirmação — ISA QA',
      text: 'Seu código de confirmação é: ' + code + '\n\nDigite-o na tela de cadastro para concluir. O código expira em 15 minutos.\n\nSe não foi você, ignore este email.',
      html: '<p>Seu código de confirmação no <strong>ISA QA</strong> é:</p>' +
            '<p style="font-size:26px;font-weight:700;letter-spacing:4px">' + code + '</p>' +
            '<p>Digite-o na tela de cadastro para concluir. O código expira em 15 minutos.</p>' +
            '<p>Se não foi você, ignore este email.</p>'
    });

    // Se o email não saiu, não deixa um cadastro pendente órfão (a pessoa nunca
    // receberia o código). Limpa o pending e devolve erro claro em vez de fingir
    // que deu certo com 200.
    if (!emailResult || !emailResult.sent) {
      await deletePendingRegistration(email);
      console.error('[auth/register] email de confirmação não enviado:', emailResult && emailResult.reason);
      return res.status(502).json({ erro: 'Não foi possível enviar o email de confirmação agora. Tente novamente em instantes.' });
    }

    // 200 com pending:true — não revela se o email já tinha cadastro pendente.
    return res.status(200).json({ pending: true, email });
  } catch (e) {
    console.error('[auth/register]', e && e.stack ? e.stack : e);
    return res.status(500).json({ erro: 'Erro ao iniciar o cadastro.' });
  }
};
