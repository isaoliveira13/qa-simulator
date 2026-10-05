import { randomUUID } from "node:crypto";
import {
  EmbaralharConfig,
  AvatarTest,
  AvatarTestBatch,
  AvatarTestRun,
  Persona,
  PessoaDoLote,
  AvatarCadastro,
  Scenario,
  SubavatarCadastro,
  TurnoRoteiro,
  Tag,
  AnexoTurno,
} from "./types";
import { slugify } from "./slug";
import { anexosDaLinha, idsDeAnexosDoRoteiro } from "./anexosTurno";

/**
 * MODO DEMO — este arquivo substitui inteiramente o Postgres original.
 *
 * A Isa pediu explicitamente que esta versão do coisasdaisa fosse só uma
 * VITRINE de portfólio: sem banco nenhum integrado, sem nada sendo guardado
 * de verdade nem compartilhado entre quem visita. Por isso os dados vivem só
 * na memória do processo, começam sempre com alguns exemplos prontos (pra
 * quem clicar no link do portfólio já ver o app funcionando) e são
 * reiniciados sozinhos de tempos em tempos — ninguém precisa administrar
 * nada, e nada que alguém digitar aqui persiste além dessa janela de tempo.
 *
 * Todas as funções exportadas mantêm exatamente a mesma assinatura que
 * tinham quando liam/escreviam no Postgres — o resto do app (rotas de API,
 * telas) não sabe nem precisa saber que a "base" agora é um objeto em
 * memória.
 */

const DEFAULT_TAG_COLOR = "#6366f1";
const RESET_INTERVAL_MS = 30 * 60 * 1000; // reinicia a demo a cada 30 minutos
/** Nenhum lote (salvo ou avulso) guarda mais que isso — limite da demo. */
export const LIMITE_PESSOAS_LOTE_DEMO = 10;

interface Store {
  tags: Tag[];
  avatarTests: AvatarTest[];
  avatarTestRuns: AvatarTestRun[];
  personas: Persona[];
  scenarios: Scenario[];
  avatarTestBatches: AvatarTestBatch[];
  /**
   * "Tabela" de anexos dos turnos do roteiro (05/10/2026) — no projeto real é
   * a tabela `avatar_test_anexos` do Postgres. Uma linha por arquivo, dona de
   * uma simulação (`avatarTestId` nulo = registrado no assistente de uma
   * simulação ainda não salva). MODO DEMO: só nome/tipo/tamanho, nunca o
   * arquivo.
   */
  anexos: (AnexoTurno & { avatarTestId: string | null; criadoEm: number })[];
  avatars: AvatarCadastro[];
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

function seed(): Store {
  const agora = isoAgora();
  return {
    tags: [
      { name: "cancelamento", color: "#ef4444" },
      { name: "suporte", color: "#6366f1" },
      { name: "vip", color: "#f59e0b" },
      { name: "financeiro", color: "#059669" },
    ],
    avatars: [
      {
        id: "avatar-demo-isa",
        nome: "Isa Demo",
        hostSlug: "isa-demo",
        subs: [{ nome: "suporte", subSlug: "suporte" }],
        autoCadastrado: false,
        ativo: true,
        createdAt: agora,
        execucoes: 0,
        ultimaExecucao: null,
        apontadas: 0,
      },
      {
        id: "avatar-demo-financeiro",
        nome: "Financeiro Demo",
        hostSlug: "financeiro-demo",
        subs: [],
        autoCadastrado: false,
        ativo: true,
        createdAt: agora,
        execucoes: 0,
        ultimaExecucao: null,
        apontadas: 0,
      },
    ],
    personas: [
      {
        id: "persona-demo-1",
        nome: "Camila Ferreira",
        cpf: "123.456.789-09",
        telefone: "(11) 98888-1234",
        genero: "feminino",
        email: "camila.ferreira@exemplo.com",
        nascimento: "14/03/1991",
        cidade: "São Paulo/SP",
        fallbackDadosPessoa: "ficticio",
        tags: ["vip"],
        createdAt: agora,
      },
      {
        id: "persona-demo-2",
        nome: "Rafael Souza",
        cpf: "987.654.321-00",
        telefone: "(21) 97777-5678",
        genero: "masculino",
        email: "rafael.souza@exemplo.com",
        nascimento: "22/07/1988",
        cidade: "Rio de Janeiro/RJ",
        fallbackDadosPessoa: "ficticio",
        tags: ["suporte"],
        createdAt: agora,
      },
    ],
    scenarios: [
      {
        id: "cenario-demo-cancelamento",
        nome: "Cancelamento de plano",
        cenario:
          "Simule que você é a pessoa {nome}, cliente há mais de um ano, que quer cancelar o plano porque encontrou um concorrente mais barato. Seja educado(a), mas insista até conseguir o cancelamento.",
        criterioSucesso: "O avatar confirma o cancelamento do plano e informa o prazo em que ele será efetivado.",
        tags: ["cancelamento"],
        createdAt: agora,
      },
      {
        id: "cenario-demo-fatura",
        nome: "Dúvida sobre fatura",
        cenario:
          "Simule que você é a pessoa {nome}, que recebeu a fatura deste mês com um valor mais alto que o normal e quer entender o motivo antes de pagar.",
        criterioSucesso: "O avatar explica claramente o motivo do valor da fatura.",
        tags: ["financeiro"],
        createdAt: agora,
      },
    ],
    avatarTests: [
      {
        id: "simulacao-demo-cancelamento",
        name: "Cancelamento — fluxo padrão",
        avatar: "Isa Demo",
        ambiente: "hml",
        hostSlug: "isa-demo",
        saudacaoInicial: "Olá! Gostaria de cancelar meu plano.",
        maxTurnos: 10,
        cenario:
          "Simule que você é a pessoa {nome}, cliente há mais de um ano, que quer cancelar o plano porque encontrou um concorrente mais barato. Seja educado(a), mas insista até conseguir o cancelamento.",
        criterioSucesso: "O avatar confirma o cancelamento do plano e informa o prazo em que ele será efetivado.",
        tags: ["cancelamento"],
        createdAt: agora,
        tipo: "unico",
        cenariosIndividuaisAtivo: false,
        mensagensPorTurno: false,
        embaralharDados: false,
        rodarRoteiroCompleto: false,
        arquivada: false,
        ordem: 2,
      },
      {
        id: "simulacao-demo-fatura-lote",
        name: "Dúvida de fatura — lote de personas",
        avatar: "Financeiro Demo",
        ambiente: "hml",
        hostSlug: "financeiro-demo",
        saudacaoInicial: "Olá! Recebi minha fatura e fiquei com uma dúvida.",
        maxTurnos: 10,
        cenario:
          "Simule que você é a pessoa {nome}, que recebeu a fatura deste mês com um valor mais alto que o normal e quer entender o motivo antes de pagar.",
        criterioSucesso: "O avatar explica claramente o motivo do valor da fatura.",
        tags: ["financeiro"],
        createdAt: agora,
        tipo: "lote",
        pessoas: [
          { nome: "Camila Ferreira", cpf: "123.456.789-09", telefone: "(11) 98888-1234", email: "camila.ferreira@exemplo.com" },
          { nome: "Rafael Souza", cpf: "987.654.321-00", telefone: "(21) 97777-5678", email: "rafael.souza@exemplo.com" },
        ],
        maxSimultaneos: 2,
        cenariosIndividuaisAtivo: false,
        mensagensPorTurno: false,
        embaralharDados: false,
        rodarRoteiroCompleto: false,
        arquivada: false,
        ordem: 1,
      },
    ],
    avatarTestRuns: [
      {
        id: "run-demo-1",
        avatarTestId: "simulacao-demo-cancelamento",
        conversationId: "demo-conversa-exemplo",
        resultado: "SUCESSO",
        motivoEncerramento:
          "Critério atingido (demonstração — conversa e respostas fictícias, geradas localmente, sem nenhuma chamada real)",
        totalTurnos: 4,
        maxTurnos: 10,
        tempoSegundos: 6.4,
        transcricao: [
          { turno: 1, enviado: "Olá! Gostaria de cancelar meu plano.", resposta_avatar: "Olá! Tudo bem? Já estou por aqui, me conta com calma o que você precisa." },
          { turno: 2, enviado: "Entendido. Só reforçando o que eu pedi: O avatar confirma o cancelamento do plano e informa o prazo em que ele será efetivado.", resposta_avatar: "Entendi. Sobre isso, só um instante que já verifico aqui." },
          { turno: 3, enviado: "Certo, obrigado(a). Voltando ao que falei: O avatar confirma o cancelamento do plano e informa o prazo em que ele será efetivado.", resposta_avatar: "Consegui resolver isso pra você — sobre efetivado, já está tudo certo agora. O avatar confirma o cancelamento do plano e informa o prazo em que ele será efetivado." },
        ],
        sentimento: {
          resumo: "Resumo fictício de demonstração — esta conversa não aconteceu de verdade, nenhuma chamada foi feita à Zenta.",
          sentimento_score: 0.82,
          heat_score: 0.05,
        },
        startedAt: isoHaMinutos(45),
        finishedAt: isoHaMinutos(45),
        avatarExecucao: "Isa Demo",
        ambienteExecucao: "hml",
      },
    ],
    avatarTestBatches: [],
    anexos: [],
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __demoStore: { data: Store; resetAt: number } | undefined;
}

function store(): Store {
  const agora = Date.now();
  if (!global.__demoStore || agora >= global.__demoStore.resetAt) {
    global.__demoStore = { data: seed(), resetAt: agora + RESET_INTERVAL_MS };
  }
  return global.__demoStore.data;
}

function capPessoas(pessoas: PessoaDoLote[] | null | undefined): PessoaDoLote[] | undefined {
  if (!pessoas) return undefined;
  return pessoas.slice(0, LIMITE_PESSOAS_LOTE_DEMO);
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
    for (const t of s.avatarTests) t.tags = propagar(t.tags) || [];
    for (const p of s.personas) p.tags = propagar(p.tags) || [];
    for (const sc of s.scenarios) sc.tags = propagar(sc.tags) || [];
  } else {
    existing.color = newColor;
  }

  return listTags();
}

export async function deleteTag(name: string): Promise<Tag[]> {
  const s = store();
  const remover = (tags: string[] | undefined) => (tags ? tags.filter((t) => t !== name) : tags);
  for (const t of s.avatarTests) t.tags = remover(t.tags) || [];
  for (const p of s.personas) p.tags = remover(p.tags) || [];
  for (const sc of s.scenarios) sc.tags = remover(sc.tags) || [];
  s.tags = s.tags.filter((t) => t.name !== name);
  return listTags();
}

// --- Simulações de avatar de IA (o motor de simulação em si) ---

export async function listAvatarTests(): Promise<AvatarTest[]> {
  return clone(store().avatarTests).sort((a: AvatarTest, b: AvatarTest) => b.ordem - a.ordem);
}

export async function getAvatarTest(id: string): Promise<AvatarTest | null> {
  const found = store().avatarTests.find((t) => t.id === id);
  return found ? clone(found) : null;
}

export async function createAvatarTest(input: {
  name: string;
  avatar?: string;
  ambiente?: string;
  hostSlug?: string;
  subSlug?: string;
  baseUrl?: string;
  saudacaoInicial?: string;
  maxTurnos?: number;
  cenario: string;
  criterioSucesso?: string;
  dadosFixos?: Record<string, unknown>;
  tela?: string;
  tags?: string[];
  tipo?: "unico" | "lote";
  pessoas?: PessoaDoLote[];
  maxSimultaneos?: number;
  cenariosIndividuaisAtivo?: boolean;
  overridesPorPessoa?: Record<string, { cenario: string; criterio: string }>;
  mensagensPorTurno?: boolean;
  rodarRoteiroCompleto?: boolean;
  embaralharDados?: boolean;
  embaralharConfig?: EmbaralharConfig | null;
  roteiroTurnos?: TurnoRoteiro[] | null;
}): Promise<AvatarTest> {
  const s = store();
  const id = `${slugify(input.name) || "simulacao"}-${Date.now().toString(36)}`;
  const maiorOrdem = s.avatarTests.reduce((max, t) => Math.max(max, t.ordem), 0);
  const created: AvatarTest = {
    id,
    name: input.name,
    avatar: input.avatar ?? "",
    ambiente: input.ambiente ?? "",
    hostSlug: input.hostSlug ?? "us",
    ...(input.subSlug ? { subSlug: input.subSlug } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    saudacaoInicial: input.saudacaoInicial ?? "Olá! Gostaria de mais informações.",
    maxTurnos: input.maxTurnos ?? 10,
    cenario: input.cenario,
    ...(input.criterioSucesso ? { criterioSucesso: input.criterioSucesso } : {}),
    ...(input.dadosFixos ? { dadosFixos: input.dadosFixos } : {}),
    ...(input.tela ? { tela: input.tela } : {}),
    tags: input.tags ?? [],
    createdAt: isoAgora(),
    tipo: input.tipo ?? "unico",
    ...(input.pessoas ? { pessoas: capPessoas(input.pessoas) } : {}),
    ...(input.maxSimultaneos != null ? { maxSimultaneos: input.maxSimultaneos } : {}),
    cenariosIndividuaisAtivo: input.cenariosIndividuaisAtivo ?? false,
    ...(input.overridesPorPessoa ? { overridesPorPessoa: input.overridesPorPessoa } : {}),
    mensagensPorTurno: input.mensagensPorTurno ?? false,
    embaralharDados: input.embaralharDados ?? false,
    ...(input.embaralharConfig ? { embaralharConfig: input.embaralharConfig } : {}),
    ...(input.roteiroTurnos && input.roteiroTurnos.length
      ? { roteiroTurnos: sincronizarAnexosDaSimulacao(id, input.roteiroTurnos) }
      : {}),
    rodarRoteiroCompleto: input.rodarRoteiroCompleto ?? false,
    arquivada: false,
    ordem: maiorOrdem + 1,
  };
  s.avatarTests.push(created);
  return clone(created);
}

export async function updateAvatarTest(
  id: string,
  changes: Partial<{
    name: string;
    avatar: string;
    ambiente: string;
    hostSlug: string;
    subSlug: string | null;
    baseUrl: string | null;
    saudacaoInicial: string;
    maxTurnos: number;
    cenario: string;
    criterioSucesso: string | null;
    dadosFixos: Record<string, unknown> | null;
    tela: string | null;
    tags: string[];
    tipo: "unico" | "lote";
    pessoas: PessoaDoLote[] | null;
    maxSimultaneos: number | null;
    cenariosIndividuaisAtivo: boolean;
    overridesPorPessoa: Record<string, { cenario: string; criterio: string }> | null;
    mensagensPorTurno: boolean;
    rodarRoteiroCompleto: boolean;
    roteiroTurnos: TurnoRoteiro[] | null;
    embaralharDados: boolean;
    embaralharConfig: EmbaralharConfig | null;
    arquivada: boolean;
    ordem: number;
  }>
): Promise<AvatarTest> {
  const s = store();
  const existing = s.avatarTests.find((t) => t.id === id);
  if (!existing) throw new Error("Teste de avatar não encontrado.");

  if (changes.name !== undefined) existing.name = changes.name;
  if (changes.avatar !== undefined) existing.avatar = changes.avatar;
  if (changes.ambiente !== undefined) existing.ambiente = changes.ambiente;
  if (changes.hostSlug !== undefined) existing.hostSlug = changes.hostSlug;
  if (changes.subSlug !== undefined) {
    if (changes.subSlug) existing.subSlug = changes.subSlug;
    else delete existing.subSlug;
  }
  if (changes.baseUrl !== undefined) {
    if (changes.baseUrl) existing.baseUrl = changes.baseUrl;
    else delete existing.baseUrl;
  }
  if (changes.saudacaoInicial !== undefined) existing.saudacaoInicial = changes.saudacaoInicial;
  if (changes.maxTurnos !== undefined) existing.maxTurnos = changes.maxTurnos;
  if (changes.cenario !== undefined) existing.cenario = changes.cenario;
  if (changes.criterioSucesso !== undefined) {
    if (changes.criterioSucesso) existing.criterioSucesso = changes.criterioSucesso;
    else delete existing.criterioSucesso;
  }
  if (changes.dadosFixos !== undefined) {
    if (changes.dadosFixos) existing.dadosFixos = changes.dadosFixos;
    else delete existing.dadosFixos;
  }
  if (changes.tela !== undefined) {
    if (changes.tela) existing.tela = changes.tela;
    else delete existing.tela;
  }
  if (changes.tags !== undefined) existing.tags = changes.tags;
  if (changes.tipo !== undefined) existing.tipo = changes.tipo;
  if (changes.pessoas !== undefined) {
    const capped = capPessoas(changes.pessoas || undefined);
    if (capped) existing.pessoas = capped;
    else delete existing.pessoas;
  }
  if (changes.maxSimultaneos !== undefined) {
    if (changes.maxSimultaneos != null) existing.maxSimultaneos = changes.maxSimultaneos;
    else delete existing.maxSimultaneos;
  }
  if (changes.cenariosIndividuaisAtivo !== undefined) existing.cenariosIndividuaisAtivo = changes.cenariosIndividuaisAtivo;
  if (changes.overridesPorPessoa !== undefined) {
    if (changes.overridesPorPessoa) existing.overridesPorPessoa = changes.overridesPorPessoa;
    else delete existing.overridesPorPessoa;
  }
  if (changes.mensagensPorTurno !== undefined) existing.mensagensPorTurno = changes.mensagensPorTurno;
  if (changes.rodarRoteiroCompleto !== undefined) existing.rodarRoteiroCompleto = changes.rodarRoteiroCompleto;
  if (changes.roteiroTurnos !== undefined) {
    const sincronizado = sincronizarAnexosDaSimulacao(id, changes.roteiroTurnos || []);
    if (sincronizado.length) existing.roteiroTurnos = sincronizado;
    else delete existing.roteiroTurnos;
  }
  if (changes.embaralharDados !== undefined) existing.embaralharDados = changes.embaralharDados;
  if (changes.embaralharConfig !== undefined) {
    if (changes.embaralharConfig) existing.embaralharConfig = changes.embaralharConfig;
    else delete existing.embaralharConfig;
  }
  if (changes.arquivada !== undefined) existing.arquivada = changes.arquivada;
  if (changes.ordem !== undefined) existing.ordem = changes.ordem;

  return clone(existing);
}

export async function deleteAvatarTest(id: string): Promise<boolean> {
  const s = store();
  const before = s.avatarTests.length;
  s.avatarTests = s.avatarTests.filter((t) => t.id !== id);
  s.anexos = s.anexos.filter((a) => a.avatarTestId !== id);
  return s.avatarTests.length < before;
}

// --- Anexos dos turnos do roteiro (05/10/2026) ---

/**
 * Registra um anexo escolhido no assistente. Nasce sem dono; ganha dono no
 * "Salvar" (sincronizarAnexosDaSimulacao). Varre de passagem os registros sem
 * dono com mais de 1 hora (assistente abandonado).
 */
export async function registrarAnexo(input: { nome: string; tipo: string; tamanho: number }): Promise<AnexoTurno> {
  const s = store();
  const agora = Date.now();
  s.anexos = s.anexos.filter((a) => a.avatarTestId || agora - a.criadoEm < 60 * 60 * 1000);
  const anexo: AnexoTurno = {
    id: randomUUID(),
    nome: input.nome,
    url: "",
    tipo: input.tipo,
    tamanho: Math.round(input.tamanho) || 0,
  };
  s.anexos.push({ ...anexo, avatarTestId: null, criadoEm: agora });
  return clone(anexo);
}

/**
 * Deixa a "tabela" de anexos igual ao que o roteiro desta simulação cita e
 * devolve o roteiro com os anexos conferidos — mesmas regras do projeto real:
 * anexo sem dono vira desta simulação; anexo de outra simulação (Duplicar)
 * ganha um registro próprio; anexo que não existe sai do turno; registro
 * desta simulação que o roteiro não cita mais é apagado.
 */
function sincronizarAnexosDaSimulacao(avatarTestId: string, roteiro: TurnoRoteiro[]): TurnoRoteiro[] {
  const s = store();
  const final = new Map<string, AnexoTurno>();
  for (const anexoId of idsDeAnexosDoRoteiro(roteiro)) {
    const row = s.anexos.find((a) => a.id === anexoId);
    if (!row) continue;
    if (!row.avatarTestId || row.avatarTestId === avatarTestId) {
      row.avatarTestId = avatarTestId;
      final.set(anexoId, { id: row.id, nome: row.nome, url: row.url, tipo: row.tipo, tamanho: row.tamanho });
    } else {
      const copia: AnexoTurno = { id: randomUUID(), nome: row.nome, url: row.url, tipo: row.tipo, tamanho: row.tamanho };
      s.anexos.push({ ...copia, avatarTestId, criadoEm: Date.now() });
      final.set(anexoId, copia);
    }
  }
  const manter = new Set(Array.from(final.values()).map((a) => a.id));
  s.anexos = s.anexos.filter((a) => a.avatarTestId !== avatarTestId || manter.has(a.id));
  return roteiro.map((t) => {
    const anexos = anexosDaLinha(t)
      .map((a) => final.get(a.id))
      .filter((a): a is AnexoTurno => !!a);
    const { anexos: _velhos, ...resto } = t;
    return anexos.length ? { ...resto, anexos } : resto;
  });
}

// --- Execuções de teste de avatar (histórico com a transcrição completa) ---

export async function listAvatarTestRuns(opts?: { avatarTestId?: string; limit?: number }): Promise<AvatarTestRun[]> {
  const limit = opts?.limit ?? 200;
  let runs = clone(store().avatarTestRuns) as AvatarTestRun[];
  if (opts?.avatarTestId) runs = runs.filter((r) => r.avatarTestId === opts.avatarTestId);
  return runs
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

export async function saveAvatarTestRun(input: {
  avatarTestId?: string;
  conversationId?: string;
  resultado?: string;
  motivoEncerramento?: string;
  totalTurnos?: number;
  maxTurnos?: number;
  tempoSegundos?: number;
  transcricao?: AvatarTestRun["transcricao"];
  sentimento?: AvatarTestRun["sentimento"];
  startedAt?: string;
  personaId?: string;
  personaNome?: string;
  ambienteExecucao?: string;
  avatarExecucao?: string;
  embaralhamento?: string;
}): Promise<AvatarTestRun> {
  const s = store();
  const run: AvatarTestRun = {
    id: randomUUID(),
    ...(input.avatarTestId ? { avatarTestId: input.avatarTestId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.resultado ? { resultado: input.resultado as AvatarTestRun["resultado"] } : {}),
    ...(input.motivoEncerramento ? { motivoEncerramento: input.motivoEncerramento } : {}),
    ...(input.totalTurnos != null ? { totalTurnos: input.totalTurnos } : {}),
    ...(input.maxTurnos != null ? { maxTurnos: input.maxTurnos } : {}),
    ...(input.tempoSegundos != null ? { tempoSegundos: input.tempoSegundos } : {}),
    ...(input.transcricao ? { transcricao: input.transcricao } : {}),
    ...(input.sentimento ? { sentimento: input.sentimento } : {}),
    startedAt: input.startedAt || isoAgora(),
    finishedAt: isoAgora(),
    ...(input.personaId ? { personaId: input.personaId } : {}),
    ...(input.personaNome ? { personaNome: input.personaNome } : {}),
    ...(input.ambienteExecucao ? { ambienteExecucao: input.ambienteExecucao } : {}),
    ...(input.avatarExecucao ? { avatarExecucao: input.avatarExecucao } : {}),
    ...(input.embaralhamento ? { embaralhamento: input.embaralhamento } : {}),
  };
  s.avatarTestRuns.unshift(run);
  return clone(run);
}

export async function deleteAvatarTestRun(id: string): Promise<boolean> {
  const s = store();
  const before = s.avatarTestRuns.length;
  s.avatarTestRuns = s.avatarTestRuns.filter((r) => r.id !== id);
  return s.avatarTestRuns.length < before;
}

// --- Biblioteca de personas (dados fictícios reutilizáveis pra lote) ---

export async function listPersonas(): Promise<Persona[]> {
  return clone(store().personas).sort((a: Persona, b: Persona) => a.nome.localeCompare(b.nome));
}

export async function getPersona(id: string): Promise<Persona | null> {
  const found = store().personas.find((p) => p.id === id);
  return found ? clone(found) : null;
}

export async function createPersona(input: {
  nome: string;
  cpf?: string;
  telefone?: string;
  genero?: string;
  email?: string;
  nascimento?: string;
  cidade?: string;
  campoExtraNome?: string;
  campoExtraValor?: string;
  fallbackDadosPessoa?: "ficticio" | "vazio";
  cenario?: string;
  criterioSucesso?: string;
  tags?: string[];
  foto?: string;
}): Promise<Persona> {
  const s = store();
  const created: Persona = {
    id: randomUUID(),
    nome: input.nome,
    ...(input.cpf ? { cpf: input.cpf } : {}),
    ...(input.telefone ? { telefone: input.telefone } : {}),
    ...(input.genero ? { genero: input.genero } : {}),
    ...(input.email ? { email: input.email } : {}),
    ...(input.nascimento ? { nascimento: input.nascimento } : {}),
    ...(input.cidade ? { cidade: input.cidade } : {}),
    ...(input.campoExtraNome ? { campoExtraNome: input.campoExtraNome } : {}),
    ...(input.campoExtraValor ? { campoExtraValor: input.campoExtraValor } : {}),
    fallbackDadosPessoa: input.fallbackDadosPessoa ?? "ficticio",
    ...(input.cenario ? { cenario: input.cenario } : {}),
    ...(input.criterioSucesso ? { criterioSucesso: input.criterioSucesso } : {}),
    tags: input.tags ?? [],
    ...(input.foto ? { foto: input.foto } : {}),
    createdAt: isoAgora(),
  };
  s.personas.push(created);
  return clone(created);
}

export async function updatePersona(
  id: string,
  changes: Partial<{
    nome: string;
    cpf: string | null;
    telefone: string | null;
    genero: string | null;
    email: string | null;
    nascimento: string | null;
    cidade: string | null;
    campoExtraNome: string | null;
    campoExtraValor: string | null;
    fallbackDadosPessoa: "ficticio" | "vazio";
    cenario: string | null;
    criterioSucesso: string | null;
    tags: string[];
    foto: string | null;
  }>
): Promise<Persona> {
  const s = store();
  const existing = s.personas.find((p) => p.id === id);
  if (!existing) throw new Error("Persona não encontrada.");

  const setOrDelete = (key: keyof Persona, value: unknown) => {
    if (value) (existing as any)[key] = value;
    else delete (existing as any)[key];
  };

  if (changes.nome !== undefined) existing.nome = changes.nome;
  if (changes.cpf !== undefined) setOrDelete("cpf", changes.cpf);
  if (changes.telefone !== undefined) setOrDelete("telefone", changes.telefone);
  if (changes.genero !== undefined) setOrDelete("genero", changes.genero);
  if (changes.email !== undefined) setOrDelete("email", changes.email);
  if (changes.nascimento !== undefined) setOrDelete("nascimento", changes.nascimento);
  if (changes.cidade !== undefined) setOrDelete("cidade", changes.cidade);
  if (changes.campoExtraNome !== undefined) setOrDelete("campoExtraNome", changes.campoExtraNome);
  if (changes.campoExtraValor !== undefined) setOrDelete("campoExtraValor", changes.campoExtraValor);
  if (changes.fallbackDadosPessoa !== undefined) existing.fallbackDadosPessoa = changes.fallbackDadosPessoa;
  if (changes.cenario !== undefined) setOrDelete("cenario", changes.cenario);
  if (changes.criterioSucesso !== undefined) setOrDelete("criterioSucesso", changes.criterioSucesso);
  if (changes.tags !== undefined) existing.tags = changes.tags;
  if (changes.foto !== undefined) setOrDelete("foto", changes.foto);

  return clone(existing);
}

export async function deletePersona(id: string): Promise<boolean> {
  const s = store();
  const before = s.personas.length;
  s.personas = s.personas.filter((p) => p.id !== id);
  return s.personas.length < before;
}

// --- Biblioteca de cenários ---

export async function listScenarios(): Promise<Scenario[]> {
  return clone(store().scenarios).sort((a: Scenario, b: Scenario) => a.nome.localeCompare(b.nome));
}

export async function getScenario(id: string): Promise<Scenario | null> {
  const found = store().scenarios.find((s) => s.id === id);
  return found ? clone(found) : null;
}

export async function createScenario(input: {
  nome: string;
  cenario: string;
  criterioSucesso?: string;
  tags?: string[];
}): Promise<Scenario> {
  const s = store();
  const created: Scenario = {
    id: randomUUID(),
    nome: input.nome,
    cenario: input.cenario,
    ...(input.criterioSucesso ? { criterioSucesso: input.criterioSucesso } : {}),
    tags: input.tags ?? [],
    createdAt: isoAgora(),
  };
  s.scenarios.push(created);
  return clone(created);
}

export async function updateScenario(
  id: string,
  changes: Partial<{ nome: string; cenario: string; criterioSucesso: string | null; tags: string[] }>
): Promise<Scenario> {
  const s = store();
  const existing = s.scenarios.find((sc) => sc.id === id);
  if (!existing) throw new Error("Cenário não encontrado.");

  if (changes.nome !== undefined) existing.nome = changes.nome;
  if (changes.cenario !== undefined) existing.cenario = changes.cenario;
  if (changes.criterioSucesso !== undefined) {
    if (changes.criterioSucesso) existing.criterioSucesso = changes.criterioSucesso;
    else delete existing.criterioSucesso;
  }
  if (changes.tags !== undefined) existing.tags = changes.tags;

  return clone(existing);
}

export async function deleteScenario(id: string): Promise<boolean> {
  const s = store();
  const before = s.scenarios.length;
  s.scenarios = s.scenarios.filter((sc) => sc.id !== id);
  return s.scenarios.length < before;
}

// --- Presets de lote (quais personas + máx. simultâneos, salvos por teste) ---

export async function listAvatarTestBatches(avatarTestId: string): Promise<AvatarTestBatch[]> {
  return clone(store().avatarTestBatches)
    .filter((b: AvatarTestBatch) => b.avatarTestId === avatarTestId)
    .sort((a: AvatarTestBatch, b: AvatarTestBatch) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createAvatarTestBatch(input: {
  avatarTestId: string;
  name: string;
  pessoas: PessoaDoLote[];
  maxSimultaneos: number;
}): Promise<AvatarTestBatch> {
  const s = store();
  const created: AvatarTestBatch = {
    id: randomUUID(),
    avatarTestId: input.avatarTestId,
    name: input.name,
    pessoas: capPessoas(input.pessoas) || [],
    maxSimultaneos: Math.min(input.maxSimultaneos, LIMITE_PESSOAS_LOTE_DEMO),
    createdAt: isoAgora(),
  };
  s.avatarTestBatches.push(created);
  return clone(created);
}

export async function deleteAvatarTestBatch(id: string): Promise<boolean> {
  const s = store();
  const before = s.avatarTestBatches.length;
  s.avatarTestBatches = s.avatarTestBatches.filter((b) => b.id !== id);
  return s.avatarTestBatches.length < before;
}

// --- Cadastro de avatares (aba "Avatares") ---

export interface AvatarAtualizado {
  avatar: AvatarCadastro;
  repontadas?: { quantas: number; para: string };
}

function normalizarSubs(subs: unknown): SubavatarCadastro[] {
  if (!Array.isArray(subs)) return [];
  return subs
    .map((s: any) => ({
      nome: String(s?.nome || "").trim(),
      subSlug: String(s?.subSlug || s?.sub_slug || "").trim(),
    }))
    .filter((s) => s.nome)
    .map((s) => ({ nome: s.nome, subSlug: s.subSlug || s.nome }));
}

/** Recalcula execucoes/ultimaExecucao/apontadas a partir do histórico e das simulações atuais. */
function recalcularNumerosDosAvatares(s: Store): void {
  for (const av of s.avatars) {
    const nomeAlvo = av.nome.trim().toLowerCase();
    const execucoesDoAvatar = s.avatarTestRuns.filter(
      (r) => (r.avatarExecucao || "").trim().split("/")[0].trim().toLowerCase() === nomeAlvo
    );
    av.execucoes = execucoesDoAvatar.length;
    av.ultimaExecucao = execucoesDoAvatar.length
      ? execucoesDoAvatar.reduce((max, r) => (r.startedAt > max ? r.startedAt : max), execucoesDoAvatar[0].startedAt)
      : null;
    av.apontadas = s.avatarTests.filter(
      (t) => (t.avatar || "").trim().split("/")[0].trim().toLowerCase() === nomeAlvo
    ).length;
  }
}

export async function listAvatars(): Promise<AvatarCadastro[]> {
  const s = store();
  recalcularNumerosDosAvatares(s);
  return clone(s.avatars).sort((a: AvatarCadastro, b: AvatarCadastro) => a.nome.localeCompare(b.nome));
}

export async function createAvatar(input: { nome: string; hostSlug?: string; subs?: unknown; autoCadastrado?: boolean }): Promise<AvatarCadastro> {
  const nome = String(input.nome || "").trim();
  if (!nome) throw new Error("Nome do avatar é obrigatório.");
  if (nome.includes("/")) {
    throw new Error('Nome de avatar não pode ter "/" — subavatar se cadastra dentro do avatar, na lista de subavatares.');
  }
  const s = store();
  if (s.avatars.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) {
    throw new Error("Já existe um avatar com esse nome.");
  }
  const hostSlug = String(input.hostSlug || "").trim() || nome;
  const created: AvatarCadastro = {
    id: randomUUID(),
    nome,
    hostSlug,
    subs: normalizarSubs(input.subs),
    autoCadastrado: !!input.autoCadastrado,
    ativo: true,
    createdAt: isoAgora(),
    execucoes: 0,
    ultimaExecucao: null,
    apontadas: 0,
  };
  s.avatars.push(created);
  return clone(created);
}

function proximoAvatarAtivo(s: Store, nomeAtual: string): AvatarCadastro | null {
  const ativos = s.avatars.filter((a) => a.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  if (ativos.length === 0) return null;
  const alvo = nomeAtual.trim().toLowerCase();
  return ativos.find((a) => a.nome.trim().toLowerCase() > alvo) ?? ativos[0];
}

export async function updateAvatar(
  id: string,
  patch: { nome?: string; hostSlug?: string; subs?: unknown; ativo?: boolean }
): Promise<AvatarAtualizado | null> {
  const s = store();
  const atual = s.avatars.find((a) => a.id === id);
  if (!atual) return null;

  const nomeAntigo = atual.nome;
  const ativoAntigo = atual.ativo;

  const nome = patch.nome !== undefined ? String(patch.nome).trim() : atual.nome;
  if (!nome) throw new Error("Nome do avatar é obrigatório.");
  if (nome.includes("/")) {
    throw new Error('Nome de avatar não pode ter "/" — subavatar se cadastra dentro do avatar, na lista de subavatares.');
  }

  const soLigaDesliga =
    patch.ativo !== undefined && patch.nome === undefined && patch.hostSlug === undefined && patch.subs === undefined;

  atual.nome = nome;
  atual.hostSlug = patch.hostSlug !== undefined ? String(patch.hostSlug).trim() || nome : atual.hostSlug;
  atual.subs = patch.subs !== undefined ? normalizarSubs(patch.subs) : atual.subs;
  atual.ativo = patch.ativo !== undefined ? !!patch.ativo : atual.ativo === undefined ? true : atual.ativo;
  atual.autoCadastrado = soLigaDesliga ? atual.autoCadastrado : false;

  const desligouAgora = atual.ativo === false && ativoAntigo !== false;
  let repontadas: AvatarAtualizado["repontadas"];
  if (desligouAgora) {
    const proximo = proximoAvatarAtivo(s, nomeAntigo);
    if (proximo) {
      const alvo = nomeAntigo.trim().toLowerCase();
      const mexidas = s.avatarTests.filter((t) => (t.avatar || "").trim().split("/")[0].trim().toLowerCase() === alvo);
      for (const t of mexidas) {
        t.avatar = proximo.nome;
        t.hostSlug = proximo.hostSlug;
        delete t.subSlug;
      }
      if (mexidas.length > 0) repontadas = { quantas: mexidas.length, para: proximo.nome };
    }
  }

  recalcularNumerosDosAvatares(s);
  return { avatar: clone(atual), repontadas };
}

export async function deleteAvatar(id: string): Promise<void> {
  const s = store();
  s.avatars = s.avatars.filter((a) => a.id !== id);
}

export async function garantirAvatar(nome: string, hostSlug?: string): Promise<void> {
  const limpo = String(nome || "").trim().split("/")[0].trim();
  if (!limpo) return;
  const s = store();
  if (s.avatars.some((a) => a.nome.toLowerCase() === limpo.toLowerCase())) return;
  s.avatars.push({
    id: randomUUID(),
    nome: limpo,
    hostSlug: String(hostSlug || "").trim() || limpo,
    subs: [],
    autoCadastrado: true,
    ativo: true,
    createdAt: isoAgora(),
    execucoes: 0,
    ultimaExecucao: null,
    apontadas: 0,
  });
}
