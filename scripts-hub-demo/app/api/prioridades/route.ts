import { NextRequest, NextResponse } from "next/server";
import { listPrioridades, setPrioridade, setPrioridadesEmMassa } from "@/lib/db";
import { ehNivel } from "@/lib/prioridade";

// Sem isto o Next 14 gera o GET como arquivo estatico no build (a lista
// ficaria congelada) e o PUT pode cair num 405 sem corpo na Vercel — que era
// o "Unexpected end of JSON input" ao marcar prioridade (13/10/2026).
export const dynamic = "force-dynamic";

const CHAVE_VALIDA = /^(script|simulacao|suite):.+/;

/** Mapa chave -> nivel (ver lib/prioridade.ts). */
export async function GET() {
  try {
    const prioridades = await listPrioridades();
    return NextResponse.json({ prioridades });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Define o nivel de uma chave:
 * { chave: "script:<familia>" | "simulacao:<id>" | "suite:<id>", nivel: 1|2|3|null }.
 * `nivel: null` tira a prioridade.
 *
 * Em massa (13/10/2026): { chaves: string[], nivel } grava o mesmo nivel em
 * todas as chaves numa query so (Biblioteca > Selecionar varios > Prioridade).
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const nivel = body.nivel === null ? null : Number(body.nivel);
    if (nivel !== null && !ehNivel(nivel)) {
      return NextResponse.json({ error: "O nivel precisa ser 1, 2, 3 ou null." }, { status: 400 });
    }

    if (Array.isArray(body.chaves)) {
      const chaves = body.chaves.map((c: unknown) => String(c).trim()).filter(Boolean);
      if (chaves.length === 0) {
        return NextResponse.json({ error: "Nenhuma chave de prioridade enviada." }, { status: 400 });
      }
      const invalida = chaves.find((c: string) => !CHAVE_VALIDA.test(c));
      if (invalida) {
        return NextResponse.json({ error: `Chave de prioridade invalida: ${invalida}` }, { status: 400 });
      }
      await setPrioridadesEmMassa(chaves, nivel);
      return NextResponse.json({ ok: true, chaves, nivel });
    }

    const chave = typeof body.chave === "string" ? body.chave.trim() : "";
    if (!CHAVE_VALIDA.test(chave)) {
      return NextResponse.json({ error: "Chave de prioridade invalida." }, { status: 400 });
    }
    await setPrioridade(chave, nivel);
    return NextResponse.json({ ok: true, chave, nivel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
