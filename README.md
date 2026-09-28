# QA Simulator Chat — Avatar IA (versão de demonstração)

> **Esta é uma versão de portfólio, não o produto real.** Ela existe só pra
> quem visitar meu portfólio ter uma ideia de como o projeto funciona,
> clicando e navegando de verdade — sem depender de nenhum banco de dados,
> login, chave de API ou serviço externo. Ver a seção
> [Sobre esta demo](#sobre-esta-demo-o-que-é-diferente-do-projeto-real) pra
> entender exatamente o que está (e o que não está) ativo aqui.

Motor de simulação de conversas com um avatar de IA: monta um **cenário** (o
que a pessoa simulada vai dizer/fazer), roda uma conversa turno a turno
contra o avatar, e guarda o relatório final (resultado, transcrição
completa, tempo, sentimento) no histórico.

No projeto real (privado, usado internamente), esse motor conversa de
verdade com a API da Zenta e usa a OpenAI pra simular a pessoa do outro
lado. **Nesta versão de demonstração, os dois são substituídos por geradores
locais de texto fictício** — ver detalhes abaixo.

## Como funciona

- Tela **Simulações** (`/testes-avatar`) → assistente de 5 etapas (quem
  conversa, o que conversa, como conversa, como os dados chegam e como ela
  se chama) → **Rodar** dispara a conversa turno a turno e mostra ao vivo.
- **Personas** (`/personas`): biblioteca de pessoas fictícias reutilizáveis,
  pra rodar uma simulação contra várias pessoas de uma vez (lote).
- **Cenários** (`/cenarios`): biblioteca de roteiros de conversa reutilizáveis,
  selecionáveis em vez de digitados em qualquer campo de cenário.
- **Avatares** (`/avatares`): cadastro dos avatares/subavatares que alimentam
  o switch de avatar dos cards de Simulações.
- **Relatório** (`/testes-avatar/relatorio`): todas as execuções, com filtro e
  exportação em PDF.

## Sobre esta demo: o que é diferente do projeto real

- **Nenhuma chamada real é feita.** Não existe token de Zenta, não existe
  chave de OpenAI, e o código (`lib/zenta.ts`, `lib/qaSimulador.ts`) nem
  tenta abrir uma conexão de rede pra "rodar" uma simulação — impossível
  disparar um teste de verdade contra um avatar ou chat real a partir deste
  repositório.
- **As respostas são fictícias, mas não são texto solto.** Tanto a fala do
  avatar quanto a da pessoa simulada são montadas localmente a partir do
  **cenário** e do **critério de sucesso** que você mesmo digitar no
  formulário — cada conversa reflete o que foi escrito nela.
- **Limites da demo**, pra não sobrecarregar: no máximo **10 pessoas** por
  lote e no máximo **10 turnos** por conversa, mesmo que um número maior
  seja configurado numa simulação salva.
- **Nada é salvo nem compartilhado de verdade.** Não há banco de dados —
  tudo (simulações, personas, cenários, avatares, histórico) vive só na
  memória do servidor, começa com alguns exemplos prontos e **reinicia
  sozinho a cada ~30 minutos**. O que uma pessoa vê pode não ser exatamente
  o que outra pessoa, em outro momento, está vendo.
- **Sem login.** O projeto real fica atrás de autenticação; esta demo é
  pública de propósito, pra qualquer um que clicar no link do portfólio
  conseguir navegar direto.
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

## Simulações de avatar (motor de demonstração)

Uma **simulação** dispara uma conversa turno a turno. Tela **Simulações** →
assistente de 5 etapas (quem conversa, o que conversa, como conversa, como
os dados chegam e como ela se chama) → **Rodar** dispara a conversa e mostra
ao vivo; quando termina, o relatório final (resultado, transcrição completa,
tempo, sentimento) fica salvo no histórico da sessão atual.

**Como funciona por baixo, nesta versão de demo:**

- `lib/zenta.ts` — no projeto real, o cliente da API da Zenta. Aqui,
  `gerarRespostaAvatarFicticia` monta a fala do avatar localmente, ecoando o
  critério de sucesso quando "resolve" o atendimento.
- `lib/qaSimulador.ts` — no projeto real, a IA (OpenAI) que fazia o papel da
  **pessoa** e decidia continuar/sucesso/erro a cada turno. Aqui,
  `decidirProximoPasso` toma essa decisão localmente, e a fala da pessoa é
  montada a partir do cenário/critério digitados — sem nenhuma chamada de IA.
- `lib/qaHeuristicas.ts` — inalterado: continua detectando loop do avatar
  (repetição, falta de progresso) e barrando "sucesso" sem lastro no texto.
- `lib/qaConversa.ts` — a orquestração (`novo` / `continuar` / `encerrar`), o
  limite de 10 turnos e o relatório final.
- `lib/qaSessao.ts` — a conversa em andamento, num mapa em memória (era uma
  tabela do Postgres no projeto real), com validade de 1 hora.

O navegador fala só com `app/api/avatar-tests/run`.

### Personas e lote

Tela **Personas** (`/personas`): biblioteca de pessoas fictícias reutilizáveis
(nome, cpf, telefone, gênero, email, nascimento, cidade, campo extra, tags) —
botão "Gerar dados fictícios" preenche tudo automaticamente.

Em qualquer teste de avatar (salvo ou avulso), o botão **Rodar em lote** abre
o painel **"Pessoas do lote"**, com três formas de montar a lista (até o
limite de 10 pessoas desta demo), todas convergindo numa única textarea "uma
pessoa por linha" que é a fonte de verdade:
1. **Gerar N pessoas fictícias** e adicionar.
2. **Usar personas salvas** — chips com as personas da biblioteca.
3. **Editar direto na textarea** — colar ou digitar linhas manualmente.

Os placeholders `{nome} {cpf} {telefone} {genero} {email} {nascimento}
{cidade} {campo_extra_nome} {campo_extra_valor}` no cenário/critério do teste
são resolvidos com os dados de cada pessoa da lista antes de rodar.

Cada persona pode ter uma **foto** (recortada em quadrado no navegador,
guardada como data URL) e tags do catálogo compartilhado (aba **Tags**). A
biblioteca também tem botões **Exportar**/**Importar** (`.json`).

### Navegação, teste avulso e relatório

- **Teste avulso** (`/testes-avatar/avulso`): preenche cenário/critério/config
  na hora e roda sem precisar criar um teste salvo antes.
- **Preset de lote**: dentro de um teste salvo, o painel "Rodar em lote"
  deixa salvar a lista completa de pessoas + máx. simultâneos com um nome, e
  carregar de novo depois.
- **Relatório** (`/testes-avatar/relatorio`): lista todas as execuções desta
  sessão, com filtro por teste/resultado/busca livre e botão "Emitir
  relatório PDF" (jsPDF + jspdf-autotable).

### Pausar/retomar e exportar PDF de uma conversa

No teste único (tela de um teste salvo ou "Teste avulso"), enquanto a
conversa está rodando aparece um botão **Pausar/Retomar**. Ao terminar
(sucesso, falha ou encerrado manualmente), um botão **Exportar PDF** abre uma
aba nova com o relatório detalhado daquela conversa e aciona a impressão do
navegador. O mesmo botão existe em cada card do teste em lote e em cada
execução do histórico de um teste salvo.
