"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { PopoverMenu } from "./popover-menu";
import { SeloPrioridade } from "./prioridade-seletor";
import { NIVEIS, Nivel } from "@/lib/prioridade";
import type { Tag } from "@/lib/types";

/**
 * Acoes em massa da Biblioteca (13/10/2026).
 *
 * Pedido da Isa: a prioridade dos cenarios muda toda semana com o negocio,
 * entao precisa dar pra trocar a prioridade de muitos scripts de uma vez — e
 * fazer o mesmo com as etiquetas. Ficam na barra de "Selecionar varios":
 *
 * - PrioridadeEmMassa: escolhe Nivel 1/2/3 ou Sem prioridade pra selecao toda.
 * - EtiquetasEmMassa: marca/desmarca uma etiqueta em todos os selecionados.
 * - SelecionarPorEtiqueta: junta na selecao todos os scripts visiveis que tem
 *   uma etiqueta (e o caminho "mudar a prioridade de uma etiqueta inteira").
 */

const TAG_PALETTE = ["#1d4ed8", "#be185d", "#c2410c", "#15803d", "#6d28d9", "#0f766e", "#a16207"];
function corAleatoria() {
  return TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
}

const inputBusca: CSSProperties = {
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
};

const checkboxEstilo: CSSProperties = {
  flex: "0 0 auto",
  minWidth: 0,
  accentColor: "var(--accent)",
  width: 15,
  height: 15,
  margin: 0,
};

function Bolinha({ cor }: { cor?: string }) {
  if (!cor) return null;
  return (
    <span
      style={{
        width: 11,
        height: 11,
        borderRadius: "50%",
        background: cor,
        flexShrink: 0,
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------

type PrioProps = {
  /** Nivel atual de cada script selecionado (null = sem prioridade). */
  niveisAtuais: (Nivel | null)[];
  /** Linha de contexto no topo do menu (alcance da mudanca). */
  alcance?: string;
  onAplicar: (nivel: Nivel | null) => void;
  disabled?: boolean;
};

export function PrioridadeEmMassa({ niveisAtuais, alcance, onAplicar, disabled }: PrioProps) {
  const qtd = (n: Nivel | null) => niveisAtuais.filter((x) => x === n).length;
  const total = niveisAtuais.length;
  return (
    <PopoverMenu
      panelWidth={270}
      align="right"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={`btn-secondary${open ? " active" : ""}`}
          onClick={toggle}
          disabled={disabled || total === 0}
        >
          Prioridade
        </button>
      )}
    >
      {({ close }) => (
        <div className="prio-menu">
          {alcance && <div className="prio-menu-alcance">{alcance}</div>}
          {[...NIVEIS, null].map((n) => {
            const ja = qtd(n);
            const todos = ja === total;
            return (
              <button
                key={n ?? "sem"}
                type="button"
                className={`popover-menu-item prio-menu-item${todos ? " ativo" : ""}`}
                onClick={() => {
                  if (!todos) onAplicar(n);
                  close();
                }}
              >
                <span>{n ? `Nível ${n}` : "Sem prioridade"}</span>
                <span className="em-massa-direita">
                  {ja > 0 && (
                    <span className="em-massa-qtd" title={`${ja} dos ${total} selecionados já estão aqui`}>
                      {todos ? "todos" : `${ja} já`}
                    </span>
                  )}
                  {n && <SeloPrioridade nivel={n} ambiente="" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </PopoverMenu>
  );
}

// ---------------------------------------------------------------------------

type EtiqProps = {
  /** Catalogo de etiquetas cadastradas em /tags. */
  catalogo: Tag[];
  /** Etiquetas de cada script selecionado. */
  tagsPorItem: string[][];
  /** Todos tem a etiqueta -> "remover"; senao -> "adicionar" (aos que faltam). */
  onAlternar: (tag: string, acao: "adicionar" | "remover") => void;
  /** Catalogo atualizado depois de criar uma etiqueta nova aqui dentro. */
  onCatalogChange?: (tags: Tag[]) => void;
  disabled?: boolean;
};

export function EtiquetasEmMassa({ catalogo, tagsPorItem, onAlternar, onCatalogChange, disabled }: EtiqProps) {
  const [busca, setBusca] = useState("");
  const [novaCor, setNovaCor] = useState<string>(() => corAleatoria());
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const total = tagsPorItem.length;

  const ordenado = useMemo(
    () => [...catalogo].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [catalogo]
  );
  const visiveis = ordenado.filter((t) => t.name.toLowerCase().includes(busca.toLowerCase()));
  const nomeNovo = busca.trim();
  const podeCriar =
    nomeNovo.length > 0 && !catalogo.some((t) => t.name.trim().toLowerCase() === nomeNovo.toLowerCase());

  const quantosTem = (tag: string) => tagsPorItem.filter((tags) => tags.includes(tag)).length;

  async function criar() {
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
      onAlternar(nomeNovo, "adicionar");
      setBusca("");
      setNovaCor(corAleatoria());
    } catch (e: any) {
      setErro(e.message || String(e));
    } finally {
      setCriando(false);
    }
  }

  return (
    <PopoverMenu
      panelWidth={290}
      align="right"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={`btn-secondary${open ? " active" : ""}`}
          onClick={toggle}
          disabled={disabled || total === 0}
        >
          Etiquetas
        </button>
      )}
    >
      {() => (
        <>
          <div className="prio-menu-alcance" style={{ padding: "2px 2px 8px" }}>
            Marcar põe a etiqueta em todos os {total} selecionados; desmarcar tira de todos.
          </div>
          <input
            autoFocus
            placeholder="Buscar ou criar etiqueta..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setErro(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && podeCriar) {
                e.preventDefault();
                criar();
              }
            }}
            style={inputBusca}
          />
          <div className="em-massa-lista">
            {visiveis.map((t) => {
              const tem = quantosTem(t.name);
              const todos = total > 0 && tem === total;
              const parcial = tem > 0 && !todos;
              return (
                <label key={t.name} className="popover-menu-item em-massa-linha">
                  <input
                    type="checkbox"
                    checked={todos}
                    ref={(el) => {
                      if (el) el.indeterminate = parcial;
                    }}
                    onChange={() => onAlternar(t.name, todos ? "remover" : "adicionar")}
                    disabled={disabled}
                    style={checkboxEstilo}
                  />
                  <Bolinha cor={t.color} />
                  <span className="em-massa-nome">{t.name}</span>
                  {tem > 0 && (
                    <span className="em-massa-qtd" title={`${tem} dos ${total} selecionados têm esta etiqueta`}>
                      {tem}/{total}
                    </span>
                  )}
                </label>
              );
            })}
            {visiveis.length === 0 && !podeCriar && (
              <p className="em-massa-vazio">Nenhuma etiqueta encontrada.</p>
            )}
          </div>
          {podeCriar && (
            <div className="em-massa-criar">
              <input
                type="color"
                className="color-dot"
                value={novaCor}
                onChange={(e) => setNovaCor(e.target.value)}
                title="Cor da nova etiqueta"
                aria-label="Cor da nova etiqueta"
                style={{ opacity: 1, width: 16, height: 16, flex: "0 0 auto" }}
              />
              <button type="button" className="popover-menu-item em-massa-criar-btn" onClick={criar} disabled={criando}>
                <span style={{ fontWeight: 600 }}>+</span>
                <span className="em-massa-nome">
                  {criando ? "Criando..." : `Criar "${nomeNovo}" e pôr em todos`}
                </span>
              </button>
            </div>
          )}
          {erro && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--danger)" }}>{erro}</p>}
        </>
      )}
    </PopoverMenu>
  );
}

// ---------------------------------------------------------------------------

export type ContagemEtiqueta = {
  name: string;
  color?: string;
  /** Scripts visiveis com esta etiqueta. */
  total: number;
  /** Desses, quantos ja estao selecionados. */
  selecionados: number;
};

type SelProps = {
  contagem: ContagemEtiqueta[];
  /** Junta (ou, se ja estao todos, tira) da selecao os visiveis com a etiqueta. */
  onEscolher: (tag: string) => void;
};

export function SelecionarPorEtiqueta({ contagem, onEscolher }: SelProps) {
  const [busca, setBusca] = useState("");
  const visiveis = contagem
    .filter((c) => c.name.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return (
    <PopoverMenu
      panelWidth={280}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={`btn-secondary em-massa-gatilho${open ? " active" : ""}`}
          onClick={toggle}
          disabled={contagem.length === 0}
        >
          Selecionar por etiqueta
        </button>
      )}
    >
      {() => (
        <>
          <div className="prio-menu-alcance" style={{ padding: "2px 2px 8px" }}>
            Junta na seleção os scripts visíveis que têm a etiqueta (os filtros continuam valendo).
          </div>
          <input
            autoFocus
            placeholder="Buscar etiqueta..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={inputBusca}
          />
          <div className="em-massa-lista">
            {visiveis.map((c) => {
              const todos = c.selecionados === c.total;
              const parcial = c.selecionados > 0 && !todos;
              return (
                <label key={c.name} className="popover-menu-item em-massa-linha">
                  <input
                    type="checkbox"
                    checked={todos}
                    ref={(el) => {
                      if (el) el.indeterminate = parcial;
                    }}
                    onChange={() => onEscolher(c.name)}
                    style={checkboxEstilo}
                  />
                  <Bolinha cor={c.color} />
                  <span className="em-massa-nome">{c.name}</span>
                  <span className="em-massa-qtd">{c.total}</span>
                </label>
              );
            })}
            {visiveis.length === 0 && <p className="em-massa-vazio">Nenhuma etiqueta encontrada.</p>}
          </div>
        </>
      )}
    </PopoverMenu>
  );
}
