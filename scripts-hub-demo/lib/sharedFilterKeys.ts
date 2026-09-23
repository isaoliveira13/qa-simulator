/**
 * Chaves de `sessionStorage` compartilhadas entre a Biblioteca (`/`) e o
 * Checklist (`/checklist`).
 *
 * As duas telas filtram exatamente o mesmo conjunto de scripts, com os mesmos
 * campos (avatar, ambiente, etiquetas, busca) — então elas usam a MESMA chave
 * de propósito: o filtro montado numa aba aparece já aplicado na outra ao
 * trocar de tela. Como o App Router remonta a página a cada navegação, o
 * `usePersistedState` re-hidrata a partir dessa chave e a sincronização
 * acontece sozinha, sem estado global nem contexto.
 *
 * Não use estas chaves em `/testes-avatar`: aquela tela filtra simulações, não
 * scripts, e o catálogo de avatares/ambientes/etiquetas pode não bater — um
 * filtro herdado da Biblioteca zeraria a lista sem explicação. Filtros que só
 * existem numa das telas (ex.: "sistema"/framework, exclusivo do Checklist)
 * continuam com chave própria daquela tela.
 */
export const SCRIPT_FILTER_KEYS = {
  avatar: "scripts:avatarFilter",
  ambiente: "scripts:ambienteFilter",
  tag: "scripts:tagFilter",
  search: "scripts:search",
} as const;
