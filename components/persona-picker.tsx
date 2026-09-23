"use client";

import { useMemo, useState } from "react";
import { Persona, Tag } from "@/lib/types";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";

type Props = {
  open: boolean;
  onClose: () => void;
  personas: Persona[];
  // Ver comentário equivalente em components/scenario-picker.tsx.
  availableTags?: Tag[];
  onPick: (persona: Persona) => void;
};

/**
 * Modal "Usar persona…" — substitui o <select> nativo que existia antes.
 * Mesmo padrão do ScenarioPickerModal (components/scenario-picker.tsx):
 * busca + lista de .checklist-row dentro de .saved-item-picker, botão de
 * ação por item. Escolher uma persona não decide sozinho o que fazer com o
 * campo de destino — quem chama (via onPick) resolve isso, inclusive
 * abrindo a ConflictModal se o campo já tiver texto (ver lib/cenarioConflict.ts).
 */
export function PersonaPickerModal({ open, onClose, personas, availableTags = [], onPick }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return personas;
    const q = search.toLowerCase();
    return personas.filter((p) =>
      `${p.nome} ${p.cidade || ""} ${p.tags.join(" ")}`.toLowerCase().includes(q)
    );
  }, [personas, search]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Usar persona</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Preenche o cenário com os dados dessa pessoa. Pra cadastrar ou editar personas, use a aba{" "}
          <a href="/personas">Personas</a>.
        </p>

        <input
          placeholder="Buscar por nome, cidade ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="saved-item-picker">
          {filtered.map((p) => (
            <div className="checklist-row" key={p.id}>
              <div className="checklist-row-info">
                <div className="checklist-row-title">{p.nome}</div>
                <p className="checklist-row-preview">
                  {[p.cidade, p.genero, p.email].filter(Boolean).join(" · ") || "—"}
                </p>
                {p.tags.length > 0 && (
                  <div className="tags">
                    {sortTagsByColor(p.tags, (t) => availableTags.find((at) => at.name === t)?.color).map(
                      (t) => {
                        const catalog = availableTags.find((at) => at.name === t);
                        return (
                          <span className="tag" key={t} style={tagPillStyle(catalog?.color)}>
                            {t}
                          </span>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
              <div className="checklist-row-actions">
                <button type="button" className="btn-primary" onClick={() => onPick(p)}>
                  Usar esta persona
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="empty">
              {personas.length === 0 ? (
                <>
                  Nenhuma persona salva ainda. Cadastre uma na aba <a href="/personas">Personas</a>, ou use o
                  botão "Gerar pessoa fictícia".
                </>
              ) : (
                "Nenhuma persona encontrada."
              )}
            </p>
          )}
        </div>

        <div className="confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
