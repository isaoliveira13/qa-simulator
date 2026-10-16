import { NextRequest, NextResponse } from "next/server";
import { updateScriptTags } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Etiquetas EM MASSA (13/10/2026): { itens: [{ id, tags }] } grava a lista
 * final de etiquetas de cada script de uma vez, numa chamada so (Biblioteca >
 * Selecionar varios > Etiquetas). A tela manda a lista ja calculada — assim o
 * mesmo caminho serve pra adicionar, tirar e pro "Desfazer" (que so manda as
 * listas de antes de volta).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body.itens) || body.itens.length === 0) {
      return NextResponse.json({ error: "Envie os scripts em `itens: [{ id, tags }]`." }, { status: 400 });
    }
    const itens = body.itens.map((i: any) => ({
      id: String(i?.id ?? "").trim(),
      tags: Array.isArray(i?.tags)
        ? Array.from(new Set(i.tags.map((t: unknown) => String(t).trim()).filter(Boolean))) as string[]
        : null,
    }));
    if (itens.some((i: { id: string; tags: string[] | null }) => !i.id || !i.tags)) {
      return NextResponse.json({ error: "Cada item precisa de `id` e da lista `tags`." }, { status: 400 });
    }

    const falharam: string[] = [];
    for (const i of itens as { id: string; tags: string[] }[]) {
      const entry = await updateScriptTags(i.id, i.tags);
      if (!entry) falharam.push(i.id);
    }
    if (falharam.length > 0) {
      return NextResponse.json(
        { error: `Script(s) nao encontrado(s): ${falharam.join(", ")}`, falharam },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, total: itens.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
