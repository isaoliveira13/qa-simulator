import { Framework } from "./types";

/**
 * MODO DEMO — este arquivo é o que, no hub original, falava de verdade com a
 * API do GitHub (disparar o Actions que roda o teste) e com o Vercel Blob
 * (apagar um anexo). Nesta versão de portfólio nenhuma das duas coisas existe
 * de verdade: não há token de GitHub, não há repositório real por trás, e não
 * existe fetch nenhum aqui dentro.
 *
 * Isso é intencional e é a garantia central da demo: ninguém consegue, a
 * partir deste repositório publicado, disparar uma execução real de teste em
 * lugar nenhum. As assinaturas das funções continuam iguais às do módulo
 * original só pra quem chama (as rotas de API) não precisar mudar.
 */

function idFicticio(prefixo: string): string {
  return `${prefixo}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/**
 * Apaga o anexo de um script. Nesta demo o anexo é sempre uma data URL
 * guardada no próprio registro em memória (ver app/api/blob-upload/route.ts),
 * então não existe nenhum arquivo externo pra remover — a função só resolve
 * na hora, sem fazer nada, mantida com o mesmo nome/assinatura pra quem
 * chama (rotas de /api/scripts) não precisar de um caminho especial.
 */
export async function deleteAttachment(_attachmentPath: string): Promise<void> {
  return;
}

/**
 * No projeto real, montava a URL da aba Actions do repositório configurado
 * (GITHUB_OWNER/GITHUB_REPO). Aqui não existe repositório real nenhum: a URL
 * devolvida é só um exemplo — parece uma URL de verdade, mas o link não leva
 * a um repositório real (é assim de propósito, pra não sugerir que aponta pra
 * algo publicado).
 */
export async function getActionsUrl(): Promise<string> {
  return "https://github.com/exemplo-demo/scripts-hub-demo/actions";
}

/**
 * No projeto real, disparava o workflow do GitHub Actions correspondente ao
 * framework (run-playwright.yml / run-cypress.yml), que baixava o script do
 * banco e rodava o teste de verdade num runner do GitHub. Aqui não existe
 * workflow nenhum: a função só "finge" que disparou, devolvendo na hora uma
 * URL de exemplo — nenhuma chamada de rede acontece, e nenhum teste roda em
 * lugar nenhum a partir desta demo.
 */
export async function dispatchRun(
  _scriptId: string,
  _scriptPath: string,
  _framework: Framework,
  _attachmentPath?: string
): Promise<string> {
  return `https://github.com/exemplo-demo/scripts-hub-demo/actions/runs/${idFicticio("run")}`;
}
