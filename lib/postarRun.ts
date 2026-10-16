// Chamada à rota /api/avatar-tests/run que sobrevive a falha de infraestrutura
// (01/10/2026).
//
// Em lote grande (15+ pessoas) a Vercel às vezes encerra a função antes de ela
// responder — timeout ou instância indisponível — e devolve uma página de erro
// em TEXTO ("An error occurred with your deployment..."). O `res.json()` que
// ficava aqui tentava ler isso como JSON e a pessoa aparecia com "Unexpected
// token 'A', "An error o"... is not valid JSON", sem relação com o teste.
//
// Por que repetir o turno é seguro: a sessão da conversa só é gravada no banco
// no FIM do turno (lib/qaConversa.ts, rodarTurno). Se a função morreu no meio,
// a sessão continua no turno anterior, e mandar o mesmo pedido de novo refaz o
// turno do zero. Só erro de infraestrutura é repetido — erro que a própria
// rota devolveu em JSON (token faltando, avatar inexistente...) não é.

const MAX_TENTATIVAS = 4;
const STATUS_TRANSITORIO = [408, 425, 429, 500, 502, 503, 504];

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mensagemAmigavel(status: number | null, trecho: string): string {
  const base =
    "O servidor demorou demais ou ficou indisponível para responder este turno (mesmo depois de tentar de novo). " +
    "Costuma acontecer com muitas conversas ao mesmo tempo — rode essa pessoa de novo ou diminua o limite de simultâneos.";
  const detalhe = [status ? `HTTP ${status}` : "sem resposta", trecho.trim().slice(0, 80)]
    .filter(Boolean)
    .join(" · ");
  return `${base} (${detalhe})`;
}

/** POST em /api/avatar-tests/run. Devolve o JSON da rota (inclusive `{ error }`). */
export async function postarRun(body: unknown): Promise<any> {
  let ultimoStatus: number | null = null;
  let ultimoTrecho = "";

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const res = await fetch("/api/avatar-tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const texto = await res.text();
      ultimoStatus = res.status;
      ultimoTrecho = texto;

      let json: any = null;
      try {
        json = JSON.parse(texto);
      } catch {
        json = null;
      }

      // JSON válido = a rota respondeu. O que ela disse (inclusive erro) vale,
      // salvo erro 500 de rede/tempo (OpenAI lenta, conexão caída): o turno
      // não gravou nada, então refazer é seguro.
      if (json !== null) {
        const transitorio =
          res.status === 500 &&
          typeof json.error === "string" &&
          /timeout|timed out|abort|fetch failed|ECONNRESET|ETIMEDOUT|OpenAI HTTP (429|5\d\d)/i.test(json.error);
        if (!transitorio || tentativa === MAX_TENTATIVAS) return json;
        await esperar(1500 * tentativa);
        continue;
      }

      // Não-JSON: a plataforma respondeu no lugar da rota. Só vale repetir
      // quando o status é de infraestrutura (ou 200 com corpo quebrado).
      if (res.ok || STATUS_TRANSITORIO.includes(res.status)) {
        if (tentativa < MAX_TENTATIVAS) {
          await esperar(1500 * tentativa);
          continue;
        }
      }
      break;
    } catch (e: any) {
      // Falha de rede (fetch lançou): também é transitória.
      ultimoStatus = null;
      ultimoTrecho = e?.message || "";
      if (tentativa < MAX_TENTATIVAS) {
        await esperar(1500 * tentativa);
        continue;
      }
      break;
    }
  }

  throw new Error(mensagemAmigavel(ultimoStatus, ultimoTrecho));
}
