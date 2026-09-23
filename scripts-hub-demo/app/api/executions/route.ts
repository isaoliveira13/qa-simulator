import { NextRequest, NextResponse } from "next/server";
import { createExecution, listExecutions } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scriptId = searchParams.get("scriptId") || undefined;
    const suiteId = searchParams.get("suiteId") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const executions = await listExecutions({ scriptId, suiteId, limit });
    return NextResponse.json({ executions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      scriptId,
      suiteId,
      status,
      note,
    }: { scriptId?: string; suiteId?: string; status?: "passed" | "failed"; note?: string } =
      await req.json();

    if (!scriptId && !suiteId) {
      return NextResponse.json({ error: "Informe scriptId e/ou suiteId." }, { status: 400 });
    }
    if (status !== "passed" && status !== "failed") {
      return NextResponse.json({ error: 'status precisa ser "passed" ou "failed".' }, { status: 400 });
    }

    const execution = await createExecution({ scriptId, suiteId, status, note });
    return NextResponse.json({ execution });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
