import { ScriptEntry } from "./types";

/**
 * Comandos de terminal pra rodar script na máquina de quem está usando o hub.
 *
 * Saiu de dentro de app/page.tsx em 22/09/2026 porque a tela de Suites passou
 * a precisar do mesmo comando — a diferenca e que la a ORDEM importa, entao
 * existem duas montagens (ver buildBatchCommand x buildSequenceCommand).
 *
 * MODO DEMO: no projeto real esse caminho era o caminho de verdade da pasta
 * de testes na máquina da Isa. Aqui é só um placeholder genérico — o botão
 * "Rodar no meu terminal" desta demo nunca é executado de verdade por nós
 * (ninguém tem acesso ao servidor pra rodar nada), ele só existe pra mostrar
 * como o comando é montado.
 */

export const LOCAL_REPO_PATH = "/Users/exemplo/meus-testes";

export type ComandoOpts = {
  /** Intervalo entre um script e o proximo. */
  sleep: boolean;
  sleepSeconds: number;
  /** --workers=1 (so vale pro Playwright). */
  workers: boolean;
  headed: boolean;
};

/** Convencao de pasta/nome do arquivo local (ambiente/avatar/nome.spec.js). */
export function localPathFor(s: ScriptEntry) {
  return `${s.ambiente.toLowerCase()}/${s.avatar}/${s.name}.spec.js`;
}

/**
 * Comando de um script so — sem curl de atualizacao. Se o arquivo local
 * estiver desatualizado em relacao ao site, e assim mesmo que deve rodar;
 * quem decide atualizar e quem esta operando, nao o comando.
 */
export function localCommand(
  s: ScriptEntry,
  opts: { headed: boolean; workers: boolean; workersCount: number }
) {
  const flags: string[] = [];
  if (opts.headed) flags.push("--headed");
  if (s.framework === "playwright" && opts.workers) {
    flags.push(`--workers=${opts.workersCount}`);
  }
  const flagsStr = flags.length ? " " + flags.join(" ") : "";

  if (s.framework === "playwright") {
    return `cd ${LOCAL_REPO_PATH} && npx playwright test ${localPathFor(s)}${flagsStr}`;
  }

  return `npx cypress run --spec "${s.path}"${flagsStr}`;
}

function chamada(s: ScriptEntry, opts: ComandoOpts) {
  const flags: string[] = [];
  if (opts.headed) flags.push("--headed");
  if (s.framework === "playwright" && opts.workers) flags.push("--workers=1");
  const flagsStr = flags.length ? " " + flags.join(" ") : "";
  return s.framework === "playwright"
    ? `npx playwright test ${localPathFor(s)}${flagsStr}`
    : `npx cypress run --spec "${s.path}"${flagsStr}`;
}

function juntar(calls: string[], opts: ComandoOpts) {
  const joiner = opts.sleep ? ` ; sleep ${opts.sleepSeconds} ; \\\n` : ` ; \\\n`;
  return calls.join(joiner);
}

/**
 * "Selecionar varios" da Biblioteca: agrupa por framework (um bloco de
 * Playwright, um de Cypress). A ordem dentro de cada bloco acompanha a lista,
 * mas os dois frameworks nao se intercalam — ali a ordem nunca foi o ponto.
 */
export function buildBatchCommand(scripts: ScriptEntry[], opts: ComandoOpts) {
  const playwrightScripts = scripts.filter((s) => s.framework === "playwright");
  const cypressScripts = scripts.filter((s) => s.framework === "cypress");
  const blocks: string[] = [];

  if (playwrightScripts.length > 0) {
    blocks.push(
      `cd ${LOCAL_REPO_PATH} && \\\n${juntar(
        playwrightScripts.map((s) => chamada(s, opts)),
        opts
      )}`
    );
  }

  if (cypressScripts.length > 0) {
    blocks.push(juntar(cypressScripts.map((s) => chamada(s, opts)), opts));
  }

  return blocks.join("\n\n");
}

/**
 * Suite: um bloco so, na ORDEM EXATA da sequencia — inclusive se ela misturar
 * Playwright e Cypress. Foi pra isso que a suite existe; separar por framework
 * aqui quebraria justamente a ordem que foi montada. O `cd` entra uma vez no
 * comeco (os dois frameworks rodam a partir da mesma pasta).
 */
export function buildSequenceCommand(scripts: ScriptEntry[], opts: ComandoOpts) {
  if (scripts.length === 0) return "";
  return `cd ${LOCAL_REPO_PATH} && \\\n${juntar(
    scripts.map((s) => chamada(s, opts)),
    opts
  )}`;
}
