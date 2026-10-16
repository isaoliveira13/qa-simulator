/**
 * Hierarquia de scripts — pai e filhos (13/10/2026).
 *
 * Pedido da Isa: alguns scripts fazem tudo o que outros fazem. Ex.: o script
 * "documentos" cobre "documentos-documento-mover", "documentos-exclusao-em-massa"
 * etc. Na Biblioteca o pai e o que importa; os filhos ficam guardados dentro
 * dele, como pastas do computador (chevron abre e fecha).
 *
 * A relacao e pela FAMILIA do script (lib/prioridade.ts: nome sem o
 * "AMBIENTE_avatar_"), igual a prioridade — organizar uma vez vale pro mesmo
 * teste em HML, STG, PROD e nos dois avatares.
 *
 * De onde vem o pai de uma familia, nesta ordem:
 * 1. MANUAL — tabela `script_pais` (familia -> pai). Pai "" = "fica na raiz",
 *    desliga o automatico pra essa familia.
 * 2. AUTOMATICO pelo nome — a familia existente mais longa que seja o comeco
 *    do nome seguido de "-", "_" ou espaco, DESDE QUE esse comeco se repita em
 *    pelo menos 2 outros scripts (MIN_FILHOS_AUTO):
 *      "documentos-documento-mover" -> "documentos-documento" (se ele tiver 2+)
 *                                   -> senao "documentos"
 *    Por que o minimo de 2: nos testes da Isa ha pares como
 *    "gestor-enviando-imagem" e "gestor-enviando-imagem-e-texto" — o nome
 *    comeca igual, mas sao testes diferentes, nao pai e filho. Pai de verdade
 *    costuma ter varios filhos; um caso de filho unico se resolve na mao.
 *    Pai manual apontando pra uma familia que nao existe mais (script apagado)
 *    cai no automatico.
 *
 * 0. SO ESTE SCRIPT (13/10/2026, pedido da Isa) — chave "id:<id do script>"
 *    na mesma tabela. Vale so pra aquele avatar + ambiente e passa por cima
 *    das outras duas. Ex.: "STG_aurora_gestor-texto" dentro de
 *    "STG_aurora_gestor-geral" sem mexer no gestor-texto de HML/PROD/nimbus.
 *
 * Na tela o pai precisa estar no MESMO avatar e ambiente do filho. Se o pai
 * direto nao existe ali, sobe pro avo, e assim por diante; sem nenhum, o
 * filho aparece solto (na raiz) com a dica "dentro de ...".
 */

import { familiaDoScript } from "./prioridade";

export type MapaPais = Record<string, string>;

/** Chave de "so este script" na tabela script_pais. */
export function chaveDaLinha(id: string): string {
  return `id:${id}`;
}

function tem(mapa: MapaPais, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(mapa, k);
}

/**
 * Cadeia de ancestrais (familias, mais perto primeiro) de UM script: a escolha
 * "so este script" por cima da regra da familia.
 */
export function cadeiaDoScript(id: string, familia: string, arvore: Arvore, mapa: MapaPais): string[] {
  const k = chaveDaLinha(id);
  if (tem(mapa, k)) {
    const v = mapa[k];
    if (v === "") return [];
    if (v !== familia && arvore.pai.has(v)) return [v, ...ancestrais(v, arvore).filter((a) => a !== familia)];
  }
  return ancestrais(familia, arvore);
}

const SEPARADORES = new Set(["-", "_", " "]);

/** Quantos scripts com o nome comecando igual um pai precisa pra agrupar sozinho. */
export const MIN_FILHOS_AUTO = 2;

/** Comecos de nome (que tambem sao familias) dentro de `familia`, do mais longo pro mais curto. */
function prefixosExistentes(familia: string, familias: Set<string>): string[] {
  const out: string[] = [];
  for (let i = familia.length - 1; i > 0; i--) {
    if (!SEPARADORES.has(familia[i])) continue;
    const candidato = familia.slice(0, i);
    if (candidato !== familia && familias.has(candidato)) out.push(candidato);
  }
  return out;
}

/** Pra cada familia, quantas outras comecam com o nome dela + separador. */
function contarPorPrefixo(familias: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  familias.forEach((f) => prefixosExistentes(f, familias).forEach((p) => m.set(p, (m.get(p) ?? 0) + 1)));
  return m;
}

/** Pai pelo nome: o comeco mais longo que existe e tem MIN_FILHOS_AUTO ou mais. */
export function paiAutomatico(familia: string, familias: Set<string>, contagem = contarPorPrefixo(familias)): string | null {
  return prefixosExistentes(familia, familias).find((p) => (contagem.get(p) ?? 0) >= MIN_FILHOS_AUTO) ?? null;
}

export type Arvore = {
  /** pai efetivo de cada familia (null = raiz) */
  pai: Map<string, string | null>;
  /** filhos diretos de cada familia */
  filhos: Map<string, string[]>;
  /** de onde veio o pai: "manual" (tabela), "raiz" (manual sem pai) ou "auto" */
  origem: Map<string, "manual" | "raiz" | "auto">;
  /** o que o automatico daria (mesmo quando ha escolha manual) */
  auto: Map<string, string | null>;
};

/** Monta a arvore de familias (manual vence automatico; ciclos sao cortados). */
export function montarArvore(familiasLista: Iterable<string>, mapa: MapaPais): Arvore {
  const familias = new Set(familiasLista);
  const pai = new Map<string, string | null>();
  const origem = new Map<string, "manual" | "raiz" | "auto">();
  const auto = new Map<string, string | null>();
  const contagem = contarPorPrefixo(familias);

  familias.forEach((f) => {
    auto.set(f, paiAutomatico(f, familias, contagem));
    const manual = Object.prototype.hasOwnProperty.call(mapa, f) ? mapa[f] : undefined;
    if (manual === "") {
      pai.set(f, null);
      origem.set(f, "raiz");
    } else if (manual && manual !== f && familias.has(manual)) {
      pai.set(f, manual);
      origem.set(f, "manual");
    } else {
      pai.set(f, auto.get(f) ?? null);
      origem.set(f, "auto");
    }
  });

  // Corta ciclo (so da pra criar com pai manual mal feito): quem fecha o
  // ciclo vira raiz.
  familias.forEach((f) => {
    const vistos = new Set<string>([f]);
    let atual = pai.get(f) ?? null;
    let anterior = f;
    while (atual) {
      if (vistos.has(atual)) {
        pai.set(anterior, null);
        break;
      }
      vistos.add(atual);
      anterior = atual;
      atual = pai.get(atual) ?? null;
    }
  });

  const filhos = new Map<string, string[]>();
  pai.forEach((p, f) => {
    if (!p) return;
    filhos.set(p, [...(filhos.get(p) ?? []), f]);
  });

  return { pai, filhos, origem, auto };
}

/** Pai, avo, bisavo... (mais perto primeiro). */
export function ancestrais(familia: string, arvore: Arvore): string[] {
  const out: string[] = [];
  const vistos = new Set<string>([familia]);
  let atual = arvore.pai.get(familia) ?? null;
  while (atual && !vistos.has(atual)) {
    out.push(atual);
    vistos.add(atual);
    atual = arvore.pai.get(atual) ?? null;
  }
  return out;
}

/** Todos os filhos, netos... de uma familia (sem ela). */
export function descendentes(familia: string, arvore: Arvore): Set<string> {
  const out = new Set<string>();
  const fila = [...(arvore.filhos.get(familia) ?? [])];
  while (fila.length) {
    const f = fila.shift()!;
    if (out.has(f) || f === familia) continue;
    out.add(f);
    fila.push(...(arvore.filhos.get(f) ?? []));
  }
  return out;
}

/**
 * Arruma uma lista (ja filtrada e ordenada) em arvore pra tela. O pai de cada
 * item e o ancestral mais perto que esteja NA LISTA e no mesmo grupo
 * (avatar + ambiente). A ordem da lista e mantida entre irmaos.
 */
export type No<T> = { item: T; filhos: No<T>[]; /** ancestral fora da lista (so pra raiz solta) */ paiFora: string | null };

export function arrumarEmArvore<T>(
  lista: T[],
  arvore: Arvore,
  familiaDe: (x: T) => string,
  grupoDe: (x: T) => string,
  cadeiaDe: (x: T) => string[] = (x) => ancestrais(familiaDe(x), arvore)
): No<T>[] {
  const porChave = new Map<string, No<T>>();
  const nos = lista.map((item) => ({ item, filhos: [] as No<T>[], paiFora: null as string | null }));
  nos.forEach((n) => {
    const k = `${grupoDe(n.item)}|${familiaDe(n.item)}`;
    if (!porChave.has(k)) porChave.set(k, n);
  });

  const paiDe = new Map<No<T>, No<T> | null>();
  const cadeias = new Map<No<T>, string[]>();
  nos.forEach((n) => {
    const grupo = grupoDe(n.item);
    const cadeia = cadeiaDe(n.item);
    cadeias.set(n, cadeia);
    let pai: No<T> | null = null;
    for (const a of cadeia) {
      const cand = porChave.get(`${grupo}|${a}`);
      if (cand && cand !== n) {
        pai = cand;
        break;
      }
    }
    paiDe.set(n, pai);
  });

  // Corta ciclo entre scripts (A dentro de B e B dentro de A, so com escolha
  // "so este script" cruzada): quem fecha o ciclo vira raiz.
  nos.forEach((n) => {
    const vistos = new Set<No<T>>([n]);
    let anterior = n;
    let atual = paiDe.get(n) ?? null;
    while (atual) {
      if (vistos.has(atual)) {
        paiDe.set(anterior, null);
        break;
      }
      vistos.add(atual);
      anterior = atual;
      atual = paiDe.get(atual) ?? null;
    }
  });

  const raizes: No<T>[] = [];
  nos.forEach((n) => {
    const pai = paiDe.get(n) ?? null;
    if (pai) pai.filhos.push(n);
    else {
      n.paiFora = cadeias.get(n)?.[0] ?? null;
      raizes.push(n);
    }
  });
  return raizes;
}

/** Pra cada item: todos os que estao dentro dele (filhos, netos...). */
export function dentroDeCada<T>(raizes: No<T>[]): Map<T, T[]> {
  const m = new Map<T, T[]>();
  const coletar = (n: No<T>): T[] => {
    const abaixo: T[] = [];
    n.filhos.forEach((f) => {
      abaixo.push(f.item, ...coletar(f));
    });
    m.set(n.item, abaixo);
    return abaixo;
  };
  raizes.forEach(coletar);
  return m;
}

/** Pai de cada item na arvore (null = raiz). */
export function paiDeCada<T>(raizes: No<T>[]): Map<T, T | null> {
  const m = new Map<T, T | null>();
  const andar = (n: No<T>, pai: T | null) => {
    m.set(n.item, pai);
    n.filhos.forEach((f) => andar(f, n.item));
  };
  raizes.forEach((r) => andar(r, null));
  return m;
}

/** Quantos itens existem abaixo de um no (filhos, netos...). */
export function contarAbaixo<T>(no: No<T>): number {
  return no.filhos.reduce((acc, f) => acc + 1 + contarAbaixo(f), 0);
}

// ---------------------------------------------------------------------------
// Quem e FILHO (13/10/2026): o script tem um ancestral (pai, avo...) no MESMO
// avatar e ambiente. E a mesma regra da tela — e o filho que aparece guardado
// dentro de um pai. Um PROD cujo pai so existe em HML nao e filho em PROD
// (nada em PROD cobre ele), entao fica sem a etiqueta e entra normal no lote.

type ScriptBasico = { id: string; name: string; avatar: string; ambiente: string; tags: string[] };

function grupoDoScript(s: { avatar: string; ambiente: string }): string {
  return `${s.avatar.trim().toLowerCase()}|${s.ambiente.trim().toLowerCase()}`;
}

/** Arvore de TODOS os scripts (sem filtro), com a escolha "so este script". */
export function arvoreDosScripts<T extends { id: string; name: string; avatar: string; ambiente: string }>(
  scripts: T[],
  arvore: Arvore,
  mapa: MapaPais
): No<T>[] {
  const fam = (s: T) => familiaDoScript(s.name, s.avatar);
  return arrumarEmArvore(scripts, arvore, fam, grupoDoScript, (s) => cadeiaDoScript(s.id, fam(s), arvore, mapa));
}

/** Ids dos scripts que sao filhos (tem pai no mesmo avatar e ambiente). */
export function idsDosFilhos(scripts: ScriptBasico[], arvore: Arvore, mapa: MapaPais): Set<string> {
  const out = new Set<string>();
  paiDeCada(arvoreDosScripts(scripts, arvore, mapa)).forEach((pai, s) => {
    if (pai) out.add(s.id);
  });
  return out;
}

/** Nome padrao da etiqueta automatica (a Isa ja criou "Filho" no catalogo). */
export const ETIQUETA_FILHO = "Filho";

export function ehEtiquetaFilho(tag: string): boolean {
  return tag.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "filho";
}

/**
 * Etiqueta "Filho" automatica: quem e filho ganha, quem deixou de ser perde.
 * Devolve so os scripts que precisam mudar, com a lista final de etiquetas.
 * `nome` e a grafia do catalogo (casa sem ligar pra maiuscula/acento).
 */
export function corrigirEtiquetaFilho(
  scripts: ScriptBasico[],
  pais: MapaPais,
  nome: string = ETIQUETA_FILHO
): { id: string; tags: string[] }[] {
  const arvore = montarArvore(
    scripts.map((s) => familiaDoScript(s.name, s.avatar)),
    pais
  );
  const filhos = idsDosFilhos(scripts, arvore, pais);
  const out: { id: string; tags: string[] }[] = [];
  scripts.forEach((s) => {
    const tem = s.tags.filter(ehEtiquetaFilho);
    if (filhos.has(s.id)) {
      if (tem.length === 1 && tem[0] === nome) return;
      out.push({ id: s.id, tags: [...s.tags.filter((t) => !ehEtiquetaFilho(t)), nome] });
    } else if (tem.length > 0) {
      out.push({ id: s.id, tags: s.tags.filter((t) => !ehEtiquetaFilho(t)) });
    }
  });
  return out;
}
