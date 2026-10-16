"use client";

import { useEffect, useMemo, useState } from "react";
import type { AlcancePai } from "./escolher-pai";

/**
 * Modal "Adicionar filhos..." (13/10/2026) — o caminho contrario do
 * "Colocar dentro de...": parte do PAI e marca quais scripts ficam dentro
 * dele. Os que ja estao dentro vem marcados; desmarcar tira de dentro.
 *
 * Mesmos dois alcances do outro modal:
 * - "linha"   — so os scripts do mesmo avatar e ambiente do pai, um a um;
 * - "familia" — o mesmo teste em todos os ambientes e avatares.
 */

export type OpcaoFilho = {
  /** chave gravada em script_pais ("id:<script>" ou familia) */
  chave: string;
  nome: string;
  /** contexto: onde existe / em que pai esta hoje */
  onde: string;
  /** ja esta dentro deste pai hoje */
  marcado: boolean;
};

type Props = {
  titulo: string;
  alcance: AlcancePai;
  onAlcance: (a: AlcancePai) => void;
  rotuloLinha: string;
  rotuloFamilia: string;
  descricao: string;
  aviso?: string;
  opcoes: OpcaoFilho[];
  salvando?: boolean;
  onSalvar: (adicionar: string[], remover: string[]) => void;
  onFechar: () => void;
};

export function EscolherFilhosModal({
  titulo,
  alcance,
  onAlcance,
  rotuloLinha,
  rotuloFamilia,
  descricao,
  aviso,
  opcoes,
  salvando,
  onSalvar,
  onFechar,
}: Props) {
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(opcoes.filter((o) => o.marcado).map((o) => o.chave)));

  // Trocar o alcance troca a lista inteira: recomeca das marcacoes de hoje.
  useEffect(() => {
    setMarcados(new Set(opcoes.filter((o) => o.marcado).map((o) => o.chave)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alcance]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = q ? opcoes.filter((o) => o.nome.toLowerCase().includes(q)) : opcoes;
    // Os que ja estao dentro primeiro.
    return [...lista].sort((a, b) => Number(b.marcado) - Number(a.marcado) || a.nome.localeCompare(b.nome));
  }, [busca, opcoes]);

  const adicionar = opcoes.filter((o) => !o.marcado && marcados.has(o.chave)).map((o) => o.chave);
  const remover = opcoes.filter((o) => o.marcado && !marcados.has(o.chave)).map((o) => o.chave);
  const mudou = adicionar.length + remover.length > 0;

  function alternar(chave: string) {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }

  function marcarVisiveis(marcar: boolean) {
    setMarcados((prev) => {
      const next = new Set(prev);
      visiveis.forEach((o) => (marcar ? next.add(o.chave) : next.delete(o.chave)));
      return next;
    });
  }

  const resumo = [
    adicionar.length > 0 ? `${adicionar.length} entra${adicionar.length === 1 ? "" : "m"}` : "",
    remover.length > 0 ? `${remover.length} sai${remover.length === 1 ? "" : "m"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="modal-backdrop" onClick={onFechar}>
      <div className="modal hier-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{titulo}</h3>

        <div className="hier-alcance" role="radiogroup" aria-label="Onde vale">
          <button
            type="button"
            role="radio"
            aria-checked={alcance === "linha"}
            className={`hier-alcance-btn${alcance === "linha" ? " ativo" : ""}`}
            onClick={() => onAlcance("linha")}
          >
            {rotuloLinha}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={alcance === "familia"}
            className={`hier-alcance-btn${alcance === "familia" ? " ativo" : ""}`}
            onClick={() => onAlcance("familia")}
          >
            {rotuloFamilia}
          </button>
        </div>
        <p className="hint">{descricao}</p>
        {aviso && <p className="hint hier-aviso">{aviso}</p>}

        <input
          className="hier-busca"
          placeholder="Buscar script..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoFocus
        />
        {visiveis.length > 0 && (
          <div className="hier-filhos-acoes">
            <span>
              {marcados.size} marcado{marcados.size === 1 ? "" : "s"}
            </span>
            <button type="button" onClick={() => marcarVisiveis(true)}>
              Marcar {busca.trim() ? "os da busca" : "todos"}
            </button>
            <button type="button" onClick={() => marcarVisiveis(false)}>
              Desmarcar {busca.trim() ? "os da busca" : "todos"}
            </button>
          </div>
        )}
        <div className="hier-lista">
          {visiveis.length === 0 && (
            <p className="em-massa-vazio">
              {opcoes.length === 0 ? "Nenhum script pode entrar aqui." : "Nenhum script com esse nome."}
            </p>
          )}
          {visiveis.map((o) => (
            <label key={o.chave} className={`hier-opcao hier-filho${marcados.has(o.chave) ? " ativo" : ""}`}>
              <input
                type="checkbox"
                className="card-checkbox"
                checked={marcados.has(o.chave)}
                onChange={() => alternar(o.chave)}
                disabled={salvando}
              />
              <span className="hier-opcao-nome">{o.nome}</span>
              <span className="hier-opcao-onde">{o.onde}</span>
            </label>
          ))}
        </div>

        <div className="confirm-modal-actions">
          {resumo && <span className="hier-filhos-resumo">{resumo}</span>}
          <button className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!mudou || salvando} onClick={() => onSalvar(adicionar, remover)}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
