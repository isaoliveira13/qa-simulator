import { NextRequest, NextResponse } from "next/server";
import { deleteAvatarTestBatch } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const removed = await deleteAvatarTestBatch(batchId);
    if (!removed) return NextResponse.json({ error: "Preset não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
