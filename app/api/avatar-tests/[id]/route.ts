import { NextRequest, NextResponse } from "next/server";
import { normalizarConfigEmbaralhar } from "@/lib/embaralhar";
import { deleteAvatarTest, garantirAvatar, getAvatarTest, updateAvatarTest } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const avatarTest = await getAvatarTest(id);
    if (!avatarTest) {
      return NextResponse.json({ error: "Teste de avatar não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ avatarTest });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const avatarTest = await updateAvatarTest(id, {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.avatar !== undefined ? { avatar: String(body.avatar).trim() } : {}),
      ...(body.ambiente !== undefined ? { ambiente: String(body.ambiente).trim() } : {}),
      ...(body.hostSlug !== undefined ? { hostSlug: String(body.hostSlug).trim() } : {}),
      ...(body.subSlug !== undefined ? { subSlug: body.subSlug ? String(body.subSlug).trim() : null } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl ? String(body.baseUrl).trim() : null } : {}),
      ...(body.saudacaoInicial !== undefined
        ? { saudacaoInicial: String(body.saudacaoInicial).trim() }
        : {}),
      ...(body.maxTurnos !== undefined ? { maxTurnos: Number(body.maxTurnos) } : {}),
      ...(body.cenario !== undefined ? { cenario: String(body.cenario).trim() } : {}),
      ...(body.criterioSucesso !== undefined
        ? { criterioSucesso: body.criterioSucesso ? String(body.criterioSucesso).trim() : null }
        : {}),
      ...(body.dadosFixos !== undefined ? { dadosFixos: body.dadosFixos } : {}),
      ...(body.tela !== undefined ? { tela: body.tela || null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.tipo !== undefined ? { tipo: body.tipo === "lote" ? "lote" : "unico" } : {}),
      ...(body.pessoas !== undefined ? { pessoas: body.pessoas || null } : {}),
      ...(body.maxSimultaneos !== undefined
        ? { maxSimultaneos: body.maxSimultaneos != null ? Number(body.maxSimultaneos) : null }
        : {}),
      ...(body.cenariosIndividuaisAtivo !== undefined
        ? { cenariosIndividuaisAtivo: !!body.cenariosIndividuaisAtivo }
        : {}),
      ...(body.overridesPorPessoa !== undefined
        ? { overridesPorPessoa: body.overridesPorPessoa || null }
        : {}),
      ...(body.roteiroTurnos !== undefined
        ? { roteiroTurnos: Array.isArray(body.roteiroTurnos) ? body.roteiroTurnos : null }
        : {}),
      ...(body.mensagensPorTurno !== undefined
        ? { mensagensPorTurno: !!body.mensagensPorTurno }
        : {}),
      ...(body.rodarRoteiroCompleto !== undefined
        ? { rodarRoteiroCompleto: !!body.rodarRoteiroCompleto }
        : {}),
      ...(body.embaralharDados !== undefined ? { embaralharDados: !!body.embaralharDados } : {}),
      ...(body.embaralharConfig !== undefined
        ? { embaralharConfig: normalizarConfigEmbaralhar(body.embaralharConfig) }
        : {}),
      // Arquivar/desarquivar pelo menu do card (08/09/2026).
      ...(body.arquivada !== undefined ? { arquivada: !!body.arquivada } : {}),
      // Posicao manual do arrastar-soltar do Avatar IA (21/09/2026).
      ...(body.ordem !== undefined ? { ordem: Number(body.ordem) } : {}),
    });
    // Trocar o avatar de uma simulacao (assistente ou switch do card) tambem
    // cadastra um avatar novo, pelo mesmo motivo do POST.
    if (avatarTest) await garantirAvatar(avatarTest.avatar, avatarTest.hostSlug);
    return NextResponse.json({ avatarTest });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const removed = await deleteAvatarTest(id);
    if (!removed) {
      return NextResponse.json({ error: "Teste de avatar não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
