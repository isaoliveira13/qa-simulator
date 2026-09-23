import { NextRequest, NextResponse } from "next/server";
import { dispatchRun } from "@/lib/github";
import { Framework } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const {
      id,
      path,
      framework,
      attachmentPath,
    }: { id: string; path: string; framework: Framework; attachmentPath?: string } = await req.json();
    if (!id || !path || !framework) {
      return NextResponse.json({ error: "id, path e framework sao obrigatorios." }, { status: 400 });
    }
    const actionsUrl = await dispatchRun(id, path, framework, attachmentPath);
    return NextResponse.json({ actionsUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
