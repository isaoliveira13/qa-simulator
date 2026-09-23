export type Framework = "playwright" | "cypress";

export interface ScheduleConfig {
    /** Se o agendamento automatico esta ativo. */
  enabled: boolean;
    /** Horario local (America/Sao_Paulo) no formato HH:mm. */
  time: string;
    /** Dias da semana em que roda: 0=domingo ... 6=sabado. */
  days: number[];
}

export interface Suite {
    /** Identificador unico (uuid) da suite. */
  id: string;
    /** Nome escolhido pelo usuario (ex.: "Regressão de onboarding"). */
  name: string;
    /**
     * Ids dos scripts que fazem parte da suite, JA NA ORDEM da sequencia
     * (posicao 0 = primeiro a rodar). A suite e uma sequencia, nao um saco de
     * scripts: e por isso que ordens diferentes (ABC numa suite, ACB noutra)
     * convivem sem mexer na ordem manual da Biblioteca (ScriptEntry.ordem),
     * que continua sendo uma so.
     */
  scriptIds: string[];
    /**
     * Etiquetas da suite, do mesmo catalogo de /tags usado pelos scripts
     * (guardamos so o nome; a cor vem da tabela tags).
     */
  tags: string[];
    /** Data de criacao (ISO). */
  createdAt: string;
}

export interface Execution {
    /** Identificador unico (uuid) do registro. */
  id: string;
    /** Id do script executado, se ainda existir. */
  scriptId?: string;
    /** Id da suite, se a execucao fez parte de uma "Rodar suite". */
  suiteId?: string;
    /** Resultado marcado manualmente. */
  status: "passed" | "failed";
    /** Data/hora do registro (ISO). */
  executedAt: string;
    /** Observacao livre opcional. */
  note?: string;
}

export interface Draft {
    /** Identificador unico (slug) do rascunho. */
  id: string;
  name: string;
  avatar: string;
  ambiente: string;
  cenario: string;
  tela?: string;
  tags: string[];
  framework: Framework;
    /** Conteudo atual (ultima versao salva). */
  content: string;
  createdAt: string;
  updatedAt: string;
    /** Quantas versoes ja foram salvas (pra mostrar na lista sem buscar tudo). */
  versionCount?: number;
}

export interface DraftVersion {
  id: string;
  draftId: string;
  content: string;
  createdAt: string;
}

export interface Tag {
    /** Nome de exibicao da tag. */
  name: string;
    /** Cor em hex (ex.: "#6366f1") usada para destacar a tag na interface. */
  color: string;
}

export interface ScriptEntry {
    /** Identificador unico (slug) do script. */
  id: string;
    /** Nome amigavel escolhido por voce. */
  name: string;
    /** Ex.: "Bot A", "Bot B". Livre - voce digita o que quiser. */
  avatar: string;
    /** Ex.: "hml", "stg", "prod". Livre - voce digita o que quiser. */
  ambiente: string;
    /** Ex.: "Mensagem do gestor". Descricao do cenario testado. */
  cenario: string;
    /** Tela do CRM que o script cobre (ex.: "Conversas", "Tickets"). Opcional por enquanto. */
  tela?: string;
    /** Tags livres adicionais para busca. */
  tags: string[];
    /** Framework do script. */
  framework: Framework;
    /** Caminho do arquivo dentro do repositorio. */
  path: string;
    /** Data de criacao (ISO). */
  createdAt: string;
    /** Caminho/URL do anexo do script, se houver (nesta demo, uma data URL local). */
  attachmentPath?: string;
    /** Agendamento de execucao automatica, se configurado. */
  schedule?: ScheduleConfig;
    /**
     * Posicao manual do card na Biblioteca (e no Checklist, que segue a mesma
     * ordem) — maior valor aparece primeiro. Arrastar um card recalcula so o
     * dele (media entre os vizinhos na tela); nasce com epoch de created_at,
     * entao um script nunca reordenado mantem a leitura "mais novo primeiro".
     */
  ordem: number;
}

/**
 * Item do checklist de cobertura de uma tela do CRM. A aba "Cobertura por
 * tela" mede "itens marcados ÷ total de itens cadastrados" — cada tela tem
 * seu checklist, e a meta é a própria quantidade de itens (5 marcados de 10 =
 * 50%).
 *
 * Entidade própria, mais leve que um script: só nome + etiquetas, sem
 * conteúdo — o cadastro acontece no card da tela, em dois campos. `tela` é o
 * rótulo de lib/telas.ts. Etiquetas usam o mesmo catálogo dos scripts
 * (Tag / app/api/tags).
 */
export interface CoverageItem {
  id: string;
  tela: string;
  nome: string;
  tags: string[];
  feito: boolean;
  createdAt: string;
}

/**
 * Filtro salvo: a combinação de blocos/grupos de etiqueta montada na barra de
 * filtros + o termo da busca, guardada com um nome pra ser reaplicada num
 * clique. Guarda a barra de filtros inteira: etiqueta, avatar, ambiente e o
 * termo da busca. Os três filtros são MultiFilter de lib/filters.ts
 * (blocos > grupos), serializados. `avatarFilter`/`ambienteFilter` são
 * opcionais só por causa dos presets criados antes deles entrarem no escopo.
 */
export interface SavedFilter {
  id: string;
  nome: string;
  tagFilter: import("./filters").MultiFilter;
  avatarFilter?: import("./filters").MultiFilter;
  ambienteFilter?: import("./filters").MultiFilter;
  busca: string;
  createdAt: string;
}
