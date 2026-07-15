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

  // Se não havia critério de sucesso definido, atingir o limite de turnos é o
  // desfecho ESPERADO (o teste roda até o fim de propósito) — não é uma falha.
  const temCriterio = !!(session.criterioSucesso && session.criterioSucesso.trim());
  const limiteDeTurnosAtingido = !sucesso && /Limite de \d+ turnos atingido/.test(session.motivo || '');
  const semCriterioELimite = !manual && !temCriterio && limiteDeTurnosAtingido;

  const resultado = manual ? 'ENCERRADO' : (sucesso ? 'SUCESSO' : (semCriterioELimite ? 'ENCERRADO' : 'FALHA'));
  const motivo_encerramento = manual
    ? 'Teste encerrado manualmente pelo usuário.'
    : (sucesso
        ? 'Critério atingido'
        : (semCriterioELimite
            ? 'Conversa concluída ao atingir o limite de turnos (nenhum critério de sucesso foi definido para este teste).'
            : (session.motivo || 'Não concluído')));

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
