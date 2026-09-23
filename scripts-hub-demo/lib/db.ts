import { randomUUID } from "node:crypto";
import {
  CoverageItem,
  Draft,
  DraftVersion,
  Execution,
  SavedFilter,
  ScriptEntry,
  Suite,
  Tag,
} from "./types";
import { slugify } from "./slug";

/**
 * MODO DEMO — este arquivo substitui inteiramente o Postgres do hub original.
 *
 * Esta versão do Repositório de Scripts é só uma VITRINE de portfólio: sem
 * banco nenhum integrado, sem nada sendo guardado de verdade nem
 * compartilhado entre quem visita. Por isso os dados vivem só na memória do
 * processo, começam sempre com alguns exemplos prontos (pra quem clicar no
 * link do portfólio já ver o app funcionando) e são reiniciados sozinhos de
 * tempos em tempos — ninguém precisa administrar nada, e nada que alguém
 * digitar aqui persiste além dessa janela de tempo.
 *
 * Todas as funções exportadas mantêm exatamente a mesma assinatura que
 * tinham quando liam/escreviam no Postgres — o resto do app (rotas de API,
 * telas) não sabe nem precisa saber que a "base" agora é um objeto em
 * memória.
 */

const DEFAULT_TAG_COLOR = "#6366f1";
const RESET_INTERVAL_MS = 30 * 60 * 1000; // reinicia a demo a cada 30 minutos

// --- Limites da demo (documentados aqui, aplicados logo abaixo) -----------
// Números escolhidos só pra manter a memória do processo pequena e a
// navegação rápida — não têm relação nenhuma com o produto real.

/** Nenhuma "Biblioteca" desta demo guarda mais que isso. */
export const MAX_SCRIPTS_DEMO = 30;
/** Conteúdo de um script (o texto do teste em si) truncado nesse tamanho. */
export const MAX_SCRIPT_CONTENT_CHARS_DEMO = 50_000;
/** No máximo essa quantidade de suítes ao mesmo tempo. */
export const MAX_SUITES_DEMO = 10;
/** No máximo essa quantidade de rascunhos ao mesmo tempo. */
export const MAX_DRAFTS_DEMO = 10;
/** Cada rascunho guarda no máximo essa quantidade de versões (a mais antiga cai). */
export const MAX_DRAFT_VERSIONS_DEMO = 10;
/** Histórico de execução: quando passa disso, o registro mais antigo cai. */
export const MAX_EXECUTIONS_DEMO = 50;
/**
 * Tamanho máximo (em bytes) de um anexo nesta demo — usado por
 * app/api/blob-upload/route.ts, que guarda o anexo como data URL no próprio
 * registro em memória (sem nenhum storage externo).
 */
export const MAX_ATTACHMENT_BYTES_DEMO = 2 * 1024 * 1024;

interface Store {
  scripts: ScriptEntry[];
  tags: Tag[];
  suites: Suite[];
  executions: Execution[];
  drafts: Draft[];
  draftVersions: DraftVersion[];
  coverageItems: CoverageItem[];
  savedFilters: SavedFilter[];
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isoAgora(): string {
  return new Date().toISOString();
}

function isoHaMinutos(min: number): string {
  return new Date(Date.now() - min * 60 * 1000).toISOString();
}

function isoHaDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

const PLAYWRIGHT_SAMPLE = `import { test, expect } from '@playwright/test';

// Script de exemplo desta demo — não é executado de verdade em lugar
// nenhum, serve só pra mostrar como um card da Biblioteca fica preenchido.
test('login básico', async ({ page }) => {
  await page.goto('https://demo.exemplo.com/login');
  await page.fill('#email', 'usuaria@exemplo.com');
  await page.fill('#senha', 'senha-exemplo');
  await page.click('button[type="submit"]');
  await expect(page.locator('.dashboard')).toBeVisible();
});
`;

const CYPRESS_SAMPLE = `describe('anexo de imagem numa conversa', () => {
  // Script de exemplo desta demo — não é executado de verdade em lugar
  // nenhum, serve só pra mostrar como um card da Biblioteca fica preenchido.
  it('envia uma imagem e confirma que aparece na conversa', () => {
    cy.visit('https://demo.exemplo.com/conversas/1');
    cy.get('[data-testid="anexar"]').selectFile('cypress/fixtures/imagem.jpg');
    cy.get('[data-testid="enviar"]').click();
    cy.get('.mensagem-imagem').should('be.visible');
  });
});
`;

function seed(): { data: Store; contents: Record<string, string> } {
  const scripts: ScriptEntry[] = [
    {
      id: "nimbus-hml-login-basico-demo1",
      name: "Login básico",
      avatar: "Nimbus",
      ambiente: "hml",
      cenario: "Login básico",
      tela: "Início",
      tags: ["smoke", "regressão"],
      framework: "playwright",
      path: "tests-playwright/nimbus/hml/login-basico.spec.ts",
      createdAt: isoHaDias(18),
      ordem: 1_000_006,
    },
    {
      id: "nimbus-hml-envio-texto-demo2",
      name: "Envio de mensagem de texto",
      avatar: "Nimbus",
      ambiente: "hml",
      cenario: "Mensagem de texto numa conversa",
      tela: "Conversas",
      tags: ["smoke"],
      framework: "playwright",
      path: "tests-playwright/nimbus/hml/envio-mensagem-texto.spec.ts",
      createdAt: isoHaDias(15),
      ordem: 1_000_005,
    },
    {
      id: "aurora-stg-envio-imagem-demo3",
      name: "Envio de anexo com imagem",
      avatar: "Aurora",
      ambiente: "stg",
      cenario: "Anexo de imagem numa conversa",
      tela: "Conversas",
      tags: ["regressão", "mobile"],
      framework: "cypress",
      path: "tests-cypress/aurora/stg/envio-anexo-imagem.cy.ts",
      createdAt: isoHaDias(11),
      ordem: 1_000_004,
    },
    {
      id: "aurora-prod-automacao-simples-demo4",
      name: "Criar automação simples",
      avatar: "Aurora",
      ambiente: "prod",
      cenario: "Criar, editar e apagar uma automação",
      tela: "Automações",
      tags: ["crítico"],
      framework: "playwright",
      path: "tests-playwright/aurora/prod/automacao-simples.spec.ts",
      createdAt: isoHaDias(7),
      ordem: 1_000_003,
    },
    {
      id: "nimbus-prod-buscar-tickets-demo5",
      name: "Buscar tickets por termo",
      avatar: "Nimbus",
      ambiente: "prod",
      cenario: "Buscar tickets por um termo",
      tela: "Tickets",
      tags: ["suporte"],
      framework: "cypress",
      path: "tests-cypress/nimbus/prod/buscar-tickets-termo.cy.ts",
      createdAt: isoHaDias(4),
      ordem: 1_000_002,
    },
    {
      id: "aurora-hml-encerrar-conversa-demo6",
      name: "Encerrar conversa e registrar motivo",
      avatar: "Aurora",
      ambiente: "hml",
      cenario: "Encerrar uma conversa",
      tela: "Conversas",
      tags: ["onboarding", "flaky"],
      framework: "playwright",
      path: "tests-playwright/aurora/hml/encerrar-conversa.spec.ts",
      createdAt: isoHaDias(1),
      ordem: 1_000_001,
    },
  ];

  const scriptsContent: Record<string, string> = {
    "nimbus-hml-login-basico-demo1": PLAYWRIGHT_SAMPLE,
    "nimbus-hml-envio-texto-demo2": PLAYWRIGHT_SAMPLE.replace("login básico", "envio de mensagem de texto"),
    "aurora-stg-envio-imagem-demo3": CYPRESS_SAMPLE,
    "aurora-prod-automacao-simples-demo4": PLAYWRIGHT_SAMPLE.replace("login básico", "automação simples"),
    "nimbus-prod-buscar-tickets-demo5": CYPRESS_SAMPLE.replace("anexo de imagem numa conversa", "busca de tickets por termo"),
    "aurora-hml-encerrar-conversa-demo6": PLAYWRIGHT_SAMPLE.replace("login básico", "encerrar conversa"),
  };

  const tags: Tag[] = [
    { name: "smoke", color: "#2563eb" },
    { name: "regressão", color: "#7c3aed" },
    { name: "crítico", color: "#dc2626" },
    { name: "suporte", color: "#059669" },
    { name: "onboarding", color: "#d97706" },
    { name: "mobile", color: "#0891b2" },
    { name: "flaky", color: "#db2777" },
    { name: "financeiro", color: "#16a34a" },
  ];

  const suites: Suite[] = [
    {
      id: "suite-demo-smoke-hml",
      name: "Smoke — homologação",
      scriptIds: ["nimbus-hml-login-basico-demo1", "nimbus-hml-envio-texto-demo2"],
      tags: ["smoke"],
      createdAt: isoHaDias(9),
    },
    {
      id: "suite-demo-fluxo-atendimento",
      name: "Fluxo de atendimento completo",
      scriptIds: [
        "nimbus-hml-envio-texto-demo2",
        "aurora-hml-encerrar-conversa-demo6",
        "nimbus-prod-buscar-tickets-demo5",
      ],
      tags: ["suporte"],
      createdAt: isoHaDias(3),
    },
  ];

  const executions: Execution[] = [
    {
      id: "exec-demo-1",
      scriptId: "nimbus-hml-login-basico-demo1",
      suiteId: "suite-demo-smoke-hml",
      status: "passed",
      executedAt: isoHaMinutos(80),
    },
    {
      id: "exec-demo-2",
      scriptId: "nimbus-hml-envio-texto-demo2",
      suiteId: "suite-demo-smoke-hml",
      status: "passed",
      executedAt: isoHaMinutos(78),
    },
    {
      id: "exec-demo-3",
      scriptId: "aurora-hml-encerrar-conversa-demo6",
      status: "failed",
      executedAt: isoHaMinutos(50),
      note: "Botão de encerrar mudou de lugar depois do último deploy — ajustar seletor.",
    },
  ];

  const draftId = "draft-demo-cadastro-contato";
  const versionOldId = "draft-version-demo-1";
  const versionNewId = "draft-version-demo-2";
  const drafts: Draft[] = [
    {
      id: draftId,
      name: "Cadastro de novo contato",
      avatar: "Nimbus",
      ambiente: "hml",
      cenario: "Cadastro de novo contato a partir de Contatos",
      tela: "Contatos",
      tags: ["onboarding"],
      framework: "playwright",
      content: `import { test, expect } from '@playwright/test';

test('cadastra um novo contato', async ({ page }) => {
  await page.goto('https://demo.exemplo.com/contatos');
  await page.click('text=Novo contato');
  await page.fill('#nome', 'Contato de exemplo');
  await page.fill('#telefone', '(11) 90000-0000');
  await page.click('button:has-text("Salvar")');
  await expect(page.locator('text=Contato de exemplo')).toBeVisible();
});
`,
      createdAt: isoHaDias(2),
      updatedAt: isoHaMinutos(200),
      versionCount: 2,
    },
  ];
  const draftVersions: DraftVersion[] = [
    {
      id: versionOldId,
      draftId,
      content: `import { test } from '@playwright/test';

test('cadastra um novo contato', async ({ page }) => {
  await page.goto('https://demo.exemplo.com/contatos');
  // TODO: preencher o formulário
});
`,
      createdAt: isoHaDias(2),
    },
    {
      id: versionNewId,
      draftId,
      content: drafts[0].content,
      createdAt: isoHaMinutos(200),
    },
  ];

  const coverageItems: CoverageItem[] = [
    {
      id: "coverage-demo-1",
      tela: "Conversas",
      nome: "Enviar mensagem de texto",
      tags: ["smoke"],
      feito: true,
      createdAt: isoHaDias(16),
    },
    {
      id: "coverage-demo-2",
      tela: "Conversas",
      nome: "Enviar anexo com imagem",
      tags: ["regressão"],
      feito: false,
      createdAt: isoHaDias(16),
    },
    {
      id: "coverage-demo-3",
      tela: "Tickets",
      nome: "Buscar ticket por termo",
      tags: ["suporte"],
      feito: true,
      createdAt: isoHaDias(10),
    },
    {
      id: "coverage-demo-4",
      tela: "Automações",
      nome: "Criar, editar e apagar automação",
      tags: ["crítico"],
      feito: false,
      createdAt: isoHaDias(6),
    },
  ];

  const savedFilters: SavedFilter[] = [
    {
      id: "filtro-demo-smoke-hml",
      nome: "Smoke em homologação",
      tagFilter: { blocks: [{ groups: [{ values: ["smoke"], op: "OR" }], groupsOp: "AND" }], blocksOp: "OR" },
      ambienteFilter: { blocks: [{ groups: [{ values: ["hml"], op: "OR" }], groupsOp: "AND" }], blocksOp: "OR" },
      busca: "",
      createdAt: isoHaDias(8),
    },
    {
      id: "filtro-demo-criticos",
      nome: "Só os críticos",
      tagFilter: { blocks: [{ groups: [{ values: ["crítico"], op: "OR" }], groupsOp: "AND" }], blocksOp: "OR" },
      busca: "",
      createdAt: isoHaDias(5),
    },
  ];

  const data: Store = {
    scripts: scripts.map((s) => ({ ...s })),
    tags,
    suites,
    executions,
    drafts,
    draftVersions,
    coverageItems,
    savedFilters,
  };

  // Conteúdo indexado por id (mesmo papel da coluna `content` da tabela
  // `scripts` no banco real) — guardado separado do resto do Store porque só
  // ele costuma ficar grande, então não faz parte do que listScripts() clona
  // e devolve pra tela a cada chamada.
  return { data, contents: scriptsContent };
}

declare global {
  // eslint-disable-next-line no-var
  var __scriptsHubDemoStore:
    | { data: Store; contents: Record<string, string>; resetAt: number }
    | undefined;
}

function store(): Store {
  const agora = Date.now();
  if (!global.__scriptsHubDemoStore || agora >= global.__scriptsHubDemoStore.resetAt) {
    const { data, contents } = seed();
    global.__scriptsHubDemoStore = { data, contents, resetAt: agora + RESET_INTERVAL_MS };
  }
  return global.__scriptsHubDemoStore.data;
}

function contents(): Record<string, string> {
  store(); // garante que o store (e os conteúdos) já foram semeados/reiniciados
  return global.__scriptsHubDemoStore!.contents;
}

function capContent(content: string): string {
  return content.length > MAX_SCRIPT_CONTENT_CHARS_DEMO
    ? content.slice(0, MAX_SCRIPT_CONTENT_CHARS_DEMO)
    : content;
}

// --- Scripts ---

export async function listScripts(): Promise<ScriptEntry[]> {
  return clone(store().scripts).sort((a: ScriptEntry, b: ScriptEntry) => b.ordem - a.ordem);
}

/** Le um script existente (metadados + conteudo) pelo id, para a tela de edicao. */
export async function getScript(id: string): Promise<{ entry: ScriptEntry; content: string } | null> {
  const entry = store().scripts.find((s) => s.id === id);
  if (!entry) return null;
  return { entry: clone(entry), content: contents()[id] || "" };
}

/** Le so o conteudo bruto (usado pela rota /api/scripts/[id]/raw). */
export async function getScriptRaw(id: string): Promise<{ path: string; content: string } | null> {
  const entry = store().scripts.find((s) => s.id === id);
  if (!entry) return null;
  return { path: entry.path, content: contents()[id] || "" };
}

/**
 * Cria ou atualiza um script (upsert por id). MODO DEMO: um script novo
 * (id ainda não existente) é recusado quando a Biblioteca já está no limite
 * de MAX_SCRIPTS_DEMO — editar um script já existente nunca é bloqueado por
 * esse limite, já que não aumenta a contagem.
 */
export async function saveScript(entry: ScriptEntry, content: string): Promise<void> {
  const s = store();
  const existingIndex = s.scripts.findIndex((x) => x.id === entry.id);

  if (existingIndex === -1 && s.scripts.length >= MAX_SCRIPTS_DEMO) {
    throw new Error(
      `Esta é uma demonstração: a Biblioteca aceita no máximo ${MAX_SCRIPTS_DEMO} scripts. Apague algum script antigo antes de enviar um novo.`
    );
  }

  const cappedContent = capContent(content);
  contents()[entry.id] = cappedContent;

  if (existingIndex === -1) {
    s.scripts.push({ ...entry });
  } else {
    // "ordem" fica de fora do update de propósito — editar um script (upsert
    // por id) não pode mexer na posição manual que foi arrastada.
    const existente = s.scripts[existingIndex];
    s.scripts[existingIndex] = { ...entry, ordem: existente.ordem };
  }
}

/** Atualiza SO as etiquetas de um script, sem tocar no conteudo nem no resto dos metadados. */
export async function updateScriptTags(id: string, tags: string[]): Promise<ScriptEntry | null> {
  const s = store();
  const entry = s.scripts.find((x) => x.id === id);
  if (!entry) return null;
  entry.tags = tags;
  return clone(entry);
}

/** Atualiza SO a posicao manual (drag-and-drop da Biblioteca). */
export async function updateScriptOrdem(id: string, ordem: number): Promise<ScriptEntry | null> {
  const s = store();
  const entry = s.scripts.find((x) => x.id === id);
  if (!entry) return null;
  entry.ordem = ordem;
  return clone(entry);
}

/** Apaga um script. Retorna o attachmentPath (se houver) para o chamador "limpar" o anexo. */
export async function deleteScript(id: string): Promise<{ deleted: boolean; attachmentPath?: string }> {
  const s = store();
  const index = s.scripts.findIndex((x) => x.id === id);
  if (index === -1) return { deleted: false };
  const [removed] = s.scripts.splice(index, 1);
  delete contents()[id];
  return { deleted: true, ...(removed.attachmentPath ? { attachmentPath: removed.attachmentPath } : {}) };
}

// --- Tags ---

export async function listTags(): Promise<Tag[]> {
  return clone(store().tags).sort((a: Tag, b: Tag) => a.name.localeCompare(b.name));
}

export async function addTags(newTags: { name: string; color?: string }[]): Promise<Tag[]> {
  const s = store();
  for (const t of newTags) {
    const name = t.name.trim();
    if (!name) continue;
    if (!s.tags.some((x) => x.name === name)) {
      s.tags.push({ name, color: t.color || DEFAULT_TAG_COLOR });
    }
  }
  return listTags();
}

export async function updateTag(name: string, changes: { name?: string; color?: string }): Promise<Tag[]> {
  const s = store();
  const existing = s.tags.find((t) => t.name === name);
  if (!existing) throw new Error(`Tag "${name}" nao encontrada.`);

  const newName = changes.name?.trim() || existing.name;
  const newColor = changes.color || existing.color;

  if (newName !== existing.name && s.tags.some((t) => t.name === newName)) {
    throw new Error(`Ja existe uma tag chamada "${newName}".`);
  }

  if (newName !== name) {
    existing.name = newName;
    existing.color = newColor;
    const propagar = (tags: string[] | undefined) =>
      tags ? tags.map((t) => (t === name ? newName : t)) : tags;
    for (const sc of s.scripts) sc.tags = propagar(sc.tags) || [];
    for (const su of s.suites) su.tags = propagar(su.tags) || [];
    for (const d of s.drafts) d.tags = propagar(d.tags) || [];
    for (const ci of s.coverageItems) ci.tags = propagar(ci.tags) || [];
  } else {
    existing.color = newColor;
  }

  return listTags();
}

export async function deleteTag(name: string): Promise<Tag[]> {
  const s = store();
  const remover = (tags: string[] | undefined) => (tags ? tags.filter((t) => t !== name) : tags);
  for (const sc of s.scripts) sc.tags = remover(sc.tags) || [];
  for (const su of s.suites) su.tags = remover(su.tags) || [];
  for (const d of s.drafts) d.tags = remover(d.tags) || [];
  for (const ci of s.coverageItems) ci.tags = remover(ci.tags) || [];
  s.tags = s.tags.filter((t) => t.name !== name);
  return listTags();
}

// --- Suítes (sequências de teste) ---

export async function listSuites(): Promise<Suite[]> {
  return clone(store().suites).sort(
    (a: Suite, b: Suite) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getSuite(id: string): Promise<Suite | null> {
  const found = store().suites.find((s) => s.id === id);
  return found ? clone(found) : null;
}

export async function createSuite(name: string, scriptIds: string[], tags: string[] = []): Promise<Suite> {
  const s = store();
  if (s.suites.length >= MAX_SUITES_DEMO) {
    throw new Error(`Esta é uma demonstração: no máximo ${MAX_SUITES_DEMO} suítes ao mesmo tempo. Apague uma antes de criar outra.`);
  }
  const created: Suite = {
    id: randomUUID(),
    name,
    scriptIds: Array.from(new Set(scriptIds)),
    tags,
    createdAt: isoAgora(),
  };
  s.suites.push(created);
  return clone(created);
}

export async function updateSuite(
  id: string,
  changes: { name?: string; scriptIds?: string[]; tags?: string[] }
): Promise<Suite> {
  const s = store();
  const existing = s.suites.find((su) => su.id === id);
  if (!existing) throw new Error("Suite nao encontrada.");

  if (changes.name !== undefined) existing.name = changes.name;
  if (changes.tags !== undefined) existing.tags = changes.tags;
  if (changes.scriptIds !== undefined) existing.scriptIds = Array.from(new Set(changes.scriptIds));

  return clone(existing);
}

export async function deleteSuite(id: string): Promise<boolean> {
  const s = store();
  const before = s.suites.length;
  s.suites = s.suites.filter((su) => su.id !== id);
  return s.suites.length < before;
}

// --- Histórico de execução (registro manual) ---

export async function listExecutions(opts?: {
  scriptId?: string;
  suiteId?: string;
  limit?: number;
}): Promise<Execution[]> {
  const limit = opts?.limit ?? 200;
  let execs = clone(store().executions) as Execution[];
  if (opts?.scriptId) execs = execs.filter((e) => e.scriptId === opts.scriptId);
  if (opts?.suiteId) execs = execs.filter((e) => e.suiteId === opts.suiteId);
  return execs
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
    .slice(0, limit);
}

export async function createExecution(input: {
  scriptId?: string;
  suiteId?: string;
  status: "passed" | "failed";
  note?: string;
}): Promise<Execution> {
  const s = store();
  const created: Execution = {
    id: randomUUID(),
    ...(input.scriptId ? { scriptId: input.scriptId } : {}),
    ...(input.suiteId ? { suiteId: input.suiteId } : {}),
    status: input.status,
    executedAt: isoAgora(),
    ...(input.note ? { note: input.note } : {}),
  };
  s.executions.unshift(created);
  // MODO DEMO: mantém só os MAX_EXECUTIONS_DEMO mais recentes — o mais antigo
  // cai em silêncio, sem bloquear quem está registrando um resultado.
  if (s.executions.length > MAX_EXECUTIONS_DEMO) {
    s.executions = s.executions
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      .slice(0, MAX_EXECUTIONS_DEMO);
  }
  return clone(created);
}

export async function deleteExecution(id: string): Promise<boolean> {
  const s = store();
  const before = s.executions.length;
  s.executions = s.executions.filter((e) => e.id !== id);
  return s.executions.length < before;
}

// --- Rascunhos com versionamento ---

function draftWithVersionCount(d: Draft, count: number): Draft {
  return { ...d, versionCount: count };
}

export async function listDrafts(): Promise<Draft[]> {
  const s = store();
  return clone(s.drafts)
    .map((d: Draft) => draftWithVersionCount(d, s.draftVersions.filter((v) => v.draftId === d.id).length))
    .sort((a: Draft, b: Draft) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getDraft(id: string): Promise<{ draft: Draft; versions: DraftVersion[] } | null> {
  const s = store();
  const draft = s.drafts.find((d) => d.id === id);
  if (!draft) return null;
  const versions = clone(s.draftVersions)
    .filter((v: DraftVersion) => v.draftId === id)
    .sort((a: DraftVersion, b: DraftVersion) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { draft: draftWithVersionCount(clone(draft), versions.length), versions };
}

export async function createDraft(input: {
  name?: string;
  avatar?: string;
  ambiente?: string;
  cenario?: string;
  tela?: string;
  tags?: string[];
  framework?: "playwright" | "cypress";
  content?: string;
}): Promise<Draft> {
  const s = store();
  if (s.drafts.length >= MAX_DRAFTS_DEMO) {
    throw new Error(`Esta é uma demonstração: no máximo ${MAX_DRAFTS_DEMO} rascunhos ao mesmo tempo. Apague um antes de criar outro.`);
  }
  const id = randomUUID();
  const agora = isoAgora();
  const content = capContent(input.content ?? "");
  const created: Draft = {
    id,
    name: input.name ?? "",
    avatar: input.avatar ?? "",
    ambiente: input.ambiente ?? "",
    cenario: input.cenario ?? "",
    ...(input.tela ? { tela: input.tela } : {}),
    tags: input.tags ?? [],
    framework: input.framework ?? "playwright",
    content,
    createdAt: agora,
    updatedAt: agora,
  };
  s.drafts.push(created);
  if (content.trim()) {
    s.draftVersions.push({ id: randomUUID(), draftId: id, content, createdAt: agora });
  }
  const result = await getDraft(id);
  if (!result) throw new Error("Falha ao criar o rascunho.");
  return result.draft;
}

export async function updateDraft(
  id: string,
  changes: {
    name?: string;
    avatar?: string;
    ambiente?: string;
    cenario?: string;
    tela?: string | null;
    tags?: string[];
    framework?: "playwright" | "cypress";
    content?: string;
  }
): Promise<Draft> {
  const s = store();
  const existing = s.drafts.find((d) => d.id === id);
  if (!existing) throw new Error("Rascunho não encontrado.");

  const novoConteudo = changes.content !== undefined ? capContent(changes.content) : undefined;
  const contentChanged = novoConteudo !== undefined && novoConteudo !== existing.content;

  if (changes.name !== undefined) existing.name = changes.name;
  if (changes.avatar !== undefined) existing.avatar = changes.avatar;
  if (changes.ambiente !== undefined) existing.ambiente = changes.ambiente;
  if (changes.cenario !== undefined) existing.cenario = changes.cenario;
  if (changes.tela !== undefined) {
    if (changes.tela) existing.tela = changes.tela;
    else delete existing.tela;
  }
  if (changes.tags !== undefined) existing.tags = changes.tags;
  if (changes.framework !== undefined) existing.framework = changes.framework;
  if (novoConteudo !== undefined) existing.content = novoConteudo;
  existing.updatedAt = isoAgora();

  if (contentChanged && novoConteudo?.trim()) {
    s.draftVersions.push({ id: randomUUID(), draftId: id, content: novoConteudo, createdAt: existing.updatedAt });
    // MODO DEMO: no máximo MAX_DRAFT_VERSIONS_DEMO versões por rascunho — a
    // mais antiga cai em silêncio, sem bloquear quem está só salvando.
    const versoesDoRascunho = s.draftVersions
      .filter((v) => v.draftId === id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (versoesDoRascunho.length > MAX_DRAFT_VERSIONS_DEMO) {
      const manter = new Set(versoesDoRascunho.slice(0, MAX_DRAFT_VERSIONS_DEMO).map((v) => v.id));
      s.draftVersions = s.draftVersions.filter((v) => v.draftId !== id || manter.has(v.id));
    }
  }

  const updated = await getDraft(id);
  if (!updated) throw new Error("Rascunho não encontrado após atualizar.");
  return updated.draft;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const s = store();
  const before = s.drafts.length;
  s.drafts = s.drafts.filter((d) => d.id !== id);
  s.draftVersions = s.draftVersions.filter((v) => v.draftId !== id);
  return s.drafts.length < before;
}

/** Publica um rascunho: cria o script real na Biblioteca e apaga o rascunho. */
export async function publishDraft(id: string): Promise<ScriptEntry> {
  const result = await getDraft(id);
  if (!result) throw new Error("Rascunho não encontrado.");
  const { draft } = result;

  if (!draft.name || !draft.avatar || !draft.ambiente || !draft.cenario || !draft.content.trim()) {
    throw new Error("Preencha nome, avatar, ambiente, cenário e conteúdo antes de publicar.");
  }

  const ext = draft.framework === "playwright" ? "spec.ts" : "cy.ts";
  const baseDir = draft.framework === "playwright" ? "tests-playwright" : "tests-cypress";
  const scriptId = `${slugify(draft.avatar)}-${slugify(draft.ambiente)}-${slugify(draft.cenario)}-${Date.now().toString(36)}`;
  const path = `${baseDir}/${slugify(draft.avatar)}/${slugify(draft.ambiente)}/${slugify(draft.cenario)}.${ext}`;

  const entry: ScriptEntry = {
    id: scriptId,
    name: draft.name,
    avatar: draft.avatar,
    ambiente: draft.ambiente,
    cenario: draft.cenario,
    ...(draft.tela ? { tela: draft.tela } : {}),
    tags: draft.tags,
    framework: draft.framework,
    path,
    createdAt: isoAgora(),
    // Rascunho publicado e sempre um script novo -> entra no topo, mesma
    // leitura de "mais novo primeiro" de um script recem-criado.
    ordem: Date.now() / 1000,
  };

  await saveScript(entry, draft.content);
  await deleteDraft(id);
  return entry;
}

// --- Checklist de cobertura por tela ---

export async function listCoverageItems(): Promise<CoverageItem[]> {
  return clone(store().coverageItems).sort((a: CoverageItem, b: CoverageItem) =>
    a.tela === b.tela
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : a.tela.localeCompare(b.tela)
  );
}

export async function getCoverageItem(id: string): Promise<CoverageItem | null> {
  const found = store().coverageItems.find((c) => c.id === id);
  return found ? clone(found) : null;
}

export async function createCoverageItem(input: { tela: string; nome: string; tags?: string[] }): Promise<CoverageItem> {
  const s = store();
  const created: CoverageItem = {
    id: randomUUID(),
    tela: input.tela,
    nome: input.nome,
    tags: input.tags ?? [],
    feito: false,
    createdAt: isoAgora(),
  };
  s.coverageItems.push(created);
  return clone(created);
}

export async function updateCoverageItem(
  id: string,
  changes: Partial<{ nome: string; tags: string[]; feito: boolean; tela: string }>
): Promise<CoverageItem> {
  const s = store();
  const existing = s.coverageItems.find((c) => c.id === id);
  if (!existing) throw new Error("Cenário de cobertura não encontrado.");

  if (changes.tela !== undefined) existing.tela = changes.tela;
  if (changes.nome !== undefined) existing.nome = changes.nome;
  if (changes.tags !== undefined) existing.tags = changes.tags;
  if (changes.feito !== undefined) existing.feito = changes.feito;

  return clone(existing);
}

export async function deleteCoverageItem(id: string): Promise<boolean> {
  const s = store();
  const before = s.coverageItems.length;
  s.coverageItems = s.coverageItems.filter((c) => c.id !== id);
  return s.coverageItems.length < before;
}

// --- Filtros salvos ---

export async function listSavedFilters(): Promise<SavedFilter[]> {
  return clone(store().savedFilters).sort((a: SavedFilter, b: SavedFilter) => a.nome.localeCompare(b.nome));
}

export async function getSavedFilter(id: string): Promise<SavedFilter | null> {
  const found = store().savedFilters.find((f) => f.id === id);
  return found ? clone(found) : null;
}

export async function createSavedFilter(input: {
  nome: string;
  tagFilter: unknown;
  avatarFilter?: unknown;
  ambienteFilter?: unknown;
  busca?: string;
}): Promise<SavedFilter> {
  const s = store();
  const created: SavedFilter = {
    id: randomUUID(),
    nome: input.nome,
    tagFilter: input.tagFilter as SavedFilter["tagFilter"],
    ...(input.avatarFilter ? { avatarFilter: input.avatarFilter as SavedFilter["avatarFilter"] } : {}),
    ...(input.ambienteFilter ? { ambienteFilter: input.ambienteFilter as SavedFilter["ambienteFilter"] } : {}),
    busca: input.busca ?? "",
    createdAt: isoAgora(),
  };
  s.savedFilters.push(created);
  return clone(created);
}

export async function updateSavedFilter(
  id: string,
  changes: Partial<{
    nome: string;
    tagFilter: unknown;
    avatarFilter: unknown;
    ambienteFilter: unknown;
    busca: string;
  }>
): Promise<SavedFilter> {
  const s = store();
  const existing = s.savedFilters.find((f) => f.id === id);
  if (!existing) throw new Error("Filtro salvo não encontrado.");

  if (changes.nome !== undefined) existing.nome = changes.nome;
  if (changes.tagFilter !== undefined) existing.tagFilter = changes.tagFilter as SavedFilter["tagFilter"];
  if (changes.avatarFilter !== undefined) existing.avatarFilter = changes.avatarFilter as SavedFilter["avatarFilter"];
  if (changes.ambienteFilter !== undefined) existing.ambienteFilter = changes.ambienteFilter as SavedFilter["ambienteFilter"];
  if (changes.busca !== undefined) existing.busca = changes.busca;

  return clone(existing);
}

export async function deleteSavedFilter(id: string): Promise<boolean> {
  const s = store();
  const before = s.savedFilters.length;
  s.savedFilters = s.savedFilters.filter((f) => f.id !== id);
  return s.savedFilters.length < before;
}
