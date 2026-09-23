import { NextRequest, NextResponse } from "next/server";
import { deleteScenario, getScenario, updateScenario } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const scenario = await getScenario(id);
    if (!scenario) return NextResponse.json({ error: "Cenário não encontrado." }, { status: 404 });
    return NextResponse.json({ scenario });
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
    const body = await req.json();
    const scenario = await updateScenario(id, {
      ...(body.nome !== undefined ? { nome: String(body.nome).trim() } : {}),
      ...(body.cenario !== undefined ? { cenario: String(body.cenario).trim() } : {}),
      ...(body.criterioSucesso !== undefined
        ? { criterioSucesso: body.criterioSucesso ? String(body.criterioSucesso).trim() : null }
        : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    });
    return NextResponse.json({ scenario });
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
    const removed = await deleteScenario(id);
    if (!removed) return NextResponse.json({ error: "Cenário não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
