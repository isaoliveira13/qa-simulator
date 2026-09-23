/** Operador lógico usado dentro de um grupo de filtro (avatar, ambiente, etiqueta). */
export type FilterOp = "AND" | "OR" | "NOT";

/** Operador usado para combinar grupos entre si e blocos entre si (E = interseção, OU = união). */
export type GroupsOp = "AND" | "OR";

/** Um grupo de valores combinados por um único operador (E / OU / Diferente de). */
export type FilterGroup = {
  values: string[];
  op: FilterOp;
};

/**
 * Um bloco de condições: vários grupos combinados entre si por `groupsOp`.
 * O bloco é a "sub-lista" do filtro — ex.: "(tem Documento E Imagem E Texto)
 * E (não tem Teste alternativo)".
 */
export type FilterBlock = {
  groups: FilterGroup[];
  groupsOp: GroupsOp;
};

/**
 * Filtro multi-seleção de uma aba, em dois níveis. Cada bloco combina seus
 * grupos por `groupsOp`, e `blocksOp` combina os blocos entre si — o que
 * permite montar, por exemplo:
 *
 *   (Documento E Imagem E Texto  E  ≠ Teste alternativo)
 *   OU
 *   (Campanha  E  ≠ Teste alternativo)
 *
 * ...impossível de expressar com um único nível de grupos.
 */
export type MultiFilter = {
  blocks: FilterBlock[];
  blocksOp: GroupsOp;
};

/** Formato antigo (um único nível de grupos), ainda presente em filtros persistidos no sessionStorage. */
type LegacyMultiFilter = {
  groups?: FilterGroup[];
  groupsOp?: GroupsOp;
  values?: string[];
  op?: FilterOp;
};

function emptyGroup(op: FilterOp = "OR"): FilterGroup {
  return { values: [], op };
}

function emptyBlock(op: FilterOp = "OR", groupsOp: GroupsOp = "AND"): FilterBlock {
  return { groups: [emptyGroup(op)], groupsOp };
}

/**
 * Converte qualquer formato já persistido para o formato atual de dois níveis.
 * Filtros salvos antes dos blocos existirem viram um bloco único com os grupos
 * que tinham; filtros ainda mais antigos (`{ values, op }`) viram um bloco com
 * um grupo só. Nunca devolve um filtro sem pelo menos um bloco com um grupo.
 */
export function normalizeFilter(filter: MultiFilter | LegacyMultiFilter | null | undefined): MultiFilter {
  if (!filter || typeof filter !== "object") return emptyFilter();

  const asNew = filter as MultiFilter;
  if (Array.isArray(asNew.blocks)) {
    const blocks = asNew.blocks
      .filter((b) => b && Array.isArray(b.groups))
      .map((b) => ({
        groups: b.groups.length > 0 ? b.groups : [emptyGroup("OR")],
        groupsOp: b.groupsOp ?? "AND",
      }));
    return { blocks: blocks.length > 0 ? blocks : [emptyBlock()], blocksOp: asNew.blocksOp ?? "OR" };
  }

  const legacy = filter as LegacyMultiFilter;
  if (Array.isArray(legacy.groups)) {
    return {
      blocks: [
        {
          groups: legacy.groups.length > 0 ? legacy.groups : [emptyGroup("OR")],
          groupsOp: legacy.groupsOp ?? "AND",
        },
      ],
      blocksOp: "OR",
    };
  }

  if (Array.isArray(legacy.values)) {
    return { blocks: [{ groups: [{ values: legacy.values, op: legacy.op ?? "OR" }], groupsOp: "AND" }], blocksOp: "OR" };
  }

  return emptyFilter();
}

/** Cria um filtro vazio: um bloco, um grupo, nenhum valor selecionado ainda. */
export function emptyFilter(op: FilterOp = "OR", groupsOp: GroupsOp = "AND"): MultiFilter {
  return { blocks: [emptyBlock(op, groupsOp)], blocksOp: "OR" };
}

/** Cria um filtro de um único valor — usado pelos cliques diretos da sidebar (pastas/subpastas). */
export function singleValueFilter(value: string, op: FilterOp = "OR"): MultiFilter {
  return { blocks: [{ groups: [{ values: [value], op }], groupsOp: "AND" }], blocksOp: "OR" };
}

function groupMatches(itemValues: string[], group: FilterGroup): boolean {
  if (group.values.length === 0) return true;
  switch (group.op) {
    case "AND":
      return group.values.every((v) => itemValues.includes(v));
    case "OR":
      return group.values.some((v) => itemValues.includes(v));
    case "NOT":
      return !group.values.some((v) => itemValues.includes(v));
  }
}

function blockMatches(itemValues: string[], block: FilterBlock): boolean {
  const activeGroups = block.groups.filter((g) => g.values.length > 0);
  if (activeGroups.length === 0) return true;
  if ((block.groupsOp ?? "AND") === "OR") {
    return activeGroups.some((g) => groupMatches(itemValues, g));
  }
  return activeGroups.every((g) => groupMatches(itemValues, g));
}

/**
 * Verifica se os valores do item batem com o filtro. Grupos e blocos sem
 * nenhum valor selecionado não restringem nada (ficam de fora da combinação),
 * então adicionar um bloco vazio nunca faz o filtro "vazar" no modo OU.
 */
export function matchesFilter(itemValues: string[], filter: MultiFilter): boolean {
  const f = normalizeFilter(filter);
  const activeBlocks = f.blocks.filter((b) => b.groups.some((g) => g.values.length > 0));
  if (activeBlocks.length === 0) return true;
  if ((f.blocksOp ?? "OR") === "AND") {
    return activeBlocks.every((b) => blockMatches(itemValues, b));
  }
  return activeBlocks.some((b) => blockMatches(itemValues, b));
}

function mapBlock(filter: MultiFilter, blockIndex: number, fn: (block: FilterBlock) => FilterBlock): MultiFilter {
  const f = normalizeFilter(filter);
  return { ...f, blocks: f.blocks.map((b, i) => (i === blockIndex ? fn(b) : b)) };
}

/** Alterna um valor dentro de um grupo específico de um bloco específico. */
export function toggleFilterValue(
  filter: MultiFilter,
  blockIndex: number,
  groupIndex: number,
  value: string
): MultiFilter {
  return mapBlock(filter, blockIndex, (block) => ({
    ...block,
    groups: block.groups.map((g, i) => {
      if (i !== groupIndex) return g;
      const values = g.values.includes(value) ? g.values.filter((v) => v !== value) : [...g.values, value];
      return { ...g, values };
    }),
  }));
}

/** Troca o operador (E / OU / Diferente de) de um grupo específico. */
export function setGroupOp(filter: MultiFilter, blockIndex: number, groupIndex: number, op: FilterOp): MultiFilter {
  return mapBlock(filter, blockIndex, (block) => ({
    ...block,
    groups: block.groups.map((g, i) => (i === groupIndex ? { ...g, op } : g)),
  }));
}

/** Troca como os grupos de um bloco se combinam entre si (E / OU). */
export function setGroupsOp(filter: MultiFilter, blockIndex: number, groupsOp: GroupsOp): MultiFilter {
  return mapBlock(filter, blockIndex, (block) => ({ ...block, groupsOp }));
}

/** Troca como os blocos se combinam entre si (E / OU). */
export function setBlocksOp(filter: MultiFilter, blocksOp: GroupsOp): MultiFilter {
  return { ...normalizeFilter(filter), blocksOp };
}

/** Adiciona um novo grupo vazio a um bloco. */
export function addFilterGroup(filter: MultiFilter, blockIndex: number, op: FilterOp = "OR"): MultiFilter {
  return mapBlock(filter, blockIndex, (block) => ({ ...block, groups: [...block.groups, emptyGroup(op)] }));
}

/** Remove um grupo de um bloco. O bloco sempre mantém pelo menos um grupo (vazio). */
export function removeFilterGroup(filter: MultiFilter, blockIndex: number, groupIndex: number): MultiFilter {
  return mapBlock(filter, blockIndex, (block) => {
    const groups = block.groups.filter((_, i) => i !== groupIndex);
    return { ...block, groups: groups.length > 0 ? groups : [emptyGroup("OR")] };
  });
}

/** Adiciona um novo bloco vazio ao filtro. */
export function addFilterBlock(filter: MultiFilter, op: FilterOp = "OR"): MultiFilter {
  const f = normalizeFilter(filter);
  return { ...f, blocks: [...f.blocks, emptyBlock(op)] };
}

/** Remove um bloco. O filtro sempre mantém pelo menos um bloco (vazio). */
export function removeFilterBlock(filter: MultiFilter, blockIndex: number): MultiFilter {
  const f = normalizeFilter(filter);
  const blocks = f.blocks.filter((_, i) => i !== blockIndex);
  return { ...f, blocks: blocks.length > 0 ? blocks : [emptyBlock("OR")] };
}

/** Conta total de valores selecionados em todos os grupos de todos os blocos. */
export function filterValueCount(filter: MultiFilter): number {
  return normalizeFilter(filter).blocks.reduce(
    (n, b) => n + b.groups.reduce((m, g) => m + g.values.length, 0),
    0
  );
}

/** Quantidade de blocos do filtro. */
export function filterBlockCount(filter: MultiFilter): number {
  return normalizeFilter(filter).blocks.length;
}

/** Verdadeiro quando o filtro está vazio (nenhum grupo com valor selecionado). */
export function isFilterEmpty(filter: MultiFilter): boolean {
  return filterValueCount(filter) === 0;
}

/**
 * Verdadeiro quando o filtro corresponde a um único valor selecionado num único
 * grupo de um único bloco, em modo E/OU (ex.: clique direto numa pasta da sidebar).
 */
export function isSingleActive(filter: MultiFilter, value: string): boolean {
  const f = normalizeFilter(filter);
  if (f.blocks.length !== 1) return false;
  const group = f.blocks[0].groups[0];
  return (
    f.blocks[0].groups.length === 1 &&
    group.op !== "NOT" &&
    group.values.length === 1 &&
    group.values[0] === value
  );
}
