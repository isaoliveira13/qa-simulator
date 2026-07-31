// Envio de email transacional.
//
// Prioridade 1 — SMTP (ex.: Gmail). Recomendado para este projeto, pois não
// depende de verificar domínio. Configure por variáveis de ambiente:
//   SMTP_HOST  -> ex.: smtp.gmail.com
//   SMTP_PORT  -> 465 (SSL, padrão) ou 587 (STARTTLS)
//   SMTP_USER  -> a conta que autentica (ex.: seuemail@gmail.com)
//   SMTP_PASS  -> senha de app do Gmail (NÃO a senha normal da conta)
//   EMAIL_FROM -> remetente; no Gmail precisa ser o MESMO endereço de SMTP_USER
//                 (ou um alias verificado em "Enviar email como"),
//                 ex.: "ISA QA <seuemail@gmail.com>"
//
// Prioridade 2 — Resend (fallback). Só é usado se não houver SMTP configurado e
// existir RESEND_API_KEY. Mantido para não quebrar ambientes antigos.
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { /* dependência ausente */ }

let cachedTransport = null;
function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  if (!nodemailer) {
    console.error('[email] SMTP configurado mas o pacote nodemailer não está instalado.');
    return null;
  }
  if (cachedTransport) return cachedTransport;
  const port = Number(process.env.SMTP_PORT || 465);
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL direto; 587 = STARTTLS
    auth: { user, pass }
  });
  return cachedTransport;
}

async function sendViaSmtp({ to, subject, html, text }) {
  const transport = getSmtpTransport();
  if (!transport) return null; // SMTP não configurado -> deixa tentar o fallback
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  try {
    await transport.sendMail({ from, to, subject, html, text });
    return { sent: true };
  } catch (e) {
    console.error('[email] falha no envio SMTP:', e && e.stack ? e.stack : e);
    return { sent: false, reason: 'smtp_failed' };
  }
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const from = process.env.EMAIL_FROM || 'ISA QA <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html, text })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[email] falha ao enviar (Resend):', r.status, body);
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true };
  } catch (e) {
    console.error('[email] erro ao enviar (Resend):', e && e.stack ? e.stack : e);
    return { sent: false, reason: 'exception' };
  }
}

async function sendEmail({ to, subject, html, text }) {
  // 1) SMTP (Gmail) se configurado
  const smtp = await sendViaSmtp({ to, subject, html, text });
  if (smtp) return smtp;

  // 2) Resend como fallback, se houver chave
  const resend = await sendViaResend({ to, subject, html, text });
  if (resend) return resend;

  // 3) Nada configurado
  console.warn('[email] nenhum provedor configurado (SMTP_* ou RESEND_API_KEY) — email não enviado para', to);
  return { sent: false, reason: 'no_provider' };
}

module.exports = { sendEmail };
