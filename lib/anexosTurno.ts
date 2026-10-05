/**
 * Anexos nos turnos do roteiro (05/10/2026): uma imagem ou um PDF que a
 * pessoa simulada manda pro avatar, sozinho ou junto com texto.
 *
 * MODO DEMO — no projeto real o arquivo sobe pra um armazenamento de arquivos
 * e o link dele vai junto com a mensagem pro avatar. Aqui não há armazenamento
 * nem rede: o arquivo NUNCA sai do navegador de quem visita. Só o nome, o
 * tipo e o tamanho são registrados (na "tabela" em memória de lib/db.ts), e o
 * avatar fictício reage a esses dados — o bastante pra mostrar como o recurso
 * funciona, sem guardar arquivo de ninguém.
 *
 * Este arquivo não importa nada de servidor: serve ao assistente (navegador)
 * e ao motor (rota /run) ao mesmo tempo.
 */

import { AnexoTurno, TurnoRoteiro } from "./types";

/** O que o assistente aceita anexar. */
export const TIPOS_ANEXO_ACEITOS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

/** Valor do atributo `accept` do <input type="file">. */
export const ACCEPT_ANEXO = ".png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf";

/** 20 MB por arquivo (mesmo limite do projeto real). */
export const TAMANHO_MAX_ANEXO = 20 * 1024 * 1024;

/** Limite da demo: anexos por turno. */
export const LIMITE_ANEXOS_POR_TURNO_DEMO = 5;

export function tipoAnexoAceito(tipo: string): boolean {
  return (TIPOS_ANEXO_ACEITOS as readonly string[]).includes(String(tipo || "").toLowerCase());
}

export function ehImagem(a: Pick<AnexoTurno, "tipo">): boolean {
  return String(a.tipo || "").startsWith("image/");
}

export function ehPdf(a: Pick<AnexoTurno, "tipo">): boolean {
  return String(a.tipo || "").toLowerCase() === "application/pdf";
}

/** "1,2 MB", "340 KB". */
export function tamanhoLegivel(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Anexos de uma linha do roteiro, sempre um array (nunca undefined). */
export function anexosDaLinha(t: Pick<TurnoRoteiro, "anexos"> | null | undefined): AnexoTurno[] {
  return t && Array.isArray(t.anexos) ? t.anexos.filter((a) => a && a.id) : [];
}

/**
 * Quais arquivos vão no turno `turno`, olhando a linha que vale ali — a exata
 * ou a "deste turno em diante" já começada. Diferente de entradaDoTurno
 * (lib/roteiroTurnos.ts), aqui a linha "livre" CONTA: um turno livre com PDF
 * é a pessoa improvisando a fala e o arquivo indo junto.
 */
export function anexosDoTurno(
  roteiro: TurnoRoteiro[] | null | undefined,
  turno: number
): AnexoTurno[] {
  if (!roteiro || roteiro.length === 0) return [];
  const exata = roteiro.find((t) => t.turno === turno);
  if (exata) return anexosDaLinha(exata);
  const emDiante = roteiro
    .filter((t) => t.emDiante && t.turno <= turno)
    .sort((a, b) => b.turno - a.turno)[0];
  return anexosDaLinha(emDiante);
}

/** Todos os ids de anexo citados no roteiro (sem repetição). */
export function idsDeAnexosDoRoteiro(roteiro: TurnoRoteiro[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const t of roteiro || []) for (const a of anexosDaLinha(t)) ids.add(a.id);
  return Array.from(ids);
}

/** "o PDF “boleto.pdf”", "a imagem “foto.png”", "2 arquivos (a.pdf, b.png)". */
export function descreverAnexos(anexos: AnexoTurno[]): string {
  if (!anexos.length) return "";
  if (anexos.length === 1) {
    const a = anexos[0];
    return `${ehPdf(a) ? "o PDF" : ehImagem(a) ? "a imagem" : "o arquivo"} “${a.nome}”`;
  }
  return `${anexos.length} arquivos (${anexos.map((a) => a.nome).join(", ")})`;
}

/** Como o anexo aparece numa transcrição em texto puro (PDF). */
export function rotuloAnexosTexto(anexos: AnexoTurno[] | null | undefined): string {
  if (!anexos || !anexos.length) return "";
  return anexos.map((a) => `[anexo: ${a.nome}]`).join(" ");
}
