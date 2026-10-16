import { NextRequest, NextResponse } from "next/server";
import { listPaisDeScripts, setPaiDeScripts, sincronizarEtiquetaFilho } from "@/lib/db";

// Mesmo motivo de /api/prioridades: sem isto o GET vira arquivo estatico no
// build e o PUT pode cair num 405 sem corpo na Vercel.
export const dynamic = "force-dynamic";

/** Mapa familia -> pai organizado na mao (ver lib/hierarquia.ts). */
export async function GET() {
  try {
    const pais = await listPaisDeScripts();
    return NextResponse.json({ pais });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * { familias: string[], pai: string | null }
 * - pai = familia -> coloca as familias dentro dela
 * - pai = ""      -> ficam na raiz (desliga o automatico pelo nome)
 * - pai = null    -> voltam ao automatico
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const familias: string[] = Array.isArray(body.familias)
      ? body.familias.map((f: unknown) => String(f).trim()).filter(Boolean)
      : [];
    if (familias.length === 0) {
      return NextResponse.json({ error: "Nenhum script enviado em `familias`." }, { status: 400 });
    }
    const pai = body.pai === null ? null : typeof body.pai === "string" ? body.pai.trim() : undefined;
    if (pai === undefined) {
      return NextResponse.json({ error: "Envie `pai` (familia, \"\" ou null)." }, { status: 400 });
    }
    if (pai && familias.includes(pai)) {
      return NextResponse.json({ error: "Um script nao pode ficar dentro dele mesmo." }, { status: 400 });
    }
    await setPaiDeScripts(familias, pai);
    // Quem virou (ou deixou de ser) filho ganha/perde a etiqueta "Filho".
    const alterados = await sincronizarEtiquetaFilho();
    return NextResponse.json({ ok: true, familias, pai, alterados });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
