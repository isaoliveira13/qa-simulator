/**
 * Importacao em massa de scripts (08/09/2026).
 *
 * Os arquivos de teste da Isa seguem um padrao de nome:
 *
 *   AMBIENTE_avatar_o-que-o-teste-faz.spec.js
 *   ex.: "HML_isa_campanha-template-imagem.spec.js"
 *
 * A partir desse nome da pra preencher sozinho os quatro campos que ela
 * digitava na mao em cada card: nome do teste, ambiente, avatar e cenario
 * (o conteudo do script vem do proprio arquivo). Tela do CRM, etiquetas e
 * anexo continuam por conta dela — opcionalmente em lote, na tela de
 * importacao.
 */

import { Framework } from "@/lib/types";

/** Extensoes aceitas, e o framework que cada uma representa. */
const EXTENSOES: { sufixo: string; framework: Framework }[] = [
  { sufixo: ".spec.ts", framework: "playwright" },
  { sufixo: ".spec.js", framework: "playwright" },
  { sufixo: ".cy.ts", framework: "cypress" },
  { sufixo: ".cy.js", framework: "cypress" },
];

/** Ambientes conhecidos — usados so pra avisar quando o nome foge do padrao. */
export const AMBIENTES_CONHECIDOS = ["HML", "PROD", "STG"];

export interface TesteLido {
  /** Nome do teste na plataforma: o nome do arquivo sem a extensao. */
  nome: string;
  ambiente: string;
  avatar: string;
  /** Parte descritiva do nome, em texto legivel. */
  cenario: string;
  framework: Framework;
  /** Avisos sobre o nome (nao impedem a importacao, so pedem conferencia). */
  avisos: string[];
}

/** Diz se o arquivo tem cara de script de teste (pela extensao). */
export function ehArquivoDeTeste(nomeArquivo: string): boolean {
  return EXTENSOES.some((e) => nomeArquivo.toLowerCase().endsWith(e.sufixo));
}

/**
 * Transforma "campanha-template-imagem" em "Campanha template imagem".
 * Hifens e underscores viram espaco; a primeira letra vira maiuscula.
 */
export function cenarioLegivel(trecho: string): string {
  const texto = trecho
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Le o nome do arquivo e devolve os campos do card. Nunca falha: um nome
 * fora do padrao volta com os campos que deu pra deduzir e um aviso, pra
 * Isa completar na mao na tela de revisao.
 */
export function lerNomeDoArquivo(nomeArquivo: string): TesteLido {
  const avisos: string[] = [];

  const ext = EXTENSOES.find((e) => nomeArquivo.toLowerCase().endsWith(e.sufixo));
  const framework: Framework = ext?.framework ?? "playwright";
  if (!ext) avisos.push("Extensao fora do padrao (.spec.ts/.spec.js/.cy.ts/.cy.js).");

  // O nome do teste na plataforma nunca leva a extensao (ex.: ".spec.js"),
  // so o arquivo na maquina dela leva — regra confirmada em 08/09/2026.
  const nome = ext ? nomeArquivo.slice(0, nomeArquivo.length - ext.sufixo.length) : nomeArquivo;

  const partes = nome.split("_");
  let ambiente = "";
  let avatar = "";
  let descricao = "";

  if (partes.length >= 3) {
    ambiente = partes[0];
    avatar = partes[1];
    // O resto do nome pode ter underscore no meio; junta tudo de volta.
    descricao = partes.slice(2).join("_");
  } else {
    avisos.push("Nome fora do padrao AMBIENTE_avatar_descricao — confira os campos.");
    if (partes.length === 2) {
      ambiente = partes[0];
      descricao = partes[1];
    } else {
      descricao = nome;
    }
  }

  if (ambiente && !AMBIENTES_CONHECIDOS.includes(ambiente.toUpperCase())) {
    avisos.push(`Ambiente "${ambiente}" nao e HML, PROD nem STG.`);
  }

  return {
    nome,
    ambiente,
    avatar,
    cenario: cenarioLegivel(descricao),
    framework,
    avisos,
  };
}

/**
 * Casa o valor lido do nome do arquivo com um valor que ja existe na
 * plataforma, ignorando maiusculas/minusculas e acentos. Evita criar "HML" ao
 * lado de "hml" no filtro de ambiente (e "isa" ao lado de "Isa" no de avatar).
 */
export function normalizarParaExistentes(valor: string, existentes: string[]): string {
  if (!valor) return valor;
  const chave = (v: string) =>
    v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const alvo = chave(valor);
  const igual = existentes.find((e) => chave(e) === alvo);
  return igual ?? valor;
}
