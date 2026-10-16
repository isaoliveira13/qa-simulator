"use client";

import { Fragment, useEffect, useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { ScriptEntry, Suite, Tag } from "@/lib/types";
import { IconChevronRight, IconDots, IconExternalLink, IconGripVertical } from "./icons";
import { FilterPopover } from "@/components/filter-popover";
import { SelectPopover } from "@/components/select-popover";
import { emptyFilter, matchesFilter, MultiFilter } from "@/lib/filters";
import { SCRIPT_FILTER_KEYS } from "@/lib/sharedFilterKeys";
import { SavedFilters } from "@/components/saved-filters";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { TagQuickAdd } from "@/components/tag-quick-add";
import { usePersistedState } from "@/lib/usePersistedState";
// Montagem dos comandos de terminal (22/09/2026: saiu daqui pra lib porque a
// tela de Suites usa o mesmo comando, na ordem da sequencia).
import { buildBatchCommand, localCommand } from "@/lib/comandoLote";
// Prioridade por ambiente (13/10/2026) — ver lib/prioridade.ts.
import { PrioridadeSeletor } from "@/components/prioridade-seletor";
import { lerJson } from "@/lib/lerJson";
// Acoes em massa (13/10/2026): prioridade e etiquetas pra selecao toda.
import { EtiquetasEmMassa, PrioridadeEmMassa, SelecionarPorEtiqueta } from "@/components/acoes-em-massa";
import {
  chaveDeOrdem,
  chaveDoScript,
  familiaDoScript,
  MapaPrioridades,
  Nivel,
  OPCOES_FILTRO,
  rotuloDoFiltro,
  rotuloDoGrupo,
} from "@/lib/prioridade";
// Hierarquia pai/filhos (13/10/2026) — ver lib/hierarquia.ts.
import {
  ancestrais,
  arrumarEmArvore,
  arvoreDosScripts,
  cadeiaDoScript,
  chaveDaLinha,
  contarAbaixo,
  dentroDeCada,
  ehEtiquetaFilho,
  MapaPais,
  montarArvore,
  No,
  paiDeCada,
} from "@/lib/hierarquia";
import { AlcancePai, EscolherPaiModal } from "@/components/escolher-pai";
import { EscolherFilhosModal } from "@/components/escolher-filhos";

/** Familia do script (nome sem "AMBIENTE_avatar_") — base da prioridade e da hierarquia. */
function familiaDe(s: ScriptEntry): string {
  return familiaDoScript(s.name, s.avatar);
}

/** Pai e filho so ficam juntos na tela quando estao no mesmo avatar e ambiente. */
function grupoDe(s: ScriptEntry): string {
  return `${s.avatar.trim().toLowerCase()}|${s.ambiente.trim().toLowerCase()}`;
}

type Linha = {
  s: ScriptEntry;
  /** 0 = raiz, 1 = filho, 2 = neto... */
  profundidade: number;
  temFilhos: boolean;
  aberto: boolean;
  /** quantos scripts estao guardados abaixo (filhos, netos...) */
  qtdAbaixo: number;
  /** raiz solta cujo pai existe mas nao esta na lista (outro filtro/ambiente) */
  paiFora: string | null;
  /** id do pai na tela ("" = raiz) — arrastar so troca a ordem entre irmaos */
  irmaos: string;
  /** ultimo filho do pai (a linha-guia termina no "cotovelo") */
  ultimo: boolean;
};

/** Junta "HML", "STG", "PROD" em "HML, STG e PROD". */
function listaHumana(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}


export default function LibraryPage() {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [avatarFilter, setAvatarFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.avatar, emptyFilter("OR"));
  const [ambienteFilter, setAmbienteFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.ambiente, emptyFilter("OR"));
  const [search, setSearch] = usePersistedState(SCRIPT_FILTER_KEYS.search, "");

  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.tag, emptyFilter("AND"));

  // Prioridade por ambiente (13/10/2026): nivel por familia de script (os
  // equivalentes HML/STG/PROD compartilham), vindo de /api/prioridades.
  const [prioridades, setPrioridades] = useState<MapaPrioridades>({});
  const [prioFilter, setPrioFilter] = usePersistedState<MultiFilter>("biblioteca:prioridadeFilter", emptyFilter("OR"));
  // "" = ordem manual (arrastar); "prioridade" = criticidade, ambiente primeiro.
  const [ordenar, setOrdenar] = usePersistedState<string>("biblioteca:ordenar", "");
  const [salvandoPrioChave, setSalvandoPrioChave] = useState<string | null>(null);

  // Ver uma suíte na ordem dela (05/10/2026): escolhida uma suíte, a lista
  // mostra só os testes dela, na sequência configurada em /suites, com a
  // posição no card. Os outros filtros continuam valendo por cima. Chave
  // própria da Biblioteca (o Checklist não tem esse seletor).
  const [suites, setSuites] = useState<Suite[]>([]);
  const [suiteId, setSuiteId] = usePersistedState<string>("biblioteca:suiteId", "");

  const [localScript, setLocalScript] = useState<ScriptEntry | null>(null);
  const [optHeaded, setOptHeaded] = useState(true);
  const [optWorkers, setOptWorkers] = useState(false);
  const [workersCount, setWorkersCount] = useState(2);

  const [runMsg, setRunMsg] = useState<{ id: string; text: string; url?: string; ok: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScriptEntry | null>(null);

  // Cores reais cadastradas em /tags — indexadas por nome, pra pintar a
  // pílula da Biblioteca com a mesma cor que Isa escolheu lá (em vez do
  // hash fixo que existia antes).
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  // Catalogo completo (nome + cor) pro popover do "+" do card (04/09/2026) —
  // o mapa acima so guarda a cor, e o popover precisa da lista inteira.
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  // Script cuja etiqueta esta sendo salva agora pelo "+".
  const [salvandoTagsId, setSalvandoTagsId] = useState<string | null>(null);
  // Arrastar-soltar pra reordenar os cards (21/09/2026). dragId = card sendo
  // arrastado; dragOverId = card por baixo do cursor agora (so pra feedback
  // visual, a reordenacao mesmo so acontece no drop).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [actionsUrl, setActionsUrl] = useState<string | null>(null);

  // --- Seleção múltipla / rodar vários no terminal ---
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOptionsOpen, setBatchOptionsOpen] = useState(false);
  // Padrao ao iniciar uma selecao (14/10/2026): --workers=1 e --headed
  // ligados, sleep desligado. Volta a esse padrao toda vez que a selecao liga.
  const [batchSleep, setBatchSleep] = useState(false);
  const [batchSleepSeconds, setBatchSleepSeconds] = useState(10);
  const [batchWorkers, setBatchWorkers] = useState(true);
  const [batchHeaded, setBatchHeaded] = useState(true);
  const [batchCopied, setBatchCopied] = useState(false);
  // Acoes em massa (13/10/2026): resultado da ultima acao, com "Desfazer".
  const [emMassaMsg, setEmMassaMsg] = useState<{ texto: string; ok: boolean; desfazer?: () => void } | null>(null);
  const [aplicandoEmMassa, setAplicandoEmMassa] = useState(false);

  // Hierarquia pai/filhos (13/10/2026). paisManuais = o que a Isa organizou na
  // mao (familia -> pai, "" = raiz); o resto e automatico pelo nome. abertos =
  // scripts pai com o chevron aberto (fechado por padrao: o pai e o que
  // importa), guardado no navegador e compartilhado com a barra lateral.
  const [paisManuais, setPaisManuais] = useState<MapaPais>({});
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  // Scripts escolhidos pro modal "Colocar dentro de..." (um pelo menu do
  // card, varios pela barra de selecao).
  const [escolhaPai, setEscolhaPai] = useState<{ ids: string[] } | null>(null);
  // Script pai do modal "Adicionar filhos..." (caminho contrario, 13/10/2026).
  const [escolhaFilhos, setEscolhaFilhos] = useState<string | null>(null);
  // Modal "Informações" do menu de reticências (13/10/2026): cenário e em
  // quais suítes o script está, sem precisar abrir cada suíte pra procurar.
  const [infoScript, setInfoScript] = useState<ScriptEntry | null>(null);
  const [salvandoPai, setSalvandoPai] = useState(false);
  const [hierMsg, setHierMsg] = useState<string | null>(null);

  useEffect(() => {
    // Etiqueta "Filho" automatica (13/10/2026): ao abrir, o servidor acerta
    // quem e filho (pega o que ja existia antes da regra) em paralelo com a
    // lista; o que ele mudar e aplicado por cima da lista carregada.
    const sync = fetch("/api/hierarquia/sincronizar", { method: "POST" })
      .then((r) => lerJson(r))
      .then((d) => (Array.isArray(d.alterados) ? (d.alterados as { id: string; tags: string[] }[]) : []))
      .catch(() => [] as { id: string; tags: string[] }[]);
    fetch("/api/scripts")
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setScripts(data.scripts);
        const alterados = await sync;
        if (alterados.length > 0) aplicarTagsNaLista(alterados);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/prioridades", { cache: "no-store" })
      .then((r) => lerJson(r))
      .then((data) => {
        if (!data.error && data.prioridades) setPrioridades(data.prioridades);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/hierarquia", { cache: "no-store" })
      .then((r) => lerJson(r))
      .then((data) => {
        if (!data.error && data.pais) setPaisManuais(data.pais);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bibliotecaAbertos");
      if (raw) setAbertos(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/suites")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.suites)) setSuites(data.suites);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/actions-url")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && data.url) setActionsUrl(data.url);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) {
          const map: Record<string, string> = {};
          (data.tags as Tag[]).forEach((t) => {
            map[t.name] = t.color;
          });
          setTagColors(map);
          setAvailableTags(data.tags as Tag[]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".card-menu-wrap")) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  function gravarAbertos(next: Record<string, boolean>) {
    try {
      localStorage.setItem("bibliotecaAbertos", JSON.stringify(next));
    } catch {}
    return next;
  }

  function toggleAberto(id: string) {
    setAbertos((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return gravarAbertos(next);
    });
  }

  function abrirTodos(ids: string[], abrir: boolean) {
    setAbertos((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (abrir) next[id] = true;
        else delete next[id];
      });
      return gravarAbertos(next);
    });
  }

  // --- Hierarquia pai/filhos (13/10/2026) ---
  // arvore = familias (regra que vale pra todos os ambientes/avatares);
  // arvoreTodos = cada script de verdade, com a escolha "so este script" por
  // cima — e dela que sai quem esta dentro de quem.
  const arvore = useMemo(() => montarArvore(scripts.map(familiaDe), paisManuais), [scripts, paisManuais]);
  const cadeiaDe = (s: ScriptEntry) => cadeiaDoScript(s.id, familiaDe(s), arvore, paisManuais);
  const arvoreTodos = useMemo(() => arvoreDosScripts(scripts, arvore, paisManuais), [scripts, arvore, paisManuais]);
  const dentroDe = useMemo(() => dentroDeCada(arvoreTodos), [arvoreTodos]);
  const paiDaLinha = useMemo(() => paiDeCada(arvoreTodos), [arvoreTodos]);

  /** Scripts guardados dentro de `s` (filhos, netos...) no mesmo avatar e ambiente. */
  function scriptsDentro(s: ScriptEntry): ScriptEntry[] {
    return dentroDe.get(s) ?? [];
  }

  /** `lista` + tudo o que esta dentro de cada um, sem repetir. */
  function comOsDeDentro(lista: ScriptEntry[]): ScriptEntry[] {
    const vistos = new Set<string>();
    const out: ScriptEntry[] = [];
    lista.forEach((s) =>
      [s, ...scriptsDentro(s)].forEach((x) => {
        if (vistos.has(x.id)) return;
        vistos.add(x.id);
        out.push(x);
      })
    );
    return out;
  }

  /** Familias que estao dentro de algum script da familia `f` (em qualquer ambiente). */
  function familiasDentro(f: string): Set<string> {
    const out = new Set<string>();
    scripts.forEach((s) => {
      if (familiaDe(s) !== f) return;
      scriptsDentro(s).forEach((x) => {
        const d = familiaDe(x);
        if (d !== f) out.add(d);
      });
    });
    return out;
  }

  /**
   * Chaves de prioridade que mudam quando o nivel destas familias muda.
   * Regra da Isa (13/10/2026): o nivel do pai desce pros de dentro que estao
   * ACOMPANHANDO o pai (mesmo nivel que ele tinha, ou sem prioridade). Quem
   * tem nivel proprio (diferente do pai) fica como esta. Familia que tambem
   * esta na lista (selecionada) muda sempre.
   */
  function chavesQueMudam(familias: string[]): { chaves: string[]; comNivelProprio: number } {
    const lista = new Set(familias);
    const todas = new Set<string>(familias);
    const proprios = new Set<string>();
    const nivelDaFam = (f: string) => prioridades[`script:${f}`] ?? null;
    familias.forEach((f) => {
      const doPai = nivelDaFam(f);
      familiasDentro(f).forEach((d) => {
        if (lista.has(d)) return;
        const n = nivelDaFam(d);
        if (n === null || n === doPai) todas.add(d);
        else proprios.add(d);
      });
    });
    proprios.forEach((d) => {
      if (todas.has(d)) proprios.delete(d);
    });
    return { chaves: Array.from(todas).map((f) => `script:${f}`), comNivelProprio: proprios.size };
  }

  // Quem e filho (tem pai no mesmo avatar e ambiente) — mesma regra da
  // etiqueta "Filho" automatica e do "Tirar filhos da selecao".
  const idsFilhos = useMemo(() => {
    const out = new Set<string>();
    paiDaLinha.forEach((pai, s) => {
      if (pai) out.add(s.id);
    });
    return out;
  }, [paiDaLinha]);

  /** Onde cada familia existe, pro modal "Colocar dentro de...". */
  const ondeDaFamilia = useMemo(() => {
    const m = new Map<string, { ambs: Set<string>; avs: Set<string>; grupos: Set<string> }>();
    scripts.forEach((s) => {
      const f = familiaDe(s);
      const c = m.get(f) ?? { ambs: new Set<string>(), avs: new Set<string>(), grupos: new Set<string>() };
      c.ambs.add(s.ambiente.toUpperCase());
      c.avs.add(s.avatar);
      c.grupos.add(grupoDe(s));
      m.set(f, c);
    });
    return m;
  }, [scripts]);

  // "So este script" ou "todos os ambientes e avatares" (13/10/2026). Fica
  // lembrado no navegador; comeca em "so este script".
  const [alcancePai, setAlcancePaiState] = useState<AlcancePai>("linha");
  useEffect(() => {
    try {
      const v = localStorage.getItem("bibliotecaAlcancePai");
      if (v === "linha" || v === "familia") setAlcancePaiState(v);
    } catch {}
  }, []);
  function setAlcancePai(v: AlcancePai) {
    setAlcancePaiState(v);
    try {
      localStorage.setItem("bibliotecaAlcancePai", v);
    } catch {}
  }

  function abrirEscolhaPai(lista: ScriptEntry[]) {
    setMenuOpenId(null);
    const unicos = Array.from(new Map(lista.map((x) => [x.id, x])).values());
    if (unicos.length > 0) setEscolhaPai({ ids: unicos.map((x) => x.id) });
  }

  /** Grava o pai de varias chaves (familia, ou "id:<script>" pra so este script). */
  async function salvarPai(chaves: string[], pai: string | null) {
    const unicas = Array.from(new Set(chaves));
    const antes = paisManuais;
    setPaisManuais((prev) => {
      const next = { ...prev };
      unicas.forEach((f) => {
        if (pai === null) delete next[f];
        else next[f] = pai;
      });
      return next;
    });
    setSalvandoPai(true);
    setHierMsg(null);
    try {
      const res = await fetch("/api/hierarquia", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familias: unicas, pai }),
      });
      const data = await lerJson(res);
      if (data.error) throw new Error(data.error);
      // Etiqueta "Filho" acertada no servidor pra quem entrou/saiu de um pai.
      if (Array.isArray(data.alterados) && data.alterados.length > 0) aplicarTagsNaLista(data.alterados);
      setEscolhaPai(null);
      // Abre o pai escolhido pra ela ver o filho la dentro.
      if (pai) {
        const ids = scripts.filter((s) => familiaDe(s) === pai).map((s) => s.id);
        abrirTodos(ids, true);
      }
    } catch (e: any) {
      setPaisManuais(antes);
      setEscolhaPai(null);
      setHierMsg(`Não deu pra organizar: ${e.message || String(e)}`);
    } finally {
      setSalvandoPai(false);
    }
  }

  /**
   * "Adicionar filhos..." (13/10/2026): `adicionar` entram dentro de `paiFam`,
   * `remover` saem (ficam soltos na raiz, no mesmo alcance). As chaves sao
   * "id:<script>" (so este script) ou familias (todos os ambientes).
   */
  async function salvarFilhos(adicionar: string[], remover: string[], paiFam: string, abrirIds: string[]) {
    const antes = paisManuais;
    setPaisManuais((prev) => {
      const next = { ...prev };
      adicionar.forEach((k) => (next[k] = paiFam));
      remover.forEach((k) => (next[k] = ""));
      return next;
    });
    setSalvandoPai(true);
    setHierMsg(null);
    try {
      for (const [chaves, pai] of [
        [adicionar, paiFam],
        [remover, ""],
      ] as [string[], string][]) {
        if (chaves.length === 0) continue;
        const res = await fetch("/api/hierarquia", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familias: chaves, pai }),
        });
        const data = await lerJson(res);
        if (data.error) throw new Error(data.error);
        if (Array.isArray(data.alterados) && data.alterados.length > 0) aplicarTagsNaLista(data.alterados);
      }
      setEscolhaFilhos(null);
      if (adicionar.length > 0) abrirTodos(abrirIds, true);
    } catch (e: any) {
      // A primeira chamada pode ter passado: recarrega o que o banco tem.
      setPaisManuais(antes);
      fetch("/api/hierarquia", { cache: "no-store" })
        .then((r) => lerJson(r))
        .then((d) => {
          if (!d.error && d.pais) setPaisManuais(d.pais);
        })
        .catch(() => {});
      setEscolhaFilhos(null);
      setHierMsg(`Não deu pra organizar: ${e.message || String(e)}`);
    } finally {
      setSalvandoPai(false);
    }
  }

  const avatars = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.avatar))).sort(),
    [scripts]
  );
  const ambientes = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.ambiente))).sort(),
    [scripts]
  );
  const allTags = useMemo(
    () => Array.from(new Set(scripts.flatMap((s) => s.tags))).sort(),
    [scripts]
  );

  // Suíte escolhida (se ainda existir). Uma suíte apagada em outra aba some do
  // seletor e a lista volta ao normal sozinha.
  const suiteAtiva = suiteId ? suites.find((x) => x.id === suiteId) ?? null : null;
  // posição (1, 2, 3...) de cada script na suíte ativa
  const posNaSuite = useMemo(() => {
    const m = new Map<string, number>();
    suiteAtiva?.scriptIds.forEach((id, i) => {
      if (!m.has(id)) m.set(id, i + 1);
    });
    return m;
  }, [suiteAtiva]);

  // Com suíte: a base da lista são os testes dela, na ordem dela.
  const base: ScriptEntry[] = suiteAtiva
    ? (Array.from(posNaSuite.keys())
        .map((id) => scripts.find((s) => s.id === id))
        .filter(Boolean) as ScriptEntry[])
    : scripts;

  const nivelDe = (s: ScriptEntry): Nivel | null => prioridades[chaveDoScript(s)] ?? null;

  const filtered = base.filter((s) => {
    if (!matchesFilter([s.avatar], avatarFilter)) return false;
    if (!matchesFilter([rotuloDoFiltro(nivelDe(s))], prioFilter)) return false;
    if (!matchesFilter([s.ambiente], ambienteFilter)) return false;
    if (!matchesFilter(s.tags, tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${s.name} ${s.cenario} ${s.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Ordenado por prioridade: criticidade (ambiente primeiro) e, dentro do
  // mesmo degrau, a ordem manual de sempre. Com suite escolhida vale a ordem
  // da suite, e o arrastar fica desligado enquanto a lista nao e a manual.
  const porPrioridade = ordenar === "prioridade" && !suiteAtiva;
  const lista = porPrioridade
    ? [...filtered].sort(
        (a, b) => chaveDeOrdem(nivelDe(a), a.ambiente) - chaveDeOrdem(nivelDe(b), b.ambiente) || b.ordem - a.ordem
      )
    : filtered;
  // Hierarquia (13/10/2026): a lista vira arvore — filhos guardados dentro
  // do pai, fechados por padrao. Com suite escolhida fica plana (a ordem da
  // suite manda).
  const comHierarquia = !suiteAtiva;
  const raizes: No<ScriptEntry>[] = comHierarquia
    ? arrumarEmArvore(lista, arvore, familiaDe, grupoDe, cadeiaDe)
    : lista.map((item) => ({ item, filhos: [], paiFora: null }));
  const linhas: Linha[] = [];
  /** Ordem da tela contando tambem os filhos guardados em pai fechado. */
  const ordemDaTela: ScriptEntry[] = [];
  const idsComFilhos: string[] = [];
  const irmaosPorChave = new Map<string, ScriptEntry[]>();
  (function percorrer(nos: No<ScriptEntry>[], profundidade: number, irmaos: string, visivel: boolean) {
    irmaosPorChave.set(irmaos, nos.map((n) => n.item));
    nos.forEach((n, i) => {
      const temFilhos = n.filhos.length > 0;
      const aberto = temFilhos && !!abertos[n.item.id];
      if (temFilhos) idsComFilhos.push(n.item.id);
      ordemDaTela.push(n.item);
      if (visivel) {
        linhas.push({
          s: n.item,
          profundidade,
          temFilhos,
          aberto,
          qtdAbaixo: contarAbaixo(n),
          paiFora: n.paiFora,
          irmaos,
          ultimo: i === nos.length - 1,
        });
      }
      if (temFilhos) percorrer(n.filhos, profundidade + 1, n.item.id, visivel && aberto);
    });
  })(raizes, 0, "", true);
  /** O que esta na tela agora (filhos de pai fechado nao contam). */
  const visiveis = linhas.map((l) => l.s);
  const qtdGuardados = lista.length - raizes.length;
  const algumPai = idsComFilhos.length > 0;
  const irmaosDe = new Map(linhas.map((l) => [l.s.id, l.irmaos]));

  // Na ordem por prioridade, o divisor de grupo olha so as raizes (o filho
  // fica embaixo do pai mesmo com outro nivel).
  const qtdPorGrupo = new Map<number, number>();
  if (porPrioridade) {
    raizes.forEach(({ item: s }) => {
      const k = chaveDeOrdem(nivelDe(s), s.ambiente);
      qtdPorGrupo.set(k, (qtdPorGrupo.get(k) ?? 0) + 1);
    });
  }

  /** Avatares e ambientes dos scripts equivalentes (mesma familia), pro texto do menu. */
  function alcanceDoScript(s: ScriptEntry): string {
    const chave = chaveDoScript(s);
    const irmaos = scripts.filter((x) => chaveDoScript(x) === chave);
    const ambs = Array.from(new Set(irmaos.map((x) => x.ambiente.toUpperCase())));
    const avs = Array.from(new Set(irmaos.map((x) => x.avatar)));
    const base =
      irmaos.length <= 1
        ? "Vale para este script e os equivalentes que vierem"
        : avs.length > 1
          ? `Vale para ${listaHumana(avs)} em ${listaHumana(ambs)}`
          : `Vale para ${listaHumana(ambs)}`;
    // Hierarquia: o nivel do pai desce pros de dentro que acompanham o pai.
    const fam = familiaDe(s);
    if (familiasDentro(fam).size === 0) return base;
    const { chaves, comNivelProprio } = chavesQueMudam([fam]);
    const seguem = new Set(chaves.filter((c) => c !== `script:${fam}`));
    const qtd = scripts.filter((x) => seguem.has(chaveDoScript(x))).length;
    const proprio =
      comNivelProprio > 0
        ? ` (${comNivelProprio} com nível próprio ${comNivelProprio === 1 ? "fica como está" : "ficam como estão"})`
        : "";
    return qtd > 0
      ? `${base} · e para ${qtd} script${qtd === 1 ? "" : "s"} dentro dele${proprio}`
      : `${base}${proprio || " · os de dentro têm nível próprio e ficam como estão"}`;
  }

  // Troca o nivel da familia inteira. Otimista, como a etiqueta rapida.
  // Hierarquia (13/10/2026): se o script e pai, o nivel desce pras familias
  // dentro dele. Depois da pra mudar o filho sozinho (so a familia dele).
  async function mudarPrioridade(s: ScriptEntry, nivel: Nivel | null) {
    const chave = chaveDoScript(s);
    const { chaves } = chavesQueMudam([familiaDe(s)]);
    const antes = prioridades;
    setPrioridades((prev) => {
      const next = { ...prev };
      chaves.forEach((c) => {
        if (nivel) next[c] = nivel;
        else delete next[c];
      });
      return next;
    });
    setSalvandoPrioChave(chave);
    setRunMsg(null);
    try {
      const res = await fetch("/api/prioridades", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chaves.length > 1 ? { chaves, nivel } : { chave, nivel }),
      });
      const data = await lerJson(res);
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setPrioridades(antes);
      setRunMsg({ id: s.id, text: e.message || String(e), ok: false });
    } finally {
      setSalvandoPrioChave(null);
    }
  }

  // --- seleção múltipla: helpers ---
  function opcoesPadraoDaSelecao() {
    setBatchSleep(false);
    setBatchWorkers(true);
    setBatchHeaded(true);
  }

  function toggleSelectMode() {
    if (!selectMode) opcoesPadraoDaSelecao();
    setSelectMode((prev) => {
      if (prev) setSelectedIds([]);
      return !prev;
    });
    setEmMassaMsg(null);
  }

  // "Selecionar" no menu de reticencias do card (14/10/2026): liga o modo
  // de selecao ali mesmo, sem subir ate o "Selecionar varios", e ja marca
  // este card. Com o modo ligado, o mesmo item marca/desmarca o card.
  function selecionarPeloMenu(id: string) {
    setMenuOpenId(null);
    if (!selectMode) {
      opcoesPadraoDaSelecao();
      setSelectMode(true);
      setEmMassaMsg(null);
      setSelectedIds([id]);
      return;
    }
    toggleSelected(id);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      // So o que esta na tela: filho guardado em pai fechado fica de fora
      // (o pai ja roda tudo o que ele faz).
      const visibleIds = visiveis.map((s) => s.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  // O comando do "Selecionar varios" segue a ORDEM DA TELA (prioridade,
  // pai/filho, arrastar), nao a ordem em que os scripts vieram do banco
  // (13/10/2026). Selecionado que o filtro escondeu vai pro fim.
  const posNaTela = new Map(ordemDaTela.map((s, i) => [s.id, i]));
  const selectedScripts = scripts
    .filter((s) => selectedIds.includes(s.id))
    .sort(
      (a, b) =>
        (posNaTela.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posNaTela.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  const allVisibleSelected =
    visiveis.length > 0 && visiveis.every((s) => selectedIds.includes(s.id));

  // --- Acoes em massa (13/10/2026) ---
  // Pedido da Isa: a prioridade dos cenarios muda toda semana com o negocio,
  // entao a selecao inteira pode receber um nivel (e etiquetas) de uma vez.
  // O nivel continua sendo da FAMILIA (lib/prioridade.ts): mudar um HML muda
  // o PROD/STG equivalente e o mesmo teste no outro avatar — o menu avisa
  // quantos equivalentes fora da selecao vao junto.
  // Hierarquia (13/10/2026): pai selecionado leva junto as familias de dentro.
  const { chaves: chavesSelecionadas, comNivelProprio: proprioEmMassa } = chavesQueMudam(
    Array.from(new Set(selectedScripts.map(familiaDe)))
  );
  const filhosNaSelecao = selectedScripts.filter((s) => idsFilhos.has(s.id)).length;
  const chavesSet = new Set(chavesSelecionadas);
  const scriptsAfetados = scripts.filter((s) => chavesSet.has(chaveDoScript(s)));
  const foraDaSelecao = scriptsAfetados.filter((s) => !selectedIds.includes(s.id)).length;
  const alcanceEmMassa =
    foraDaSelecao > 0
      ? `Muda ${scriptsAfetados.length} scripts: os ${selectedScripts.length} selecionados + ${foraDaSelecao} equivalente${foraDaSelecao === 1 ? "" : "s"} ou script${foraDaSelecao === 1 ? "" : "s"} de dentro (mesmo teste em outro ambiente/avatar, ou guardado dentro de um pai)`
      : `Muda os ${selectedScripts.length} selecionados`;
  const alcanceEmMassaCompleto =
    proprioEmMassa > 0
      ? `${alcanceEmMassa} · ${proprioEmMassa} de dentro com nível próprio ${proprioEmMassa === 1 ? "fica como está" : "ficam como estão"}`
      : alcanceEmMassa;

  // Etiquetas presentes na lista visivel, com quantos ja estao selecionados.
  // "Visivel" = o que esta na tela (filho de pai fechado nao conta).
  const contagemEtiquetas = (() => {
    const m = new Map<string, { total: number; selecionados: number }>();
    visiveis.forEach((s) => {
      s.tags.forEach((t) => {
        const c = m.get(t) ?? { total: 0, selecionados: 0 };
        c.total += 1;
        if (selectedIds.includes(s.id)) c.selecionados += 1;
        m.set(t, c);
      });
    });
    return Array.from(m.entries()).map(([name, c]) => ({ name, color: tagColors[name], ...c }));
  })();

  /** Junta na selecao os scripts visiveis com a etiqueta (ou tira, se ja estao todos). */
  function selecionarPorEtiqueta(tag: string) {
    const ids = visiveis.filter((s) => s.tags.includes(tag)).map((s) => s.id);
    setSelectedIds((prev) => {
      const todos = ids.length > 0 && ids.every((id) => prev.includes(id));
      return todos ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
    });
  }

  async function gravarPrioridades(chaves: string[], nivel: Nivel | null) {
    const res = await fetch("/api/prioridades", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chaves, nivel }),
    });
    const data = await lerJson(res);
    if (data.error) throw new Error(data.error);
  }

  function aplicarNoMapa(mudancas: Record<string, Nivel | null>) {
    setPrioridades((prev) => {
      const next = { ...prev };
      Object.entries(mudancas).forEach(([chave, n]) => {
        if (n) next[chave] = n;
        else delete next[chave];
      });
      return next;
    });
  }

  function recarregarPrioridades() {
    fetch("/api/prioridades", { cache: "no-store" })
      .then((r) => lerJson(r))
      .then((data) => {
        if (!data.error && data.prioridades) setPrioridades(data.prioridades);
      })
      .catch(() => {});
  }

  async function aplicarPrioridadeEmMassa(nivel: Nivel | null) {
    const chaves = chavesSelecionadas;
    if (chaves.length === 0) return;
    const anteriores: Record<string, Nivel | null> = {};
    chaves.forEach((c) => (anteriores[c] = prioridades[c] ?? null));
    const novas: Record<string, Nivel | null> = {};
    chaves.forEach((c) => (novas[c] = nivel));
    const qtd = scriptsAfetados.length;

    aplicarNoMapa(novas);
    setAplicandoEmMassa(true);
    setEmMassaMsg(null);
    try {
      await gravarPrioridades(chaves, nivel);
      setEmMassaMsg({
        ok: true,
        texto: `${nivel ? `Nível ${nivel}` : "Sem prioridade"} aplicado em ${qtd} script${qtd === 1 ? "" : "s"}${
          foraDaSelecao > 0 ? ` (${foraDaSelecao} equivalente${foraDaSelecao === 1 ? "" : "s"} ou de dentro, fora da seleção)` : ""
        }.`,
        desfazer: () => desfazerPrioridades(anteriores),
      });
    } catch (e: any) {
      aplicarNoMapa(anteriores);
      setEmMassaMsg({ ok: false, texto: e.message || String(e) });
    } finally {
      setAplicandoEmMassa(false);
    }
  }

  // Volta cada familia pro nivel que tinha antes (agrupa por nivel: no maximo
  // 4 chamadas, uma por Nivel 1/2/3/sem).
  async function desfazerPrioridades(anteriores: Record<string, Nivel | null>) {
    const grupos = new Map<Nivel | null, string[]>();
    Object.entries(anteriores).forEach(([chave, n]) => {
      grupos.set(n, [...(grupos.get(n) ?? []), chave]);
    });
    aplicarNoMapa(anteriores);
    setAplicandoEmMassa(true);
    try {
      for (const [n, chaves] of Array.from(grupos.entries())) await gravarPrioridades(chaves, n);
      setEmMassaMsg({ ok: true, texto: "Prioridade de antes restaurada." });
    } catch (e: any) {
      recarregarPrioridades();
      setEmMassaMsg({ ok: false, texto: e.message || String(e) });
    } finally {
      setAplicandoEmMassa(false);
    }
  }

  async function gravarTagsEmMassa(itens: { id: string; tags: string[] }[]) {
    const res = await fetch("/api/scripts/em-massa", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens }),
    });
    const data = await lerJson(res);
    if (data.error) throw new Error(data.error);
  }

  function aplicarTagsNaLista(itens: { id: string; tags: string[] }[]) {
    const porId = new Map(itens.map((i) => [i.id, i.tags]));
    setScripts((prev) => prev.map((x) => (porId.has(x.id) ? { ...x, tags: porId.get(x.id)! } : x)));
  }

  async function alternarTagEmMassa(tag: string, acao: "adicionar" | "remover") {
    // Hierarquia (13/10/2026): a etiqueta tambem desce pros scripts dentro de
    // cada pai selecionado (mesmo avatar e ambiente).
    const comDentro = ehEtiquetaFilho(tag) ? selectedScripts : comOsDeDentro(selectedScripts);
    const extras = comDentro.length - selectedScripts.length;
    const alvo = comDentro.filter((s) => (acao === "adicionar" ? !s.tags.includes(tag) : s.tags.includes(tag)));
    if (alvo.length === 0) return;
    const anteriores = alvo.map((s) => ({ id: s.id, tags: s.tags }));
    const novos = alvo.map((s) => ({
      id: s.id,
      tags: acao === "adicionar" ? [...s.tags, tag] : s.tags.filter((t) => t !== tag),
    }));

    aplicarTagsNaLista(novos);
    setAplicandoEmMassa(true);
    setEmMassaMsg(null);
    try {
      await gravarTagsEmMassa(novos);
      setEmMassaMsg({
        ok: true,
        texto: `Etiqueta "${tag}" ${acao === "adicionar" ? "posta em" : "tirada de"} ${alvo.length} script${alvo.length === 1 ? "" : "s"}${
          extras > 0 ? ` (inclui os que estão dentro dos pais selecionados)` : ""
        }.`,
        desfazer: () => desfazerTags(anteriores),
      });
    } catch (e: any) {
      aplicarTagsNaLista(anteriores);
      setEmMassaMsg({ ok: false, texto: e.message || String(e) });
    } finally {
      setAplicandoEmMassa(false);
    }
  }

  async function desfazerTags(anteriores: { id: string; tags: string[] }[]) {
    aplicarTagsNaLista(anteriores);
    setAplicandoEmMassa(true);
    try {
      await gravarTagsEmMassa(anteriores);
      setEmMassaMsg({ ok: true, texto: "Etiquetas de antes restauradas." });
    } catch (e: any) {
      setEmMassaMsg({ ok: false, texto: `${e.message || String(e)} — recarregue a página pra ver o estado real.` });
    } finally {
      setAplicandoEmMassa(false);
    }
  }

  function montarComandoLote() {
    return buildBatchCommand(selectedScripts, {
      sleep: batchSleep,
      sleepSeconds: batchSleepSeconds,
      workers: batchWorkers,
      headed: batchHeaded,
    });
  }

  function copyBatchCommand() {
    const cmd = montarComandoLote();
    if (!cmd) return;
    navigator.clipboard.writeText(cmd);
    setBatchCopied(true);
    setTimeout(() => setBatchCopied(false), 1600);
  }

  function requestDelete(s: ScriptEntry) {
    setMenuOpenId(null);
    setConfirmDelete(s);
  }

  // Marca/desmarca uma etiqueta direto no card, pelo botao "+" no fim da linha
  // de etiquetas (pedido da Isa em 04/09/2026). Otimista: a pilula aparece na
  // hora e volta atras se o banco recusar. Usa o PATCH proprio de
  // /api/scripts/[id] — o POST de /api/scripts exigiria o conteudo do script,
  // que esta tela nao carrega.
  async function alternarTagScript(s: ScriptEntry, tag: string) {
    const adicionar = !s.tags.includes(tag);
    const tags = adicionar ? [...s.tags, tag] : s.tags.filter((t) => t !== tag);

    // Hierarquia (13/10/2026): no pai, a etiqueta posta/tirada desce pros
    // scripts dentro dele (mesmo avatar e ambiente). No filho, muda so ele.
    // A etiqueta "Filho" e automatica — nao desce pros de dentro.
    const dentro = ehEtiquetaFilho(tag)
      ? []
      : scriptsDentro(s).filter((x) => (adicionar ? !x.tags.includes(tag) : x.tags.includes(tag)));
    if (dentro.length > 0) {
      const anteriores = [s, ...dentro].map((x) => ({ id: x.id, tags: x.tags }));
      const novos = [
        { id: s.id, tags },
        ...dentro.map((x) => ({ id: x.id, tags: adicionar ? [...x.tags, tag] : x.tags.filter((t) => t !== tag) })),
      ];
      aplicarTagsNaLista(novos);
      setSalvandoTagsId(s.id);
      setRunMsg(null);
      try {
        await gravarTagsEmMassa(novos);
        setRunMsg({
          id: s.id,
          ok: true,
          text: `"${tag}" ${adicionar ? "posta" : "tirada"} também em ${dentro.length} script${dentro.length === 1 ? "" : "s"} dentro deste.`,
        });
      } catch (e: any) {
        aplicarTagsNaLista(anteriores);
        setRunMsg({ id: s.id, text: e.message || String(e), ok: false });
      } finally {
        setSalvandoTagsId(null);
      }
      return;
    }

    const antes = scripts;
    setScripts((prev) => prev.map((x) => (x.id === s.id ? { ...x, tags } : x)));
    setSalvandoTagsId(s.id);
    setRunMsg(null);
    try {
      const res = await fetch(`/api/scripts/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setScripts(antes);
      setRunMsg({ id: s.id, text: e.message || String(e), ok: false });
    } finally {
      setSalvandoTagsId(null);
    }
  }

  /**
   * Solta `draggedId` na posicao de `targetId`, olhando so pra lista visivel
   * agora (`filtered`) — e o que faz a ordem "sobreviver ao filtro" (pedido 2
   * da Isa, 21/09/2026): os vizinhos usados pra calcular a nova posicao sao
   * os vizinhos NA TELA, mesmo que existam outros scripts escondidos pelo
   * filtro atual entre eles. `ordem` e double precision exatamente pra isso —
   * a nova posicao e so a media entre os dois vizinhos, sem precisar
   * renumerar o resto da tabela.
   */
  async function reorderScript(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    // Hierarquia (13/10/2026): so troca de lugar entre irmaos (mesmo pai na
    // tela, ou entre as raizes). Pra mudar de pai, e o "Colocar dentro de...".
    const chaveIrmaos = irmaosDe.get(targetId);
    if (chaveIrmaos === undefined || irmaosDe.get(draggedId) !== chaveIrmaos) return;
    const lista = irmaosPorChave.get(chaveIrmaos) ?? [];
    const fromIndex = lista.findIndex((s) => s.id === draggedId);
    const toIndex = lista.findIndex((s) => s.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordenada = [...lista];
    const [movido] = reordenada.splice(fromIndex, 1);
    reordenada.splice(toIndex, 0, movido);
    const posFinal = reordenada.findIndex((s) => s.id === draggedId);
    const acima = reordenada[posFinal - 1];
    const abaixo = reordenada[posFinal + 1];

    let novaOrdem: number;
    if (acima && abaixo) novaOrdem = (acima.ordem + abaixo.ordem) / 2;
    else if (acima) novaOrdem = acima.ordem - 1;
    else if (abaixo) novaOrdem = abaixo.ordem + 1;
    else return;

    const antes = scripts;
    setScripts((prev) =>
      prev
        .map((s) => (s.id === draggedId ? { ...s, ordem: novaOrdem } : s))
        .sort((a, b) => b.ordem - a.ordem)
    );
    try {
      const res = await fetch(`/api/scripts/${draggedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem: novaOrdem }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setScripts(antes);
      setRunMsg({ id: draggedId, text: e.message || String(e), ok: false });
    }
  }

  async function confirmDeleteScript() {
    const s = confirmDelete;
    if (!s) return;
    setConfirmDelete(null);
    setDeletingId(s.id);
    setRunMsg(null);
    try {
      const res = await fetch(`/api/scripts/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScripts((prev) => prev.filter((x) => x.id !== s.id));
      setSelectedIds((prev) => prev.filter((id) => id !== s.id));
      // Apagar um pai solta os filhos: o servidor tira a etiqueta "Filho".
      if (Array.isArray(data.alterados) && data.alterados.length > 0) aplicarTagsNaLista(data.alterados);
    } catch (e: any) {
      setRunMsg({ id: s.id, text: e.message, ok: false });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="page-with-sidebar">
      {/* A coluna "Pastas" saiu em 15/10/2026: com o menu lateral do site
          ela perdeu a função — avatar e ambiente já se filtram pelos botões
          de filtro do topo da lista. */}

      <div className="page-content">
        <div className="page-header-row">
          <div>
            <h1>Biblioteca de scripts</h1>
            <p className="subtitle">
              Organize por avatar, ambiente e cenário. Clique em Rodar para executar.
            </p>
          </div>
          <div className="header-actions">
            <Link className="btn btn-secondary" href="/upload/lote">
              Importar em lote
            </Link>
            <button
              type="button"
              className={`btn-secondary select-toggle-btn${selectMode ? " active" : ""}`}
              onClick={toggleSelectMode}
            >
              {selectMode ? "Cancelar seleção" : "Selecionar vários"}
            </button>
            {actionsUrl && (
              <a
                className="btn btn-secondary btn-with-icon"
                href={actionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver GitHub Actions
                <IconExternalLink size={13} />
              </a>
            )}
          </div>
        </div>

        <div className="filters">
          {suites.length > 0 && (
            <SelectPopover
              allLabel="Nenhuma (ordem da Biblioteca)"
              placeholder="Suíte"
              value={suiteAtiva ? suiteAtiva.id : ""}
              options={suites.map((x) => x.id)}
              formatOption={(id) => suites.find((x) => x.id === id)?.name ?? id}
              onChange={setSuiteId}
              highlightWhenSet
            />
          )}
          <FilterPopover
            label="Avatar"
            options={avatars.map((a) => ({ name: a }))}
            filter={avatarFilter}
            onChange={setAvatarFilter}
            onClear={() => setAvatarFilter(emptyFilter("OR"))}
          />
          <FilterPopover
            label="Ambiente"
            options={ambientes.map((a) => ({ name: a }))}
            filter={ambienteFilter}
            onChange={setAmbienteFilter}
            onClear={() => setAmbienteFilter(emptyFilter("OR"))}
          />

          <FilterPopover
            label="Prioridade"
            options={OPCOES_FILTRO.map((o) => ({ name: o }))}
            filter={prioFilter}
            onChange={setPrioFilter}
            onClear={() => setPrioFilter(emptyFilter("OR"))}
            searchable={false}
          />

          {!suiteAtiva && (
            <SelectPopover
              allLabel="Ordem manual"
              value={ordenar}
              options={["prioridade"]}
              formatOption={() => "Ordenar por prioridade"}
              onChange={setOrdenar}
              highlightWhenSet
            />
          )}

          <FilterPopover
            label="Filtrar por etiqueta"
            options={allTags.map((t) => ({ name: t }))}
            filter={tagFilter}
            onChange={setTagFilter}
            onClear={() => setTagFilter(emptyFilter("AND"))}
          />

          <SavedFilters
            tagFilter={tagFilter}
            avatarFilter={avatarFilter}
            ambienteFilter={ambienteFilter}
            busca={search}
            onApply={(next) => {
              setTagFilter(next.tagFilter);
              setAvatarFilter(next.avatarFilter);
              setAmbienteFilter(next.ambienteFilter);
              setSearch(next.busca);
            }}
          />

          <input
            placeholder="Buscar por nome, cenário ou tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {suiteAtiva && (
          <div className="suite-ativa-bar">
            <span>
              Na ordem da suíte <strong>{suiteAtiva.name}</strong> · {posNaSuite.size} teste
              {posNaSuite.size === 1 ? "" : "s"}
              {filtered.length !== posNaSuite.size ? ` (${filtered.length} com os filtros)` : ""}
            </span>
            <Link href={`/suites/${suiteAtiva.id}?modo=editar`}>Editar sequência</Link>
            <button type="button" className="link-btn" onClick={() => setSuiteId("")}>
              Sair da suíte
            </button>
          </div>
        )}

        {selectMode && visiveis.length > 0 && (
          <div className="select-all-row">
            <label>
              <input
                type="checkbox"
                className="card-checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
              />
              Selecionar todos os visíveis ({visiveis.length})
            </label>
            <SelecionarPorEtiqueta contagem={contagemEtiquetas} onEscolher={selecionarPorEtiqueta} />
          </div>
        )}

        {loading && <p className="empty">Carregando...</p>}
        {error && <p className="status-msg err">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="empty">
            {suiteAtiva
              ? posNaSuite.size === 0
                ? "Esta suíte ainda não tem teste nenhum."
                : "Nenhum teste da suíte com esses filtros."
              : 'Nenhum script encontrado. Envie um em "Enviar script".'}
          </p>
        )}

        {comHierarquia && algumPai && (
          <div className="hier-bar">
            <span>
              {qtdGuardados} script{qtdGuardados === 1 ? "" : "s"} guardado{qtdGuardados === 1 ? "" : "s"} dentro de outro
              {qtdGuardados === 1 ? "" : "s"}
            </span>
            <button type="button" className="link-btn" onClick={() => abrirTodos(idsComFilhos, true)}>
              Abrir todos
            </button>
            <button type="button" className="link-btn" onClick={() => abrirTodos(idsComFilhos, false)}>
              Fechar todos
            </button>
            {hierMsg && <span className="hier-bar-erro">{hierMsg}</span>}
          </div>
        )}
        {comHierarquia && !algumPai && hierMsg && <p className="status-msg err">{hierMsg}</p>}

        {linhas.map((linha, idx) => {
          const { s, profundidade, temFilhos, aberto, qtdAbaixo, paiFora } = linha;
          const isSelected = selectedIds.includes(s.id);
          const nivel = nivelDe(s);
          // Divisor de prioridade so entre raizes (o filho fica embaixo do pai).
          const raizAnterior = (() => {
            for (let i = idx - 1; i >= 0; i--) if (linhas[i].profundidade === 0) return linhas[i].s;
            return null;
          })();
          const grupo = porPrioridade && profundidade === 0 ? chaveDeOrdem(nivel, s.ambiente) : null;
          const abreGrupo =
            grupo !== null &&
            (!raizAnterior || chaveDeOrdem(nivelDe(raizAnterior), raizAnterior.ambiente) !== grupo);
          const fam = familiaDe(s);
          // Pai de verdade deste script (com a escolha "so este script").
          const paiDeste = paiDaLinha.get(s) ?? null;
          const temEscolhaDeste = Object.prototype.hasOwnProperty.call(paisManuais, chaveDaLinha(s.id));
          const temManualTodos = Object.prototype.hasOwnProperty.call(paisManuais, fam);
          const podeSoltarAqui = !!dragId && dragId !== s.id && irmaosDe.get(dragId) === linha.irmaos;
          return (
            <Fragment key={s.id}>
            {abreGrupo && (
              <div className="prio-grupo">
                <span>{rotuloDoGrupo(nivel, s.ambiente)}</span>
                <span className="prio-grupo-qtd">({qtdPorGrupo.get(grupo!)})</span>
              </div>
            )}
            <div
              className={`card${profundidade > 0 ? ` card-filho${linha.ultimo ? " ultimo" : ""}` : ""}${temFilhos ? " card-pai" : ""}${isSelected ? " selected" : ""}${dragId === s.id ? " dragging" : ""}${dragOverId === s.id && podeSoltarAqui ? " drag-over" : ""}`}
              style={profundidade > 0 ? { marginLeft: profundidade * 32 } : undefined}
              onDragOver={(e) => {
                if (suiteAtiva || porPrioridade || !podeSoltarAqui) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverId !== s.id) setDragOverId(s.id);
              }}
              onDragLeave={() => {
                setDragOverId((prev) => (prev === s.id ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== s.id) reorderScript(dragId, s.id);
                setDragId(null);
                setDragOverId(null);
              }}
            >
              {comHierarquia && algumPai && (
                <button
                  type="button"
                  className={`hier-toggle${temFilhos ? "" : " vazio"}`}
                  onClick={() => temFilhos && toggleAberto(s.id)}
                  disabled={!temFilhos}
                  tabIndex={temFilhos ? 0 : -1}
                  aria-hidden={!temFilhos}
                  aria-expanded={temFilhos ? aberto : undefined}
                  title={temFilhos ? (aberto ? "Guardar os scripts de dentro" : `Mostrar os ${qtdAbaixo} scripts de dentro`) : undefined}
                >
                  <IconChevronRight size={15} className={`icon-chevron${aberto ? " open" : ""}`} />
                </button>
              )}
              {suiteAtiva ? (
                <span className="suite-item-num" title={`Posição ${posNaSuite.get(s.id)} na suíte`}>
                  {posNaSuite.get(s.id)}
                </span>
              ) : (
              <span
                className="drag-handle"
                draggable={!porPrioridade}
                style={porPrioridade ? { opacity: 0.3, cursor: "not-allowed" } : undefined}
                onDragStart={(e) => {
                  if (porPrioridade) return;
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(s.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                title={porPrioridade ? "Volte para Ordem manual pra arrastar" : "Arrastar pra reordenar"}
                aria-label={`Arrastar ${s.name} pra reordenar`}
              >
                <IconGripVertical size={16} />
              </span>
              )}
              <div className="card-menu-wrap">
                <button
                  className="card-menu-btn"
                  onClick={() => setMenuOpenId((prev) => (prev === s.id ? null : s.id))}
                  title="Mais opções"
                  aria-label="Mais opções"
                >
                  <IconDots size={17} />
                </button>
                {menuOpenId === s.id && (
                  <div className="card-menu card-menu-largo">
                    <button
                      className="card-menu-item"
                      onClick={() => selecionarPeloMenu(s.id)}
                    >
                      {selectMode && isSelected ? "Tirar da seleção" : "Selecionar"}
                    </button>
                    <button
                      className="card-menu-item"
                      onClick={() => {
                        setMenuOpenId(null);
                        setInfoScript(s);
                      }}
                    >
                      Informações
                    </button>
                    <button
                      className="card-menu-item"
                      onClick={() => abrirEscolhaPai([s])}
                    >
                      Colocar dentro de...
                    </button>
                    <button
                      className="card-menu-item"
                      onClick={() => {
                        setMenuOpenId(null);
                        setEscolhaFilhos(s.id);
                      }}
                    >
                      Adicionar filhos...
                    </button>
                    {paiDeste && (
                      <button
                        className="card-menu-item"
                        disabled={salvandoPai}
                        title="Só este script — nos outros ambientes e avatares continua como está"
                        onClick={() => {
                          setMenuOpenId(null);
                          salvarPai([chaveDaLinha(s.id)], "");
                        }}
                      >
                        Tirar de dentro de "{paiDeste.name}"
                      </button>
                    )}
                    {temEscolhaDeste && (
                      <button
                        className="card-menu-item"
                        disabled={salvandoPai}
                        title="Volta a seguir a regra de todos os ambientes e avatares"
                        onClick={() => {
                          setMenuOpenId(null);
                          salvarPai([chaveDaLinha(s.id)], null);
                        }}
                      >
                        Desfazer a escolha só deste script
                      </button>
                    )}
                    {temManualTodos && (
                      <button
                        className="card-menu-item"
                        disabled={salvandoPai}
                        onClick={() => {
                          setMenuOpenId(null);
                          salvarPai([fam], null);
                        }}
                      >
                        Voltar ao automático (todos os ambientes)
                      </button>
                    )}
                    <button
                      className="card-menu-item card-menu-item-danger"
                      disabled={deletingId === s.id}
                      onClick={() => requestDelete(s)}
                    >
                      {deletingId === s.id ? "Apagando..." : "Apagar"}
                    </button>
                  </div>
                )}
              </div>

              <div className="card-main">
                {selectMode && (
                  <input
                    type="checkbox"
                    className="card-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(s.id)}
                    aria-label={`Selecionar ${s.name}`}
                  />
                )}
                <PrioridadeSeletor
                  nivel={nivel}
                  ambiente={s.ambiente}
                  alcance={alcanceDoScript(s)}
                  onChange={(n) => mudarPrioridade(s, n)}
                  disabled={salvandoPrioChave === chaveDoScript(s)}
                />
                <div className="card-info">
                  <div className="hier-titulo">
                    <a className="card-title-link" href={`/upload?id=${s.id}`}>
                      <h3>{s.name}</h3>
                    </a>
                    {temFilhos && (
                      <button
                        type="button"
                        className={`hier-qtd${aberto ? " aberto" : ""}`}
                        onClick={() => toggleAberto(s.id)}
                        title={aberto ? "Guardar os scripts de dentro" : "Mostrar os scripts de dentro"}
                      >
                        {qtdAbaixo} dentro
                      </button>
                    )}
                  </div>
                  <div className="meta">
                    {s.avatar} · {s.ambiente} · {s.framework}
                    {s.tela ? ` · ${s.tela}` : ""}
                    {comHierarquia && paiFora && (
                      <span className="hier-pai-fora" title="O pai não está na lista agora (filtro, busca ou outro ambiente)">
                        {" "}· dentro de {paiFora}
                      </span>
                    )}
                  </div>
                  <div className="tags" style={{ alignItems: "center" }}>
                    {sortTagsByColor(s.tags, (t) => tagColors[t]).map((t) => (
                      <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>{t}</span>
                    ))}
                    <TagQuickAdd
                      options={availableTags}
                      selected={s.tags}
                      onToggle={(t) => alternarTagScript(s, t)}
                      onCatalogChange={(tags) => {
                        // A Biblioteca guarda o catalogo em dois lugares: a
                        // lista (pro popover) e o mapa nome->cor (pras pilulas).
                        setAvailableTags(tags);
                        const map: Record<string, string> = {};
                        tags.forEach((t) => {
                          map[t.name] = t.color;
                        });
                        setTagColors(map);
                      }}
                      disabled={salvandoTagsId === s.id}
                    />
                  </div>
                  {runMsg?.id === s.id && (
                    <div className={`status-msg ${runMsg.ok ? "ok" : "err"}`}>
                      {runMsg.text}{" "}
                      {runMsg.url && (
                        <a href={runMsg.url} target="_blank" rel="noopener noreferrer">
                          {runMsg.url}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  className="btn-primary"
                  onClick={() => {
                    setLocalScript(s);
                    setOptHeaded(true);
                    setOptWorkers(false);
                  }}
                >
                  Rodar no meu terminal
                </button>
                <a className="btn btn-ghost" href={`/upload?id=${s.id}`}>
                  Editar
                </a>
              </div>
            </div>
            </Fragment>
          );
        })}

        {selectMode && selectedIds.length > 0 && (
          <div className="batch-bar">
            <div className="batch-bar-top">
              <div className="batch-count">
                <em className="batch-count-texto">
                  <span>{selectedIds.length}</span> selecionado{selectedIds.length > 1 ? "s" : ""}
                </em>
                {/* Hierarquia (13/10/2026): pra rodar so os pais no terminal —
                    o pai ja faz tudo o que os filhos fazem. */}
                {filhosNaSelecao > 0 && (
                  <button
                    type="button"
                    className="tirar-filhos-btn"
                    onClick={() => setSelectedIds((prev) => prev.filter((id) => !idsFilhos.has(id)))}
                    title="Desmarca os scripts que estão dentro de um pai (mesmo avatar e ambiente)"
                  >
                    Tirar os {filhosNaSelecao} filho{filhosNaSelecao === 1 ? "" : "s"} da seleção
                  </button>
                )}
              </div>
              <div className="batch-actions">
                <PrioridadeEmMassa
                  niveisAtuais={selectedScripts.map(nivelDe)}
                  alcance={alcanceEmMassaCompleto}
                  onAplicar={aplicarPrioridadeEmMassa}
                  disabled={aplicandoEmMassa}
                />
                <EtiquetasEmMassa
                  catalogo={availableTags}
                  tagsPorItem={selectedScripts.map((s) => s.tags)}
                  onAlternar={alternarTagEmMassa}
                  onCatalogChange={(tags) => {
                    setAvailableTags(tags);
                    const map: Record<string, string> = {};
                    tags.forEach((t) => {
                      map[t.name] = t.color;
                    });
                    setTagColors(map);
                  }}
                  disabled={aplicandoEmMassa}
                />
                {comHierarquia && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={salvandoPai}
                    onClick={() => abrirEscolhaPai(selectedScripts)}
                    title="Escolher o script pai dos selecionados"
                  >
                    Colocar dentro de...
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary btn-with-icon"
                  onClick={() => setBatchOptionsOpen((o) => !o)}
                >
                  Opções
                  <IconChevronRight size={13} className={`icon-chevron${batchOptionsOpen ? " open" : ""}`} />
                </button>
                <button type="button" className="btn-primary" onClick={copyBatchCommand}>
                  {batchCopied ? "Copiado!" : "Copiar comando"}
                </button>
              </div>
            </div>
            {emMassaMsg && (
              <div className={`em-massa-msg ${emMassaMsg.ok ? "ok" : "err"}`}>
                <span>{emMassaMsg.texto}</span>
                {emMassaMsg.desfazer && (
                  <button type="button" onClick={emMassaMsg.desfazer} disabled={aplicandoEmMassa}>
                    Desfazer
                  </button>
                )}
              </div>
            )}
            {batchOptionsOpen && (
              <div className="batch-options">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={batchSleep}
                    onChange={(e) => setBatchSleep(e.target.checked)}
                  />
                  Intervalo entre scripts (sleep)
                  {batchSleep && (
                    <input
                      type="number"
                      min={1}
                      className="workers-input"
                      value={batchSleepSeconds}
                      onChange={(e) => setBatchSleepSeconds(Math.max(1, Number(e.target.value) || 1))}
                    />
                  )}
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={batchWorkers}
                    onChange={(e) => setBatchWorkers(e.target.checked)}
                  />
                  --workers=1
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={batchHeaded}
                    onChange={(e) => setBatchHeaded(e.target.checked)}
                  />
                  --headed
                </label>
              </div>
            )}
            <pre className="batch-cmd-preview">{montarComandoLote()}</pre>
          </div>
        )}

        {localScript && (
          <div className="modal-backdrop" onClick={() => setLocalScript(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Comando para {localScript.name}</h3>
              <p className="hint">
                Copie e cole no terminal.
              </p>
              <div className="cmd-options">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={optHeaded}
                    onChange={(e) => setOptHeaded(e.target.checked)}
                  />
                  --headed
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={optWorkers}
                    onChange={(e) => setOptWorkers(e.target.checked)}
                  />
                  --workers
                  {optWorkers && (
                    <input
                      type="number"
                      min={1}
                      className="workers-input"
                      value={workersCount}
                      onChange={(e) => setWorkersCount(Math.max(1, Number(e.target.value) || 1))}
                    />
                  )}
                </label>
              </div>
              <pre>{localCommand(localScript, { headed: optHeaded, workers: optWorkers, workersCount })}</pre>
              <button
                className="btn-primary"
                onClick={() => {
                  navigator.clipboard.writeText(
                    localCommand(localScript, { headed: optHeaded, workers: optWorkers, workersCount })
                  );
                  setLocalScript(null);
                }}
              >
                Copiar e fechar
              </button>
            </div>
          </div>
        )}

        {escolhaPai &&
          (() => {
            const alvos = escolhaPai.ids
              .map((id) => scripts.find((x) => x.id === id))
              .filter(Boolean) as ScriptEntry[];
            if (alvos.length === 0) return null;
            const unico = alvos.length === 1 ? alvos[0] : null;
            const temChave = (k: string) => Object.prototype.hasOwnProperty.call(paisManuais, k);
            const ondeTxt = (f: string) => {
              const c = ondeDaFamilia.get(f);
              return c ? `${listaHumana(Array.from(c.ambs).sort())} · ${listaHumana(Array.from(c.avs).sort())}` : "";
            };
            const proprias = new Set(alvos.map(familiaDe));
            const nomeFam = (f: string | null | undefined) => (f ? f : null);

            let props: Omit<
              ComponentProps<typeof EscolherPaiModal>,
              "alcance" | "onAlcance" | "salvando" | "onFechar" | "titulo" | "rotuloLinha" | "rotuloFamilia"
            >;
            if (alcancePai === "linha") {
              // SO ESTE SCRIPT: o pai tem que existir no mesmo avatar e
              // ambiente. Fora da lista: o proprio script e o que ja esta
              // dentro dele (senao viraria ciclo).
              const bloqueadosIds = new Set<string>();
              alvos.forEach((a) => {
                bloqueadosIds.add(a.id);
                scriptsDentro(a).forEach((x) => bloqueadosIds.add(x.id));
              });
              const grupos = new Set(alvos.map(grupoDe));
              let opcoes: { familia: string; nome: string; onde: string }[];
              if (unico) {
                opcoes = scripts
                  .filter((x) => grupoDe(x) === grupoDe(unico) && !bloqueadosIds.has(x.id) && familiaDe(x) !== familiaDe(unico))
                  .map((x) => ({ familia: familiaDe(x), nome: x.name, onde: "" }));
              } else {
                const fams = new Map<string, Set<string>>();
                scripts.forEach((x) => {
                  if (!grupos.has(grupoDe(x)) || bloqueadosIds.has(x.id) || proprias.has(familiaDe(x))) return;
                  const f = familiaDe(x);
                  fams.set(f, (fams.get(f) ?? new Set()).add(`${x.ambiente.toUpperCase()} ${x.avatar}`));
                });
                opcoes = Array.from(fams.entries()).map(([familia, onde]) => ({
                  familia,
                  nome: familia,
                  onde: `existe em ${onde.size} de ${grupos.size} grupo${grupos.size === 1 ? "" : "s"} selecionado${grupos.size === 1 ? "" : "s"}`,
                }));
              }
              opcoes = Array.from(new Map(opcoes.map((o) => [o.familia, o])).values()).sort((a, b) =>
                a.nome.localeCompare(b.nome)
              );
              const chaves = alvos.map((a) => chaveDaLinha(a.id));
              const geral = unico ? nomeFam(arvore.pai.get(familiaDe(unico))) : undefined;
              props = {
                descricao: unico
                  ? `Só o ${unico.name} muda. O mesmo teste nos outros ambientes e avatares continua como está.`
                  : `Só os ${alvos.length} selecionados mudam. O pai é procurado no mesmo avatar e ambiente de cada um.`,
                opcoes,
                atual: unico ? (paiDaLinha.get(unico) ? familiaDe(paiDaLinha.get(unico)!) : null) : undefined,
                padrao: {
                  rotulo: "Seguir a regra de todos os ambientes",
                  detalhe: unico
                    ? geral
                      ? `fica dentro de ${geral}`
                      : "fica solto na raiz"
                    : "cada um volta à regra geral",
                  habilitado: chaves.some(temChave),
                },
                nenhumAtivo: !!unico && temChave(chaveDaLinha(unico.id)) && paisManuais[chaveDaLinha(unico.id)] === "",
                onEscolher: (pai) => salvarPai(chaves, pai),
              };
            } else {
              // TODOS OS AMBIENTES E AVATARES: grava pela familia.
              const fams = Array.from(proprias);
              const bloqueadas = new Set<string>(fams);
              fams.forEach((f) => familiasDentro(f).forEach((d) => bloqueadas.add(d)));
              const comEscolhaPropria = scripts.filter(
                (x) => proprias.has(familiaDe(x)) && temChave(chaveDaLinha(x.id))
              ).length;
              const unica = fams.length === 1 ? fams[0] : null;
              props = {
                descricao:
                  "Vale para o mesmo teste em todos os ambientes e avatares. Na lista, o script só aparece dentro do pai quando os dois estão no mesmo avatar e ambiente.",
                aviso:
                  comEscolhaPropria > 0
                    ? `${comEscolhaPropria} script${comEscolhaPropria === 1 ? "" : "s"} desse teste ${
                        comEscolhaPropria === 1 ? "tem escolha própria e continua" : "têm escolha própria e continuam"
                      } como ${comEscolhaPropria === 1 ? "está" : "estão"}.`
                    : undefined,
                opcoes: Array.from(ondeDaFamilia.keys())
                  .filter((f) => !bloqueadas.has(f))
                  .sort((a, b) => a.localeCompare(b))
                  .map((f) => ({ familia: f, nome: f, onde: ondeTxt(f) })),
                atual: unica ? arvore.pai.get(unica) ?? null : undefined,
                padrao: {
                  rotulo: "Automático pelo nome",
                  detalhe: unica
                    ? arvore.auto.get(unica)
                      ? `fica dentro de ${arvore.auto.get(unica)}`
                      : "nenhum nome combina — fica na raiz"
                    : "cada um pelo começo do próprio nome",
                  habilitado: fams.some(temChave),
                },
                nenhumAtivo: !!unica && temChave(unica) && paisManuais[unica] === "",
                onEscolher: (pai) => salvarPai(fams, pai),
              };
            }
            return (
              <EscolherPaiModal
                titulo={unico ? `Colocar "${unico.name}" dentro de...` : `Colocar ${alvos.length} scripts dentro de...`}
                alcance={alcancePai}
                onAlcance={setAlcancePai}
                rotuloLinha={
                  unico ? `Só este script (${unico.ambiente.toUpperCase()} · ${unico.avatar})` : `Só os ${alvos.length} selecionados`
                }
                rotuloFamilia="Em todos os ambientes e avatares"
                salvando={salvandoPai}
                onFechar={() => setEscolhaPai(null)}
                {...props}
              />
            );
          })()}

        {escolhaFilhos &&
          (() => {
            const pai = scripts.find((x) => x.id === escolhaFilhos);
            if (!pai) return null;
            const famPai = familiaDe(pai);
            const temChave = (k: string) => Object.prototype.hasOwnProperty.call(paisManuais, k);
            let opcoes: { chave: string; nome: string; onde: string; marcado: boolean }[];
            let descricao: string;
            let aviso: string | undefined;
            let abrirIds: string[];
            if (alcancePai === "linha") {
              // So os scripts do mesmo avatar e ambiente. Fora: o proprio pai,
              // o mesmo teste e quem esta ACIMA dele (senao viraria ciclo).
              const acima = new Set<string>();
              for (let p = paiDaLinha.get(pai) ?? null; p && !acima.has(p.id); p = paiDaLinha.get(p) ?? null) acima.add(p.id);
              opcoes = scripts
                .filter(
                  (x) => grupoDe(x) === grupoDe(pai) && x.id !== pai.id && !acima.has(x.id) && familiaDe(x) !== famPai
                )
                .map((x) => {
                  const atual = paiDaLinha.get(x) ?? null;
                  return {
                    chave: chaveDaLinha(x.id),
                    nome: x.name,
                    onde: atual && atual.id !== pai.id ? `hoje dentro de ${atual.name}` : "",
                    marcado: atual?.id === pai.id,
                  };
                });
              descricao = `Só no ${pai.ambiente.toUpperCase()} · ${pai.avatar}. O mesmo teste nos outros ambientes e avatares continua como está.`;
              abrirIds = [pai.id];
            } else {
              // Todos os ambientes e avatares: pela familia.
              const acima = new Set(ancestrais(famPai, arvore));
              opcoes = Array.from(ondeDaFamilia.entries())
                .filter(([f]) => f !== famPai && !acima.has(f))
                .map(([f, c]) => {
                  const atual = arvore.pai.get(f) ?? null;
                  const onde = `${listaHumana(Array.from(c.ambs).sort())} · ${listaHumana(Array.from(c.avs).sort())}`;
                  return {
                    chave: f,
                    nome: f,
                    onde: atual && atual !== famPai ? `${onde} · hoje dentro de ${atual}` : onde,
                    marcado: atual === famPai,
                  };
                });
              const proprios = scripts.filter((x) => familiaDe(x) !== famPai && temChave(chaveDaLinha(x.id))).length;
              descricao =
                "Vale para o mesmo teste em todos os ambientes e avatares. Na lista, o filho só aparece dentro do pai quando os dois estão no mesmo avatar e ambiente.";
              aviso =
                proprios > 0
                  ? `${proprios} script${proprios === 1 ? "" : "s"} com escolha "só este script" ${
                      proprios === 1 ? "continua" : "continuam"
                    } como ${proprios === 1 ? "está" : "estão"}.`
                  : undefined;
              abrirIds = scripts.filter((x) => familiaDe(x) === famPai).map((x) => x.id);
            }
            return (
              <EscolherFilhosModal
                key={pai.id}
                titulo={`Adicionar filhos a "${alcancePai === "linha" ? pai.name : famPai}"`}
                alcance={alcancePai}
                onAlcance={setAlcancePai}
                rotuloLinha={`Só este script (${pai.ambiente.toUpperCase()} · ${pai.avatar})`}
                rotuloFamilia="Em todos os ambientes e avatares"
                descricao={descricao}
                aviso={aviso}
                opcoes={opcoes}
                salvando={salvandoPai}
                onSalvar={(adicionar, remover) => salvarFilhos(adicionar, remover, famPai, abrirIds)}
                onFechar={() => setEscolhaFilhos(null)}
              />
            );
          })()}

        {infoScript &&
          (() => {
            const s = infoScript;
            // A suite guarda o id da linha (avatar + ambiente), entao e o
            // mesmo id do card — nao a familia do teste.
            const nasSuites = suites
              .map((x) => ({ suite: x, pos: x.scriptIds.indexOf(s.id) }))
              .filter((x) => x.pos >= 0)
              .sort((a, b) => a.suite.name.localeCompare(b.suite.name, "pt-BR"));
            return (
              <div className="modal-backdrop" onClick={() => setInfoScript(null)}>
                <div className="modal info-modal" onClick={(e) => e.stopPropagation()}>
                  <h3>{s.name}</h3>
                  <div className="info-modal-sub">
                    {s.avatar} · {s.ambiente.toUpperCase()}
                  </div>

                  <div className="info-modal-secao">
                    <div className="info-modal-rotulo">Cenário</div>
                    <div className="info-modal-valor">{s.cenario?.trim() ? s.cenario : "Sem cenário"}</div>
                  </div>

                  <div className="info-modal-secao">
                    <div className="info-modal-rotulo">Suítes</div>
                    {nasSuites.length === 0 ? (
                      <div className="info-modal-valor info-modal-vazio">Não está em nenhuma suíte.</div>
                    ) : (
                      <>
                        <div className="info-modal-valor">
                          Está em {nasSuites.length} suíte{nasSuites.length === 1 ? "" : "s"}:
                        </div>
                        <ul className="info-modal-suites">
                          {nasSuites.map(({ suite, pos }) => (
                            <li key={suite.id}>
                              <Link href={`/suites/${suite.id}`}>{suite.name}</Link>
                              <span className="info-modal-pos">
                                posição {pos + 1} de {suite.scriptIds.length}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="confirm-modal-actions">
                    <button className="btn-secondary" onClick={() => setInfoScript(null)}>
                      Fechar
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {confirmDelete && (
          <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Você realmente deseja apagar este script? Esta ação não pode ser desfeita.</h3>
              <div className="confirm-modal-actions">
                <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </button>
                <button className="btn-danger-solid" onClick={confirmDeleteScript}>
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
