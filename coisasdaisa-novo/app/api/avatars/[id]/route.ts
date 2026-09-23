import { NextRequest, NextResponse } from "next/server";
import { deleteAvatar, updateAvatar } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const resultado = await updateAvatar(id, {
      ...(body.nome !== undefined ? { nome: String(body.nome) } : {}),
      ...(body.hostSlug !== undefined ? { hostSlug: String(body.hostSlug) } : {}),
      ...(body.subs !== undefined ? { subs: body.subs } : {}),
      // Liga/desliga da aba "Avatares": desativado some do switch dos cards,
      // sem apagar cadastro nenhum.
      ...(body.ativo !== undefined ? { ativo: !!body.ativo } : {}),
    });
    if (!resultado) return NextResponse.json({ error: "Avatar não encontrado." }, { status: 404 });
    // `repontadas` só vem quando este PATCH desligou o avatar e havia simulação
    // apontada pra ele — é o que a tela usa pra dizer pra onde elas foram.
    return NextResponse.json({ avatar: resultado.avatar, repontadas: resultado.repontadas ?? null });
  } catch (err: any) {
    const msg = /avatars_nome_idx|duplicate key/i.test(err.message || "")
      ? "Já existe um avatar com esse nome."
      : err.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Apagar tira o avatar do switch e das sugestões — nenhuma simulação é apagada
 * nem alterada. Ver o comentário de deleteAvatar em lib/db.ts.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteAvatar(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
