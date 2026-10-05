/**
 * Anexos no relatório PDF (05/10/2026). O anexo aparece DENTRO do balão da
 * pessoa simulada, como no chat:
 *   - imagem: a imagem inteira no topo do balão, o texto da mensagem embaixo;
 *   - documento (PDF): um cartão com ícone e a palavra "documento".
 *
 * Aqui só se prepara a imagem (no navegador, na hora de emitir): ela vira
 * JPEG num <canvas> — PNG/WEBP/GIF/JPG entram iguais no jsPDF e fundo
 * transparente vira branco. Se não carregar, o balão mostra um cartão
 * "imagem" no lugar; anexo nunca impede de emitir o relatório.
 */

import type { AnexoTurno } from "./types";
import { ehImagem } from "./anexosTurno";

/** Lado maior da imagem guardada no relatório, em pixels (segura o tamanho do PDF final). */
const LADO_MAX_PX = 1600;

export type PreviaImagem = {
  dataUrl: string;
  /** Tamanho do que foi desenhado, em px. */
  largura: number;
  altura: number;
};

/** Chave de um anexo no mapa de prévias. */
export function chaveAnexo(a: AnexoTurno): string {
  return a.id || a.url || a.nome;
}

async function previaDeImagem(blob: Blob): Promise<PreviaImagem> {
  const bitmap = await createImageBitmap(blob);
  const fator = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * fator));
  canvas.height = Math.max(1, Math.round(bitmap.height * fator));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não liberou o desenho da imagem.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), largura: canvas.width, altura: canvas.height };
}

/**
 * Prepara as imagens anexadas (sem repetir arquivo). Nunca lança: imagem que
 * não carregar simplesmente fica fora do mapa e vira cartão no balão.
 */
export async function prepararPreviasAnexos(anexos: AnexoTurno[]): Promise<Map<string, PreviaImagem>> {
  const previas = new Map<string, PreviaImagem>();
  const vistos = new Set<string>();
  for (const a of anexos) {
    const chave = chaveAnexo(a);
    if (vistos.has(chave) || !ehImagem(a)) continue;
    vistos.add(chave);
    try {
      const blob = await obterArquivoDoAnexo(a);
      if (blob) previas.set(chave, await previaDeImagem(blob));
    } catch {
      // segue sem prévia: o balão mostra o cartão "imagem"
    }
  }
  return previas;
}

// --- de onde vem o arquivo (MODO DEMO: memória do navegador) ---

/**
 * O conteúdo dos arquivos anexados nesta visita, por id do anexo. Fica só na
 * memória da aba (some ao recarregar) — nada é enviado pra servidor nenhum.
 */
const arquivosDaVisita = new Map<string, Blob>();

/** Chamado pelo editor de anexos quando um arquivo é escolhido. */
export function guardarArquivoDaVisita(idAnexo: string, arquivo: Blob) {
  if (idAnexo) arquivosDaVisita.set(idAnexo, arquivo);
}

async function obterArquivoDoAnexo(a: AnexoTurno): Promise<Blob | null> {
  return arquivosDaVisita.get(a.id) ?? null;
}
