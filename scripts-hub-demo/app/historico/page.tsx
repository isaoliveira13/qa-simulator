"use client";

import { useEffect, useMemo, useState } from "react";
import { Execution, ScriptEntry, Suite } from "@/lib/types";
import { IconCheck, IconTrash, IconX } from "../icons";
import { SelectPopover } from "@/components/select-popover";
import { usePersistedState } from "@/lib/usePersistedState";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function HistoricoPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scriptFilter, setScriptFilter] = usePersistedState("historico:scriptFilter", "");
  const [statusFilter, setStatusFilter] = usePersistedState("historico:statusFilter", "");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/executions?limit=300").then((r) => r.json()),
      fetch("/api/scripts").then((r) => r.json()),
      fetch("/api/suites").then((r) => r.json()),
    ])
      .then(([execData, scriptsData, suitesData]) => {
        if (execData.error) throw new Error(execData.error);
        if (scriptsData.error) throw new Error(scriptsData.error);
        if (suitesData.error) throw new Error(suitesData.error);
        setExecutions(execData.executions);
        setScripts(scriptsData.scripts);
        setSuites(suitesData.suites);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
  }, []);

  const scriptsById = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);
  const suitesById = useMemo(() => new Map(suites.map((s) => [s.id, s])), [suites]);

  const scriptOptions = useMemo(
    () => scripts.map((s) => s.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [scripts]
  );

  const filtered = executions.filter((e) => {
    const script = e.scriptId ? scriptsById.get(e.scriptId) : undefined;
    if (scriptFilter && script?.name !== scriptFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  });

  const passedCount = filtered.filter((e) => e.status === "passed").length;
  const failedCount = filtered.length - passedCount;

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/executions/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExecutions((prev) => prev.filter((e) => e.id !== id));
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
          <h1>Histórico de execução</h1>
          <p className="subtitle">
            Registros marcados manualmente ao rodar uma suíte.
          </p>
        </div>
      </div>

      <div className="filters">
        <SelectPopover
          allLabel="Todos os scripts"
          value={scriptFilter}
          options={scriptOptions}
          onChange={setScriptFilter}
        />
        <SelectPopover
          allLabel="Passou e falhou"
          value={statusFilter}
          options={["passed", "failed"]}
          onChange={setStatusFilter}
          formatOption={(v) => (v === "passed" ? "Passou" : "Falhou")}
        />
      </div>

      <div className="checklist-summary">
        {passedCount} passou · {failedCount} falhou · {filtered.length} no total
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="empty">Nenhum registro encontrado. Marque um resultado ao rodar uma suíte.</p>
      )}

      {filtered.map((e) => {
        const script = e.scriptId ? scriptsById.get(e.scriptId) : undefined;
        const suite = e.suiteId ? suitesById.get(e.suiteId) : undefined;
        return (
          <div className="checklist-row" key={e.id}>
            <div className="checklist-row-info">
              <div className="checklist-row-title">
                {e.status === "passed" ? (
                  <IconCheck size={13} className="status-icon-ok" />
                ) : (
                  <IconX size={13} className="status-icon-err" />
                )}
                {script?.name || "(script apagado)"}
              </div>
              <div className="meta">
                {formatDateTime(e.executedAt)}
                {suite ? ` · suíte: ${suite.name}` : ""}
              </div>
            </div>
            <div className="checklist-row-actions">
              <span className={`checklist-status-label ${e.status === "passed" ? "pass" : "fail"}`}>
                {e.status === "passed" ? "Passou" : "Falhou"}
              </span>
              <button
                type="button"
                className="btn-ghost card-menu-item-danger"
                disabled={deletingId === e.id}
                onClick={() => handleDelete(e.id)}
                title="Apagar este registro"
              >
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
