import { NextRequest, NextResponse } from "next/server";
import { createSavedFilter, listSavedFilters } from "@/lib/db";

export async function GET() {
  try {
    const savedFilters = await listSavedFilters();
    return NextResponse.json({ savedFilters });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ error: "Dê um nome ao filtro." }, { status: 400 });
    }
    if (!body.tagFilter || typeof body.tagFilter !== "object") {
      return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
    }
    const savedFilter = await createSavedFilter({
      nome,
      tagFilter: body.tagFilter,
      avatarFilter: body.avatarFilter,
      ambienteFilter: body.ambienteFilter,
      busca: body.busca ? String(body.busca) : "",
    });
    return NextResponse.json({ savedFilter });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
