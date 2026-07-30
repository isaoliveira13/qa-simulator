// Envio de email transacional via Resend (API HTTP, sem dependência npm).
// Configuração por variáveis de ambiente:
//   RESEND_API_KEY  -> chave da conta Resend (obrigatória para enviar)
//   EMAIL_FROM      -> remetente, ex.: "ISA QA <no-reply@seu-dominio.com>"
//                      (enquanto o domínio não estiver verificado, o Resend
//                       permite usar "onboarding@resend.dev" para testes)
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'ISA QA <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY não configurada — email não enviado para', to);
    return { sent: false, reason: 'no_api_key' };
  }

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
      console.error('[email] falha ao enviar:', r.status, body);
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true };
  } catch (e) {
    console.error('[email] erro ao enviar:', e && e.stack ? e.stack : e);
    return { sent: false, reason: 'exception' };
  }
}

module.exports = { sendEmail };
