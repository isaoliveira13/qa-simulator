"use client";

import { useEffect, useMemo, useState } from "react";
import { Scenario, Tag } from "@/lib/types";
import { IconMessageCircle, IconPencil, IconTrash } from "../icons";
import { TagPopover } from "@/components/tag-popover";
import { CenarioActions } from "@/components/cenario-actions";
import { ConflictModal } from "@/components/conflict-modal";
import { buildPadraoConflict, ConflictState } from "@/lib/cenarioConflict";
import { TEMPLATE_CENARIO_PADRAO } from "@/lib/personaTemplate";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { usePersistedState } from "@/lib/usePersistedState";

type FormState = {
  nome: string;
  cenario: string;
  criterioSucesso: string;
  tags: string[];
};

const EMPTY_FORM: FormState = {
  nome: "",
  cenario: "",
  criterioSucesso: "",
  tags: [],
};

function preview(text: string, max = 160) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

export default function CenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = usePersistedState("cenarios:search", "");

  const [editing, setEditing] = useState<Scenario | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Scenario | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  // "Inserir cenário padrão" também aqui: a Biblioteca de Cenários é um dos
  // lugares onde se escreve cenário, então ganha o mesmo botão das outras
  // telas (23/08/2026). Nunca substitui em silêncio — ver lib/cenarioConflict.ts.
  const [conflict, setConflict] = useState<ConflictState>(null);

  function inserirCenarioPadrao() {
    const aplicar = () => {
      setForm((f) => ({ ...f, cenario: TEMPLATE_CENARIO_PADRAO }));
      setConflict(null);
    };
    if (!form.cenario.trim()) {
      aplicar();
      return;
    }
    setConflict(buildPadraoConflict({ applyReplace: aplicar }));
  }

  function loadAll() {
    setLoading(true);
    setError(null);
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setScenarios(data.scenarios);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) setAvailableTags(data.tags);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return scenarios;
    const q = search.toLowerCase();
    return scenarios.filter((s) => `${s.nome} ${s.tags.join(" ")}`.toLowerCase().includes(q));
  }, [scenarios, search]);

  function openNewForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(scenario: Scenario) {
    setEditing(scenario);
    setForm({
      nome: scenario.nome,
      cenario: scenario.cenario,
      criterioSucesso: scenario.criterioSucesso || "",
      tags: scenario.tags,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function toggleTag(name: string) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name],
    }));
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      setFormError("Dê um nome pra esse cenário.");
      return;
    }
    if (!form.cenario.trim()) {
      setFormError("Descreva o cenário.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        nome: form.nome.trim(),
        cenario: form.cenario.trim(),
        criterioSucesso: form.criterioSucesso.trim() || undefined,
        tags: form.tags,
      };
      const res = await fetch(editing ? `/api/scenarios/${editing.id}` : "/api/scenarios", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFormOpen(false);
      loadAll();
    } catch (e: any) {
      setFormError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteScenario() {
    const scenario = confirmDelete;
    if (!scenario) return;
    setConfirmDelete(null);
    setDeletingId(scenario.id);
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScenarios((prev) => prev.filter((s) => s.id !== scenario.id));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Cenários</h1>
          <p className="subtitle">
            Roteiros de conversa reutilizáveis pra testar o avatar — use os placeholders{" "}
            {"{nome} {cpf} {telefone} {genero} {email} {nascimento} {cidade}"} pra combinar com os dados de
            uma persona na hora de rodar.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-primary" onClick={openNewForm}>
            Novo cenário
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Buscar por nome ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="empty">Nenhum cenário cadastrado ainda. Clique em "Novo cenário" pra começar.</p>
      )}

      {filtered.map((scenario) => (
        <div className="card" key={scenario.id}>
          <div className="card-main" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                flexShrink: 0,
                background: "var(--avatar-accent-soft, #f0fdfa)",
                color: "var(--avatar-accent, #0f766e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconMessageCircle size={16} />
            </div>
            <div className="card-info">
              <h3>{scenario.nome}</h3>
              <div className="meta">{preview(scenario.cenario)}</div>
              {scenario.tags.length > 0 && (
                <div className="tags">
                  {sortTagsByColor(scenario.tags, (t) => availableTags.find((at) => at.name === t)?.color).map(
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
          </div>
          <div className="actions">
            <button className="btn-secondary btn-with-icon" onClick={() => openEditForm(scenario)}>
              <IconPencil size={13} /> Editar
            </button>
            <button
              className="btn-ghost card-menu-item-danger"
              disabled={deletingId === scenario.id}
              onClick={() => setConfirmDelete(scenario)}
            >
              <IconTrash size={13} /> {deletingId === scenario.id ? "Apagando..." : "Apagar"}
            </button>
          </div>
        </div>
      ))}

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setFormOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Editar cenário" : "Novo cenário"}</h3>

            <div className="field">
              <label>Nome</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Reclamação de cobrança indevida"
              />
            </div>

            <div className="field">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ margin: 0 }}>Cenário</label>
                <CenarioActions onPadrao={inserirCenarioPadrao} />
              </div>
              <textarea
                rows={5}
                value={form.cenario}
                onChange={(e) => setForm((f) => ({ ...f, cenario: e.target.value }))}
                placeholder="Simule que você é o cliente {nome}, CPF {cpf}, e..."
              />
              <p className="hint">
                Placeholders de persona: {"{nome} {cpf} {telefone} {genero} {email} {nascimento} {cidade} {campo_extra_nome} {campo_extra_valor}"}
              </p>
            </div>

            <div className="field">
              <label>Critério de sucesso (opcional)</label>
              <textarea
                rows={3}
                value={form.criterioSucesso}
                onChange={(e) => setForm((f) => ({ ...f, criterioSucesso: e.target.value }))}
                placeholder="O que a IA deve considerar sucesso nessa conversa"
              />
            </div>

            <div className="field">
              <label>Tags</label>
              <TagPopover label="Selecionar tags" options={availableTags} selected={form.tags} onToggle={toggleTag} />
              {form.tags.length > 0 && (
                <div className="tags" style={{ marginTop: 8 }}>
                  {form.tags.map((t) => {
                    const catalog = availableTags.find((at) => at.name === t);
                    return (
                      <button
                        type="button"
                        key={t}
                        className="tag"
                        style={{
                          cursor: "pointer",
                          border: "none",
                          background: catalog?.color || "#6366f1",
                          color: "#fff",
                        }}
                        onClick={() => toggleTag(t)}
                        title="Remover"
                      >
                        {t} ×
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="hint">
                Mesmo catálogo de tags dos scripts. Para criar, editar ou apagar tags, use a aba{" "}
                <a href="/tags">Tags</a>.
              </div>
            </div>

            {formError && <div className="status-msg err">{formError}</div>}

            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConflictModal conflict={conflict} onClose={() => setConflict(null)} />

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar o cenário "{confirmDelete.nome}"?</h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmDeleteScenario}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
