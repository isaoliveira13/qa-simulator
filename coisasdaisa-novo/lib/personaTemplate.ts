// Resolve os placeholders {nome} {cpf} {telefone} {genero} {email}
// {nascimento} {cidade} {campo_extra_nome} {campo_extra_valor} num texto de
// cenario/criterio usando os dados de uma Persona — mesma convencao de
// placeholder do coisasdaisa (preencherTemplate em index.html). Campo vazio
// respeita o fallback da persona: "ficticio" gera um valor na hora, "vazio"
// deixa em branco mesmo.

import { Persona } from "./types";
import { gerarCPF, gerarNascimento, gerarPessoaFicticia, gerarTelefone } from "./fakePerson";
import { PessoaLinha } from "./loteText";

/**
 * Template padrão usado pelos botões "Usar persona…" / "Gerar pessoa
 * fictícia" do teste único e do modal de cenário individual do lote — mesmo
 * texto do coisasdaisa (TEMPLATE_CENARIO_PADRAO em index.html). Reaproveitado
 * aqui porque nossas Personas não têm um campo de cenário próprio (só dados
 * demográficos) — diferente do coisasdaisa original, onde cada persona
 * carrega seu próprio texto de cenário.
 */
export const TEMPLATE_CENARIO_PADRAO =
  "Simule que você é a pessoa {nome}, do CPF {cpf}, telefone {telefone}, gênero {genero}, email {email}, que nasceu no dia {nascimento} na cidade de {cidade}, e está usando a plataforma como qualquer outro usuário. Responda com naturalidade e cooperação a tudo que for pedido.";

/** Converte um PessoaFicticia (lib/fakePerson) pro formato DadosPessoa, sem campo extra. */
export function pessoaFicticiaParaDados(p: {
  nome: string;
  cpf: string;
  telefone: string;
  genero: string;
  email: string;
  nascimento: string;
  cidade: string;
}): DadosPessoa {
  return { ...p, campo_extra_nome: "", campo_extra_valor: "" };
}

/** Dados simples repassados como dados_fixos pro coisasdaisa (mesmas chaves dos placeholders). */
export type DadosPessoa = {
  nome: string;
  cpf: string;
  telefone: string;
  genero: string;
  email: string;
  nascimento: string;
  cidade: string;
  campo_extra_nome: string;
  campo_extra_valor: string;
};

/** Aplica o fallback da persona pra cada campo vazio, gerando dados ficticios quando preciso. */
export function resolverDadosPessoa(persona: Persona): DadosPessoa {
  const ficticio = persona.fallbackDadosPessoa !== "vazio";
  const gerada = ficticio ? gerarPessoaFicticia() : null;

  return {
    nome: persona.nome || gerada?.nome || "Pessoa",
    cpf: persona.cpf || (ficticio ? gerarCPF() : ""),
    telefone: persona.telefone || (ficticio ? gerarTelefone() : ""),
    genero: persona.genero || gerada?.genero || "",
    email: persona.email || gerada?.email || "",
    nascimento: persona.nascimento || (ficticio ? gerarNascimento() : ""),
    cidade: persona.cidade || gerada?.cidade || "",
    campo_extra_nome: persona.campoExtraNome || "",
    campo_extra_valor: persona.campoExtraValor || "",
  };
}

/**
 * Converte uma linha do painel "Pessoas do lote" (gerada, digitada ou colada
 * de uma persona salva) direto pro formato dados_fixos — sem fallback: se um
 * campo ficou vazio na linha, fica vazio mesmo (a linha já é o dado final,
 * diferente de uma Persona salva, cujo fallback é aplicado no momento em que
 * ela é adicionada à lista, não na hora de rodar).
 */
export function pessoaLinhaParaDados(p: PessoaLinha): DadosPessoa {
  return {
    nome: p.nome || "Pessoa",
    cpf: p.cpf || "",
    telefone: p.telefone || "",
    genero: p.genero || "",
    email: p.email || "",
    nascimento: p.nascimento || "",
    cidade: p.cidade || "",
    campo_extra_nome: p.campoExtraNome || "",
    campo_extra_valor: p.campoExtraValor || "",
  };
}

/**
 * Forma normalizada de uma {chave}: minusculas, sem acento, o que nao e letra
 * ou numero virando "_". E o que faz {Placa}, {placa} e {placa de carro}
 * caírem no mesmo lugar. Mora aqui (e nao em lib/embaralhar.ts, que a
 * reexporta) so pra evitar import circular.
 */
export function normalizarChave(bruta: string): string {
  return bruta
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Troca os {placeholders} de um texto pelos dados da pessoa.
 *
 * `extras` (02/09/2026, etapa 4) atende as chaves que nao sao as nove fixas,
 * indexado pela forma normalizada da chave: o apelido do campo extra da
 * persona ({placa} quando o campo extra se chama "placa") e as {chaves} que
 * a pessoa escreveu no cenario e que o embaralhamento preencheu. Chave que
 * continua sem valor fica como estava, crua — mesmo comportamento de antes.
 */
export function preencherTemplate(
  template: string,
  dados: DadosPessoa,
  extras?: Record<string, string>
): string {
  const base = template
    .replaceAll("{nome}", dados.nome)
    .replaceAll("{cpf}", dados.cpf)
    .replaceAll("{telefone}", dados.telefone)
    .replaceAll("{genero}", dados.genero)
    .replaceAll("{email}", dados.email)
    .replaceAll("{nascimento}", dados.nascimento)
    .replaceAll("{cidade}", dados.cidade)
    .replaceAll("{campo_extra_nome}", dados.campo_extra_nome)
    .replaceAll("{campo_extra_valor}", dados.campo_extra_valor);

  if (!extras) return base;

  return base.replace(/\{([^{}\n]{1,60})\}/g, (inteiro, chave: string) => {
    const valor = extras[normalizarChave(chave)];
    return valor ? valor : inteiro;
  });
}
