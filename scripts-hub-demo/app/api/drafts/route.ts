import { NextRequest, NextResponse } from "next/server";
import { createDraft, listDrafts } from "@/lib/db";
import { Framework } from "@/lib/types";

export async function GET() {
  try {
    const drafts = await listDrafts();
    return NextResponse.json({ drafts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: {
      name?: string;
      avatar?: string;
      ambiente?: string;
      cenario?: string;
      tela?: string;
      tags?: string[];
      framework?: Framework;
      content?: string;
    } = await req.json().catch(() => ({}));

    const draft = await createDraft(body);
    return NextResponse.json({ draft });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
