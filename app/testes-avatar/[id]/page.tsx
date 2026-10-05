"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AvatarTest, AvatarTestRun, AvatarTurn, Tag } from "@/lib/types";
import { ListaAnexos } from "@/components/anexos-turno";
import { IconCheck, IconPencil, IconTrash, IconX } from "../../icons";
import { PessoaLinha, pessoaDoLoteParaLinha } from "@/lib/loteText";
import { pessoaLinhaParaDados, preencherTemplate } from "@/lib/personaTemplate";
import { abrirRelatorioPDF } from "@/lib/conversationReport";
import { useLoteBatch } from "@/lib/useLoteBatch";
import { resumirEmbaralhamento } from "@/lib/embaralhar";
import { tagPillStyle } from "@/lib/tagColor";
import { urlDaConversa } from "@/lib/destinos";
import { rotuloModo } from "@/lib/roteiroTurnos";

/**
 * Ficha da simulação — o que o botão "Abrir" da lista mostra (25/08/2026).
 *
 * Tela de LEITURA: reúne numa página só tudo que o assistente de 5 etapas
 * configurou (quem conversa, o que conversa, como conversa, como os dados
 * chegam, identificação), na mesma ordem das etapas, mais rodar e o
 * histórico. Nada aqui edita a simulação — editar é só pelo "Editar", que
 * abre o assistente (e cada bloco tem um atalho que já cai na etapa certa,
 * via ?etapa=N). Substitui a tela antiga, que era o formulário de criação
 * de novo, com edição inline de cenário/saudação/turnos e da lista de
 * pessoas.
 */

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function iniciais(nome: string) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function resumoDados(p: PessoaLinha) {
  return [p.cpf, p.telefone, p.cidade].filter(Boolean).join(" · ") || "sem dados extras";
}

function preview(texto: string, max = 90) {
  const limpo = (texto || "").trim().replace(/\s+/g, " ");
  if (!limpo) return "—";
  return limpo.length > max ? limpo.slice(0, max).trimEnd() + "…" : limpo;
}

// Resposta turno a turno do proxy (app/api/avatar-tests/run) — só usada pela
// execução de simulações antigas, sem lista de pessoas.
type TurnoResponse = {
  status: "continuar";
  conversation_id: string;
  turno_atual: number;
  max_turnos: number;
  ultimo_turno: AvatarTurn | null;
};

type FinalResponse = {
  status?: undefined;
  resultado: string;
  motivo_encerramento: string;
  total_turnos: number;
  max_turnos: number;
  tempo_segundos: number;
  transcricao: AvatarTurn[];
  runId: string;
};

type ProxyResponse = TurnoResponse | FinalResponse;

export default function FichaSimulacaoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;

  const [test, setTest] = useState<AvatarTest | null>(null);
  const [runs, setRuns] = useState<AvatarTestRun[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // --- Execução de simulação antiga (sem lista de pessoas): uma conversa só ---
  const [running, setRunning] = useState(false);
  const [ending, setEnding] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [liveTurns, setLiveTurns] = useState<AvatarTurn[]>([]);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<FinalResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const resumeResolverRef = useRef<(() => void) | null>(null);

  // --- Execução normal: uma conversa por pessoa da simulação (worker-pool
  // compartilhado, lib/useLoteBatch.ts). Uma pessoa só é um lote de uma. ---
  const { batchRunning, batchProgress, iniciarLote, pararLote, batchConcluidos } = useLoteBatch(
    () => ({ avatarTestId: id }),
    () => ({})
  );

  const pessoas: PessoaLinha[] = useMemo(
    () => (test?.pessoas || []).map(pessoaDoLoteParaLinha),
    [test]
  );

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/avatar-tests/${id}`).then((r) => r.json()),
      fetch(`/api/avatar-test-runs?avatarTestId=${id}`).then((r) => r.json()),
      fetch(`/api/tags`).then((r) => r.json()),
    ])
      .then(([testData, runsData, tagsData]) => {
        if (testData.error) throw new Error(testData.error);
        if (runsData.error) throw new Error(runsData.error);
        setTest(testData.avatarTest);
        setRuns(runsData.runs);
        if (!tagsData.error && Array.isArray(tagsData.tags)) setAvailableTags(tagsData.tags);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (id) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function chamarProxy(body: {
    conversationId?: string;
    encerrar?: boolean;
    pessoa?: PessoaLinha;
  }): Promise<ProxyResponse> {
    const res = await fetch("/api/avatar-tests/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarTestId: id, ...body }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (!pausedRef.current && resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
  }

  async function waitIfPaused() {
    if (!pausedRef.current) return;
    setLiveStatus("Simulação pausada. Nenhuma nova mensagem será enviada até você retomar.");
    await new Promise<void>((resolve) => {
      resumeResolverRef.current = resolve;
    });
  }

  async function rodarConversaUnica() {
    setRunning(true);
    setRunError(null);
    setLiveTurns([]);
    setLastRun(null);
    setConversationId(null);
    pausedRef.current = false;
    setPaused(false);
    setLiveStatus("Iniciando conversa...");
    try {
      let data = await chamarProxy({});
      while (data.status === "continuar") {
        const turno = data.ultimo_turno;
        setConversationId(data.conversation_id);
        if (turno) setLiveTurns((prev) => [...prev, turno]);
        await waitIfPaused();
        setLiveStatus(`Turno ${data.turno_atual} de ${data.max_turnos}...`);
        data = await chamarProxy({ conversationId: data.conversation_id });
      }
      setLiveTurns(data.transcricao || []);
      setLastRun(data);
      setLiveStatus(null);
    } catch (e: any) {
      setRunError(e.message || String(e));
      setLiveStatus(null);
    } finally {
      setRunning(false);
      setConversationId(null);
      pausedRef.current = false;
      setPaused(false);
      loadAll();
    }
  }

  async function encerrarConversaUnica() {
    if (!conversationId) return;
    setEnding(true);
    pausedRef.current = false;
    setPaused(false);
    resumeResolverRef.current = null;
    try {
      const data = await chamarProxy({ conversationId, encerrar: true });
      if (data.status !== "continuar") {
        setLiveTurns(data.transcricao || []);
        setLastRun(data);
      }
      setLiveStatus(null);
      loadAll();
    } catch (e: any) {
      setRunError(e.message || String(e));
    } finally {
      setEnding(false);
      setRunning(false);
      setConversationId(null);
    }
  }

  async function rodarSimulacao() {
    if (!test) return;
    if (pessoas.length === 0) {
      await rodarConversaUnica();
      return;
    }
    const overrides = test.overridesPorPessoa || {};
    await iniciarLote(
      pessoas,
      Math.max(1, Math.min(test.maxSimultaneos || 5, pessoas.length)),
      test.cenariosIndividuaisAtivo ? (idx) => overrides[String(idx)] : undefined
    );
    loadAll();
  }

  async function handleDeleteRun(runId: string) {
    setDeletingRunId(runId);
    try {
      const res = await fetch(`/api/avatar-test-runs/${runId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDeletingRunId(null);
    }
  }

  if (loading) return <p className="empty">Carregando...</p>;
  if (error) return <p className="status-msg err">{error}</p>;
  if (!test) return <p className="empty">Simulação não encontrada.</p>;

  const editarHref = (etapa: number) => `/testes-avatar/${id}/editar?etapa=${etapa}`;
  const overrides = test.overridesPorPessoa || {};
  const comCenarioProprio = test.cenariosIndividuaisAtivo ? Object.keys(overrides).length : 0;
  const rodando = running || batchRunning;
  const ultima = runs[0];
  const apiLabel = (test.baseUrl || "https://api.zenta.to").replace(/^https?:\/\//, "");
  // Ambiente + avatar viram o endereco da conversa (ver urlDaConversa em
  // lib/destinos.ts). Fica na ficha porque e a forma mais rapida de conferir
  // que a simulacao aponta pro lugar certo: da pra abrir o link e ver se o
  // avatar existe mesmo ali, sem precisar rodar a simulacao inteira.
  const urlConversa = urlDaConversa(test.ambiente, test.hostSlug, test.subSlug);
  // Simulação ainda sem destino: onde ela roda é escolhido no switch do card,
  // na lista de Simulações (02/09/2026) — a ficha só mostra e manda pra lá.
  const semDestino = !test.ambiente.trim() || !test.avatar.trim();

  // Qual cenário vale pra cada pessoa — mesma leitura que a etapa 2 do
  // assistente faz, só que sem os botões de troca.
  function cenarioDaPessoa(idx: number, pessoa: PessoaLinha) {
    const over = test!.cenariosIndividuaisAtivo ? overrides[String(idx)] : undefined;
    const dados = pessoaLinhaParaDados(pessoa);
    if (over?.cenario) return { texto: over.cenario, proprio: true };
    return { texto: preencherTemplate(test!.cenario, dados), proprio: false };
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <Link href="/testes-avatar" className="btn btn-secondary" style={{ marginBottom: 10 }}>
            ← Simulações
          </Link>
          <h1>{test.name}</h1>
          <p className="subtitle">
            {pessoas.length > 0 ? `${pessoas.length} pessoa${pessoas.length > 1 ? "s" : ""}` : "1 pessoa"} ·
            {semDestino
              ? "sem destino escolhido"
              : `avatar ${test.avatar} · ambiente ${test.ambiente} · host ${test.hostSlug}${
                  test.subSlug ? ` / ${test.subSlug}` : ""
                }`}{" "}
            · criada em {formatDate(test.createdAt)}
          </p>
        </div>
        <div className="header-actions">
          {!rodando &&
            (semDestino ? (
              <Link href="/testes-avatar" className="btn btn-primary">
                Escolher destino para rodar
              </Link>
            ) : (
              <button type="button" className="btn-primary" onClick={rodarSimulacao}>
                Rodar simulação
              </button>
            ))}
          {batchRunning && (
            <button type="button" className="btn-secondary" onClick={pararLote}>
              Parar
            </button>
          )}
          {running && conversationId && (
            <button type="button" className="btn-secondary" disabled={ending} onClick={togglePause}>
              {paused ? "Retomar" : "Pausar"}
            </button>
          )}
          {running && conversationId && (
            <button type="button" className="btn-secondary" disabled={ending} onClick={encerrarConversaUnica}>
              {ending ? "Encerrando..." : "Encerrar"}
            </button>
          )}
          <Link href={`/testes-avatar/${id}/editar`} className="btn btn-secondary btn-with-icon">
            <IconPencil size={13} /> Editar
          </Link>
          <Link href={`/testes-avatar/relatorio?testId=${id}`} className="btn btn-secondary">
            Relatório
          </Link>
        </div>
      </div>

      <div className="ficha-strip">
        <div className="ficha-tile">
          <span className="ficha-tile-k">Pessoas</span>
          <div className="ficha-tile-v">
            {pessoas.length || 1}
            {pessoas.length > 1 && <small> · {test.maxSimultaneos || 5} em paralelo</small>}
          </div>
        </div>
        <div className="ficha-tile">
          <span className="ficha-tile-k">Máx. de turnos</span>
          <div className="ficha-tile-v">{test.maxTurnos}</div>
        </div>
        <div className="ficha-tile">
          <span className="ficha-tile-k">Cenários próprios</span>
          <div className="ficha-tile-v">
            {comCenarioProprio}
            <small> de {pessoas.length || 1} pessoas</small>
          </div>
        </div>
        <div className="ficha-tile">
          <span className="ficha-tile-k">Última execução</span>
          <div
            className={`ficha-tile-v${
              ultima?.resultado === "SUCESSO" ? " ok" : ultima?.resultado === "FALHA" ? " err" : ""
            }`}
          >
            {ultima ? ultima.resultado || "—" : "—"}
            {ultima && <small> · {formatDateTime(ultima.startedAt)}</small>}
          </div>
        </div>
      </div>

      <div className="ficha-grid">
        <div className="ficha-col">
          <div className="panel">
            <div className="ficha-sec-head">
              <h3>Quem conversa</h3>
              <Link className="ficha-edit" href={editarHref(1)}>
                Editar pessoas
              </Link>
            </div>

            {pessoas.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>
                Essa simulação foi criada antes das pessoas fazerem parte do cadastro — ela roda uma conversa
                só, sem dados de pessoa. Abrir em "Editar" e salvar já cria a lista.
              </p>
            ) : (
              <div className="ficha-list">
              {pessoas.map((p, idx) => (
                <div className="checklist-row" key={idx} style={{ padding: "10px 14px" }}>
                  <div className="checklist-row-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="slot-avatar">{iniciais(p.nome)}</span>
                    <div>
                      <div className="checklist-row-title" style={{ fontSize: 13.5 }}>
                        {p.nome || "Sem nome"}
                        {test.cenariosIndividuaisAtivo && overrides[String(idx)]?.cenario && (
                          <span className="slot-tag persona">cenário próprio</span>
                        )}
                      </div>
                      <div className="meta">{resumoDados(p)}</div>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="ficha-sec-head">
              <h3>O que conversa</h3>
              <Link className="ficha-edit" href={editarHref(2)}>
                Editar cenário
              </Link>
            </div>

            <div className="ficha-block">
              <div className="ficha-label">Cenário da simulação</div>
              <p className="ficha-read">{test.cenario}</p>
            </div>

            <div className="ficha-block">
              <div className="ficha-label">Critério de sucesso</div>
              <p className={`ficha-read${test.criterioSucesso ? "" : " vazio"}`}>
                {test.criterioSucesso || "Nenhum critério definido — a IA decide pelo desfecho da conversa."}
              </p>
            </div>

            {pessoas.length > 0 && test.cenariosIndividuaisAtivo && (
              <div className="ficha-block">
                <div className="ficha-label">Cenário em vigor por pessoa</div>
                <div className="eff-table-wrap">
                  <table className="eff-table">
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th>Cenário em vigor</th>
                        <th>Vem de</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pessoas.map((p, idx) => {
                        const efetivo = cenarioDaPessoa(idx, p);
                        return (
                          <tr key={idx}>
                            <td>
                              <strong>{p.nome || "Sem nome"}</strong>
                            </td>
                            <td>{preview(efetivo.texto)}</td>
                            <td>
                              <span className={`origem-tag ${efetivo.proprio ? "proprio" : "simulacao"}`}>
                                {efetivo.proprio ? "escrito pra ela" : "cenário da simulação"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {(running || liveTurns.length > 0 || lastRun || runError || Object.keys(batchProgress).length > 0) && (
            <div className="panel">
              <div className="ficha-sec-head">
                <h3>Execução atual</h3>
                {Object.keys(batchProgress).length > 0 && (
                  <span className="meta">
                    {batchConcluidos} de {Object.keys(batchProgress).length} concluídos
                  </span>
                )}
              </div>

              {liveStatus && <p className="status-msg">{liveStatus}</p>}
              {runError && <p className="status-msg err">{runError}</p>}

              {Object.keys(batchProgress).length > 0 && (
                <div className="status-msg-list">
                  {pessoas.map((pessoa, idx) => {
                    const entry = batchProgress[idx];
                    if (!entry) return null;
                    const label =
                      entry.status === "fila"
                        ? "Na fila"
                        : entry.status === "rodando"
                          ? `Turno ${entry.turno ?? 0} de ${entry.maxTurnos ?? test.maxTurnos}`
                          : entry.status === "ERRO"
                            ? `Erro: ${entry.erro}`
                            : `${entry.status} · ${entry.turno ?? 0}/${entry.maxTurnos ?? test.maxTurnos} turnos`;
                    return (
                      <div
                        key={idx}
                        className={`status-msg ${
                          entry.status === "SUCESSO"
                            ? "ok"
                            : entry.status === "FALHA" || entry.status === "ERRO"
                              ? "err"
                              : ""
                        }`}
                      >
                        <div>
                          <strong>{pessoa.nome}</strong> — {label}
                        </div>
                        {entry.final && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ marginTop: 6 }}
                            onClick={() => {
                              const efetivo = cenarioDaPessoa(idx, pessoa);
                              const dados = pessoaLinhaParaDados(pessoa);
                              abrirRelatorioPDF({
                                titulo: `Relatório de QA — ${pessoa.nome}`,
                                d: entry.final!,
                                cenario: efetivo.texto,
                                criterio:
                                  (test.cenariosIndividuaisAtivo && overrides[String(idx)]?.criterio) ||
                                  (test.criterioSucesso ? preencherTemplate(test.criterioSucesso, dados) : "—"),
                              });
                            }}
                          >
                            Exportar PDF
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {liveTurns.length > 0 && (
                <div className="status-msg-list">
                  {liveTurns.map((t) => (
                    <div key={t.turno} className="status-msg">
                      <strong>Turno {t.turno}</strong>
                      <div>➜ {t.enviado} <ListaAnexos anexos={t.anexos} /></div>
                      <div>⇐ {t.resposta_avatar}</div>
                    </div>
                  ))}
                </div>
              )}

              {lastRun && (
                <>
                  <div
                    className={`status-msg ${
                      lastRun.resultado === "SUCESSO" ? "ok" : lastRun.resultado === "FALHA" ? "err" : ""
                    }`}
                  >
                    <strong>{lastRun.resultado}</strong> — {lastRun.motivo_encerramento}
                    {" · "}
                    {lastRun.total_turnos}/{lastRun.max_turnos} turnos · {lastRun.tempo_segundos}s
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      abrirRelatorioPDF({
                        titulo: `Relatório de QA — ${test.name}`,
                        d: lastRun,
                        cenario: test.cenario,
                        criterio: test.criterioSucesso || "—",
                      })
                    }
                  >
                    Exportar PDF
                  </button>
                </>
              )}
            </div>
          )}

          <div className="panel">
            <div className="ficha-sec-head">
              <h3>Histórico de execuções</h3>
              <span className="meta">
                {runs.length} {runs.length === 1 ? "registro" : "registros"}
              </span>
            </div>

            {runs.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                Nenhuma execução registrada ainda.
              </p>
            )}

            <div className="ficha-list">
            {runs.map((r) => {
              const expanded = expandedRunId === r.id;
              return (
                <div className="checklist-row" key={r.id}>
                  <div
                    className="checklist-row-info"
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpandedRunId(expanded ? null : r.id)}
                  >
                    <div className="checklist-row-title">
                      {r.resultado === "SUCESSO" ? (
                        <IconCheck size={13} className="status-icon-ok" />
                      ) : (
                        <IconX size={13} className="status-icon-err" />
                      )}
                      {r.resultado || "—"}
                      {r.personaNome ? ` · ${r.personaNome}` : ""}
                    </div>
                    <div className="meta">
                      {formatDateTime(r.startedAt)} · {r.totalTurnos ?? 0}/{r.maxTurnos ?? "—"} turnos
                      {r.tempoSegundos != null ? ` · ${r.tempoSegundos}s` : ""}
                      {r.ambienteExecucao || r.avatarExecucao
                        ? ` · rodou em ${r.avatarExecucao || test.avatar} · ${r.ambienteExecucao || test.ambiente}`
                        : ""}
                      {r.embaralhamento ? ` · dados embaralhados: ${r.embaralhamento}` : ""}
                    </div>
                  </div>
                  <div className="checklist-row-actions">
                    <button
                      type="button"
                      className="btn-ghost card-menu-item-danger"
                      disabled={deletingRunId === r.id}
                      onClick={() => handleDeleteRun(r.id)}
                      title="Apagar este registro"
                    >
                      <IconTrash size={13} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="checklist-row-expanded">
                      <div className="status-msg-list">
                        {r.motivoEncerramento && <p className="meta">{r.motivoEncerramento}</p>}
                        {(r.transcricao || []).map((t) => (
                          <div key={t.turno} className="status-msg">
                            <strong>Turno {t.turno}</strong>
                            <div>➜ {t.enviado} <ListaAnexos anexos={t.anexos} /></div>
                            <div>⇐ {t.resposta_avatar}</div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ marginTop: 8 }}
                        onClick={() =>
                          abrirRelatorioPDF({
                            titulo: `Relatório de QA — ${test.name}${r.personaNome ? ` · ${r.personaNome}` : ""}`,
                            d: {
                              resultado: r.resultado,
                              motivo_encerramento: r.motivoEncerramento,
                              total_turnos: r.totalTurnos,
                              max_turnos: r.maxTurnos,
                              tempo_segundos: r.tempoSegundos,
                              transcricao: r.transcricao,
                              conversation_id: r.conversationId,
                            },
                            cenario: test.cenario,
                            criterio: test.criterioSucesso || "—",
                          })
                        }
                      >
                        Exportar PDF
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <div className="ficha-col">
          <div className="panel">
            <div className="ficha-sec-head">
              <h3>Como conversa</h3>
              <Link className="ficha-edit" href={editarHref(3)}>
                Editar
              </Link>
            </div>

            <dl className="ficha-dl">
              <dt>Máximo de turnos</dt>
              <dd>{test.maxTurnos}</dd>
              {pessoas.length > 1 && (
                <>
                  <dt>Conversas ao mesmo tempo</dt>
                  <dd>{test.maxSimultaneos || 5}</dd>
                </>
              )}
            </dl>

            <dl className="ficha-dl">
              <dt>Mensagem de cada turno</dt>
              <dd>
                <span className={`ficha-state${test.mensagensPorTurno ? " on" : ""}`}>
                  {test.mensagensPorTurno ? "ligado" : "desligado"}
                </span>
              </dd>
              {test.mensagensPorTurno && (
                <>
                  <dt>Roda o roteiro inteiro</dt>
                  <dd>
                    <span className={`ficha-state${test.rodarRoteiroCompleto ? " on" : ""}`}>
                      {test.rodarRoteiroCompleto ? "ligado" : "desligado"}
                    </span>
                    {test.rodarRoteiroCompleto
                      ? " · o critério de sucesso não encerra a conversa antes do fim do roteiro"
                      : ""}
                  </dd>
                </>
              )}
            </dl>

            {test.mensagensPorTurno && (test.roteiroTurnos || []).length > 0 && (
              <div className="ficha-block">
                <div className="ficha-label">Roteiro</div>
                <div className="roteiro-ficha">
                  {(test.roteiroTurnos || []).map((t) => (
                    <div className="roteiro-ficha-linha" key={t.turno}>
                      <span className="roteiro-num">
                        {t.turno}
                        {t.emDiante ? "+" : ""}
                      </span>
                      <div>
                        <span className="roteiro-modo-fixo">
                          {t.turno === 1 ? "Abertura · " : ""}
                          {rotuloModo(t.modo)}
                          {t.emDiante ? " · deste turno em diante" : ""}
                          {t.modo === "instrucao" && t.turno !== 1 && t.ignorarAvatar !== false
                            ? " · ignora a pergunta do avatar"
                            : ""}
                        </span>
                        <p className="roteiro-leitura">
                          {t.modo === "livre"
                            ? "Turno livre: a pessoa simulada responde a partir do cenário."
                            : t.modo === "exato"
                              ? t.texto.trim()
                                ? `“${t.texto}”`
                                : "Só o arquivo, sem texto."
                              : t.texto}
                        </p>
                        {(t.anexos || []).length > 0 && (
                          <div className="roteiro-ficha-anexos">
                            <ListaAnexos anexos={t.anexos} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="ficha-sec-head">
              <h3>Como os dados chegam</h3>
              <Link className="ficha-edit" href={editarHref(4)}>
                Editar
              </Link>
            </div>
            <dl className="ficha-dl">
              <dt>Embaralhar os dados</dt>
              <dd>
                <span className={`ficha-state${test.embaralharDados ? " on" : ""}`}>
                  {test.embaralharDados ? "ligado" : "desligado"}
                </span>
              </dd>
              {test.embaralharDados && (
                <>
                  <dt>Como</dt>
                  <dd>
                    {resumirEmbaralhamento(
                      test.embaralharDados,
                      test.embaralharConfig,
                      (test.pessoas || []).length
                    )}
                  </dd>
                </>
              )}
            </dl>
            <p className="hint" style={{ margin: 0 }}>
              {test.embaralharDados
                ? "A pessoa simulada manda os dados dela nas chaves erradas — o valor certo, no lugar errado. O critério de sucesso continua sendo preenchido com os dados de verdade."
                : "A pessoa simulada manda os dados dela certinhos, cada valor na sua chave."}
            </p>
          </div>

          <div className="panel">
            <div className="ficha-sec-head">
              <h3>Onde roda</h3>
              <Link className="ficha-edit" href={editarHref(5)}>
                Editar
              </Link>
            </div>
            <dl className="ficha-dl">
              <dt>Avatar</dt>
              <dd>{test.avatar || "—"}</dd>
              <dt>Ambiente</dt>
              <dd>{test.ambiente || "—"}</dd>
              <dt>Host slug</dt>
              <dd>{test.hostSlug}</dd>
              <dt>Sub-slug</dt>
              <dd>{test.subSlug || "—"}</dd>
              <dt>API Zenta</dt>
              <dd className="quebra">{apiLabel}</dd>
              <dt>Conversa</dt>
              <dd className="quebra">
                {urlConversa ? (
                  <a href={urlConversa} target="_blank" rel="noopener noreferrer">
                    {urlConversa.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            <p className="hint" style={{ marginTop: -4 }}>
              {semDestino
                ? "Esta simulação ainda não tem destino. Escolha o ambiente e o avatar no switch do card, na lista de Simulações — é lá que isso é decidido, na hora de rodar."
                : "Ambiente e avatar são escolhidos no switch do card, na lista de Simulações, e valem a partir da próxima execução. O host slug e a API vêm do avatar e do ambiente escolhidos."}
            </p>

            <div className="ficha-block">
              <div className="ficha-label">Etiquetas</div>
              {test.tags.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Sem etiquetas.
                </p>
              ) : (
                <div className="tags">
                  {test.tags.map((t) => (
                    <span
                      className="tag"
                      style={tagPillStyle(availableTags.find((at) => at.name === t)?.color)}
                      key={t}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
