// Monta o relatório final — equivalente ao node "Finalizar" no n8n.

const { getConversationInformation } = require('./zentaClient');

async function buildFinalReport(session) {
  const tempoSeg = Math.round((Date.now() - (session.startMs || Date.now())) / 10) / 100;
  const sucesso = session.status === 'sucesso';
  const manual = session.encerradoManualmente === true;

  const infoZenta = await getConversationInformation({
    baseUrl: session.baseUrl,
    hostToken: session.hostToken,
    conversationId: session.conversationId
  });

  const resultado = manual ? 'ENCERRADO' : (sucesso ? 'SUCESSO' : 'FALHA');
  const motivo_encerramento = manual
    ? 'Teste encerrado manualmente pelo usuário.'
    : (sucesso ? 'Critério atingido' : (session.motivo || 'Não concluído'));

  return {
    resultado,
    motivo_encerramento,
    conversation_id: session.conversationId,
    cenario: session.cenario,
    criterio_sucesso: session.criterioSucesso,
    total_turnos: session.iteration,
    max_turnos: session.maxTurnos,
    tempo_segundos: tempoSeg,
    inicio: session.startISO,
    fim: new Date().toISOString(),
    transcricao: session.turnsLog,
    sentimento_zenta: infoZenta ? {
      resumo: infoZenta.dialogue_summary || null,
      sentimento_score: infoZenta.sentiment_score ?? null,
      heat_score: infoZenta.heat_score ?? null
    } : null
  };
}

module.exports = { buildFinalReport };
