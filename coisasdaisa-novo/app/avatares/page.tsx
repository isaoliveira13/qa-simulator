"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarCadastro, SubavatarCadastro } from "@/lib/types";
import { IconPencil, IconTrash } from "../icons";
import { usePersistedState } from "@/lib/usePersistedState";

/**
 * Aba "Avatares" (28/08/2026) — o cadastro dos avatares que ela testa e dos
 * subavatares de cada um. O que está aqui é exatamente o que aparece no switch
 * de avatar do card de Simulações; os subavatares ficam guardados aqui e
 * aparecem só no assistente, na etapa "Onde roda".
 *
 * REGRA QUE MANDA NESTA TELA: nenhum avatar é dono de simulação nenhuma —
 * qualquer simulação roda em qualquer avatar, é só clicar no switch. Por isso o
 * número que o card mostra é de EXECUÇÕES (conversas que já rodaram naquele
 * avatar, um fato do avatar), e não de simulações. A contagem de simulações
 * apontadas pra cá aparece só na hora de apagar, que é o único momento em que
 * ela importa — e com a palavra "apontadas", não "usam".
 */

type SubForm = { nome: string; subSlug: string };
type FormState = { nome: string; hostSlug: string; subs: SubForm[] };

const EMPTY_FORM: FormState = { nome: "", hostSlug: "", subs: [] };

/** "hoje" / "ontem" / "12/08" — data curta, que é o que a linha comporta. */
function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(hoje) - dia(d)) / 86400000);
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function AvataresPage() {
  const [avatares, setAvatares] = useState<AvatarCadastro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = usePersistedState("avatares:search", "");

  const [editing, setEditing] = useState<AvatarCadastro | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<AvatarCadastro | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Liga/desliga em andamento (03/09/2026): trava só o switch daquele card.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Pra onde foram as simulações quando um avatar foi desligado.
  const [aviso, setAviso] = useState<string | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    fetch("/api/avatars")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAvatares(data.avatares || []);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return avatares;
    return avatares.filter((a) =>
      `${a.nome} ${a.hostSlug} ${a.subs.map((s) => `${s.nome} ${s.subSlug}`).join(" ")}`
        .toLowerCase()
        .includes(q)
    );
  }, [avatares, search]);

  function openNewForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(avatar: AvatarCadastro) {
    setEditing(avatar);
    setForm({
      nome: avatar.nome,
      // Host slug igual ao nome não vira texto no campo: é o padrão, e deixar
      // em branco mostra que ele é deduzido (o placeholder repete o nome).
      hostSlug: avatar.hostSlug === avatar.nome ? "" : avatar.hostSlug,
      subs: avatar.subs.map((s) => ({ nome: s.nome, subSlug: s.subSlug })),
    });
    setFormError(null);
    setFormOpen(true);
  }

  function mudarSub(i: number, campo: keyof SubForm, valor: string) {
    setForm((f) => ({
      ...f,
      subs: f.subs.map((s, idx) => (idx === i ? { ...s, [campo]: valor } : s)),
    }));
  }

  async function salvar() {
    const nome = form.nome.trim();
    if (!nome) {
      setFormError("O nome do avatar é obrigatório.");
      return;
    }
    if (nome.includes("/")) {
      setFormError('Nome de avatar não pode ter "/" — cadastre o subavatar na lista abaixo.');
      return;
    }
    // Linha de subavatar em branco é linha que ela abriu e não preencheu:
    // some sem reclamar, em vez de virar erro de validação.
    const subs: SubavatarCadastro[] = form.subs
      .map((s) => ({ nome: s.nome.trim(), subSlug: s.subSlug.trim() }))
      .filter((s) => s.nome)
      .map((s) => ({ nome: s.nome, subSlug: s.subSlug || s.nome }));

    setSaving(true);
    setFormError(null);
    try {
      const body = JSON.stringify({ nome, hostSlug: form.hostSlug.trim() || nome, subs });
      const res = await fetch(editing ? `/api/avatars/${editing.id}` : "/api/avatars", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
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

  /**
   * Liga/desliga do avatar. Desativado ele continua aqui inteiro (host slug,
   * subavatares, execuções) e só some do switch dos cards de Simulações — deixa
   * de ser opção pra rodar até ser ligado de novo nesta tela.
   *
   * Otimista na tela e conferido na resposta: o switch é um clique só, esperar
   * o servidor pra pintar deixaria ele "duro".
   */
  async function alternarAtivo(avatar: AvatarCadastro) {
    const proximo = !avatar.ativo;
    setTogglingId(avatar.id);
    setError(null);
    setAviso(null);
    setAvatares((prev) => prev.map((a) => (a.id === avatar.id ? { ...a, ativo: proximo } : a)));
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: proximo }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.avatar) {
        setAvatares((prev) => prev.map((a) => (a.id === avatar.id ? { ...a, ...data.avatar } : a)));
      }
      if (data.repontadas) {
        const { quantas, para } = data.repontadas;
        setAviso(
          `${quantas === 1 ? "1 simulação que estava" : `${quantas} simulações que estavam`} em "${avatar.nome}" ${quantas === 1 ? "passou" : "passaram"} para "${para}". Ativar "${avatar.nome}" de novo não desfaz isso — o switch de cada card continua livre pra trocar.`
        );
      }
    } catch (e: any) {
      // Deu errado: volta o switch pro que estava, senão a tela mente sobre o
      // que os cards de Simulações vão mostrar.
      setAvatares((prev) => prev.map((a) => (a.id === avatar.id ? { ...a, ativo: avatar.ativo } : a)));
      setError(e.message || String(e));
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmarApagar() {
    const avatar = confirmDelete;
    if (!avatar) return;
    setConfirmDelete(null);
    setDeletingId(avatar.id);
    try {
      const res = await fetch(`/api/avatars/${avatar.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAvatares((prev) => prev.filter((a) => a.id !== avatar.id));
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
          <h1>Avatares</h1>
          <p className="subtitle">
            Os avatares que você testa, e os subavatares de cada um. O que estiver aqui é exatamente o
            que aparece no switch de avatar dos cards de Simulações — os subavatares ficam guardados
            aqui e aparecem só no assistente, na última etapa. Nenhum avatar é dono de simulação:
            qualquer simulação roda em qualquer um deles, é só clicar no switch. O liga/desliga de cada
            avatar controla isso: desativado, ele some da lista de opções dos cards até ser ligado aqui
            de novo — sem perder o cadastro nem o histórico, e as simulações que estavam nele passam
            sozinhas para o próximo avatar ativo da lista.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-primary" onClick={openNewForm}>
            Novo avatar
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Buscar avatar ou host slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {aviso && <p className="status-msg ok">{aviso}</p>}
      {!loading && !error && filtrados.length === 0 && (
        <p className="empty">
          {avatares.length === 0
            ? 'Nenhum avatar cadastrado ainda. Clique em "Novo avatar" pra começar.'
            : "Nenhum avatar com esse termo."}
        </p>
      )}

      {filtrados.map((avatar) => (
        <div
          className={`card${avatar.ativo ? "" : " avatar-inativo"}`}
          key={avatar.id}
          style={{ flexDirection: "column", alignItems: "stretch" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div className="card-info">
              <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {avatar.nome}
                {avatar.autoCadastrado && (
                  <span className="tag tag-auto">cadastrado ao criar a simulação</span>
                )}
                {!avatar.ativo && <span className="tag tag-inativo">desativado</span>}
              </h3>
              <div className="meta avatar-meta">
                <span>
                  host slug <code className="avatar-slug">{avatar.hostSlug}</code>
                </span>
                <span className="avatar-meta-sep">·</span>
                <span>
                  {avatar.subs.length === 0
                    ? "sem subavatares"
                    : avatar.subs.length === 1
                      ? "1 subavatar"
                      : `${avatar.subs.length} subavatares`}
                </span>
                <span className="avatar-meta-sep">·</span>
                {avatar.execucoes === 0 ? (
                  <span className="avatar-sem-uso">nunca rodou aqui</span>
                ) : (
                  <span>
                    <b>
                      {avatar.execucoes} {avatar.execucoes === 1 ? "execução" : "execuções"}
                    </b>
                    , última {quando(avatar.ultimaExecucao)}
                  </span>
                )}
              </div>
            </div>
            <div className="actions">
              <label
                className="toggle-row avatar-toggle"
                title={
                  avatar.ativo
                    ? `"${avatar.nome}" aparece no switch de avatar dos cards de Simulações. Desativar tira ele da lista e passa as simulações dele para o próximo avatar ativo.`
                    : `"${avatar.nome}" está fora do switch dos cards de Simulações. Clique para ativar.`
                }
              >
                <span className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={avatar.ativo}
                    disabled={togglingId === avatar.id}
                    onChange={() => alternarAtivo(avatar)}
                    aria-label={`${avatar.ativo ? "Desativar" : "Ativar"} o avatar ${avatar.nome}`}
                  />
                  <span className="toggle-slider" />
                </span>
                {avatar.ativo ? "Ativo" : "Desativado"}
              </label>
              <button className="btn-secondary btn-with-icon" onClick={() => openEditForm(avatar)}>
                <IconPencil size={13} /> Editar
              </button>
              <button
                className="btn-ghost card-menu-item-danger"
                disabled={deletingId === avatar.id}
                onClick={() => setConfirmDelete(avatar)}
              >
                <IconTrash size={13} /> {deletingId === avatar.id ? "Apagando..." : "Apagar"}
              </button>
            </div>
          </div>

          {avatar.subs.length > 0 && (
            <div className="avatar-subs">
              <div className="avatar-subs-lab">Subavatares</div>
              {avatar.subs.map((sub) => (
                <div className="avatar-sub-row" key={`${avatar.id}-${sub.nome}`}>
                  <span className="avatar-sub-nome">
                    <span className="avatar-sub-seta">↳</span> {sub.nome}
                  </span>
                  <span className="meta">
                    sub slug <code className="avatar-slug">{sub.subSlug}</code>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {formOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setFormOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? "Editar avatar" : "Novo avatar"}</h3>
            <p className="hint" style={{ marginTop: 4 }}>
              O nome é o rótulo que aparece no switch. O host slug é o que a Zenta conhece.
            </p>

            <div className="field-grid" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Nome</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex.: clienteexemplo"
                />
              </div>
              <div className="field">
                <label>Host slug (opcional)</label>
                <input
                  value={form.hostSlug}
                  onChange={(e) => setForm((f) => ({ ...f, hostSlug: e.target.value }))}
                  placeholder={form.nome.trim() || "igual ao nome"}
                />
              </div>
            </div>
            <p className="hint">
              Em dúvida, o host slug é o final do endereço da conversa: hml.zenta.to/<b>clienteexemplo</b>.
              Deixando em branco, ele vira o próprio nome.
            </p>

            <div className="field" style={{ marginTop: 16 }}>
              <label>Subavatares</label>
              <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Moram dentro deste avatar: mesmo host slug, sub slug próprio. Não aparecem no switch —
                aparecem no assistente, quando este avatar estiver escolhido.
              </p>
              {form.subs.map((sub, i) => (
                <div className="avatar-sub-form" key={i}>
                  <input
                    value={sub.nome}
                    onChange={(e) => mudarSub(i, "nome", e.target.value)}
                    placeholder="nome"
                  />
                  <input
                    value={sub.subSlug}
                    onChange={(e) => mudarSub(i, "subSlug", e.target.value)}
                    placeholder={sub.nome.trim() || "sub slug"}
                  />
                  <button
                    type="button"
                    className="btn-ghost card-menu-item-danger"
                    onClick={() => setForm((f) => ({ ...f, subs: f.subs.filter((_, idx) => idx !== i) }))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 8, width: "fit-content" }}
                onClick={() => setForm((f) => ({ ...f, subs: [...f.subs, { nome: "", subSlug: "" }] }))}
              >
                + Adicionar subavatar
              </button>
            </div>

            {formError && <p className="status-msg err">{formError}</p>}

            <div className="confirm-modal-actions">
              <button className="btn-secondary" disabled={saving} onClick={() => setFormOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={saving} onClick={salvar}>
                {saving ? "Salvando..." : "Salvar avatar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar o avatar "{confirmDelete.nome}"?</h3>
            <p className="hint" style={{ marginTop: 6 }}>
              Ele sai do switch dos cards e das sugestões do assistente. Nenhuma simulação é apagada, e o
              histórico continua dizendo onde cada conversa rodou.
              {confirmDelete.apontadas > 0 && (
                <>
                  {" "}
                  <b>
                    {confirmDelete.apontadas === 1
                      ? "1 simulação está apontada"
                      : `${confirmDelete.apontadas} simulações estão apontadas`}{" "}
                    para ele agora
                  </b>{" "}
                  — o switch {confirmDelete.apontadas === 1 ? "desse card" : "desses cards"} fica sem nada
                  marcado até você escolher outro avatar.
                </>
              )}
            </p>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmarApagar}>
                Apagar avatar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
