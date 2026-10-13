"use client";

import { PopoverMenu } from "./popover-menu";
import { criticidade, NIVEIS, Nivel, pesoDoAmbiente } from "@/lib/prioridade";

/**
 * Selo de prioridade (13/10/2026) — ver lib/prioridade.ts.
 *
 * O nivel aparece pelo numero e pelas barras; o tom de calor sai da
 * CRITICIDADE (nivel x peso do ambiente), entao um nivel 1 de PROD e um nivel
 * 1 de HML nunca ficam da mesma cor. A paleta e propria (classes .prio-h1 a
 * .prio-h6 no globals.css), separada das cores das etiquetas.
 */
export function SeloPrioridade({ nivel, ambiente }: { nivel: Nivel | null | undefined; ambiente: string }) {
  const c = criticidade(nivel, ambiente);
  const classe = !nivel ? "prio-sem" : c ? `prio-h${c}` : "prio-fora";
  const titulo = !nivel
    ? "Sem prioridade"
    : c
      ? `Nível ${nivel} · ${pesoDoAmbiente(ambiente) === 1 ? "PROD" : "HML/STG"} · criticidade ${c} de 6`
      : `Nível ${nivel} · ambiente ${ambiente || "não definido"} fora da regra de prioridade`;
  const barrasAcesas = nivel ? 4 - nivel : 0; // nivel 1 = 3 barras
  return (
    <span className={`prio-badge ${classe}`} title={titulo}>
      <svg width="13" height="11" viewBox="0 0 13 11" aria-hidden="true">
        {[5, 8, 11].map((h, i) => (
          <rect
            key={i}
            x={i * 4.5}
            y={11 - h}
            width={3.2}
            height={h}
            rx={1}
            fill="currentColor"
            opacity={i < barrasAcesas ? 1 : 0.28}
          />
        ))}
      </svg>
      <span>{nivel ? `P${nivel}` : "—"}</span>
    </span>
  );
}

type Props = {
  nivel: Nivel | null | undefined;
  ambiente: string;
  /** Linha de contexto no topo do menu (ex.: "Vale para HML, STG e PROD"). */
  alcance?: string;
  onChange: (nivel: Nivel | null) => void;
  disabled?: boolean;
};

/** Selo clicável: abre o menu pra escolher Nível 1/2/3 ou tirar a prioridade. */
export function PrioridadeSeletor({ nivel, ambiente, alcance, onChange, disabled }: Props) {
  return (
    <PopoverMenu
      panelWidth={230}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="prio-trigger"
          onClick={toggle}
          disabled={disabled}
          aria-label={nivel ? `Prioridade nível ${nivel} — trocar` : "Definir prioridade"}
        >
          <SeloPrioridade nivel={nivel} ambiente={ambiente} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="prio-menu">
          {alcance && <div className="prio-menu-alcance">{alcance}</div>}
          {NIVEIS.map((n) => (
            <button
              key={n}
              type="button"
              className={`popover-menu-item prio-menu-item${nivel === n ? " ativo" : ""}`}
              onClick={() => {
                if (nivel !== n) onChange(n);
                close();
              }}
            >
              <span>Nível {n}</span>
              <SeloPrioridade nivel={n} ambiente={ambiente} />
            </button>
          ))}
          <button
            type="button"
            className={`popover-menu-item prio-menu-item${!nivel ? " ativo" : ""}`}
            onClick={() => {
              if (nivel) onChange(null);
              close();
            }}
          >
            <span>Sem prioridade</span>
          </button>
        </div>
      )}
    </PopoverMenu>
  );
}
