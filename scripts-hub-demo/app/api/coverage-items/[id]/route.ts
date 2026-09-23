import { NextRequest, NextResponse } from "next/server";
import { deleteCoverageItem, updateCoverageItem } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const item = await updateCoverageItem(id, {
      ...(body.nome !== undefined ? { nome: String(body.nome).trim() } : {}),
      ...(body.tags !== undefined ? { tags: Array.isArray(body.tags) ? body.tags : [] } : {}),
      ...(body.feito !== undefined ? { feito: Boolean(body.feito) } : {}),
      ...(body.tela !== undefined ? { tela: String(body.tela).trim() } : {}),
    });
    return NextResponse.json({ item });
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
    const removed = await deleteCoverageItem(id);
    if (!removed) {
      return NextResponse.json({ error: "Cenário de cobertura não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
