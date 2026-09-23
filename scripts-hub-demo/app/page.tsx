"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ScriptEntry, Tag } from "@/lib/types";
import { IconFolder, IconChevronRight, IconFlask, IconTrash, IconDots, IconExternalLink, IconGripVertical } from "./icons";
import { FilterPopover } from "@/components/filter-popover";
import { emptyFilter, filterValueCount, isSingleActive, matchesFilter, singleValueFilter, MultiFilter } from "@/lib/filters";
import { SCRIPT_FILTER_KEYS } from "@/lib/sharedFilterKeys";
import { SavedFilters } from "@/components/saved-filters";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { TagQuickAdd } from "@/components/tag-quick-add";
import { usePersistedState } from "@/lib/usePersistedState";
// Montagem dos comandos de terminal (22/09/2026: saiu daqui pra lib porque a
// tela de Suites usa o mesmo comando, na ordem da sequencia).
import { buildBatchCommand, localCommand } from "@/lib/comandoLote";

type ColorMap = Record<string, string>;

export default function LibraryPage() {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [avatarFilter, setAvatarFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.avatar, emptyFilter("OR"));
  const [ambienteFilter, setAmbienteFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.ambiente, emptyFilter("OR"));
  const [search, setSearch] = usePersistedState(SCRIPT_FILTER_KEYS.search, "");

  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.tag, emptyFilter("AND"));

  const [localScript, setLocalScript] = useState<ScriptEntry | null>(null);
  const [optHeaded, setOptHeaded] = useState(false);
  const [optWorkers, setOptWorkers] = useState(false);
  const [workersCount, setWorkersCount] = useState(2);

  const [runMsg, setRunMsg] = useState<{ id: string; text: string; url?: string; ok: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ScriptEntry | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<{ avatar: string; ambiente?: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  const [colors, setColors] = useState<ColorMap>({});
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [actionsUrl, setActionsUrl] = useState<string | null>(null);

  // --- Seleção múltipla / rodar vários no terminal ---
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOptionsOpen, setBatchOptionsOpen] = useState(false);
  const [batchSleep, setBatchSleep] = useState(true);
  const [batchSleepSeconds, setBatchSleepSeconds] = useState(10);
  const [batchWorkers, setBatchWorkers] = useState(false);
  const [batchHeaded, setBatchHeaded] = useState(false);
  const [batchCopied, setBatchCopied] = useState(false);

  useEffect(() => {
    fetch("/api/scripts")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setScripts(data.scripts);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
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
    try {
      const raw = localStorage.getItem("sidebarColors");
      if (raw) setColors(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sidebarCollapsed");
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {}
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

  function setColor(key: string, color: string) {
    setColors((prev) => {
      const next = { ...prev, [key]: color };
      try {
        localStorage.setItem("sidebarColors", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("sidebarCollapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
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

  const filtered = scripts.filter((s) => {
    if (!matchesFilter([s.avatar], avatarFilter)) return false;
    if (!matchesFilter([s.ambiente], ambienteFilter)) return false;
    if (!matchesFilter(s.tags, tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${s.name} ${s.cenario} ${s.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function ambientesInAvatar(avatar: string) {
    return Array.from(
      new Set(scripts.filter((s) => s.avatar === avatar).map((s) => s.ambiente))
    ).sort();
  }

  function scriptsInGroup(avatar: string, ambiente: string) {
    return scripts.filter((s) => s.avatar === avatar && s.ambiente === ambiente);
  }

  function scriptsInFolder(avatar: string, ambiente?: string) {
    return scripts.filter((s) => s.avatar === avatar && (!ambiente || s.ambiente === ambiente));
  }

  // --- seleção múltipla: helpers ---
  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelectedIds([]);
      return !prev;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((s) => s.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  const selectedScripts = scripts.filter((s) => selectedIds.includes(s.id));
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.includes(s.id));

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
    const tags = s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag];

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
    const lista = filtered;
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
    } catch (e: any) {
      setRunMsg({ id: s.id, text: e.message, ok: false });
    } finally {
      setDeletingId(null);
    }
  }

  function requestDeleteFolder(avatar: string, ambiente?: string) {
    setMenuOpenId(null);
    setConfirmDeleteFolder({ avatar, ambiente });
  }

  async function confirmDeleteFolderAction() {
    const target = confirmDeleteFolder;
    if (!target) return;
    const toDelete = scriptsInFolder(target.avatar, target.ambiente);
    setConfirmDeleteFolder(null);
    setDeletingFolder(true);
    setRunMsg(null);
    const failed: string[] = [];
    for (const s of toDelete) {
      try {
        const res = await fetch(`/api/scripts/${s.id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setScripts((prev) => prev.filter((x) => x.id !== s.id));
        setSelectedIds((prev) => prev.filter((id) => id !== s.id));
      } catch (e: any) {
        failed.push(s.name);
      }
    }
    setDeletingFolder(false);
    if (
      isSingleActive(avatarFilter, target.avatar) &&
      (!target.ambiente || isSingleActive(ambienteFilter, target.ambiente))
    ) {
      setAvatarFilter(emptyFilter("OR"));
      setAmbienteFilter(emptyFilter("OR"));
    }
    if (failed.length > 0) {
      setError(`Falha ao apagar: ${failed.join(", ")}`);
    }
  }

  return (
    <div className="page-with-sidebar">
      <aside className="sidebar">
        <div className="sidebar-title">Pastas</div>
        {avatars.map((avatar) => {
          const avatarCollapsed = !!collapsed[avatar];
          const avatarActive = isSingleActive(avatarFilter, avatar) && filterValueCount(ambienteFilter) === 0;
          return (
            <div key={avatar}>
              <div
                className={`folder-row${avatarActive ? " active" : ""}`}
                style={{ borderLeftColor: colors[avatar] || "var(--accent)" }}
              >
                <button
                  className="folder-toggle"
                  onClick={() => toggleCollapsed(avatar)}
                  title={avatarCollapsed ? "Expandir pasta" : "Minimizar pasta"}
                >
                  <IconChevronRight size={13} className={`icon-chevron${avatarCollapsed ? "" : " open"}`} />
                </button>
                <button
                  className="folder-label"
                  onClick={() => {
                    setAvatarFilter(singleValueFilter(avatar, "OR"));
                    setAmbienteFilter(emptyFilter("OR"));
                  }}
                >
                  <IconFolder size={15} />
                  {avatar}
                </button>
                <input
                  type="color"
                  className="color-dot"
                  value={colors[avatar] || "#5b5bf0"}
                  onChange={(e) => setColor(avatar, e.target.value)}
                  title="Cor da pasta"
                />
                <button
                  className="folder-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDeleteFolder(avatar);
                  }}
                  title="Apagar pasta"
                  aria-label={`Apagar pasta ${avatar}`}
                >
                  <IconTrash size={14} />
                </button>
              </div>
              {!avatarCollapsed && ambientesInAvatar(avatar).map((amb) => {
                const key = `${avatar}/${amb}`;
                const ambCollapsed = !!collapsed[key];
                const ambActive = isSingleActive(avatarFilter, avatar) && isSingleActive(ambienteFilter, amb);
                return (
                  <div key={key}>
                    <div
                      className={`subfolder-row${ambActive ? " active" : ""}`}
                      style={{ borderLeftColor: colors[key] || "var(--accent-dark)" }}
                    >
                      <button
                        className="folder-toggle"
                        onClick={() => toggleCollapsed(key)}
                        title={ambCollapsed ? "Expandir pasta" : "Minimizar pasta"}
                      >
                        <IconChevronRight size={13} className={`icon-chevron${ambCollapsed ? "" : " open"}`} />
                      </button>
                      <button
                        className="subfolder-label"
                        onClick={() => {
                          setAvatarFilter(singleValueFilter(avatar, "OR"));
                          setAmbienteFilter(singleValueFilter(amb, "OR"));
                        }}
                      >
                        <IconFolder size={14} />
                        {amb}
                      </button>
                      <input
                        type="color"
                        className="color-dot"
                        value={colors[key] || "#4444d1"}
                        onChange={(e) => setColor(key, e.target.value)}
                        title="Cor da subpasta"
                      />
                      <button
                        className="folder-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteFolder(avatar, amb);
                        }}
                        title="Apagar subpasta"
                        aria-label={`Apagar subpasta ${avatar}/${amb}`}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                    {!ambCollapsed && scriptsInGroup(avatar, amb).map((s) => {
                      const skey = `${avatar}/${amb}/${s.id}`;
                      return (
                        <div
                          key={s.id}
                          className="script-row"
                          style={{ borderLeftColor: colors[skey] || "transparent" }}
                        >
                          <button
                            className="script-btn"
                            style={{ color: colors[skey] || undefined }}
                            onClick={() => {
                              setAvatarFilter(singleValueFilter(avatar, "OR"));
                              setAmbienteFilter(singleValueFilter(amb, "OR"));
                              setSearch(s.name);
                            }}
                          >
                            <IconFlask size={13} />
                            {s.name}
                          </button>
                          <input
                            type="color"
                            className="color-dot"
                            value={colors[skey] || "#1c1c28"}
                            onChange={(e) => setColor(skey, e.target.value)}
                            title="Cor do script"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </aside>

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

        {selectMode && filtered.length > 0 && (
          <label className="select-all-row">
            <input
              type="checkbox"
              className="card-checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
            />
            Selecionar todos os visíveis ({filtered.length})
          </label>
        )}

        {loading && <p className="empty">Carregando...</p>}
        {error && <p className="status-msg err">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="empty">Nenhum script encontrado. Envie um em "Enviar script".</p>
        )}

        {filtered.map((s) => {
          const isSelected = selectedIds.includes(s.id);
          return (
            <div
              className={`card${isSelected ? " selected" : ""}${dragId === s.id ? " dragging" : ""}${dragOverId === s.id && dragId && dragId !== s.id ? " drag-over" : ""}`}
              key={s.id}
              onDragOver={(e) => {
                if (!dragId || dragId === s.id) return;
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
              <span
                className="drag-handle"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(s.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                title="Arrastar pra reordenar"
                aria-label={`Arrastar ${s.name} pra reordenar`}
              >
                <IconGripVertical size={16} />
              </span>
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
                  <div className="card-menu">
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

        {selectMode && selectedIds.length > 0 && (
          <div className="batch-bar">
            <div className="batch-bar-top">
              <div className="batch-count">
                <span>{selectedIds.length}</span> selecionado{selectedIds.length > 1 ? "s" : ""}
              </div>
              <div className="batch-actions">
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
        {confirmDeleteFolder && (
          <div className="modal-backdrop" onClick={() => setConfirmDeleteFolder(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>
                Você realmente deseja apagar a pasta "{confirmDeleteFolder.ambiente ? `${confirmDeleteFolder.avatar} / ${confirmDeleteFolder.ambiente}` : confirmDeleteFolder.avatar}"? {scriptsInFolder(confirmDeleteFolder.avatar, confirmDeleteFolder.ambiente).length} script(s) dentro dela também serão apagados. Esta ação não pode ser desfeita.
              </h3>
              <div className="confirm-modal-actions">
                <button className="btn-secondary" onClick={() => setConfirmDeleteFolder(null)}>
                  Cancelar
                </button>
                <button className="btn-danger-solid" disabled={deletingFolder} onClick={confirmDeleteFolderAction}>
                  {deletingFolder ? "Apagando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
