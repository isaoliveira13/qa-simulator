import { redirect } from "next/navigation";

// A home do antigo "Repositório de Scripts" era a Biblioteca. Sem Scripts
// neste repositório (só o motor de simulação de avatar), "/" manda direto
// pra tela de Simulações, que é a porta de entrada do Avatar IA.
export default function Home() {
  redirect("/testes-avatar");
}
