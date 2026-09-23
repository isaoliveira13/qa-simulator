"use client";

import { useEffect, useMemo, useState } from "react";
import { CoverageItem, Tag } from "@/lib/types";
import { TELAS } from "@/lib/telas";
import { IconCheck, IconChevronRight, IconPencil, IconTrash } from "../icons";
import { TagPopover } from "@/components/tag-popover";
import { FilterPopover } from "@/components/filter-popover";
import { SelectPopover } from "@/components/select-popover";
import { emptyFilter, filterValueCount, matchesFilter, MultiFilter } from "@/lib/filters";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { usePersistedState } from "@/lib/usePersistedState";

type FormState = { nome: string; tags: string[] };

const EMPTY_FORM: FormState = { nome: "", tags: [] };

/** Situação da tela inteira (não do item) — filtra quais cards aparecem. */
const SITUACOES = ["incompletas", "completas", "vazias"];
const SITUACAO_LABELS: Record<string, string> = {
  incompletas: "Em andamento",
  completas: "100% cobertas",
  vazias: "Sem cenários",
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function CoberturaPage() {
  const [items, setItems] = useState<CoverageItem[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = usePersistedState("cobertura:search", "");
  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>(
    "cobertura:tagFilter",
    emptyFilter("AND")
  );
  const [situacaoFilter, setSituacaoFilter] = usePersistedState("cobertura:situacaoFilter", "");
  const [abertas, setAbertas] = usePersistedState<string[]>("cobertura:abertas", []);

  // Marcar/desmarcar é otimista: a linha responde na hora e o PATCH corre
  // atrás. Se o servidor recusar, volta ao valor anterior e mostra o erro.
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [formTela, setFormTela] = useState<string | null>(null);
  const [editing, setEditing] = useState<CoverageItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<CoverageItem | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    fetch("/api/coverage-items")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data.items);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) setAvailableTags(data.tags);
      })
      .catch(() => {});
  }, []);

  const tagColors = useMemo(() => {
    const map: Record<string, string> = {};
    availableTags.forEach((t) => {
      map[t.name] = t.color;
    });
    return map;
  }, [availableTags]);

  // A lista de telas vem de lib/telas.ts, mas um item cadastrado numa tela que
  // saiu de lá continua aparecendo (no fim da lista) em vez de sumir calado.
  const telas = useMemo(() => {
    const extras = Array.from(new Set(items.map((i) => i.tela))).filter((t) => !TELAS.includes(t));
    return [...TELAS, ...extras.sort()];
  }, [items]);

  const itensPorTela = useMemo(() => {
    const map: Record<string, CoverageItem[]> = {};
    for (const item of items) {
      (map[item.tela] = map[item.tela] || []).push(item);
    }
    return map;
  }, [items]);

  const todasAsTags = useMemo(
    () => Array.from(new Set(items.flatMap((i) => i.tags))).sort(),
    [items]
  );

  // A busca e o filtro de etiqueta escondem itens; a meta da tela, porém,
  // continua sendo o total cadastrado (senão a porcentagem mudaria de valor
  // só por causa de um filtro de visualização).
  function itensVisiveis(tela: string): CoverageItem[] {
    const lista = itensPorTela[tela] || [];
    const q = normalize(search.trim());
    const telaBate = q.length > 0 && normalize(tela).includes(q);
    return lista.filter((i) => {
      if (!matchesFilter(i.tags, tagFilter)) return false;
      if (!q) return true;
      if (telaBate) return true;
      return normalize(`${i.nome} ${i.tags.join(" ")}`).includes(q);
    });
  }

  function telaVisivel(tela: string): boolean {
    const lista = itensPorTela[tela] || [];
    const total = lista.length;
    const feitos = lista.filter((i) => i.feito).length;

    if (situacaoFilter === "completas" && !(total > 0 && feitos === total)) return false;
    if (situacaoFilter === "incompletas" && !(total > 0 && feitos < total)) return false;
    if (situacaoFilter === "vazias" && total > 0) return false;

    const q = normalize(search.trim());
    const filtrandoItens = q.length > 0 || filterValueCount(tagFilter) > 0;
    if (!filtrandoItens) return true;
    if (q && normalize(tela).includes(q)) return true;
    return itensVisiveis(tela).length > 0;
  }

  const telasVisiveis = telas.filter(telaVisivel);

  const totalItens = items.length;
  const totalFeitos = items.filter((i) => i.feito).length;
  const pctGeral = totalItens > 0 ? Math.round((totalFeitos / totalItens) * 100) : 0;
  const telasVazias = telas.filter((t) => (itensPorTela[t] || []).length === 0).length;

  function toggleTela(tela: string) {
    setAbertas((prev) => (prev.includes(tela) ? prev.filter((t) => t !== tela) : [...prev, tela]));
  }

  async function toggleFeito(item: CoverageItem) {
    const proximo = !item.feito;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, feito: proximo } : i)));
    setSavingIds((prev) => [...prev, item.id]);
    setError(null);
    try {
      const res = await fetch(`/api/coverage-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feito: proximo }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)));
    } catch (e: any) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, feito: item.feito } : i)));
      setError(e.message || String(e));
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== item.id));
    }
  }

  function openNewForm(tela: string) {
    setEditing(null);
    setFormTela(tela);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
    if (!abertas.includes(tela)) setAbertas((prev) => [...prev, tela]);
  }

  function openEditForm(item: CoverageItem) {
    setEditing(item);
    setFormTela(item.tela);
    setForm({ nome: item.nome, tags: item.tags });
    setFormError(null);
    setFormOpen(true);
  }

  function toggleFormTag(name: string) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name],
    }));
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      setFormError("Dê um nome pro cenário.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(
        editing ? `/api/coverage-items/${editing.id}` : "/api/coverage-items",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tela: formTela, nome: form.nome.trim(), tags: form.tags }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems((prev) =>
        editing ? prev.map((i) => (i.id === data.item.id ? data.item : i)) : [...prev, data.item]
      );
      setFormOpen(false);
    } catch (e: any) {
      setFormError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const item = confirmDelete;
    if (!item) return;
    setConfirmDelete(null);
    setSavingIds((prev) => [...prev, item.id]);
    try {
      const res = await fetch(`/api/coverage-items/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSavingIds((prev) => prev.filter((id) => id !== item.id));
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Cobertura por tela</h1>
          <p className="subtitle">
            Cadastre os cenários que cada tela do CRM precisa ter cobertos e marque conforme forem
            sendo feitos. A meta de cada tela é a quantidade de itens do seu checklist.
          </p>
        </div>
      </div>

      <div className="filters">
        <FilterPopover
          label="Filtrar por etiqueta"
          options={todasAsTags.map((t) => ({ name: t, color: tagColors[t] }))}
          filter={tagFilter}
          onChange={setTagFilter}
          onClear={() => setTagFilter(emptyFilter("AND"))}
        />
        <SelectPopover
          allLabel="Todas as telas"
          value={situacaoFilter}
          options={SITUACOES}
          onChange={setSituacaoFilter}
          formatOption={(v) => SITUACAO_LABELS[v] || v}
        />
        <input
          placeholder="Buscar por tela, cenário ou etiqueta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="checklist-summary">
        {totalItens > 0 ? (
          <>
            {totalFeitos} de {totalItens} cenários cobertos ({pctGeral}%)
            {telasVazias > 0 && ` · ${telasVazias} tela(s) ainda sem nenhum cenário cadastrado`}
          </>
        ) : (
          "Nenhum cenário de cobertura cadastrado ainda."
        )}
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && telasVisiveis.length === 0 && (
        <p className="empty">Nenhuma tela encontrada com esse filtro.</p>
      )}

      {!loading &&
        !error &&
        telasVisiveis.map((tela) => {
          const lista = itensPorTela[tela] || [];
          const total = lista.length;
          const feitos = lista.filter((i) => i.feito).length;
          const pct = total > 0 ? Math.round((feitos / total) * 100) : 0;
          const completa = total > 0 && feitos === total;
          const aberta = abertas.includes(tela);
          const visiveis = itensVisiveis(tela);
          const escondidos = total - visiveis.length;

          return (
            <div className={`cobertura-card${aberta ? " open" : ""}`} key={tela}>
              <div className="cobertura-head">
                <button
                  type="button"
                  className="cobertura-head-info"
                  onClick={() => toggleTela(tela)}
                  aria-expanded={aberta}
                >
                  <span className="cobertura-title">
                    <span className="cobertura-caret">
                      <IconChevronRight size={12} />
                    </span>
                    {tela}
                  </span>
                  <span className="meta">
                    {total > 0
                      ? `${feitos} de ${total} cenários cobertos`
                      : "sem cenários cadastrados"}
                  </span>
                  <span className="coverage-bar-track">
                    <span
                      className={`coverage-bar-fill${completa ? " full" : ""}`}
                      style={{ width: `${pct}%`, display: "block" }}
                    />
                  </span>
                </button>
                <div className="cobertura-head-actions">
                  <span className={`cobertura-pct${completa ? " full" : ""}`}>
                    {total > 0 ? `${pct}%` : "—"}
                  </span>
                  <button type="button" className="btn-secondary" onClick={() => openNewForm(tela)}>
                    Inserir cenário de teste
                  </button>
                </div>
              </div>

              {aberta && (
                <div className="cobertura-body">
                  {total === 0 && (
                    <p className="empty" style={{ margin: 0, padding: "10px 8px" }}>
                      Nenhum cenário cadastrado ainda. Esta tela não entra na conta da cobertura
                      enquanto estiver vazia.
                    </p>
                  )}

                  {total > 0 && visiveis.length === 0 && (
                    <p className="empty" style={{ margin: 0, padding: "10px 8px" }}>
                      Os {total} cenários desta tela estão escondidos pelo filtro.
                    </p>
                  )}

                  {visiveis.map((item) => (
                    <div
                      className={`cobertura-item${item.feito ? " done" : ""}`}
                      key={item.id}
                    >
                      <button
                        type="button"
                        className={`cobertura-check${item.feito ? " on" : ""}`}
                        onClick={() => toggleFeito(item)}
                        disabled={savingIds.includes(item.id)}
                        aria-pressed={item.feito}
                        aria-label={`Marcar "${item.nome}" como coberto`}
                        title={item.feito ? "Marcar como não feito" : "Marcar como feito"}
                      >
                        <IconCheck size={12} />
                      </button>
                      <div className="cobertura-item-info">
                        <div className="cobertura-item-nome">{item.nome}</div>
                        {item.tags.length > 0 && (
                          <div className="tags">
                            {sortTagsByColor(item.tags, (t) => tagColors[t]).map((t) => (
                              <span className="tag" key={t} style={tagPillStyle(tagColors[t])}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="cobertura-item-actions">
                        <button
                          type="button"
                          className="cobertura-icon-btn"
                          onClick={() => openEditForm(item)}
                          title="Editar cenário"
                          aria-label={`Editar "${item.nome}"`}
                        >
                          <IconPencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="cobertura-icon-btn danger"
                          onClick={() => setConfirmDelete(item)}
                          disabled={savingIds.includes(item.id)}
                          title="Apagar cenário"
                          aria-label={`Apagar "${item.nome}"`}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {escondidos > 0 && visiveis.length > 0 && (
                    <p className="hint" style={{ margin: "8px 0 0" }}>
                      {escondidos} cenário(s) desta tela escondido(s) pelo filtro — continuam
                      contando na meta.
                    </p>
                  )}

                  <div className="cobertura-add-row">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openNewForm(tela)}
                    >
                      + Inserir cenário de teste
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setFormOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Editar cenário de teste" : "Inserir cenário de teste"}</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Tela: <strong>{formTela}</strong>
              {!editing &&
                ` · vira mais um item do checklist e sobe a meta desta tela para ${
                  (itensPorTela[formTela || ""] || []).length + 1
                }.`}
            </p>

            <div className="field">
              <label>Nome do cenário</label>
              <input
                autoFocus
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
                placeholder="Ex.: Encerrar conversa e registrar motivo"
              />
            </div>

            <div className="field">
              <label>Etiquetas (opcional)</label>
              <TagPopover
                label="Selecionar etiquetas"
                options={availableTags}
                selected={form.tags}
                onToggle={toggleFormTag}
              />
              {form.tags.length > 0 && (
                <div className="tags" style={{ marginTop: 8 }}>
                  {form.tags.map((t) => (
                    <button
                      type="button"
                      key={t}
                      className="tag"
                      style={{
                        cursor: "pointer",
                        border: "none",
                        background: tagColors[t] || "#6366f1",
                        color: "#fff",
                      }}
                      onClick={() => toggleFormTag(t)}
                      title="Remover"
                    >
                      {t} ×
                    </button>
                  ))}
                </div>
              )}
              <div className="hint">
                Mesmo catálogo de etiquetas dos scripts. Para criar, editar ou apagar, use a aba{" "}
                <a href="/tags">Tags</a>.
              </div>
            </div>

            {formError && <div className="status-msg err">{formError}</div>}

            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar cenário"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar o cenário "{confirmDelete.nome}"?</h3>
            <p className="hint">
              A meta da tela {confirmDelete.tela} cai para{" "}
              {(itensPorTela[confirmDelete.tela] || []).length - 1} cenário(s).
            </p>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={handleDelete}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
