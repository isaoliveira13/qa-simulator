import { MomentoItem } from "./types";

/**
 * Regra do check dos Momentos (13/10/2026): um item so conta como rodado se
 * foi marcado HOJE, no horario de Brasilia. Assim cada dia comeca limpo sem
 * precisar de nenhuma rotina apagando nada no banco — o horario da marcacao
 * continua guardado, so deixa de valer.
 */
const FUSO = "America/Sao_Paulo";

/** "2026-10-13" no fuso de Brasilia. */
export function diaEmSP(data: Date): string {
  return data.toLocaleDateString("en-CA", { timeZone: FUSO });
}

export function feitoHoje(item: Pick<MomentoItem, "feitoEm">, agora: Date = new Date()): boolean {
  if (!item.feitoEm) return false;
  const quando = new Date(item.feitoEm);
  if (Number.isNaN(quando.getTime())) return false;
  return diaEmSP(quando) === diaEmSP(agora);
}

/** "10:42" no fuso de Brasilia. */
export function horaEmSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function chaveDoItem(item: Pick<MomentoItem, "tipo" | "refId">): string {
  return `${item.tipo}:${item.refId}`;
}
