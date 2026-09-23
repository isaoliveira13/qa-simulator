"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AvatarTest } from "@/lib/types";
import { SimulacaoWizard } from "@/components/simulacao-wizard";

/**
 * Editar uma simulação salva pelas mesmas 5 etapas de "Nova simulação" —
 * um formulário só pros dois caminhos (Isa confirmou em 23/08/2026), em vez
 * do modal rápido que existia antes na lista.
 */
export default function EditarSimulacaoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const router = useRouter();

  const [test, setTest] = useState<AvatarTest | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // "?etapa=N" (1 a 5) chega dos atalhos "Editar" de cada bloco da ficha da
  // simulacao — abre o assistente ja no assunto que ela clicou. Lido do
  // window (e nao por useSearchParams) pra nao precisar de Suspense no build.
  const [etapaInicial, setEtapaInicial] = useState(0);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("etapa"));
    if (Number.isInteger(n) && n >= 1 && n <= 5) setEtapaInicial(n - 1);
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/avatar-tests/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTest(data.avatarTest);
      })
      .catch((e: any) => setErro(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Editar simulação</h1>
          <p className="subtitle">
            {test ? test.name : "Carregando..."} — as mesmas cinco etapas da criação, com tudo preenchido.
          </p>
        </div>
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {erro && <p className="status-msg err">{erro}</p>}

      {test && (
        <SimulacaoWizard
          initial={test}
          etapaInicial={etapaInicial}
          onCancel={() => router.push(`/testes-avatar/${id}`)}
          onSaved={(salvo) => router.push(`/testes-avatar/${salvo.id}`)}
        />
      )}
    </div>
  );
}
