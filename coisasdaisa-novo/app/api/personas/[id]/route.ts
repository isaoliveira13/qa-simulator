import { NextRequest, NextResponse } from "next/server";
import { deletePersona, getPersona, updatePersona } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const persona = await getPersona(id);
    if (!persona) return NextResponse.json({ error: "Persona não encontrada." }, { status: 404 });
    return NextResponse.json({ persona });
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
    const persona = await updatePersona(id, {
      ...(body.nome !== undefined ? { nome: String(body.nome).trim() } : {}),
      ...(body.cpf !== undefined ? { cpf: body.cpf ? String(body.cpf).trim() : null } : {}),
      ...(body.telefone !== undefined
        ? { telefone: body.telefone ? String(body.telefone).trim() : null }
        : {}),
      ...(body.genero !== undefined ? { genero: body.genero ? String(body.genero).trim() : null } : {}),
      ...(body.email !== undefined ? { email: body.email ? String(body.email).trim() : null } : {}),
      ...(body.nascimento !== undefined
        ? { nascimento: body.nascimento ? String(body.nascimento).trim() : null }
        : {}),
      ...(body.cidade !== undefined ? { cidade: body.cidade ? String(body.cidade).trim() : null } : {}),
      ...(body.campoExtraNome !== undefined
        ? { campoExtraNome: body.campoExtraNome ? String(body.campoExtraNome).trim() : null }
        : {}),
      ...(body.campoExtraValor !== undefined
        ? { campoExtraValor: body.campoExtraValor ? String(body.campoExtraValor).trim() : null }
        : {}),
      ...(body.fallbackDadosPessoa !== undefined
        ? { fallbackDadosPessoa: body.fallbackDadosPessoa === "vazio" ? "vazio" : "ficticio" }
        : {}),
      ...(body.cenario !== undefined ? { cenario: body.cenario ? String(body.cenario) : null } : {}),
      ...(body.criterioSucesso !== undefined
        ? { criterioSucesso: body.criterioSucesso ? String(body.criterioSucesso) : null }
        : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.foto !== undefined ? { foto: body.foto ? String(body.foto) : null } : {}),
    });
    return NextResponse.json({ persona });
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
    const removed = await deletePersona(id);
    if (!removed) return NextResponse.json({ error: "Persona não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
