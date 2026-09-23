"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ScriptEntry, Suite, Tag } from "@/lib/types";
import {
  IconFlask,
  IconGripVertical,
  IconPlus,
  IconX,
  IconArrowUp,
  IconArrowDown,
} from "../../icons";
import { FilterPopover } from "@/components/filter-popover";
import { emptyFilter, matchesFilter, MultiFilter } from "@/lib/filters";
import { SavedFilters } from "@/components/saved-filters";
import { TagQuickAdd } from "@/components/tag-quick-add";
import { SuiteCommandModal } from "@/components/suite-command-modal";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { usePersistedState } from "@/lib/usePersistedState";
import { localCommand } from "@/lib/comandoLote";

/**
 * A suíte aberta. Duas leituras da MESMA tela (22/09/2026):
 *
 * - modo "ver" (padrão): a suíte é uma **Biblioteca reduzida** — os mesmos
 *   cards da Biblioteca (rodar, etiquetar, editar o script), a mesma barra de
 *   busca/filtro, só que contendo apenas os testes da suíte e **na ordem da
 *   sequência**, numerados. É o que a Isa pediu em 22/09: abrir a suíte é
 *   consultar, não mexer.
 * - modo "editar": a montagem em duas colunas (Biblioteca inteira à esquerda
 *   com o "+", sequência à direita com arrastar/↑/↓/remover). É a mesma tela
 *   de quando se cria a suíte — de propósito: criar e editar não podem ser
 *   dois jeitos diferentes de fazer a mesma coisa.
 *
 * `/suites/nova` cria (já abre em "editar"); `/suites/<uuid>` abre em "ver".
 * O literal "nova" nunca colide com um id real porque suíte tem id uuid.
 *
 * Nada salva sozinho no modo editar: a sequência inteira sobe num PATCH/POST
 * só, no botão Salvar. Etiquetar um script no modo ver, sim, salva na hora
 * (é o card da Biblioteca, mesmo comportamento de lá).
 */

const NOVA = "nova";

// Chaves próprias, fora do namespace "scripts:*" compartilhado entre
// Biblioteca e Checklist: filtrar aqui não pode mexer no que ela deixou
// filtrado nas outras telas (nem o contrário).
const FILTER_KEYS = {
  avatar: "suiteBuilder:avatarFilter",
  ambiente: "suiteBuilder:ambienteFilter",
  tag: "suiteBuilder:tagFilter",
  search: "suiteBuilder:search",
};

export default function SuitePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params?.id || NOVA);
  const isNova = id === NOVA;

  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modo, setModo] = useState<"ver" | "editar">(isNova ? "editar" : "ver");

  // --- identidade da suíte ---
  const [nome, setNome] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  // --- a sequência (ids na ordem) ---
  const [sequencia, setSequencia] = useState<string[]>([]);
  // Cópia do que veio do banco: serve pra saber se há mudança pendente e pra
  // desfazer no "Cancelar".
  const [original, setOriginal] = useState<{ nome: string; tags: string[]; sequencia: string[] }>({
    nome: "",
    tags: [],
    sequencia: [],
  });

  const [salvando, setSalvando] = useState(false);
  const [salvoAgora, setSalvoAgora] = useState(false);

  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [salvandoTagsId, setSalvandoTagsId] = useState<string | null>(null);

  const [avatarFilter, setAvatarFilter] = usePersistedState<MultiFilter>(FILTER_KEYS.avatar, emptyFilter("OR"));
  const [ambienteFilter, setAmbienteFilter] = usePersistedState<MultiFilter>(FILTER_KEYS.ambiente, emptyFilter("OR"));
  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>(FILTER_KEYS.tag, emptyFilter("AND"));
  const [search, setSearch] = usePersistedState(FILTER_KEYS.search, "");

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // --- coisas que só o modo "ver" usa (são as da Biblioteca) ---
  const [runMsg, setRunMsg] = useState<{ id: string; text: string; url?: string; ok: boolean } | null>(null);
  const [localScript, setLocalScript] = useState<ScriptEntry | null>(null);
  const [optHeaded, setOptHeaded] = useState(false);
  const [optWorkers, setOptWorkers] = useState(false);
  const [workersCount, setWorkersCount] = useState(2);
  const [cmdAberto, setCmdAberto] = useState(false);

  useEffect(() => {
    const pedidos: Promise<any>[] = [fetch("/api/scripts").then((r) => r.json())];
    if (!isNova) pedidos.push(fetch(`/api/suites/${id}`).then((r) => r.json()));

    Promise.all(pedidos)
      .then(([scriptsData, suiteData]) => {
        if (scriptsData.error) throw new Error(scriptsData.error);
        setScripts(scriptsData.scripts);
        if (suiteData) {
          if (suiteData.error) throw new Error(suiteData.error);
          const s = suiteData.suite as Suite;
          setNome(s.name);
          setTags(s.tags || []);
          setSequencia(s.scriptIds);
          setOriginal({ nome: s.name, tags: s.tags || [], sequencia: s.scriptIds });
        }
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [id, isNova]);

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

  /** A sequência resolvida em scripts, na ordem, com a posição de cada um. */
  const sequenciaResolvida = useMemo(
    () =>
      sequencia
        .map((scriptId, i) => ({ pos: i + 1, scriptId, script: scriptsById.get(scriptId) }))
        .filter((x) => x.script),
    [sequencia, scriptsById]
  );

  // As opções do filtro saem do que está na tela: no modo ver, só o que a
  // suíte tem (filtrar por um avatar que não está na suíte não faria sentido);
  // no modo editar, a Biblioteca inteira.
  const universo = useMemo(
    () => (modo === "ver" ? (sequenciaResolvida.map((x) => x.script) as ScriptEntry[]) : scripts),
    [modo, sequenciaResolvida, scripts]
  );
  const avatars = useMemo(() => Array.from(new Set(universo.map((s) => s.avatar))).sort(), [universo]);
  const ambientes = useMemo(() => Array.from(new Set(universo.map((s) => s.ambiente))).sort(), [universo]);
  const allTags = useMemo(() => Array.from(new Set(universo.flatMap((s) => s.tags))).sort(), [universo]);

  /** Mesma regra de filtro da Biblioteca — "buscar aqui" é igual a "buscar lá". */
  function passaNoFiltro(s: ScriptEntry) {
    if (!matchesFilter([s.avatar], avatarFilter)) return false;
    if (!matchesFilter([s.ambiente], ambienteFilter)) return false;
    if (!matchesFilter(s.tags, tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${s.name} ${s.cenario} ${s.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }

  /** Modo ver: a sequência filtrada, mantendo a posição original de cada um. */
  const visiveis = useMemo(
    () => sequenciaResolvida.filter((x) => passaNoFiltro(x.script as ScriptEntry)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sequenciaResolvida, avatarFilter, ambienteFilter, tagFilter, search]
  );

  /** Modo editar: a Biblioteca inteira, filtrada. */
  const filtrados = useMemo(
    () => scripts.filter(passaNoFiltro),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scripts, avatarFilter, ambienteFilter, tagFilter, search]
  );

  const naSequencia = useMemo(() => new Set(sequencia), [sequencia]);
  const faltamAdicionar = filtrados.filter((s) => !naSequencia.has(s.id));

  const mudou =
    nome !== original.nome ||
    tags.join("\u0000") !== original.tags.join("\u0000") ||
    sequencia.join("\u0000") !== original.sequencia.join("\u0000");

  // ---------- edição da sequência ----------

  function adicionar(scriptId: string) {
    setSequencia((prev) => (prev.includes(scriptId) ? prev : [...prev, scriptId]));
    setSalvoAgora(false);
  }

  function adicionarVisiveis() {
    setSequencia((prev) => [...prev, ...faltamAdicionar.map((s) => s.id)]);
    setSalvoAgora(false);
  }

  function remover(scriptId: string) {
    setSequencia((prev) => prev.filter((x) => x !== scriptId));
    setSalvoAgora(false);
  }

  function mover(scriptId: string, delta: number) {
    setSequencia((prev) => {
      const i = prev.indexOf(scriptId);
      const destino = i + delta;
      if (i === -1 || destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      copia.splice(i, 1);
      copia.splice(destino, 0, scriptId);
      return copia;
    });
    setSalvoAgora(false);
  }

  /** Solta `arrastado` na posição de `alvo` dentro da sequência. */
  function soltar(arrastado: string, alvo: string) {
    if (arrastado === alvo) return;
    setSequencia((prev) => {
      const de = prev.indexOf(arrastado);
      const para = prev.indexOf(alvo);
      if (de === -1 || para === -1) return prev;
      const copia = [...prev];
      copia.splice(de, 1);
      copia.splice(para, 0, arrastado);
      return copia;
    });
    setSalvoAgora(false);
  }

  async function salvar() {
    if (!nome.trim()) {
      setError("Dê um nome para a suíte.");
      return;
    }
    setSalvando(true);
    setError(null);
    try {
      const res = await fetch(isNova ? "/api/suites" : `/api/suites/${id}`, {
        method: isNova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome.trim(), scriptIds: sequencia, tags }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (isNova) {
        router.push(`/suites/${data.suite.id}`);
        return;
      }
      setOriginal({ nome: nome.trim(), tags, sequencia });
      setSalvoAgora(true);
      setModo("ver");
      setTimeout(() => setSalvoAgora(false), 2500);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSalvando(false);
    }
  }

  function cancelarEdicao() {
    if (isNova) {
      router.push("/suites");
      return;
    }
    setNome(original.nome);
    setTags(original.tags);
    setSequencia(original.sequencia);
    setError(null);
    setModo("ver");
  }

  function limparFiltro() {
    setAvatarFilter(emptyFilter("OR"));
    setAmbienteFilter(emptyFilter("OR"));
    setTagFilter(emptyFilter("AND"));
    setSearch("");
  }

  // ---------- ações do card (modo ver = card da Biblioteca) ----------

  /** Marca/desmarca etiqueta do SCRIPT direto no card (otimista), igual na Biblioteca. */
  async function alternarTagScript(s: ScriptEntry, tag: string) {
    const novas = s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag];
    const antes = scripts;
    setScripts((prev) => prev.map((x) => (x.id === s.id ? { ...x, tags: novas } : x)));
    setSalvandoTagsId(s.id);
    setRunMsg(null);
    try {
      const res = await fetch(`/api/scripts/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: novas }),
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

  if (loading) return <p className="empty">Carregando...</p>;

  const editando = modo === "editar";

  return (
    <div>
      <div className="page-header-row">
        <div>
          <Link className="btn btn-ghost" href="/suites" style={{ marginBottom: 6, display: "inline-block" }}>
            ← Voltar para as suítes
          </Link>
          <h1>{isNova ? "Nova suíte" : nome || "Suíte"}</h1>
          <p className="subtitle">
            {editando
              ? "Monte a sequência: a ordem daqui vale só para esta suíte, a da Biblioteca continua como está."
              : `${sequencia.length} teste(s), na ordem em que vão rodar.`}
          </p>
          {!editando && tags.length > 0 && (
            <div className="tags" style={{ marginTop: 4 }}>
              {sortTagsByColor(tags, (t) => tagColors[t]).map((t) => (
                <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="header-actions">
          {salvoAgora && <span className="status-msg ok">Salvo.</span>}
          {editando ? (
            <>
              <button type="button" className="btn-secondary" onClick={cancelarEdicao} disabled={salvando}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={salvar}
                disabled={salvando || (!mudou && !isNova)}
              >
                {salvando ? "Salvando..." : "Salvar suíte"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCmdAberto(true)}
                disabled={sequenciaResolvida.length === 0}
              >
                Rodar no terminal
              </button>
              <button type="button" className="btn-primary" onClick={() => setModo("editar")}>
                Editar sequência
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="status-msg err">{error}</p>}

      {editando && (
        <div className="suite-identity">
          <div className="field">
            <label>Nome da suíte</label>
            <input
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setSalvoAgora(false);
              }}
              placeholder="Ex.: Regressão POP — homologação"
            />
          </div>
          <div className="field">
            <label>Etiquetas da suíte</label>
            <div className="suite-tag-row">
              {sortTagsByColor(tags, (t) => tagColors[t]).map((t) => (
                <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>
                  {t}
                </span>
              ))}
              {tags.length === 0 && <span className="empty-hint">Nenhuma ainda</span>}
              <TagQuickAdd
                options={availableTags}
                selected={tags}
                onToggle={(t) => {
                  setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
                  setSalvoAgora(false);
                }}
                onCatalogChange={aplicarCatalogo}
              />
            </div>
          </div>
        </div>
      )}

      <div className="filters">
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
          label="Filtrar por etiqueta"
          options={allTags.map((t) => ({ name: t, color: tagColors[t] }))}
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
        <button type="button" className="btn-ghost" onClick={limparFiltro}>
          Limpar filtro
        </button>
      </div>

      {/* ============================ MODO VER ============================ */}
      {!editando && (
        <>
          {sequencia.length === 0 && (
            <p className="empty">
              Esta suíte ainda não tem teste nenhum. Clique em "Editar sequência" pra montar.
            </p>
          )}
          {sequencia.length > 0 && visiveis.length === 0 && (
            <p className="empty">Nenhum teste da suíte com esse filtro.</p>
          )}

          {visiveis.map(({ pos, script }) => {
            const s = script as ScriptEntry;
            return (
              <div className="card" key={s.id}>
                <span className="suite-item-num" title={`Posição ${pos} na sequência`}>
                  {pos}
                </span>
                <div className="card-main">
                  <div className="card-info">
                    <a className="card-title-link" href={`/upload?id=${s.id}`}>
                      <h3>{s.name}</h3>
                    </a>
                    <div className="meta">
                      {s.avatar} · {s.ambiente} · {s.cenario} · {s.framework}
                      {s.tela ? ` · ${s.tela}` : ""}
                    </div>
                    <div className="tags" style={{ alignItems: "center" }}>
                      {sortTagsByColor(s.tags, (t) => tagColors[t]).map((t) => (
                        <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>
                          {t}
                        </span>
                      ))}
                      <TagQuickAdd
                        options={availableTags}
                        selected={s.tags}
                        onToggle={(t) => alternarTagScript(s, t)}
                        onCatalogChange={aplicarCatalogo}
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
                      setOptHeaded(false);
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
            );
          })}
        </>
      )}

      {/* =========================== MODO EDITAR =========================== */}
      {editando && (
        <div className="suite-builder">
          {/* ----- Esquerda: a Biblioteca, pra achar o teste ----- */}
          <section className="suite-col">
            <div className="suite-col-head">
              <h2>
                Biblioteca <span className="suite-col-count">({filtrados.length})</span>
              </h2>
              <button
                type="button"
                className="btn-secondary"
                onClick={adicionarVisiveis}
                disabled={faltamAdicionar.length === 0}
              >
                Adicionar os {faltamAdicionar.length} visíveis
              </button>
            </div>
            <div className="suite-col-body">
              {filtrados.length === 0 && <p className="suite-col-empty">Nenhum script com esse filtro.</p>}
              {filtrados.map((s) => {
                const dentro = naSequencia.has(s.id);
                return (
                  <div className={`suite-item${dentro ? " ja-na-sequencia" : ""}`} key={s.id}>
                    <div className="suite-item-info">
                      <div className="suite-item-title">
                        <IconFlask size={12} />
                        <span>{s.name}</span>
                      </div>
                      <div className="meta">
                        {s.avatar} · {s.ambiente} · {s.cenario}
                      </div>
                      {s.tags.length > 0 && (
                        <div className="tags">
                          {sortTagsByColor(s.tags, (t) => tagColors[t]).map((t) => (
                            <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="suite-item-btns">
                      {dentro ? (
                        <button
                          type="button"
                          className="suite-item-btn remove"
                          onClick={() => remover(s.id)}
                          title="Tirar da sequência"
                          aria-label={`Tirar ${s.name} da sequência`}
                        >
                          <IconX size={14} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="suite-item-btn add"
                          onClick={() => adicionar(s.id)}
                          title="Adicionar no fim da sequência"
                          aria-label={`Adicionar ${s.name} na sequência`}
                        >
                          <IconPlus size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ----- Direita: a sequência, na ordem em que vai rodar ----- */}
          <section className="suite-col">
            <div className="suite-col-head">
              <h2>
                Sequência <span className="suite-col-count">({sequencia.length})</span>
              </h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSequencia([]);
                  setSalvoAgora(false);
                }}
                disabled={sequencia.length === 0}
              >
                Limpar
              </button>
            </div>
            <div className="suite-col-body">
              {sequencia.length === 0 && (
                <p className="suite-col-empty">
                  Vazia. Use o + da esquerda pra trazer os testes, depois arraste pra ordenar.
                </p>
              )}
              {sequencia.map((scriptId, i) => {
                const s = scriptsById.get(scriptId);
                return (
                  <div
                    key={scriptId}
                    className={`suite-item${dragId === scriptId ? " dragging" : ""}${
                      dragOverId === scriptId && dragId && dragId !== scriptId ? " drag-over" : ""
                    }`}
                    onDragOver={(e) => {
                      if (!dragId || dragId === scriptId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverId !== scriptId) setDragOverId(scriptId);
                    }}
                    onDragLeave={() => {
                      setDragOverId((prev) => (prev === scriptId ? null : prev));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId && dragId !== scriptId) soltar(dragId, scriptId);
                      setDragId(null);
                      setDragOverId(null);
                    }}
                  >
                    {/* Só a alça é draggable — mesmo padrão da Biblioteca, pra os
                        botões do item continuarem clicáveis sem truque nenhum. */}
                    <span
                      className="drag-handle"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(scriptId);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      title="Arrastar pra reordenar"
                      aria-label={`Arrastar ${s?.name || scriptId} pra reordenar`}
                    >
                      <IconGripVertical size={15} />
                    </span>
                    <span className="suite-item-num">{i + 1}</span>
                    <div className="suite-item-info">
                      <div className="suite-item-title">
                        <IconFlask size={12} />
                        <span>{s ? s.name : "(script apagado)"}</span>
                      </div>
                      <div className="meta">
                        {s ? `${s.avatar} · ${s.ambiente} · ${s.cenario}` : "Não está mais na Biblioteca"}
                      </div>
                    </div>
                    <div className="suite-item-btns">
                      <button
                        type="button"
                        className="suite-item-btn"
                        onClick={() => mover(scriptId, -1)}
                        disabled={i === 0}
                        title="Subir uma posição"
                        aria-label="Subir uma posição"
                      >
                        <IconArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="suite-item-btn"
                        onClick={() => mover(scriptId, 1)}
                        disabled={i === sequencia.length - 1}
                        title="Descer uma posição"
                        aria-label="Descer uma posição"
                      >
                        <IconArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="suite-item-btn remove"
                        onClick={() => remover(scriptId)}
                        title="Tirar da sequência"
                        aria-label="Tirar da sequência"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {cmdAberto && (
        <SuiteCommandModal
          nome={nome}
          scripts={sequenciaResolvida.map((x) => x.script as ScriptEntry)}
          onClose={() => setCmdAberto(false)}
        />
      )}

      {localScript && (
        <div className="modal-backdrop" onClick={() => setLocalScript(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Comando para {localScript.name}</h3>
            <p className="hint">Copie e cole no terminal.</p>
            <div className="cmd-options">
              <label className="checkbox-row">
                <input type="checkbox" checked={optHeaded} onChange={(e) => setOptHeaded(e.target.checked)} />
                --headed
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={optWorkers} onChange={(e) => setOptWorkers(e.target.checked)} />
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
    </div>
  );
}
