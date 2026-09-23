"use client";

import { useRouter } from "next/navigation";
import { SimulacaoWizard } from "@/components/simulacao-wizard";

/**
 * "Nova simulação" — o caminho de criação, aberto pelo botão da lista de
 * Simulações. Substituiu o "Estúdio de testes" (app/testes-avatar/avulso,
 * hoje só um redirecionamento pra cá), que era um formulário único onde
 * criar, rodar e salvar disputavam a mesma tela.
 */
export default function NovaSimulacaoPage() {
  const router = useRouter();
  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Nova simulação</h1>
          <p className="subtitle">
            Cinco etapas: quem conversa, o que conversa, como conversa, como os dados chegam e como ela se
            chama.
          </p>
        </div>
      </div>

      <SimulacaoWizard
        onCancel={() => router.push("/testes-avatar")}
        onSaved={(test) => router.push(`/testes-avatar/${test.id}`)}
      />
    </div>
  );
}
