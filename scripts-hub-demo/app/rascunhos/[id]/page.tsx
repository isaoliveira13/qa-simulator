"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Draft, DraftVersion, Framework } from "@/lib/types";
import { TELAS } from "@/lib/telas";
import { diffLines } from "@/lib/diff";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function EditDraftPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [versions, setVersions] = useState<DraftVersion[]>([]);

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [ambiente, setAmbiente] = useState("");
  const [cenario, setCenario] = useState("");
  const [tela, setTela] = useState("");
  const [framework, setFramework] = useState<Framework>("playwright");
  const [tagsText, setTagsText] = useState("");
  const [content, setContent] = useState("");

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetch(`/api/drafts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const d: Draft = data.draft;
        setName(d.name);
        setAvatar(d.avatar);
        setAmbiente(d.ambiente);
        setCenario(d.cenario);
        setTela(d.tela || "");
        setFramework(d.framework);
        setTagsText(d.tags.join(", "));
        setContent(d.content);
        setVersions(data.versions);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          avatar,
          ambiente,
          cenario,
          tela: tela || null,
          tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
          framework,
          content,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ text: "Rascunho salvo. Nova versão registrada se o conteúdo mudou.", ok: true });
      const versionsRes = await fetch(`/api/drafts/${id}`).then((r) => r.json());
      if (!versionsRes.error) setVersions(versionsRes.versions);
    } catch (e: any) {
      setMsg({ text: e.message || String(e), ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/drafts/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push("/");
    } catch (e: any) {
      setMsg({ text: e.message || String(e), ok: false });
      setPublishing(false);
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push("/rascunhos");
    } catch (e: any) {
      setMsg({ text: e.message || String(e), ok: false });
      setDeleting(false);
    }
  }

  function restoreVersion(v: DraftVersion) {
    setContent(v.content);
    setMsg({ text: "Versão restaurada no editor — clique em Salvar pra confirmar.", ok: true });
  }

  const diffVersion = versions.find((v) => v.id === diffAgainst);
  const diff = useMemo(() => {
    if (!diffVersion) return null;
    return diffLines(diffVersion.content, content);
  }, [diffVersion, content]);

  if (loading) {
    return (
      <div>
        <h1>Rascunho</h1>
        <p className="subtitle">Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1>Rascunho</h1>
        <p className="status-msg err">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>{name || "Rascunho sem nome"}</h1>
          <p className="subtitle">Edite livremente. Publicar cria o script de verdade na Biblioteca.</p>
        </div>
        <div className="header-actions">
          <a className="btn btn-secondary" href="/rascunhos">
            Voltar
          </a>
        </div>
      </div>

      <div className="form-section">
        <h2 className="form-section-title">Informações básicas</h2>

        <div className="row">
          <div className="field">
            <label>Nome do teste</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Login básico" />
          </div>
          <div className="field">
            <label>Framework</label>
            <select value={framework} onChange={(e) => setFramework(e.target.value as Framework)}>
              <option value="playwright">Playwright</option>
              <option value="cypress">Cypress</option>
            </select>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Avatar</label>
            <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="Ex.: Bot A, Bot B" />
          </div>
          <div className="field">
            <label>Ambiente</label>
            <input value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Ex.: hml, stg, prod" />
          </div>
        </div>

        <div className="field">
          <label>Cenário</label>
          <input value={cenario} onChange={(e) => setCenario(e.target.value)} placeholder="Ex.: Mensagem do gestor" />
        </div>

        <div className="field">
          <label>Tela do CRM</label>
          <select value={tela} onChange={(e) => setTela(e.target.value)}>
            <option value="">Nenhuma / não se aplica</option>
            {TELAS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Tags</label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="separadas por vírgula"
          />
        </div>
      </div>

      <div className="form-section">
        <h2 className="form-section-title">Conteúdo do script</h2>
        <div className="field">
          <textarea
            className="code-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva ou cole aqui o código do script..."
            style={{ minHeight: 320 }}
          />
        </div>
      </div>

      {msg && <div className={`status-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

      <div className="header-actions" style={{ marginTop: 16, marginBottom: 24 }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button className="btn-secondary" onClick={handlePublish} disabled={publishing}>
          {publishing ? "Publicando..." : "Publicar na Biblioteca"}
        </button>
        <button className="btn-ghost card-menu-item-danger" onClick={() => setConfirmDelete(true)} disabled={deleting}>
          {deleting ? "Apagando..." : "Apagar rascunho"}
        </button>
      </div>

      <div className="form-section">
        <h2 className="form-section-title">Histórico de versões ({versions.length})</h2>
        {versions.length === 0 && <p className="empty">Nenhuma versão salva ainda.</p>}
        {versions.map((v, idx) => (
          <div className="checklist-row" key={v.id}>
            <div className="checklist-row-info">
              <div className="checklist-row-title">
                Versão {versions.length - idx} {idx === 0 ? "(mais recente)" : ""}
              </div>
              <div className="meta">{formatDateTime(v.createdAt)}</div>
            </div>
            <div className="checklist-row-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDiffAgainst(diffAgainst === v.id ? null : v.id)}
              >
                {diffAgainst === v.id ? "Fechar diff" : "Ver diff"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => restoreVersion(v)}>
                Restaurar
              </button>
            </div>
          </div>
        ))}
      </div>

      {diff && (
        <div className="form-section">
          <h2 className="form-section-title">Diff (versão selecionada → editor atual)</h2>
          <pre className="diff-view">
            {diff.map((line, i) => (
              <div key={i} className={`diff-line diff-${line.type}`}>
                {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar este rascunho e todo o histórico de versões dele? Esta ação não pode ser desfeita.</h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={handleDelete}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
