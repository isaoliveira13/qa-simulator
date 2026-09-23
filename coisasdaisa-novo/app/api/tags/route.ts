import { NextRequest, NextResponse } from "next/server";
import { listTags, addTags, updateTag, deleteTag } from "@/lib/db";

export async function GET() {
    try {
          const tags = await listTags();
          return NextResponse.json({ tags });
    } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
          const { tags }: { tags?: { name: string; color?: string }[] } = await req.json();
          if (!Array.isArray(tags) || tags.length === 0) {
                  return NextResponse.json({ error: "Informe ao menos uma tag." }, { status: 400 });
          }
          const updated = await addTags(tags);
          return NextResponse.json({ tags: updated });
    } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
          const { name, newName, color }: { name?: string; newName?: string; color?: string } =
                  await req.json();
          if (!name) {
                  return NextResponse.json({ error: "Informe a tag que sera editada." }, { status: 400 });
          }
          const updated = await updateTag(name, { name: newName, color });
          return NextResponse.json({ tags: updated });
    } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
          const { name }: { name?: string } = await req.json();
          if (!name) {
                  return NextResponse.json({ error: "Informe a tag que sera apagada." }, { status: 400 });
          }
          const updated = await deleteTag(name);
          return NextResponse.json({ tags: updated });
    } catch (err: any) {
          return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
