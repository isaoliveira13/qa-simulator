import { NextRequest, NextResponse } from "next/server";
import { normalizarConfigEmbaralhar } from "@/lib/embaralhar";
import { createAvatarTest, garantirAvatar, listAvatarTests } from "@/lib/db";

export async function GET() {
  try {
    const avatarTests = await listAvatarTests();
    return NextResponse.json({ avatarTests });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const avatar = String(body.avatar || "").trim();
    const ambiente = String(body.ambiente || "").trim();
    const cenario = String(body.cenario || "").trim();

    // Avatar e ambiente deixaram de ser obrigatorios em 02/09/2026: o
    // assistente nao pergunta mais onde a simulacao roda — quem grava isso e
    // o switch do card, na hora de rodar. Uma simulacao recem-criada nasce
    // sem destino, e o card pede pra escolher antes do primeiro "Rodar".
    if (!name || !cenario) {
      return NextResponse.json({ error: "Nome e cenário são obrigatórios." }, { status: 400 });
    }

    const avatarTest = await createAvatarTest({
      name,
      avatar,
      ambiente,
      cenario,
      hostSlug: body.hostSlug ? String(body.hostSlug).trim() : undefined,
      subSlug: body.subSlug ? String(body.subSlug).trim() : undefined,
      baseUrl: body.baseUrl ? String(body.baseUrl).trim() : undefined,
      saudacaoInicial: body.saudacaoInicial ? String(body.saudacaoInicial).trim() : undefined,
      maxTurnos: body.maxTurnos ? Number(body.maxTurnos) : undefined,
      criterioSucesso: body.criterioSucesso ? String(body.criterioSucesso).trim() : undefined,
      dadosFixos: body.dadosFixos || undefined,
      tela: body.tela || undefined,
      tags: body.tags || undefined,
      tipo: body.tipo === "lote" ? "lote" : undefined,
      pessoas: body.pessoas || undefined,
      maxSimultaneos: body.maxSimultaneos ? Number(body.maxSimultaneos) : undefined,
      cenariosIndividuaisAtivo: body.cenariosIndividuaisAtivo || undefined,
      overridesPorPessoa: body.overridesPorPessoa || undefined,
      mensagensPorTurno: body.mensagensPorTurno || undefined,
      roteiroTurnos: Array.isArray(body.roteiroTurnos) ? body.roteiroTurnos : undefined,
      rodarRoteiroCompleto: body.rodarRoteiroCompleto || undefined,
      embaralharDados: body.embaralharDados || undefined,
      // A config so vale com o mestre ligado; normalizarConfigEmbaralhar
      // aceita qualquer coisa que venha do cliente sem confiar em nada.
      embaralharConfig: body.embaralharDados
        ? normalizarConfigEmbaralhar(body.embaralharConfig)
        : undefined,
    });
    // Avatar digitado no assistente entra sozinho na aba "Avatares"
    // (28/08/2026) — e o que faz ele aparecer no switch do card sem ela
    // precisar passar na aba antes. Nao lanca: ver garantirAvatar.
    await garantirAvatar(avatarTest.avatar, avatarTest.hostSlug);
    return NextResponse.json({ avatarTest });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
