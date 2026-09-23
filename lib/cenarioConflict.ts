// Decide o que perguntar quando uma ação de preenchimento automático do
// campo Cenário (Usar persona…, Gerar pessoa fictícia, Selecionar cenário
// salvo) vai escrever em cima de um texto que já está lá. Isa pediu em
// 22/08/2026: NUNCA silencioso — sempre confirma antes de trocar o que já
// existe, mesmo quando a troca só completaria placeholders (sem apagar
// nada). Esse módulo só decide o título/corpo/botões da pergunta; quem
// chama (cada tela) decide o que cada botão realmente faz com o form.

/** Mesma lista de placeholders de lib/personaTemplate.ts (nome/cpf/telefone/etc). */
export const CENARIO_PLACEHOLDER_RE =
  /\{(nome|cpf|telefone|genero|email|nascimento|cidade|campo_extra_nome|campo_extra_valor)\}/;

export function hasCenarioPlaceholders(text: string): boolean {
  return CENARIO_PLACEHOLDER_RE.test(text);
}

export type ConflictActionButton = {
  label: string;
  variant?: "secondary";
  onClick: () => void;
};

export type ConflictState = {
  title: string;
  body: string;
  actions: ConflictActionButton[];
} | null;

/** Conflito ao escolher "Selecionar cenário salvo" com o campo já preenchido. */
export function buildScenarioConflict(opts: {
  scenarioNome: string;
  applyReplace: () => void;
}): ConflictState {
  return {
    title: "Você já tem um cenário nesse campo",
    body: `Selecionar "${opts.scenarioNome}" vai substituir o texto atual.`,
    actions: [{ label: "Substituir", onClick: opts.applyReplace }],
  };
}

/**
 * Conflito ao clicar "Inserir cenário padrão" com o campo já preenchido.
 * Mesma regra dos outros: nunca troca em silêncio (23/08/2026).
 */
export function buildPadraoConflict(opts: { applyReplace: () => void }): ConflictState {
  return {
    title: "Você já tem um cenário nesse campo",
    body: "Inserir o cenário padrão vai substituir o texto atual.",
    actions: [{ label: "Substituir pelo cenário padrão", onClick: opts.applyReplace }],
  };
}

/** Conflito ao clicar "Usar persona…" ou "Gerar pessoa fictícia" com o campo já preenchido. */
export function buildPersonaConflict(opts: {
  currentText: string;
  personaLabel: string;
  applyFillInPlace: () => void;
  applyReplaceDefault: () => void;
}): ConflictState {
  if (hasCenarioPlaceholders(opts.currentText)) {
    return {
      title: "Esse cenário tem campos como {nome}",
      body: `O que quer fazer com ${opts.personaLabel}?`,
      actions: [
        { label: "Preencher os placeholders deste cenário", onClick: opts.applyFillInPlace },
        { label: "Substituir tudo pelo texto padrão", variant: "secondary", onClick: opts.applyReplaceDefault },
      ],
    };
  }
  return {
    title: "Esse cenário não tem mais placeholders",
    body: `Não há mais campos como {nome} pra preencher. Quer substituir tudo pelo texto padrão com os dados de ${opts.personaLabel}?`,
    actions: [{ label: "Substituir", onClick: opts.applyReplaceDefault }],
  };
}
