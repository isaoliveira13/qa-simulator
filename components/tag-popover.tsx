"use client";

import { useMemo, useState } from "react";
import { PopoverMenu } from "./popover-menu";

export type TagOption = { name: string; color?: string };

type Props = {
  label: string;
  options: TagOption[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear?: () => void;
};

/** Popover de seleção múltipla de tags, com opção de busca, sempre em ordem alfabética. */
export function TagPopover({ label, options, selected, onToggle, onClear }: Props) {
  const [search, setSearch] = useState("");

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [options]
  );
  const visible = useMemo(
    () => sorted.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())),
    [sorted, search]
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <PopoverMenu
        trigger={({ toggle }) => (
          <button
            type="button"
            className="btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            onClick={toggle}
          >
            {label}
            {selected.length > 0 && <span className="tag-filter-badge">{selected.length}</span>}
          </button>
        )}
      >
        {() => (
          <>
            <input
              autoFocus
              placeholder="Buscar etiqueta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                flex: "none",
                minWidth: 0,
                marginBottom: 8,
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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                maxHeight: 240,
                overflowY: "auto",
                overflowX: "hidden",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {visible.map((opt) => (
                <label
                  key={opt.name}
                  className="popover-menu-item"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "nowrap",
                    gap: 8,
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: 14,
                    fontWeight: 400,
                    lineHeight: 1.3,
                    padding: "7px 6px",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: "var(--text)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.name)}
                    onChange={() => onToggle(opt.name)}
                    style={{
                      flex: "0 0 auto",
                      flexShrink: 0,
                      minWidth: 0,
                      accentColor: "var(--accent)",
                      width: 15,
                      height: 15,
                    }}
                  />
                  {opt.color && (
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: opt.color,
                        flexShrink: 0,
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    />
                  )}
                  <span
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                    }}
                  >
                    {opt.name}
                  </span>
                </label>
              ))}
              {visible.length === 0 && (
                <p style={{ padding: "12px 4px", fontSize: 13, color: "var(--muted)", margin: 0 }}>
                  Nenhuma etiqueta encontrada.
                </p>
              )}
            </div>
          </>
        )}
      </PopoverMenu>

      {onClear && selected.length > 0 && (
        <button type="button" className="tag-filter-clear" onClick={onClear}>
          Limpar filtro
        </button>
      )}
    </div>
  );
}
