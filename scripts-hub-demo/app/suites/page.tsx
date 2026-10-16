"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ScriptEntry, Suite, Tag } from "@/lib/types";
import { IconDots, IconPin } from "../icons";
import { FilterPopover } from "@/components/filter-popover";
import { emptyFilter, matchesFilter, MultiFilter } from "@/lib/filters";
import { TagQuickAdd } from "@/components/tag-quick-add";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { usePersistedState } from "@/lib/usePersistedState";
import { SuiteCommandModal } from "@/components/suite-command-modal";
import { SelectPopover } from "@/components/select-popover";
// Prioridade por ambiente nas suites (13/10/2026) — ver lib/prioridade.ts.
import { PrioridadeSeletor } from "@/components/prioridade-seletor";
import { lerJson } from "@/lib/lerJson";
import {
  ambienteDaSuite,
  chaveDaSuite,
  chaveDeOrdem,
  MapaPrioridades,
  Nivel,
  OPCOES_FILTRO,
  pesoDoAmbiente,
  rotuloDoFiltro,
  rotuloDoGrupo,
} from "@/lib/prioridade";

/** Texto do topo do menu de prioridade: de onde vem o peso da suite. */
function alcanceDaSuite(tags: string[] | undefined): string {
  const amb = ambienteDaSuite(tags);
  const peso = pesoDoAmbiente(amb);
  if (peso === 1) return "Peso de PROD, pela etiqueta PROD da suíte";
  if (peso === 2) return `Peso de HML/STG, pela etiqueta ${amb.toUpperCase()} da suíte`;
  return "Sem etiqueta PROD, HML ou STG: o nível aparece sem cor";
}

/**
 * Lista de suítes (22/09/2026 — a suíte virou SEQUÊNCIA de teste).
 *
 * Esta tela é só a vitrine: nome da suíte, quantidade e etiquetas — os nomes
 * dos testes saíram do card em 22/09/2026 (quem quer vê-los abre a suíte, que
 * é uma Biblioteca reduzida). Na linha de ação: Abrir | Editar | Rodar no
 * terminal (13/10/2026 — Abrir e Editar saíram do menu e viraram botões, no
 * mesmo estilo do "Editar" da Biblioteca). No menu de reticências ficam
 * Fixar no topo e Apagar. Montar/ordenar é em /suites/[id], no modo editar.
 *
 * Fixar no topo (13/10/2026): igual fixar conversa no WhatsApp. As fixadas
 * vêm sempre antes das outras (a fixada mais recente em cima), inclusive com
 * "Ordenar por prioridade" — aí elas ganham o cabeçalho "Fixadas" e os grupos
 * de prioridade valem só pro resto. Filtro e busca continuam valendo pra elas.
 */

export default function SuitesPage() {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = usePersistedState("suites:busca", "");
  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>("suites:tagFilter", emptyFilter("AND"));

  // Prioridade (13/10/2026): o nivel e da suite; o peso vem da etiqueta
  // PROD/HML/STG dela (ver ambienteDaSuite).
  const [prioridades, setPrioridades] = useState<MapaPrioridades>({});
  const [prioFilter, setPrioFilter] = usePersistedState<MultiFilter>("suites:prioridadeFilter", emptyFilter("OR"));
  const [ordenar, setOrdenar] = usePersistedState<string>("suites:ordenar", "");
  const [salvandoPrioId, setSalvandoPrioId] = useState<string | null>(null);

  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [salvandoTagsId, setSalvandoTagsId] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Suite | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Menu de reticências do card (Fixar no topo / Apagar), mesmo padrão da Biblioteca.
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [fixandoId, setFixandoId] = useState<string | null>(null);

  // Modal do comando de terminal (as opções moram dentro do componente).
  const [cmdSuite, setCmdSuite] = useState<Suite | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/scripts").then((r) => r.json()),
      fetch("/api/suites").then((r) => r.json()),
    ])
      .then(([scriptsData, suitesData]) => {
        if (scriptsData.error) throw new Error(scriptsData.error);
        if (suitesData.error) throw new Error(suitesData.error);
        setScripts(scriptsData.scripts);
        setSuites(suitesData.suites);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    fetch("/api/prioridades", { cache: "no-store" })
      .then((r) => lerJson(r))
      .then((data) => {
        if (!data.error && data.prioridades) setPrioridades(data.prioridades);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".card-menu-wrap")) setMenuOpenId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) aplicarCatalogo(data.tags as Tag[]);
      })
      .catch(() => {});
  }, []);

  function aplicarCatalogo(lista: Tag[]) {
    setAvailableTags(lista);
    const map: Record<string, string> = {};
    lista.forEach((t) => {
      map[t.name] = t.color;
    });
    setTagColors(map);
  }

  const scriptsById = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);

  const etiquetasUsadas = useMemo(
    () => Array.from(new Set(suites.flatMap((s) => s.tags || []))).sort(),
    [suites]
  );

  const filtradas = useMemo(
    () =>
      suites.filter((suite) => {
        if (!matchesFilter(suite.tags || [], tagFilter)) return false;
        if (!matchesFilter([rotuloDoFiltro(prioridades[chaveDaSuite(suite.id)] ?? null)], prioFilter)) return false;
        if (busca) {
          const q = busca.toLowerCase();
          const nomesDentro = suite.scriptIds
            .map((id) => scriptsById.get(id)?.name || "")
            .join(" ");
          const haystack = `${suite.name} ${(suite.tags || []).join(" ")} ${nomesDentro}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      }),
    [suites, tagFilter, busca, scriptsById, prioridades, prioFilter]
  );

  const nivelDe = (suite: Suite): Nivel | null => prioridades[chaveDaSuite(suite.id)] ?? null;

  // Fixadas sempre no topo, a mais recente em cima (13/10/2026). O resto segue
  // a ordem escolhida.
  const fixadas = filtradas
    .filter((s) => s.fixadaEm)
    .sort((a, b) => (b.fixadaEm || "").localeCompare(a.fixadaEm || ""));
  const naoFixadas = filtradas.filter((s) => !s.fixadaEm);

  // Ordenado por prioridade: criticidade (ambiente primeiro); empate fica na
  // ordem de sempre da lista.
  const porPrioridade = ordenar === "prioridade";
  const restoOrdenado = porPrioridade
    ? naoFixadas
        .map((suite, i) => ({ suite, i }))
        .sort(
          (a, b) =>
            chaveDeOrdem(nivelDe(a.suite), ambienteDaSuite(a.suite.tags)) -
              chaveDeOrdem(nivelDe(b.suite), ambienteDaSuite(b.suite.tags)) || a.i - b.i
        )
        .map((x) => x.suite)
    : naoFixadas;
  const lista = [...fixadas, ...restoOrdenado];
  const qtdPorGrupo = new Map<number, number>();
  if (porPrioridade) {
    restoOrdenado.forEach((suite) => {
      const k = chaveDeOrdem(nivelDe(suite), ambienteDaSuite(suite.tags));
      qtdPorGrupo.set(k, (qtdPorGrupo.get(k) ?? 0) + 1);
    });
  }

  /** Troca o nivel da suite. Otimista, como a etiqueta rapida. */
  async function mudarPrioridade(suite: Suite, nivel: Nivel | null) {
    const chave = chaveDaSuite(suite.id);
    const antes = prioridades;
    setPrioridades((prev) => {
      const next = { ...prev };
      if (nivel) next[chave] = nivel;
      else delete next[chave];
      return next;
    });
    setSalvandoPrioId(suite.id);
    try {
      const res = await fetch("/api/prioridades", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, nivel }),
      });
      const data = await lerJson(res);
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setPrioridades(antes);
      setError(e.message || String(e));
    } finally {
      setSalvandoPrioId(null);
    }
  }

  /** Fixa/desafixa a suíte no topo da lista. Otimista, como a etiqueta rápida. */
  async function alternarFixada(suite: Suite) {
    const fixar = !suite.fixadaEm;
    const antes = suites;
    const agora = new Date().toISOString();
    setSuites((prev) => prev.map((s) => (s.id === suite.id ? { ...s, fixadaEm: fixar ? agora : null } : s)));
    setFixandoId(suite.id);
    try {
      const res = await fetch(`/api/suites/${suite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixada: fixar }),
      });
      const data = await lerJson(res);
      if (data.error) throw new Error(data.error);
      // Fica com a data do banco, pra ordem entre fixadas bater com o servidor.
      if (data.suite) {
        setSuites((prev) => prev.map((s) => (s.id === suite.id ? { ...s, fixadaEm: data.suite.fixadaEm ?? null } : s)));
      }
    } catch (e: any) {
      setSuites(antes);
      setError(e.message || String(e));
    } finally {
      setFixandoId(null);
    }
  }

  /** Marcar/desmarcar etiqueta direto no card, igual na Biblioteca (otimista). */
  async function alternarTagSuite(suite: Suite, tag: string) {
    const atuais = suite.tags || [];
    const tags = atuais.includes(tag) ? atuais.filter((t) => t !== tag) : [...atuais, tag];

    const antes = suites;
    setSuites((prev) => prev.map((s) => (s.id === suite.id ? { ...s, tags } : s)));
    setSalvandoTagsId(suite.id);
    try {
      const res = await fetch(`/api/suites/${suite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setSuites(antes);
      setError(e.message || String(e));
    } finally {
      setSalvandoTagsId(null);
    }
  }

  async function confirmDeleteSuite() {
    const suite = confirmDelete;
    if (!suite) return;
    setConfirmDelete(null);
    setDeletingId(suite.id);
    try {
      const res = await fetch(`/api/suites/${suite.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuites((prev) => prev.filter((s) => s.id !== suite.id));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDeletingId(null);
    }
  }

  /** Scripts da suíte já na ordem da sequência (ignorando os apagados). */
  function scriptsNaOrdem(suite: Suite) {
    return suite.scriptIds.map((id) => scriptsById.get(id)).filter(Boolean) as ScriptEntry[];
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Suítes</h1>
          <p className="subtitle">
            Sequências de teste: cada suíte guarda a sua própria ordem, sem mexer na ordem da Biblioteca.
          </p>
        </div>
        <div className="header-actions">
          <Link className="btn btn-primary" href="/suites/nova">
            Nova suíte
          </Link>
        </div>
      </div>

      <div className="filters">
        <FilterPopover
          label="Prioridade"
          options={OPCOES_FILTRO.map((o) => ({ name: o }))}
          filter={prioFilter}
          onChange={setPrioFilter}
          onClear={() => setPrioFilter(emptyFilter("OR"))}
          searchable={false}
        />
        <SelectPopover
          allLabel="Ordem padrão"
          value={ordenar}
          options={["prioridade"]}
          formatOption={() => "Ordenar por prioridade"}
          onChange={setOrdenar}
          highlightWhenSet
        />
        <FilterPopover
          label="Filtrar por etiqueta"
          options={etiquetasUsadas.map((t) => ({ name: t, color: tagColors[t] }))}
          filter={tagFilter}
          onChange={setTagFilter}
          onClear={() => setTagFilter(emptyFilter("AND"))}
        />
        <input
          placeholder="Buscar por nome da suíte, etiqueta ou teste dentro dela..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && suites.length === 0 && (
        <p className="empty">Nenhuma suíte criada ainda. Clique em "Nova suíte" pra começar.</p>
      )}
      {!loading && !error && suites.length > 0 && filtradas.length === 0 && (
        <p className="empty">Nenhuma suíte com esse filtro.</p>
      )}

      {lista.map((suite, idx) => {
        const naOrdem = scriptsNaOrdem(suite);
        const missing = suite.scriptIds.length - naOrdem.length;
        const nivel = nivelDe(suite);
        const amb = ambienteDaSuite(suite.tags);
        const fixada = !!suite.fixadaEm;
        // Com "Ordenar por prioridade", as fixadas ganham um cabeçalho próprio
        // e os grupos de prioridade começam depois delas.
        const abreFixadas = porPrioridade && fixada && idx === 0;
        const grupo = porPrioridade && !fixada ? chaveDeOrdem(nivel, amb) : null;
        const anterior = idx > 0 ? lista[idx - 1] : null;
        const abreGrupo =
          grupo !== null &&
          (!anterior ||
            !!anterior.fixadaEm ||
            chaveDeOrdem(nivelDe(anterior), ambienteDaSuite(anterior.tags)) !== grupo);

        return (
          <Fragment key={suite.id}>
          {abreFixadas && (
            <div className="prio-grupo">
              <span>Fixadas</span>
              <span className="prio-grupo-qtd">({fixadas.length})</span>
            </div>
          )}
          {abreGrupo && (
            <div className="prio-grupo">
              <span>{rotuloDoGrupo(nivel, amb)}</span>
              <span className="prio-grupo-qtd">({qtdPorGrupo.get(grupo!)})</span>
            </div>
          )}
          <div className={`card${fixada ? " card-fixada" : ""}`}>
            {/* Menu de reticências: Fixar no topo e Apagar. Abrir e Editar
                voltaram pra linha de ação como botões (13/10/2026). */}
            <div className="card-menu-wrap">
              <button
                className="card-menu-btn"
                onClick={() => setMenuOpenId((prev) => (prev === suite.id ? null : suite.id))}
                title="Mais opções"
                aria-label="Mais opções"
              >
                <IconDots size={17} />
              </button>
              {menuOpenId === suite.id && (
                <div className="card-menu">
                  <button
                    className="card-menu-item"
                    disabled={fixandoId === suite.id}
                    onClick={() => {
                      setMenuOpenId(null);
                      alternarFixada(suite);
                    }}
                  >
                    {fixada ? "Desafixar" : "Fixar no topo"}
                  </button>
                  <button
                    className="card-menu-item card-menu-item-danger"
                    disabled={deletingId === suite.id}
                    onClick={() => {
                      setMenuOpenId(null);
                      setConfirmDelete(suite);
                    }}
                  >
                    {deletingId === suite.id ? "Apagando..." : "Apagar"}
                  </button>
                </div>
              )}
            </div>

            <div className="card-main">
              <PrioridadeSeletor
                nivel={nivel}
                ambiente={amb}
                alcance={alcanceDaSuite(suite.tags)}
                onChange={(n) => mudarPrioridade(suite, n)}
                disabled={salvandoPrioId === suite.id}
              />
              <div className="card-info">
                <div className="suite-titulo-row">
                  <Link className="card-title-link" href={`/suites/${suite.id}`}>
                    <h3>{suite.name}</h3>
                  </Link>
                  {fixada && (
                    <button
                      type="button"
                      className="suite-pin"
                      onClick={() => alternarFixada(suite)}
                      disabled={fixandoId === suite.id}
                      title="Fixada no topo — clique pra desafixar"
                      aria-label={`Desafixar ${suite.name}`}
                    >
                      <IconPin size={14} />
                    </button>
                  )}
                </div>
                <div className="meta">
                  {suite.scriptIds.length} teste(s) na sequência
                  {missing > 0 ? ` · ${missing} não encontrado(s)` : ""}
                </div>

                <div className="tags" style={{ alignItems: "center" }}>
                  {sortTagsByColor(suite.tags || [], (t) => tagColors[t]).map((t) => (
                    <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>
                      {t}
                    </span>
                  ))}
                  <TagQuickAdd
                    options={availableTags}
                    selected={suite.tags || []}
                    onToggle={(t) => alternarTagSuite(suite, t)}
                    onCatalogChange={aplicarCatalogo}
                    disabled={salvandoTagsId === suite.id}
                  />
                </div>
              </div>
            </div>
            <div className="actions">
              {/* Abrir | Editar | Rodar no terminal (13/10/2026). Abrir e Editar
                  no mesmo estilo do "Editar" da Biblioteca (btn-ghost). Editar
                  cai direto na montagem em duas colunas (?modo=editar). */}
              <Link className="btn btn-ghost" href={`/suites/${suite.id}`}>
                Abrir
              </Link>
              <Link className="btn btn-ghost" href={`/suites/${suite.id}?modo=editar`}>
                Editar
              </Link>
              <button
                type="button"
                className="btn-primary"
                disabled={naOrdem.length === 0}
                onClick={() => setCmdSuite(suite)}
              >
                Rodar no terminal
              </button>
            </div>
          </div>
          </Fragment>
        );
      })}

      {cmdSuite && (
        <SuiteCommandModal
          nome={cmdSuite.name}
          scripts={scriptsNaOrdem(cmdSuite)}
          onClose={() => setCmdSuite(null)}
        />
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Apagar a suíte "{confirmDelete.name}"? Os testes em si não são apagados, só a
              sequência.
            </h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmDeleteSuite}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
