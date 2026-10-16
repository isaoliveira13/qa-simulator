"use client";

/**
 * Importacao em massa de scripts (08/09/2026).
 *
 * Substitui o trabalho manual de abrir "Enviar script" um por um: a tela le os
 * arquivos direto da maquina, deduz nome/ambiente/avatar/cenario pelo padrao do
 * nome do arquivo (ver lib/importarTestes.ts) e cria os cards de uma vez.
 * Tela do CRM, etiquetas e anexo continuam por conta da Isa — as duas primeiras
 * podem ser aplicadas ao lote inteiro aqui mesmo.
 *
 * 08/09/2026 (ajuste): o seletor do sistema so deixa marcar arquivos de UMA
 * pasta por vez, e os testes dela moram em pastas diferentes. Por isso cada
 * selecao/varredura **soma** na lista em vez de substituir, e da pra memorizar
 * VARIAS pastas — "Varrer pastas" passa em todas de uma vez.
 *
 * 09/10/2026: etiqueta por script. Alem das etiquetas do lote (bloco 2), cada
 * teste novo da lista tem a propria linha de etiquetas com o "+" redondo dos
 * cards. Da pra acrescentar uma etiqueta so naquele script e tambem tirar dele
 * uma etiqueta do lote — o resto do lote continua com ela.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Framework, ScriptEntry, Tag } from "@/lib/types";
import { TagPopover } from "@/components/tag-popover";
import { TagQuickAdd } from "@/components/tag-quick-add";
import { sortTagsByColor, tagPillStyle } from "@/lib/tagColor";
import { TELAS } from "@/lib/telas";
// Prioridade por ambiente (13/10/2026) — ver lib/prioridade.ts.
import { PrioridadeSeletor } from "@/components/prioridade-seletor";
import { lerJson } from "@/lib/lerJson";
import { chaveDoScript, MapaPrioridades, Nivel } from "@/lib/prioridade";
import { ehArquivoDeTeste, lerNomeDoArquivo, normalizarParaExistentes } from "@/lib/importarTestes";
import {
  adicionarPasta,
  escolherPasta,
  garantirPermissao,
  HandleDePasta,
  pastasGuardadas,
  removerPasta,
  suportaPastaMemorizada,
  varrerPasta,
} from "@/lib/pastaLocal";

const DEFAULT_TAG_COLOR = "#6366f1";

type Situacao = "novo" | "existe" | "repetido";
type Resultado = "ok" | "erro";

interface Item {
  /** Identidade do item na lista: caminho + nome do arquivo. */
  chave: string;
  nomeArquivo: string;
  caminho: string;
  nome: string;
  ambiente: string;
  avatar: string;
  cenario: string;
  framework: Framework;
  conteudo: string;
  avisos: string[];
  situacao: Situacao;
  /** Script ja existente na plataforma com o mesmo nome, quando houver. */
  existente?: ScriptEntry;
  marcado: boolean;
  /** Etiquetas escolhidas so pra este script, alem das do lote. */
  tagsExtras: string[];
  /** Etiquetas do lote que ela tirou SO deste script. */
  tagsTiradas: string[];
  /**
   * Prioridade escolhida na linha deste script (13/10/2026). `undefined` =
   * nao mexeu: vale o nivel que a familia ja tem ou, se nao tiver, o do lote.
   */
  nivel?: Nivel | null;
  resultado?: Resultado;
  erro?: string;
}

function chaveDeComparacao(valor: string) {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export default function ImportarEmLotePage() {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [carregandoScripts, setCarregandoScripts] = useState(true);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  const [itens, setItens] = useState<Item[]>([]);
  const [lendo, setLendo] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [tagsDoLote, setTagsDoLote] = useState<string[]>([]);
  const [telaDoLote, setTelaDoLote] = useState("");
  // Prioridade pra todos os testes novos cuja familia ainda nao tem nivel.
  const [nivelDoLote, setNivelDoLote] = useState<Nivel | null>(null);
  const [prioridades, setPrioridades] = useState<MapaPrioridades>({});
  const [esconderExistentes, setEsconderExistentes] = useState(false);

  const [pastas, setPastas] = useState<HandleDePasta[]>([]);
  const [suportaPasta, setSuportaPasta] = useState(false);

  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });

  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/scripts")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.scripts)) setScripts(data.scripts);
      })
      .catch(() => {})
      .finally(() => setCarregandoScripts(false));

    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) setAvailableTags(data.tags);
      })
      .catch(() => {});

    fetch("/api/prioridades", { cache: "no-store" })
      .then((r) => lerJson(r))
      .then((data) => {
        if (!data.error && data.prioridades) setPrioridades(data.prioridades);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSuportaPasta(suportaPastaMemorizada());
    pastasGuardadas().then(setPastas);
  }, []);

  const avataresExistentes = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.avatar).filter(Boolean))),
    [scripts]
  );
  const ambientesExistentes = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.ambiente).filter(Boolean))),
    [scripts]
  );

  /**
   * Recalcula "novo / ja existe / repetido" pra lista inteira. Roda a cada vez
   * que arquivos entram na lista, porque um arquivo de outra pasta pode ter o
   * mesmo nome de um que ja estava ali.
   */
  const recalcular = useCallback(
    (lista: Item[], chavesNovas: Set<string>): Item[] => {
      const porNome = new Map(scripts.map((s) => [chaveDeComparacao(s.name), s]));
      const vistos = new Set<string>();

      return [...lista]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((item) => {
          if (item.resultado === "ok") return item;
          const chaveNome = chaveDeComparacao(item.nome);
          const existente = porNome.get(chaveNome);

          let situacao: Situacao = "novo";
          if (vistos.has(chaveNome)) situacao = "repetido";
          else if (existente) situacao = "existe";
          vistos.add(chaveNome);

          return {
            ...item,
            situacao,
            existente,
            // So decide a marcacao dos itens que acabaram de entrar; o que ela
            // ja marcou/desmarcou na mao continua como estava.
            marcado: chavesNovas.has(item.chave) ? situacao === "novo" : item.marcado,
          };
        });
    },
    [scripts]
  );

  /** Le os arquivos escolhidos e SOMA na lista de revisao. */
  const adicionarArquivos = useCallback(
    async (arquivos: { caminho: string; arquivo: File }[]) => {
      setLendo(true);
      setMsg(null);
      try {
        const validos = arquivos.filter((a) => ehArquivoDeTeste(a.arquivo.name));
        const ignorados = arquivos.length - validos.length;

        const lidos: Item[] = [];
        for (const { caminho, arquivo } of validos) {
          const lido = lerNomeDoArquivo(arquivo.name);
          lidos.push({
            chave: caminho,
            nomeArquivo: arquivo.name,
            caminho,
            nome: lido.nome,
            ambiente: normalizarParaExistentes(lido.ambiente, ambientesExistentes),
            avatar: normalizarParaExistentes(lido.avatar, avataresExistentes),
            cenario: lido.cenario,
            framework: lido.framework,
            conteudo: await arquivo.text(),
            avisos: lido.avisos,
            situacao: "novo",
            marcado: true,
            tagsExtras: [],
            tagsTiradas: [],
          });
        }

        let jaEstavam = 0;
        setItens((prev) => {
          const mapa = new Map(prev.map((i) => [i.chave, i]));
          const chavesNovas = new Set<string>();

          for (const novo of lidos) {
            const anterior = mapa.get(novo.chave);
            if (anterior) {
              jaEstavam += 1;
              // Mesmo arquivo de novo: atualiza so o conteudo, preserva o resto
              // (inclusive o que ela editou ou ja importou).
              mapa.set(novo.chave, { ...anterior, conteudo: novo.conteudo });
            } else {
              chavesNovas.add(novo.chave);
              mapa.set(novo.chave, novo);
            }
          }

          return recalcular(Array.from(mapa.values()), chavesNovas);
        });

        const adicionados = lidos.length - jaEstavam;
        if (lidos.length === 0) {
          setMsg({
            text: "Nenhum arquivo de teste encontrado (.spec.ts, .spec.js, .cy.ts, .cy.js).",
            ok: false,
          });
        } else {
          setMsg({
            text:
              `${adicionados} arquivo(s) adicionado(s) a lista` +
              (jaEstavam > 0 ? `, ${jaEstavam} ja estava(m) nela (conteudo atualizado)` : "") +
              (ignorados > 0 ? `. ${ignorados} arquivo(s) ignorado(s) por nao ser teste` : "") +
              ".",
            ok: true,
          });
        }
      } catch (err: any) {
        setMsg({ text: err.message || "Nao consegui ler os arquivos.", ok: false });
      } finally {
        setLendo(false);
      }
    },
    [ambientesExistentes, avataresExistentes, recalcular]
  );

  function arquivosDoInput(lista: FileList | null) {
    if (!lista) return [];
    return Array.from(lista).map((arquivo) => ({
      caminho: (arquivo as File & { webkitRelativePath?: string }).webkitRelativePath || arquivo.name,
      arquivo,
    }));
  }

  async function varrerHandles(handles: HandleDePasta[]) {
    if (handles.length === 0) return;
    setLendo(true);
    try {
      const achados: { caminho: string; arquivo: File }[] = [];
      for (const handle of handles) {
        const ok = await garantirPermissao(handle);
        if (!ok) {
          setMsg({ text: `Permissao de leitura negada na pasta "${handle.name}".`, ok: false });
          continue;
        }
        const desta = await varrerPasta(handle, ehArquivoDeTeste);
        // Prefixa com o nome da pasta pra duas pastas diferentes nunca colidirem
        // na lista (ex.: "hml/login.spec.js" em duas pastas distintas).
        achados.push(
          ...desta.map((a) => ({ caminho: `${handle.name}/${a.caminho}`, arquivo: a.arquivo }))
        );
      }
      await adicionarArquivos(achados);
    } catch (err: any) {
      setMsg({ text: err.message || "Nao consegui varrer as pastas.", ok: false });
      setLendo(false);
    }
  }

  async function handleAdicionarPasta() {
    try {
      const handle = await escolherPasta();
      const lista = await adicionarPasta(handle);
      setPastas(lista);
      await varrerHandles([handle]);
    } catch (err: any) {
      // AbortError = ela fechou o seletor; nao e erro.
      if (err?.name !== "AbortError")
        setMsg({ text: err.message || "Nao consegui abrir a pasta.", ok: false });
    }
  }

  async function handleRemoverPasta(indice: number) {
    setPastas(await removerPasta(indice));
  }

  function atualizarItem(chave: string, mudanca: Partial<Item>) {
    setItens((prev) => prev.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  }

  /** Etiquetas que este script vai receber: as do lote (menos as tiradas dele) + as proprias. */
  function tagsDoItem(item: Item): string[] {
    const doLote = tagsDoLote.filter((t) => !item.tagsTiradas.includes(t));
    return Array.from(new Set([...doLote, ...item.tagsExtras]));
  }

  /**
   * Marca/desmarca uma etiqueta so neste script. Se a etiqueta vem do lote,
   * desmarcar aqui tira ela so deste (e marcar de novo devolve); se nao vem,
   * entra/sai da lista propria do script.
   */
  function alternarTagDoItem(chave: string, tag: string) {
    setItens((prev) =>
      prev.map((i) => {
        if (i.chave !== chave) return i;
        const doLote = tagsDoLote.includes(tag);
        const tem = tagsDoItem(i).includes(tag);
        if (tem) {
          return {
            ...i,
            tagsExtras: i.tagsExtras.filter((t) => t !== tag),
            tagsTiradas: doLote ? [...i.tagsTiradas, tag] : i.tagsTiradas,
          };
        }
        return doLote
          ? { ...i, tagsTiradas: i.tagsTiradas.filter((t) => t !== tag) }
          : { ...i, tagsExtras: [...i.tagsExtras, tag] };
      })
    );
  }

  /** Chave de prioridade do script que esta linha vai criar/atualizar. */
  function chavePrioDoItem(item: Item): string {
    const nome = item.situacao !== "novo" && item.existente ? item.existente.name : item.nome.trim();
    const avatar = item.situacao !== "novo" && item.existente ? item.existente.avatar : item.avatar.trim();
    return nome && avatar ? chaveDoScript({ name: nome, avatar }) : "";
  }

  /**
   * Nivel que este script vai ter: o escolhido na linha; senao o que a
   * familia ja tem (equivalente de outro ambiente ja cadastrado); senao, pra
   * teste novo, o do lote. Script que ja existe nao herda o do lote, igual as
   * etiquetas.
   */
  function nivelDoItem(item: Item): Nivel | null {
    if (item.nivel !== undefined) return item.nivel;
    const chave = chavePrioDoItem(item);
    const daFamilia = chave ? prioridades[chave] ?? null : null;
    if (daFamilia) return daFamilia;
    return item.situacao === "novo" ? nivelDoLote : null;
  }

  const corDaTag = useMemo(() => new Map(availableTags.map((t) => [t.name, t.color])), [availableTags]);

  const visiveis = useMemo(
    () => (esconderExistentes ? itens.filter((i) => i.situacao === "novo") : itens),
    [itens, esconderExistentes]
  );
  const marcados = useMemo(() => itens.filter((i) => i.marcado), [itens]);
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((i) => i.marcado);

  function marcarTodosVisiveis(valor: boolean) {
    const chaves = new Set(visiveis.map((i) => i.chave));
    setItens((prev) => prev.map((i) => (chaves.has(i.chave) ? { ...i, marcado: valor } : i)));
  }

  async function importar() {
    const fila = itens.filter((i) => i.marcado);
    if (fila.length === 0) return;

    setImportando(true);
    setMsg(null);
    setProgresso({ feitos: 0, total: fila.length });

    let ok = 0;
    let falhas = 0;

    for (const item of fila) {
      try {
        if (!item.nome.trim() || !item.avatar.trim() || !item.ambiente.trim() || !item.cenario.trim()) {
          throw new Error("Preencha nome, avatar, ambiente e cenario.");
        }

        const atualizando = item.situacao !== "novo" && item.existente;

        // Ao atualizar um script que ja existe, so o conteudo vem do arquivo:
        // etiquetas, tela, anexo e agendamento ja configurados sao preservados.
        const tagsFinais = atualizando ? item.existente!.tags || [] : tagsDoItem(item);
        const telaFinal = atualizando ? item.existente!.tela || "" : telaDoLote;

        const payload: Record<string, unknown> = {
          name: atualizando ? item.existente!.name : item.nome.trim(),
          avatar: atualizando ? item.existente!.avatar : item.avatar.trim(),
          ambiente: atualizando ? item.existente!.ambiente : item.ambiente.trim(),
          cenario: atualizando ? item.existente!.cenario : item.cenario.trim(),
          tela: telaFinal || null,
          tags: tagsFinais.join(", "),
          framework: atualizando ? item.existente!.framework : item.framework,
          content: item.conteudo,
        };
        if (atualizando) {
          payload.id = item.existente!.id;
          if (item.existente!.schedule) payload.schedule = item.existente!.schedule;
        }

        const res = await fetch("/api/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Prioridade da familia: so grava quando muda o que ja existe.
        const chavePrio = chavePrioDoItem(item);
        const nivelFinal = nivelDoItem(item);
        if (chavePrio && nivelFinal !== (prioridades[chavePrio] ?? null)) {
          const resPrio = await fetch("/api/prioridades", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chave: chavePrio, nivel: nivelFinal }),
          });
          const dataPrio = await lerJson(resPrio);
          if (dataPrio.error) throw new Error(`Script importado, mas a prioridade não: ${dataPrio.error}`);
          setPrioridades((prev) => {
            const next = { ...prev };
            if (nivelFinal) next[chavePrio] = nivelFinal;
            else delete next[chavePrio];
            return next;
          });
        }

        ok += 1;
        atualizarItem(item.chave, {
          resultado: "ok",
          erro: undefined,
          marcado: false,
          situacao: "existe",
          existente: data.entry,
        });
      } catch (err: any) {
        falhas += 1;
        atualizarItem(item.chave, { resultado: "erro", erro: err.message || "Falhou" });
      } finally {
        setProgresso((p) => ({ ...p, feitos: p.feitos + 1 }));
      }
    }

    // Recarrega a lista da plataforma pra refletir o que acabou de entrar.
    try {
      const res = await fetch("/api/scripts");
      const data = await res.json();
      if (!data.error && Array.isArray(data.scripts)) setScripts(data.scripts);
    } catch {}

    setImportando(false);
    setMsg({
      text:
        falhas === 0
          ? `${ok} teste(s) importado(s) com sucesso.`
          : `${ok} importado(s), ${falhas} com erro — veja a coluna de status.`,
      ok: falhas === 0,
    });
  }

  const selectedTagObjects = useMemo(() => {
    const byName = new Map(availableTags.map((t) => [t.name, t]));
    return [...tagsDoLote]
      .map((n) => byName.get(n) || { name: n, color: DEFAULT_TAG_COLOR })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [availableTags, tagsDoLote]);

  const ocupado = lendo || importando || carregandoScripts;

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Importar testes em lote</h1>
          <p className="subtitle">
            Escolha os arquivos da sua maquina: o nome do arquivo vira nome, ambiente, avatar e
            cenario do card, e o conteudo vira o script.
          </p>
        </div>
        <div className="header-actions">
          <Link className="btn btn-secondary" href="/upload">
            Enviar um por vez
          </Link>
        </div>
      </div>

      <div className="form-section">
        <h2 className="form-section-title">1. De onde vem os testes</h2>

        <div className="import-sources">
          <button
            type="button"
            className="btn-primary"
            onClick={() => inputArquivos.current?.click()}
            disabled={ocupado}
          >
            Adicionar arquivos
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => inputPasta.current?.click()}
            disabled={ocupado}
          >
            Adicionar uma pasta
          </button>

          {suportaPasta && (
            <>
              <span className="import-sep" />
              {pastas.length > 0 && (
                <button type="button" className="btn-primary" onClick={() => varrerHandles(pastas)} disabled={ocupado}>
                  Varrer {pastas.length === 1 ? "a pasta" : `as ${pastas.length} pastas`}
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={handleAdicionarPasta} disabled={ocupado}>
                {pastas.length > 0 ? "Memorizar mais uma pasta" : "Memorizar uma pasta"}
              </button>
            </>
          )}
        </div>

        <input
          ref={inputArquivos}
          type="file"
          multiple
          accept=".ts,.js"
          hidden
          onChange={(e) => {
            adicionarArquivos(arquivosDoInput(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={inputPasta}
          type="file"
          hidden
          multiple
          // @ts-expect-error atributo nao-padrao, suportado pelos navegadores
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            adicionarArquivos(arquivosDoInput(e.target.files));
            e.target.value = "";
          }}
        />

        <div className="hint">
          Cada escolha <strong>soma</strong> na lista de baixo — o seletor do sistema so deixa marcar
          arquivos de uma pasta por vez, entao repita quantas vezes precisar, misturando pastas
          diferentes. Uma pasta escolhida entra com as subpastas juntas.
        </div>

        {suportaPasta ? (
          <>
            {pastas.length > 0 && (
              <div className="import-pastas">
                {pastas.map((pasta, i) => (
                  <span className="import-pasta-chip" key={`${pasta.name}-${i}`}>
                    {pasta.name}
                    <button
                      type="button"
                      title="Esquecer esta pasta"
                      onClick={() => handleRemoverPasta(i)}
                      disabled={ocupado}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="hint">
              Pastas memorizadas ficam salvas neste navegador: depois de memorizadas, um clique em
              &quot;Varrer&quot; passa em todas de uma vez e traz o que ainda nao esta na plataforma.
            </div>
          </>
        ) : (
          <div className="hint">
            Este navegador nao sabe memorizar pastas — use &quot;Adicionar arquivos&quot; ou
            &quot;Adicionar uma pasta&quot;. (Memorizar funciona no Chrome e no Edge.)
          </div>
        )}
      </div>

      {itens.length > 0 && (
        <div className="form-section">
          <h2 className="form-section-title">2. Etiquetas, tela e prioridade do lote (opcional)</h2>
          <div className="row">
            <div className="field">
              <label>Etiquetas para todos os testes novos</label>
              <TagPopover
                label="Selecionar tags"
                options={availableTags}
                selected={tagsDoLote}
                onToggle={(tag) =>
                  setTagsDoLote((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )
                }
              />
              {selectedTagObjects.length > 0 && (
                <div className="day-chips selected-tags-row">
                  {selectedTagObjects.map((tag) => (
                    <button
                      type="button"
                      key={tag.name}
                      className="tag-chip selected"
                      style={{ background: tag.color, borderColor: tag.color, color: "#fff" }}
                      onClick={() => setTagsDoLote((prev) => prev.filter((t) => t !== tag.name))}
                      title="Remover"
                    >
                      {tag.name} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Tela do CRM para todos</label>
              <select value={telaDoLote} onChange={(e) => setTelaDoLote(e.target.value)}>
                <option value="">Nenhuma / deixo para depois</option>
                {TELAS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Prioridade para os testes novos</label>
            <div>
              <PrioridadeSeletor
                nivel={nivelDoLote}
                ambiente=""
                alcance="Vale para os testes novos cujo equivalente ainda não tem nível"
                onChange={setNivelDoLote}
                disabled={importando}
              />
            </div>
          </div>
          <div className="hint">
            Teste que já tem nível em outro ambiente ou avatar herda esse nível, e não o do lote.
            Pra mudar o nível de um teste só, use o selo na linha dele, em Revisar e importar.
          </div>
          <div className="hint">
            Vale so para os testes novos. Quem ja existe na plataforma mantem as etiquetas, a tela e
            o anexo que voce ja configurou — a importacao troca so o codigo do script. Pra etiquetar
            um script so (ou tirar dele uma etiqueta do lote), use o + na linha dele, em Revisar e importar.
          </div>
        </div>
      )}

      {itens.length > 0 && (
        <div className="form-section">
          <div className="import-toolbar">
            <h2 className="form-section-title">3. Revisar e importar</h2>
            <label className="import-inline-check">
              <input
                type="checkbox"
                checked={esconderExistentes}
                onChange={(e) => setEsconderExistentes(e.target.checked)}
              />
              Mostrar so os novos
            </label>
          </div>

          <div className="import-head">
            <label className="import-inline-check">
              <input
                type="checkbox"
                checked={todosVisiveisMarcados}
                onChange={(e) => marcarTodosVisiveis(e.target.checked)}
              />
              {marcados.length} de {itens.length} marcado(s)
            </label>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setItens([]);
                setMsg(null);
              }}
              disabled={importando}
            >
              limpar lista
            </button>
          </div>

          <div className="import-list">
            {visiveis.map((item) => (
              <div
                key={item.chave}
                className={`import-row${item.marcado ? " marcada" : ""}${
                  item.resultado === "erro" ? " com-erro" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="import-check"
                  checked={item.marcado}
                  disabled={importando}
                  onChange={(e) => atualizarItem(item.chave, { marcado: e.target.checked })}
                />

                <div className="import-fields">
                  <div className="import-file" title={item.caminho}>
                    {item.caminho}
                  </div>

                  <div className="import-grid">
                    <label>
                      <span>Nome do teste</span>
                      <input
                        value={item.nome}
                        disabled={importando || item.situacao !== "novo"}
                        onChange={(e) => atualizarItem(item.chave, { nome: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Ambiente</span>
                      <input
                        value={item.ambiente}
                        disabled={importando || item.situacao !== "novo"}
                        onChange={(e) => atualizarItem(item.chave, { ambiente: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Avatar</span>
                      <input
                        value={item.avatar}
                        disabled={importando || item.situacao !== "novo"}
                        onChange={(e) => atualizarItem(item.chave, { avatar: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Cenario</span>
                      <input
                        value={item.cenario}
                        disabled={importando || item.situacao !== "novo"}
                        onChange={(e) => atualizarItem(item.chave, { cenario: e.target.value })}
                      />
                    </label>
                  </div>

                  {item.situacao === "novo" && !item.resultado && (
                    <div className="tags import-tags">
                      <span className="import-tags-label">Etiquetas</span>
                      {sortTagsByColor(tagsDoItem(item), (t) => corDaTag.get(t)).map((t) => (
                        <button
                          type="button"
                          key={t}
                          className="tag import-tag"
                          style={tagPillStyle(corDaTag.get(t))}
                          onClick={() => alternarTagDoItem(item.chave, t)}
                          disabled={importando}
                          title={
                            tagsDoLote.includes(t)
                              ? "Etiqueta do lote — clique para tirar so deste script"
                              : "Clique para tirar esta etiqueta"
                          }
                        >
                          {t} ×
                        </button>
                      ))}
                      <TagQuickAdd
                        options={availableTags}
                        selected={tagsDoItem(item)}
                        onToggle={(t) => alternarTagDoItem(item.chave, t)}
                        onCatalogChange={setAvailableTags}
                        disabled={importando}
                      />
                    </div>
                  )}

                  {!item.resultado && (
                    <div className="tags import-tags">
                      <span className="import-tags-label">Prioridade</span>
                      <PrioridadeSeletor
                        nivel={nivelDoItem(item)}
                        ambiente={item.situacao !== "novo" && item.existente ? item.existente.ambiente : item.ambiente}
                        alcance="Vale para este teste em todos os ambientes e avatares"
                        onChange={(n) => {
                          // Equivalentes na mesma lista (HML_nimbus_x, PROD_aurora_x) andam juntos.
                          const familia = chavePrioDoItem(item);
                          setItens((prev) =>
                            prev.map((i) =>
                              i.chave === item.chave || (familia && chavePrioDoItem(i) === familia)
                                ? { ...i, nivel: n }
                                : i
                            )
                          );
                        }}
                        disabled={importando}
                      />
                    </div>
                  )}

                  {item.avisos.length > 0 && item.situacao === "novo" && (
                    <div className="import-aviso">{item.avisos.join(" ")}</div>
                  )}
                  {item.erro && <div className="import-aviso erro">{item.erro}</div>}
                </div>

                <div className="import-status">
                  {item.resultado === "ok" && <span className="import-badge ok">importado</span>}
                  {item.resultado === "erro" && <span className="import-badge erro">erro</span>}
                  {!item.resultado && item.situacao === "novo" && (
                    <span className="import-badge novo">novo</span>
                  )}
                  {!item.resultado && item.situacao === "existe" && (
                    <span className="import-badge existe" title="Marque para atualizar o codigo do script">
                      ja existe
                    </span>
                  )}
                  {!item.resultado && item.situacao === "repetido" && (
                    <span className="import-badge existe" title="Outro arquivo da lista tem o mesmo nome">
                      repetido
                    </span>
                  )}
                  <span className="import-framework">
                    {item.framework === "playwright" ? "Playwright" : "Cypress"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {importando && (
            <div className="import-progresso">
              Importando {progresso.feitos} de {progresso.total}...
            </div>
          )}

          <div className="import-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={importar}
              disabled={importando || lendo || marcados.length === 0}
            >
              {importando ? "Importando..." : `Importar ${marcados.length} teste(s)`}
            </button>
            <Link className="btn btn-secondary" href="/">
              Ver a Biblioteca
            </Link>
          </div>
        </div>
      )}

      {(lendo || carregandoScripts) && <p className="subtitle">Lendo arquivos...</p>}
      {msg && <div className={`status-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
    </div>
  );
}
