/**
 * Faixa "Resultado geral" no topo dos relatórios PDF (13/10/2026): uma linha
 * só, com uma barrinha colorida e o percentual + quantidade de cada grupo
 * (ex.: "62,5% sucesso (5) · 25,0% falha (2) · 12,5% não validadas (1)").
 * Usada pelo relatório de simulações e pelo relatório do Checklist.
 */

type RGB = [number, number, number];

export type GrupoResumo = { rotulo: string; quantidade: number; cor: RGB };

/**
 * Percentuais com uma casa decimal que SEMPRE somam 100,0 (método do maior
 * resto): sem isso 1/3 + 1/3 + 1/3 viraria 33,3 + 33,3 + 33,3 = 99,9.
 */
export function percentuais(quantidades: number[]): number[] {
  const total = quantidades.reduce((s, q) => s + q, 0);
  if (total === 0) return quantidades.map(() => 0);
  const brutos = quantidades.map((q) => (q / total) * 1000); // em décimos de ponto
  const base = brutos.map((b) => Math.floor(b));
  let falta = 1000 - base.reduce((s, b) => s + b, 0);
  const ordem = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of ordem) {
    if (falta <= 0) break;
    base[i] += 1;
    falta -= 1;
  }
  return base.map((b) => b / 10);
}

function formatarPct(p: number): string {
  return `${p.toFixed(1).replace(".", ",")}%`;
}

/**
 * Desenha a faixa a partir de (x, y) com a largura dada e devolve o y logo
 * abaixo dela. "RESULTADO GERAL" fica sozinho na 1ª linha; embaixo vêm a
 * barra e os itens. Cada item ("12,5% não validadas (1)") é um bloco só:
 * se não couber, desce INTEIRO pra linha de baixo, nunca se parte.
 */
export function desenharResumoResultados(
  doc: any,
  x: number,
  y: number,
  largura: number,
  grupos: GrupoResumo[]
): number {
  const total = grupos.reduce((s, g) => s + g.quantidade, 0);
  const pcts = percentuais(grupos.map((g) => g.quantidade));
  const padX = 10;
  const alturaLinha = 14;
  const gap = 12;
  const larguraBarra = 80;
  const COR_MUTED: RGB = [107, 114, 128];

  // Mede primeiro pra saber quantas linhas a faixa vai ter.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const rotulo = "RESULTADO GERAL";
  const larguraRotulo = doc.getTextWidth(rotulo);
  const itens = grupos.map((g, i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const pct = formatarPct(pcts[i]);
    const wPct = doc.getTextWidth(pct);
    doc.setFont("helvetica", "normal");
    const resto = ` ${g.rotulo} (${g.quantidade})`;
    const wResto = doc.getTextWidth(resto);
    return { g, pct, resto, wPct, largura: 10 + wPct + wResto };
  });

  const limite = x + largura - padX;
  const inicioItens = x + padX + larguraBarra + gap;
  let cx = inicioItens;
  let linhas = 2; // linha 0 = título; linha 1 em diante = barra + itens
  const posicoes: { x: number; linha: number }[] = [];
  for (const it of itens) {
    if (cx + it.largura > limite && cx > inicioItens) {
      linhas += 1;
      cx = inicioItens;
    }
    posicoes.push({ x: cx, linha: linhas - 1 });
    cx += it.largura + gap;
  }
  void larguraRotulo;

  const altura = 8 + linhas * alturaLinha - 2;
  doc.setDrawColor(220, 222, 230);
  doc.setLineWidth(0.7);
  doc.roundedRect(x, y, largura, altura, 4, 4, "S");

  const base = (linha: number) => y + 4 + linha * alturaLinha + alturaLinha / 2;

  // rótulo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...COR_MUTED);
  doc.text(rotulo, x + padX, base(0) + 2.6);

  // barra empilhada (começo da linha 1)
  const xBarra = x + padX;
  const yBarra = base(1) - 3;
  doc.setFillColor(238, 240, 244);
  doc.rect(xBarra, yBarra, larguraBarra, 6, "F");
  let xs = xBarra;
  grupos.forEach((g, i) => {
    const w = total > 0 ? (larguraBarra * g.quantidade) / total : 0;
    if (w <= 0) return;
    doc.setFillColor(...g.cor);
    doc.rect(xs, yBarra, w, 6, "F");
    xs += w;
  });

  // itens: quadradinho + percentual (negrito, na cor) + rótulo e quantidade
  itens.forEach((it, i) => {
    const { x: ix, linha } = posicoes[i];
    const by = base(linha);
    doc.setFillColor(...it.g.cor);
    doc.rect(ix, by - 3, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...it.g.cor);
    doc.text(it.pct, ix + 10, by + 3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    doc.text(it.resto, ix + 10 + it.wPct, by + 3);
  });

  doc.setTextColor(20, 21, 26);
  return y + altura;
}
