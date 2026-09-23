/**
 * Onde a conversa em andamento fica guardada entre uma chamada e outra.
 *
 * MODO DEMO: isto era uma tabela do Postgres (avatar_conversation_sessions).
 * Como esta versão não tem nenhum banco de verdade — de propósito, pra nada
 * ficar salvo nem compartilhado entre visitantes — a sessão agora vive só na
 * memória do processo, com o mesmo TTL de 1 hora de antes. Cada instância do
 * servidor tem seu próprio mapa; reiniciar o processo (ou um novo cold start
 * na Vercel) apaga qualquer conversa em andamento, o que é exatamente o
 * comportamento esperado de uma demonstração.
 */

import { SessaoConversa } from "./qaSimulador";

const TTL_MS = 60 * 60 * 1000; // 1 hora, igual ao motor original

declare global {
  // eslint-disable-next-line no-var
  var __demoSessions: Map<string, { estado: SessaoConversa; expiraEm: number }> | undefined;
}

function store(): Map<string, { estado: SessaoConversa; expiraEm: number }> {
  if (!global.__demoSessions) global.__demoSessions = new Map();
  return global.__demoSessions;
}

export async function getSession(conversationId: string): Promise<SessaoConversa | null> {
  const entry = store().get(conversationId);
  if (!entry) return null;
  if (entry.expiraEm <= Date.now()) {
    store().delete(conversationId);
    return null;
  }
  return entry.estado;
}

export async function setSession(conversationId: string, session: SessaoConversa): Promise<void> {
  store().set(conversationId, { estado: session, expiraEm: Date.now() + TTL_MS });
}

export async function deleteSession(conversationId: string): Promise<void> {
  store().delete(conversationId);
}

/** Faxina das sessões vencidas — chamada na criação de uma conversa nova. */
export async function limparSessoesVencidas(): Promise<void> {
  const agora = Date.now();
  for (const [id, entry] of store()) {
    if (entry.expiraEm <= agora) store().delete(id);
  }
}
