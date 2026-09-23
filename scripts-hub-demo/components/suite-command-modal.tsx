"use client";

import { useState } from "react";
import { ScriptEntry } from "@/lib/types";
import { buildSequenceCommand } from "@/lib/comandoLote";

/**
 * Modal "Copiar comando" de uma suíte (22/09/2026).
 *
 * Mesmas opções do "Selecionar vários" da Biblioteca, só que o comando sai na
 * ORDEM da sequência — é por isso que existe um `buildSequenceCommand`
 * separado do `buildBatchCommand`. Virou componente porque as duas telas de
 * suíte (a lista e a da suíte aberta) mostram o mesmo modal.
 */
export function SuiteCommandModal({
  nome,
  scripts,
  onClose,
}: {
  nome: string;
  /** Scripts JÁ na ordem da sequência. */
  scripts: ScriptEntry[];
  onClose: () => void;
}) {
  const [sleep, setSleep] = useState(true);
  const [sleepSeconds, setSleepSeconds] = useState(10);
  const [workers, setWorkers] = useState(false);
  const [headed, setHeaded] = useState(false);

  const comando = buildSequenceCommand(scripts, { sleep, sleepSeconds, workers, headed });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Comando da suíte "{nome}"</h3>
        <p className="hint">
          Os testes entram na ordem da sequência. Copie e cole no terminal.
        </p>
        <div className="cmd-options">
          <label className="checkbox-row">
            <input type="checkbox" checked={sleep} onChange={(e) => setSleep(e.target.checked)} />
            Intervalo entre testes (sleep)
            {sleep && (
              <input
                type="number"
                min={1}
                className="workers-input"
                value={sleepSeconds}
                onChange={(e) => setSleepSeconds(Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={workers} onChange={(e) => setWorkers(e.target.checked)} />
            --workers=1
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={headed} onChange={(e) => setHeaded(e.target.checked)} />
            --headed
          </label>
        </div>
        <pre className="batch-cmd-preview">{comando}</pre>
        <div className="confirm-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {/* Mesmo gesto do "Rodar no meu terminal" da Biblioteca: copia e sai. */}
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              navigator.clipboard.writeText(comando);
              onClose();
            }}
          >
            Copiar e fechar
          </button>
        </div>
      </div>
    </div>
  );
}
