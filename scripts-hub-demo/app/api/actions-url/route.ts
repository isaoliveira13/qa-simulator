import { NextResponse } from "next/server";
import { getActionsUrl } from "@/lib/github";

export async function GET() {
  try {
    const url = await getActionsUrl();
    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
