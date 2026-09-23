import { NextRequest, NextResponse } from "next/server";
import { listAvatarTestRuns } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const avatarTestId = searchParams.get("avatarTestId") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const runs = await listAvatarTestRuns({ avatarTestId, limit });
    return NextResponse.json({ runs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
