import { NextRequest, NextResponse } from "next/server";
import { createSuite, listSuites } from "@/lib/db";

export async function GET() {
  try {
    const suites = await listSuites();
    return NextResponse.json({ suites });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      name,
      scriptIds,
      tags,
    }: { name?: string; scriptIds?: string[]; tags?: string[] } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Informe um nome para a suíte." }, { status: 400 });
    }
    // scriptIds chega JA na ordem da sequencia (o back so repassa).
    const suite = await createSuite(name.trim(), scriptIds || [], tags || []);
    return NextResponse.json({ suite });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
