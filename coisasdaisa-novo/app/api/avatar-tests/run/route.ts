import { NextRequest, NextResponse } from "next/server";
import { getAvatarTest, getPersona, saveAvatarTestRun } from "@/lib/db";
import {
  DadosPessoa,
  normalizarChave,
  pessoaLinhaParaDados,
  preencherTemplate,
  resolverDadosPessoa,
} from "@/lib/personaTemplate";
import {
  chavesLivresDoTexto,
  embaralharDados,
  normalizarConfigEmbaralhar,
  pessoaEmbaralhada,
  ParOcorrencia,
} from "@/lib/embaralhar";
import { PessoaLinha } from "@/lib/loteText";
import { preencherRoteiro } from "@/lib/roteiroTurnos";
import { QuandoEmbaralhar, TurnoRoteiro } from "@/lib/types";
import { ConfigConversa, conversar } from "@/lib/qaConversa";

/**
 * Um turno agora acontece DENTRO desta funcao (fala pro avatar + decisao da
 * OpenAI), e nao mais num deploy separado. O caminho lento e o primeiro turno
 * de uma conversa nova: resolver o token do dominio, criar a conversa, esperar
 * o avatar e ainda esperar a OpenAI. Sem isso, o default curto da Vercel
 * derruba justamente as conversas que demoram mais — que sao as que mais
 * interessam olhar. (Planos que nao permitem 60s ignoram e usam o maximo
 * deles.)
 */
export const maxDuration = 60;

// O motor da simulacao roda AQUI DENTRO desde 27/08/2026. Antes esta rota era
// so uma ponte: repassava novo/continuar/encerrar pro deploy separado do
// `coisasdaisa` (COISASDAISA_URL) e devolvia o que viesse. O motor foi portado
// pra lib/qaConversa.ts + lib/zenta.ts + lib/qaSimulador.ts + lib/qaHeuristicas.ts,
// e a sessao da conversa saiu do Redis dele pro Postgres que o hub ja tinha.
//
// O contrato com o navegador nao mudou nada nessa migracao — de proposito: o
// card, o lote, a ficha, o historico e o PDF continuam falando com esta rota
// exatamente como falavam.
//
// Dois modos pra iniciar uma conversa ("novo", sem conversation_id):
//   - avatarTestId: usa a config de uma simulacao salva no banco. Ao terminar,
//     o relatorio final e sempre gravado no historico.
//   - avulso: usa a config mandada direto no corpo (Estudio de testes), sem
//     precisar de uma simulacao salva. Nada e persistido nesse modo — e o
//     jeito de "rodar so essa vez".
// Quando personaId/pessoa vem junto (execucao em lote), os placeholders {nome}
// {cpf} etc. no cenario/criterio sao resolvidos aqui antes de comecar a
// conversa — vale pros dois modos.

/**
 * Onde esta rodada acontece: o ambiente/avatar da simulacao no momento do
 * clique, mandado pelo cliente. Substitui host_slug/sub_slug/base_url do
 * teste salvo — nunca complementa, senao um destino de producao (base_url
 * nulo) herdaria a URL de homologacao do cadastro.
 *
 * Serve pra duas coisas: rodar apontando pra um lugar diferente do que esta
 * salvo (ex.: a tela avulsa, ou uma chamada externa) e, principalmente,
 * gravar no historico ONDE a conversa rodou. Isso ficou essencial desde que o
 * switch do card passou a trocar o ambiente da propria simulacao: sem isso, a
 * execucao de ontem passaria a mentir que rodou em prod so porque a simulacao
 * foi passada pra prod hoje.
 */
type DestinoExecucao = {
  avatar: string;
  ambiente: string;
  hostSlug: string;
  subSlug?: string | null;
  baseUrl?: string | null;
};

type AvulsoConfig = {
  cenario: string;
  criterioSucesso?: string;
  hostSlug: string;
  subSlug?: string;
  baseUrl?: string;
  saudacaoInicial: string;
  maxTurnos: number;
  mensagensPorTurno?: boolean;
  roteiroTurnos?: TurnoRoteiro[];
  rodarRoteiroCompleto?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const {
      avatarTestId,
      conversationId,
      encerrar,
      personaId,
      pessoa,
      pessoaIndex,
      avulso,
      cenarioOverride,
      criterioOverride,
      destino,
    }: {
      avatarTestId?: string;
      conversationId?: string;
      encerrar?: boolean;
      personaId?: string;
      pessoa?: PessoaLinha;
      // Posicao desta pessoa na lista do lote (mesma indexacao de
      // overridesPorPessoa). E o que permite o embaralhamento valer "so
      // pra algumas pessoas" — sem ele, a rota nao tem como saber quem
      // e quem, ja que o corpo manda os dados, nao o indice.
      pessoaIndex?: number;
      avulso?: AvulsoConfig;
      // Cenário/critério dessa pessoa específica, quando o teste salvo (ou o
      // avulso) tem "Cenários diferentes por pessoa" ativado — sobrescreve
      // test.cenario/test.criterioSucesso só nessa chamada, sem alterar o
      // Template salvo no teste.
      cenarioOverride?: string;
      criterioOverride?: string;
      destino?: DestinoExecucao;
    } = await req.json();

    if (!avatarTestId && !conversationId && !avulso) {
      return NextResponse.json(
        { error: "Informe avatarTestId (teste salvo) ou avulso (config inline)." },
        { status: 400 }
      );
    }

    // MODO DEMO: no máximo 10 pessoas por lote, pra não sobrecarregar — vale
    // mesmo que o painel "Pessoas do lote" (ou um preset salvo) tenha mais.
    if (pessoaIndex != null && pessoaIndex >= 10) {
      return NextResponse.json(
        { error: "Esta é uma demonstração: o lote é limitado a 10 pessoas." },
        { status: 400 }
      );
    }

    const test = avatarTestId ? await getAvatarTest(avatarTestId) : null;
    if (avatarTestId && !test) {
      return NextResponse.json({ error: "Teste de avatar não encontrado." }, { status: 404 });
    }

    // Duas formas de mandar quem é a "pessoa" dessa conversa (lote):
    //   - personaId: referencia uma Persona salva — busca no banco e aplica
    //     o fallback dela (gera dado ficticio se campo vazio).
    //   - pessoa: já vem pronta do painel "Pessoas do lote" (gerada,
    //     digitada ou copiada de uma persona salva no momento em que foi
    //     adicionada) — usa direto, sem fallback (o texto já é o dado final).
    // Em ambos os casos guarda o nome pra gravar no relatorio final,
    // em qualquer chamada (novo/continuar/encerrar).
    let personaNome: string | undefined;
    let dadosPersona: ReturnType<typeof resolverDadosPessoa> | undefined;
    if (personaId) {
      const persona = await getPersona(personaId);
      if (!persona) {
        return NextResponse.json({ error: "Persona não encontrada." }, { status: 404 });
      }
      personaNome = persona.nome;
      dadosPersona = resolverDadosPessoa(persona);
    } else if (pessoa) {
      personaNome = pessoa.nome;
      dadosPersona = pessoaLinhaParaDados(pessoa);
    }

    // Continuar/encerrar nao precisam de config nenhuma: o estado da conversa
    // esta na sessao, achada pelo conversationId.
    let data: Awaited<ReturnType<typeof conversar>>;
    if (conversationId) {
      try {
        data = await conversar({ conversationId, encerrar: encerrar === true });
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
      }
    } else {
      // "novo": monta a partir do teste salvo (test) ou da config avulsa.
      // cenarioOverride/criterioOverride (cenário individual dessa pessoa)
      // tem prioridade sobre o Template do teste salvo, quando vier.
      let cenario = test ? cenarioOverride ?? test.cenario : avulso!.cenario;
      let criterioSucesso = test ? criterioOverride ?? test.criterioSucesso : avulso!.criterioSucesso;
      let dadosFixos: Record<string, unknown> | undefined = test ? test.dadosFixos : undefined;

      // --- Embaralhamento de dados (etapa 4 do assistente, 02/09/2026) ---
      // A pessoa manda os dados dela nas chaves erradas. Duas regras que
      // valem como principio desta parte:
      //   1. so o que ela MANDA sai trocado — o criterio de sucesso continua
      //      sendo preenchido com os dados de verdade, senao nao daria pra
      //      escrever "o avatar deve recusar porque o CPF nao bate";
      //   2. a troca acontece ANTES de preencher cenario e roteiro, num
      //      lugar so: dai pra frente ninguem mais precisa saber que houve
      //      embaralhamento.
      let embaralho: { pares: ParOcorrencia[]; quando: QuandoEmbaralhar; resumo: string } | null = null;
      // Os mesmos "extras" ({placa}, chaves livres preenchidas) precisam
      // valer tambem pro roteiro, preenchido mais abaixo.
      let extrasDoRoteiro: Record<string, string> | undefined;
      // Chaves que a pessoa escreveu no texto e ninguem preenche ({placa de
      // carro}): hoje vao cruas pro avatar, e o embaralhamento pode usa-las
      // como destino. Vem do cenario e do roteiro salvos, antes de qualquer
      // substituicao — depois de preenchido nao daria mais pra achar.
      const chavesLivres = chavesLivresDoTexto([
        cenario,
        ...((test ? test.roteiroTurnos : avulso!.roteiroTurnos) || []).map((t) => t.texto),
      ]);

      if (dadosPersona) {
        // Apelido do campo extra: persona com campo "placa" faz {placa}
        // funcionar como atalho do velho {campo_extra_valor}.
        const apelidoExtra = dadosPersona.campo_extra_nome
          ? normalizarChave(dadosPersona.campo_extra_nome)
          : "";

        // O criterio sempre com os dados de verdade (regra 1 acima).
        const extrasReais: Record<string, string> = {};
        if (apelidoExtra) extrasReais[apelidoExtra] = dadosPersona.campo_extra_valor;
        criterioSucesso = criterioSucesso
          ? preencherTemplate(criterioSucesso, dadosPersona, extrasReais)
          : criterioSucesso;

        let dadosEnviados: DadosPessoa = dadosPersona;
        const extrasEnviados: Record<string, string> = { ...extrasReais };

        const ligado = test ? !!test.embaralharDados : false;
        const config = ligado ? normalizarConfigEmbaralhar(test!.embaralharConfig) : null;
        if (config && pessoaEmbaralhada(config, pessoaIndex ?? null)) {
          const resultado = embaralharDados(dadosPersona, config, chavesLivres);
          if (Object.keys(resultado.mapa).length > 0) {
            dadosEnviados = { ...dadosPersona, ...resultado.dados } as DadosPessoa;
            if (apelidoExtra) extrasEnviados[apelidoExtra] = resultado.dados.campo_extra_valor || "";
            // Chave livre que recebeu valor deixa de ir crua pro avatar.
            for (const cl of chavesLivres) {
              if (resultado.dados[cl.chave]) extrasEnviados[cl.chave] = resultado.dados[cl.chave];
            }
            embaralho = { pares: resultado.pares, quando: config.quando, resumo: resultado.resumo };
          }
        }

        cenario = preencherTemplate(cenario, dadosEnviados, extrasEnviados);
        dadosFixos = dadosEnviados;
        dadosPersona = dadosEnviados;
        extrasDoRoteiro = extrasEnviados;
      }

      // Roteiro de turnos (etapa 3 do assistente): so vale com o switch
      // "Escrever a mensagem de cada turno" LIGADO — desligado, o roteiro
      // continua salvo na simulacao e a execucao ignora, que e o que o switch
      // promete. Os {placeholders} sao resolvidos aqui, no mesmo lugar em que
      // o cenario e resolvido: um roteiro so serve o lote inteiro, com cada
      // pessoa mandando os dados dela.
      const ligado = test ? !!test.mensagensPorTurno : !!avulso!.mensagensPorTurno;
      const roteiroSalvo = test ? test.roteiroTurnos : avulso!.roteiroTurnos;
      let roteiroTurnos: TurnoRoteiro[] | null =
        ligado && roteiroSalvo && roteiroSalvo.length ? roteiroSalvo : null;
      if (roteiroTurnos && dadosPersona) {
        // `dadosPersona` aqui ja e a versao que vai pra conversa (embaralhada,
        // quando for o caso) — o roteiro fala pela mesma boca que o cenario.
        roteiroTurnos = preencherRoteiro(roteiroTurnos, dadosPersona, extrasDoRoteiro);
      }

      // Com destino escolhido, host/sub/base vem inteiros dele (um destino de
      // producao tem base_url nulo de proposito); sem destino, do cadastro.
      const hostSlug = destino ? destino.hostSlug : test?.hostSlug;
      const subSlug = destino ? destino.subSlug : test?.subSlug;
      const baseUrl = destino ? destino.baseUrl : test?.baseUrl;

      const config: ConfigConversa = test
        ? {
            host_slug: hostSlug,
            ...(subSlug ? { sub_slug: subSlug } : {}),
            ...(baseUrl ? { base_url: baseUrl } : {}),
            saudacao_inicial: test.saudacaoInicial,
            max_turnos: test.maxTurnos,
            roteiro_turnos: roteiroTurnos,
            // So faz sentido com roteiro de verdade nesta execucao: sem
            // roteiro nao ha "fim do roteiro" pra esperar.
            rodar_roteiro_completo: !!roteiroTurnos && !!test.rodarRoteiroCompleto,
            embaralho,
          }
        : {
            host_slug: avulso!.hostSlug,
            ...(avulso!.subSlug ? { sub_slug: avulso!.subSlug } : {}),
            ...(avulso!.baseUrl ? { base_url: avulso!.baseUrl } : {}),
            saudacao_inicial: avulso!.saudacaoInicial,
            max_turnos: avulso!.maxTurnos,
            roteiro_turnos: roteiroTurnos,
            rodar_roteiro_completo: !!roteiroTurnos && !!avulso!.rodarRoteiroCompleto,
          };

      try {
        data = await conversar({
          cenario,
          ...(criterioSucesso ? { criterio_sucesso: criterioSucesso } : {}),
          ...(dadosFixos ? { dados_fixos: dadosFixos } : {}),
          config,
        });
      } catch (e: any) {
        // Erro de config (token do dominio faltando, avatar que nao existe
        // naquele ambiente, OpenAI sem chave) chega aqui com a mensagem
        // pronta pra tela — e o que faltava pra saber por que uma simulacao
        // "nao roda em lugar nenhum".
        return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
      }
    }

    // Conversa ainda em andamento: so repassa, nada pra persistir ainda.
    if (data.status === "continuar") {
      return NextResponse.json(data);
    }

    // Sem avatarTestId (modo avulso): nao grava nada, so devolve o relatorio.
    if (!avatarTestId) {
      return NextResponse.json(data);
    }

    // Relatorio final (tem "resultado") de um teste salvo: grava no historico do hub.
    const run = await saveAvatarTestRun({
      avatarTestId,
      conversationId: data.conversation_id,
      resultado: data.resultado,
      motivoEncerramento: data.motivo_encerramento,
      totalTurnos: data.total_turnos,
      maxTurnos: data.max_turnos,
      tempoSegundos: data.tempo_segundos,
      transcricao: data.transcricao,
      sentimento: data.sentimento_zenta,
      startedAt: data.inicio,
      ...(data.embaralhamento ? { embaralhamento: data.embaralhamento } : {}),
      ...(personaId ? { personaId } : {}),
      ...(personaNome ? { personaNome } : {}),
      // Sem destino explicito, vale a configuracao atual da simulacao — o
      // historico nunca fica sem dizer onde rodou.
      ...(destino
        ? { ambienteExecucao: destino.ambiente, avatarExecucao: destino.avatar }
        : test
        ? { ambienteExecucao: test.ambiente, avatarExecucao: test.avatar }
        : {}),
    });

    return NextResponse.json({ ...data, runId: run.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
