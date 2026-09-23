"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/lib/types";
import { IconPencil, IconTrash } from "../icons";

const TAG_PALETTE = ["#1d4ed8", "#be185d", "#c2410c", "#15803d", "#6d28d9", "#0f766e", "#a16207"];

function randomTagColor() {
  return TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
}

// A cor da tag é escolhida livremente no color picker, então o texto
// precisa se adaptar pra continuar legível em cima de qualquer tom.
function getContrastText(hex: string) {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#fff";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000 / 255;
  return brightness > 0.6 ? "#1a1a1a" : "#fff";
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTagInput, setNewTagInput] = useState("");
  const [newTagColor, setNewTagColor] = useState<string>(() => randomTagColor());
  const [registering, setRegistering] = useState(false);

  const [editingTag, setEditingTag] = useState<{
    originalName: string;
    name: string;
    color: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTags();
  }, []);

  function fetchTags() {
    setLoading(true);
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setTags(data.tags || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  async function handleAddTag() {
    const value = newTagInput.trim();
    if (!value) return;
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: [{ name: value, color: newTagColor }] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTags(data.tags);
      setNewTagInput("");
      setNewTagColor(randomTagColor());
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setRegistering(false);
    }
  }

  function startEdit(tag: Tag) {
    setError(null);
    setEditingTag({ originalName: tag.name, name: tag.name, color: tag.color });
  }

  function cancelEdit() {
    setEditingTag(null);
  }

  async function saveEdit() {
    if (!editingTag) return;
    const newName = editingTag.name.trim();
    if (!newName) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingTag.originalName,
          newName,
          color: editingTag.color,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTags(data.tags);
      setEditingTag(null);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  function requestDelete(tag: Tag) {
    setError(null);
    setConfirmDelete(tag);
  }

  async function confirmDeleteAction() {
    const tag = confirmDelete;
    if (!tag) return;
    setConfirmDelete(null);
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tag.name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTags(data.tags);
      if (editingTag?.originalName === tag.name) setEditingTag(null);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Tags</h1>
          <p className="subtitle">
            Cadastre, edite e apague as etiquetas usadas para organizar os scripts e as simulações.
          </p>
        </div>
      </div>

      <div className="new-tag-row">
        <input
          type="color"
          className="color-dot"
          style={{ opacity: 1 }}
          value={newTagColor}
          onChange={(e) => setNewTagColor(e.target.value)}
          title="Cor da nova tag"
        />
        <input
          value={newTagInput}
          onChange={(e) => setNewTagInput(e.target.value)}
          placeholder="Nova tag (ex.: regressão)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTag();
            }
          }}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={handleAddTag}
          disabled={registering || !newTagInput.trim()}
        >
          {registering ? "Adicionando..." : "Adicionar tag"}
        </button>
      </div>

      {error && <div className="status-msg err">{error}</div>}

      {loading && <p className="empty">Carregando...</p>}
      {!loading && sortedTags.length === 0 && (
        <p className="empty">Nenhuma tag cadastrada ainda.</p>
      )}

      {sortedTags.map((tag) => {
        const isEditing = editingTag?.originalName === tag.name;
        return (
          <div className="tag-manage-row" key={tag.name}>
            {isEditing ? (
              <>
                <div className="tag-manage-edit-row">
                  <input
                    type="color"
                    className="color-dot"
                    style={{ opacity: 1 }}
                    value={editingTag.color}
                    onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                    title="Cor da tag"
                  />
                  <input
                    className="tag-edit-input"
                    value={editingTag.name}
                    onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEdit();
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className="tag-manage-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={saveEdit}
                    disabled={savingEdit || !editingTag.name.trim()}
                  >
                    {savingEdit ? "Salvando..." : "Salvar"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={cancelEdit}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="tag-manage-row-info">
                  <span
                    className="tag-pill"
                    style={{ background: tag.color, color: getContrastText(tag.color) }}
                  >
                    {tag.name}
                  </span>
                </div>
                <div className="tag-manage-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-with-icon"
                    onClick={() => startEdit(tag)}
                  >
                    <IconPencil size={13} />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-with-icon"
                    onClick={() => requestDelete(tag)}
                  >
                    <IconTrash size={13} />
                    Apagar
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar tag "{confirmDelete.name}"?</h3>
            <p className="hint">
              A tag será removida do catálogo e desmarcada de todos os scripts que a usam. Esta
              ação não pode ser desfeita.
            </p>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" disabled={deleting} onClick={confirmDeleteAction}>
                {deleting ? "Apagando..." : "Apagar tag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
