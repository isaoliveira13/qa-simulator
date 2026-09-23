import type { CSSProperties } from "react";

// Deriva um par (fundo claro, texto escuro) a partir da cor real cadastrada
// pra cada tag em /tags, preservando o matiz escolhido lá — mesma
// composição visual que a paleta fixa tag-c0..c6 já usava (fundo claro +
// texto escuro), só que agora a cor vem do catálogo de verdade em vez de um
// hash do nome da tag. Isa pediu em 13/08/2026: a cor que ela escolhe em
// /tags (ou na criação da tag) precisa ser a mesma que aparece na pílula da
// Biblioteca (e das outras telas que listam tags de scripts/testes).
export function tagPillStyle(hex?: string): CSSProperties {
  if (!hex || !/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) {
    // Sem cor válida a pílula cai na cor neutra do tema (que já tem versão
    // clara e escura).
    return { background: "var(--tag-bg)", color: "var(--tag-text)" };
  }
  const { h, s } = hexToHsl(hex);
  const sat = Math.min(Math.max(s, 40), 75);
  return {
    // Claro: fundo bem claro + texto escuro, como sempre foi.
    ["--tag-pill-bg-light"]: hslToHex(h, sat, 93),
    ["--tag-pill-fg-light"]: hslToHex(h, Math.min(sat + 15, 90), 30),
    // Escuro: inverte a composição — fundo escuro tingido do mesmo matiz +
    // texto claro. Antes o par claro era usado nos dois temas, e a pílula
    // clarinha no fundo quase preto ficava com contraste gritante (Isa,
    // 08/09/2026). Os números seguem a mesma proporção da paleta fixa
    // .tag-c0..c6 do tema escuro (fundo ~16% de luz, texto ~76%).
    ["--tag-pill-bg-dark"]: hslToHex(h, Math.min(Math.max(sat - 30, 22), 40), 16),
    ["--tag-pill-fg-dark"]: hslToHex(h, Math.min(sat + 15, 85), 76),
    // Quem escolhe qual dos dois pares vale é o CSS de .tag (globals.css),
    // que redefine --tag-pill-bg/--tag-pill-fg no tema escuro.
    background: "var(--tag-pill-bg)",
    color: "var(--tag-pill-fg)",
  } as CSSProperties;
}

// Ordena uma lista de tags pela cor cadastrada no catálogo (matiz/hue),
// agrupando visualmente as pílulas por cor em vez de deixar na ordem em que
// foram adicionadas ao script/teste/persona. Tags sem cor válida vão pro
// final; empate de matiz (mesma cor) desempata por nome, pra ordem estável.
// `colorFor` isola de onde vem a cor em cada tela — catálogo `Tag[]`
// (testes-avatar, personas) ou mapa `tagColors` (Biblioteca, checklist).
export function sortTagsByColor(tags: string[], colorFor: (tag: string) => string | undefined): string[] {
  return [...tags].sort((a, b) => {
    const hueA = hueOf(colorFor(a));
    const hueB = hueOf(colorFor(b));
    if (hueA !== hueB) return hueA - hueB;
    return a.localeCompare(b);
  });
}

function hueOf(hex?: string): number {
  if (!hex || !/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex)) return 361;
  return hexToHsl(hex).h;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
