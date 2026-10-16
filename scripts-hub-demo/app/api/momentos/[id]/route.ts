import { NextRequest, NextResponse } from "next/server";
import { deleteMomento, updateMomento } from "@/lib/db";
import { MomentoItemTipo } from "@/lib/types";

type Corpo = {
  nome?: string;
  itens?: { tipo: MomentoItemTipo; refId: string }[];
  marcar?: { tipo: MomentoItemTipo; refId: string; feito: boolean };
  recomecar?: boolean;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { nome, itens, marcar, recomecar }: Corpo = await req.json();
    if (nome !== undefined && !nome.trim()) {
      return NextResponse.json({ error: "O momento precisa de um nome." }, { status: 400 });
    }
    const momento = await updateMomento(id, {
      ...(nome !== undefined ? { nome: nome.trim() } : {}),
      ...(Array.isArray(itens) ? { itens } : {}),
      ...(marcar ? { marcar: { tipo: marcar.tipo, refId: String(marcar.refId), feito: !!marcar.feito } } : {}),
      ...(recomecar ? { recomecar: true } : {}),
    });
    return NextResponse.json({ momento });
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
    const removido = await deleteMomento(id);
    if (!removido) return NextResponse.json({ error: "Momento não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
