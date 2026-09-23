// Chave de localStorage usada pra passar dados do "Teste avulso"
// (app/testes-avatar/avulso) pro formulário de criação de teste
// (app/testes-avatar) quando a pessoa clica em "Salvar como teste".
// Fica num arquivo à parte porque page.tsx no App Router só pode exportar
// alguns campos específicos (default, metadata, generateMetadata...) —
// qualquer outro export nomeado quebra o build ("not a valid Page export field").
export const PREFILL_STORAGE_KEY = "avatarTestPrefill";
