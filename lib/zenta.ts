/**
 * MODO DEMO — este arquivo é o que, no motor original, falava com a API de
 * verdade da Tolky (api.tolky.to / api-hml / api-stg). Nesta versão de
 * portfólio ele NUNCA faz uma chamada de rede: toda "resposta do avatar" é
 * fictícia, montada localmente a partir do cenário e do critério de sucesso
 * que a pessoa preencheu no formulário.
 *
 * Isso é intencional e é a garantia central da demo: ninguém consegue, a
 * partir deste repositório, disparar uma conversa real contra um avatar de
 * verdade — não existe token de domínio, não existe host real, não existe
 * fetch nenhum aqui dentro. As assinaturas das funções continuam iguais às
 * do motor original só para o resto do código (lib/qaConversa.ts) não
 * precisar mudar.
 */

export interface TolkyTurno {
  avatarMessage: string;
  okStatus: boolean;
  conversationId: string | null;
  statusCode: number | null;
  tentativas: number;
  erroHttp: string | null;
}

export interface TokenDeDominio {
  nome: string;
  valor: string;
}

/**
 * Não lê variável de ambiente nenhuma — a demo não depende de token real.
 * Mantém o parâmetro (ignorado) só pra não precisar mexer em quem chama.
 */
export function tokensDeDominio(_api?: "prod" | "stage" | "homolog"): TokenDeDominio[] {
  return [{ nome: "DEMO_TOKEN", valor: "demo" }];
}

function idFicticio(prefixo: string): string {
  return `${prefixo}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/** Sempre "resolve" na hora, sem checar token nenhum — não há domínio real por trás. */
export async function resolveHostToken({
  hostSlug,
}: {
  baseUrl: string;
  hostSlug: string;
  hostId?: string;
  tokens: TokenDeDominio[];
}): Promise<{ hostId: string; hostToken: string; dominio: string }> {
  return { hostId: idFicticio(`host-${hostSlug || "demo"}`), hostToken: idFicticio("token"), dominio: "demo" };
}

/** Cria uma conversa fictícia — só um id, sem nenhuma chamada de rede. */
export async function createConversation(_: {
  baseUrl: string;
  hostId: string;
  hostToken: string;
  subSlug?: string | null;
}): Promise<string> {
  return idFicticio("demo-conversa");
}

function escolher<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function trechoCurto(texto: string, max = 60): string {
  const limpo = String(texto || "").replace(/\s+/g, " ").trim();
  return limpo.length > max ? limpo.slice(0, max).trim() + "…" : limpo;
}

/** A última palavra com mais de 4 letras do critério — o "gancho" que a resposta fictícia ecoa. */
function palavraChaveDoCriterio(criterio: string): string | null {
  const palavras = String(criterio || "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.replace(/[^\p{L}]/gu, "").length > 4);
  return palavras.length ? palavras[palavras.length - 1] : null;
}

const ABERTURAS_AVATAR = [
  "Olá! Tudo bem? Já estou por aqui, me conta com calma o que você precisa.",
  "Oi! Claro, posso te ajudar com isso. Pode me dar mais detalhes?",
  "Olá! Vamos resolver isso juntos — me explica um pouco melhor a situação.",
  "Oi, tudo certo? Fico à disposição, é só me contar o que está acontecendo.",
];

const RETOMADAS_AVATAR = [
  (t: string) => `Entendi. Sobre "${t}", só um instante que já verifico aqui.`,
  (t: string) => `Certo, anotei sobre "${t}" — deixa eu confirmar uma informação antes de continuar.`,
  (t: string) => `Perfeito. Sobre "${t}", pode me confirmar mais um dado pra eu seguir com o atendimento?`,
  (t: string) => `Entendido. Já estou olhando "${t}" aqui do meu lado.`,
];

/**
 * Respostas SEM citar a fala da pessoa — usadas alternadamente com as acima
 * pra dar variedade lexical entre turnos. Sem isso, a mesma frase entre
 * aspas repetida turno a turno dispara sozinha a heurística de loop (Jaccard
 * alto entre respostas consecutivas), que existe pra pegar exatamente esse
 * tipo de repetição — e faria a demo "travar" cedo demais em conversas sem
 * critério de sucesso definido.
 */
const RETOMADAS_AVATAR_GENERICAS = [
  "Deixa eu verificar isso com calma aqui do meu lado, só um momento.",
  "Certo, estou processando essa informação agora.",
  "Entendido, um instante enquanto confirmo os detalhes daqui.",
  "Perfeito, já estou olhando isso pra você.",
  "Combinado, deixa eu registrar isso no sistema aqui.",
  "Sem problemas, só preciso confirmar mais um detalhe antes de seguir.",
];

export interface ContextoRespostaFicticia {
  /** O que a pessoa simulada acabou de mandar. */
  question: string;
  cenario: string;
  criterioSucesso: string;
  /** Número do turno atual (1 = a resposta do avatar à mensagem de abertura). */
  turno: number;
  /** Se este turno foi sorteado pra "resolver" o critério — decidido fora daqui. */
  resolverAgora: boolean;
}

/**
 * Monta a fala fictícia do avatar (o "atendimento") pra este turno. Nunca
 * chama nenhuma API: usa só o texto que a pessoa digitou (cenário, critério
 * de sucesso, o que foi perguntado) pra soar como uma resposta de verdade,
 * ainda que 100% inventada.
 */
export function gerarRespostaAvatarFicticia(ctx: ContextoRespostaFicticia): string {
  if (ctx.turno <= 1) {
    return escolher(ABERTURAS_AVATAR);
  }

  if (ctx.resolverAgora && ctx.criterioSucesso.trim()) {
    const chave = palavraChaveDoCriterio(ctx.criterioSucesso);
    return chave
      ? `Consegui resolver isso pra você — sobre ${chave}, já está tudo certo agora. ${trechoCurto(
          ctx.criterioSucesso,
          100
        )}`
      : `Prontinho, já resolvi sua solicitação: ${trechoCurto(ctx.criterioSucesso, 100)}`;
  }

  // Alterna entre citar a fala da pessoa e uma resposta genérica de
  // acompanhamento — ver comentário de RETOMADAS_AVATAR_GENERICAS. A escolha
  // dentro de cada grupo CICLA pelo turno (em vez de sortear) pra nunca
  // repetir a mesma frase duas vezes numa conversa de até 10 turnos — um
  // texto idêntico entre turnos é o que dispara a heurística de loop.
  if (ctx.turno % 2 === 0) {
    return RETOMADAS_AVATAR_GENERICAS[Math.floor(ctx.turno / 2) % RETOMADAS_AVATAR_GENERICAS.length];
  }
  const template = RETOMADAS_AVATAR[Math.floor(ctx.turno / 2) % RETOMADAS_AVATAR.length];
  return template(trechoCurto(ctx.question, 40));
}

/**
 * Sentimento/resumo da conversa — no motor original vinha da Tolky
 * (conversations/getConversationInformation). Aqui é sempre fabricado
 * localmente e o resumo deixa claro que é fictício.
 */
export async function getConversationInformation(_: {
  baseUrl: string;
  hostToken: string;
  conversationId: string;
}): Promise<{ dialogue_summary: string; sentiment_score: number; heat_score: number }> {
  return {
    dialogue_summary:
      "Resumo fictício de demonstração — esta conversa não aconteceu de verdade, nenhuma chamada foi feita à Tolky.",
    sentiment_score: Math.round((0.55 + Math.random() * 0.4) * 100) / 100,
    heat_score: Math.round(Math.random() * 20) / 100,
  };
}
