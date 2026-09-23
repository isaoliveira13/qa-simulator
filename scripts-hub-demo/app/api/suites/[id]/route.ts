import { NextRequest, NextResponse } from "next/server";
import { deleteSuite, getSuite, updateSuite } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const suite = await getSuite(id);
    if (!suite) return NextResponse.json({ error: "Suíte não encontrada." }, { status: 404 });
    return NextResponse.json({ suite });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const {
      name,
      scriptIds,
      tags,
    }: { name?: string; scriptIds?: string[]; tags?: string[] } = await req.json();
    const suite = await updateSuite(id, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      // scriptIds chega JA na ordem da sequencia (o back so repassa).
      ...(scriptIds !== undefined ? { scriptIds } : {}),
      ...(tags !== undefined ? { tags } : {}),
    });
    return NextResponse.json({ suite });
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
    const removed = await deleteSuite(id);
    if (!removed) return NextResponse.json({ error: "Suíte não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
