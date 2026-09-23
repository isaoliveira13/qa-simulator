"use client";

import { useMemo, useState } from "react";
import { Scenario, Tag } from "@/lib/types";
import { IconMessageCircle } from "../app/icons";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";

type Props = {
  open: boolean;
  onClose: () => void;
  scenarios: Scenario[];
  // Catálogo de tags (pra colorir as pílulas igual ao resto do site) — opcional
  // porque nem toda tela que usa o picker já busca /api/tags; sem ele, as
  // tags aparecem com a cor padrão do catálogo (ver tagPillStyle).
  availableTags?: Tag[];
  onPick: (scenario: Scenario) => void;
};

function preview(text: string, max = 140) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

/**
 * Modal "Selecionar cenário salvo" — reaproveitado em todo lugar onde hoje
 * cenário é digitado na mão: teste único, Template do lote e cenário por
 * pessoa (Estúdio de testes e /testes-avatar/[id]). Escolher um item aqui só
 * preenche o texto no textarea de destino (via onPick) — não vincula por
 * referência, então editar o cenário salvo depois não muda testes que já
 * usaram aquele texto.
 */
export function ScenarioPickerModal({ open, onClose, scenarios, availableTags = [], onPick }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return scenarios;
    const q = search.toLowerCase();
    return scenarios.filter((s) => `${s.nome} ${s.tags.join(" ")}`.toLowerCase().includes(q));
  }, [scenarios, search]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Selecionar cenário salvo</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
          Escolher um cenário preenche o texto no campo — continua editável depois. Pra cadastrar ou
          editar cenários, use a aba <a href="/cenarios">Cenários</a>.
        </p>

        <input
          placeholder="Buscar por nome ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="saved-item-picker">
          {filtered.map((s) => (
            <div className="checklist-row" key={s.id}>
              <div className="checklist-row-info">
                <div className="checklist-row-title">
                  <IconMessageCircle size={12} />
                  {s.nome}
                </div>
                <p className="checklist-row-preview">{preview(s.cenario)}</p>
                {s.tags.length > 0 && (
                  <div className="tags">
                    {sortTagsByColor(s.tags, (t) => availableTags.find((at) => at.name === t)?.color).map(
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
                <button type="button" className="btn-primary" onClick={() => onPick(s)}>
                  Usar este cenário
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="empty">
              {scenarios.length === 0 ? (
                <>
                  Nenhum cenário salvo ainda. Cadastre um na aba <a href="/cenarios">Cenários</a>.
                </>
              ) : (
                "Nenhum cenário encontrado."
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
