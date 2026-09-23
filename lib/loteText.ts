// Formato de texto "uma pessoa por linha" usado no painel de lote — mesmo
// formato do coisasdaisa (index.html: linhaDePessoa/parsePessoas), pra poder
// gerar pessoas fictícias, colar personas salvas e editar tudo junto num só
// lugar, sem depender de cada pessoa já existir como Persona salva.

export type PessoaLinha = {
  nome: string;
  cpf: string;
  telefone: string;
  genero: string;
  email: string;
  nascimento: string;
  cidade: string;
  campoExtraNome: string;
  campoExtraValor: string;
};

export function linhaDePessoa(p: Partial<PessoaLinha> & { nome: string }): string {
  return [
    p.nome,
    p.cpf || "",
    p.telefone || "",
    p.genero || "",
    p.email || "",
    p.nascimento || "",
    p.cidade || "",
    p.campoExtraNome || "",
    p.campoExtraValor || "",
  ].join(";");
}

export function parsePessoas(texto: string): PessoaLinha[] {
  const raw = texto.trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [nome, cpf, telefone, genero, email, nascimento, cidade, campoExtraNome, campoExtraValor] = line
        .split(";")
        .map((s) => (s || "").trim());
      return {
        nome: nome || "Pessoa",
        cpf: cpf || "",
        telefone: telefone || "",
        genero: genero || "",
        email: email || "",
        nascimento: nascimento || "",
        cidade: cidade || "",
        campoExtraNome: campoExtraNome || "",
        campoExtraValor: campoExtraValor || "",
      };
    });
}

/** Converte a lista atual da textarea de volta pro texto (uma linha por pessoa). */
export function pessoasParaTexto(pessoas: PessoaLinha[]): string {
  return pessoas.map((p) => linhaDePessoa(p)).join("\n");
}

/**
 * Converte uma PessoaDoLote (campos opcionais, formato salvo num
 * AvatarTest/AvatarTestBatch) pro formato PessoaLinha (campos obrigatórios,
 * formato usado pelo painel "Pessoas do lote") — campo vazio vira string
 * vazia, sem fallback (mesma regra de pessoaLinhaParaDados).
 */
export function pessoaDoLoteParaLinha(p: {
  nome: string;
  cpf?: string;
  telefone?: string;
  genero?: string;
  email?: string;
  nascimento?: string;
  cidade?: string;
  campoExtraNome?: string;
  campoExtraValor?: string;
}): PessoaLinha {
  return {
    nome: p.nome || "Pessoa",
    cpf: p.cpf || "",
    telefone: p.telefone || "",
    genero: p.genero || "",
    email: p.email || "",
    nascimento: p.nascimento || "",
    cidade: p.cidade || "",
    campoExtraNome: p.campoExtraNome || "",
    campoExtraValor: p.campoExtraValor || "",
  };
}
