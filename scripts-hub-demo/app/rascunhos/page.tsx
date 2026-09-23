"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Draft } from "@/lib/types";
import { IconFlask, IconTrash } from "../icons";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function RascunhosPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Draft | null>(null);

  function loadDrafts() {
    setLoading(true);
    fetch("/api/drafts")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDrafts(data.drafts);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDrafts();
  }, []);

  async function handleNew() {
    setCreating(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/rascunhos/${data.draft.id}`);
    } catch (e: any) {
      setError(e.message || String(e));
      setCreating(false);
    }
  }

  async function confirmDeleteDraft() {
    const draft = confirmDelete;
    if (!draft) return;
    setConfirmDelete(null);
    setDeletingId(draft.id);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
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
          <h1>Rascunhos</h1>
          <p className="subtitle">
            Escreva e revise um script antes de publicar na Biblioteca. Cada vez que você salva o
            conteúdo, fica uma versão anterior guardada.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-primary" disabled={creating} onClick={handleNew}>
            {creating ? "Criando..." : "Novo rascunho"}
          </button>
        </div>
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && drafts.length === 0 && (
        <p className="empty">Nenhum rascunho ainda. Clique em "Novo rascunho" pra começar.</p>
      )}

      {drafts.map((d) => (
        <div className="card" key={d.id}>
          <div className="card-main">
            <div className="card-info">
              <a className="card-title-link" href={`/rascunhos/${d.id}`}>
                <h3>{d.name || "(sem nome ainda)"}</h3>
              </a>
              <div className="meta">
                {[d.avatar, d.ambiente, d.cenario].filter(Boolean).join(" · ") || "Sem dados preenchidos"}
                {" · "}
                {d.versionCount || 0} versão(ões) · atualizado {timeAgo(d.updatedAt)}
              </div>
            </div>
          </div>
          <div className="actions">
            <a className="btn btn-primary" href={`/rascunhos/${d.id}`}>
              <IconFlask size={13} /> Continuar editando
            </a>
            <button
              className="btn-ghost card-menu-item-danger"
              disabled={deletingId === d.id}
              onClick={() => setConfirmDelete(d)}
            >
              <IconTrash size={13} /> {deletingId === d.id ? "Apagando..." : "Apagar"}
            </button>
          </div>
        </div>
      ))}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar o rascunho "{confirmDelete.name || "(sem nome)"}"? Isso apaga também o histórico de versões dele.</h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmDeleteDraft}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
