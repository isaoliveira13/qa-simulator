"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Momento, MomentoItem, MomentoItemTipo, ScriptEntry, Suite } from "@/lib/types";
import { IconArrowDown, IconArrowUp, IconCheck, IconDots, IconPlus, IconX } from "../icons";
import { SuiteCommandModal } from "@/components/suite-command-modal";
import { lerJson } from "@/lib/lerJson";
import { chaveDoItem, feitoHoje, horaEmSP } from "@/lib/momentos";

/**
 * Momentos (13/10/2026) — pedido da Isa.
 *
 * Um "momento" é um lembrete com nome ("Manhã pós-deploy", "Fim do dia") que
 * junta o que ela precisa rodar naquele momento: suítes e testes isolados
 * (scripts da Biblioteca fora de suíte). Cada item tem um check verde pra
 * marcar que já rodou. Não é a aba Checklist (cobertura de cenários por tela):
 * aqui é "já rodei tudo que devia agora?".
 *
 * Regra do check (decisão minha, fácil de trocar em lib/momentos.ts):
 * - vale só pro dia em que foi marcado (horário de Brasília) — no dia
 *   seguinte o momento amanhece desmarcado sozinho;
 * - "Recomeçar" desmarca tudo na hora, pra rodar o mesmo momento de novo no
 *   mesmo dia.
 *
 * Marcar NÃO registra execução no Histórico — é só lembrete.
 */

type ItemRef = { tipo: MomentoItemTipo; refId: string };

type ItemResolvido = {
  nome: string;
  href: string;
  meta: string;
  /** O que entra no comando de terminal: a sequência da suíte, ou o script. */
  scripts: ScriptEntry[];
};

export default function MomentosPage() {
  const [momentos, setMomentos] = useState<Momento[]>([]);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Relógio da tela: com a aba aberta de um dia pro outro, os checks de
  // ontem somem sozinhos na virada (a regra é calculada contra "agora").
  const [agora, setAgora] = useState(() => new Date());

  const [salvandoItem, setSalvandoItem] = useState<string | null>(null);
  const [recomecandoId, setRecomecandoId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Momento | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // null = fechado; { momento: null } = novo; { momento } = editar.
  const [editor, setEditor] = useState<{ momento: Momento | null } | null>(null);
  const [cmd, setCmd] = useState<{ titulo: string; scripts: ScriptEntry[] } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/momentos", { cache: "no-store" }).then((r) => lerJson(r)),
      fetch("/api/scripts").then((r) => lerJson(r)),
      fetch("/api/suites").then((r) => lerJson(r)),
    ])
      .then(([momentosData, scriptsData, suitesData]) => {
        if (scriptsData.error) throw new Error(scriptsData.error);
        if (suitesData.error) throw new Error(suitesData.error);
        setScripts(scriptsData.scripts || []);
        setSuites(suitesData.suites || []);
        if (momentosData.error) throw new Error(momentosData.error);
        setMomentos(momentosData.momentos || []);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    function fora(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".card-menu-wrap")) setMenuOpenId(null);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menuOpenId]);

  const scriptsById = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);
  const suitesById = useMemo(() => new Map(suites.map((s) => [s.id, s])), [suites]);

  function resolver(item: ItemRef): ItemResolvido | null {
    if (item.tipo === "suite") {
      const suite = suitesById.get(item.refId);
      if (!suite) return null;
      const naOrdem = suite.scriptIds.map((id) => scriptsById.get(id)).filter(Boolean) as ScriptEntry[];
      return {
        nome: suite.name,
        href: `/suites/${suite.id}`,
        meta: `${naOrdem.length} teste(s) na sequência`,
        scripts: naOrdem,
      };
    }
    const script = scriptsById.get(item.refId);
    if (!script) return null;
    return {
      nome: script.name,
      href: `/upload?id=${encodeURIComponent(script.id)}`,
      meta: `${script.ambiente.toUpperCase()} · ${script.avatar}`,
      scripts: [script],
    };
  }

  async function patch(id: string, body: Record<string, unknown>): Promise<Momento> {
    const res = await fetch(`/api/momentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await lerJson(res);
    if (data.error) throw new Error(data.error);
    return data.momento as Momento;
  }

  function trocarMomento(m: Momento) {
    setMomentos((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  }

  /** Check verde: otimista, volta atrás se o servidor recusar. */
  async function alternar(m: Momento, item: MomentoItem) {
    const feito = !feitoHoje(item, agora);
    const chave = chaveDoItem(item);
    const antes = momentos;
    const marcadoEm = feito ? new Date().toISOString() : null;
    trocarMomento({
      ...m,
      itens: m.itens.map((i) => (chaveDoItem(i) === chave ? { ...i, feitoEm: marcadoEm } : i)),
    });
    setSalvandoItem(`${m.id}|${chave}`);
    try {
      trocarMomento(await patch(m.id, { marcar: { tipo: item.tipo, refId: item.refId, feito } }));
    } catch (e: any) {
      setMomentos(antes);
      setError(e.message || String(e));
    } finally {
      setSalvandoItem(null);
    }
  }

  async function recomecar(m: Momento) {
    const antes = momentos;
    trocarMomento({ ...m, itens: m.itens.map((i) => ({ ...i, feitoEm: null })) });
    setRecomecandoId(m.id);
    try {
      trocarMomento(await patch(m.id, { recomecar: true }));
    } catch (e: any) {
      setMomentos(antes);
      setError(e.message || String(e));
    } finally {
      setRecomecandoId(null);
    }
  }

  async function confirmarApagar() {
    const m = confirmDelete;
    if (!m) return;
    setConfirmDelete(null);
    setDeletingId(m.id);
    try {
      const res = await fetch(`/api/momentos/${m.id}`, { method: "DELETE" });
      const data = await lerJson(res);
      if (data.error) throw new Error(data.error);
      setMomentos((prev) => prev.filter((x) => x.id !== m.id));
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
          <h1>Momentos</h1>
          <p className="subtitle">
            Lembretes do que rodar em cada momento do dia. O check verde vale até o fim do dia; no dia seguinte
            o momento começa desmarcado.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditor({ momento: null })}>
            Novo momento
          </button>
        </div>
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && momentos.length === 0 && (
        <p className="empty">
          Nenhum momento criado ainda. Clique em "Novo momento", dê um nome e escolha as suítes e os testes.
        </p>
      )}

      {momentos.map((m) => {
        const visiveis = m.itens
          .map((item) => ({ item, info: resolver(item) }))
          .filter((x): x is { item: MomentoItem; info: ItemResolvido } => !!x.info);
        const faltando = m.itens.length - visiveis.length;
        const total = visiveis.length;
        const marcados = visiveis.filter((x) => feitoHoje(x.item, agora));
        const feitos = marcados.length;
        const completo = total > 0 && feitos === total;
        const ultimo = marcados
          .map((x) => x.item.feitoEm as string)
          .sort()
          .pop();

        return (
          <section key={m.id} className={`momento-card${completo ? " completo" : ""}`}>
            <div className="momento-head">
              <div className="momento-head-info">
                <h3>
                  {completo && (
                    <span className="momento-selo" aria-hidden="true">
                      <IconCheck size={13} />
                    </span>
                  )}
                  {m.nome}
                </h3>
                <div className="meta">
                  {total === 0
                    ? "Nenhum item ainda"
                    : completo
                      ? `Tudo rodado hoje (${total} de ${total})`
                      : `${feitos} de ${total} rodado(s) hoje`}
                  {ultimo ? ` · último às ${horaEmSP(ultimo)}` : ""}
                  {faltando > 0 ? ` · ${faltando} apagado(s) da Biblioteca` : ""}
                </div>
              </div>
              <div className="momento-head-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={feitos === 0 || recomecandoId === m.id}
                  onClick={() => recomecar(m)}
                  title="Desmarca tudo pra rodar o momento de novo"
                >
                  Recomeçar
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditor({ momento: m })}>
                  Editar
                </button>
                <div className="card-menu-wrap momento-menu-wrap">
                  <button
                    className="card-menu-btn"
                    onClick={() => setMenuOpenId((prev) => (prev === m.id ? null : m.id))}
                    title="Mais opções"
                    aria-label="Mais opções"
                  >
                    <IconDots size={17} />
                  </button>
                  {menuOpenId === m.id && (
                    <div className="card-menu">
                      <button
                        className="card-menu-item card-menu-item-danger"
                        disabled={deletingId === m.id}
                        onClick={() => {
                          setMenuOpenId(null);
                          setConfirmDelete(m);
                        }}
                      >
                        {deletingId === m.id ? "Apagando..." : "Apagar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {total > 0 && (
              <div
                className="momento-progresso"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={feitos}
                aria-label={`${feitos} de ${total} rodados`}
              >
                <span style={{ width: `${(feitos / total) * 100}%` }} />
              </div>
            )}

            {total > 0 && (
              <ul className="momento-itens">
                {visiveis.map(({ item, info }) => {
                  const feito = feitoHoje(item, agora);
                  const chave = chaveDoItem(item);
                  return (
                    <li key={chave} className={`momento-item${feito ? " feito" : ""}`}>
                      <button
                        type="button"
                        className="momento-check"
                        aria-pressed={feito}
                        aria-label={feito ? `Desmarcar ${info.nome}` : `Marcar ${info.nome} como rodado`}
                        title={feito ? "Desmarcar" : "Marcar como rodado"}
                        disabled={salvandoItem === `${m.id}|${chave}`}
                        onClick={() => alternar(m, item)}
                      >
                        {feito && <IconCheck size={15} />}
                      </button>
                      <span className={`momento-tipo ${item.tipo}`}>
                        {item.tipo === "suite" ? "Suíte" : "Teste"}
                      </span>
                      <div className="momento-item-info">
                        <Link href={info.href} className="momento-item-nome">
                          {info.nome}
                        </Link>
                        <span className="momento-item-meta">{info.meta}</span>
                      </div>
                      {feito && item.feitoEm && <span className="momento-hora">às {horaEmSP(item.feitoEm)}</span>}
                      <button
                        type="button"
                        className="btn btn-ghost momento-rodar"
                        disabled={info.scripts.length === 0}
                        onClick={() =>
                          setCmd({
                            titulo:
                              item.tipo === "suite" ? `Comando da suíte "${info.nome}"` : `Comando do teste "${info.nome}"`,
                            scripts: info.scripts,
                          })
                        }
                      >
                        Rodar no terminal
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {editor && (
        <EditorMomento
          momento={editor.momento}
          suites={suites}
          scripts={scripts}
          onClose={() => setEditor(null)}
          onSalvo={(salvo) => {
            setMomentos((prev) =>
              prev.some((x) => x.id === salvo.id) ? prev.map((x) => (x.id === salvo.id ? salvo : x)) : [...prev, salvo]
            );
            setEditor(null);
          }}
        />
      )}

      {cmd && <SuiteCommandModal nome="" titulo={cmd.titulo} scripts={cmd.scripts} onClose={() => setCmd(null)} />}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Apagar o momento "{confirmDelete.nome}"? As suítes e os testes não são apagados, só o lembrete.
            </h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmarApagar}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Criar e editar são a mesma tela (mesma regra das suítes): nome em cima,
 * duas colunas embaixo — à esquerda acha (Suítes | Testes isolados), à direita
 * a lista do momento, na ordem, com ↑/↓ e x. Nada salva antes do botão Salvar.
 * Editar no meio do dia não apaga os checks de quem continua na lista.
 */
function EditorMomento({
  momento,
  suites,
  scripts,
  onClose,
  onSalvo,
}: {
  momento: Momento | null;
  suites: Suite[];
  scripts: ScriptEntry[];
  onClose: () => void;
  onSalvo: (m: Momento) => void;
}) {
  const scriptsById = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);
  const suitesById = useMemo(() => new Map(suites.map((s) => [s.id, s])), [suites]);

  const existe = (i: ItemRef) => (i.tipo === "suite" ? suitesById.has(i.refId) : scriptsById.has(i.refId));

  const [nome, setNome] = useState(momento?.nome ?? "");
  // Item cuja suíte/script foi apagado some daqui (e sai do banco ao salvar).
  const [itens, setItens] = useState<ItemRef[]>(() =>
    (momento?.itens || []).map((i) => ({ tipo: i.tipo, refId: i.refId })).filter(existe)
  );
  const [aba, setAba] = useState<MomentoItemTipo>("suite");
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const escolhidos = new Set(itens.map(chaveDoItem));
  const q = busca.trim().toLowerCase();

  const suitesVisiveis = suites.filter((s) => {
    if (!q) return true;
    return `${s.name} ${(s.tags || []).join(" ")}`.toLowerCase().includes(q);
  });
  const scriptsVisiveis = scripts.filter((s) => {
    if (!q) return true;
    return `${s.name} ${s.avatar} ${s.ambiente} ${s.cenario} ${(s.tags || []).join(" ")}`
      .toLowerCase()
      .includes(q);
  });

  function alternarItem(ref: ItemRef) {
    const k = chaveDoItem(ref);
    setItens((prev) => (prev.some((i) => chaveDoItem(i) === k) ? prev.filter((i) => chaveDoItem(i) !== k) : [...prev, ref]));
  }

  function mover(idx: number, delta: number) {
    setItens((prev) => {
      const alvo = idx + delta;
      if (alvo < 0 || alvo >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[alvo]] = [next[alvo], next[idx]];
      return next;
    });
  }

  async function salvar() {
    if (!nome.trim()) {
      setErro("Dê um nome para o momento.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(momento ? `/api/momentos/${momento.id}` : "/api/momentos", {
        method: momento ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), itens }),
      });
      const data = await lerJson(res);
      if (data.error) throw new Error(data.error);
      onSalvo(data.momento as Momento);
    } catch (e: any) {
      setErro(e.message || String(e));
      setSalvando(false);
    }
  }

  function linhaCandidata(ref: ItemRef, titulo: string, meta: string) {
    const ja = escolhidos.has(chaveDoItem(ref));
    return (
      <div key={chaveDoItem(ref)} className={`suite-item${ja ? " ja-na-sequencia" : ""}`}>
        <div className="suite-item-info">
          <div className="suite-item-title">
            <span>{titulo}</span>
          </div>
          <div className="meta">{meta}</div>
        </div>
        <div className="suite-item-btns">
          <button
            type="button"
            className={`suite-item-btn ${ja ? "remove" : "add"}`}
            onClick={() => alternarItem(ref)}
            title={ja ? "Tirar do momento" : "Pôr no momento"}
            aria-label={ja ? `Tirar ${titulo} do momento` : `Pôr ${titulo} no momento`}
          >
            {ja ? <IconX size={14} /> : <IconPlus size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide momento-editor" onClick={(e) => e.stopPropagation()}>
        <h3>{momento ? "Editar momento" : "Novo momento"}</h3>
        <p className="hint">Dê um nome ao momento e escolha as suítes e os testes isolados que você roda nele.</p>

        <div className="field">
          <label>Nome do momento</label>
          <input
            autoFocus
            placeholder='Ex.: "Manhã — pós-deploy"'
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className="suite-builder">
          <div className="suite-col">
            <div className="suite-col-head">
              <div className="momento-aba">
                <button
                  type="button"
                  className={`btn-secondary${aba === "suite" ? " active" : ""}`}
                  onClick={() => setAba("suite")}
                >
                  Suítes
                </button>
                <button
                  type="button"
                  className={`btn-secondary${aba === "script" ? " active" : ""}`}
                  onClick={() => setAba("script")}
                >
                  Testes isolados
                </button>
              </div>
            </div>
            <div className="field momento-busca">
              <input
                placeholder={aba === "suite" ? "Buscar suíte ou etiqueta..." : "Buscar teste, avatar, ambiente ou etiqueta..."}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="suite-col-body">
              {aba === "suite" &&
                (suitesVisiveis.length === 0 ? (
                  <p className="hint">Nenhuma suíte encontrada.</p>
                ) : (
                  suitesVisiveis.map((s) =>
                    linhaCandidata({ tipo: "suite", refId: s.id }, s.name, `${s.scriptIds.length} teste(s)`)
                  )
                ))}
              {aba === "script" &&
                (scriptsVisiveis.length === 0 ? (
                  <p className="hint">Nenhum teste encontrado.</p>
                ) : (
                  scriptsVisiveis.map((s) =>
                    linhaCandidata(
                      { tipo: "script", refId: s.id },
                      s.name,
                      `${s.ambiente.toUpperCase()} · ${s.avatar}`
                    )
                  )
                ))}
            </div>
          </div>

          <div className="suite-col">
            <div className="suite-col-head">
              <h2>
                No momento <span className="suite-col-count">({itens.length})</span>
              </h2>
            </div>
            <div className="suite-col-body">
              {itens.length === 0 && (
                <p className="hint">Use o + à esquerda pra pôr suítes e testes aqui.</p>
              )}
              {itens.map((ref, idx) => {
                const suite = ref.tipo === "suite" ? suitesById.get(ref.refId) : undefined;
                const script = ref.tipo === "script" ? scriptsById.get(ref.refId) : undefined;
                const titulo = suite?.name || script?.name || ref.refId;
                const meta = suite
                  ? `${suite.scriptIds.length} teste(s)`
                  : script
                    ? `${script.ambiente.toUpperCase()} · ${script.avatar}`
                    : "";
                return (
                  <div key={chaveDoItem(ref)} className="suite-item">
                    <span className="suite-item-num">{idx + 1}</span>
                    <span className={`momento-tipo ${ref.tipo}`}>{ref.tipo === "suite" ? "Suíte" : "Teste"}</span>
                    <div className="suite-item-info">
                      <div className="suite-item-title">
                        <span>{titulo}</span>
                      </div>
                      <div className="meta">{meta}</div>
                    </div>
                    <div className="suite-item-btns">
                      <button
                        type="button"
                        className="suite-item-btn"
                        disabled={idx === 0}
                        onClick={() => mover(idx, -1)}
                        title="Subir"
                        aria-label="Subir"
                      >
                        <IconArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="suite-item-btn"
                        disabled={idx === itens.length - 1}
                        onClick={() => mover(idx, 1)}
                        title="Descer"
                        aria-label="Descer"
                      >
                        <IconArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="suite-item-btn remove"
                        onClick={() => alternarItem(ref)}
                        title="Tirar do momento"
                        aria-label={`Tirar ${titulo} do momento`}
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {erro && <p className="status-msg err">{erro}</p>}

        <div className="confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || !nome.trim()}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
