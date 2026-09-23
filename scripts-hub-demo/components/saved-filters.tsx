"use client";

import { useCallback, useEffect, useState } from "react";
import { PopoverMenu } from "./popover-menu";
import { MultiFilter, emptyFilter, filterValueCount, normalizeFilter } from "@/lib/filters";
import { SavedFilter } from "@/lib/types";

/** A barra de filtros inteira — é exatamente isto que um filtro salvo guarda. */
export type FilterBarState = {
  tagFilter: MultiFilter;
  avatarFilter: MultiFilter;
  ambienteFilter: MultiFilter;
  busca: string;
};

type Props = FilterBarState & {
  onApply: (next: FilterBarState) => void;
};

/** Assinatura estável da barra inteira, pra saber se o que está na tela agora
 *  é exatamente igual a um filtro já salvo. */
function fingerprint(state: FilterBarState): string {
  return JSON.stringify({
    t: normalizeFilter(state.tagFilter),
    a: normalizeFilter(state.avatarFilter),
    e: normalizeFilter(state.ambienteFilter),
    b: (state.busca || "").trim(),
  });
}

/** Presets criados antes de avatar/ambiente entrarem no escopo não têm essas
 *  colunas. Aplicar um deles LIMPA avatar e ambiente em vez de deixar sobrar o
 *  que estava na tela — aplicar um filtro salvo tem que dar sempre o mesmo
 *  resultado, não depender do que havia antes. */
function stateOf(item: SavedFilter): FilterBarState {
  return {
    tagFilter: normalizeFilter(item.tagFilter),
    avatarFilter: normalizeFilter(item.avatarFilter ?? emptyFilter("OR")),
    ambienteFilter: normalizeFilter(item.ambienteFilter ?? emptyFilter("OR")),
    busca: item.busca || "",
  };
}

/**
 * Filtros salvos: guarda no banco a combinação de blocos/grupos de etiqueta
 * que está na tela + o termo da busca, com um nome, pra reaplicar num clique.
 *
 * Fica ao lado dos FilterPopover na barra `.filters` da Biblioteca e do
 * Checklist. Como as duas telas dividem a mesma chave de sessionStorage
 * (ver lib/sharedFilterKeys.ts), aplicar um filtro salvo numa delas já deixa
 * a outra filtrada do mesmo jeito.
 */
export function SavedFilters({ tagFilter, avatarFilter, ambienteFilter, busca, onApply }: Props) {
  const [items, setItems] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/saved-filters");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar os filtros salvos.");
      setItems(data.savedFilters || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const atual: FilterBarState = { tagFilter, avatarFilter, ambienteFilter, busca };
  const current = fingerprint(atual);
  const activeId = items.find((i) => fingerprint(stateOf(i)) === current)?.id ?? null;
  const nothingToSave =
    filterValueCount(tagFilter) === 0 &&
    filterValueCount(avatarFilter) === 0 &&
    filterValueCount(ambienteFilter) === 0 &&
    !busca.trim();

  /** O que vai pro banco ao salvar ou atualizar: a barra inteira. */
  function payload() {
    return {
      tagFilter: normalizeFilter(tagFilter),
      avatarFilter: normalizeFilter(avatarFilter),
      ambienteFilter: normalizeFilter(ambienteFilter),
      busca,
    };
  }

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não deu certo.");
      setError(null);
      await load();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function salvar() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || nothingToSave) return;
    const ok = await call("/api/saved-filters", {
      method: "POST",
      body: JSON.stringify({ nome: nomeLimpo, ...payload() }),
    });
    if (ok) setNome("");
  }

  async function atualizar(item: SavedFilter) {
    await call(`/api/saved-filters/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload()),
    });
  }

  async function excluir(item: SavedFilter) {
    await call(`/api/saved-filters/${item.id}`, { method: "DELETE" });
  }

  return (
    <PopoverMenu
      panelWidth={300}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          onClick={toggle}
        >
          Filtros salvos
          {items.length > 0 && <span className="tag-filter-badge">{items.length}</span>}
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.3 }}>
              SALVAR O FILTRO ATUAL
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                placeholder="Nome do filtro..."
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    salvar();
                  }
                }}
                disabled={nothingToSave}
                style={{
                  flex: "1 1 auto",
                  width: "auto",
                  minWidth: 0,
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: "var(--card)",
                  color: "var(--text)",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={salvar}
                disabled={busy || nothingToSave || !nome.trim()}
                style={{ flexShrink: 0, padding: "8px 12px", fontSize: 13 }}
              >
                Salvar
              </button>
            </div>
            {nothingToSave && (
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                Monte algum filtro (etiqueta, avatar, ambiente ou busca) pra poder salvar.
              </span>
            )}
          </div>

          {error && (
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--danger, #dc2626)" }}>{error}</p>
          )}

          <div style={{ height: 1, background: "var(--border)", margin: "0 0 8px" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
            {loading && <p style={{ margin: 0, padding: "8px 4px", fontSize: 13, color: "var(--muted)" }}>Carregando...</p>}

            {!loading && items.length === 0 && (
              <p style={{ margin: 0, padding: "8px 4px", fontSize: 13, color: "var(--muted)" }}>
                Nenhum filtro salvo ainda.
              </p>
            )}

            {items.map((item) => {
              const ativo = item.id === activeId;
              return (
                <div
                  key={item.id}
                  style={{
                    border: `1px solid ${ativo ? "var(--accent-soft-strong)" : "var(--border)"}`,
                    background: ativo ? "var(--accent-soft)" : "transparent",
                    borderRadius: 8,
                    padding: 7,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApply(stateOf(item));
                      close();
                    }}
                    title="Aplicar este filtro"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      color: ativo ? "var(--accent-dark)" : "var(--text)",
                      fontFamily: "inherit",
                    }}
                  >
                    {item.nome}
                    {ativo && <span style={{ fontSize: 11, fontWeight: 700 }}> · aplicado</span>}
                  </button>

                  <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                    <button
                      type="button"
                      onClick={() => atualizar(item)}
                      disabled={busy || nothingToSave || ativo}
                      title="Regravar este filtro salvo com o que está na tela agora"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 11.5,
                        cursor: busy || nothingToSave || ativo ? "default" : "pointer",
                        color: busy || nothingToSave || ativo ? "var(--border-strong)" : "var(--muted)",
                        fontFamily: "inherit",
                      }}
                    >
                      atualizar com o atual
                    </button>
                    <button
                      type="button"
                      onClick={() => excluir(item)}
                      disabled={busy}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 11.5,
                        cursor: "pointer",
                        color: "var(--muted)",
                        fontFamily: "inherit",
                      }}
                    >
                      excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </PopoverMenu>
  );
}
