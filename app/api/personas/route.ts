import { NextRequest, NextResponse } from "next/server";
import { createPersona, listPersonas } from "@/lib/db";

export async function GET() {
  try {
    const personas = await listPersonas();
    return NextResponse.json({ personas });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    }
    const persona = await createPersona({
      nome,
      cpf: body.cpf ? String(body.cpf).trim() : undefined,
      telefone: body.telefone ? String(body.telefone).trim() : undefined,
      genero: body.genero ? String(body.genero).trim() : undefined,
      email: body.email ? String(body.email).trim() : undefined,
      nascimento: body.nascimento ? String(body.nascimento).trim() : undefined,
      cidade: body.cidade ? String(body.cidade).trim() : undefined,
      campoExtraNome: body.campoExtraNome ? String(body.campoExtraNome).trim() : undefined,
      campoExtraValor: body.campoExtraValor ? String(body.campoExtraValor).trim() : undefined,
      fallbackDadosPessoa: body.fallbackDadosPessoa === "vazio" ? "vazio" : "ficticio",
      cenario: body.cenario ? String(body.cenario) : undefined,
      criterioSucesso: body.criterioSucesso ? String(body.criterioSucesso) : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      foto: body.foto ? String(body.foto) : undefined,
    });
    return NextResponse.json({ persona });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
