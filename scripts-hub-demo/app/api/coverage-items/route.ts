import { NextRequest, NextResponse } from "next/server";
import { createCoverageItem, listCoverageItems } from "@/lib/db";

export async function GET() {
  try {
    const items = await listCoverageItems();
    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tela = String(body.tela ?? "").trim();
    const nome = String(body.nome ?? "").trim();
    if (!tela) {
      return NextResponse.json({ error: "Informe a tela." }, { status: 400 });
    }
    if (!nome) {
      return NextResponse.json({ error: "Dê um nome pro cenário." }, { status: 400 });
    }
    const item = await createCoverageItem({
      tela,
      nome,
      tags: Array.isArray(body.tags) ? body.tags : [],
    });
    return NextResponse.json({ item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
