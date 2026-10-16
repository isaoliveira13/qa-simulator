import { NextRequest, NextResponse } from "next/server";
import { createMomento, listMomentos } from "@/lib/db";
import { MomentoItemTipo } from "@/lib/types";

export async function GET() {
  try {
    const momentos = await listMomentos();
    return NextResponse.json({ momentos });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome, itens }: { nome?: string; itens?: { tipo: MomentoItemTipo; refId: string }[] } =
      await req.json();
    if (!nome || !nome.trim()) {
      return NextResponse.json({ error: "Dê um nome para o momento." }, { status: 400 });
    }
    // itens chegam JA na ordem que a Isa montou.
    const momento = await createMomento(nome.trim(), Array.isArray(itens) ? itens : []);
    return NextResponse.json({ momento });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
