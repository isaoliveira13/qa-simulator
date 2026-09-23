"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Persona, Scenario, Tag } from "@/lib/types";
import { gerarPessoaFicticia } from "@/lib/fakePerson";
import { recortarFotoQuadrada, iniciaisPersona } from "@/lib/fotoPersona";
import { IconPencil, IconTrash } from "../icons";
import { TagPopover } from "@/components/tag-popover";
import { CenarioActions } from "@/components/cenario-actions";
import { ScenarioPickerModal } from "@/components/scenario-picker";
import { ConflictModal } from "@/components/conflict-modal";
import { buildPadraoConflict, buildScenarioConflict, ConflictState } from "@/lib/cenarioConflict";
import { TEMPLATE_CENARIO_PADRAO } from "@/lib/personaTemplate";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { usePersistedState } from "@/lib/usePersistedState";

type FormState = {
  nome: string;
  cpf: string;
  telefone: string;
  genero: string;
  email: string;
  nascimento: string;
  cidade: string;
  campoExtraNome: string;
  campoExtraValor: string;
  fallbackDadosPessoa: "ficticio" | "vazio";
  cenario: string;
  criterioSucesso: string;
  tags: string[];
  foto: string;
};

const EMPTY_FORM: FormState = {
  nome: "",
  cpf: "",
  telefone: "",
  genero: "",
  email: "",
  nascimento: "",
  cidade: "",
  campoExtraNome: "",
  campoExtraValor: "",
  fallbackDadosPessoa: "ficticio",
  cenario: "",
  criterioSucesso: "",
  tags: [],
  foto: "",
};

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = usePersistedState("personas:search", "");

  const [editing, setEditing] = useState<Persona | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Persona | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [fotoLoading, setFotoLoading] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Cenário próprio da persona (23/08/2026): a pessoa pode carregar um
  // roteiro além dos dados. É o que faz a etapa 2 do assistente de simulação
  // ter um conflito real pra resolver — ver components/simulacao-wizard.tsx.
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioPickerOpen, setScenarioPickerOpen] = useState(false);
  const [conflict, setConflict] = useState<ConflictState>(null);

  function usarCenarioSalvo(scenario: Scenario) {
    setScenarioPickerOpen(false);
    const aplicar = () => {
      setForm((f) => ({
        ...f,
        cenario: scenario.cenario,
        criterioSucesso: scenario.criterioSucesso || f.criterioSucesso,
      }));
      setConflict(null);
    };
    if (!form.cenario.trim()) {
      aplicar();
      return;
    }
    setConflict(buildScenarioConflict({ scenarioNome: scenario.nome, applyReplace: aplicar }));
  }

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

  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    fetch("/api/personas")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPersonas(data.personas);
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
    fetch("/api/scenarios")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.scenarios)) setScenarios(data.scenarios);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return personas;
    const q = search.toLowerCase();
    return personas.filter((p) =>
      `${p.nome} ${p.cidade || ""} ${p.tags.join(" ")}`.toLowerCase().includes(q)
    );
  }, [personas, search]);

  function openNewForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(persona: Persona) {
    setEditing(persona);
    setForm({
      nome: persona.nome,
      cpf: persona.cpf || "",
      telefone: persona.telefone || "",
      genero: persona.genero || "",
      email: persona.email || "",
      nascimento: persona.nascimento || "",
      cidade: persona.cidade || "",
      campoExtraNome: persona.campoExtraNome || "",
      campoExtraValor: persona.campoExtraValor || "",
      fallbackDadosPessoa: persona.fallbackDadosPessoa,
      cenario: persona.cenario || "",
      criterioSucesso: persona.criterioSucesso || "",
      tags: persona.tags,
      foto: persona.foto || "",
    });
    setFormError(null);
    setFotoError(null);
    setFormOpen(true);
  }

  function toggleTag(name: string) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name],
    }));
  }

  async function handleFotoUpload(file: File) {
    setFotoError(null);
    setFotoLoading(true);
    try {
      const dataUrl = await recortarFotoQuadrada(file);
      setForm((f) => ({ ...f, foto: dataUrl }));
    } catch (e: any) {
      setFotoError(e.message || String(e));
    } finally {
      setFotoLoading(false);
    }
  }

  function gerarFicticios() {
    const p = gerarPessoaFicticia();
    setForm((f) => ({
      ...f,
      nome: f.nome || p.nome,
      cpf: p.cpf,
      telefone: p.telefone,
      genero: p.genero,
      email: p.email,
      nascimento: p.nascimento,
      cidade: p.cidade,
    }));
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      setFormError("Dê um nome pra essa persona.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        nome: form.nome.trim(),
        cpf: form.cpf.trim() || undefined,
        telefone: form.telefone.trim() || undefined,
        genero: form.genero.trim() || undefined,
        email: form.email.trim() || undefined,
        nascimento: form.nascimento.trim() || undefined,
        cidade: form.cidade.trim() || undefined,
        campoExtraNome: form.campoExtraNome.trim() || undefined,
        campoExtraValor: form.campoExtraValor.trim() || undefined,
        fallbackDadosPessoa: form.fallbackDadosPessoa,
        cenario: form.cenario.trim() || null,
        criterioSucesso: form.criterioSucesso.trim() || null,
        tags: form.tags,
        foto: form.foto || null,
      };
      const res = await fetch(editing ? `/api/personas/${editing.id}` : "/api/personas", {
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

  // --- Import/export JSON de personas (porta fiel de exportarPersonas/
  // importarPersonas do coisasdaisa — mesmo formato de arquivo, {personas: [...]}). ---

  function exportarPersonas() {
    if (personas.length === 0) {
      setError("Não há personas para exportar.");
      return;
    }
    const blob = new Blob([JSON.stringify({ personas }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "personas-qa.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importarPersonas(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setImportError(null);
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.personas) ? raw.personas : null;
        if (!Array.isArray(arr)) throw new Error("Formato inválido.");
        const validas = arr.filter((p: any) => p && typeof p.nome === "string" && p.nome.trim());
        if (validas.length === 0) throw new Error("Nenhuma persona válida encontrada no arquivo.");
        for (const p of validas) {
          await fetch("/api/personas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nome: p.nome,
              cpf: p.cpf || undefined,
              telefone: p.telefone || undefined,
              genero: p.genero || undefined,
              email: p.email || undefined,
              nascimento: p.nascimento || undefined,
              cidade: p.cidade || undefined,
              campoExtraNome: p.campoExtraNome || undefined,
              campoExtraValor: p.campoExtraValor || undefined,
              fallbackDadosPessoa: p.fallbackDadosPessoa === "vazio" ? "vazio" : "ficticio",
              cenario: p.cenario || undefined,
              criterioSucesso: p.criterioSucesso || undefined,
              tags: Array.isArray(p.tags) ? p.tags : undefined,
              foto: p.foto || undefined,
            }),
          });
        }
        loadAll();
      } catch (e: any) {
        setImportError(e.message || String(e));
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setImportError("Não foi possível ler o arquivo.");
      setImporting(false);
    };
    reader.readAsText(file);
  }

  async function confirmDeletePersona() {
    const persona = confirmDelete;
    if (!persona) return;
    setConfirmDelete(null);
    setDeletingId(persona.id);
    try {
      const res = await fetch(`/api/personas/${persona.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPersonas((prev) => prev.filter((p) => p.id !== persona.id));
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
          <h1>Personas</h1>
          <p className="subtitle">
            Pessoas fictícias reutilizáveis pra montar uma simulação — os dados preenchem os
            placeholders {"{nome} {cpf} {telefone}"} etc. no cenário. Uma persona também pode carregar um
            cenário próprio, que o assistente de simulação oferece como alternativa ao cenário da simulação.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={exportarPersonas}>
            Exportar
          </button>
          <button type="button" className="btn-secondary" disabled={importing} onClick={() => importInputRef.current?.click()}>
            {importing ? "Importando..." : "Importar"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={importarPersonas}
          />
          <button type="button" className="btn-primary" onClick={openNewForm}>
            Nova persona
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Buscar por nome, cidade ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {importError && <p className="status-msg err">{importError}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="empty">Nenhuma persona cadastrada ainda. Clique em "Nova persona" pra começar.</p>
      )}

      {filtered.map((persona) => (
        <div className="card" key={persona.id}>
          <div className="card-main" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {persona.foto ? (
              <img
                src={persona.foto}
                alt=""
                style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: "var(--accent-soft, #eef2ff)",
                  color: "var(--accent-dark, #4338ca)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {iniciaisPersona(persona.nome)}
              </div>
            )}
            <div className="card-info">
              <h3>{persona.nome}</h3>
              <div className="meta">
                {[persona.cidade, persona.genero, persona.email].filter(Boolean).join(" · ") || "—"}
              </div>
              {persona.tags.length > 0 && (
                <div className="tags">
                  {sortTagsByColor(persona.tags, (t) => availableTags.find((at) => at.name === t)?.color).map((t) => {
                    const catalog = availableTags.find((at) => at.name === t);
                    return (
                      <span className="tag" key={t} style={tagPillStyle(catalog?.color)}>
                        {t}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="actions">
            <button className="btn-secondary btn-with-icon" onClick={() => openEditForm(persona)}>
              <IconPencil size={13} /> Editar
            </button>
            <button
              className="btn-ghost card-menu-item-danger"
              disabled={deletingId === persona.id}
              onClick={() => setConfirmDelete(persona)}
            >
              <IconTrash size={13} /> {deletingId === persona.id ? "Apagando..." : "Apagar"}
            </button>
          </div>
        </div>
      ))}

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setFormOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Editar persona" : "Nova persona"}</h3>

            <div className="field">
              <label>Foto (opcional)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {form.foto ? (
                  <img
                    src={form.foto}
                    alt=""
                    style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: "var(--accent-soft, #eef2ff)",
                      color: "var(--accent-dark, #4338ca)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    {iniciaisPersona(form.nome)}
                  </div>
                )}
                <button type="button" className="btn-secondary" disabled={fotoLoading} onClick={() => fotoInputRef.current?.click()}>
                  {fotoLoading ? "Processando..." : "Enviar foto"}
                </button>
                {form.foto && (
                  <button
                    type="button"
                    className="btn-ghost card-menu-item-danger"
                    onClick={() => setForm((f) => ({ ...f, foto: "" }))}
                  >
                    Remover foto
                  </button>
                )}
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleFotoUpload(e.target.files[0])}
                />
              </div>
              {fotoError && <div className="status-msg err">{fotoError}</div>}
            </div>

            <div className="field">
              <label>Nome</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Maria Silva"
              />
            </div>

            <button type="button" className="btn-secondary" onClick={gerarFicticios} style={{ marginBottom: 12 }}>
              Gerar dados fictícios
            </button>

            <div className="field-grid">
            <div className="field">
              <label>CPF</label>
              <input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} />
            </div>

            <div className="field">
              <label>Telefone</label>
              <input
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>Gênero</label>
              <input
                value={form.genero}
                onChange={(e) => setForm((f) => ({ ...f, genero: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>

            <div className="field">
              <label>Nascimento</label>
              <input
                value={form.nascimento}
                onChange={(e) => setForm((f) => ({ ...f, nascimento: e.target.value }))}
                placeholder="dd/mm/aaaa"
              />
            </div>

            <div className="field">
              <label>Cidade</label>
              <input
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>Campo extra — nome</label>
              <input
                value={form.campoExtraNome}
                onChange={(e) => setForm((f) => ({ ...f, campoExtraNome: e.target.value }))}
                placeholder="Ex.: plano"
              />
            </div>

            <div className="field">
              <label>Campo extra — valor</label>
              <input
                value={form.campoExtraValor}
                onChange={(e) => setForm((f) => ({ ...f, campoExtraValor: e.target.value }))}
                placeholder="Ex.: Premium"
              />
            </div>

            <div className="field">
              <label>Se um campo ficar vazio na hora de rodar</label>
              <select
                value={form.fallbackDadosPessoa}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fallbackDadosPessoa: e.target.value as "ficticio" | "vazio" }))
                }
              >
                <option value="ficticio">Gerar valor fictício</option>
                <option value="vazio">Deixar em branco</option>
              </select>
            </div>

            <div className="field field-span-2">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ margin: 0 }}>Cenário próprio (opcional)</label>
                <CenarioActions
                  onCenarioSalvo={() => setScenarioPickerOpen(true)}
                  onPadrao={inserirCenarioPadrao}
                />
              </div>
              <textarea
                rows={4}
                value={form.cenario}
                onChange={(e) => setForm((f) => ({ ...f, cenario: e.target.value }))}
                placeholder="Deixe vazio se essa persona só entrega os dados, sem roteiro próprio."
              />
              <p className="hint">
                Com cenário preenchido, ao escolher essa persona numa simulação o assistente pergunta qual
                cenário vale — o dela ou o da simulação. Sem cenário, ela só preenche {"{nome} {cpf}"} etc.
              </p>
            </div>

            <div className="field field-span-2">
              <label>Critério de sucesso do cenário próprio (opcional)</label>
              <textarea
                rows={2}
                value={form.criterioSucesso}
                onChange={(e) => setForm((f) => ({ ...f, criterioSucesso: e.target.value }))}
                placeholder="O que define que a conversa com essa persona deu certo"
              />
            </div>

            <div className="field field-span-2">
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
                Para criar, editar ou apagar tags do catálogo, use a aba <a href="/tags">Tags</a>.
              </div>
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

      <ScenarioPickerModal
        open={scenarioPickerOpen}
        onClose={() => setScenarioPickerOpen(false)}
        scenarios={scenarios}
        availableTags={availableTags}
        onPick={usarCenarioSalvo}
      />

      <ConflictModal conflict={conflict} onClose={() => setConflict(null)} />

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar a persona "{confirmDelete.nome}"?</h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmDeletePersona}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
