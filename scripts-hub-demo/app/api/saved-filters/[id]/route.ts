import { NextRequest, NextResponse } from "next/server";
import { deleteSavedFilter, updateSavedFilter } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const savedFilter = await updateSavedFilter(id, {
      ...(body.nome !== undefined ? { nome: String(body.nome).trim() } : {}),
      ...(body.tagFilter !== undefined ? { tagFilter: body.tagFilter } : {}),
      ...(body.avatarFilter !== undefined ? { avatarFilter: body.avatarFilter } : {}),
      ...(body.ambienteFilter !== undefined ? { ambienteFilter: body.ambienteFilter } : {}),
      ...(body.busca !== undefined ? { busca: String(body.busca) } : {}),
    });
    return NextResponse.json({ savedFilter });
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
    const removed = await deleteSavedFilter(id);
    if (!removed) return NextResponse.json({ error: "Filtro salvo não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
