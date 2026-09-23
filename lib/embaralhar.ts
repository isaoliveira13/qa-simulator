/**
 * Etapa 4 do assistente de simulacao: "Embaralhar os dados".
 *
 * A pessoa simulada manda os dados dela nas chaves erradas — o valor certo,
 * no lugar errado — pra ver se o avatar percebe. Ate 02/09/2026 a etapa 4 era
 * so uma preferencia salva (`embaralhar_dados`), sem comportamento nenhum, e
 * a caixa prometia outra coisa ("entregar um dado de cada vez, fora de
 * ordem"): essa ideia saiu de cena, o nome ficou.
 *
 * Tres fontes alimentam a lista de campos trocaveis, e nenhuma delas passa
 * pela etapa 1 (regra da Isa, 02/09/2026 — a montagem das pessoas nao muda):
 *
 *   "pessoa" — os sete campos de sempre (nome, cpf, telefone, genero, email,
 *              nascimento, cidade), quando alguem do lote tem valor neles;
 *   "extra"  — o campo livre que a persona/pessoa ficticia trouxe. O nome
 *              dele vira apelido: persona com campo "placa" faz {placa}
 *              funcionar como atalho do velho {campo_extra_valor};
 *   "texto"  — qualquer {chave} escrita no cenario, num cenario individual ou
 *              no roteiro que ninguem preenche. Hoje ela vai crua pro avatar,
 *              com chaves e tudo; aqui ela vira DESTINO (pode receber o CPF),
 *              nunca origem — nao tem valor pra dar.
 *
 * O que este arquivo NAO toca: o criterio de sucesso. Ele continua sendo
 * preenchido com os dados de verdade, pra dar pra escrever "o avatar deve
 * recusar porque o CPF nao bate com {nome}" (ver
 * [[playwright-test-hub-criterio-sucesso-literal]]: a juiza julga so o texto
 * que a Isa escreveu).
 */

import { DadosPessoa, normalizarChave } from "./personaTemplate";
import { EmbaralharConfig, QuandoEmbaralhar, TrocaEmbaralhada } from "./types";

export { normalizarChave };
export type { EmbaralharConfig, QuandoEmbaralhar, TrocaEmbaralhada };

export type OrigemCampo = "pessoa" | "extra" | "texto";

/** Os sete campos fixos de uma pessoa, na ordem em que aparecem na tela. */
export const CAMPOS_PESSOA: { chave: string; rotulo: string }[] = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "genero", rotulo: "Gênero" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "cidade", rotulo: "Cidade" },
];

/** Chaves que o preencherTemplate ja conhece — nao viram "chave do seu texto". */
export const CHAVES_CONHECIDAS = [
  ...CAMPOS_PESSOA.map((c) => c.chave),
  "campo_extra_nome",
  "campo_extra_valor",
];

export const CONFIG_EMBARALHAR_PADRAO: EmbaralharConfig = {
  modo: "aleatorio",
  trocas: [],
  quando: { tipo: "sempre" },
  alvo: "todas",
  pessoas: [],
};

/**
 * Le a config gravada no banco (jsonb solto) sem confiar em nada. Simulacao
 * antiga, salva quando a etapa 4 era so um checkbox, cai no padrao: "de
 * qualquer jeito, todas as pessoas, toda vez" — que e a leitura mais fiel do
 * que o checkbox ligado prometia.
 */
export function normalizarConfigEmbaralhar(bruto: unknown): EmbaralharConfig {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const modo = o.modo === "trocas" ? "trocas" : "aleatorio";

  const trocas: TrocaEmbaralhada[] = Array.isArray(o.trocas)
    ? (o.trocas as unknown[])
        .map((t) => {
          const x = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
          return {
            a: String(x.a || ""),
            b: String(x.b || ""),
            dir: x.dir === "unico" ? ("unico" as const) : ("par" as const),
          };
        })
        .filter((t) => t.a && t.b && t.a !== t.b)
    : [];

  const q = (o.quando && typeof o.quando === "object" ? o.quando : {}) as Record<string, unknown>;
  const tipo = q.tipo === "na" || q.tipo === "apartir" ? q.tipo : "sempre";
  const n = Math.max(1, Math.floor(Number(q.n) || 2));

  const alvo = o.alvo === "algumas" ? "algumas" : "todas";
  const pessoas = Array.isArray(o.pessoas)
    ? (o.pessoas as unknown[]).map((p) => Number(p)).filter((p) => Number.isInteger(p) && p >= 0)
    : [];

  return {
    modo,
    trocas,
    quando: tipo === "sempre" ? { tipo: "sempre" } : { tipo, n },
    alvo,
    pessoas,
  };
}

/** Esta pessoa (pela posicao na lista do lote) entra no embaralhamento? */
export function pessoaEmbaralhada(config: EmbaralharConfig, indice: number | null | undefined): boolean {
  if (config.alvo !== "algumas") return true;
  if (indice == null) return true; // execucao sem indice (avulsa): trata como "todas"
  return config.pessoas.includes(indice);
}

// ---------------------------------------------------------------------------
// Chaves livres escritas no texto
// ---------------------------------------------------------------------------

/** Uma {chave} que a pessoa escreveu no cenario/roteiro e ninguem preenche. */
export interface ChaveLivre {
  /** Forma normalizada, usada como identificador (ex.: "placa_de_carro"). */
  chave: string;
  /** Todas as grafias encontradas no texto, com chaves (ex.: "{placa de carro}"). */
  grafias: string[];
  rotulo: string;
}

function comMaiuscula(s: string): string {
  const limpo = s.trim();
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : limpo;
}

/**
 * Varre um ou mais textos atras de {chaves} que nao sao as conhecidas. Guarda
 * todas as grafias de cada chave: a troca vale pra {Placa} e {placa} de uma
 * vez so.
 */
export function chavesLivresDoTexto(textos: (string | null | undefined)[]): ChaveLivre[] {
  const achadas = new Map<string, ChaveLivre>();
  const re = /\{([^{}\n]{1,60})\}/g;

  for (const texto of textos) {
    if (!texto) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(texto)) !== null) {
      const bruta = m[1];
      const chave = normalizarChave(bruta);
      if (!chave || CHAVES_CONHECIDAS.includes(chave)) continue;
      const grafia = `{${bruta}}`;
      const ja = achadas.get(chave);
      if (ja) {
        if (!ja.grafias.includes(grafia)) ja.grafias.push(grafia);
      } else {
        achadas.set(chave, { chave, grafias: [grafia], rotulo: comMaiuscula(bruta) });
      }
    }
  }

  return [...achadas.values()];
}

// ---------------------------------------------------------------------------
// Catalogo de campos (a lista dos seletores da etapa 4)
// ---------------------------------------------------------------------------

export interface CampoEmbaralhavel {
  chave: string;
  rotulo: string;
  origem: OrigemCampo;
  /** Placeholder pra mostrar na tela (ex.: "{placa}"). */
  placeholder: string;
  /** Alguem do lote tem valor nesse campo? Sem valor, so pode receber. */
  temValor: boolean;
}

function valorDe(dados: Partial<DadosPessoa> | Record<string, unknown>, chave: string): string {
  const v = (dados as Record<string, unknown>)[chave];
  return v == null ? "" : String(v).trim();
}

/**
 * A lista que aparece nos seletores da etapa 4, montada do que existe: campos
 * das pessoas escolhidas + o campo extra que elas trouxeram + as {chaves} que
 * a pessoa escreveu. Campo que ninguem preenche fica de fora, exceto as
 * chaves do texto, que existem justamente pra receber.
 */
export function catalogoDeCampos(
  pessoas: (Partial<DadosPessoa> | Record<string, unknown>)[],
  chavesLivres: ChaveLivre[]
): CampoEmbaralhavel[] {
  const lista: CampoEmbaralhavel[] = [];

  for (const c of CAMPOS_PESSOA) {
    const temValor = pessoas.some((p) => valorDe(p, c.chave) !== "");
    if (temValor) {
      lista.push({ ...c, origem: "pessoa", placeholder: `{${c.chave}}`, temValor: true });
    }
  }

  // Campo extra: o rotulo e o nome que quem cadastrou deu ("Placa"). Se as
  // pessoas do lote usam nomes diferentes, mostra o primeiro preenchido e
  // avisa quem nao tem na hora de aplicar.
  const comExtra = pessoas.find((p) => valorDe(p, "campo_extra_valor") !== "");
  if (comExtra) {
    const nome = valorDe(comExtra, "campo_extra_nome") || "Campo extra";
    lista.push({
      chave: "campo_extra_valor",
      rotulo: comMaiuscula(nome),
      origem: "extra",
      placeholder: `{${normalizarChave(nome) || "campo_extra_valor"}}`,
      temValor: true,
    });
  }

  for (const cl of chavesLivres) {
    lista.push({
      chave: cl.chave,
      rotulo: cl.rotulo,
      origem: "texto",
      placeholder: cl.grafias[0],
      temValor: false,
    });
  }

  return lista;
}

// ---------------------------------------------------------------------------
// O embaralhamento em si
// ---------------------------------------------------------------------------

/** Um par "o que sai" / "o que era", pra regra de ocorrencia desfazer depois. */
export interface ParOcorrencia {
  chave: string;
  /** O valor que vai sair na conversa (o de outro campo). */
  trocado: string;
  /** O valor verdadeiro daquela chave. */
  real: string;
}

export interface Embaralhamento {
  /** destino -> origem: a chave `destino` viaja com o valor de `origem`. */
  mapa: Record<string, string>;
  /** Os dados como serao enviados (inclui as chaves livres que receberam valor). */
  dados: Record<string, string>;
  pares: ParOcorrencia[];
  /** Linha legivel pro historico ("Nome ← Cidade · Cidade ← Nome"). */
  resumo: string;
}

/**
 * Permutacao sem ponto fixo: ninguem fica com o proprio valor. Com um campo
 * so nao existe embaralhamento possivel — devolve vazio em vez de fingir.
 */
function permutacaoSemPontoFixo(chaves: string[]): Record<string, string> {
  if (chaves.length < 2) return {};
  const ordem = [...chaves];
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    }
    if (ordem.every((k, i) => k !== chaves[i])) break;
  }
  // Ultimo recurso (sorteio azarado 60 vezes): rotaciona, que nunca tem ponto fixo.
  if (ordem.some((k, i) => k === chaves[i])) {
    const rot = [...chaves.slice(1), chaves[0]];
    return Object.fromEntries(chaves.map((k, i) => [k, rot[i]]));
  }
  return Object.fromEntries(chaves.map((k, i) => [k, ordem[i]]));
}

/**
 * Monta o embaralhamento de UMA pessoa. O sorteio e refeito a cada rodada (e
 * gravado no historico daquela execucao) — rodar a mesma simulacao duas vezes
 * da combinacoes diferentes, que e o sentido de "de qualquer jeito".
 */
export function embaralharDados(
  dados: DadosPessoa,
  config: EmbaralharConfig,
  chavesLivres: ChaveLivre[] = []
): Embaralhamento {
  const base: Record<string, string> = {};
  for (const c of CAMPOS_PESSOA) base[c.chave] = valorDe(dados, c.chave);
  base.campo_extra_valor = valorDe(dados, "campo_extra_valor");
  for (const cl of chavesLivres) base[cl.chave] = "";

  const comValor = Object.keys(base).filter((k) => base[k] !== "");

  let mapa: Record<string, string> = {};
  if (config.modo === "aleatorio") {
    // Chave sem valor fica fora do sorteio livre: se entrasse, o vazio dela
    // iria parar em cima de um dado de verdade e o embaralhamento viraria
    // "sumiu o telefone". Pra usar chave sua, e no modo "trocas".
    mapa = permutacaoSemPontoFixo(comValor);
  } else {
    for (const t of config.trocas) {
      if (!t.a || !t.b || t.a === t.b) continue;
      if (!(t.b in base) || base[t.b] === "") continue; // sem valor pra dar
      mapa[t.a] = t.b;
      if (t.dir === "par" && (t.a in base) && base[t.a] !== "") mapa[t.b] = t.a;
    }
  }

  // Tira quem ficou apontando pra si mesmo — nao e troca nenhuma.
  for (const destino of Object.keys(mapa)) {
    if (mapa[destino] === destino) delete mapa[destino];
  }

  const saida: Record<string, string> = { ...base };
  const pares: ParOcorrencia[] = [];
  for (const destino of Object.keys(mapa)) {
    const origem = mapa[destino];
    saida[destino] = base[origem] || "";
    if (saida[destino] && saida[destino] !== base[destino]) {
      pares.push({ chave: destino, trocado: saida[destino], real: base[destino] });
    }
  }

  return { mapa, dados: saida, pares, resumo: descreverEmbaralhamento(mapa) };
}

/** Rotulo humano de uma chave, pra tela e pro historico. */
export function rotuloDaChave(chave: string, catalogo?: CampoEmbaralhavel[]): string {
  const doCatalogo = catalogo?.find((c) => c.chave === chave);
  if (doCatalogo) return doCatalogo.rotulo;
  const fixo = CAMPOS_PESSOA.find((c) => c.chave === chave);
  if (fixo) return fixo.rotulo;
  if (chave === "campo_extra_valor") return "Campo extra";
  return comMaiuscula(chave.replace(/_/g, " "));
}

/**
 * "Nome ⇄ Cidade · Protocolo ← CPF" — troca reciproca vira uma linha so, pra
 * o historico nao repetir a mesma informacao de tras pra frente.
 */
export function descreverEmbaralhamento(mapa: Record<string, string>, catalogo?: CampoEmbaralhavel[]): string {
  const partes: string[] = [];
  const vistos = new Set<string>();
  for (const destino of Object.keys(mapa)) {
    if (vistos.has(destino)) continue;
    const origem = mapa[destino];
    const reciproco = mapa[origem] === destino;
    if (reciproco) {
      vistos.add(destino);
      vistos.add(origem);
      partes.push(`${rotuloDaChave(destino, catalogo)} ⇄ ${rotuloDaChave(origem, catalogo)}`);
    } else {
      vistos.add(destino);
      partes.push(`${rotuloDaChave(destino, catalogo)} ← ${rotuloDaChave(origem, catalogo)}`);
    }
  }
  return partes.join(" · ");
}

// ---------------------------------------------------------------------------
// Regra de ocorrencia ("so na 2a vez que o dado for enviado")
// ---------------------------------------------------------------------------

/**
 * A conversa inteira roda com os dados JA trocados (e o que faz a IA falar o
 * valor errado naturalmente, com ou sem roteiro). Quando a Isa pede "so na
 * 2a vez", esta funcao desfaz a troca nas ocorrencias que deveriam sair
 * certas, contando por chave ao longo da conversa.
 *
 * Sem roteiro quem escolhe a hora de dizer o CPF e a IA, entao a contagem e
 * feita procurando o valor no texto que ela gerou — e o unico jeito de
 * contar "vezes" numa conversa improvisada.
 */
export function ajustarOcorrencias(
  texto: string,
  pares: ParOcorrencia[],
  quando: QuandoEmbaralhar,
  contagem: Record<string, number>
): { texto: string; contagem: Record<string, number> } {
  if (!texto || quando.tipo === "sempre" || !pares.length) return { texto, contagem };

  const n = Math.max(1, Math.floor(quando.n || 2));
  const novaContagem: Record<string, number> = { ...contagem };
  let saida = texto;

  for (const par of pares) {
    if (!par.trocado) continue;
    let resto = saida;
    let montado = "";
    let pos = resto.indexOf(par.trocado);
    while (pos !== -1) {
      const vez = (novaContagem[par.chave] || 0) + 1;
      novaContagem[par.chave] = vez;
      const deveTrocar = quando.tipo === "na" ? vez === n : vez >= n;
      montado += resto.slice(0, pos) + (deveTrocar ? par.trocado : par.real);
      resto = resto.slice(pos + par.trocado.length);
      pos = resto.indexOf(par.trocado);
    }
    saida = montado + resto;
  }

  return { texto: saida, contagem: novaContagem };
}

/**
 * A frase que descreve o embaralhamento na linha "Dados" — resumo da etapa 5
 * do assistente e ficha da simulacao. Um lugar so pras duas telas dizerem a
 * mesma coisa.
 */
export function resumirEmbaralhamento(
  ligado: boolean | undefined,
  config: EmbaralharConfig | null | undefined,
  totalPessoas: number,
  catalogo?: CampoEmbaralhavel[]
): string {
  if (!ligado) return "Cada pessoa manda os dados dela certinhos";

  const cfg = normalizarConfigEmbaralhar(config);

  const mapa: Record<string, string> = {};
  if (cfg.modo === "trocas") {
    for (const t of cfg.trocas) {
      if (!t.a || !t.b || t.a === t.b) continue;
      mapa[t.a] = t.b;
      if (t.dir === "par") mapa[t.b] = t.a;
    }
  }
  const oQue =
    cfg.modo === "aleatorio"
      ? "Embaralhados de qualquer jeito"
      : Object.keys(mapa).length
        ? `Embaralhados — ${descreverEmbaralhamento(mapa, catalogo)}`
        : "Embaralhados (nenhuma troca escolhida ainda)";

  const n = cfg.quando.n ?? 2;
  const quando =
    cfg.quando.tipo === "sempre"
      ? ""
      : cfg.quando.tipo === "na"
        ? ` · só na ${n}ª vez que o dado for enviado`
        : ` · da ${n}ª vez em diante`;

  const quantas = cfg.pessoas.filter((i) => i < totalPessoas).length;
  const quem =
    totalPessoas <= 1 || cfg.alvo === "todas"
      ? totalPessoas > 1
        ? ` · todas as ${totalPessoas} pessoas`
        : ""
      : ` · ${quantas} de ${totalPessoas} pessoas`;

  return `${oQue}${quando}${quem}`;
}

