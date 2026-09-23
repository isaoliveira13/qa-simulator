import { NextRequest, NextResponse } from "next/server";
import { getScript, deleteScript, updateScriptTags, updateScriptOrdem } from "@/lib/db";
import { deleteAttachment } from "@/lib/github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getScript(id);
    if (!result) {
      return NextResponse.json({ error: "Script nao encontrado." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Atualiza so as etiquetas OU so a ordem manual do script (nunca o script
 * inteiro: o POST de /api/scripts exige `content`, que a tela de listagem
 * nao carrega). Existe pro botao "+" de etiqueta e pro arrastar-soltar da
 * Biblioteca (21/09/2026) — cada PATCH manda um dos dois, nunca os dois.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (body.ordem !== undefined) {
      const ordem = Number(body.ordem);
      if (!Number.isFinite(ordem)) {
        return NextResponse.json({ error: "`ordem` precisa ser um numero." }, { status: 400 });
      }
      const entry = await updateScriptOrdem(id, ordem);
      if (!entry) {
        return NextResponse.json({ error: "Script nao encontrado." }, { status: 404 });
      }
      return NextResponse.json({ entry });
    }

    if (!Array.isArray(body.tags)) {
      return NextResponse.json({ error: "Envie a lista de etiquetas em `tags` ou a posicao em `ordem`." }, { status: 400 });
    }
    const tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
    const entry = await updateScriptTags(id, tags);
    if (!entry) {
      return NextResponse.json({ error: "Script nao encontrado." }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { deleted, attachmentPath } = await deleteScript(id);
    if (!deleted) {
      return NextResponse.json({ error: "Script nao encontrado." }, { status: 404 });
    }
    if (attachmentPath) {
      await deleteAttachment(attachmentPath);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
