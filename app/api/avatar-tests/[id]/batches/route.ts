import { NextRequest, NextResponse } from "next/server";
import { createAvatarTestBatch, listAvatarTestBatches } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const batches = await listAvatarTestBatches(id);
    return NextResponse.json({ batches });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const name = String(body.name || "").trim();
    const pessoas = Array.isArray(body.pessoas) ? body.pessoas : [];
    if (!name) {
      return NextResponse.json({ error: "Dê um nome para o preset." }, { status: 400 });
    }
    if (pessoas.length === 0) {
      return NextResponse.json({ error: "Adicione ao menos uma pessoa ao lote." }, { status: 400 });
    }
    const batch = await createAvatarTestBatch({
      avatarTestId: id,
      name,
      pessoas,
      maxSimultaneos: body.maxSimultaneos ? Number(body.maxSimultaneos) : 5,
    });
    return NextResponse.json({ batch });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
