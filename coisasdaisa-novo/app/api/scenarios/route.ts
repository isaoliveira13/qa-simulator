import { NextRequest, NextResponse } from "next/server";
import { createScenario, listScenarios } from "@/lib/db";

export async function GET() {
  try {
    const scenarios = await listScenarios();
    return NextResponse.json({ scenarios });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome || "").trim();
    const cenario = String(body.cenario || "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    }
    if (!cenario) {
      return NextResponse.json({ error: "Cenário é obrigatório." }, { status: 400 });
    }
    const scenario = await createScenario({
      nome,
      cenario,
      criterioSucesso: body.criterioSucesso ? String(body.criterioSucesso).trim() : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    });
    return NextResponse.json({ scenario });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
