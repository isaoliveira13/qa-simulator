/**
 * Mapa de destinos do Avatar IA: a traducao entre os rotulos que aparecem na
 * tela ("hml", "isa") e a configuracao tecnica que realmente aponta a conversa
 * pra algum lugar (baseUrl da API da Zenta, host slug, sub slug).
 *
 * Fonte unica lida pelo switch de destino do card
 * (components/destino-switch.tsx) e pela etapa 5 do assistente
 * (components/simulacao-wizard.tsx) — os dois escrevem a MESMA configuracao
 * da mesma simulacao, que e o que impede "hml" e "HML" de virarem duas
 * coisas. Desde 28/08/2026 os avatares vem da tabela `avatars` (aba "Avatares"), nao
 * mais de uma constante: acrescentar um avatar ou subavatar e cadastro pela
 * tela. Os AMBIENTES continuam fixos aqui — sao as tres APIs que a Zenta tem.
 */

export type ApiAmbiente = "prod" | "stage" | "homolog";

/** URLs fixas da API da Zenta por ambiente (mesmo mapeamento do assistente). */
export const AMBIENTES_ZENTA: Record<ApiAmbiente, string> = {
  prod: "https://api.zenta.to",
  stage: "https://api-stg.zenta.to",
  homolog: "https://api-hml.zenta.to",
};

export interface AmbienteDestino {
  /** Rotulo usado no cadastro da simulacao e mostrado na trilha. */
  nome: string;
  /** Qual das tres APIs da Zenta esse rotulo significa. */
  api: ApiAmbiente;
  /**
   * Prefixo do host onde a CONVERSA com o avatar acontece — a outra metade
   * do que um ambiente significa. Producao nao tem prefixo (zenta.to),
   * homologacao e "hml." e staging e "beta." (mesmo padrao dos specs
   * Playwright: v2.gestao / v2.hml.gestao / v2.beta.gestao).
   */
  prefixoConversa: string;
}

/**
 * Nao e uma lista que cresce: sao as tres APIs que a Zenta tem.
 * Se um dia surgir um ambiente novo, e uma linha aqui.
 */
export const AMBIENTES: AmbienteDestino[] = [
  { nome: "hml", api: "homolog", prefixoConversa: "hml." },
  { nome: "stg", api: "stage", prefixoConversa: "beta." },
  { nome: "prod", api: "prod", prefixoConversa: "" },
];

export interface SubavatarDestino {
  /** Rotulo curto do subavatar, mostrado grudado no pai ("suporte"). */
  nome: string;
  /** Sub slug repassado pro coisasdaisa. */
  subSlug: string;
}

export interface AvatarDestino {
  /** Rotulo usado no cadastro da simulacao ("isa"). */
  nome: string;
  /** Host slug na Zenta. */
  hostSlug: string;
  /** Subavatares: moram dentro do pai, mesmo hostSlug, subSlug proprio. */
  subs: SubavatarDestino[];
  /**
   * Liga/desliga da aba "Avatares" (03/09/2026). `false` tira o avatar da lista
   * do switch — ele continua cadastrado, so nao e opcao pra rodar ate ser
   * reativado. Ausente conta como ativo (semente e cadastros antigos).
   */
  ativo?: boolean;
}

/**
 * Os avatares que estavam fixos aqui ate 28/08/2026. Deixaram de ser a lista:
 * agora existe a aba "Avatares" e a tabela `avatars`, e todas as funcoes
 * abaixo recebem a lista de fora (`avatares: AvatarDestino[]`).
 *
 * Isto aqui sobrou como a SEMENTE — e o que a migracao
 * db/migracoes/2026-08-28-aba-avatares.sql insere no banco na primeira vez —
 * e como rede: uma tela que ainda nao carregou a lista passa uma lista vazia
 * e nada quebra, so nao aparece opcao nenhuma ate a resposta chegar.
 */
export const AVATARES_PADRAO: AvatarDestino[] = [
  { nome: "isa", hostSlug: "isa", subs: [] },
  { nome: "isabella", hostSlug: "isabella", subs: [] },
  { nome: "clienteexemplo", hostSlug: "clienteexemplo", subs: [] },
];

export function baseUrlDoAmbiente(nome: string): string | null {
  const amb = AMBIENTES.find((a) => a.nome.toLowerCase() === nome.trim().toLowerCase());
  return amb ? AMBIENTES_ZENTA[amb.api] : null;
}

/**
 * baseUrl do jeito que o cadastro grava: producao fica como null (o
 * coisasdaisa ja usa a API de producao por padrao), os outros gravam a URL.
 * Mesmo criterio do assistente em components/simulacao-wizard.tsx.
 */
export function ambienteConhecido(nome: string): boolean {
  return AMBIENTES.some((a) => a.nome.toLowerCase() === nome.trim().toLowerCase());
}

export function baseUrlParaSalvar(nomeAmbiente: string): string | null {
  const amb = AMBIENTES.find((a) => a.nome.toLowerCase() === nomeAmbiente.trim().toLowerCase());
  if (!amb || amb.api === "prod") return null;
  return AMBIENTES_ZENTA[amb.api];
}

export function avatarPorNome(nome: string, avatares: AvatarDestino[]): AvatarDestino | null {
  const alvo = nome.trim().toLowerCase();
  return avatares.find((a) => a.nome.toLowerCase() === alvo) ?? null;
}

/**
 * Os subavatares de um avatar, pelo rotulo. Usado na etapa 5 do assistente
 * pra oferecer a lista de subavatar do avatar escolhido — e o unico lugar da
 * tela onde subavatar aparece. No switch do card, nunca: la so tem avatar.
 */
export function subavataresDe(nome: string, avatares: AvatarDestino[]): SubavatarDestino[] {
  return avatarPorNome(nome, avatares)?.subs ?? [];
}

/**
 * Junta a lista conhecida com os rotulos que ja aparecem nas simulacoes
 * salvas, preservando a ordem do mapa e jogando os desconhecidos no fim.
 * Assim nenhum cadastro antigo some da trilha, e um destino novo aparece
 * (vazio) em todos os cards no dia em que entra no mapa.
 */
export function ambientesConhecidos(usados: string[]): string[] {
  const doMapa = AMBIENTES.map((a) => a.nome);
  const extras = usados
    .map((u) => u.trim())
    .filter((u) => u && !doMapa.some((m) => m.toLowerCase() === u.toLowerCase()));
  return [...doMapa, ...Array.from(new Set(extras)).sort()];
}

/** Uma entrada da lista de avatares do switch. */
export interface AvatarTrilhaItem {
  /** Rotulo mostrado na pilula ("isa"). */
  label: string;
  /** Valor comparado com AvatarTest.avatar. */
  valor: string;
  /**
   * Sobrou de quando subavatar aparecia no switch (ate 28/08/2026). Hoje e
   * sempre false para o que vem do cadastro; so um rotulo antigo no formato
   * "pai/filho", ainda salvo em alguma simulacao, chega marcado.
   */
  sub: boolean;
}

/**
 * A lista de avatares do switch: o que esta cadastrado na aba "Avatares",
 * mais qualquer rotulo que ja apareca nas simulacoes salvas e ainda nao tenha
 * cadastro (rede pra nada sumir de um card enquanto a migracao nao rodou, ou
 * se um cadastro for apagado com uma simulacao ainda apontada pra ele).
 *
 * **Subavatar nao entra aqui** — decisao de Isa em 28/08/2026: o switch e a
 * lista dos avatares, e escolher subavatar acontece no assistente. Antes esta
 * funcao achatava avatar + subavatares numa fileira so.
 */
export function avataresConhecidos(
  usados: string[],
  avatares: AvatarDestino[]
): AvatarTrilhaItem[] {
  const itens: AvatarTrilhaItem[] = avatares
    // Desativado na aba "Avatares" nao entra: e exatamente o que o liga/desliga
    // faz — o avatar deixa de ser opcao pra rodar sem perder o cadastro.
    .filter((av) => av.ativo !== false)
    .map((av) => ({ label: av.nome, valor: av.nome, sub: false }));
  // A rede dos rotulos ja usados nunca pode ressuscitar um avatar desativado:
  // se ele esta cadastrado (ligado ou desligado), quem manda e o cadastro.
  const cadastrados = new Set(avatares.map((av) => av.nome.trim().toLowerCase()));
  const extras = Array.from(
    new Set(
      usados
        .map((u) => u.trim())
        .filter((u) => u && !cadastrados.has(nomePaiDoAvatar(u)) && !cadastrados.has(u.toLowerCase()))
    )
  ).sort();
  for (const e of extras) {
    itens.push({ label: e, valor: e, sub: e.includes("/") });
  }
  return itens;
}

/** "clienteexemplo/suporte" -> "clienteexemplo". Rotulo simples volta ele mesmo. */
function nomePaiDoAvatar(valor: string): string {
  return valor.trim().toLowerCase().split("/")[0].trim();
}

/**
 * O rotulo aponta pra um avatar cadastrado que esta DESLIGADO? Serve pro card
 * explicar por que aquela simulacao nao pode rodar agora: o avatar dela nao
 * sumiu nem foi apagado, so esta desativado na aba "Avatares".
 *
 * Rotulo que nao tem cadastro nenhum (texto antigo, avatar apagado) devolve
 * false — ali o motivo e outro, e o switch continua mostrando ele como opcao.
 */
export function avatarDesativado(valor: string, avatares: AvatarDestino[]): boolean {
  const pai = nomePaiDoAvatar(valor);
  if (!pai) return false;
  const cadastro = avatares.find((av) => av.nome.trim().toLowerCase() === pai);
  return !!cadastro && cadastro.ativo === false;
}

/**
 * Chave da "familia": ignora caixa, acento, espaco repetido e o sufixo "_2"
 * que a duplicacao coloca.
 *
 * Nao e mais usada pela tela: desde 25/08/2026 uma simulacao e uma linha so e
 * ambiente/avatar sao configuracao dela, entao nao ha familia pra reunir. Fica
 * aqui como a regra que a migracao de merge aplicou
 * (db/migracoes/2026-08-25-uma-simulacao-por-familia.sql), caso precise ser
 * conferida ou repetida.
 */
export function chaveFamilia(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/_\d+$/, "")
    .replace(/\s+/g, " ");
}

/**
 * Config tecnica de um valor da trilha de avatares: "isa" devolve o host do
 * avatar; "isa/suporte" devolve o host do pai com o subSlug do filho.
 * Devolve null quando o rotulo nao esta no mapa (cadastro antigo, texto livre).
 */
export function configDoAvatar(
  valor: string,
  avatares: AvatarDestino[]
): { hostSlug: string; subSlug?: string } | null {
  const [paiNome, filhoNome] = valor.trim().toLowerCase().split("/");
  const pai = avatares.find((a) => a.nome.toLowerCase() === paiNome);
  if (!pai) return null;
  if (!filhoNome) return { hostSlug: pai.hostSlug };
  const filho = pai.subs.find((sv) => sv.nome.toLowerCase() === filhoNome);
  if (!filho) return null;
  return { hostSlug: pai.hostSlug, subSlug: filho.subSlug };
}

/**
 * Mesma coisa que configDoAvatar, mas nunca devolve null pra um rotulo
 * simples: um avatar que ainda nao esta no mapa vira host slug igual ao
 * proprio rotulo — que e a convencao da Zenta ("clienteexemplo" mora em
 * <ambiente>.zenta.to/clienteexemplo) e a mesma coisa que ela digitaria na etapa
 * 5 do assistente.
 *
 * Existe por causa de um bug real: o switch do card usava configDoAvatar
 * direto e, quando o rotulo nao estava no mapa, MANTINHA o host slug do
 * avatar anterior. A simulacao passava a dizer "avatar clienteexemplo" enquanto
 * continuava mandando host_slug do avatar velho pro motor — dando erro em
 * todas as pessoas do lote, em qualquer ambiente. Herdar o slug do avatar
 * anterior nunca esta certo: se o avatar mudou, o host mudou junto.
 *
 * Um valor de subavatar desconhecido ("pai/filho" fora do mapa) continua
 * devolvendo null: ali o slug nao da pra deduzir do rotulo, e mexer chutando
 * seria pior do que nao mexer.
 */
export function configDoAvatarOuRotulo(
  valor: string,
  avatares: AvatarDestino[]
): { hostSlug: string; subSlug?: string } | null {
  const doMapa = configDoAvatar(valor, avatares);
  if (doMapa) return doMapa;
  const limpo = valor.trim();
  if (!limpo || limpo.includes("/")) return null;
  return { hostSlug: limpo };
}

/**
 * Onde a conversa com o avatar acontece: ambiente + avatar viram um endereco.
 *
 *   hml  + clienteexemplo -> https://hml.zenta.to/clienteexemplo
 *   stg  + clienteexemplo -> https://beta.zenta.to/clienteexemplo
 *   prod + clienteexemplo -> https://zenta.to/clienteexemplo
 *
 * E a mesma coisa que AMBIENTES ja faz pro lado da API (api-hml.zenta.to),
 * so que pro lado da conversa. Ate aqui o mapa so sabia traduzir
 * ambiente -> API; quem sabia virar endereco de conversa era o coisasdaisa,
 * e por isso essa regra nao existia em lugar nenhum deste repo.
 *
 * Observacao pra quem for seguir o link: em producao, zenta.to/<slug>
 * responde 302 pra chat.zenta.to/<slug> (conferido em 27/08/2026). O
 * endereco canonico continua sendo o sem "chat." — e o que a pessoa digita e
 * o que o redirect resolve sozinho.
 *
 * Devolve null quando o ambiente nao esta no mapa (rotulo antigo, texto
 * livre): melhor nao mostrar endereco nenhum do que mostrar um inventado.
 */
export function urlDaConversa(
  nomeAmbiente: string,
  hostSlug: string,
  subSlug?: string | null
): string | null {
  const amb = AMBIENTES.find(
    (a) => a.nome.toLowerCase() === nomeAmbiente.trim().toLowerCase()
  );
  const slug = hostSlug.trim().replace(/^\/+|\/+$/g, "");
  if (!amb || !slug) return null;
  const sub = (subSlug || "").trim().replace(/^\/+|\/+$/g, "");
  return `https://${amb.prefixoConversa}zenta.to/${slug}${sub ? `/${sub}` : ""}`;
}
