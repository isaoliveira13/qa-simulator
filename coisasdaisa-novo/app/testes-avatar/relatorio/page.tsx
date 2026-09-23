"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarTest, AvatarTestRun } from "@/lib/types";
import { SelectPopover } from "@/components/select-popover";
import { usePersistedState } from "@/lib/usePersistedState";
import { gerarRelatorioSimulacaoPdf } from "@/lib/relatorioSimulacao";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

// Relatório em PDF das execuções de simulação. A montagem do documento mora
// em lib/relatorioSimulacao.ts — o mesmo gerador usado pelo botão "Emitir
// relatório" do painel de resultado em app/testes-avatar, pra as duas telas
// entregarem exatamente o mesmo PDF (ficha da simulação + tabela das
// conversas + troca de mensagens em balões).
//
// Aqui a tela cuida de ESCOLHER o que entra: filtro por simulação/resultado/
// busca (o de sempre) e, desde 04/09/2026, caixinha por execução — dá pra
// emitir só uma ou duas conversas de uma rodada em vez do bloco inteiro.
export default function RelatorioAvatarPage() {
  const [runs, setRuns] = useState<AvatarTestRun[]>([]);
  const [tests, setTests] = useState<AvatarTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [testFilter, setTestFilter] = usePersistedState("testesAvatarRelatorio:testFilter", "");
  const [resultadoFilter, setResultadoFilter] = usePersistedState("testesAvatarRelatorio:resultadoFilter", "");
  const [search, setSearch] = usePersistedState("testesAvatarRelatorio:search", "");

  // Execuções marcadas à mão. Lista vazia = nenhuma marcada, e aí o botão
  // emite tudo o que o filtro deixou na tela — o comportamento antigo, que
  // continua sendo o caminho de um clique só.
  const [marcadas, setMarcadas] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/avatar-test-runs?limit=1000").then((r) => r.json()),
      fetch("/api/avatar-tests").then((r) => r.json()),
    ])
      .then(([runsData, testsData]) => {
        if (runsData.error) throw new Error(runsData.error);
        if (testsData.error) throw new Error(testsData.error);
        setRuns(runsData.runs);
        setTests(testsData.avatarTests);

        // Se veio de "Relatório" dentro de um teste específico (?testId=...),
        // pré-seleciona o filtro por esse teste (o SelectPopover usa nome, não id).
        const params = new URLSearchParams(window.location.search);
        const testId = params.get("testId");
        if (testId) {
          const test = (testsData.avatarTests as AvatarTest[]).find((t) => t.id === testId);
          if (test) setTestFilter(test.name);
        }
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }, []);

  const testsById = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);

  const testOptions = useMemo(
    () => tests.map((t) => t.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tests]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      const test = r.avatarTestId ? testsById.get(r.avatarTestId) : undefined;
      if (testFilter && test?.name !== testFilter) return false;
      if (resultadoFilter && r.resultado !== resultadoFilter) return false;
      if (q) {
        const alvo = `${test?.name || ""} ${r.personaNome || ""} ${r.motivoEncerramento || ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [runs, testsById, testFilter, resultadoFilter, search]);

  const sucessoCount = filtered.filter((r) => r.resultado === "SUCESSO").length;
  const falhaCount = filtered.filter((r) => r.resultado === "FALHA").length;

  // Marcar e depois mexer no filtro não deve emitir o que sumiu da tela.
  const marcadasVisiveis = useMemo(
    () => filtered.filter((r) => marcadas.includes(r.id)),
    [filtered, marcadas]
  );

  const paraEmitir = marcadasVisiveis.length > 0 ? marcadasVisiveis : filtered;
  const todasMarcadas = filtered.length > 0 && marcadasVisiveis.length === filtered.length;

  function toggleMarcada(id: string) {
    setMarcadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleTodas() {
    setMarcadas(todasMarcadas ? [] : filtered.map((r) => r.id));
  }

  async function generatePdf() {
    setGeneratingPdf(true);
    setError(null);
    try {
      await gerarRelatorioSimulacaoPdf({ runs: paraEmitir, testsById });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div>

      <div className="page-header-row">
        <div>
          <h1>Relatório</h1>
          <p className="subtitle">
            Todas as execuções de simulação. Marque as conversas que interessam — sem nenhuma marcada,
            o PDF sai com tudo que o filtro deixou na tela.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={generatePdf}
            disabled={generatingPdf || paraEmitir.length === 0}
          >
            {generatingPdf
              ? "Gerando PDF..."
              : marcadasVisiveis.length > 0
                ? `Emitir relatório PDF (${marcadasVisiveis.length} marcada${marcadasVisiveis.length === 1 ? "" : "s"})`
                : `Emitir relatório PDF (${filtered.length})`}
          </button>
        </div>
      </div>

      <div className="filters">
        <SelectPopover
          allLabel="Todas as simulações"
          value={testFilter}
          options={testOptions}
          onChange={setTestFilter}
        />
        <SelectPopover
          allLabel="Todos os resultados"
          value={resultadoFilter}
          options={["SUCESSO", "FALHA", "ENCERRADO"]}
          onChange={setResultadoFilter}
        />
        <input
          placeholder="Buscar por simulação, persona ou motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="checklist-summary report-summary-row">
        <span>
          {sucessoCount} sucesso · {falhaCount} falha · {filtered.length} no total
          {marcadasVisiveis.length > 0 ? ` · ${marcadasVisiveis.length} marcada(s)` : ""}
        </span>
        {filtered.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={toggleTodas}>
            {todasMarcadas ? "Limpar seleção" : "Marcar todas"}
          </button>
        )}
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="empty">Nenhuma execução encontrada.</p>
      )}

      {filtered.map((r) => {
        const test = r.avatarTestId ? testsById.get(r.avatarTestId) : undefined;
        return (
          <div className="checklist-row" key={r.id}>
            <label className="run-pick">
              <input
                type="checkbox"
                checked={marcadas.includes(r.id)}
                onChange={() => toggleMarcada(r.id)}
                aria-label={`Incluir a execução de ${r.personaNome || test?.name || "simulação"} no relatório`}
              />
            </label>
            <div className="checklist-row-info">
              <div className="checklist-row-title">
                {test?.name || "(simulação apagada)"}
                {r.personaNome ? ` · ${r.personaNome}` : ""}
              </div>
              <div className="meta">
                {formatDateTime(r.startedAt)} · {r.totalTurnos ?? 0}/{r.maxTurnos ?? "—"} turnos
                {r.tempoSegundos != null ? ` · ${r.tempoSegundos}s` : ""}
                {r.ambienteExecucao || r.avatarExecucao
                  ? ` · rodou em ${r.avatarExecucao || test?.avatar} · ${r.ambienteExecucao || test?.ambiente}`
                  : ""}
                {r.embaralhamento ? ` · dados embaralhados: ${r.embaralhamento}` : ""}
              </div>
            </div>
            <span
              className={`checklist-status-label ${
                r.resultado === "SUCESSO" ? "pass" : r.resultado === "FALHA" ? "fail" : ""
              }`}
            >
              {r.resultado || "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
