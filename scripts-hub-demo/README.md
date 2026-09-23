# Repositório de Scripts (versão de demonstração)

> **Esta é uma versão de portfólio, não o produto real.** Ela existe só pra
> quem visitar meu portfólio ter uma ideia de como o projeto funciona,
> clicando e navegando de verdade — sem depender de nenhum banco de dados,
> login, chave de API ou serviço externo. Ver a seção
> [Sobre esta demo](#sobre-esta-demo-o-que-é-diferente-do-projeto-real) pra
> entender exatamente o que está (e o que não está) ativo aqui.

Biblioteca e organização de scripts de teste (Playwright/Cypress): cada
script é um card com avatar, ambiente, cenário, tela do CRM coberta e
etiquetas; dá pra montar **suítes** (sequências de teste), guardar
**rascunhos** com histórico de versões antes de publicar, registrar um
**histórico de execução** manual, acompanhar a **cobertura por tela** num
checklist e salvar **filtros** reutilizáveis.

No projeto real (privado, usado internamente), o botão "Rodar" dispara de
verdade um workflow do GitHub Actions, que baixa o script do banco e roda o
teste num runner do GitHub; os anexos sobem pro Vercel Blob; e tudo fica
guardado num Postgres. **Nesta versão de demonstração, as três coisas são
substituídas por equivalentes locais e fictícios** — ver detalhes abaixo.

## Como funciona

- **Biblioteca** (`/`) — a tela inicial: todos os scripts, organizados por
  avatar/ambiente numa barra lateral de pastas, com filtro por avatar,
  ambiente e etiqueta, busca, seleção múltipla e arrastar-para-reordenar.
- **Enviar script** (`/upload`) — formulário de um script (ou edição de um já
  existente); **Importar em lote** (`/upload/lote`) — lê vários arquivos da
  sua máquina de uma vez e deduz nome/ambiente/avatar/cenário pelo nome do
  arquivo.
- **Rascunhos** (`/rascunhos`) — escreva e revise um script antes de publicar
  na Biblioteca, com histórico de versões e diff entre elas.
- **Suítes** (`/suites`) — sequências de teste, com sua própria ordem
  (independente da ordem da Biblioteca).
- **Histórico** (`/historico`) — registros manuais de execução (passou/falhou).
- **Cobertura** (`/cobertura`) — checklist de cenários por tela do CRM.
- **Checklist** (`/checklist`) — marcar cada script como aprovado/reprovado e
  emitir um PDF do resultado.
- **Tags** (`/tags`) — catálogo de etiquetas compartilhado por todas as telas
  acima.

## Sobre esta demo: o que é diferente do projeto real

- **Nenhum teste roda de verdade.** O botão "Rodar no meu terminal" só monta
  o comando (pra copiar e colar), e nunca o executa. `lib/github.ts` — que no
  projeto real disparava o workflow do GitHub Actions — nesta demo não faz
  nenhuma chamada de rede: `dispatchRun` e `getActionsUrl` devolvem URLs de
  exemplo na hora, e `deleteAttachment` não faz nada. Impossível, a partir
  deste repositório, disparar uma execução real em qualquer lugar.
- **Sem armazenamento externo.** Anexos não sobem pro Vercel Blob: a rota
  `app/api/blob-upload` recebe o arquivo e devolve uma *data URL* (o arquivo
  em base64), guardada no próprio registro em memória. Limite de **2MB** por
  anexo nesta demo (bem menor que os 200MB do produto real) — arquivos
  maiores são recusados com uma mensagem clara.
- **Sem banco de dados.** `lib/db.ts` não fala com Postgres nenhum: os dados
  (scripts, tags, suítes, execuções, rascunhos, cobertura, filtros salvos)
  vivem só na memória do processo, começam com alguns exemplos fictícios
  prontos e **reiniciam sozinhos a cada ~30 minutos**. O que uma pessoa vê
  pode não ser exatamente o que outra pessoa, em outro momento, está vendo.
- **Sem login.** O projeto real fica atrás de autenticação; esta demo é
  pública de propósito, pra qualquer um que clicar no link do portfólio
  conseguir navegar direto.
- **Limites da demo**, pra não sobrecarregar a memória do processo:

  | Limite | Valor |
  | --- | --- |
  | Scripts na Biblioteca | 30 |
  | Conteúdo de cada script | 50.000 caracteres |
  | Suítes | 10 |
  | Rascunhos | 10 |
  | Versões por rascunho | 10 (a mais antiga cai) |
  | Registros no histórico de execução | 50 (o mais antigo cai) |
  | Tamanho do anexo | 2MB |

  Passar de um limite de contagem (scripts, suítes, rascunhos) mostra uma
  mensagem clara em vez de deixar criar; os limites que só evitam acúmulo
  (versões de rascunho, histórico de execução) descartam o item mais antigo
  em silêncio, sem travar quem está usando.
- Um aviso fixo no topo de toda tela lembra que isto é uma demonstração e que
  nem toda função mostrada está totalmente ativa.

## Rodando localmente

Não precisa de nenhuma variável de ambiente, banco de dados ou conta:

```bash
npm install
npm run dev
```

## Deploy

Como não há banco nem variável obrigatória, basta importar o repositório em
[vercel.com](https://vercel.com/new) e dar deploy — sobe gratuito no plano
Hobby, sem nenhuma configuração adicional.

> Atenção: como os dados vivem na memória do processo, num ambiente
> serverless (como a Vercel) cada instância "fria" pode começar do zero de
> novo — é esperado, e é justamente o que garante que nada fica preso lá.
