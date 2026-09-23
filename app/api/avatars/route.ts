import { NextRequest, NextResponse } from "next/server";
import { createAvatar, listAvatars } from "@/lib/db";

/**
 * Cadastro de avatares (aba "Avatares", 28/08/2026).
 *
 * GET  -> { avatares }  a lista que o switch do card e o assistente leem
 * POST -> { avatar }    cadastro novo
 */
export async function GET() {
  try {
    return NextResponse.json({ avatares: await listAvatars() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nome = String(body.nome || "").trim();
    if (!nome) return NextResponse.json({ error: "Nome do avatar é obrigatório." }, { status: 400 });
    const avatar = await createAvatar({
      nome,
      hostSlug: body.hostSlug ? String(body.hostSlug) : undefined,
      subs: body.subs,
    });
    return NextResponse.json({ avatar });
  } catch (err: any) {
    // O índice único de nome vira uma frase que explica o que fazer, em vez do
    // erro cru do Postgres.
    const msg = /avatars_nome_idx|duplicate key/i.test(err.message || "")
      ? "Já existe um avatar com esse nome."
      : err.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
