import type { AvatarTest, AvatarTestRun, AvatarTurn } from "./types";
import { resumirEmbaralhamento } from "./embaralhar";

/**
 * Gerador do relatorio PDF de simulacoes (04/09/2026). Um lugar so pras duas
 * telas que emitem relatorio dizerem a mesma coisa:
 *
 * - o painel de resultado do card em app/testes-avatar (as conversas que
 *   ACABARAM de rodar, escolhidas nas caixinhas);
 * - a tela app/testes-avatar/relatorio (o historico inteiro, filtrado e/ou
 *   com execucoes marcadas a mao).
 *
 * O formato mudou de "uma tabela larga com tudo" (paisagem) pra um documento
 * em retrato dividido em tres partes por simulacao:
 *   1. a FICHA — o que estava configurado na hora de rodar (cenario, criterio
 *      de sucesso, se os dados iam embaralhados). Sem isso o relatorio
 *      mostrava o desfecho sem dizer o que estava sendo cobrado.
 *   2. a TABELA das conversas (uma linha por pessoa: resultado, turnos, tempo).
 *   3. a TROCA DE MENSAGENS, em baloes — o que a pessoa simulada mandou e o
 *      que o avatar respondeu, turno a turno. Em tabela isso ficava ilegivel.
 *
 * jsPDF/jspdf-autotable, os mesmos ja usados no relatorio de checklist. A
 * fonte padrao do PDF (helvetica) desenha acento sem problema mas NAO desenha
 * setas tipo "➜"/"⇐" — por isso os baloes usam rotulo escrito ("Pessoa
 * simulada" / "Avatar") em vez dos simbolos que aparecem na tela.
 */

// --- medidas e cores do documento ---

const MARGEM = 40;
const LARGURA_PAG = 595.28; // A4 retrato, em pontos
const ALTURA_PAG = 841.89;
const LARGURA_UTIL = LARGURA_PAG - MARGEM * 2;
const RODAPE = 34;

const COR_TEXTO: RGB = [20, 21, 26];
const COR_MUTED: RGB = [107, 114, 128];
const COR_ACCENT: RGB = [79, 70, 229];
const COR_SUCESSO: RGB = [22, 163, 74];
const COR_FALHA: RGB = [185, 28, 28];

const BALAO_PESSOA = {
  fundo: [238, 240, 255] as RGB,
  borda: [199, 202, 245] as RGB,
  texto: [49, 46, 129] as RGB,
  rotulo: "Pessoa simulada",
};
const BALAO_AVATAR = {
  fundo: [240, 253, 244] as RGB,
  borda: [187, 233, 201] as RGB,
  texto: [6, 78, 59] as RGB,
  rotulo: "Avatar",
};

type RGB = [number, number, number];

function corDoResultado(resultado?: string): RGB {
  if (resultado === "SUCESSO") return COR_SUCESSO;
  if (resultado === "FALHA") return COR_FALHA;
  return COR_MUTED;
}

/**
 * A fonte padrao do PDF (helvetica, codificacao WinAnsi) so desenha Latin-1 +
 * um punhado de simbolos. Setas como "⇄" (que aparecem no de-para do
 * embaralhamento) saiam como lixo tipo "!Â" no arquivo. Aqui as mais comuns
 * viram equivalente em ASCII e o resto do que a fonte nao conhece e removido,
 * pra nunca sujar o documento.
 */
const SUBSTITUICOES: [RegExp, string][] = [
  [/[\u21c4\u21c6\u2194\u21d4]/g, "<->"],
  [/[\u21d0\u2190\u27f5]/g, "<-"],
  [/[\u279c\u2192\u21d2\u27f6\u2794]/g, "->"],
  [/[\u2713\u2714]/g, "OK"],
  [/\u00a0/g, " "],
];

/** Latin-1 + os extras do WinAnsi (aspas curvas, travessao, bullet, reticencias). */
const PERMITIDOS = /[^\t\n\x20-\xff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/g;

function limpar(texto: string | undefined | null): string {
  let t = String(texto ?? "").replace(/\r\n/g, "\n");
  for (const [re, sub] of SUBSTITUICOES) t = t.replace(re, sub);
  return t.replace(PERMITIDOS, "");
}

function formatarDataHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Lista sem repetir, ignorando vazios — pra "rodou em hml, prod". */
function unicos(valores: (string | undefined | null)[]): string[] {
  const vistos: string[] = [];
  for (const v of valores) {
    const t = (v || "").trim();
    if (t && !vistos.includes(t)) vistos.push(t);
  }
  return vistos;
}

/**
 * Uma simulacao com as conversas dela. As execucoes cuja simulacao foi
 * apagada caem num grupo sem `test` — o relatorio ainda sai, so sem a ficha.
 */
type Grupo = { test?: AvatarTest; nome: string; runs: AvatarTestRun[] };

function agrupar(runs: AvatarTestRun[], testsById: Map<string, AvatarTest>): Grupo[] {
  const grupos: Grupo[] = [];
  const porChave = new Map<string, Grupo>();
  for (const run of runs) {
    const chave = run.avatarTestId || "__sem-simulacao__";
    let grupo = porChave.get(chave);
    if (!grupo) {
      const test = run.avatarTestId ? testsById.get(run.avatarTestId) : undefined;
      grupo = { test, nome: test?.name || "(simulação apagada)", runs: [] };
      porChave.set(chave, grupo);
      grupos.push(grupo);
    }
    grupo.runs.push(run);
  }
  // Dentro de cada simulacao, na ordem em que as conversas comecaram.
  for (const g of grupos) {
    g.runs.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  }
  return grupos;
}

// --- desenho ---

/** Devolve o y do topo do conteudo depois de virar de pagina, se precisar. */
function garantirEspaco(doc: any, y: number, precisa: number): number {
  if (y + precisa <= ALTURA_PAG - RODAPE) return y;
  doc.addPage();
  return MARGEM;
}

/**
 * Um balao de fala. Quebra sozinho entre paginas quando a mensagem e maior
 * que a pagina inteira (resposta longa do avatar acontece).
 */
function desenharBalao(
  doc: any,
  y: number,
  texto: string,
  lado: "esquerda" | "direita",
  estilo: typeof BALAO_PESSOA
): number {
  const largura = LARGURA_UTIL * 0.82;
  const x = lado === "esquerda" ? MARGEM : MARGEM + LARGURA_UTIL - largura;
  const padX = 10;
  const padY = 8;
  const alturaLinha = 12.5;
  const alturaRotulo = 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const linhas: string[] = doc.splitTextToSize(limpar(texto) || "(mensagem vazia)", largura - padX * 2);

  // Quantas linhas de texto valem a pena deixar num pedaco antes de virar a
  // pagina — abaixo disso o balao cortado fica feio e e melhor comecar na
  // pagina seguinte inteiro.
  const MIN_LINHAS_NO_PEDACO = 4;

  let restantes = linhas;
  let primeiroPedaco = true;
  let yAtual = y;

  while (restantes.length > 0) {
    const sobra = ALTURA_PAG - RODAPE - yAtual;
    const cabemAqui = Math.floor((sobra - padY * 2 - alturaRotulo) / alturaLinha);

    // Nao cabe inteiro nem vale cortar: vira a pagina e recomeca.
    if (cabemAqui < restantes.length && cabemAqui < MIN_LINHAS_NO_PEDACO) {
      doc.addPage();
      yAtual = MARGEM;
      continue;
    }

    const cabem = Math.min(restantes.length, Math.max(1, cabemAqui));
    const pedaco = restantes.slice(0, cabem);
    restantes = restantes.slice(cabem);

    const altura = padY * 2 + alturaRotulo + pedaco.length * alturaLinha;

    doc.setFillColor(...estilo.fundo);
    doc.setDrawColor(...estilo.borda);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, yAtual, largura, altura, 6, 6, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COR_MUTED);
    doc.text(
      primeiroPedaco ? estilo.rotulo.toUpperCase() : `${estilo.rotulo.toUpperCase()} (CONTINUAÇÃO)`,
      x + padX,
      yAtual + padY + 5
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...estilo.texto);
    doc.text(pedaco, x + padX, yAtual + padY + alturaRotulo + 8);

    yAtual += altura + 6;
    primeiroPedaco = false;
  }

  doc.setTextColor(...COR_TEXTO);
  return yAtual;
}

/** "Turno 2" centralizado, separando um par de balões do próximo. */
function desenharSeparadorTurno(doc: any, y: number, turno: number): number {
  const yAtual = garantirEspaco(doc, y, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COR_MUTED);
  doc.text(`TURNO ${turno}`, LARGURA_PAG / 2, yAtual + 8, { align: "center" });
  doc.setTextColor(...COR_TEXTO);
  return yAtual + 14;
}

function desenharTitulo(doc: any, y: number, texto: string, tamanho: number, cor: RGB): number {
  const yAtual = garantirEspaco(doc, y, tamanho + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tamanho);
  doc.setTextColor(...cor);
  doc.text(limpar(texto), MARGEM, yAtual + tamanho * 0.8);
  doc.setTextColor(...COR_TEXTO);
  return yAtual + tamanho + 6;
}

// --- ficha da simulacao ---

/**
 * As linhas da ficha. Nesta primeira versao: cenario, criterio de sucesso e
 * embaralhamento — foi o que a Isa pediu ("as informacoes importantes das
 * configuracoes do teste"). Roteiro e destino entram de brinde porque mudam a
 * leitura do resultado e ja estao ali do lado.
 */
function linhasDaFicha(grupo: Grupo): string[][] {
  const test = grupo.test;
  const linhas: string[][] = [];

  linhas.push(["Cenário", test?.cenario?.trim() || "(não informado)"]);
  linhas.push([
    "Critério de sucesso",
    test?.criterioSucesso?.trim() ||
      "Sem critério definido — o desfecho é julgado pelo andamento da conversa",
  ]);
  linhas.push([
    "Dados da pessoa",
    resumirEmbaralhamento(test?.embaralharDados, test?.embaralharConfig, (test?.pessoas || []).length),
  ]);

  if (test?.mensagensPorTurno) {
    const total = (test.roteiroTurnos || []).length;
    linhas.push([
      "Roteiro de turnos",
      `Ligado — ${total} turno${total === 1 ? "" : "s"} roteirizado${total === 1 ? "" : "s"}${
        test.rodarRoteiroCompleto
          ? " · roda o roteiro inteiro mesmo atingindo o critério antes"
          : ""
      }`,
    ]);
  } else {
    linhas.push(["Roteiro de turnos", "Desligado — a pessoa simulada improvisa a partir do cenário"]);
  }

  const avatares = unicos(grupo.runs.map((r) => r.avatarExecucao || test?.avatar));
  const ambientes = unicos(grupo.runs.map((r) => r.ambienteExecucao || test?.ambiente));
  if (avatares.length || ambientes.length) {
    linhas.push([
      "Onde rodou",
      `${avatares.join(", ") || "—"} · ${ambientes.join(", ") || "—"}`,
    ]);
  }

  const limite = test?.maxTurnos;
  if (limite) linhas.push(["Limite de turnos", String(limite)]);

  return linhas.map(([rotulo, valor]) => [rotulo, limpar(valor)]);
}

// --- entrada publica ---

export type OpcoesRelatorio = {
  /** As execucoes que vao pro documento, ja escolhidas por quem clicou. */
  runs: AvatarTestRun[];
  /** Cadastro das simulacoes, pra montar a ficha de cada grupo. */
  testsById: Map<string, AvatarTest>;
  /** Ex.: "Relatório da execução" quando sai do card. */
  titulo?: string;
  /** Linha extra abaixo do resumo (ex.: "Execução de 04/09/2026 21:10"). */
  subtitulo?: string;
};

/**
 * Monta e baixa o PDF. Devolve o nome do arquivo gerado (util pra mensagem na
 * tela). Lanca se o jsPDF nao carregar — quem chama mostra o erro.
 */
export async function gerarRelatorioSimulacaoPdf(opts: OpcoesRelatorio): Promise<string> {
  const { runs, testsById } = opts;
  if (runs.length === 0) throw new Error("Nenhuma conversa selecionada pro relatório.");

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const agora = new Date();
  const grupos = agrupar(runs, testsById);

  const sucesso = runs.filter((r) => r.resultado === "SUCESSO").length;
  const falha = runs.filter((r) => r.resultado === "FALHA").length;
  const outros = runs.length - sucesso - falha;

  // --- capa curta (nao gasta uma pagina inteira: e so o topo da primeira) ---
  let y = MARGEM;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...COR_ACCENT);
  doc.text(limpar(opts.titulo) || "Relatório de Simulações", MARGEM, y + 14);
  y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...COR_MUTED);
  const resumo =
    `${runs.length} conversa${runs.length === 1 ? "" : "s"} · ` +
    `${sucesso} sucesso · ${falha} falha` +
    (outros > 0 ? ` · ${outros} sem veredito` : "") +
    ` · ${grupos.length} simulação${grupos.length === 1 ? "" : "ões"}`;
  doc.text(resumo, MARGEM, y);
  y += 13;
  if (opts.subtitulo) {
    doc.text(limpar(opts.subtitulo), MARGEM, y);
    y += 13;
  }
  doc.text(`Emitido em ${agora.toLocaleString("pt-BR")}`, MARGEM, y);
  y += 10;

  doc.setDrawColor(220, 222, 230);
  doc.setLineWidth(0.8);
  doc.line(MARGEM, y, LARGURA_PAG - MARGEM, y);
  y += 18;
  doc.setTextColor(...COR_TEXTO);

  // --- uma secao por simulacao ---
  grupos.forEach((grupo, indice) => {
    if (indice > 0) {
      // Simulacao nova sempre comeca em pagina propria: misturar duas fichas
      // na mesma folha era o que deixava o relatorio antigo confuso.
      doc.addPage();
      y = MARGEM;
    }

    y = desenharTitulo(doc, y, grupo.nome, 13, COR_ACCENT);

    // 1. ficha
    autoTable(doc, {
      startY: y,
      body: linhasDaFicha(grupo),
      theme: "plain",
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 0, right: 6 }, valign: "top" },
      columnStyles: {
        0: { cellWidth: 118, fontStyle: "bold", textColor: COR_MUTED },
        1: { cellWidth: LARGURA_UTIL - 118, textColor: COR_TEXTO },
      },
      margin: { left: MARGEM, right: MARGEM, bottom: RODAPE },
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    // 2. tabela das conversas
    y = desenharTitulo(doc, y, "Conversas desta execução", 10.5, COR_TEXTO);
    autoTable(doc, {
      startY: y,
      head: [["Pessoa", "Resultado", "Turnos", "Tempo", "Início", "Motivo do encerramento"]],
      body: grupo.runs.map((r) => [
        limpar(r.personaNome) || "Conversa única",
        r.resultado || "—",
        `${r.totalTurnos ?? 0}/${r.maxTurnos ?? "—"}`,
        r.tempoSegundos != null ? `${r.tempoSegundos}s` : "—",
        formatarDataHora(r.startedAt),
        limpar(r.motivoEncerramento) || "—",
      ]),
      styles: { fontSize: 8.5, cellPadding: 5, valign: "top" },
      headStyles: { fillColor: [99, 102, 241], fontSize: 8.5 },
      columnStyles: {
        // "ENCERRADO" em negrito nao cabia em 58pt e quebrava em duas linhas.
        0: { cellWidth: 82 },
        1: { cellWidth: 72, fontStyle: "bold" },
        2: { cellWidth: 40 },
        3: { cellWidth: 44 },
        4: { cellWidth: 84 },
      },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 1) {
          data.cell.styles.textColor = corDoResultado(String(data.cell.raw));
        }
      },
      margin: { left: MARGEM, right: MARGEM, bottom: RODAPE },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // 3. troca de mensagens
    y = desenharTitulo(doc, y, "Troca de mensagens", 10.5, COR_TEXTO);

    grupo.runs.forEach((run, indiceConversa) => {
      // Espaco pra linha + nome + o comeco do primeiro balao: sem isso o
      // cabecalho de uma pessoa ficava sozinho no pe da pagina.
      y = garantirEspaco(doc, y, 110);

      // Linha divisoria: e o que faz saltar aos olhos onde termina a conversa
      // de uma pessoa e comeca a da proxima (pedido da Isa, 04/09/2026).
      if (indiceConversa > 0) y += 6;
      doc.setDrawColor(214, 217, 226);
      doc.setLineWidth(0.7);
      doc.line(MARGEM, y, LARGURA_PAG - MARGEM, y);
      y += 12;

      // Cabecalho da conversa: nome da pessoa + pilula do resultado.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...COR_TEXTO);
      const nome = limpar(run.personaNome) || "Conversa única";
      doc.text(nome, MARGEM, y + 8);

      const larguraNome = doc.getTextWidth(nome);
      doc.setFontSize(8);
      doc.setTextColor(...corDoResultado(run.resultado));
      doc.text(
        `${run.resultado || "—"} · ${run.totalTurnos ?? 0} turno${(run.totalTurnos ?? 0) === 1 ? "" : "s"}` +
          (run.tempoSegundos != null ? ` · ${run.tempoSegundos}s` : ""),
        MARGEM + larguraNome + 10,
        y + 8
      );
      doc.setTextColor(...COR_TEXTO);
      y += 16;

      if (run.embaralhamento) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...COR_MUTED);
        const linhasEmb: string[] = doc.splitTextToSize(
          `Dados embaralhados nesta conversa: ${limpar(run.embaralhamento)}`,
          LARGURA_UTIL
        );
        y = garantirEspaco(doc, y, linhasEmb.length * 10 + 6);
        doc.text(linhasEmb, MARGEM, y + 7);
        y += linhasEmb.length * 10 + 6;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COR_TEXTO);
      }

      const turnos: AvatarTurn[] = run.transcricao || [];
      if (turnos.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(...COR_MUTED);
        y = garantirEspaco(doc, y, 20);
        doc.text("Sem transcrição guardada para esta conversa.", MARGEM, y + 8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COR_TEXTO);
        y += 22;
      } else {
        turnos.forEach((t) => {
          y = desenharSeparadorTurno(doc, y, t.turno);
          y = desenharBalao(doc, y, t.enviado, "direita", BALAO_PESSOA);
          y = desenharBalao(doc, y, t.resposta_avatar, "esquerda", BALAO_AVATAR);
          y += 2;
        });
      }

      y += 10;
    });
  });

  // --- rodape em todas as paginas (so da pra numerar no fim) ---
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR_MUTED);
    doc.text(agora.toLocaleString("pt-BR"), MARGEM, ALTURA_PAG - 20);
    doc.text(`${p} de ${total}`, LARGURA_PAG - MARGEM, ALTURA_PAG - 20, { align: "right" });
  }

  const carimbo = agora.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const nomeArquivo =
    grupos.length === 1 && grupos[0].test
      ? `relatorio-${slug(grupos[0].nome)}-${carimbo}.pdf`
      : `relatorio-simulacoes-${carimbo}.pdf`;
  doc.save(nomeArquivo);
  return nomeArquivo;
}
