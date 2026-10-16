/**
 * Prioridade por ambiente (13/10/2026).
 *
 * Regra da Isa: a prioridade NAO e etiqueta. Sao duas informacoes que moram
 * em lugares diferentes:
 *
 * - NIVEL (1, 2 ou 3): pertence ao teste. Um script de nivel 2 em HML e nivel
 *   2 no equivalente de PROD (e no mesmo teste de outro avatar) — por isso o
 *   nivel e guardado pela FAMILIA do script (nome sem o prefixo de ambiente e
 *   sem o avatar), nunca por linha. Simulacao do
 *   Avatar IA ja e uma linha so pra todos os ambientes, entao o nivel e dela.
 * - PESO DO AMBIENTE: regra fixa. PROD > HML = STG. Vem do ambiente do script
 *   (ou do destino escolhido no switch da simulacao); ninguem marca nada.
 *
 * Os dois juntos dao a CRITICIDADE (1 = mais critico ... 6 = menos), que e o
 * que ordena a lista e escolhe o tom de calor do selo. Ordem escolhida pela
 * Isa: AMBIENTE PRIMEIRO — todo PROD vem antes de HML/STG.
 *
 *   1 PROD·1   2 PROD·2   3 PROD·3   4 HML/STG·1   5 HML/STG·2   6 HML/STG·3
 *
 * Ambiente fora de HML/STG/PROD fica FORA da regra: o nivel aparece no selo,
 * mas sem tom de calor, e na ordenacao ele vem depois dos seis degraus.
 */

export type Nivel = 1 | 2 | 3;
export const NIVEIS: Nivel[] = [1, 2, 3];

/** Peso de cada ambiente na regra. Ambiente que nao esta aqui fica fora. */
export const PESO_AMBIENTE: Record<string, 1 | 2> = {
  prod: 1,
  hml: 2,
  stg: 2,
};

export function pesoDoAmbiente(ambiente: string | undefined | null): 1 | 2 | null {
  return PESO_AMBIENTE[(ambiente || "").trim().toLowerCase()] ?? null;
}

export function ehNivel(v: unknown): v is Nivel {
  return v === 1 || v === 2 || v === 3;
}

/**
 * Criticidade de 1 a 6 (ambiente primeiro). `null` quando nao tem nivel ou
 * quando o ambiente esta fora da regra.
 */
export function criticidade(nivel: Nivel | null | undefined, ambiente: string): number | null {
  if (!nivel) return null;
  const peso = pesoDoAmbiente(ambiente);
  if (!peso) return null;
  return (peso - 1) * 3 + nivel;
}

/**
 * Chave de ordenacao: os seis degraus primeiro, depois quem tem nivel mas
 * esta num ambiente fora da regra (7, 8, 9), e por ultimo quem nao tem
 * prioridade (99). Dentro do mesmo degrau vale a ordem manual.
 */
export function chaveDeOrdem(nivel: Nivel | null | undefined, ambiente: string): number {
  if (!nivel) return 99;
  return criticidade(nivel, ambiente) ?? 6 + nivel;
}

/** Nome do grupo mostrado na lista ordenada por prioridade. */
export function rotuloDoGrupo(nivel: Nivel | null | undefined, ambiente: string): string {
  if (!nivel) return "Sem prioridade";
  const peso = pesoDoAmbiente(ambiente);
  const c = criticidade(nivel, ambiente);
  if (!peso || !c) return `${(ambiente || "sem ambiente").toUpperCase()} · nível ${nivel}`;
  return `${c}º · ${peso === 1 ? "PROD" : "HML/STG"} · nível ${nivel}`;
}

/** Valor usado no filtro "Prioridade" (FilterPopover). */
export const SEM_PRIORIDADE = "Sem prioridade";
export function rotuloDoFiltro(nivel: Nivel | null | undefined): string {
  return nivel ? `Nível ${nivel}` : SEM_PRIORIDADE;
}
export const OPCOES_FILTRO = ["Nível 1", "Nível 2", "Nível 3", SEM_PRIORIDADE];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Familia de um script: o nome sem o prefixo de ambiente e sem o avatar, em
 * minusculas e sem acento. Equivalentes compartilham o nivel:
 *   "HML_isa_campanha-template-imagem"       (avatar isa)      -> "campanha-template-imagem"
 *   "PROD_isa_campanha-template-imagem"      (avatar isa)      -> a mesma
 *   "STG_isabella_campanha-template-imagem"  (avatar isabella) -> a mesma
 * 13/10/2026: primeiro a familia ignorava so o ambiente; no mesmo dia a Isa
 * pediu pra ignorar o avatar tambem (mesmo teste em Isa e Isabella = mesmo
 * nivel). Chaves antigas ("script:isa_campanha...") foram convertidas por
 * db/migracoes/2026-10-13-prioridade-sem-avatar.sql.
 */
export function familiaDoScript(nome: string, avatar: string): string {
  const limpo = semAcento(nome.trim().toLowerCase()).replace(/^(hml|stg|prod)_/, "");
  const av = semAcento((avatar || "").trim().toLowerCase());
  if (av && limpo.startsWith(`${av}_`)) return limpo.slice(av.length + 1);
  return limpo;
}

/** Chave na tabela `prioridades` para um script (compartilhada pelos equivalentes). */
export function chaveDoScript(s: { name: string; avatar: string }): string {
  return `script:${familiaDoScript(s.name, s.avatar)}`;
}

/** Chave na tabela `prioridades` para uma suite. */
export function chaveDaSuite(id: string): string {
  return `suite:${id}`;
}

/**
 * Ambiente de uma SUITE (13/10/2026): a suite nao tem campo de ambiente, entao
 * ele vem das etiquetas dela — etiqueta "PROD" da o peso de PROD, "HML" ou
 * "STG" dao o peso de HML/STG. Se a suite tiver as duas, vale a mais
 * importante (PROD). Sem etiqueta de ambiente, devolve "" (fora da regra:
 * o nivel aparece sem tom de calor).
 */
export function ambienteDaSuite(tags: string[] | undefined | null): string {
  const t = (tags || []).map((x) => x.trim().toLowerCase());
  if (t.includes("prod")) return "prod";
  if (t.includes("hml")) return "hml";
  if (t.includes("stg")) return "stg";
  return "";
}

/** Chave na tabela `prioridades` para uma simulacao do Avatar IA. */
export function chaveDaSimulacao(id: string): string {
  return `simulacao:${id}`;
}

export type MapaPrioridades = Record<string, Nivel>;
