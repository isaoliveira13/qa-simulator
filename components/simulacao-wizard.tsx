"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck } from "@/app/icons";
import {
  AvatarTest,
  EmbaralharConfig,
  Persona,
  PessoaDoLote,
  Scenario,
  Tag,
  TrocaEmbaralhada,
  TurnoRoteiro,
} from "@/lib/types";
import {
  normalizarRoteiro,
  roteiroTemConteudo,
  turnoVazio,
  ultimoTurnoDoRoteiro,
} from "@/lib/roteiroTurnos";
import { PessoaLinha, parsePessoas, pessoaDoLoteParaLinha, pessoasParaTexto } from "@/lib/loteText";
import { gerarPessoaFicticia } from "@/lib/fakePerson";
import {
  pessoaLinhaParaDados,
  preencherTemplate,
  resolverDadosPessoa,
  TEMPLATE_CENARIO_PADRAO,
} from "@/lib/personaTemplate";
import { PersonaPickerModal } from "@/components/persona-picker";
import { AnexosTurnoEditor } from "@/components/anexos-turno";
import { anexosDaLinha } from "@/lib/anexosTurno";
import { ScenarioPickerModal } from "@/components/scenario-picker";
import { CenarioActions } from "@/components/cenario-actions";
import { TagPopover } from "@/components/tag-popover";
import { tagPillStyle } from "@/lib/tagColor";
import {
  CampoEmbaralhavel,
  CONFIG_EMBARALHAR_PADRAO,
  catalogoDeCampos,
  chavesLivresDoTexto,
  embaralharDados as aplicarEmbaralhamento,
  normalizarConfigEmbaralhar,
  resumirEmbaralhamento,
  rotuloDaChave,
} from "@/lib/embaralhar";

const ETAPAS = ["Pessoas", "Cenário", "Turnos", "Dados", "Identificação"] as const;

/** Máximo de turnos de uma conversa sem roteiro (switch de turnos desligado). */
const MAX_TURNOS_SEM_ROTEIRO = 10;

const PESSOA_VAZIA: PessoaLinha = {
  nome: "",
  cpf: "",
  telefone: "",
  genero: "",
  email: "",
  nascimento: "",
  cidade: "",
  campoExtraNome: "",
  campoExtraValor: "",
};

/**
 * Uma vaga da simulação: quem conversa, de onde essa pessoa veio, e qual
 * cenário vale pra ela. `modoCenario` é o que a tabela da etapa 2 mostra na
 * coluna "vem de":
 *   - "simulacao": usa o cenário da simulação (o comportamento normal);
 *   - "persona": usa o cenário próprio que a persona escolhida trouxe;
 *   - "proprio": um cenário escrito só pra essa pessoa nesta simulação.
 * Na hora de salvar, "persona" e "proprio" viram overridesPorPessoa — o
 * motor de execução (app/api/avatar-tests/run) não precisou mudar nada.
 */
type Slot = {
  preenchido: boolean;
  origem: "persona" | "ficticia" | "manual";
  personaId?: string;
  dados: PessoaLinha;
  cenarioPersona?: string;
  criterioPersona?: string;
  modoCenario: "simulacao" | "persona" | "proprio";
  cenarioProprio?: string;
  criterioProprio?: string;
};

/**
 * Uma origem de cenário concorrendo pelo mesmo campo na etapa 2 (ver painel
 * de conflito). Guardadas numa lista, não num objeto de chaves fixas: cada
 * cenário salvo escolhido entra com a própria chave (`salvo:<id>`), senão o
 * segundo que você escolhesse apagaria o primeiro em silêncio — justamente o
 * que esta etapa existe pra evitar.
 */
type Fonte = { key: string; label: string; cenario: string; criterio: string };

function slotVazio(): Slot {
  return { preenchido: false, origem: "manual", dados: { ...PESSOA_VAZIA }, modoCenario: "simulacao" };
}

function slotFicticio(): Slot {
  const p = gerarPessoaFicticia();
  return {
    preenchido: true,
    origem: "ficticia",
    dados: { ...p, campoExtraNome: "", campoExtraValor: "" },
    modoCenario: "simulacao",
  };
}

function slotDePersona(p: Persona): Slot {
  const d = resolverDadosPessoa(p);
  return {
    preenchido: true,
    origem: "persona",
    personaId: p.id,
    dados: {
      nome: d.nome,
      cpf: d.cpf,
      telefone: d.telefone,
      genero: d.genero,
      email: d.email,
      nascimento: d.nascimento,
      cidade: d.cidade,
      campoExtraNome: d.campo_extra_nome,
      campoExtraValor: d.campo_extra_valor,
    },
    ...(p.cenario ? { cenarioPersona: p.cenario } : {}),
    ...(p.criterioSucesso ? { criterioPersona: p.criterioSucesso } : {}),
    modoCenario: p.cenario ? "persona" : "simulacao",
  };
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function resumoDados(p: PessoaLinha) {
  return [p.cpf, p.telefone, p.cidade].filter(Boolean).join(" · ") || "sem dados extras";
}

function preview(texto: string, max = 90) {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return "—";
  return limpo.length > max ? limpo.slice(0, max).trimEnd() + "…" : limpo;
}

type Props = {
  /** Simulação existente, quando o assistente está sendo usado pra editar. */
  initial?: AvatarTest | null;
  /** Chamado depois de salvar. */
  onSaved: (test: AvatarTest) => void;
  onCancel: () => void;
  /**
   * Etapa em que o assistente abre (0 a 4). Serve pros atalhos "Editar" de
   * cada bloco da ficha da simulacao (app/testes-avatar/[id]), que caem
   * direto na etapa daquele assunto em vez de sempre na primeira.
   */
  etapaInicial?: number;
};

/**
 * Assistente de simulação em 5 etapas (23/08/2026) — substitui o antigo
 * "Estúdio de testes", que era um formulário único com tudo junto e ainda
 * obrigava a escolher "teste único" ou "teste em lote" antes de começar.
 * Aqui a etapa 1 pergunta quantas pessoas: uma pessoa é só um lote de uma,
 * então toda simulação criada por aqui é salva como tipo "lote" (com
 * `pessoas` preenchido), que é o único caminho de execução que resolve os
 * placeholders {nome}/{cpf} com os dados de cada pessoa.
 *
 * O mesmo componente cria (/testes-avatar/nova) e edita
 * (/testes-avatar/[id]/editar) — daí `initial`.
 */
export function SimulacaoWizard({ initial, onSaved, onCancel, etapaInicial }: Props) {
  const [etapa, setEtapa] = useState(
    etapaInicial != null && etapaInicial >= 0 && etapaInicial < ETAPAS.length ? etapaInicial : 0
  );

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [dadosCarregados, setDadosCarregados] = useState(false);

  // ---- etapa 1: pessoas ----
  const [slots, setSlots] = useState<Slot[]>([slotVazio()]);
  // A caixa de quantidade guarda o texto digitado, não o número — senão
  // apagar o campo pra digitar "12" cortaria a lista pra 1 pessoa no meio
  // da digitação.
  const [qtdTexto, setQtdTexto] = useState("1");
  // Quantidade menor esperando confirmação, quando o corte removeria pessoas
  // já definidas.
  const [confirmarCorte, setConfirmarCorte] = useState<number | null>(null);
  const [personaPickerFor, setPersonaPickerFor] = useState<number | null>(null);
  const [textoOpen, setTextoOpen] = useState(false);
  const [textoDraft, setTextoDraft] = useState("");

  // ---- etapa 2: cenário ----
  const [cenario, setCenario] = useState("");
  const [criterioSucesso, setCriterioSucesso] = useState("");
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [fonteAtiva, setFonteAtiva] = useState<string | null>(null);
  const [avisoFonte, setAvisoFonte] = useState<string | null>(null);
  const [cenariosIndividuaisAtivo, setCenariosIndividuaisAtivo] = useState(false);
  const [scenarioPickerFor, setScenarioPickerFor] = useState<"simulacao" | "pessoa" | null>(null);
  const [editandoPessoaIdx, setEditandoPessoaIdx] = useState<number | null>(null);
  const [draftCenarioPessoa, setDraftCenarioPessoa] = useState("");
  const [draftCriterioPessoa, setDraftCriterioPessoa] = useState("");

  // ---- etapa 3: turnos ----
  const [maxTurnos, setMaxTurnos] = useState(String(MAX_TURNOS_SEM_ROTEIRO));
  const [maxSimultaneos, setMaxSimultaneos] = useState(3);
  const [mensagensPorTurno, setMensagensPorTurno] = useState(false);
  const [roteiro, setRoteiro] = useState<TurnoRoteiro[]>([]);
  const [rodarRoteiroCompleto, setRodarRoteiroCompleto] = useState(false);
  // "Máximo de turnos" acompanha o roteiro (05/10/2026): com o switch de
  // turnos ligado, o máximo é a quantidade de turnos adicionados — cada
  // "+ Adicionar turno" soma 1, cada remoção tira 1. Se ela digitar um número
  // MAIOR, o máximo passa a ser dela (a conversa segue livre depois do
  // roteiro) e para de acompanhar; digitar um número igual ou menor volta a
  // acompanhar. Nunca fica abaixo do roteiro: os turnos escritos sempre rodam.
  // É ref, não state, de propósito: mudar este modo não pode disparar o
  // efeito que reajusta o número (atrapalharia quem está digitando "12").
  const maxSegueRoteiro = useRef(true);

  // ---- etapa 4: dados ----
  const [embaralharDados, setEmbaralharDados] = useState(false);
  const [embaralharConfig, setEmbaralharConfig] = useState<EmbaralharConfig>(CONFIG_EMBARALHAR_PADRAO);

  // ---- etapa 5: identificação ----
  // Avatar, ambiente, host slug, sub-slug e API da Zenta NÃO moram mais aqui
  // (02/09/2026, regra da Isa): onde a simulação roda é decidido no switch do
  // card, na hora de rodar, e não no cadastro. O assistente cuida do que é da
  // simulação e não muda de lugar pra lugar; o destino é do switch.
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  // Upload de anexo em andamento, por linha do roteiro: enquanto houver
  // algum, o Salvar espera (o turno ainda não tem a URL do arquivo).
  const [enviandoAnexo, setEnviandoAnexo] = useState<Record<number, boolean>>({});
  const algumAnexoEnviando = Object.values(enviandoAnexo).some(Boolean);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // Trava de segurança: se alguma dessas chamadas pendurar sem rejeitar, o
    // assistente abre assim mesmo em vez de ficar preso em "Carregando".
    const destravar = setTimeout(() => setDadosCarregados(true), 8000);
    Promise.all([
      fetch("/api/personas").then((r) => r.json()),
      fetch("/api/scenarios").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
    ])
      .then(([p, s, t]) => {
        if (!p.error && Array.isArray(p.personas)) setPersonas(p.personas);
        if (!s.error && Array.isArray(s.scenarios)) setScenarios(s.scenarios);
        if (!t.error && Array.isArray(t.tags)) setAvailableTags(t.tags);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(destravar);
        setDadosCarregados(true);
      });
    return () => clearTimeout(destravar);
  }, []);

  // Carrega uma simulação salva no formato do assistente. Espera as personas
  // chegarem pra conseguir reconhecer quem no lote veio de uma persona salva
  // (o banco guarda só os dados da pessoa, não de onde ela saiu).
  // Roda uma vez só, quando as personas já chegaram — reexecutar depois
  // apagaria o que ela já tivesse editado nas etapas. Enquanto não roda, o
  // assistente mostra "Carregando" em vez dos campos vazios (senão daria pra
  // digitar num formulário que a hidratação sobrescreveria logo em seguida).
  const [hidratado, setHidratado] = useState(false);
  const initialId = initial?.id;
  useEffect(() => {
    if (!initial || !dadosCarregados || hidratado) return;
    setHidratado(true);
    setName(initial.name);
    setTags(initial.tags || []);
    setCenario(initial.cenario || "");
    setCriterioSucesso(initial.criterioSucesso || "");
    setFontes([
      {
        key: "salvoNaSimulacao",
        label: "Cenário salvo nesta simulação",
        cenario: initial.cenario || "",
        criterio: initial.criterioSucesso || "",
      },
    ]);
    setFonteAtiva("salvoNaSimulacao");
    setMaxTurnos(String(initial.maxTurnos ?? MAX_TURNOS_SEM_ROTEIRO));
    // Simulação salva com máximo acima do roteiro: o número foi escolhido por
    // ela, então fica. Igual ou abaixo (ou switch desligado): acompanha.
    maxSegueRoteiro.current =
      !initial.mensagensPorTurno ||
      (initial.maxTurnos ?? 0) <= (initial.roteiroTurnos || []).length;
    setMaxSimultaneos(initial.maxSimultaneos || Math.max(1, (initial.pessoas || []).length || 1));
    setMensagensPorTurno(!!initial.mensagensPorTurno);
    setRodarRoteiroCompleto(!!initial.rodarRoteiroCompleto);
    // Roteiro que ja estava salvo entra confirmado: ela ja disse que estava
    // pronto quando salvou. `confirmado` so passou a ser gravado depois, dai
    // o fallback pra roteiros antigos.
    setRoteiro(
      normalizarRoteiro(
        (initial.roteiroTurnos || []).map((t) => ({
          ...t,
          confirmado:
            t.confirmado ?? (t.modo === "livre" || !!t.texto.trim() || anexosDaLinha(t).length > 0),
        }))
      )
    );
    setEmbaralharDados(!!initial.embaralharDados);
    // Simulação salva antes de a etapa 4 ter comportamento (02/09/2026) vem
    // sem config: normalizarConfigEmbaralhar devolve o padrão, que é a
    // leitura mais fiel do que o checkbox sozinho prometia.
    setEmbaralharConfig(normalizarConfigEmbaralhar(initial.embaralharConfig));
    setCenariosIndividuaisAtivo(!!initial.cenariosIndividuaisAtivo);

    const overrides = initial.overridesPorPessoa || {};
    const carregados: Slot[] = (initial.pessoas || []).map((p: PessoaDoLote, idx: number) => {
      const dados = pessoaDoLoteParaLinha(p);
      const persona = personas.find((x) => x.nome === dados.nome);
      const override = overrides[String(idx)];
      const base: Slot = persona
        ? { ...slotDePersona(persona), dados }
        : { preenchido: true, origem: "manual", dados, modoCenario: "simulacao" };
      if (!override || !override.cenario) return { ...base, modoCenario: "simulacao" };
      // Se o override é exatamente o cenário da persona, mostra como "vem da
      // persona" em vez de "escrito à mão" — o banco não guarda essa origem.
      if (persona?.cenario && override.cenario === persona.cenario) {
        return { ...base, modoCenario: "persona" };
      }
      return {
        ...base,
        modoCenario: "proprio",
        cenarioProprio: override.cenario,
        criterioProprio: override.criterio || "",
      };
    });
    setSlots(carregados.length > 0 ? carregados : [slotVazio()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId, dadosCarregados, hidratado]);

  // Mantém a caixa de quantidade em dia quando a lista muda por outro
  // caminho (carregar uma simulação salva, aplicar a lista em texto).
  useEffect(() => {
    setQtdTexto(String(slots.length));
  }, [slots.length]);

  // Assim que entra no lote alguém com cenário próprio, o switch de cenário
  // por pessoa liga sozinho — senão o cenário da persona seria ignorado em
  // silêncio, que é exatamente o que a etapa 2 existe pra evitar.
  const algumaPersonaComCenario = slots.some((s) => s.cenarioPersona);
  useEffect(() => {
    if (algumaPersonaComCenario) setCenariosIndividuaisAtivo(true);
  }, [algumaPersonaComCenario]);

  const preenchidos = slots.filter((s) => s.preenchido).length;
  const vagas = slots.length - preenchidos;

  // ---------------- etapa 1 ----------------

  // A quantidade só é aplicada quando você sai do campo (ou aperta Enter),
  // nunca a cada tecla: digitar "20" por cima de "12" passa por "2" no meio
  // do caminho, e aplicar isso na hora apagaria 10 pessoas já montadas.
  function aplicarAlvo(alvo: number) {
    setSlots((prev) => {
      if (alvo === prev.length) return prev;
      if (alvo > prev.length) {
        return [...prev, ...Array.from({ length: alvo - prev.length }, () => slotVazio())];
      }
      return prev.slice(0, alvo);
    });
    setQtdTexto(String(alvo));
    setConfirmarCorte(null);
  }

  function aplicarQuantidade() {
    const n = Number(qtdTexto);
    if (!qtdTexto.trim() || !Number.isFinite(n) || n < 1) {
      setQtdTexto(String(slots.length));
      return;
    }
    const alvo = Math.max(1, Math.min(50, Math.floor(n)));
    if (alvo === slots.length) {
      setQtdTexto(String(alvo));
      return;
    }
    // Diminuir a lista pode jogar fora pessoas já definidas — pergunta antes.
    if (alvo < slots.length && slots.slice(alvo).some((s) => s.preenchido)) {
      setConfirmarCorte(alvo);
      return;
    }
    aplicarAlvo(alvo);
  }

  function atualizarSlot(idx: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function primeiraVaga() {
    const i = slots.findIndex((s) => !s.preenchido);
    return i === -1 ? null : i;
  }

  function gerarNaVaga(idx: number) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? slotFicticio() : s)));
  }

  function completarComFicticias() {
    setSlots((prev) => prev.map((s) => (s.preenchido ? s : slotFicticio())));
  }

  function usarPersona(persona: Persona) {
    const idx = personaPickerFor;
    setPersonaPickerFor(null);
    if (idx === null) return;
    setSlots((prev) => prev.map((s, i) => (i === idx ? slotDePersona(persona) : s)));
  }

  function abrirEditorTexto() {
    setTextoDraft(pessoasParaTexto(slots.filter((s) => s.preenchido).map((s) => s.dados)));
    setTextoOpen(true);
  }

  function aplicarEditorTexto() {
    const linhas = parsePessoas(textoDraft);
    setSlots((prev) => {
      if (linhas.length === 0) return [slotVazio()];
      return linhas.map((dados) => {
        // Mantém a origem (persona/fictícia) e o cenário próprio de quem já
        // estava na lista com o mesmo nome; nomes novos entram como manuais.
        const anterior = prev.find((s) => s.preenchido && s.dados.nome === dados.nome);
        if (anterior) return { ...anterior, dados };
        return { preenchido: true, origem: "manual", dados, modoCenario: "simulacao" } as Slot;
      });
    });
    setTextoOpen(false);
  }

  // ---------------- etapa 2 ----------------

  function guardarFonte(fonte: Fonte) {
    setFontes((prev) => {
      const i = prev.findIndex((f) => f.key === fonte.key);
      if (i === -1) return [...prev, fonte];
      const copia = [...prev];
      copia[i] = fonte;
      return copia;
    });
  }

  function registrarFonte(fonte: Fonte) {
    const jaEstava = fontes.some((f) => f.key === fonte.key && f.cenario.trim());
    guardarFonte(fonte);
    if (cenario.trim()) {
      setAvisoFonte(
        jaEstava
          ? `"${fonte.label}" já estava na lista de opções — nada mudou.`
          : `Guardei "${fonte.label}" como uma opção abaixo. Nada foi substituído — escolha qual cenário vale.`
      );
      return;
    }
    // Campo vazio: aplica direto. O critério de sucesso só entra se você
    // ainda não tiver escrito um — preenchimento automático nunca apaga
    // texto seu sem perguntar.
    setFonteAtiva(fonte.key);
    setCenario(fonte.cenario);
    if (fonte.criterio && !criterioSucesso.trim()) setCriterioSucesso(fonte.criterio);
    setAvisoFonte(null);
  }

  // Escolher uma opção do painel é uma decisão explícita: troca cenário e
  // critério juntos, e o que estava vale continua guardado na lista.
  function escolherFonte(key: string) {
    const fonte = fontes.find((f) => f.key === key);
    if (!fonte) return;
    setFonteAtiva(key);
    setCenario(fonte.cenario);
    if (fonte.criterio) {
      setCriterioSucesso(fonte.criterio);
      setAvisoFonte(null);
    } else if (criterioSucesso.trim()) {
      // A opção escolhida não tem critério próprio: manter o que já estava é
      // menos destrutivo que zerar o campo (e salvar apagaria do banco).
      setAvisoFonte(
        `"${fonte.label}" não tem critério de sucesso próprio — mantive o que já estava no campo. Confira se ainda faz sentido.`
      );
    } else {
      setAvisoFonte(null);
    }
  }

  /** Fontes que são texto seu — as únicas que digitar pode alterar no lugar. */
  function ehFonteEditavel(key: string) {
    return key === "digitado" || key.startsWith("editado:");
  }

  // Digitar nunca sobrescreve uma fonte que veio de fora (um cenário salvo,
  // o padrão, ou o cenário que já estava na simulação): ajustar uma delas
  // cria uma opção nova "Versão editada de X", e a original continua no
  // painel pra você poder voltar nela.
  function editarCenario(texto: string) {
    setCenario(texto);
    const atual = fontes.find((f) => f.key === fonteAtiva);
    if (!atual || ehFonteEditavel(atual.key)) {
      const key = atual?.key || "digitado";
      setFonteAtiva(key);
      guardarFonte({
        key,
        label: atual?.label || "O que você escreveu",
        cenario: texto,
        criterio: criterioSucesso,
      });
      return;
    }
    const key = `editado:${atual.key}`;
    setFonteAtiva(key);
    guardarFonte({
      key,
      label: `Versão editada de ${atual.label}`,
      cenario: texto,
      criterio: criterioSucesso,
    });
  }

  // O critério só é gravado nas fontes que são texto seu — assim uma opção
  // "Cenário salvo — X" continua sendo fielmente o que está na biblioteca.
  function editarCriterio(texto: string) {
    setCriterioSucesso(texto);
    const atual = fontes.find((f) => f.key === fonteAtiva);
    if (!atual || !ehFonteEditavel(atual.key)) return;
    setFontes((prev) => prev.map((f) => (f.key === atual.key ? { ...f, criterio: texto } : f)));
  }

  function usarCenarioSalvo(s: Scenario) {
    const alvo = scenarioPickerFor;
    setScenarioPickerFor(null);
    if (alvo === "pessoa") {
      setDraftCenarioPessoa(s.cenario);
      if (s.criterioSucesso) setDraftCriterioPessoa(s.criterioSucesso);
      return;
    }
    registrarFonte({
      key: `salvo:${s.id}`,
      label: `Cenário salvo — ${s.nome}`,
      cenario: s.cenario,
      criterio: s.criterioSucesso || "",
    });
  }

  function inserirPadrao(alvo: "simulacao" | "pessoa") {
    if (alvo === "pessoa") {
      setDraftCenarioPessoa(TEMPLATE_CENARIO_PADRAO);
      return;
    }
    registrarFonte({
      key: "padrao",
      label: "Cenário padrão",
      cenario: TEMPLATE_CENARIO_PADRAO,
      criterio: "",
    });
  }

  function cenarioEfetivo(s: Slot): { texto: string; origem: "simulacao" | "persona" | "proprio" } {
    if (!cenariosIndividuaisAtivo) return { texto: cenario, origem: "simulacao" };
    if (s.modoCenario === "proprio") return { texto: s.cenarioProprio || "", origem: "proprio" };
    if (s.modoCenario === "persona" && s.cenarioPersona) {
      return { texto: s.cenarioPersona, origem: "persona" };
    }
    return { texto: cenario, origem: "simulacao" };
  }

  function abrirCenarioDaPessoa(idx: number) {
    const s = slots[idx];
    const efetivo = cenarioEfetivo(s);
    setDraftCenarioPessoa(s.cenarioProprio || efetivo.texto);
    setDraftCriterioPessoa(s.criterioProprio || s.criterioPersona || criterioSucesso);
    setEditandoPessoaIdx(idx);
  }

  function salvarCenarioDaPessoa() {
    if (editandoPessoaIdx === null) return;
    atualizarSlot(editandoPessoaIdx, {
      modoCenario: "proprio",
      cenarioProprio: draftCenarioPessoa,
      criterioProprio: draftCriterioPessoa,
    });
    setCenariosIndividuaisAtivo(true);
    setEditandoPessoaIdx(null);
  }

  const mostrarTabelaPessoas = slots.length > 1 || algumaPersonaComCenario;
  const fontesComTexto = fontes.filter((f) => f.cenario.trim());

  // ---------------- etapa 3: roteiro de turnos ----------------

  // O numero do turno e sempre a posicao na lista + 1, e a primeira linha e a
  // MENSAGEM DE ABERTURA (02/09/2026: a saudacao deixou de ser um campo a
  // parte e virou o turno 1). Nao ha turno "pulado": um turno sem exigencia e
  // uma linha no modo "livre", que e diferente de nao existir — a diferenca
  // aparece na leitura, e o motor trata os dois igual.
  function mexerNoRoteiro(fn: (atual: TurnoRoteiro[]) => TurnoRoteiro[]) {
    setRoteiro((atual) => normalizarRoteiro(fn(atual)));
  }

  const qtdTurnosRoteiro = roteiro.length;
  useEffect(() => {
    if (!mensagensPorTurno || qtdTurnosRoteiro === 0) return;
    setMaxTurnos((atual) => {
      const n = Number(atual) || 0;
      return maxSegueRoteiro.current || n < qtdTurnosRoteiro ? String(qtdTurnosRoteiro) : atual;
    });
  }, [mensagensPorTurno, qtdTurnosRoteiro]);

  /** Ao sair do campo: decide se o número digitado é "dela" ou volta a acompanhar o roteiro. */
  function confirmarMaxTurnos() {
    if (!mensagensPorTurno || qtdTurnosRoteiro === 0) return;
    const n = Math.floor(Number(maxTurnos) || 0);
    if (n > qtdTurnosRoteiro) {
      maxSegueRoteiro.current = false;
      setMaxTurnos(String(n));
    } else {
      maxSegueRoteiro.current = true;
      setMaxTurnos(String(qtdTurnosRoteiro));
    }
  }

  function adicionarTurno() {
    // Ligar o switch com o roteiro vazio ja abre o turno 1; daqui em diante
    // cada clique acrescenta um turno no fim.
    mexerNoRoteiro((atual) => [...atual, turnoVazio(atual.length + 1)]);
  }

  function atualizarTurno(idx: number, patch: Partial<TurnoRoteiro>) {
    mexerNoRoteiro((atual) => atual.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  function removerTurno(idx: number) {
    mexerNoRoteiro((atual) => atual.filter((_, i) => i !== idx));
  }

  // Quantos turnos o roteiro precisa: o ultimo turno escrito, e so — a
  // abertura ja e o turno 1 da lista. Com uma linha "deste turno em diante" o
  // roteiro nunca acaba, entao nao ha o que conferir.
  const turnosNecessarios = useMemo(() => {
    const ultimo = ultimoTurnoDoRoteiro(roteiro);
    return Number.isFinite(ultimo) ? ultimo : 0;
  }, [roteiro]);
  const maxTurnosCurto =
    mensagensPorTurno && turnosNecessarios > 0 && Number(maxTurnos) > 0 && Number(maxTurnos) < turnosNecessarios;

  // ---------------- validação e salvamento ----------------

  const problemas = useMemo(() => {
    const p: { etapa: number; msg: string }[] = [];
    if (slots.some((s) => !s.preenchido || !s.dados.nome.trim())) {
      p.push({ etapa: 0, msg: "Ainda há vagas sem pessoa na etapa 1." });
    }
    if (!cenario.trim()) p.push({ etapa: 1, msg: "Escreva ou escolha o cenário da simulação na etapa 2." });
    if (!maxTurnos || Number(maxTurnos) < 1) {
      p.push({ etapa: 2, msg: "O máximo de turnos precisa ser pelo menos 1." });
    }
    if (mensagensPorTurno) {
      // Switch ligado com roteiro vazio seria uma simulação que se comporta
      // exatamente como se ele estivesse desligado — o tipo de coisa que faz
      // duvidar do resultado depois.
      if (!roteiroTemConteudo(roteiro)) {
        p.push({ etapa: 2, msg: "Escreva pelo menos o turno 1 do roteiro na etapa 3." });
      } else {
        // Texto exato pode ir vazio quando o turno leva arquivo (05/10/2026):
        // a mensagem é o arquivo sozinho. Instrução sem texto continua erro —
        // pra "a IA escreve o que quiser + arquivo", o modo é "livre".
        const vazio = roteiro.find(
          (t) => t.modo !== "livre" && !t.texto.trim() && !(t.modo === "exato" && anexosDaLinha(t).length)
        );
        if (vazio) {
          p.push({
            etapa: 2,
            msg:
              vazio.modo === "exato"
                ? `O turno ${vazio.turno} do roteiro está sem texto e sem anexo — escreva, anexe um arquivo ou mude o modo para "livre".`
                : `O turno ${vazio.turno} do roteiro está sem a instrução — escreva o que a IA deve fazer ou mude o modo para "livre".`,
          });
        }
      }
    }
    if (!name.trim()) {
      p.push({ etapa: 4, msg: "A simulação precisa de um nome na etapa 5." });
    }
    return p;
  }, [slots, cenario, maxTurnos, name, mensagensPorTurno, roteiro]);

  // ---------------- etapa 4: embaralhamento ----------------

  /**
   * A lista dos seletores da etapa 4 não é fixa: é montada do que existe na
   * simulação (regra da Isa, 02/09/2026 — sem mexer na etapa 1). Três fontes:
   * os campos das pessoas do lote, o campo extra que elas trouxeram, e as
   * {chaves} que ela escreveu no cenário ou no roteiro e ninguém preenche.
   */
  const dadosDasPessoas = useMemo(
    () => slots.filter((s) => s.preenchido).map((s) => pessoaLinhaParaDados(s.dados)),
    [slots]
  );

  const chavesLivres = useMemo(
    () =>
      chavesLivresDoTexto([
        cenario,
        ...roteiro.map((t) => t.texto),
        ...slots.map((s) => s.cenarioProprio || ""),
        ...slots.map((s) => s.cenarioPersona || ""),
      ]),
    [cenario, roteiro, slots]
  );

  const catalogo: CampoEmbaralhavel[] = useMemo(
    () => catalogoDeCampos(dadosDasPessoas, chavesLivres),
    [dadosDasPessoas, chavesLivres]
  );

  function mexerNoEmbaralho(muda: (c: EmbaralharConfig) => EmbaralharConfig) {
    setEmbaralharConfig((prev) => muda(prev));
  }

  /** Campo que ninguém preenche só pode RECEBER — não tem valor pra dar. */
  function chaveSemValor(chave: string): boolean {
    return !catalogo.find((c) => c.chave === chave)?.temValor;
  }

  function trocaNova(): TrocaEmbaralhada {
    const comValor = catalogo.filter((c) => c.temValor);
    const a = comValor[0]?.chave || catalogo[0]?.chave || "nome";
    const b = comValor[1]?.chave || comValor[0]?.chave || "cidade";
    return { a, b, dir: "par" };
  }

  function adicionarTroca() {
    mexerNoEmbaralho((c) => ({ ...c, trocas: [...c.trocas, trocaNova()] }));
  }

  /** Quem do lote não tem o campo de origem: pra essa pessoa a troca não acontece. */
  function pessoasSemOCampo(chave: string): string[] {
    return slots
      .filter((s) => s.preenchido)
      .filter((s) => {
        const dados = pessoaLinhaParaDados(s.dados) as unknown as Record<string, string>;
        return !String(dados[chave] || "").trim();
      })
      .map((s, i) => s.dados.nome || `Vaga ${i + 1}`);
  }

  /** Prévia do modo "trocas": mostra o que a primeira pessoa mandaria. */
  const previaEmbaralho = useMemo(() => {
    if (!embaralharDados || embaralharConfig.modo !== "trocas" || !dadosDasPessoas.length) return null;
    const primeira = dadosDasPessoas[0];
    const resultado = aplicarEmbaralhamento(primeira, embaralharConfig, chavesLivres);
    if (!Object.keys(resultado.mapa).length) return null;
    return {
      nome: primeira.nome,
      linhas: Object.keys(resultado.mapa).map((destino) => ({
        destino,
        origem: resultado.mapa[destino],
        valor: resultado.dados[destino],
      })),
    };
  }, [embaralharDados, embaralharConfig, dadosDasPessoas, chavesLivres]);

  /** A linha "Dados" do resumo (etapa 5): diz o que foi configurado, não só ligado/desligado. */
  const resumoEmbaralho = useMemo(
    () => resumirEmbaralhamento(embaralharDados, embaralharConfig, slots.length, catalogo),
    [embaralharDados, embaralharConfig, catalogo, slots.length]
  );

  async function salvar() {
    if (problemas.length > 0) {
      setEtapa(problemas[0].etapa);
      setErro(problemas[0].msg);
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const pessoas: PessoaDoLote[] = slots.map((s) => s.dados);
      const overrides: Record<string, { cenario: string; criterio: string }> = {};
      if (cenariosIndividuaisAtivo) {
        slots.forEach((s, idx) => {
          const efetivo = cenarioEfetivo(s);
          if (efetivo.origem === "simulacao" || !efetivo.texto.trim()) return;
          overrides[String(idx)] = {
            cenario: efetivo.texto,
            criterio:
              (efetivo.origem === "proprio" ? s.criterioProprio : s.criterioPersona) || criterioSucesso || "",
          };
        });
      }
      // avatar/ambiente/hostSlug/subSlug/baseUrl NÃO vão no corpo: quem
      // grava esses campos é o switch do card (app/testes-avatar/page.tsx),
      // na hora de rodar. Omitir é diferente de mandar vazio — o PATCH só
      // mexe no que recebe, então editar uma simulação aqui não derruba o
      // destino que ela já tinha escolhido lá.
      const body = {
        name: name.trim(),
        cenario: cenario.trim(),
        // null, não undefined: JSON.stringify come chaves undefined, e o
        // PATCH só limpa o campo quando o recebe explicitamente.
        criterioSucesso: criterioSucesso.trim() || null,
        maxTurnos: Number(maxTurnos),
        tags,
        tipo: "lote" as const,
        pessoas,
        maxSimultaneos,
        cenariosIndividuaisAtivo: Object.keys(overrides).length > 0,
        overridesPorPessoa: Object.keys(overrides).length > 0 ? overrides : null,
        mensagensPorTurno,
        // O roteiro é salvo mesmo com o switch desligado: desligar e ligar de
        // novo não pode apagar o que ela escreveu.
        roteiroTurnos: roteiro.length ? normalizarRoteiro(roteiro) : null,
        rodarRoteiroCompleto,
        embaralharDados,
        // A config vai sempre: desligar o mestre não pode apagar as trocas
        // que ela montou, pelo mesmo motivo do roteiro logo acima.
        embaralharConfig,
      };
      const res = await fetch(initial ? `/api/avatar-tests/${initial.id}` : "/api/avatar-tests", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSaved(data.avatarTest as AvatarTest);
    } catch (e: any) {
      setErro(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // ---------------- render ----------------

  if (initial && !hidratado) {
    return <p className="empty">Carregando a simulação...</p>;
  }

  return (
    <div>
      <ol className="wizard-steps">
        {ETAPAS.map((label, i) => (
          <li key={label} className={`wizard-step${i === etapa ? " now" : ""}${i < etapa ? " done" : ""}`}>
            <button type="button" onClick={() => setEtapa(i)}>
              <span className="wizard-bead">{i + 1}</span>
              <span className="wizard-step-label">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {etapa === 0 && (
        <div className="panel">
          <h3>Quem conversa</h3>

          <div className="field">
            <label>Quantas pessoas vão conversar com o avatar?</label>
            <div className="row" style={{ alignItems: "center", gap: 12 }}>
              <input
                type="number"
                min={1}
                max={50}
                value={qtdTexto}
                onChange={(e) => setQtdTexto(e.target.value)}
                onBlur={aplicarQuantidade}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    aplicarQuantidade();
                  }
                }}
                style={{ maxWidth: 90 }}
              />
              <button type="button" className="btn-secondary" onClick={aplicarQuantidade}>
                Aplicar
              </button>
              <span className="hint" style={{ margin: 0 }}>
                Com 1, vira uma simulação de uma conversa só.
              </span>
            </div>
          </div>

          <div className="field">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ margin: 0 }}>
                Quem são elas{" "}
                <span className="wizard-count">
                  {preenchidos} de {slots.length}
                </span>
              </label>
              {vagas > 0 && (
                <button type="button" className="btn-primary" onClick={completarComFicticias}>
                  Completar {vagas === 1 ? "a vaga" : `as ${vagas} vagas`} com pessoas fictícias
                </button>
              )}
            </div>

            {slots.map((s, idx) => (
              <div className={`checklist-row${s.preenchido ? "" : " slot-vazia"}`} key={idx} style={{ padding: "10px 14px" }}>
                <div className="checklist-row-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className={`slot-avatar${s.preenchido ? "" : " vazia"}`}>
                    {s.preenchido ? iniciais(s.dados.nome) : String(idx + 1)}
                  </span>
                  <div>
                    <div className="checklist-row-title" style={{ fontSize: 13.5 }}>
                      {s.preenchido ? s.dados.nome || "Sem nome" : `Vaga ${idx + 1} — ainda vazia`}
                      {s.preenchido && (
                        <span className={`slot-tag${s.origem === "persona" ? " persona" : ""}`}>
                          {s.origem === "persona" ? "persona salva" : s.origem === "ficticia" ? "fictícia" : "digitada"}
                        </span>
                      )}
                    </div>
                    {s.preenchido && <div className="meta">{resumoDados(s.dados)}</div>}
                  </div>
                </div>
                <div className="checklist-row-actions">
                  <button type="button" className="btn-picker-accent" onClick={() => setPersonaPickerFor(idx)}>
                    {s.origem === "persona" && s.preenchido ? "Trocar persona" : "Escolher persona"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => gerarNaVaga(idx)}>
                    {s.preenchido ? "Gerar outra fictícia" : "Gerar pessoa fictícia"}
                  </button>
                </div>
              </div>
            ))}

            <div className="actions-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn-secondary" onClick={abrirEditorTexto}>
                Editar a lista como texto
              </button>
            </div>
            <p className="hint">
              A lista em texto (uma pessoa por linha,
              {" nome;cpf;telefone;genero;email;nascimento;cidade;campo_extra_nome;campo_extra_valor"}) continua
              disponível — é a mesma lista, só deixou de ser a primeira coisa que você vê.
            </p>
          </div>
        </div>
      )}

      {etapa === 1 && (
        <div className="panel">
          <h3>O que conversa</h3>

          {fontesComTexto.length > 1 && (
            <div className="conflict-panel">
              <div className="conflict-panel-title">
                {fontesComTexto.length} cenários diferentes querem o mesmo lugar
              </div>
              <p className="conflict-panel-body">
                Escolha qual vale como cenário da simulação. Nada é apagado: o que não for escolhido continua
                guardado aqui e dá pra voltar nele.
              </p>
              {fontesComTexto.map((f) => (
                <button
                  type="button"
                  key={f.key}
                  className={`conflict-source${fonteAtiva === f.key ? " picked" : ""}`}
                  onClick={() => escolherFonte(f.key)}
                >
                  <span className="conflict-radio" />
                  <span>
                    <span className="conflict-source-title">{f.label}</span>
                    <span className="conflict-source-preview">{preview(f.cenario, 150)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {avisoFonte && <p className="status-msg">{avisoFonte}</p>}

          <div className="field">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ margin: 0 }}>Cenário da simulação</label>
              <CenarioActions
                onCenarioSalvo={() => setScenarioPickerFor("simulacao")}
                onPadrao={() => inserirPadrao("simulacao")}
              />
            </div>
            <textarea
              rows={5}
              value={cenario}
              onChange={(e) => editarCenario(e.target.value)}
              placeholder="Descreva a conversa a simular, ou use os botões acima."
            />
            <p className="hint">
              Placeholders como {"{nome}"} e {"{cpf}"} são trocados pelos dados de cada pessoa na hora de rodar.
            </p>
          </div>

          <div className="field">
            <label>Critério de sucesso (opcional) — o que define que o fluxo funcionou</label>
            <textarea
              rows={2}
              value={criterioSucesso}
              onChange={(e) => editarCriterio(e.target.value)}
              placeholder="O que a IA deve considerar sucesso nessa conversa"
            />
            <p className="hint">
              O critério anda junto com o cenário escolhido no painel acima — se você trocar de cenário,
              confira se ele ainda faz sentido.
            </p>
          </div>

          {mostrarTabelaPessoas && (
            <div className="field">
              <label className="toggle-row" style={{ display: "flex", marginBottom: 6 }}>
                <span className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={cenariosIndividuaisAtivo}
                    onChange={(e) => setCenariosIndividuaisAtivo(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </span>
                Cenário diferente para alguma pessoa
              </label>
              <p className="hint" style={{ marginTop: 0 }}>
                {algumaPersonaComCenario
                  ? "Ligado automaticamente porque alguma persona escolhida trouxe cenário próprio. Desligar faz todo mundo usar o cenário da simulação — os cenários das personas ficam ignorados, mas nada é apagado."
                  : "Desligado, todo mundo usa o cenário da simulação."}
              </p>

              <div className="eff-table-wrap">
                <table className="eff-table">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Cenário em vigor</th>
                      <th>Vem de</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((s, idx) => {
                      const efetivo = cenarioEfetivo(s);
                      const nome = s.preenchido ? s.dados.nome : `Vaga ${idx + 1}`;
                      const textoPreview = s.preenchido
                        ? preencherTemplate(efetivo.texto, pessoaLinhaParaDados(s.dados))
                        : efetivo.texto;
                      return (
                        <tr key={idx}>
                          <td>
                            <strong>{nome || "Sem nome"}</strong>
                          </td>
                          <td>{preview(textoPreview)}</td>
                          <td>
                            <span className={`origem-tag ${efetivo.origem}`}>
                              {efetivo.origem === "persona"
                                ? "cenário da persona"
                                : efetivo.origem === "proprio"
                                  ? "escrito pra ela"
                                  : "cenário da simulação"}
                            </span>
                          </td>
                          <td className="eff-actions">
                            {efetivo.origem !== "simulacao" && (
                              <button
                                type="button"
                                className="btn-link-accent"
                                onClick={() => atualizarSlot(idx, { modoCenario: "simulacao" })}
                              >
                                Usar o da simulação
                              </button>
                            )}
                            {efetivo.origem === "simulacao" && s.cenarioPersona && (
                              <button
                                type="button"
                                className="btn-link-accent"
                                onClick={() => atualizarSlot(idx, { modoCenario: "persona" })}
                              >
                                Voltar ao da persona
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-link-accent"
                              onClick={() => abrirCenarioDaPessoa(idx)}
                            >
                              {efetivo.origem === "proprio" ? "Editar" : "Escrever outro"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {etapa === 2 && (
        <div className="panel">
          <h3>Como conversa</h3>
          <div className="field-grid">
            <div className="field">
              <label>Máximo de turnos</label>
              <input
                type="number"
                min={mensagensPorTurno && qtdTurnosRoteiro > 0 ? qtdTurnosRoteiro : 1}
                max={Math.max(10, qtdTurnosRoteiro)}
                value={maxTurnos}
                onChange={(e) => setMaxTurnos(e.target.value)}
                onBlur={confirmarMaxTurnos}
              />
              <p className="hint">
                {mensagensPorTurno && qtdTurnosRoteiro > 0
                  ? Number(maxTurnos) > qtdTurnosRoteiro
                    ? `${qtdTurnosRoteiro} ${qtdTurnosRoteiro === 1 ? "turno" : "turnos"} do roteiro + ${
                        Number(maxTurnos) - qtdTurnosRoteiro
                      } livres depois dele. Volte para ${qtdTurnosRoteiro} para acompanhar o roteiro de novo.`
                    : `Acompanha os turnos adicionados no roteiro (${qtdTurnosRoteiro}). Aumente se quiser que a conversa siga livre depois do roteiro.`
                  : "A conversa encerra sozinha ao bater esse limite."}{" "}
                Nesta demo, o máximo é 10 turnos, mesmo se um número maior for digitado aqui.
              </p>
            </div>
            {slots.length > 1 && (
              <div className="field">
                <label>Conversas ao mesmo tempo</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxSimultaneos}
                  onChange={(e) => setMaxSimultaneos(Number(e.target.value) || 1)}
                />
                <p className="hint">
                  {slots.length} pessoas no total. Quanto maior, mais conversas rodam em paralelo.
                </p>
              </div>
            )}
          </div>

          <div className="field wizard-soon-block">
            <label className="toggle-row" style={{ display: "flex", marginBottom: 6 }}>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={mensagensPorTurno}
                  onChange={(e) => {
                    setMensagensPorTurno(e.target.checked);
                    // Ligar com o roteiro vazio já abre o turno 1: ligar um
                    // switch e não ver nada aparecer é o jeito mais rápido de
                    // achar que ele não faz nada.
                    if (e.target.checked && roteiro.length === 0) mexerNoRoteiro(() => [turnoVazio(1)]);
                    // Desligar com o máximo acompanhando o roteiro devolve o
                    // padrão da conversa livre — sem roteiro, "1 turno" não
                    // faria sentido. Um máximo escolhido por ela fica.
                    if (!e.target.checked && maxSegueRoteiro.current) {
                      setMaxTurnos(String(MAX_TURNOS_SEM_ROTEIRO));
                    }
                  }}
                />
                <span className="toggle-slider" />
              </span>
              Escrever a mensagem de cada turno
            </label>
            <p className="hint" style={{ marginTop: 0 }}>
              Ligado, você define o que a pessoa simulada manda em cada turno em vez de deixar a IA
              improvisar a partir do cenário. O turno 1 é a mensagem de abertura — a primeira coisa que
              ela envia, antes de o avatar falar qualquer coisa. Desligado, a conversa abre com “Olá!
              Gostaria de mais informações.” e segue improvisando a partir do cenário.
            </p>

            {mensagensPorTurno && (
              <div className="roteiro">
                {roteiro.map((t, idx) => {
                  const ultimo = idx === roteiro.length - 1;
                  // O turno 1 é a abertura: não dá pra remover (toda conversa
                  // começa por algum lugar) e não faz sentido "deste turno em
                  // diante" quando ele é a única linha.
                  const abertura = idx === 0;
                  const editorAnexos = (
                    <AnexosTurnoEditor
                      turno={t.turno}
                      anexos={anexosDaLinha(t)}
                      onEnviandoChange={(v) => setEnviandoAnexo((m) => ({ ...m, [idx]: v }))}
                      onChange={(anexos) =>
                        // Mesmo princípio do texto: o contorno verde vale
                        // pro que está no turno agora. "Livre" não tem o
                        // que confirmar, então segue confirmado.
                        atualizarTurno(idx, {
                          anexos,
                          confirmado: t.modo === "livre" ? t.confirmado : false,
                        })
                      }
                    />
                  );
                  return (
                    <div className={`roteiro-linha${t.confirmado ? " confirmada" : ""}`} key={idx}>
                      <span className="roteiro-num">
                        {t.turno}
                        {t.emDiante ? "+" : ""}
                      </span>
                      <div className="roteiro-corpo">
                        <div className="roteiro-head">
                          <select
                            value={t.modo}
                            onChange={(e) => {
                              const modo = e.target.value as TurnoRoteiro["modo"];
                              // "Livre" nao tem o que escrever, entao ja
                              // nasce confirmado; trocar de modo nos outros
                              // dois desfaz a confirmacao, porque o que
                              // estava confirmado era o texto do modo antigo.
                              atualizarTurno(idx, { modo, confirmado: modo === "livre" });
                            }}
                          >
                            <option value="exato">Texto exato</option>
                            <option value="instrucao">Instrução para a IA</option>
                            <option value="livre">Livre</option>
                          </select>
                          {t.modo === "instrucao" && !abertura && (
                            <label className="roteiro-check">
                              <input
                                type="checkbox"
                                checked={t.ignorarAvatar !== false}
                                onChange={(e) => atualizarTurno(idx, { ignorarAvatar: e.target.checked })}
                              />
                              Ignorar a pergunta do avatar
                            </label>
                          )}
                          {ultimo && !(abertura && roteiro.length === 1) && (
                            <label className="roteiro-check">
                              <input
                                type="checkbox"
                                checked={!!t.emDiante}
                                onChange={(e) => atualizarTurno(idx, { emDiante: e.target.checked })}
                              />
                              Deste turno em diante
                            </label>
                          )}
                          {!abertura && (
                            <button
                              type="button"
                              className="roteiro-remover"
                              onClick={() => removerTurno(idx)}
                              aria-label={`Remover o turno ${t.turno}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {t.modo === "livre" ? (
                          <p className="hint" style={{ margin: 0 }}>
                            {abertura
                              ? "Abertura sem exigência: a IA escreve sozinha a primeira mensagem, a partir do cenário."
                              : "Turno sem exigência: a pessoa simulada responde o avatar normalmente, a partir do cenário."}
                            {anexosDaLinha(t).length > 0 && " O arquivo anexado vai junto com o que a IA escrever."}
                          </p>
                        ) : null}
                        {t.modo === "livre" ? (
                          editorAnexos
                        ) : (
                          <>
                            <textarea
                              rows={2}
                              value={t.texto}
                              onChange={(e) =>
                                // Mexeu no texto, a confirmação cai: o
                                // contorno verde tem que valer pro que está
                                // escrito agora, não pro que estava antes.
                                atualizarTurno(idx, { texto: e.target.value, confirmado: false })
                              }
                              placeholder={
                                t.modo === "exato"
                                  ? abertura
                                    ? "A frase exata com que ela abre a conversa. Ex.: Olá! Gostaria de mais informações."
                                    : "A frase exata que ela envia. Ex.: Meu nome é: {nome} e eu amo pizza — ou deixe vazio e anexe só o arquivo"
                                  : abertura
                                    ? "Como ela deve abrir a conversa, com as palavras dela. Ex.: PEÇA a segunda via do boleto"
                                    : "O que ela deve fazer, com as palavras dela. Ex.: DIGA que ama pizza"
                              }
                            />
                            {editorAnexos}
                            <div className="roteiro-confirma">
                              {t.confirmado ? (
                                <span className="roteiro-confirmado">
                                  <IconCheck size={13} /> Turno {t.turno} confirmado
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={!t.texto.trim() && !(t.modo === "exato" && anexosDaLinha(t).length)}
                                  onClick={() => atualizarTurno(idx, { confirmado: true })}
                                >
                                  Confirmar turno {t.turno}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="roteiro-rodape">
                  <button type="button" className="btn-secondary" onClick={adicionarTurno}>
                    + Adicionar turno
                  </button>
                  <span className="hint" style={{ margin: 0 }}>
                    Dá pra usar {"{nome}"}, {"{cpf}"}, {"{telefone}"}, {"{email}"}, {"{nascimento}"} e{" "}
                    {"{cidade}"} — cada pessoa manda os dados dela.
                  </span>
                </div>

                {maxTurnosCurto && (
                  <p className="status-msg warn roteiro-aviso">
                    O roteiro vai até o turno {turnosNecessarios}, mas a conversa para no turno{" "}
                    {Number(maxTurnos)}. Os últimos turnos do roteiro não vão acontecer.{" "}
                    <button
                      type="button"
                      className="btn-link-accent"
                      onClick={() => setMaxTurnos(String(turnosNecessarios))}
                    >
                      Ajustar o máximo para {turnosNecessarios}
                    </button>
                  </p>
                )}

                <p className="hint" style={{ marginBottom: 0 }}>
                  {roteiro.some((t) => t.emDiante)
                    ? Number(maxTurnos) > roteiro.length
                      ? `Do turno ${roteiro[roteiro.length - 1].turno} em diante a última linha se repete até a conversa acabar (turno ${Number(maxTurnos)}).`
                      : `Do turno ${roteiro[roteiro.length - 1].turno} em diante a última linha se repete até a conversa acabar — aumente o Máximo de turnos acima para ela se repetir mais vezes.`
                    : "Quando o roteiro acaba, a conversa segue livre até o máximo de turnos — como se o switch estivesse desligado dali pra frente."}
                </p>

                <div className="field roteiro-subopcao">
                  <label className="toggle-row" style={{ display: "flex", marginBottom: 6 }}>
                    <span className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={rodarRoteiroCompleto}
                        onChange={(e) => setRodarRoteiroCompleto(e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </span>
                    Rodar o roteiro inteiro, mesmo atingindo o critério antes
                  </label>
                  <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>
                    {rodarRoteiroCompleto
                      ? roteiro.some((t) => t.emDiante)
                        ? `O critério de sucesso deixa de encerrar a conversa no meio: como a última linha vale "deste turno em diante", o roteiro não acaba e a conversa vai até o máximo de turnos (${Number(maxTurnos) || "—"}). O veredito sai no fim, olhando tudo até a última mensagem.`
                        : `O critério de sucesso deixa de encerrar a conversa no meio. Atingido no turno 1, ela continua até o turno ${turnosNecessarios || 1} e só então fecha como SUCESSO — o veredito olha tudo o que aconteceu até a última mensagem.`
                      : "Desligado, a conversa fecha como SUCESSO no turno em que o critério é atingido, e os turnos seguintes do roteiro não acontecem."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {etapa === 3 && (
        <div className="panel">
          <h3>Como os dados chegam</h3>
          <div className="field">
            <label className="toggle-row" style={{ display: "flex", marginBottom: 6 }}>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={embaralharDados}
                  onChange={(e) => {
                    setEmbaralharDados(e.target.checked);
                    // Ligar no modo "trocas" com a lista vazia já abre a
                    // primeira linha — mesmo princípio do roteiro na etapa 3.
                    if (e.target.checked && embaralharConfig.modo === "trocas" && !embaralharConfig.trocas.length) {
                      adicionarTroca();
                    }
                  }}
                />
                <span className="toggle-slider" />
              </span>
              Embaralhar os dados
            </label>
            <p className="hint" style={{ marginTop: 0 }}>
              Desligado, cada pessoa manda os dados dela certinhos. Ligado, os valores trocam de chave: o{" "}
              {"{nome}"} pode chegar com a cidade dentro, pra ver se o avatar percebe. O critério de sucesso
              não muda — ele continua sendo preenchido com os dados de verdade.
            </p>
          </div>

          {embaralharDados && catalogo.filter((c) => c.temValor).length < 2 && (
            <p className="status-msg warn">
              Ainda não dá pra embaralhar: preencha pelo menos dois campos nas pessoas da etapa 1.
            </p>
          )}

          {embaralharDados && catalogo.filter((c) => c.temValor).length >= 2 && (
            <div className="embaralho">
              <div className="field">
                <label>O que trocar</label>
                <div className="filter-op-row" style={{ maxWidth: 460 }}>
                  <button
                    type="button"
                    className={`filter-op-btn${embaralharConfig.modo === "aleatorio" ? " active" : ""}`}
                    onClick={() => mexerNoEmbaralho((c) => ({ ...c, modo: "aleatorio" }))}
                  >
                    De qualquer jeito
                  </button>
                  <button
                    type="button"
                    className={`filter-op-btn${embaralharConfig.modo === "trocas" ? " active" : ""}`}
                    onClick={() =>
                      mexerNoEmbaralho((c) => ({
                        ...c,
                        modo: "trocas",
                        trocas: c.trocas.length ? c.trocas : [trocaNova()],
                      }))
                    }
                  >
                    Só as trocas que eu escolher
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 0 }}>
                  {embaralharConfig.modo === "aleatorio"
                    ? "Sorteio livre entre os dados que a pessoa tem preenchidos, com uma regra: nenhum fica com o próprio valor. O sorteio é refeito a cada rodada e fica registrado no relatório daquela execução."
                    : "Cada linha é uma troca. O botão do meio escolhe se os dois campos trocam entre si (⇄) ou se só um recebe o valor do outro (←)."}
                </p>
              </div>

              {embaralharConfig.modo === "trocas" && (
                <div className="roteiro">
                  {embaralharConfig.trocas.map((t, idx) => {
                    // Destino sem valor em ninguém (uma {chave} escrita no
                    // cenário) só pode receber: não tem valor pra dar.
                    const travada = chaveSemValor(t.a);
                    const dir = travada ? "unico" : t.dir;
                    const semDoador = pessoasSemOCampo(t.b);
                    return (
                      <div className="roteiro-linha" key={idx}>
                        <div className="roteiro-corpo">
                          <div className="troca-linha">
                            <select
                              value={t.a}
                              onChange={(e) =>
                                mexerNoEmbaralho((c) => ({
                                  ...c,
                                  trocas: c.trocas.map((x, i) => (i === idx ? { ...x, a: e.target.value } : x)),
                                }))
                              }
                            >
                              {catalogo.map((c) => (
                                <option key={c.chave} value={c.chave}>
                                  {c.rotulo}
                                  {c.origem === "texto" ? " (do seu texto)" : c.origem === "extra" ? " (campo extra)" : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="troca-dir"
                              disabled={travada}
                              title={
                                travada
                                  ? "Esse campo não tem valor pra dar — só pode receber"
                                  : "Alternar entre troca (⇄) e sentido único (←)"
                              }
                              onClick={() =>
                                mexerNoEmbaralho((c) => ({
                                  ...c,
                                  trocas: c.trocas.map((x, i) =>
                                    i === idx ? { ...x, dir: x.dir === "par" ? "unico" : "par" } : x
                                  ),
                                }))
                              }
                            >
                              {dir === "par" ? "⇄" : "←"}
                            </button>
                            <select
                              value={t.b}
                              onChange={(e) =>
                                mexerNoEmbaralho((c) => ({
                                  ...c,
                                  trocas: c.trocas.map((x, i) => (i === idx ? { ...x, b: e.target.value } : x)),
                                }))
                              }
                            >
                              {catalogo
                                .filter((c) => c.temValor)
                                .map((c) => (
                                  <option key={c.chave} value={c.chave}>
                                    {c.rotulo}
                                    {c.origem === "extra" ? " (campo extra)" : ""}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="roteiro-remover"
                              title="Remover esta troca"
                              onClick={() =>
                                mexerNoEmbaralho((c) => ({ ...c, trocas: c.trocas.filter((_, i) => i !== idx) }))
                              }
                            >
                              ×
                            </button>
                          </div>
                          <p className="hint" style={{ margin: 0 }}>
                            {dir === "par"
                              ? `${rotuloDaChave(t.a, catalogo)} e ${rotuloDaChave(t.b, catalogo)} trocam de lugar.`
                              : `No lugar de ${rotuloDaChave(t.a, catalogo).toLowerCase()} vai ${rotuloDaChave(
                                  t.b,
                                  catalogo
                                ).toLowerCase()}; ${rotuloDaChave(t.b, catalogo).toLowerCase()} continua certo.`}
                          </p>
                          {travada && (
                            <p className="hint troca-alerta">
                              Ninguém preenche {rotuloDaChave(t.a, catalogo).toLowerCase()} — ela só pode
                              receber. Hoje essa chave vai crua pro avatar; assim ela passa a chegar com um
                              valor (errado, que é o ponto).
                            </p>
                          )}
                          {semDoador.length > 0 && (
                            <p className="hint troca-alerta">
                              {semDoador.join(", ")} não tem {rotuloDaChave(t.b, catalogo).toLowerCase()} — pra
                              essa pessoa a troca não vale.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="roteiro-rodape">
                    <button type="button" className="btn-secondary" onClick={adicionarTroca}>
                      + Adicionar troca
                    </button>
                    <span className="hint" style={{ margin: 0 }}>
                      Os campos que você não colocar aqui vão certinhos.
                    </span>
                  </div>
                </div>
              )}

              <div className="field">
                <label>Quando</label>
                <div className="troca-quando">
                  <select
                    value={embaralharConfig.quando.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as "sempre" | "na" | "apartir";
                      mexerNoEmbaralho((c) => ({
                        ...c,
                        quando: tipo === "sempre" ? { tipo } : { tipo, n: c.quando.n ?? 2 },
                      }));
                    }}
                  >
                    <option value="sempre">Toda vez que o dado for enviado</option>
                    <option value="na">Só na …ª vez que o dado for enviado</option>
                    <option value="apartir">Da …ª vez em diante</option>
                  </select>
                  {embaralharConfig.quando.tipo !== "sempre" && (
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={embaralharConfig.quando.n ?? 2}
                      onChange={(e) =>
                        mexerNoEmbaralho((c) => ({
                          ...c,
                          quando: { ...c.quando, n: Math.max(1, Number(e.target.value) || 1) },
                        }))
                      }
                    />
                  )}
                </div>
                <p className="hint" style={{ marginTop: 0 }}>
                  {embaralharConfig.quando.tipo === "sempre"
                    ? "A conversa inteira sai embaralhada, com ou sem roteiro de turnos."
                    : embaralharConfig.quando.tipo === "na"
                      ? "Conta as vezes que aquele dado aparece na conversa: só naquela vez ele sai trocado, nas outras vai certo."
                      : "Da vez escolhida em diante o dado passa a sair trocado — as anteriores vão certas."}
                </p>
              </div>

              {slots.length > 1 && (
                <div className="field">
                  <label>Com quem</label>
                  <div className="filter-op-row" style={{ maxWidth: 460 }}>
                    <button
                      type="button"
                      className={`filter-op-btn${embaralharConfig.alvo === "todas" ? " active" : ""}`}
                      onClick={() => mexerNoEmbaralho((c) => ({ ...c, alvo: "todas" }))}
                    >
                      Todas as pessoas
                    </button>
                    <button
                      type="button"
                      className={`filter-op-btn${embaralharConfig.alvo === "algumas" ? " active" : ""}`}
                      onClick={() =>
                        mexerNoEmbaralho((c) => ({
                          ...c,
                          alvo: "algumas",
                          // Marcar todo mundo ao entrar evita o estado sem
                          // sentido "embaralhar só algumas: nenhuma".
                          pessoas: c.pessoas.length ? c.pessoas : slots.map((_, i) => i),
                        }))
                      }
                    >
                      Só algumas
                    </button>
                  </div>
                  {embaralharConfig.alvo === "algumas" && (
                    <div className="embaralho-pessoas">
                      {slots.map((s, idx) => (
                        <label className="embaralho-pessoa" key={idx}>
                          <input
                            type="checkbox"
                            checked={embaralharConfig.pessoas.includes(idx)}
                            onChange={(e) =>
                              mexerNoEmbaralho((c) => ({
                                ...c,
                                pessoas: e.target.checked
                                  ? [...c.pessoas, idx]
                                  : c.pessoas.filter((x) => x !== idx),
                              }))
                            }
                          />
                          <span>
                            {s.preenchido ? s.dados.nome || "Sem nome" : `Vaga ${idx + 1}`}
                            {s.origem === "persona" ? <span className="hint"> · persona salva</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {previaEmbaralho && (
                <div className="eff-table-wrap">
                  <table className="eff-table">
                    <thead>
                      <tr>
                        <th>Chave</th>
                        <th>O que {previaEmbaralho.nome || "a primeira pessoa"} manda</th>
                        <th>Vem de</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previaEmbaralho.linhas.map((l) => (
                        <tr key={l.destino}>
                          <td>
                            <strong>{rotuloDaChave(l.destino, catalogo)}</strong>
                          </td>
                          <td>{l.valor || "—"}</td>
                          <td>
                            <span className="origem-tag persona">
                              valor de {rotuloDaChave(l.origem, catalogo).toLowerCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {etapa === 4 && (
        <div className="panel">
          <h3>Como ela se chama</h3>
          <div className="field">
            <label>Nome da simulação</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Cancelamento com cobrança duplicada"
            />
            <p className="hint">
              Onde a simulação roda não é perguntado aqui: ambiente e avatar são escolhidos no switch do
              card, na lista de Simulações, na hora de rodar.
            </p>
          </div>

          <div className="field">
            <label>Etiquetas</label>
            <TagPopover
              label="Selecionar etiquetas"
              options={availableTags}
              selected={tags}
              onToggle={(nome) =>
                setTags((prev) => (prev.includes(nome) ? prev.filter((t) => t !== nome) : [...prev, nome]))
              }
            />
            {tags.length > 0 && (
              <div className="tags" style={{ marginTop: 8 }}>
                {tags.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className="tag"
                    style={{
                      ...tagPillStyle(availableTags.find((at) => at.name === t)?.color),
                      cursor: "pointer",
                      border: "none",
                    }}
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    title="Remover"
                  >
                    {t} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label>Resumo</label>
            <div className="eff-table-wrap">
              <table className="eff-table resumo-table">
                <tbody>
                  <tr>
                    <td>
                      <strong>Pessoas</strong>
                    </td>
                    <td>
                      {slots.length} —{" "}
                      {[
                        slots.filter((s) => s.origem === "persona").length + " de personas salvas",
                        slots.filter((s) => s.origem === "ficticia").length + " fictícias",
                        slots.filter((s) => s.origem === "manual").length + " digitadas",
                      ].join(", ")}
                    </td>
                    <td className="eff-actions">
                      <button type="button" className="btn-link-accent" onClick={() => setEtapa(0)}>
                        etapa 1
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Cenário</strong>
                    </td>
                    <td>
                      {preview(cenario, 70)}
                      {cenariosIndividuaisAtivo &&
                        ` · ${slots.filter((s) => cenarioEfetivo(s).origem !== "simulacao").length} com cenário próprio`}
                    </td>
                    <td className="eff-actions">
                      <button type="button" className="btn-link-accent" onClick={() => setEtapa(1)}>
                        etapa 2
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Turnos</strong>
                    </td>
                    <td>
                      Até {maxTurnos || "?"} turnos
                      {slots.length > 1 ? ` · ${maxSimultaneos} conversas ao mesmo tempo` : ""}
                      {mensagensPorTurno && roteiro.length
                        ? ` · roteiro de ${roteiro.length} ${roteiro.length === 1 ? "turno" : "turnos"}`
                        : ""}
                      {mensagensPorTurno && roteiro.length && rodarRoteiroCompleto
                        ? " · roda o roteiro inteiro"
                        : ""}
                      {(() => {
                        const n = mensagensPorTurno ? roteiro.reduce((s, t) => s + anexosDaLinha(t).length, 0) : 0;
                        return n ? ` · ${n} ${n === 1 ? "anexo" : "anexos"}` : "";
                      })()}
                    </td>
                    <td className="eff-actions">
                      <button type="button" className="btn-link-accent" onClick={() => setEtapa(2)}>
                        etapa 3
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Dados</strong>
                    </td>
                    <td>{resumoEmbaralho}</td>
                    <td className="eff-actions">
                      <button type="button" className="btn-link-accent" onClick={() => setEtapa(3)}>
                        etapa 4
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {erro && <p className="status-msg err">{erro}</p>}

      <div className="wizard-nav">
        <div className="actions-row">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          {etapa > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setEtapa(etapa - 1)} disabled={saving}>
              ← Voltar
            </button>
          )}
        </div>
        <div className="actions-row">
          {etapa < ETAPAS.length - 1 && (
            <button type="button" className="btn-primary" onClick={() => setEtapa(etapa + 1)}>
              Continuar para {ETAPAS[etapa + 1].toLowerCase()} →
            </button>
          )}
          {etapa === ETAPAS.length - 1 && (
            // Um botão só: salvar. Rodar é no switch do card, na lista de
            // Simulações, onde o ambiente e o avatar são escolhidos.
            <button
              type="button"
              className="btn-primary"
              disabled={saving || algumAnexoEnviando}
              onClick={() => salvar()}
            >
              {saving ? "Salvando..." : algumAnexoEnviando ? "Enviando anexo..." : "Salvar"}
            </button>
          )}
        </div>
      </div>

      <PersonaPickerModal
        open={personaPickerFor !== null}
        onClose={() => setPersonaPickerFor(null)}
        personas={personas}
        availableTags={availableTags}
        onPick={usarPersona}
      />

      <ScenarioPickerModal
        open={scenarioPickerFor !== null}
        onClose={() => setScenarioPickerFor(null)}
        scenarios={scenarios}
        availableTags={availableTags}
        onPick={usarCenarioSalvo}
      />

      {textoOpen && (
        <div className="modal-backdrop" onClick={() => setTextoOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Editar a lista como texto</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Uma pessoa por linha:
              {" nome;cpf;telefone;genero;email;nascimento;cidade;campo_extra_nome;campo_extra_valor"}. A
              quantidade de pessoas passa a ser o número de linhas.
            </p>
            {/* Precisa estar dentro de .field: é de lá que vêm largura total,
                fonte do site, padding e anel de foco (globals.css). Solta no
                modal, a textarea caía na fonte monoespaçada padrão do
                navegador e na largura default dele. */}
            <div className="field">
              <textarea rows={10} value={textoDraft} onChange={(e) => setTextoDraft(e.target.value)} />
            </div>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setTextoOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={aplicarEditorTexto}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarCorte !== null && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setConfirmarCorte(null);
            setQtdTexto(String(slots.length));
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Reduzir para {confirmarCorte} {confirmarCorte === 1 ? "pessoa" : "pessoas"}?
            </h3>
            <p className="hint" style={{ marginTop: 4, marginBottom: 16 }}>
              Isso remove {slots.length - confirmarCorte}{" "}
              {slots.length - confirmarCorte === 1 ? "pessoa já definida" : "pessoas já definidas"} do fim da
              lista, junto com o cenário próprio delas.
            </p>
            <div className="confirm-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setConfirmarCorte(null);
                  setQtdTexto(String(slots.length));
                }}
              >
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={() => aplicarAlvo(confirmarCorte)}>
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {editandoPessoaIdx !== null && (
        <div className="modal-backdrop" onClick={() => setEditandoPessoaIdx(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Cenário — {slots[editandoPessoaIdx]?.dados.nome || `Vaga ${editandoPessoaIdx + 1}`}</h3>
            <div className="field">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ margin: 0 }}>Cenário desta pessoa</label>
                <CenarioActions
                  onCenarioSalvo={() => setScenarioPickerFor("pessoa")}
                  onPadrao={() => inserirPadrao("pessoa")}
                />
              </div>
              <textarea rows={6} value={draftCenarioPessoa} onChange={(e) => setDraftCenarioPessoa(e.target.value)} />
            </div>
            <div className="field">
              <label>Critério de sucesso desta pessoa (opcional)</label>
              <textarea rows={3} value={draftCriterioPessoa} onChange={(e) => setDraftCriterioPessoa(e.target.value)} />
            </div>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setEditandoPessoaIdx(null)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={salvarCenarioDaPessoa}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
