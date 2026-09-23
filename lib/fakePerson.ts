// Gerador de dados de pessoa ficticia — porta direta das funcoes
// equivalentes em coisasdaisa/index.html (gerarCPF/gerarTelefone/
// gerarNascimento/gerarPessoaFicticia), reaproveitado aqui pro botao
// "Gerar dados ficticios" no cadastro de persona e pro fallback automatico
// quando uma persona entra num lote com campo vazio e fallback = "ficticio".
// CPFs/telefones gerados aqui sao só pra simular conversa de teste — não são
// documentos reais nem passam por nenhuma validação de existência.

const NOMES_M = [
  "Carlos", "João", "Pedro", "Lucas", "Rafael", "Bruno", "Gustavo", "Marcelo",
  "Thiago", "André", "Felipe", "Rodrigo", "Diego", "Eduardo", "Vinícius",
];
const NOMES_F = [
  "Ana", "Maria", "Juliana", "Fernanda", "Camila", "Beatriz", "Larissa",
  "Patrícia", "Renata", "Carla", "Aline", "Bianca", "Débora", "Vanessa", "Priscila",
];
const SOBRENOMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Almeida",
  "Costa", "Pereira", "Carvalho", "Gomes", "Martins", "Araújo", "Melo", "Barbosa",
];
const CIDADES = [
  "São Paulo/SP", "Belo Horizonte/MG", "Curitiba/PR", "Recife/PE", "Porto Alegre/RS",
  "Salvador/BA", "Fortaleza/CE", "Brasília/DF", "Manaus/AM", "Goiânia/GO",
  "Campinas/SP", "Florianópolis/SC",
];
const DDDS = [11, 21, 31, 41, 51, 61, 71, 81, 85, 47, 48, 27, 62, 92];

function escolher<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DIACRITICOS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

function normalizarTexto(s: string) {
  return s.normalize("NFD").replace(DIACRITICOS_REGEX, "").toLowerCase();
}

export function gerarCPF(): string {
  const rnd = (n: number) => Math.floor(Math.random() * n);
  const base = Array.from({ length: 9 }, () => rnd(10));
  const calcDig = (arr: number[], factorStart: number) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] * (factorStart - i);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calcDig(base, 10);
  const d2 = calcDig([...base, d1], 11);
  const all = [...base, d1, d2];
  return (
    all.slice(0, 3).join("") +
    "." +
    all.slice(3, 6).join("") +
    "." +
    all.slice(6, 9).join("") +
    "-" +
    all.slice(9, 11).join("")
  );
}

export function gerarTelefone(): string {
  const ddd = escolher(DDDS);
  const parte1 = "9" + Math.floor(1000 + Math.random() * 8999);
  const parte2 = Math.floor(1000 + Math.random() * 8999);
  return `(${ddd}) ${parte1}-${parte2}`;
}

export function gerarNascimento(): string {
  const dia = String(Math.floor(1 + Math.random() * 28)).padStart(2, "0");
  const mes = String(Math.floor(1 + Math.random() * 12)).padStart(2, "0");
  const ano = Math.floor(1970 + Math.random() * 35);
  return `${dia}/${mes}/${ano}`;
}

export type PessoaFicticia = {
  nome: string;
  cpf: string;
  telefone: string;
  genero: string;
  email: string;
  nascimento: string;
  cidade: string;
};

export function gerarPessoaFicticia(): PessoaFicticia {
  const genero = Math.random() < 0.5 ? "masculino" : "feminino";
  const nome = genero === "masculino" ? escolher(NOMES_M) : escolher(NOMES_F);
  const sobrenome = escolher(SOBRENOMES);
  const nomeCompleto = `${nome} ${sobrenome}`;
  const email = `${normalizarTexto(nome)}.${normalizarTexto(sobrenome)}${Math.floor(
    10 + Math.random() * 89
  )}@exemplo.com`;
  return {
    nome: nomeCompleto,
    cpf: gerarCPF(),
    telefone: gerarTelefone(),
    genero,
    email,
    nascimento: gerarNascimento(),
    cidade: escolher(CIDADES),
  };
}
