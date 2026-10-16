/**
 * Nome dos arquivos de relatório PDF (simulações e Checklist):
 * "Relatório QAː Spam - Documento ǀ 05-10-2026 15h10.pdf" (pedido da Isa,
 * 05/10/2026; Checklist entrou em 13/10/2026).
 *
 * ":" e "|" são proibidos em nome de arquivo (Mac/Windows; o Chrome troca
 * por "_"). No NOME DO ARQUIVO entram os sósias Unicode "ː" (U+02D0) e
 * "ǀ" (U+01C0), que aparecem iguais no Finder/Explorer. No título interno
 * do PDF (o que o leitor de PDF mostra na aba) vão os caracteres de verdade.
 */

/**
 * Texto pronto pra virar nome de arquivo, mantendo acento e maiúscula — o
 * nome do arquivo é pra ser lido por gente. Os caracteres que Mac/Windows não
 * aceitam (/ \ : * ? " < > |) viram sósias ou saem (ver abaixo).
 */
export function nomeParaArquivo(texto: string): string {
  // Os proibidos viram sósias Unicode que o Mac/Windows aceitam, pra o nome
  // continuar dizendo a mesma coisa: "HML -> MAIN" sai "HML → MAIN" (antes
  // o ">" sumia e ficava "HML - MAIN"). O resto (* ? " \) sai.
  return texto
    .replace(/-+>/g, "\u2192") // -> vira →
    .replace(/<-+/g, "\u2190") // <- vira ←
    .replace(/>/g, "\u203A") // > vira ›
    .replace(/</g, "\u2039") // < vira ‹
    .replace(/:/g, "\u02D0") // : vira ː (presente nas fontes padrão do Mac e do Windows)
    .replace(/\|/g, "\u01C0") // | vira ǀ (idem)
    .replace(/\//g, "\u2215") // / vira ∕
    .replace(/[\\*?"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Data e hora de Brasília (GMT-3), sem ":" (proibido em nome de arquivo):
 * "05-10-2026 15h10". Fixo no fuso de São Paulo, não em UTC.
 */
export function dataHoraParaArquivo(data: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(data);
  const v = (tipo: string) => partes.find((x) => x.type === tipo)?.value || "";
  return `${v("day")}-${v("month")}-${v("year")} ${v("hour")}h${v("minute")}`;
}

/**
 * Põe o título interno no PDF e devolve o nome do arquivo pra `doc.save`.
 * `assunto` é o nome da simulação/suíte/script (já pode vir cru).
 */
export function nomearRelatorio(doc: any, assunto: string, data: Date): string {
  const titulo = nomeParaArquivo(assunto) || "Relatório";
  const quando = dataHoraParaArquivo(data);
  // Título interno do PDF: o nome como foi escrito, sem troca nenhuma.
  doc.setProperties({ title: `Relatório QA: ${assunto.trim() || "Relatório"} | ${quando}` });
  return `Relatório QAː ${titulo} ǀ ${quando}.pdf`;
}
