"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * O "Estúdio de testes" virou o assistente de 5 etapas em 23/08/2026 (ver
 * components/simulacao-wizard.tsx). Esta rota continua existindo só pra não
 * quebrar links/abas antigas — manda direto pra "Nova simulação".
 */
export default function EstudioRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/testes-avatar/nova");
  }, [router]);
  return <p className="empty">Redirecionando para "Nova simulação"...</p>;
}
