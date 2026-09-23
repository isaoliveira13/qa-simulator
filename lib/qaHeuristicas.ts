/**
 * Heuristicas de seguranca por cima da decisao da IA — porte de
 * lib/heuristics.js do coisasdaisa (nodes "Enviar ao Avatar" e "Mesclar
 * Estado" do n8n original).
 *
 * Existem porque a IA que faz o papel da pessoa e otimista demais em dois
 * sentidos: ela nao percebe sozinha quando o avatar entrou em loop, e ela as
 * vezes declara "sucesso" sem que o criterio tenha aparecido de verdade na
 * conversa. Estas funcoes sao o contrapeso, e valem MAIS que a decisao da IA.
 */

export interface EstadoLoop {
  iteration: number;
  maxTurnos: number;
  repeatExact?: number;
  consecSimilar?: number;
  lastProgressIter?: number;
}

export function normalizeText(x: unknown): string {
  return String(x || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(x: unknown, minLen = 3): Set<string> {
  return new Set(
    normalizeText(x)
      .split(" ")
      .filter((w) => w.length > minLen)
  );
}

/** Jaccard entre dois textos, considerando so palavras com mais de 3 letras. */
export function jaccardSimilarity(a: unknown, b: unknown): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let intersecao = 0;
  for (const w of A) if (B.has(w)) intersecao++;
  return intersecao / (A.size + B.size - intersecao);
}

/**
 * Atualiza os contadores de repeticao depois de cada resposta do avatar.
 * `avatarHist` guarda so as ultimas 8 falas: e memoria de curto prazo pra
 * detectar loop, nao a transcricao (essa e o turnsLog).
 */
export function updateLoopCounters(
  session: { avatarHist?: string[]; consecSimilar?: number },
  avatarMessage: string
): { consecSimilar: number; avatarHist: string[]; repeatExact: number } {
  const prevAvatar =
    session.avatarHist && session.avatarHist.length ? session.avatarHist[session.avatarHist.length - 1] : "";

  const consecSimilar =
    avatarMessage && jaccardSimilarity(avatarMessage, prevAvatar) >= 0.6 ? (session.consecSimilar || 0) + 1 : 0;

  const avatarHist = [...(session.avatarHist || []), avatarMessage].slice(-8);
  const repeatExact = avatarHist.filter((m) => normalizeText(m) === normalizeText(avatarMessage)).length;

  return { consecSimilar, avatarHist, repeatExact };
}

/**
 * O criterio de sucesso tem eco no que o avatar falou de verdade? Barra o
 * "sucesso" alucinado: basta uma palavra com mais de 4 letras do criterio
 * aparecer no texto recente. Criterio sem palavra longa nenhuma passa (nao da
 * pra checar, e negar seria pior).
 */
export function hasSuccessEvidence(criterioSucesso: string, textosRecentes: string[]): boolean {
  const palavrasCriterio = normalizeText(criterioSucesso)
    .split(" ")
    .filter((w) => w.length > 4);
  const textoRecente = normalizeText(textosRecentes.join(" "));
  if (palavrasCriterio.length === 0) return true;
  return palavrasCriterio.some((w) => textoRecente.includes(w));
}

/**
 * A conversa deve ser cortada mesmo com a IA dizendo "continuar"? Quatro
 * motivos, na ordem em que sao checados.
 */
export function checarLimitesDeLoop(session: EstadoLoop): { forcarErro: boolean; motivo: string | null } {
  if ((session.repeatExact || 0) >= 3) {
    return { forcarErro: true, motivo: `Loop: avatar repetiu ${session.repeatExact}x.` };
  }
  if ((session.consecSimilar || 0) >= 3) {
    return { forcarErro: true, motivo: `Loop: avatar preso por ${(session.consecSimilar || 0) + 1} turnos.` };
  }
  if (session.iteration - (session.lastProgressIter || 0) >= 6) {
    return { forcarErro: true, motivo: "Sem progresso por 6 turnos." };
  }
  if (session.iteration >= session.maxTurnos) {
    return { forcarErro: true, motivo: `Limite de ${session.maxTurnos} turnos atingido.` };
  }
  return { forcarErro: false, motivo: null };
}
