import { NextRequest, NextResponse } from "next/server";
import { deleteDraft, getDraft, updateDraft } from "@/lib/db";
import { Framework } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getDraft(id);
    if (!result) return NextResponse.json({ error: "Rascunho não encontrado." }, { status: 404 });
    return NextResponse.json(result);
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
    const body: {
      name?: string;
      avatar?: string;
      ambiente?: string;
      cenario?: string;
      tela?: string | null;
      tags?: string[];
      framework?: Framework;
      content?: string;
    } = await req.json();

    const draft = await updateDraft(id, body);
    return NextResponse.json({ draft });
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
    const removed = await deleteDraft(id);
    if (!removed) return NextResponse.json({ error: "Rascunho não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
