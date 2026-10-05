export interface Tag {
    /** Nome de exibicao da tag. */
  name: string;
    /** Cor em hex (ex.: "#6366f1") usada para destacar a tag na interface. */
  color: string;
}

export interface AvatarTest {
    /** Identificador unico (slug) do teste. */
  id: string;
  name: string;
    /** Ex.: "Isabella", "ISA". */
  avatar: string;
    /** Ex.: "hml", "prod". */
  ambiente: string;
    /** Slug do host na Zenta (repassado como config.host_slug pro coisasdaisa). */
  hostSlug: string;
    /** Sub-slug opcional (multi-tenant), se o host tiver. */
  subSlug?: string;
    /** Sobrescreve a URL base da API da Zenta, se precisar (raro). */
  baseUrl?: string;
    /**
     * Legado: a primeira mensagem quando NAO ha roteiro de turnos. Desde
     * 02/09/2026 a abertura e o turno 1 do roteiro e o assistente nao mostra
     * mais essa caixa; o campo continua no banco como o texto da abertura das
     * simulacoes com o switch de turnos desligado.
     */
  saudacaoInicial: string;
    /** Limite de turnos antes de encerrar a conversa automaticamente. */
  maxTurnos: number;
    /** Descricao do cenario conversacional a simular. */
  cenario: string;
    /** Criterio livre que a IA usa pra decidir se o teste teve sucesso. Opcional. */
  criterioSucesso?: string;
    /** Dados fixos da persona simulada (ex.: nome, CPF), repassados como dados_fixos. */
  dadosFixos?: Record<string, unknown>;
    /** Tela do CRM relacionada, se fizer sentido registrar. */
  tela?: string;
  tags: string[];
    /** Data de criacao (ISO). */
  createdAt: string;
    /**
     * "unico": uma conversa só, cenario/criterioSucesso valem direto.
     * "lote": varias pessoas ao mesmo tempo — cenario/criterioSucesso viram
     * o Template compartilhado, e pessoas/maxSimultaneos/
     * cenariosIndividuaisAtivo/overridesPorPessoa guardam a config do lote
     * (mesmo formato do Estúdio de testes). Default "unico" pra testes
     * criados antes dessa distinção existir.
     */
  tipo?: "unico" | "lote";
    /** Lista de pessoas do lote (só quando tipo === "lote"). */
  pessoas?: PessoaDoLote[];
    /** Limite de execuções simultâneas do lote (só quando tipo === "lote"). */
  maxSimultaneos?: number;
    /** Se cada pessoa do lote pode ter cenário/critério próprio, além do Template. */
  cenariosIndividuaisAtivo?: boolean;
    /** Cenário/critério individual por pessoa, indexado pela posição na lista de "pessoas". */
  overridesPorPessoa?: Record<string, { cenario: string; criterio: string }>;
    /**
     * Etapa 3 do assistente de simulação: a pessoa simulada segue o roteiro
     * de `roteiroTurnos` em vez de improvisar a partir do cenário. É o
     * interruptor mestre — com ele desligado o roteiro continua salvo, mas a
     * execução ignora (01/09/2026).
     */
  mensagensPorTurno?: boolean;
    /**
     * O roteiro em si: uma linha por turno, sendo o turno 1 a mensagem de
     * abertura da conversa. Só tem efeito com `mensagensPorTurno` ligado.
     * Ver lib/roteiroTurnos.ts.
     */
  roteiroTurnos?: TurnoRoteiro[];
    /**
     * Etapa 3, sub-opção do roteiro (08/09/2026): rodar o roteiro INTEIRO
     * mesmo quando o critério de sucesso já foi atingido antes do fim.
     * Desligado (padrão), a conversa encerra em SUCESSO no turno em que o
     * critério é cumprido, como sempre foi. Ligado, o sucesso fica guardado e
     * a conversa segue mandando os turnos escritos; o veredito sai no fim,
     * levando em conta tudo o que aconteceu até a última mensagem. Só tem
     * efeito com `mensagensPorTurno` ligado e roteiro escrito.
     */
  rodarRoteiroCompleto?: boolean;
    /**
     * Etapa 4 do assistente de simulação: o interruptor mestre do
     * embaralhamento de dados. Ligado, a pessoa simulada manda os dados dela
     * nas chaves erradas (o valor certo, no lugar errado) — ver
     * `embaralharConfig` e lib/embaralhar.ts.
     *
     * Até 02/09/2026 esse campo era só uma preferência salva, e a caixa
     * prometia outra coisa ("entregar um dado de cada vez, fora de ordem").
     * Simulação salva antes disso, com o checkbox ligado, roda no padrão:
     * de qualquer jeito, todas as pessoas, toda vez.
     */
  embaralharDados?: boolean;
    /** Como embaralhar. Ausente = CONFIG_EMBARALHAR_PADRAO (lib/embaralhar.ts). */
  embaralharConfig?: EmbaralharConfig;
    /**
     * Arquivada (08/09/2026): sai da lista de Simulacoes e da selecao em lote
     * pra nao ocupar campo de visao, mas continua no banco — o link direto
     * dela abre normalmente e as execucoes antigas seguem no Relatorio e no
     * historico. E o "guardar sem apagar".
     */
  arquivada?: boolean;
    /** Posicao manual do card no Avatar IA — maior valor aparece primeiro. */
  ordem: number;
}

/** Uma troca escolhida a mão na etapa 4. `dir: "par"` = os dois campos trocam entre si; `"unico"` = só `a` recebe o valor de `b`. */
export interface TrocaEmbaralhada {
    /** Quem RECEBE o valor. */
  a: string;
    /** De quem vem o valor. */
  b: string;
  dir: "par" | "unico";
}

/**
 * Em que ocorrência do dado a troca vale. A contagem é por chave e por
 * conversa ("2ª vez que o CPF for enviado"), não por turno — assim vale
 * igual com o roteiro ligado ou desligado.
 */
export interface QuandoEmbaralhar {
  tipo: "sempre" | "na" | "apartir";
  n?: number;
}

export interface EmbaralharConfig {
    /** "aleatorio": sorteio sem ponto fixo entre os campos preenchidos. */
  modo: "aleatorio" | "trocas";
  trocas: TrocaEmbaralhada[];
  quando: QuandoEmbaralhar;
  alvo: "todas" | "algumas";
    /** Posições em `pessoas` (mesma indexação de `overridesPorPessoa`) quando alvo === "algumas". */
  pessoas: number[];
}

/**
 * Uma linha do roteiro de turnos (etapa 3 do assistente). O turno 1 é a
 * mensagem de abertura — a primeira coisa que a pessoa simulada manda, antes
 * de o avatar ter dito qualquer coisa.
 */
export interface TurnoRoteiro {
    /** Posição na conversa, a partir de 1 (o turno 1 é a abertura). */
  turno: number;
    /**
     * "exato": manda `texto` literalmente, ignorando o que o avatar
     * perguntou. "instrucao": a IA escreve com as próprias palavras seguindo
     * `texto`. "livre": turno sem exigência, conversa normal.
     */
  modo: "exato" | "instrucao" | "livre";
    /** A frase (modo "exato") ou o pedido (modo "instrucao"). Vazio em "livre". */
  texto: string;
    /**
     * Só em "instrucao": ignorar completamente a pergunta do avatar neste
     * turno, em vez de responder a ela e cumprir a instrução junto.
     */
  ignorarAvatar?: boolean;
    /**
     * Esta linha vale deste turno até o fim da conversa (é sempre a última da
     * lista). Sem ela, quando o roteiro acaba a conversa volta a improvisar.
     */
  emDiante?: boolean;
    /**
     * Marca de "esta linha está pronta", dada pelo botão Confirmar do
     * assistente — é o que deixa o card contornado de verde. Só existe pra
     * leitura humana: o motor executa o roteiro confirmado ou não.
     */
  confirmado?: boolean;
    /**
     * Imagens/PDFs que vão junto com a mensagem deste turno (05/10/2026).
     * Vale nos três modos: em "exato" o texto pode ficar vazio e o arquivo
     * vai sozinho; em "instrucao" e "livre" a IA escreve a fala e o arquivo
     * vai junto. MODO DEMO: só nome/tipo/tamanho são registrados (o arquivo
     * não sai do navegador) — ver lib/anexosTurno.ts.
     */
  anexos?: AnexoTurno[];
}

/** Um arquivo anexado a um turno do roteiro. */
export interface AnexoTurno {
    /** id da linha em `avatar_test_anexos`. */
  id: string;
    /** Nome original do arquivo, só pra mostrar. */
  nome: string;
    /** MODO DEMO: sempre vazio — o arquivo não sai do navegador (no projeto real, é o link do arquivo). */
  url: string;
    /** Content-type (image/png, application/pdf...). */
  tipo: string;
    /** Bytes. */
  tamanho: number;
}

/** Um turno da conversa (pergunta enviada + resposta do avatar), igual ao que o coisasdaisa devolve. */
export interface AvatarTurn {
  turno: number;
  enviado: string;
  resposta_avatar: string;
    /** Arquivos enviados junto com `enviado` neste turno, se houve. */
  anexos?: AnexoTurno[];
}

/**
 * Pessoa ficticia reutilizavel pra rodar um teste de avatar em lote contra
 * varias personas de uma vez. Os campos viram {placeholder} no cenario/
 * criterio do AvatarTest (ver lib/personaTemplate.ts) e sao enviados tambem
 * como dados_fixos pro coisasdaisa.
 */
export interface Persona {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  genero?: string;
  email?: string;
  nascimento?: string;
  cidade?: string;
  campoExtraNome?: string;
  campoExtraValor?: string;
    /** Quando um campo fica vazio na hora de rodar: gera valor ficticio ou manda em branco. */
  fallbackDadosPessoa: "ficticio" | "vazio";
    /**
     * Roteiro de conversa próprio desta persona (opcional). Quando
     * preenchido, a etapa 2 do assistente de simulação oferece esse cenário
     * como fonte concorrente ao cenário da simulação — é o que faz o
     * conflito "essa pessoa já tem cenário" existir. Persona sem cenário
     * continua entregando só os dados que preenchem os placeholders.
     */
  cenario?: string;
    /** Critério de sucesso que anda junto com o cenário próprio da persona. */
  criterioSucesso?: string;
  tags: string[];
    /** Foto da persona (base64 data URL, ja recortada em quadrado no navegador). Opcional. */
  foto?: string;
  createdAt: string;
}

export interface AvatarTestRun {
    /** Identificador unico (uuid) da execucao. */
  id: string;
    /** Id do teste de avatar executado, se ainda existir. */
  avatarTestId?: string;
    /** conversation_id gerado pela Zenta pro coisasdaisa, identifica a conversa real. */
  conversationId?: string;
    /** Desfecho devolvido pelo coisasdaisa. */
  resultado?: "SUCESSO" | "FALHA" | "ENCERRADO";
  motivoEncerramento?: string;
  totalTurnos?: number;
  maxTurnos?: number;
  tempoSegundos?: number;
    /** Transcricao completa turno a turno. */
  transcricao?: AvatarTurn[];
    /** Resumo/sentimento que a Zenta calcula sobre a conversa. */
  sentimento?: {
    resumo?: string | null;
    sentimento_score?: number | null;
    heat_score?: number | null;
  } | null;
    /** Inicio da conversa (ISO) — vem do proprio coisasdaisa. */
  startedAt: string;
    /** Quando o relatorio final foi salvo no hub (ISO). */
  finishedAt?: string;
    /** Persona usada, se essa execucao fez parte de um lote. */
  personaId?: string;
    /** Nome da persona no momento da execucao (sobrevive a persona ser apagada/editada depois). */
  personaNome?: string;
    /** Ambiente em que a conversa rodou, quando diferente do cadastro da simulacao. */
  ambienteExecucao?: string;
    /** Avatar com que a conversa rodou, quando diferente do cadastro da simulacao. */
  avatarExecucao?: string;
    /**
     * De-para do embaralhamento de dados usado nesta execucao (ex.:
     * "Nome ⇄ Cidade · Protocolo ← CPF"). Vazio = a pessoa mandou os dados
     * dela certinhos. Guardado porque o sorteio "de qualquer jeito" e refeito
     * a cada rodada: sem o registro, ninguem consegue reler o relatorio.
     */
  embaralhamento?: string;
}

/** Uma pessoa dentro de um preset de lote — mesmo formato da linha do painel "Pessoas do lote". */
export interface PessoaDoLote {
  nome: string;
  cpf?: string;
  telefone?: string;
  genero?: string;
  email?: string;
  nascimento?: string;
  cidade?: string;
  campoExtraNome?: string;
  campoExtraValor?: string;
}

/**
 * Preset de lote salvo: a lista completa de pessoas (geradas, digitadas ou
 * puxadas de personas salvas) + quantas execucoes simultaneas, pra rodar o
 * mesmo lote de novo sem montar tudo de novo.
 */
export interface AvatarTestBatch {
  id: string;
  avatarTestId: string;
  name: string;
  pessoas: PessoaDoLote[];
  maxSimultaneos: number;
  createdAt: string;
}

/**
 * Cenário reutilizável — roteiro de conversa salvo, separado da Persona
 * (que resolve dados fictícios da pessoa, não o roteiro em si). Pode ser
 * selecionado, em vez de digitado, em qualquer campo de cenário de um
 * AvatarTest (teste único, Template do lote, cenário por pessoa). Critério
 * de sucesso fica salvo junto porque os dois costumam andar juntos. Tags
 * usam o mesmo catálogo de /tags (Tag acima), diferente do texto livre
 * usado em Persona.
 */
export interface Scenario {
  id: string;
  nome: string;
  cenario: string;
  criterioSucesso?: string;
  tags: string[];
  createdAt: string;
}

/**
 * Um avatar cadastrado na aba "Avatares" (tabela `avatars`, 28/08/2026).
 *
 * A forma e a mesma de AvatarDestino em lib/destinos.ts — de proposito: as
 * funcoes que traduzem rotulo -> configuracao tecnica continuam funcionando do
 * mesmo jeito, agora recebendo a lista do banco em vez do mapa fixo.
 *
 * `execucoes` e `ultimaExecucao` NAO sao contagem de simulacoes: sao quantas
 * conversas ja rodaram nesse avatar (avatar_test_runs.avatar_execucao). A
 * diferenca importa — nenhum avatar e dono de simulacao, qualquer simulacao
 * roda em qualquer avatar. Contar simulacoes "do" avatar seria mentir sobre
 * isso; contar execucoes e o unico numero que responde "eu ainda testo aqui?".
 */
export interface SubavatarCadastro {
  nome: string;
  subSlug: string;
}

export interface AvatarCadastro {
  id: string;
  nome: string;
  hostSlug: string;
  subs: SubavatarCadastro[];
  /** Entrou sozinho ao salvar uma simulacao, e nao pelo botao "Novo avatar". */
  autoCadastrado: boolean;
  /**
   * Liga/desliga da aba "Avatares" (03/09/2026). Desativado continua cadastrado
   * (slug, subavatares e historico intactos) mas some do switch de avatar dos
   * cards: deixa de ser opcao pra rodar ate ser reativado la.
   */
  ativo: boolean;
  createdAt?: string;
  /** Conversas ja rodadas nesse avatar. */
  execucoes: number;
  /** Quando foi a ultima delas (ISO), ou null se nunca rodou aqui. */
  ultimaExecucao: string | null;
  /** Simulacoes APONTADAS pra ca agora — so pro aviso de apagar. */
  apontadas: number;
}
