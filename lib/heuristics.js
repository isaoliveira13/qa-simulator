// Heurísticas de segurança usadas por cima da decisão da IA — equivalentes ao
// que os nodes "Enviar ao Avatar" e "Mesclar Estado" faziam no n8n.

function normalizeText(x) {
  return String(x || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(x, minLen = 3) {
  return new Set(normalizeText(x).split(' ').filter(w => w.length > minLen));
}

// Similaridade Jaccard entre duas strings, considerando só palavras > 3 letras.
function jaccardSimilarity(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let intersecao = 0;
  for (const w of A) if (B.has(w)) intersecao++;
  return intersecao / (A.size + B.size - intersecao);
}

// Atualiza os contadores de loop/repetição depois de receber uma nova resposta do avatar.
// Espelha a lógica dentro do node "Enviar ao Avatar".
function updateLoopCounters(session, avatarMessage) {
  const prevAvatar = (session.avatarHist && session.avatarHist.length)
    ? session.avatarHist[session.avatarHist.length - 1]
    : '';

  const consecSimilar = (avatarMessage && jaccardSimilarity(avatarMessage, prevAvatar) >= 0.6)
    ? ((session.consecSimilar || 0) + 1)
    : 0;

  const avatarHist = [...(session.avatarHist || []), avatarMessage].slice(-8);
  const repeatExact = avatarHist.filter(m => normalizeText(m) === normalizeText(avatarMessage)).length;

  return { consecSimilar, avatarHist, repeatExact };
}

// Confere se o critério de sucesso tem evidência real no texto recente do avatar,
// antes de aceitar a decisão "sucesso" vinda da IA. Espelha o trecho equivalente
// dentro do node "Mesclar Estado".
function hasSuccessEvidence(criterioSucesso, textosRecentes) {
  const palavrasCriterio = normalizeText(criterioSucesso).split(' ').filter(w => w.length > 4);
  const textoRecente = normalizeText(textosRecentes.join(' '));
  if (palavrasCriterio.length === 0) return true;
  return palavrasCriterio.some(w => textoRecente.includes(w));
}

// Decide se a conversa deve ser forçada para "erro" por causa de loop/travamento/limite,
// mesmo que a IA tenha dito "continuar". Espelha os `if` sequenciais no node "Mesclar Estado".
// Retorna { forcarErro: boolean, motivo: string|null }
function checarLimitesDeLoop(session) {
  if ((session.repeatExact || 0) >= 3) {
    return { forcarErro: true, motivo: `Loop: avatar repetiu ${session.repeatExact}x.` };
  }
  if ((session.consecSimilar || 0) >= 3) {
    return { forcarErro: true, motivo: `Loop: avatar preso por ${session.consecSimilar + 1} turnos.` };
  }
  if ((session.iteration - (session.lastProgressIter || 0)) >= 6) {
    return { forcarErro: true, motivo: 'Sem progresso por 6 turnos.' };
  }
  if (session.iteration >= session.maxTurnos) {
    return { forcarErro: true, motivo: `Limite de ${session.maxTurnos} turnos atingido.` };
  }
  return { forcarErro: false, motivo: null };
}

module.exports = {
  normalizeText,
  tokenSet,
  jaccardSimilarity,
  updateLoopCounters,
  hasSuccessEvidence,
  checarLimitesDeLoop
};
