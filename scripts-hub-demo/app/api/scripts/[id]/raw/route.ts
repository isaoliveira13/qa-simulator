import { NextRequest, NextResponse } from "next/server";
import { getScriptRaw } from "@/lib/db";

/**
 * Devolve o conteudo bruto (texto puro) de um script pelo id.
 *
 * Usada por dois consumidores:
 * 1. O GitHub Actions (run-playwright.yml / run-cypress.yml), que baixa o
 *    script daqui e escreve o arquivo antes de rodar o teste — ja que o
 *    script nao vem mais de um checkout do repo.
 * 2. O botao "Rodar no meu terminal" no navegador, que gera um comando que
 *    baixa o arquivo daqui antes de rodar localmente.
 *
 * Sem autenticacao — mesmo nivel de protecao das outras rotas GET deste
 * app hoje (ex.: /api/scripts/[id] ja devolve o conteudo completo sem
 * exigir login). Se quiser fechar isso de verdade, o caminho e ativar
 * Vercel Deployment Protection (senha) no projeto, nao um token por rota.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getScriptRaw(id);
  if (!result) {
    return new NextResponse("Script nao encontrado.", { status: 404 });
  }
  return new NextResponse(result.content, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
