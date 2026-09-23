"use client";

// Hook compartilhado com a lógica de "rodar em lote" (worker-pool com limite
// de simultâneos, uma conversa por pessoa) — usado tanto no Estúdio de
// testes (lib/testes-avatar/avulso) quanto na tela de um teste em lote
// salvo (app/testes-avatar/[id]), pra não duplicar essa lógica nos dois
// lugares. Mesmo algoritmo do iniciarLote do coisasdaisa (index.html).

import { useCallback, useRef, useState } from "react";
import { AvatarTurn } from "./types";
import { PessoaLinha } from "./loteText";
import { ConversationReportData } from "./conversationReport";

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
  runId?: string;
};

type ProxyResponse = TurnoResponse | FinalResponse;

export type BatchStatus = "fila" | "rodando" | "SUCESSO" | "FALHA" | "ENCERRADO" | "ERRO";

export type BatchEntry = {
  status: BatchStatus;
  turno?: number;
  maxTurnos?: number;
  erro?: string;
  // Relatório completo, preenchido quando a conversa termina — usado pelo
  // botão "Exportar PDF" de cada card do lote.
  final?: ConversationReportData;
};

type Override = { cenario?: string; criterio?: string } | undefined;

/**
 * `buildBaseBody` monta campos enviados em TODA chamada da conversa (ex.:
 * `{ avatarTestId }` pra um teste salvo persistir o histórico ao terminar —
 * avulso não precisa disso, retorna `{}`). `buildNovoBody` monta campos só
 * da primeira chamada de cada conversa (ex.: `{ avulso: {...} }` — um teste
 * salvo não precisa, já tem a config no banco via avatarTestId).
 */
export function useLoteBatch(
  buildBaseBody: () => Record<string, unknown>,
  buildNovoBody: () => Record<string, unknown>
) {
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<Record<number, BatchEntry>>({});
  const batchAbortRef = useRef(false);

  const chamarProxy = useCallback(
    async (body: {
      conversationId?: string;
      encerrar?: boolean;
      pessoa?: PessoaLinha;
      /** Posicao da pessoa na lista do lote — a rota /run usa pra saber se o
       *  embaralhamento de dados (etapa 4) vale pra ela quando a simulacao
       *  embaralha "so algumas". */
      pessoaIndex?: number;
      cenarioOverride?: string;
      criterioOverride?: string;
    }): Promise<ProxyResponse> => {
      const res = await fetch("/api/avatar-tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildBaseBody(),
          ...body,
          ...(body.conversationId ? {} : buildNovoBody()),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    [buildBaseBody, buildNovoBody]
  );

  const rodarUmaPessoa = useCallback(
    async (pessoa: PessoaLinha, idx: number, override: Override) => {
      setBatchProgress((prev) => ({ ...prev, [idx]: { status: "rodando" } }));
      try {
        let data = await chamarProxy({
          pessoa,
          pessoaIndex: idx,
          cenarioOverride: override?.cenario || undefined,
          criterioOverride: override?.criterio || undefined,
        });
        while (data.status === "continuar") {
          if (batchAbortRef.current) {
            const final = await chamarProxy({ pessoa, conversationId: data.conversation_id, encerrar: true });
            if (final.status !== "continuar") {
              setBatchProgress((prev) => ({
                ...prev,
                [idx]: {
                  status: (final.resultado as BatchStatus) || "ENCERRADO",
                  turno: final.total_turnos,
                  maxTurnos: final.max_turnos,
                  final,
                },
              }));
            }
            return;
          }
          const turnoAtual = data.turno_atual;
          const maxTurnosAtual = data.max_turnos;
          setBatchProgress((prev) => ({
            ...prev,
            [idx]: { status: "rodando", turno: turnoAtual, maxTurnos: maxTurnosAtual },
          }));
          data = await chamarProxy({ pessoa, conversationId: data.conversation_id });
        }
        setBatchProgress((prev) => ({
          ...prev,
          [idx]: {
            status: data.resultado as BatchStatus,
            turno: data.total_turnos,
            maxTurnos: data.max_turnos,
            final: data,
          },
        }));
      } catch (e: any) {
        setBatchProgress((prev) => ({
          ...prev,
          [idx]: { status: "ERRO", erro: e.message || String(e) },
        }));
      }
    },
    [chamarProxy]
  );

  const iniciarLote = useCallback(
    async (pessoasPedidas: PessoaLinha[], maxSimultaneos: number, overrideFor?: (idx: number) => Override) => {
      // MODO DEMO: no máximo 10 pessoas por lote, pra não sobrecarregar.
      const pessoas = pessoasPedidas.slice(0, 10);
      if (pessoas.length === 0) return;
      setBatchRunning(true);
      batchAbortRef.current = false;
      setBatchProgress(Object.fromEntries(pessoas.map((_, idx) => [idx, { status: "fila" as BatchStatus }])));

      let proximo = 0;
      const limite = Math.max(1, Math.min(maxSimultaneos, pessoas.length));

      async function worker() {
        while (proximo < pessoas.length) {
          if (batchAbortRef.current) return;
          const idx = proximo++;
          await rodarUmaPessoa(pessoas[idx], idx, overrideFor?.(idx));
        }
      }

      await Promise.all(Array.from({ length: limite }, () => worker()));
      setBatchRunning(false);
    },
    [rodarUmaPessoa]
  );

  const pararLote = useCallback(() => {
    batchAbortRef.current = true;
  }, []);

  const batchConcluidos = Object.values(batchProgress).filter((b) =>
    ["SUCESSO", "FALHA", "ENCERRADO", "ERRO"].includes(b.status)
  ).length;

  return { batchRunning, batchProgress, iniciarLote, pararLote, batchConcluidos };
}
