"use client";

/**
 * Anexos de um turno do roteiro (etapa 3 do assistente): escolher imagem/PDF
 * e mostrar como pílula com nome, tamanho e ×. Também exporta a versão só
 * leitura (`ListaAnexos`) que a ficha e as transcrições usam.
 *
 * MODO DEMO — o arquivo NUNCA é enviado: só nome, tipo e tamanho vão pra
 * /api/avatar-test-anexos, que registra na "tabela" em memória (lib/db.ts).
 * No projeto real o arquivo sobe pra um armazenamento e o link vai junto com
 * a mensagem pro avatar.
 */

import { useRef, useState } from "react";
import { AnexoTurno } from "@/lib/types";
import {
  ACCEPT_ANEXO,
  LIMITE_ANEXOS_POR_TURNO_DEMO,
  TAMANHO_MAX_ANEXO,
  ehImagem,
  ehPdf,
  tamanhoLegivel,
  tipoAnexoAceito,
} from "@/lib/anexosTurno";
import { guardarArquivoDaVisita } from "@/lib/anexosRelatorio";

function IconeClipe({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconeArquivo({ anexo, size = 14 }: { anexo: Pick<AnexoTurno, "tipo">; size?: number }) {
  if (ehImagem(anexo)) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

/** Pílula de um anexo. Com `onRemover`, ganha o ×; sem, é só leitura. */
export function PilulaAnexo({ anexo, onRemover }: { anexo: AnexoTurno; onRemover?: () => void }) {
  return (
    <span className={`anexo-pill${ehPdf(anexo) ? " pdf" : ""}`}>
      <IconeArquivo anexo={anexo} size={13} />
      {anexo.url ? (
        <a href={anexo.url} target="_blank" rel="noreferrer" title={anexo.nome}>
          {anexo.nome}
        </a>
      ) : (
        <span className="anexo-nome" title={anexo.nome}>
          {anexo.nome}
        </span>
      )}
      {anexo.tamanho > 0 && <span className="anexo-tam">{tamanhoLegivel(anexo.tamanho)}</span>}
      {onRemover && (
        <button type="button" className="anexo-remover" onClick={onRemover} aria-label={`Tirar ${anexo.nome}`}>
          ×
        </button>
      )}
    </span>
  );
}

/** Só leitura: ficha, histórico, transcrição ao vivo. */
export function ListaAnexos({ anexos }: { anexos?: AnexoTurno[] | null }) {
  if (!anexos || !anexos.length) return null;
  return (
    <span className="anexos-lista">
      {anexos.map((a) => (
        <PilulaAnexo key={a.id} anexo={a} />
      ))}
    </span>
  );
}

export function AnexosTurnoEditor({
  anexos,
  onChange,
  onEnviandoChange,
  turno,
}: {
  anexos: AnexoTurno[];
  onChange: (proximos: AnexoTurno[]) => void;
  /** Avisa o assistente quando há registro em andamento (trava o Salvar). */
  onEnviandoChange?: (enviando: boolean) => void;
  turno: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(files: FileList | null) {
    if (!files || !files.length) return;
    setErro(null);
    const lista = Array.from(files);
    const recusados = lista.filter((f) => !tipoAnexoAceito(f.type) || f.size > TAMANHO_MAX_ANEXO);
    let aceitos = lista.filter((f) => !recusados.includes(f));
    const vagas = Math.max(0, LIMITE_ANEXOS_POR_TURNO_DEMO - anexos.length);
    const msgs: string[] = [];
    if (recusados.length) {
      msgs.push(
        `${recusados.map((f) => f.name).join(", ")}: só imagem (PNG, JPG, WEBP, GIF) ou PDF, até ${tamanhoLegivel(TAMANHO_MAX_ANEXO)}.`
      );
    }
    if (aceitos.length > vagas) {
      msgs.push(`Nesta demo, no máximo ${LIMITE_ANEXOS_POR_TURNO_DEMO} arquivos por turno.`);
      aceitos = aceitos.slice(0, vagas);
    }
    if (msgs.length) setErro(msgs.join(" "));
    if (!aceitos.length) return;

    setEnviando(true);
    onEnviandoChange?.(true);
    const novos: AnexoTurno[] = [];
    try {
      for (const file of aceitos) {
        // Só os dados do arquivo — o conteúdo fica no navegador (modo demo).
        const res = await fetch("/api/avatar-test-anexos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: file.name, tipo: file.type, tamanho: file.size }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        novos.push(data.anexo as AnexoTurno);
        // O conteúdo continua só aqui no navegador — serve pra prévia no relatório PDF.
        guardarArquivoDaVisita((data.anexo as AnexoTurno).id, file);
      }
    } catch (e: any) {
      setErro(e?.message || "Falha ao registrar o arquivo.");
    } finally {
      setEnviando(false);
      onEnviandoChange?.(false);
    }
    if (novos.length) onChange([...anexos, ...novos]);
  }

  return (
    <div className="anexos-turno">
      {anexos.length > 0 && (
        <div className="anexos-lista">
          {anexos.map((a) => (
            <PilulaAnexo key={a.id} anexo={a} onRemover={() => onChange(anexos.filter((x) => x.id !== a.id))} />
          ))}
        </div>
      )}
      <div className="anexos-acoes">
        <button
          type="button"
          className="anexo-adicionar"
          onClick={() => inputRef.current?.click()}
          disabled={enviando || anexos.length >= LIMITE_ANEXOS_POR_TURNO_DEMO}
          aria-label={`Anexar imagem ou PDF ao turno ${turno}`}
          title="Nesta demo o arquivo não é enviado — só o nome e o tamanho ficam registrados."
        >
          <IconeClipe size={13} />
          {enviando ? "Registrando..." : "Anexar imagem ou PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ANEXO}
          multiple
          hidden
          onChange={(e) => {
            escolher(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {erro && <p className="status-msg err anexo-erro">{erro}</p>}
    </div>
  );
}
