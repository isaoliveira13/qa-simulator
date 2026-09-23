/**
 * O roteiro de turnos: quando "Escrever a mensagem de cada turno" (etapa 3 do
 * assistente) esta ligado, e este arquivo que diz o que a pessoa simulada
 * manda em cada turno, no lugar de deixar a IA improvisar a partir do
 * cenario.
 *
 * A contagem (mudou em 02/09/2026 — antes a saudacao era um campo a parte,
 * fora da contagem, e o turno 1 era a segunda mensagem):
 *
 *   turno 1 = a MENSAGEM DE ABERTURA, a primeira coisa que a pessoa manda (o
 *             que era a "saudacao inicial"); nao ha fala do avatar antes dela;
 *   turno 2 = a mensagem que a pessoa escreve depois da resposta do avatar a
 *             abertura;
 *   turno N = a N-esima mensagem da pessoa.
 *
 * No motor isso bate com `session.iteration + 1` no momento da decisao: ja
 * aconteceram `iteration` turnos, e o que se decide agora e a mensagem do
 * turno seguinte. E o mesmo numero que vai pro prompt como "TURNO ATUAL DESTA
 * CONVERSA". Consequencia pratica: um roteiro que vai ate o turno N exige
 * maxTurnos >= N (antes era N+1).
 *
 * O turno 1 aceita os tres modos como qualquer outro, mas "instrucao" e
 * "livre" ali significam "a IA escreve a abertura" (ver mensagemDeAbertura em
 * lib/qaConversa.ts), porque nao ha nada pra responder ainda.
 *
 * Tres modos por linha, que sao os tres casos que o prompt manual cobria:
 *   - "exato":     manda a frase literal, ignorando o que o avatar perguntou;
 *   - "instrucao": a IA escreve com as proprias palavras seguindo o pedido
 *                  ("DIGA que ama pizza");
 *   - "livre":     turno sem exigencia nenhuma, conversa normal.
 */

import { DadosPessoa, preencherTemplate } from "./personaTemplate";
import { TurnoRoteiro } from "./types";

export const MODOS_ROTEIRO = ["exato", "instrucao", "livre"] as const;

export function rotuloModo(modo: TurnoRoteiro["modo"]): string {
  return modo === "exato" ? "Texto exato" : modo === "instrucao" ? "Instrução para a IA" : "Livre";
}

/** Linha nova, no fim da lista. O numero do turno e sempre a posicao + 1. */
export function turnoVazio(turno: number): TurnoRoteiro {
  return { turno, modo: "exato", texto: "", ignorarAvatar: true };
}

/**
 * Renumera a lista pra `turno` ser sempre posicao + 1 e garante que so a
 * ultima linha possa valer "deste turno em diante" — uma linha "em diante" no
 * meio tornaria as linhas seguintes inalcancaveis, sem ninguem avisar.
 */
export function normalizarRoteiro(roteiro: TurnoRoteiro[]): TurnoRoteiro[] {
  return roteiro.map((t, i) => ({
    ...t,
    turno: i + 1,
    ...(i === roteiro.length - 1 ? {} : { emDiante: false }),
  }));
}

/**
 * Qual linha vale num turno. Acerto exato primeiro; senao, a linha marcada
 * "deste turno em diante" que ja tenha comecado. Sem nenhuma das duas, o
 * turno e livre (`null`) — o roteiro acabou e a conversa volta a improvisar.
 */
export function entradaDoTurno(
  roteiro: TurnoRoteiro[] | null | undefined,
  turno: number
): TurnoRoteiro | null {
  if (!roteiro || roteiro.length === 0) return null;
  const exata = roteiro.find((t) => t.turno === turno);
  if (exata) return exata.modo === "livre" ? null : exata;
  const emDiante = roteiro
    .filter((t) => t.emDiante && t.turno <= turno)
    .sort((a, b) => b.turno - a.turno)[0];
  if (!emDiante) return null;
  return emDiante.modo === "livre" ? null : emDiante;
}

/**
 * Resolve {nome}/{cpf}/... em cada linha com os dados da pessoa que vai
 * rodar. Feito uma vez, no comeco da conversa (rota /run), pelo mesmo caminho
 * que ja resolve o cenario — assim um roteiro so serve o lote inteiro, com
 * cada pessoa mandando os dados dela.
 */
export function preencherRoteiro(
  roteiro: TurnoRoteiro[],
  dados: DadosPessoa,
  extras?: Record<string, string>
): TurnoRoteiro[] {
  return roteiro.map((t) => ({ ...t, texto: preencherTemplate(t.texto, dados, extras) }));
}

/** O roteiro tem algo pra valer? Linha "livre" sozinha nao muda nada. */
export function roteiroTemConteudo(roteiro: TurnoRoteiro[] | null | undefined): boolean {
  return !!roteiro && roteiro.some((t) => t.modo !== "livre" && t.texto.trim().length > 0);
}

/**
 * Ainda ha turno ESCRITO depois do turno `turnoJaEnviado`? E a pergunta que o
 * motor faz pra saber se pode encerrar a conversa em sucesso (08/09/2026,
 * switch "rodar o roteiro inteiro"): enquanto a resposta for sim, o sucesso
 * fica guardado e a conversa segue.
 *
 * Uma linha "deste turno em diante" com texto faz o roteiro nunca acabar —
 * ela vale ate o fim da conversa, entao a resposta e sempre sim e o veredito
 * so sai no limite de turnos. Linha "livre" nao conta: nao ha nada escrito
 * ali pra esperar.
 */
export function roteiroTemTurnoDepoisDe(
  roteiro: TurnoRoteiro[] | null | undefined,
  turnoJaEnviado: number
): boolean {
  if (!roteiro || roteiro.length === 0) return false;
  const escritas = roteiro.filter((t) => t.modo !== "livre" && t.texto.trim().length > 0);
  if (escritas.some((t) => t.emDiante)) return true;
  return escritas.some((t) => t.turno > turnoJaEnviado);
}

/**
 * Ate que turno o roteiro chega. Uma linha "em diante" vale ate o fim da
 * conversa, entao nesse caso nao ha ultimo turno (`Infinity`).
 */
export function ultimoTurnoDoRoteiro(roteiro: TurnoRoteiro[]): number {
  if (roteiro.some((t) => t.emDiante)) return Infinity;
  return roteiro.reduce((max, t) => Math.max(max, t.turno), 0);
}
