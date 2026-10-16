import { NextResponse } from "next/server";
import { sincronizarEtiquetaFilho } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Acerta a etiqueta "Filho" de todos os scripts (13/10/2026) — chamado pela
 * Biblioteca ao abrir, pra pegar o que ja existia antes da regra e qualquer
 * coisa que tenha mudado por fora. Devolve so os que mudaram: { alterados }.
 */
export async function POST() {
  try {
    const alterados = await sincronizarEtiquetaFilho();
    return NextResponse.json({ alterados });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
