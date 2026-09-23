"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TriggerArgs = { open: boolean; toggle: () => void };
type PanelArgs = { close: () => void };

type Props = {
  trigger: (args: TriggerArgs) => ReactNode;
  children: (args: PanelArgs) => ReactNode;
  align?: "left" | "right";
  panelWidth?: number;
};

type PanelPos = { top?: number; bottom?: number; left?: number; right?: number };

/**
 * Popover base, usado por TagPopover, FilterPopover e SelectPopover.
 *
 * O painel é desenhado num portal em document.body, com posição `fixed`
 * calculada a partir do retângulo do gatilho — em vez de `position:absolute`
 * dentro do próprio fluxo, como era antes. Um elemento continua sendo
 * recortado pelo `overflow` de qualquer ancestral no DOM mesmo com
 * `position:fixed`; era exatamente isso que cortava esse popover de forma
 * inconsistente quando o gatilho ficava dentro do modal "Editar teste"
 * (`.modal-wide`, que tem `overflow-y:auto`/`max-height:88vh`) — só cortava
 * quando o gatilho estava perto o bastante do fundo do modal. A única forma
 * robusta de escapar é sair do DOM desse ancestral via portal. De quebra,
 * agora também abre pra cima quando não cabe embaixo, em vez de só cortar.
 *
 * z-index alto de propósito (300/310): o portal manda o painel pra fora da
 * árvore do `.modal-backdrop` (z-index:50 no CSS), então ele deixa de fazer
 * parte da stacking context do modal — sem um z-index maior que o do modal,
 * o painel é desenhado *atrás* dele (mesmo estando no DOM), então o clique
 * em "Selecionar etiquetas" dentro de um modal parecia não fazer nada (o
 * painel abria, só que escondido atrás do próprio modal).
 */
export function PopoverMenu({ trigger, children, align = "left", panelWidth = 260 }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function recalc() {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 8;
      // Altura estimada do painel (input de busca + lista + padding) pra
      // decidir se abre pra baixo (padrão) ou pra cima quando não sobra
      // espaço embaixo do gatilho.
      const estimatedPanelHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedPanelHeight && rect.top > spaceBelow;

      const next: PanelPos = openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap };

      if (align === "right") {
        next.right = window.innerWidth - rect.right;
      } else {
        next.left = rect.left;
      }
      setPos(next);
    }

    recalc();
    window.addEventListener("resize", recalc);
    // capture:true pra pegar scroll de qualquer ancestral com overflow
    // (não só da window), ex.: o próprio modal rolando.
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open, align]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 300, background: "transparent" }}
            />
            <div
              style={{
                position: "fixed",
                ...pos,
                zIndex: 310,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "var(--shadow-md)",
                padding: 10,
                width: panelWidth,
                maxHeight: "80vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
              }}
            >
              {children({ close: () => setOpen(false) })}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
