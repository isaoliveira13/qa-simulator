/**
 * MODO DEMO — no motor original este arquivo era o "cérebro" que pedia pra
 * OpenAI decidir o que a pessoa simulada faria a cada turno. Nesta versão de
 * portfólio não existe chamada nenhuma pra OpenAI (nem pra nenhuma outra IA
 * externa): a fala da pessoa e a decisão de "sucesso/continuar/erro" são
 * geradas 100% localmente, a partir do cenário, do critério de sucesso e dos
 * dados fixos que a pessoa preencheu no formulário — nunca um texto genérico
 * solto, mas também nunca uma chamada de rede.
 *
 * As heurísticas de loop (lib/qaHeuristicas.ts) continuam de pé exatamente
 * como estavam: ainda são elas que percebem quando o avatar fictício está
 * repetindo a mesma coisa e forçam o encerramento.
 */

import { checarLimitesDeLoop, hasSuccessEvidence } from "./qaHeuristicas";
import { entradaDoTurno, roteiroTemTurnoDepoisDe } from "./roteiroTurnos";
import { QuandoEmbaralhar, TurnoRoteiro } from "./types";
import { ParOcorrencia } from "./embaralhar";

/** Estado de uma conversa em andamento — o que atravessa os turnos. */
export interface SessaoConversa {
  baseUrl: string;
  hostId: string;
  hostToken: string;
  hostSlug: string;
  subSlug: string | null;
  conversationId: string;
  cenario: string;
  criterioSucesso: string;
  dadosFixos: Record<string, unknown> | null;
  maxTurnos: number;
  saudacao: string;
  /**
   * Roteiro de turnos ja resolvido pra esta pessoa (placeholders trocados
   * pelos dados dela em app/api/avatar-tests/run). `null` = a pessoa
   * improvisa a partir do cenario, como sempre foi. Ver lib/roteiroTurnos.ts.
   */
  roteiroTurnos?: TurnoRoteiro[] | null;
  rodarRoteiroCompleto?: boolean;
  /**
   * Em que turno o criterio foi cumprido, quando o sucesso esta guardado
   * esperando o roteiro acabar. `null`/ausente = nada guardado.
   */
  sucessoSeguradoNoTurno?: number | null;
  embaralhoPares?: ParOcorrencia[] | null;
  embaralhoQuando?: QuandoEmbaralhar | null;
  embaralhoContagem?: Record<string, number>;
  embaralhoResumo?: string | null;
  startISO: string;
  startMs: number;
  iteration: number;
  status: "continuar" | "sucesso" | "erro";
  motivo: string | null;
  nextQuestion: string;
  turnsLog: TurnoLog[];
  avatarHist: string[];
  consecSimilar: number;
  repeatExact: number;
  lastProgressIter: number;
  // preenchidos durante um turno
  avatarMessage?: string;
  okStatus?: boolean;
  erroHttp?: string | null;
  statusCode?: number | null;
  tentativas?: number;
  encerradoManualmente?: boolean;
  /**
   * MODO DEMO: decidido em lib/qaConversa.ts (rodarTurno) antes de gerar a
   * fala fictícia do avatar — true quando este turno foi sorteado pra
   * "resolver" o critério de sucesso. decidirProximoPasso só lê essa flag,
   * não decide sozinho: assim a fala do avatar e o veredito nunca ficam
   * inconsistentes entre si.
   */
  avatarResolveuAgora?: boolean;
}

export interface TurnoLog {
  turno: number;
  enviado: string;
  resposta_avatar: string;
  responseStatus_ok: boolean;
  http_status: number | null;
  tentativas: number;
  erro_http: string | null;
}

function escolher<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function trechoCurto(texto: string, max = 90): string {
  const limpo = String(texto || "").replace(/\s+/g, " ").trim();
  return limpo.length > max ? limpo.slice(0, max).trim() + "…" : limpo;
}

/**
 * A mensagem de abertura (turno 1), quando não é um texto exato do roteiro.
 * Sem chamada de IA: monta a frase a partir do nome da pessoa (se houver) e
 * de um resumo do próprio cenário digitado — sempre ancorada no que a pessoa
 * escreveu, nunca um texto solto.
 */
export async function comporAbertura(
  session: SessaoConversa,
  entrada: TurnoRoteiro | null,
  padrao: string
): Promise<string> {
  const nome = session.dadosFixos && (session.dadosFixos as any).nome ? String((session.dadosFixos as any).nome) : "";
  const saudacaoNome = nome ? `Oi, meu nome é ${nome}. ` : "Oi! ";

  if (entrada && entrada.modo === "instrucao" && entrada.texto.trim()) {
    return `${saudacaoNome}${entrada.texto.trim()}`;
  }

  const resumo = trechoCurto(session.cenario, 160);
  if (!resumo) return padrao;
  return `${saudacaoNome}Preciso de ajuda com o seguinte: ${resumo}`;
}

const RESPOSTAS_TAILORED = [
  (base: string) => `Entendi, mas ainda preciso resolver isso: ${base}`,
  (base: string) => `Certo, obrigado(a). Voltando ao que falei: ${base}`,
  (base: string) => `Ok, isso ajuda. Mas o que eu realmente preciso é: ${base}`,
  (base: string) => `Entendido. Só reforçando o que eu pedi: ${base}`,
];

/**
 * Falas genéricas de acompanhamento — usadas ALTERNADAMENTE com as falas
 * "ancoradas" no cenário/critério acima, só pra dar variedade lexical entre
 * turnos (senão a mesma frase-base, repetida quase igual turno a turno,
 * dispara sozinha a heurística de loop de lib/qaHeuristicas.ts, que existe
 * pra detectar EXATAMENTE esse tipo de repetição).
 */
const RESPOSTAS_GENERICAS = [
  "Certo, entendi o que você disse. Pode me explicar melhor?",
  "Tudo bem. Quanto tempo isso costuma levar?",
  "Ok. Tem mais alguma informação que eu precise te passar?",
  "Entendi, obrigado(a) por confirmar. E o que acontece depois disso?",
  "Certo, faz sentido. Existe alguma outra opção nesse caso?",
  "Entendi. Isso vale pra todo mundo ou só pro meu caso?",
];

/**
 * A fala da pessoa simulada num turno livre/instrução (sem roteiro exato).
 * Sem IA: alterna entre uma fala genérica de acompanhamento e uma fala
 * ancorada no critério de sucesso (ou, na falta dele, no cenário) — sempre
 * ligada ao que a pessoa preencheu no formulário, nunca um texto solto, mas
 * variada o bastante turno a turno pra não soar (nem ser detectada como) um
 * disco riscado.
 */
function gerarFalaPessoaFicticia(session: SessaoConversa, entrada: TurnoRoteiro | null): string {
  if (entrada && entrada.modo === "instrucao" && entrada.texto.trim()) {
    return entrada.texto.trim();
  }
  const turno = session.iteration || 0;
  const base = trechoCurto(session.criterioSucesso || session.cenario, 70);
  if (!base) return RESPOSTAS_GENERICAS[Math.floor(turno / 2) % RESPOSTAS_GENERICAS.length];

  // Turnos pares usam uma fala genérica; ímpares (a partir do 3º) voltam a
  // ancorar no cenário/critério. As duas escolhas CICLAM pelo turno (nunca
  // sorteiam) pra nunca repetir a mesma frase — texto idêntico entre turnos é
  // o que dispara a heurística de loop de lib/qaHeuristicas.ts.
  if (turno % 2 === 0) return RESPOSTAS_GENERICAS[Math.floor(turno / 2) % RESPOSTAS_GENERICAS.length];
  const template = RESPOSTAS_TAILORED[Math.floor(turno / 2) % RESPOSTAS_TAILORED.length];
  return template(base);
}

/**
 * A decisão do turno — no motor original, era aqui que a OpenAI dizia
 * "continuar"/"sucesso"/"erro". Em modo demo essa decisão não depende de
 * nenhuma IA: "sucesso" só acontece quando `avatarResolveuAgora` (decidido em
 * lib/qaConversa.ts, ANTES de gerar a fala do avatar fictício, pra garantir
 * que o texto do avatar e o veredito batam) está ligado; "erro" continua
 * vindo só das heurísticas de loop (lib/qaHeuristicas.ts), exatamente como
 * no motor original — nada aqui inventa um travamento que não aconteceu.
 */
export async function decidirProximoPasso(session: SessaoConversa): Promise<SessaoConversa> {
  const entrada = entradaDoTurno(session.roteiroTurnos, (session.iteration || 0) + 1);
  const textoExato = entrada && entrada.modo === "exato" ? entrada.texto.trim() : "";

  let sucessoSegurado = session.sucessoSeguradoNoTurno ?? null;
  const temTurnoAFrente =
    session.rodarRoteiroCompleto === true &&
    roteiroTemTurnoDepoisDe(session.roteiroTurnos, session.iteration || 0);

  const nextQuestion = textoExato || gerarFalaPessoaFicticia(session, entrada);

  // Mesmo contrapeso do motor original: "sucesso" só vale se houver eco real
  // do critério na fala do avatar (aqui, o eco que a própria demo colocou lá
  // de propósito quando avatarResolveuAgora está ligado).
  const evidencia =
    !!(session.criterioSucesso && session.criterioSucesso.trim()) &&
    hasSuccessEvidence(session.criterioSucesso, [session.avatarMessage || "", ...(session.avatarHist || [])]);

  let acao: string = session.avatarResolveuAgora && sucessoSegurado == null && evidencia ? "sucesso" : "continuar";
  let motivo: string | null = null;

  // Segura o sucesso em vez de encerrar: ainda ha turno escrito do roteiro a
  // mandar (switch "rodar o roteiro inteiro" — mesma regra do motor original).
  if (acao === "sucesso" && temTurnoAFrente && nextQuestion.trim()) {
    if (sucessoSegurado == null) sucessoSegurado = session.iteration;
    acao = "continuar";
    motivo = null;
  }

  const lastProgressIter = nextQuestion ? session.iteration : session.lastProgressIter || 0;

  if (acao === "continuar") {
    const { forcarErro, motivo: motivoLimite } = checarLimitesDeLoop({ ...session, lastProgressIter });
    if (forcarErro) {
      acao = "erro";
      motivo = motivoLimite;
    }
  }

  // Libera o sucesso guardado quando o roteiro acaba ou a conversa vai
  // terminar de qualquer jeito (limite de turnos/loop) — mesma regra do
  // motor original.
  if (sucessoSegurado != null && (acao === "erro" || !temTurnoAFrente)) {
    acao = "sucesso";
    motivo = null;
  }

  return {
    ...session,
    status: acao as SessaoConversa["status"],
    motivo,
    nextQuestion,
    lastProgressIter,
    sucessoSeguradoNoTurno: sucessoSegurado,
  };
}

/**
 * No motor original, esta era a revisão final por IA da transcrição inteira
 * (pra pegar um sucesso que o julgamento turno a turno, com histórico
 * truncado, tivesse deixado passar). Em modo demo essa revisão não existe:
 * `decidirProximoPasso` já decide o sucesso de forma síncrona a cada turno,
 * sem truncar nada, então não sobra nenhum "sucesso esquecido" pra recuperar
 * aqui — e inventar um agora, sem ter sido visto ao vivo, seria justamente o
 * tipo de resposta genérica e não fundamentada que a demo evita.
 */
export async function criterioCumpridoNaTranscricao(_session: SessaoConversa): Promise<boolean> {
  return false;
}
