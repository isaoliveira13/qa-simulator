"use client";

import { ConflictState } from "@/lib/cenarioConflict";

type Props = {
  conflict: ConflictState;
  onClose: () => void;
};

/**
 * Modal genérica de "isso vai substituir o que já está aqui — tem certeza?"
 * — usada em todo lugar que preenche o campo Cenário automaticamente (Usar
 * persona…, Gerar pessoa fictícia, Selecionar cenário salvo). O conteúdo
 * (título/corpo/botões) vem de lib/cenarioConflict.ts; esse componente só
 * desenha. "Cancelar" é sempre adicionado aqui, não faz parte do `conflict`.
 */
export function ConflictModal({ conflict, onClose }: Props) {
  if (!conflict) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{conflict.title}</h3>
        <p className="hint" style={{ marginTop: 4, marginBottom: 16 }}>
          {conflict.body}
        </p>
        <div className="confirm-modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          {conflict.actions.map((a, i) => (
            <button
              key={i}
              type="button"
              className={a.variant === "secondary" ? "btn-secondary" : "btn-primary"}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
