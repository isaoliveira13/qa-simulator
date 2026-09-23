"use client";

import { useMemo, useState } from "react";
import { PopoverMenu } from "./popover-menu";
import {
  FilterOp,
  GroupsOp,
  MultiFilter,
  addFilterBlock,
  addFilterGroup,
  filterValueCount,
  normalizeFilter,
  removeFilterBlock,
  removeFilterGroup,
  setBlocksOp,
  setGroupOp,
  setGroupsOp,
  toggleFilterValue,
} from "@/lib/filters";

export type FilterPopoverOption = { name: string; color?: string };

type Props = {
  label: string;
  options: FilterPopoverOption[];
  filter: MultiFilter;
  onChange: (next: MultiFilter) => void;
  onClear?: () => void;
  formatOption?: (value: string) => string;
  /** Mostra o campo de busca dentro do popover. Default: true. */
  searchable?: boolean;
};

const OP_LABELS: Record<FilterOp, string> = { OR: "OU", AND: "E", NOT: "Diferente de" };
/** Versão curta, usada no selo do botão (o texto completo fica nos botões do popover). */
const OP_BADGE_LABELS: Record<FilterOp, string> = { OR: "OU", AND: "E", NOT: "≠" };
const OPS: FilterOp[] = ["OR", "AND", "NOT"];

const OP_TITLES: Record<FilterOp, string> = {
  AND: "O script precisa ter todos os valores marcados deste grupo",
  OR: "O script precisa ter pelo menos um dos valores marcados deste grupo",
  NOT: "O script não pode ter nenhum dos valores marcados deste grupo",
};

const CONNECTOR_LABELS: Record<GroupsOp, string> = { AND: "E", OR: "OU" };
const CONNECTOR_OPS: GroupsOp[] = ["AND", "OR"];

const GROUPS_OP_TITLES: Record<GroupsOp, string> = {
  AND: "O script precisa bater com este grupo E com o(s) grupo(s) anterior(es) do bloco",
  OR: "Basta o script bater com este grupo OU com algum dos grupo(s) anterior(es) do bloco",
};
const BLOCKS_OP_TITLES: Record<GroupsOp, string> = {
  AND: "O script precisa bater com este bloco E com o(s) bloco(s) anterior(es)",
  OR: "Soma as listas: o script aparece se bater com este bloco OU com algum dos bloco(s) anterior(es)",
};

/** Mini pílula de dois botões (E / OU) usada nos conectores entre grupos e entre blocos. */
function ConnectorToggle({
  value,
  onSelect,
  titles,
  strong,
}: {
  value: GroupsOp;
  onSelect: (op: GroupsOp) => void;
  titles: Record<GroupsOp, string>;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        background: "var(--accent-soft)",
        border: `1px solid var(--accent-soft-strong)`,
        flexShrink: 0,
      }}
    >
      {CONNECTOR_OPS.map((op) => {
        const active = value === op;
        return (
          <button
            key={op}
            type="button"
            onClick={() => onSelect(op)}
            title={titles[op]}
            style={{
              border: "none",
              cursor: "pointer",
              fontSize: strong ? 11.5 : 10.5,
              fontWeight: 700,
              padding: strong ? "3px 11px" : "2px 8px",
              borderRadius: 999,
              background: active ? "var(--accent-dark)" : "transparent",
              color: active ? "#fff" : "var(--accent-dark)",
            }}
          >
            {CONNECTOR_LABELS[op]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Popover de seleção múltipla em dois níveis, usado nos filtros de avatar,
 * ambiente e etiqueta da Biblioteca, do Checklist e dos Testes de avatar.
 *
 * - Cada GRUPO tem seu operador próprio (OU / E / Diferente de).
 * - Dentro de um BLOCO, os grupos se combinam por um conector escolhível (E / OU).
 * - Entre BLOCOS, há outro conector escolhível (E / OU) — normalmente OU,
 *   porque bloco novo funciona como "acrescenta esses scripts à lista".
 *
 * É esse segundo nível que permite montar coisas como
 * "(Documento E Imagem E Texto E ≠ Teste alternativo) OU (Campanha E ≠ Teste alternativo)",
 * impossível com um nível só de grupos.
 */
export function FilterPopover({
  label,
  options,
  filter,
  onChange,
  onClear,
  formatOption,
  searchable = true,
}: Props) {
  const [search, setSearch] = useState("");

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [options]
  );
  const visible = useMemo(
    () =>
      sorted.filter((o) =>
        (formatOption ? formatOption(o.name) : o.name).toLowerCase().includes(search.toLowerCase())
      ),
    [sorted, search, formatOption]
  );

  // Normaliza aqui pra aceitar filtros salvos no sessionStorage antes dos
  // blocos existirem — a primeira alteração já grava de volta no formato novo.
  const f = normalizeFilter(filter);
  const totalCount = filterValueCount(f);
  const blockCount = f.blocks.length;
  const multiBlock = blockCount > 1;
  const totalGroups = f.blocks.reduce((n, b) => n + b.groups.length, 0);
  const listMaxHeight = totalGroups > 2 ? 148 : 200;

  const badge = (() => {
    if (multiBlock) return `${blockCount} blocos (${CONNECTOR_LABELS[f.blocksOp]})`;
    const only = f.blocks[0];
    if (only.groups.length > 1) return `${only.groups.length} grupos (${CONNECTOR_LABELS[only.groupsOp]})`;
    return `${OP_BADGE_LABELS[only.groups[0].op]} ${totalCount}`;
  })();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <PopoverMenu
        panelWidth={multiBlock ? 320 : totalGroups > 1 ? 300 : 260}
        trigger={({ toggle }) => (
          <button
            type="button"
            className="btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            onClick={toggle}
          >
            {label}
            {totalCount > 0 && <span className="tag-filter-badge">{badge}</span>}
          </button>
        )}
      >
        {() => (
          <>
            {searchable && (
              <input
                autoFocus
                placeholder="Buscar..."
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
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              {f.blocks.map((block, blockIndex) => {
                const multiGroup = block.groups.length > 1;
                return (
                  <div key={blockIndex}>
                    {blockIndex > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          margin: "10px 0",
                        }}
                      >
                        <div style={{ flex: 1, height: 2, background: "var(--accent-soft-strong)" }} />
                        <ConnectorToggle
                          strong
                          value={f.blocksOp}
                          titles={BLOCKS_OP_TITLES}
                          onSelect={(op) => onChange(setBlocksOp(f, op))}
                        />
                        <div style={{ flex: 1, height: 2, background: "var(--accent-soft-strong)" }} />
                      </div>
                    )}

                    <div
                      style={{
                        border: multiBlock ? "1px solid var(--accent-soft-strong)" : "none",
                        borderRadius: 10,
                        padding: multiBlock ? 7 : 0,
                        background: multiBlock ? "var(--accent-soft)" : "transparent",
                      }}
                    >
                      {multiBlock && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 6,
                            padding: "0 2px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "var(--accent-dark)",
                              letterSpacing: 0.4,
                            }}
                          >
                            BLOCO {blockIndex + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => onChange(removeFilterBlock(f, blockIndex))}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--accent-dark)",
                              fontSize: 11,
                              cursor: "pointer",
                              padding: "2px 4px",
                            }}
                          >
                            remover bloco
                          </button>
                        </div>
                      )}

                      {block.groups.map((group, groupIndex) => (
                        <div key={groupIndex}>
                          {groupIndex > 0 && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                margin: "6px 0",
                              }}
                            >
                              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                              <ConnectorToggle
                                value={block.groupsOp}
                                titles={GROUPS_OP_TITLES}
                                onSelect={(op) => onChange(setGroupsOp(f, blockIndex, op))}
                              />
                              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                            </div>
                          )}

                          <div
                            style={{
                              border: multiGroup ? "1px solid var(--border)" : "none",
                              borderRadius: 8,
                              padding: multiGroup ? 6 : 0,
                              background: multiGroup ? "var(--card)" : "transparent",
                              marginBottom: multiGroup ? 4 : 0,
                            }}
                          >
                            {multiGroup && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: 4,
                                  padding: "0 2px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: "var(--muted)",
                                    letterSpacing: 0.3,
                                  }}
                                >
                                  GRUPO {groupIndex + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onChange(removeFilterGroup(f, blockIndex, groupIndex))}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--muted)",
                                    fontSize: 11,
                                    cursor: "pointer",
                                    padding: "2px 4px",
                                  }}
                                >
                                  remover
                                </button>
                              </div>
                            )}

                            <div className="filter-op-row">
                              {OPS.map((op) => (
                                <button
                                  key={op}
                                  type="button"
                                  className={`filter-op-btn${group.op === op ? " active" : ""}`}
                                  onClick={() => onChange(setGroupOp(f, blockIndex, groupIndex, op))}
                                  title={OP_TITLES[op]}
                                >
                                  {OP_LABELS[op]}
                                </button>
                              ))}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                maxHeight: listMaxHeight,
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
                                    checked={group.values.includes(opt.name)}
                                    onChange={() =>
                                      onChange(toggleFilterValue(f, blockIndex, groupIndex, opt.name))
                                    }
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
                                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                                    {formatOption ? formatOption(opt.name) : opt.name}
                                  </span>
                                </label>
                              ))}
                              {visible.length === 0 && (
                                <p
                                  style={{
                                    padding: "12px 4px",
                                    fontSize: 13,
                                    color: "var(--muted)",
                                    margin: 0,
                                  }}
                                >
                                  Nenhuma opção encontrada.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => onChange(addFilterGroup(f, blockIndex, "OR"))}
                        style={{
                          width: "100%",
                          marginTop: 4,
                          padding: 7,
                          borderRadius: 8,
                          border: "1px dashed var(--border-strong)",
                          background: "transparent",
                          color: "var(--muted)",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        + adicionar grupo{multiBlock ? " neste bloco" : ""}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onChange(addFilterBlock(f, "OR"))}
              title="Um bloco novo soma outra lista de scripts ao resultado, com condições próprias"
              style={{
                width: "100%",
                marginTop: 8,
                padding: 8,
                borderRadius: 8,
                border: "1px dashed var(--accent-soft-strong)",
                background: "var(--accent-soft)",
                color: "var(--accent-dark)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              + adicionar bloco
            </button>
          </>
        )}
      </PopoverMenu>

      {onClear && totalCount > 0 && (
        <button type="button" className="tag-filter-clear" onClick={onClear}>
          Limpar filtro
        </button>
      )}
    </div>
  );
}
