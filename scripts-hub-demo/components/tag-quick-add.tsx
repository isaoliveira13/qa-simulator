"use client";

import { useMemo, useState } from "react";
import { PopoverMenu } from "./popover-menu";
import type { TagOption } from "./tag-popover";
import type { Tag } from "@/lib/types";

// Mesma paleta usada como sugestao inicial na tela /tags — a cor sai
// sorteada dela e a Isa troca no seletor ao lado do nome se quiser.
const TAG_PALETTE = ["#1d4ed8", "#be185d", "#c2410c", "#15803d", "#6d28d9", "#0f766e", "#a16207"];

function randomTagColor() {
  return TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
}

type Props = {
  /** Catálogo de etiquetas cadastradas em /tags. */
  options: TagOption[];
  /** Etiquetas que este card já tem. */
  selected: string[];
  /** Marcar/desmarcar uma etiqueta — o chamador salva na hora (otimista). */
  onToggle: (name: string) => void;
  /**
   * Chamado com o catálogo já atualizado depois de criar uma etiqueta nova
   * aqui dentro — o chamador usa pra atualizar a lista de opções (e o mapa de
   * cores, na Biblioteca) sem precisar recarregar a tela.
   */
  onCatalogChange?: (tags: Tag[]) => void;
  disabled?: boolean;
};

/**
 * Botão redondo "+" que fica no fim da linha de etiquetas de um card e abre um
 * popover pra marcar/desmarcar etiquetas do catálogo sem precisar abrir a tela
 * de edição (pedido da Isa em 04/09/2026).
 *
 * 08/09/2026: o campo de busca virou "buscar ou criar" — quando o texto
 * digitado não é o nome exato de nenhuma etiqueta do catálogo, aparece a linha
 * "Criar «texto»" com um seletor de cor do lado. Criar aqui grava no catálogo
 * (POST /api/tags, o mesmo da tela Tags) e já marca a etiqueta no card. Isso
 * substitui a decisão de 04/09/2026 de só deixar criar na tela Tags — a Isa
 * pediu a criação direto no atalho.
 */
export function TagQuickAdd({ options, selected, onToggle, onCatalogChange, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [novaCor, setNovaCor] = useState<string>(() => randomTagColor());
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [options]
  );
  const visible = useMemo(
    () => sorted.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())),
    [sorted, search]
  );

  const nomeNovo = search.trim();
  // Só oferece criar quando o texto não é o nome exato de uma etiqueta que já
  // existe — senão seria só um jeito confuso de marcar a que já está na lista.
  const podeCriar =
    nomeNovo.length > 0 &&
    !options.some((o) => o.name.trim().toLowerCase() === nomeNovo.toLowerCase());

  async function criarEtiqueta() {
    if (!podeCriar || criando) return;
    setCriando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: [{ name: nomeNovo, color: novaCor }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onCatalogChange?.(data.tags as Tag[]);
      // Criar aqui já etiqueta o card — foi pra isso que ela abriu o popover.
      if (!selected.includes(nomeNovo)) onToggle(nomeNovo);
      setSearch("");
      setNovaCor(randomTagColor());
    } catch (e: any) {
      setErro(e.message || String(e));
    } finally {
      setCriando(false);
    }
  }

  return (
    <PopoverMenu
      trigger={({ toggle }) => (
        <button
          type="button"
          className="tag-add-btn"
          onClick={toggle}
          disabled={disabled}
          title="Adicionar etiqueta"
          aria-label="Adicionar etiqueta"
        >
          +
        </button>
      )}
    >
      {() => (
        <>
          <input
            autoFocus
            placeholder="Buscar ou criar etiqueta..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setErro(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && podeCriar) {
                e.preventDefault();
                criarEtiqueta();
              }
            }}
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
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>{opt.name}</span>
              </label>
            ))}
            {visible.length === 0 && !podeCriar && (
              <p style={{ padding: "12px 4px", fontSize: 13, color: "var(--muted)", margin: 0 }}>
                {options.length === 0
                  ? "Nenhuma etiqueta cadastrada ainda — digite um nome acima para criar a primeira."
                  : "Nenhuma etiqueta encontrada."}
              </p>
            )}
          </div>

          {podeCriar && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                boxSizing: "border-box",
                marginTop: 6,
                paddingTop: 8,
                borderTop: "1px solid var(--border)",
              }}
            >
              <input
                type="color"
                className="color-dot"
                value={novaCor}
                onChange={(e) => setNovaCor(e.target.value)}
                title="Cor da nova etiqueta"
                aria-label="Cor da nova etiqueta"
                style={{ opacity: 1, width: 16, height: 16, flex: "0 0 auto" }}
              />
              <button
                type="button"
                className="popover-menu-item"
                onClick={criarEtiqueta}
                disabled={criando}
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  textAlign: "left",
                  fontSize: 14,
                  fontFamily: "inherit",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  padding: "7px 6px",
                  borderRadius: 6,
                  cursor: criando ? "default" : "pointer",
                  color: "var(--accent-dark)",
                  opacity: criando ? 0.6 : 1,
                }}
              >
                <span style={{ flex: "0 0 auto", fontWeight: 600 }}>+</span>
                <span
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {criando ? "Criando..." : `Criar "${nomeNovo}"`}
                </span>
              </button>
            </div>
          )}

          {erro && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--danger)" }}>{erro}</p>
          )}
        </>
      )}
    </PopoverMenu>
  );
}
