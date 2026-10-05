"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AvatarTest, AvatarTestRun, AvatarTurn, Tag } from "@/lib/types";
import { ListaAnexos } from "@/components/anexos-turno";
import { IconPencil, IconDots, IconX, IconGripVertical } from "../icons";
import { FilterPopover } from "@/components/filter-popover";
import { emptyFilter, matchesFilter, MultiFilter } from "@/lib/filters";
import { pessoaDoLoteParaLinha, PessoaLinha } from "@/lib/loteText";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { TagQuickAdd } from "@/components/tag-quick-add";
import { usePersistedState } from "@/lib/usePersistedState";
import { DestinoSwitch, DimensaoDestino } from "@/components/destino-switch";
import { useAvatares } from "@/lib/useAvatares";
import { gerarRelatorioSimulacaoPdf } from "@/lib/relatorioSimulacao";
import {
  ambienteConhecido,
  avatarDesativado,
  baseUrlParaSalvar,
  configDoAvatarOuRotulo,
} from "@/lib/destinos";

// Resposta turno a turno / relatório final do proxy (app/api/avatar-tests/run)
// — mesmo contrato usado em app/testes-avatar/[id]/page.tsx.
type ProxyResponse =
  | {
      status: "continuar";
      conversation_id: string;
      turno_atual: number;
      max_turnos: number;
      ultimo_turno: AvatarTurn | null;
    }
  | {
      status?: undefined;
      resultado: string;
      total_turnos: number;
      max_turnos: number;
      transcricao?: AvatarTurn[];
      tempo_segundos?: number;
      embaralhamento?: string;
      /** Id da execucao gravada em avatar_test_runs — e o que liga o card ao
       *  relatorio "desta rodada" (04/09/2026). So vem no relatorio final. */
      runId?: string;
    };

// Status de uma pessoa dentro do lote, igual ao vocabulário do coisasdaisa
// (index.html: "Na fila" / "rodando" / SUCESSO / FALHA / ENCERRADO / ERRO /
// "Interrompido") — cada pessoa acompanha sua própria transcrição, pra dar o
// mesmo acompanhamento "ao vivo" da plataforma original.
type LotePessoaStatus = "fila" | "rodando" | "SUCESSO" | "FALHA" | "ENCERRADO" | "ERRO" | "INTERROMPIDO";

type LotePessoaProgress = {
  nome: string;
  status: LotePessoaStatus;
  turno?: number;
  maxTurnos?: number;
  turns: AvatarTurn[];
  /** Execucao gravada no historico pra esta pessoa — usada pra emitir o
   *  relatorio so das conversas escolhidas nas caixinhas. */
  runId?: string;
  /**
   * MODO DEMO: o relatorio final que a rota /run ja devolveu junto com o
   * runId — guardado aqui pra emitirRelatorioDaExecucao nao depender de um
   * novo GET em /api/avatar-test-runs (na Vercel, sem banco de verdade, esse
   * GET pode cair numa instancia serverless "fria" que nunca viu essa
   * execucao — cada instancia tem sua propria memoria).
   */
  runRecord?: Partial<AvatarTestRun>;
  // Motivo do "Erro" daquela pessoa (mensagem que veio da rota /run: config
  // faltando, coisasdaisa fora do ar, avatar inexistente na Zenta...). Sem
  // isso o card mostrava so a pilula "Erro" e nao dava pra saber por que a
  // simulacao nao rodou em lugar nenhum.
  erro?: string;
};

/** Espelha o tipo aceito por app/api/avatar-tests/run. */
type DestinoExecucao = {
  avatar: string;
  ambiente: string;
  hostSlug: string;
  subSlug?: string | null;
  baseUrl?: string | null;
};

type CardRunState = {
  status: "rodando" | "concluido" | "erro";
  // teste único — transcrição ao vivo, igual ao painel "Execução atual" da
  // página de detalhe, só que direto no card.
  liveTurns?: AvatarTurn[];
  conversationId?: string;
  totalTurnos?: number;
  maxTurnos?: number;
  resultado?: string;
  /** Execucao gravada no historico (teste unico). */
  runId?: string;
  /** MODO DEMO: mesma ideia do runRecord de LotePessoaProgress, ver comentário lá. */
  runRecord?: Partial<AvatarTestRun>;
  // lote — uma entrada por pessoa, cada uma com sua transcrição.
  lotePessoas?: LotePessoaProgress[];
  loteConcluidos?: number;
  loteTotal?: number;
  erro?: string;
};

// destino: o ambiente/avatar em que ESTA rodada aconteceu, do jeito que
// estava no momento do clique. Vai junto em TODA chamada — inclusive nas de
// "continuar"/"encerrar", porque e numa delas que o relatorio final chega e e
// gravado no historico. Como o switch do card troca o ambiente da propria
// simulacao a qualquer momento, e isso que mantem o historico honesto: a
// execucao de ontem continua dizendo que rodou em hml mesmo depois de a
// simulacao passar pra prod.
async function chamarProxy(
  avatarTestId: string,
  body: {
    conversationId?: string;
    encerrar?: boolean;
    pessoa?: PessoaLinha;
    /** Posicao da pessoa no lote — a rota /run usa pra saber se o
     *  embaralhamento de dados vale pra ela quando a simulacao embaralha
     *  "so algumas". */
    pessoaIndex?: number;
    destino?: DestinoExecucao;
  }
): Promise<ProxyResponse> {
  const res = await fetch("/api/avatar-tests/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarTestId, ...body }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function labelStatusPessoa(p: LotePessoaProgress): string {
  switch (p.status) {
    case "fila":
      return "Na fila";
    case "rodando":
      return `Turno ${p.turno ?? 0}${p.maxTurnos ? ` de ${p.maxTurnos}` : ""}`;
    case "INTERROMPIDO":
      return "Interrompido";
    case "ERRO":
      return "Erro";
    default:
      return `${p.status} · ${p.turno ?? 0} turnos`;
  }
}

function pillClassForStatus(status: LotePessoaStatus): string {
  if (status === "rodando") return "rodando";
  if (status === "SUCESSO") return "ok";
  if (status === "FALHA" || status === "ERRO") return "err";
  return "";
}

// Gera o próximo nome de cópia no mesmo padrão de quando um arquivo é
// baixado duas vezes ("nome" -> "nome_2" -> "nome_3"...). Se o nome de base
// já terminar em "_<numero>" (ex.: duplicar uma cópia já existente),
// continua a contagem a partir dali em vez de encadear "_2_2".
function nextDuplicateName(baseName: string, existingNames: string[]): string {
  const taken = new Set(existingNames);
  const match = baseName.match(/^(.*)_(\d+)$/);
  const stem = match ? match[1] : baseName;
  let n = match ? parseInt(match[2], 10) + 1 : 2;
  let candidate = `${stem}_${n}`;
  while (taken.has(candidate)) {
    n++;
    candidate = `${stem}_${n}`;
  }
  return candidate;
}

// "Simulações" reúne tudo que já foi cadastrado, de uma pessoa ou de várias
// — mesma lógica da Biblioteca reunindo todos os scripts. Criar e editar
// acontecem no assistente de 5 etapas (/testes-avatar/nova e
// /testes-avatar/[id]/editar, ver components/simulacao-wizard.tsx); aqui a
// tela lista, roda direto no card (acompanhando a conversa ao vivo e podendo
// parar) e permite rodar várias simulações salvas ao mesmo tempo. O modal de
// edição rápida que existia aqui saiu em 23/08/2026: um formulário só pros
// dois caminhos, a pedido da Isa.
export default function TestesAvatarPage() {
  const [tests, setTests] = useState<AvatarTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Arrastar-soltar pra reordenar os cards (21/09/2026, mesmo mecanismo da
  // Biblioteca em app/page.tsx).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<AvatarTest | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  // Arquivar (08/09/2026): a lista mostra ou as ativas ou as arquivadas,
  // nunca as duas juntas — o objetivo era justamente tirar as guardadas do
  // campo de visao. Nao vai pro sessionStorage de proposito: ao voltar pra
  // aba ela cai sempre nas ativas.
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [arquivandoId, setArquivandoId] = useState<string | null>(null);
  // O switch do card mostra o cadastro da aba "Avatares" (28/08/2026). Antes
  // era um mapa fixo no codigo mais os rotulos das simulacoes; hoje quem manda
  // e a aba, e o "Gerenciar avatares" que existiu por um dia no menu dos tres
  // pontinhos foi substituido por ela.
  const { avatares: avataresCadastrados, erro: erroAvatares } = useAvatares();
  // Troca de ambiente/avatar em andamento (o switch do card grava na propria
  // simulacao — ver mudarDestino).
  const [salvandoDestinoId, setSalvandoDestinoId] = useState<string | null>(null);
  // Etiqueta sendo marcada/desmarcada pelo "+" do card (04/09/2026).
  const [salvandoTagsId, setSalvandoTagsId] = useState<string | null>(null);
  // Copia recem-criada por "Duplicar": entra no topo da lista (a listagem vem
  // por created_at desc) e fica destacada por alguns segundos, pra nao se
  // perder no meio das outras — a copia so muda o nome pro proximo "_N", e no
  // resto e identica a original.
  const [novoId, setNovoId] = useState<string | null>(null);

  // --- Filtros e busca ---
  const [avatarFilter, setAvatarFilter] = usePersistedState<MultiFilter>("testesAvatar:avatarFilter", emptyFilter("OR"));
  const [ambienteFilter, setAmbienteFilter] = usePersistedState<MultiFilter>("testesAvatar:ambienteFilter", emptyFilter("OR"));
  const [tipoFilter, setTipoFilter] = usePersistedState<MultiFilter>("testesAvatar:tipoFilter", emptyFilter("OR"));
  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>("testesAvatar:tagFilter", emptyFilter("AND"));
  const [search, setSearch] = usePersistedState("testesAvatar:search", "");

  // --- Catálogo de etiquetas (mesmo catálogo com/cor usado na Biblioteca) ---
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  // --- Rodar direto no card (único e lote), com transcrição ao vivo ---
  const [runState, setRunState] = useState<Record<string, CardRunState>>({});
  // Flag de "Parar" por teste — checado no laço de execução (mesmo padrão do
  // loteAbortado do coisasdaisa). Não precisa ser estado React: só é lido
  // dentro dos laços assíncronos, nunca renderizado diretamente.
  const abortRefs = useRef<Record<string, boolean>>({});

  // --- Relatório da rodada que acabou de acontecer (04/09/2026) ---
  // Quais conversas entram no PDF, por simulação. Chave ausente = todas as
  // conversas daquela execução (o caso comum: rodou, clicou em emitir). O
  // array só passa a existir quando alguma caixinha é desmarcada.
  const [relatorioSel, setRelatorioSel] = useState<Record<string, string[]>>({});
  const [emitindoId, setEmitindoId] = useState<string | null>(null);

  // --- Seleção múltipla / rodar vários testes salvos ao mesmo tempo ---
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [maxTestesSimultaneos, setMaxTestesSimultaneos] = useState(3);
  const [runningSelected, setRunningSelected] = useState(false);

  function loadAll() {
    setLoading(true);
    setError(null);
    fetch("/api/avatar-tests")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTests(data.avatarTests);
      })
      .catch((e: any) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) setAvailableTags(data.tags);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".card-menu-wrap")) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  // Leva a copia recem-criada pra vista e apaga o destaque depois de 6s.
  useEffect(() => {
    if (!novoId) return;
    document.getElementById(`sim-${novoId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setNovoId(null), 6000);
    return () => clearTimeout(t);
  }, [novoId, tests]);

  const avatars = useMemo(() => Array.from(new Set(tests.map((t) => t.avatar))).sort(), [tests]);
  const ambientes = useMemo(() => Array.from(new Set(tests.map((t) => t.ambiente))).sort(), [tests]);
  const allTags = useMemo(() => Array.from(new Set(tests.flatMap((t) => t.tags))).sort(), [tests]);
  const arquivadasCount = tests.filter((t) => t.arquivada).length;

  const filtered = tests.filter((t) => {
    if (!!t.arquivada !== verArquivadas) return false;
    if (!matchesFilter([t.avatar], avatarFilter)) return false;
    if (!matchesFilter([t.ambiente], ambienteFilter)) return false;
    if (!matchesFilter([t.tipo || "unico"], tipoFilter)) return false;
    if (!matchesFilter(t.tags, tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${t.name} ${t.cenario} ${t.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Arquiva/desarquiva pelo menu do card. Otimista, mesmo padrao do switch de
  // destino e da etiqueta rapida: a simulacao some da lista na hora e volta
  // se o banco recusar.
  async function alternarArquivada(test: AvatarTest) {
    const arquivada = !test.arquivada;
    const antes = tests;
    setMenuOpenId(null);
    setTests((prev) => prev.map((t) => (t.id === test.id ? { ...t, arquivada } : t)));
    // Arquivada nao pode continuar marcada pra rodar em lote.
    if (arquivada) setSelectedIds((prev) => prev.filter((id) => id !== test.id));
    setArquivandoId(test.id);
    setError(null);
    try {
      const res = await fetch(`/api/avatar-tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivada }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setTests(antes);
      setError(e.message || String(e));
    } finally {
      setArquivandoId(null);
    }
  }

  function requestDelete(test: AvatarTest) {
    setMenuOpenId(null);
    setConfirmDelete(test);
  }

  async function confirmDeleteTest() {
    const test = confirmDelete;
    if (!test) return;
    setConfirmDelete(null);
    setDeletingId(test.id);
    try {
      const res = await fetch(`/api/avatar-tests/${test.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTests((prev) => prev.filter((t) => t.id !== test.id));
      setSelectedIds((prev) => prev.filter((id) => id !== test.id));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDeletingId(null);
    }
  }

  // Duplica um teste existente (único ou em lote): cria uma cópia com todos
  // os mesmos campos, só trocando o nome pro próximo "_N" livre — mesmo
  // padrão de quando um arquivo é baixado duas vezes. É o atalho pra quando a
  // simulação que ela quer já existe e só muda uma palavra (uma saudação
  // inicial diferente, por exemplo): copia e edita, em vez de refazer as
  // cinco etapas. A cópia entra no topo da lista, destacada por alguns
  // segundos, já pronta pra ser aberta em "Editar" e ajustada.
  async function duplicateTest(test: AvatarTest) {
    setMenuOpenId(null);
    setError(null);
    setDuplicatingId(test.id);
    try {
      const newName = nextDuplicateName(
        test.name,
        tests.map((t) => t.name)
      );
      const body = {
        name: newName,
        avatar: test.avatar,
        ambiente: test.ambiente,
        cenario: test.cenario,
        criterioSucesso: test.criterioSucesso,
        hostSlug: test.hostSlug,
        subSlug: test.subSlug,
        baseUrl: test.baseUrl,
        saudacaoInicial: test.saudacaoInicial,
        maxTurnos: test.maxTurnos,
        dadosFixos: test.dadosFixos,
        tela: test.tela,
        tags: test.tags,
        tipo: test.tipo,
        pessoas: test.pessoas,
        maxSimultaneos: test.maxSimultaneos,
        cenariosIndividuaisAtivo: test.cenariosIndividuaisAtivo,
        overridesPorPessoa: test.overridesPorPessoa,
        mensagensPorTurno: test.mensagensPorTurno,
        rodarRoteiroCompleto: test.rodarRoteiroCompleto,
        roteiroTurnos: test.roteiroTurnos,
        embaralharDados: test.embaralharDados,
      };
      const res = await fetch("/api/avatar-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      loadAll();
      if (data.avatarTest?.id) setNovoId(data.avatarTest.id);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setDuplicatingId(null);
    }
  }

  // Clique no switch do card: troca o ambiente (ou o avatar) DA PROPRIA
  // simulacao e grava. Nao existe copia por ambiente — uma simulacao e uma
  // so, e ambiente/avatar sao o parametro dela que varia (o mesmo site em
  // hml, stg ou prod continua sendo o mesmo site). Junto com o rotulo vai a
  // configuracao tecnica que ele significa (host slug, sub slug e a URL da
  // API da Zenta), do mapa em lib/destinos.ts — e a mesma coisa que a etapa 5
  // do assistente grava. Rotulo fora do mapa (avatar novo, cadastro antigo)
  // mantem a configuracao que a simulacao ja tinha, pra nao inventar destino.
  //
  // Cada dimensao mexe SO no que e dela: trocar de ambiente mexe na baseUrl,
  // trocar de avatar mexe em host slug e sub slug. Senao, um clique de hml
  // pra stg apagaria um sub slug digitado a mao (o mapa diz que "isa" nao tem
  // subavatar, mas quem manda no que foi digitado e ela).
  // Marca/desmarca uma etiqueta direto no card, pelo botao "+" no fim da linha
  // de etiquetas — sem abrir a tela de edicao (pedido da Isa em 04/09/2026).
  // Mesmo padrao otimista do switch de destino: a pilula aparece na hora e some
  // de novo se o banco recusar.
  async function alternarTag(test: AvatarTest, tag: string) {
    const tags = test.tags.includes(tag)
      ? test.tags.filter((t) => t !== tag)
      : [...test.tags, tag];

    const antes = tests;
    setTests((prev) => prev.map((t) => (t.id === test.id ? { ...t, tags } : t)));
    setSalvandoTagsId(test.id);
    setError(null);
    try {
      const res = await fetch(`/api/avatar-tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setTests(antes);
      setError(e.message || String(e));
    } finally {
      setSalvandoTagsId(null);
    }
  }

  async function mudarDestino(test: AvatarTest, dimensao: DimensaoDestino, valor: string) {
    const atual = dimensao === "ambiente" ? test.ambiente : test.avatar;
    if (atual.trim().toLowerCase() === valor.trim().toLowerCase()) return;

    const ambiente = dimensao === "ambiente" ? valor : test.ambiente;
    const avatar = dimensao === "avatar" ? valor : test.avatar;
    // Rotulo fora do mapa nao pode mais herdar o host slug do avatar
    // anterior (era isso que fazia a simulacao dizer "clienteexemplo" e continuar
    // mandando o host de outro avatar pro motor): configDoAvatarOuRotulo cai
    // no proprio rotulo, que e a convencao de slug da Zenta.
    const cfgAvatar =
      dimensao === "avatar" ? configDoAvatarOuRotulo(avatar, avataresCadastrados) : null;
    const patch = {
      ambiente,
      avatar,
      hostSlug: cfgAvatar?.hostSlug ?? test.hostSlug,
      subSlug: cfgAvatar ? cfgAvatar.subSlug ?? null : test.subSlug ?? null,
      baseUrl:
        dimensao === "ambiente" && ambienteConhecido(ambiente)
          ? baseUrlParaSalvar(ambiente)
          : test.baseUrl ?? null,
    };

    // Otimista: o switch anda na hora e volta atras se o banco recusar.
    const antes = tests;
    setTests((prev) =>
      prev.map((t) =>
        t.id === test.id
          ? { ...t, ...patch, subSlug: patch.subSlug ?? undefined, baseUrl: patch.baseUrl ?? undefined }
          : t
      )
    );
    setSalvandoDestinoId(test.id);
    setError(null);
    try {
      const res = await fetch(`/api/avatar-tests/${test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setTests(antes);
      setError(e.message || String(e));
    } finally {
      setSalvandoDestinoId(null);
    }
  }

  /**
   * Mesma logica de reorderScript em app/page.tsx: os vizinhos usados pra
   * calcular a nova posicao sao os vizinhos NA LISTA FILTRADA (`filtered`),
   * pra ordem sobreviver ao filtro (pedido 2 da Isa, 21/09/2026).
   */
  async function reorderTest(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const lista = filtered;
    const fromIndex = lista.findIndex((t) => t.id === draggedId);
    const toIndex = lista.findIndex((t) => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordenada = [...lista];
    const [movido] = reordenada.splice(fromIndex, 1);
    reordenada.splice(toIndex, 0, movido);
    const posFinal = reordenada.findIndex((t) => t.id === draggedId);
    const acima = reordenada[posFinal - 1];
    const abaixo = reordenada[posFinal + 1];

    let novaOrdem: number;
    if (acima && abaixo) novaOrdem = (acima.ordem + abaixo.ordem) / 2;
    else if (acima) novaOrdem = acima.ordem - 1;
    else if (abaixo) novaOrdem = abaixo.ordem + 1;
    else return;

    const antes = tests;
    setTests((prev) =>
      prev
        .map((t) => (t.id === draggedId ? { ...t, ordem: novaOrdem } : t))
        .sort((a, b) => b.ordem - a.ordem)
    );
    try {
      const res = await fetch(`/api/avatar-tests/${draggedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem: novaOrdem }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e: any) {
      setTests(antes);
      setError(e.message || String(e));
    }
  }

  // --- Rodar direto no card ---

  /**
   * MODO DEMO: monta o registro que emitirRelatorioDaExecucao guarda em
   * cache — os mesmos campos que lib/relatorioSimulacao.ts usa pra montar o
   * PDF — a partir da resposta que a própria rota /run já devolveu no fim da
   * conversa, sem precisar de um novo GET em /api/avatar-test-runs (ver
   * comentário em CardRunState.runRecord acima).
   */
  function montarRunRecordFinal(
    test: AvatarTest,
    final: Extract<ProxyResponse, { status?: undefined }>,
    personaNome?: string
  ): Partial<AvatarTestRun> | undefined {
    if (!final.runId) return undefined;
    return {
      id: final.runId,
      avatarTestId: test.id,
      personaNome: personaNome || test.name,
      resultado: final.resultado as AvatarTestRun["resultado"],
      totalTurnos: final.total_turnos,
      maxTurnos: final.max_turnos,
      tempoSegundos: final.tempo_segundos,
      transcricao: final.transcricao,
      embaralhamento: final.embaralhamento,
    };
  }

  async function runSingleTest(test: AvatarTest, destino?: DestinoExecucao) {
    abortRefs.current[test.id] = false;
    setRunState((prev) => ({ ...prev, [test.id]: { status: "rodando", liveTurns: [] } }));
    try {
      let data = await chamarProxy(test.id, { destino });
      while (data.status === "continuar") {
        const turno = data.ultimo_turno;
        const turnoAtual = data.turno_atual;
        const maxTurnosAtual = data.max_turnos;
        const conversationId = data.conversation_id;
        setRunState((prev) => {
          const atual = prev[test.id];
          const liveTurns = turno ? [...(atual?.liveTurns || []), turno] : atual?.liveTurns || [];
          return {
            ...prev,
            [test.id]: { status: "rodando", liveTurns, conversationId, maxTurnos: maxTurnosAtual, totalTurnos: turnoAtual },
          };
        });

        if (abortRefs.current[test.id]) {
          const final = await chamarProxy(test.id, { conversationId, encerrar: true, destino });
          setRunState((prev) => ({
            ...prev,
            [test.id]: {
              status: "concluido",
              liveTurns: final.status === "continuar" ? prev[test.id]?.liveTurns : final.transcricao || prev[test.id]?.liveTurns,
              resultado: final.status === "continuar" ? "ENCERRADO" : final.resultado,
              totalTurnos: final.status === "continuar" ? turnoAtual : final.total_turnos,
              maxTurnos: maxTurnosAtual,
              ...(final.status === "continuar"
                ? {}
                : { runId: final.runId, runRecord: montarRunRecordFinal(test, final) }),
            },
          }));
          return;
        }

        data = await chamarProxy(test.id, { conversationId, destino });
      }
      setRunState((prev) => ({
        ...prev,
        [test.id]: {
          status: "concluido",
          liveTurns: data.transcricao || prev[test.id]?.liveTurns,
          resultado: data.resultado,
          totalTurnos: data.total_turnos,
          maxTurnos: data.max_turnos,
          runId: data.runId,
          runRecord: montarRunRecordFinal(test, data),
        },
      }));
    } catch (e: any) {
      setRunState((prev) => ({ ...prev, [test.id]: { status: "erro", erro: e.message || String(e) } }));
    }
  }

  function pararSingleTest(test: AvatarTest) {
    abortRefs.current[test.id] = true;
  }

  function updateLotePessoa(testId: string, idx: number, updater: (p: LotePessoaProgress) => LotePessoaProgress) {
    setRunState((prev) => {
      const atual = prev[testId];
      if (!atual || !atual.lotePessoas) return prev;
      const lista = atual.lotePessoas.slice();
      lista[idx] = updater(lista[idx]);
      return { ...prev, [testId]: { ...atual, lotePessoas: lista } };
    });
  }

  async function runLoteTest(test: AvatarTest, destino?: DestinoExecucao) {
    const pessoas = (test.pessoas || []).map(pessoaDoLoteParaLinha);
    if (pessoas.length === 0) {
      setRunState((prev) => ({
        ...prev,
        [test.id]: { status: "erro", erro: "Nenhuma pessoa configurada nesse lote." },
      }));
      return;
    }
    abortRefs.current[test.id] = false;
    const limite = Math.max(1, Math.min(test.maxSimultaneos || 5, pessoas.length));
    const inicial: LotePessoaProgress[] = pessoas.map((p) => ({ nome: p.nome, status: "fila", turns: [] }));
    setRunState((prev) => ({
      ...prev,
      [test.id]: { status: "rodando", lotePessoas: inicial, loteConcluidos: 0, loteTotal: pessoas.length },
    }));

    let proximo = 0;
    let concluidos = 0;

    function marcarConcluido() {
      concluidos++;
      setRunState((prev) => ({ ...prev, [test.id]: { ...prev[test.id], loteConcluidos: concluidos } }));
    }

    async function worker() {
      while (proximo < pessoas.length) {
        if (abortRefs.current[test.id]) return;
        const idx = proximo++;
        updateLotePessoa(test.id, idx, (p) => ({ ...p, status: "rodando" }));
        try {
          let data = await chamarProxy(test.id, { pessoa: pessoas[idx], pessoaIndex: idx, destino });
          while (data.status === "continuar") {
            const turno = data.ultimo_turno;
            const turnoAtual = data.turno_atual;
            const maxTurnosAtual = data.max_turnos;
            updateLotePessoa(test.id, idx, (p) => ({
              ...p,
              status: "rodando",
              turno: turnoAtual,
              maxTurnos: maxTurnosAtual,
              turns: turno ? [...p.turns, turno] : p.turns,
            }));

            if (abortRefs.current[test.id]) {
              // Não chama marcarConcluido() aqui — o "finally" logo abaixo já
              // conta essa pessoa. Contar nos dois lugares foi o bug do "6 de
              // 3 concluídos" (dobrava a contagem de cada pessoa interrompida
              // no meio de um turno).
              updateLotePessoa(test.id, idx, (p) => ({ ...p, status: "INTERROMPIDO" }));
              return;
            }

            data = await chamarProxy(test.id, { pessoa: pessoas[idx], conversationId: data.conversation_id, destino });
          }
          updateLotePessoa(test.id, idx, (p) => ({
            ...p,
            status: (data.resultado as LotePessoaStatus) || "ENCERRADO",
            turno: data.total_turnos,
            maxTurnos: data.max_turnos,
            turns: data.transcricao || p.turns,
            runId: data.runId,
            runRecord: montarRunRecordFinal(test, data, p.nome),
          }));
        } catch (e: any) {
          updateLotePessoa(test.id, idx, (p) => ({
            ...p,
            status: "ERRO",
            erro: e?.message || String(e),
          }));
        } finally {
          marcarConcluido();
        }
      }
    }

    await Promise.all(Array.from({ length: limite }, () => worker()));
    setRunState((prev) => ({ ...prev, [test.id]: { ...prev[test.id], status: "concluido" } }));
  }

  function pararLoteTest(test: AvatarTest) {
    abortRefs.current[test.id] = true;
  }

  function runTest(test: AvatarTest, destino?: DestinoExecucao) {
    return test.tipo === "lote" ? runLoteTest(test, destino) : runSingleTest(test, destino);
  }

  function pararTest(test: AvatarTest) {
    return test.tipo === "lote" ? pararLoteTest(test) : pararSingleTest(test);
  }

  // --- Relatório da execução que acabou de rodar ---

  /**
   * As conversas desta execução que dá pra colocar num relatório: as que
   * chegaram ao fim e viraram linha em avatar_test_runs (a rota /run devolve
   * o `runId` junto do relatório final). Pessoa com "Erro" não entra — não
   * existe execução gravada pra ela.
   */
  function conversasRelatorio(test: AvatarTest, run?: CardRunState): { runId: string; nome: string }[] {
    if (!run) return [];
    if (test.tipo === "lote") {
      return (run.lotePessoas || [])
        .filter((p) => !!p.runId)
        .map((p) => ({ runId: p.runId as string, nome: p.nome }));
    }
    return run.runId ? [{ runId: run.runId, nome: test.name }] : [];
  }

  /** Marcadas agora — sem nada guardado, valem todas. */
  function selecionadasRelatorio(testId: string, disponiveis: { runId: string }[]): string[] {
    const guardado = relatorioSel[testId];
    if (!guardado) return disponiveis.map((c) => c.runId);
    return guardado.filter((id) => disponiveis.some((c) => c.runId === id));
  }

  function toggleConversaRelatorio(testId: string, runId: string, disponiveis: { runId: string }[]) {
    setRelatorioSel((prev) => {
      const atuais = prev[testId] ?? disponiveis.map((c) => c.runId);
      const proximas = atuais.includes(runId)
        ? atuais.filter((id) => id !== runId)
        : [...atuais, runId];
      return { ...prev, [testId]: proximas };
    });
  }

  /**
   * MODO DEMO: pega os registros já devolvidos pela própria rota /run e
   * guardados no card (CardRunState.runRecord / LotePessoaProgress.runRecord)
   * pros ids escolhidos. Isto evita depender de um novo GET no histórico:
   * sem um banco de verdade por trás (só memória do processo), esse GET
   * pode cair numa instância serverless da Vercel que nunca viu essa
   * execução — cada instância "fria" tem sua própria memória — e voltar
   * vazio mesmo a execução tendo acabado de rodar com sucesso.
   */
  function runRecordsCacheados(run: CardRunState | undefined, ids: string[]): Map<string, AvatarTestRun> {
    const mapa = new Map<string, AvatarTestRun>();
    if (!run) return mapa;
    const candidatos = run.lotePessoas ? run.lotePessoas.map((p) => p.runRecord) : [run.runRecord];
    for (const rec of candidatos) {
      if (rec?.id && ids.includes(rec.id)) mapa.set(rec.id, rec as AvatarTestRun);
    }
    return mapa;
  }

  /**
   * Monta o PDF das execuções escolhidas. Usa primeiro o que o próprio card
   * já tem em memória (ver runRecordsCacheados) e só busca no histórico do
   * servidor os ids que, por algum motivo, não vieram cacheados — ver
   * comentário acima sobre por que essa busca sozinha não é confiável nesta
   * demo.
   */
  async function emitirRelatorioDaExecucao(test: AvatarTest, run?: CardRunState) {
    const disponiveis = conversasRelatorio(test, run);
    const escolhidas = selecionadasRelatorio(test.id, disponiveis);
    if (escolhidas.length === 0) return;
    setEmitindoId(test.id);
    setError(null);
    try {
      const cache = runRecordsCacheados(run, escolhidas);
      const faltando = escolhidas.filter((id) => !cache.has(id));
      if (faltando.length > 0) {
        const res = await fetch(`/api/avatar-test-runs?avatarTestId=${test.id}&limit=200`);
        const data = await res.json();
        if (!data.error) {
          for (const r of (data.runs as AvatarTestRun[]) || []) {
            if (faltando.includes(r.id)) cache.set(r.id, r);
          }
        }
      }
      const runs = escolhidas.map((id) => cache.get(id)).filter((r): r is AvatarTestRun => !!r);
      if (runs.length === 0) throw new Error("As execuções escolhidas não foram encontradas no histórico.");
      await gerarRelatorioSimulacaoPdf({
        runs,
        testsById: new Map([[test.id, test]]),
        titulo: "Relatório da execução",
        subtitulo: `Simulação "${test.name}"`,
      });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setEmitindoId(null);
    }
  }

  // Some o histórico/transcrição da execução do card — só disponível depois
  // que o teste (ou lote) termina, pra nunca esconder uma execução em
  // andamento e correr o risco de disparar duas ao mesmo tempo sem perceber.
  function fecharRun(testId: string) {
    setRunState((prev) => {
      const next = { ...prev };
      delete next[testId];
      return next;
    });
    setRelatorioSel((prev) => {
      const next = { ...prev };
      delete next[testId];
      return next;
    });
  }

  // --- Seleção múltipla / rodar vários testes salvos ao mesmo tempo ---

  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelectedIds([]);
      return !prev;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((t) => t.id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((t) => selectedIds.includes(t.id));

  async function runSelected() {
    // Simulacao com avatar desativado fica de fora do lote, pelo mesmo motivo
    // que o botao dela fica travado: aquele avatar nao e opcao pra rodar agora.
    const selecionadas = tests.filter((t) => selectedIds.includes(t.id));
    const bloqueadas = selecionadas.filter((t) => avatarDesativado(t.avatar, avataresCadastrados));
    const toRun = selecionadas.filter((t) => !avatarDesativado(t.avatar, avataresCadastrados));
    if (bloqueadas.length > 0) {
      setError(
        bloqueadas.length === 1
          ? `"${bloqueadas[0].name}" ficou de fora: o avatar "${bloqueadas[0].avatar}" está desativado na aba Avatares.`
          : `${bloqueadas.length} simulações ficaram de fora: o avatar delas está desativado na aba Avatares.`
      );
    }
    if (toRun.length === 0) return;
    setRunningSelected(true);
    let proximo = 0;
    const limite = Math.max(1, Math.min(maxTestesSimultaneos, toRun.length));

    async function worker() {
      while (proximo < toRun.length) {
        const t = toRun[proximo++];
        // Mesmo destino que o botao do card manda: a configuracao atual da
        // propria simulacao, so pra ficar gravada no historico da execucao.
        await runTest(t, {
          avatar: t.avatar,
          ambiente: t.ambiente,
          hostSlug: t.hostSlug,
          subSlug: t.subSlug ?? null,
          baseUrl: t.baseUrl ?? null,
        });
      }
    }

    await Promise.all(Array.from({ length: limite }, () => worker()));
    setRunningSelected(false);
  }

  return (
    <div>

      <div className="page-header-row">
        <div>
          <h1>Simulações</h1>
          <p className="subtitle">
            Todas as simulações cadastradas, de uma pessoa ou de várias. Criar passa por cinco etapas —
            quem conversa, o que conversa, como conversa, como os dados chegam e como ela se chama.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`btn-secondary select-toggle-btn${selectMode ? " active" : ""}`}
            onClick={toggleSelectMode}
          >
            {selectMode ? "Cancelar seleção" : "Selecionar vários"}
          </button>
          <Link href="/testes-avatar/nova" className="btn btn-primary">
            + Nova simulação
          </Link>
        </div>
      </div>

      <div className="filters">
        <FilterPopover
          label="Avatar"
          options={avatars.map((a) => ({ name: a }))}
          filter={avatarFilter}
          onChange={setAvatarFilter}
          onClear={() => setAvatarFilter(emptyFilter("OR"))}
        />
        <FilterPopover
          label="Ambiente"
          options={ambientes.map((a) => ({ name: a }))}
          filter={ambienteFilter}
          onChange={setAmbienteFilter}
          onClear={() => setAmbienteFilter(emptyFilter("OR"))}
        />
        <FilterPopover
          label="Tipo"
          options={[{ name: "unico" }, { name: "lote" }]}
          filter={tipoFilter}
          formatOption={(v) => (v === "lote" ? "Mais de uma pessoa" : "Uma pessoa só")}
          onChange={setTipoFilter}
          onClear={() => setTipoFilter(emptyFilter("OR"))}
          searchable={false}
        />
        <FilterPopover
          label="Etiqueta"
          options={allTags.map((t) => ({ name: t }))}
          filter={tagFilter}
          onChange={setTagFilter}
          onClear={() => setTagFilter(emptyFilter("AND"))}
        />
        <input
          placeholder="Buscar por nome, cenário ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* Entrada pras simulacoes guardadas: so aparece quando existe alguma
            arquivada (ou quando ja estamos olhando pra elas). */}
        {(arquivadasCount > 0 || verArquivadas) && (
          <button
            type="button"
            className={`btn-secondary${verArquivadas ? " active" : ""}`}
            onClick={() => setVerArquivadas((v) => !v)}
            title={
              verArquivadas
                ? "Voltar para as simulações ativas"
                : "Ver as simulações que você arquivou"
            }
          >
            {verArquivadas ? "Voltar às ativas" : `Arquivadas (${arquivadasCount})`}
          </button>
        )}
      </div>

      {selectMode && filtered.length > 0 && (
        <label className="select-all-row">
          <input
            type="checkbox"
            className="card-checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
          />
          Selecionar todos os visíveis ({filtered.length})
        </label>
      )}

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && tests.length === 0 && (
        <p className="empty">
          Nenhuma simulação cadastrada ainda. Clique em "Nova simulação" pra criar a primeira.
        </p>
      )}
      {!loading && !error && tests.length > 0 && filtered.length === 0 && (
        <p className="empty">
          {verArquivadas
            ? arquivadasCount === 0
              ? "Nenhuma simulação arquivada. Use \u201cArquivar\u201d no menu do card pra guardar uma sem apagar."
              : "Nenhuma simulação arquivada encontrada com esses filtros."
            : "Nenhuma simulação encontrada com esses filtros."}
        </p>
      )}

      {filtered.map((test) => {
        const isSelected = selectedIds.includes(test.id);
        // Onde esta rodada vai acontecer: a configuracao da propria simulacao,
        // do jeito que o switch deixou. Vai junto na chamada so pra ficar
        // gravada no historico daquela execucao (ver chamarProxy).
        const destinoExec: DestinoExecucao = {
          avatar: test.avatar,
          ambiente: test.ambiente,
          hostSlug: test.hostSlug,
          subSlug: test.subSlug ?? null,
          baseUrl: test.baseUrl ?? null,
        };
        const run = runState[test.id];
        const rodando = run?.status === "rodando";
        // Conversas desta execução que podem virar relatório, e quais estão
        // marcadas agora (ver conversasRelatorio/selecionadasRelatorio).
        const conversasDoRelatorio = conversasRelatorio(test, run);
        const relatorioMarcadas = selecionadasRelatorio(test.id, conversasDoRelatorio);
        // Simulação recém-criada nasce sem destino (o assistente não pergunta
        // mais isso desde 02/09/2026): antes do primeiro "Rodar" ela precisa
        // escolher ambiente e avatar aqui no switch.
        const semDestino = !test.ambiente.trim() || !test.avatar.trim();
        // Avatar desligado na aba "Avatares" (03/09/2026): a simulacao continua
        // apontada pra ele, mas ele saiu do switch e nao roda ate ser reativado
        // la ou trocado aqui.
        const avatarInativo = avatarDesativado(test.avatar, avataresCadastrados);
        return (
          <div
            className={`card${isSelected ? " selected" : ""}${novoId === test.id ? " recem-criada" : ""}${dragId === test.id ? " dragging" : ""}${dragOverId === test.id && dragId && dragId !== test.id ? " drag-over" : ""}`}
            key={test.id}
            id={`sim-${test.id}`}
            style={{ flexDirection: "column", alignItems: "stretch" }}
            onDragOver={(e) => {
              if (!dragId || dragId === test.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverId !== test.id) setDragOverId(test.id);
            }}
            onDragLeave={() => {
              setDragOverId((prev) => (prev === test.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== test.id) reorderTest(dragId, test.id);
              setDragId(null);
              setDragOverId(null);
            }}
          >
            <div className="card-head-row">
              <span
                className="drag-handle"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(test.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                title="Arrastar pra reordenar"
                aria-label={`Arrastar ${test.name} pra reordenar`}
              >
                <IconGripVertical size={16} />
              </span>
              <div className="card-main">
                {selectMode && (
                  <input
                    type="checkbox"
                    className="card-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(test.id)}
                    aria-label={`Selecionar ${test.name}`}
                  />
                )}
                <div className="card-info">
                  <h3 className="card-title-ellipsis">
                    <Link href={`/testes-avatar/${test.id}`} title={test.name}>
                      {test.name}
                    </Link>
                    {/* A contagem de pessoas aparece SEMPRE que houver pessoa,
                        inclusive "1 pessoa" (pedido da Isa em 03/09/2026: sem a
                        pilula, um card de uma pessoa parecia um card sem
                        informacao). Nao depende de `tipo`: simulacao antiga
                        salva como "unico" escondia a contagem sem motivo. */}
                    {(test.pessoas?.length ?? 0) > 0 && (
                      <span
                        className="tag"
                        style={{ background: "var(--accent-soft)", color: "var(--accent-dark)" }}
                      >
                        {test.pessoas?.length} {test.pessoas?.length === 1 ? "pessoa" : "pessoas"}
                      </span>
                    )}
                  </h3>
                  <DestinoSwitch
                    test={test}
                    ambientesUsados={ambientes}
                    avataresUsados={avatars}
                    avatares={avataresCadastrados}
                    disabled={rodando || salvandoDestinoId === test.id}
                    onSelect={(dimensao, valor) => mudarDestino(test, dimensao, valor)}
                  />
                  {/* A linha de etiquetas existe sempre, mesmo sem etiqueta
                      nenhuma: o "+" no fim dela e o atalho pra etiquetar sem
                      abrir "Editar" (04/09/2026). */}
                  <div className="tags" style={{ marginTop: 6, alignItems: "center" }}>
                    {sortTagsByColor(test.tags, (t) => availableTags.find((at) => at.name === t)?.color).map((t) => (
                      <span className="tag" style={tagPillStyle(availableTags.find((at) => at.name === t)?.color)} key={t}>
                        {t}
                      </span>
                    ))}
                    <TagQuickAdd
                      options={availableTags}
                      selected={test.tags}
                      onToggle={(t) => alternarTag(test, t)}
                      onCatalogChange={(tags) => setAvailableTags(tags)}
                      disabled={salvandoTagsId === test.id}
                    />
                  </div>
                </div>
              </div>

              {/* Botões de ação + menu de reticências na mesma linha, com o
                  menu como último item — evita tanto a sobreposição de antes
                  quanto a faixa em branco de reservar uma linha só pra ele. */}
              <div className="actions">
                {rodando ? (
                  <button className="btn-secondary" onClick={() => pararTest(test)}>
                    Parar
                  </button>
                ) : avatarInativo ? (
                  <button
                    className="btn-primary"
                    disabled
                    title={`O avatar "${test.avatar}" está desativado na aba Avatares. Ative ele lá ou escolha outro avatar no switch acima.`}
                  >
                    Avatar desativado
                  </button>
                ) : semDestino ? (
                  <button
                    className="btn-primary"
                    disabled
                    title={
                      !test.ambiente.trim() && !test.avatar.trim()
                        ? "Escolha o ambiente e o avatar no switch acima."
                        : !test.ambiente.trim()
                          ? "Escolha o ambiente no switch acima."
                          : "Escolha o avatar no switch acima."
                    }
                  >
                    {!test.ambiente.trim() && !test.avatar.trim()
                      ? "Escolha ambiente e avatar"
                      : !test.ambiente.trim()
                        ? "Escolha o ambiente"
                        : "Escolha o avatar"}
                  </button>
                ) : (
                  <button className="btn-primary" onClick={() => runTest(test, destinoExec)}>
                    Rodar em {test.ambiente}
                  </button>
                )}
                <Link href={`/testes-avatar/${test.id}`} className="btn btn-secondary">
                  Abrir
                </Link>
                <Link href={`/testes-avatar/${test.id}/editar`} className="btn btn-secondary btn-with-icon">
                  <IconPencil size={13} /> Editar
                </Link>
                <div className="card-menu-wrap" style={{ position: "relative", top: 0, right: 0 }}>
                  <button
                    className="card-menu-btn"
                    onClick={() => setMenuOpenId((prev) => (prev === test.id ? null : test.id))}
                    title="Mais opções"
                    aria-label="Mais opções"
                  >
                    <IconDots size={17} />
                  </button>
                  {menuOpenId === test.id && (
                    <div className="card-menu">
                      <button
                        className="card-menu-item"
                        disabled={duplicatingId === test.id}
                        onClick={() => duplicateTest(test)}
                      >
                        {duplicatingId === test.id ? "Duplicando..." : "Duplicar"}
                      </button>
                      <button
                        className="card-menu-item"
                        disabled={arquivandoId === test.id}
                        onClick={() => alternarArquivada(test)}
                        title={
                          test.arquivada
                            ? "Volta pra lista de simulações"
                            : "Some da lista sem apagar — as execuções antigas continuam no Relatório"
                        }
                      >
                        {arquivandoId === test.id
                          ? test.arquivada
                            ? "Desarquivando..."
                            : "Arquivando..."
                          : test.arquivada
                            ? "Desarquivar"
                            : "Arquivar"}
                      </button>
                      <button
                        className="card-menu-item card-menu-item-danger"
                        disabled={deletingId === test.id}
                        onClick={() => requestDelete(test)}
                      >
                        {deletingId === test.id ? "Apagando..." : "Apagar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {run && test.tipo !== "lote" && (() => {
              // MODO DEMO (pedido da Isa, 22/09/2026): teste único usa o
              // mesmo cartão que o lote usa por pessoa — em vez de manter
              // dois jeitos de mostrar uma conversa, trata o teste único como
              // um "lote de 1" e reaproveita exatamente a mesma marcação
              // (.lote-card, .lote-status-pill etc.) e as mesmas funções
              // (labelStatusPessoa/pillClassForStatus) do bloco de lote logo
              // abaixo, pra layout nunca mais divergir entre os dois.
              const pessoa: LotePessoaProgress = {
                nome: test.name,
                status:
                  run.status === "rodando" ? "rodando" : run.status === "erro" ? "ERRO" : ((run.resultado as LotePessoaStatus) || "ENCERRADO"),
                turno: run.totalTurnos,
                maxTurnos: run.maxTurnos,
                turns: run.liveTurns || [],
                runId: run.runId,
                erro: run.erro,
              };
              const loteConcluidosUnico = rodando ? 0 : 1;
              return (
                <div className="panel" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <p className="checklist-summary" style={{ margin: 0 }}>
                      {loteConcluidosUnico} de 1 concluídos
                      {!rodando && conversasDoRelatorio.length > 0 && (
                        <span className="run-report-count">
                          {" · "}
                          {relatorioMarcadas.length} de {conversasDoRelatorio.length} no relatório
                        </span>
                      )}
                    </p>
                    <div className="run-report-actions">
                      {!rodando && conversasDoRelatorio.length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={emitindoId === test.id}
                          onClick={() => emitirRelatorioDaExecucao(test, run)}
                        >
                          {emitindoId === test.id ? "Gerando PDF..." : "Emitir relatório"}
                        </button>
                      )}
                      {!rodando && (
                        <button
                          type="button"
                          className="btn-ghost"
                          title="Fechar"
                          aria-label="Fechar histórico da execução"
                          onClick={() => fecharRun(test.id)}
                        >
                          <IconX size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="lote-card-grid">
                    <div className="lote-card">
                      <div className="lote-card-header">
                        {!rodando && pessoa.runId ? (
                          <label className="lote-card-pick" title="Incluir esta conversa no relatório">
                            <input
                              type="checkbox"
                              checked={relatorioMarcadas.includes(pessoa.runId)}
                              onChange={() =>
                                toggleConversaRelatorio(test.id, pessoa.runId as string, conversasDoRelatorio)
                              }
                            />
                            <span className="lote-card-name">{pessoa.nome}</span>
                          </label>
                        ) : (
                          <span className="lote-card-name">{pessoa.nome}</span>
                        )}
                        <span className={`lote-status-pill ${pillClassForStatus(pessoa.status)}`}>
                          {labelStatusPessoa(pessoa)}
                        </span>
                      </div>
                      {pessoa.status === "ERRO" && pessoa.erro && (
                        <p className="lote-card-erro" title={pessoa.erro}>
                          {pessoa.erro}
                        </p>
                      )}
                      {pessoa.turns.length > 0 && (
                        <div className="lote-card-transcript">
                          {pessoa.turns.map((t) => (
                            <div key={t.turno}>
                              <div className="lote-turn-enviado">➜ {t.enviado} <ListaAnexos anexos={t.anexos} /></div>
                              <div className="lote-turn-resposta">⇐ {t.resposta_avatar}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {run && test.tipo === "lote" && run.lotePessoas && (
              <div className="panel" style={{ marginTop: 12, marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <p className="checklist-summary" style={{ margin: 0 }}>
                    {run.loteConcluidos ?? 0} de {run.loteTotal ?? 0} concluídos
                    {!rodando && conversasDoRelatorio.length > 0 && (
                      <span className="run-report-count">
                        {" · "}
                        {relatorioMarcadas.length} de {conversasDoRelatorio.length} no relatório
                      </span>
                    )}
                  </p>
                  <div className="run-report-actions">
                    {!rodando && conversasDoRelatorio.length > 0 && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={emitindoId === test.id || relatorioMarcadas.length === 0}
                        onClick={() => emitirRelatorioDaExecucao(test, run)}
                      >
                        {emitindoId === test.id
                          ? "Gerando PDF..."
                          : `Emitir relatório (${relatorioMarcadas.length})`}
                      </button>
                    )}
                    {!rodando && (
                      <button
                        type="button"
                        className="btn-ghost"
                        title="Fechar"
                        aria-label="Fechar histórico da execução"
                        onClick={() => fecharRun(test.id)}
                      >
                        <IconX size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="lote-card-grid">
                  {run.lotePessoas.map((p, idx) => (
                    <div className="lote-card" key={idx}>
                      <div className="lote-card-header">
                        {!rodando && p.runId ? (
                          <label className="lote-card-pick" title="Incluir esta conversa no relatório">
                            <input
                              type="checkbox"
                              checked={relatorioMarcadas.includes(p.runId)}
                              onChange={() =>
                                toggleConversaRelatorio(test.id, p.runId as string, conversasDoRelatorio)
                              }
                            />
                            <span className="lote-card-name">{p.nome}</span>
                          </label>
                        ) : (
                          <span className="lote-card-name">{p.nome}</span>
                        )}
                        <span className={`lote-status-pill ${pillClassForStatus(p.status)}`}>
                          {labelStatusPessoa(p)}
                        </span>
                      </div>
                      {p.status === "ERRO" && p.erro && (
                        <p className="lote-card-erro" title={p.erro}>
                          {p.erro}
                        </p>
                      )}
                      {p.turns.length > 0 && (
                        <div className="lote-card-transcript">
                          {p.turns.map((t) => (
                            <div key={t.turno}>
                              <div className="lote-turn-enviado">➜ {t.enviado} <ListaAnexos anexos={t.anexos} /></div>
                              <div className="lote-turn-resposta">⇐ {t.resposta_avatar}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selectMode && selectedIds.length > 0 && (
        <div className="batch-bar">
          <div className="batch-bar-top">
            <div className="batch-count">
              <span>{selectedIds.length}</span> selecionado{selectedIds.length > 1 ? "s" : ""}
            </div>
            <div className="batch-actions">
              <label className="checkbox-row" style={{ fontSize: 13 }}>
                Máx. simultâneos
                <input
                  type="number"
                  min={1}
                  className="workers-input"
                  value={maxTestesSimultaneos}
                  onChange={(e) => setMaxTestesSimultaneos(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <button type="button" className="btn-primary" disabled={runningSelected} onClick={runSelected}>
                {runningSelected ? "Rodando..." : `Rodar selecionados (${selectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Apagar a simulação "{confirmDelete.name}"? O histórico de execuções dela também será
              perdido.
            </h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmDeleteTest}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {erroAvatares && (
        <p className="status-msg err" style={{ marginTop: 12 }}>
          Cadastro de avatares: {erroAvatares}
        </p>
      )}

    </div>
  );
}
