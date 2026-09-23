import { NextRequest, NextResponse } from "next/server";
import { deleteAvatarTestRun } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const removed = await deleteAvatarTestRun(id);
    if (!removed) {
      return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
