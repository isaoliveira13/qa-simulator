"use client";

import { useMemo, useState } from "react";

/**
 * Modal "Colocar dentro de..." (13/10/2026) — ver lib/hierarquia.ts.
 *
 * Escolhe o script PAI de um ou varios scripts, em um de dois alcances:
 * - "linha"   — SO ESTE SCRIPT (aquele avatar + ambiente). Pedido da Isa: ex.
 *               "STG_aurora_gestor-texto" dentro de "STG_aurora_gestor-geral"
 *               sem mexer no gestor-texto de HML/PROD nem no da nimbus.
 * - "familia" — o mesmo teste em TODOS os ambientes e avatares.
 * A escolha "so este script" passa por cima da regra de todos.
 *
 * Alem da lista de pais, tem as duas saidas especiais: voltar ao padrao
 * (regra geral / automatico pelo nome) e "Nenhum" (fica solto na raiz).
 */

export type AlcancePai = "linha" | "familia";

export type OpcaoPai = {
  /** valor gravado (familia do pai) */
  familia: string;
  /** nome mostrado (no "so este script", o nome do script pai de verdade) */
  nome: string;
  /** onde existe, ex.: "HML, PROD · nimbus" */
  onde: string;
};

type Props = {
  titulo: string;
  alcance: AlcancePai;
  onAlcance: (a: AlcancePai) => void;
  rotuloLinha: string;
  rotuloFamilia: string;
  descricao: string;
  /** aviso extra embaixo da descricao (ex.: escolhas proprias que continuam valendo) */
  aviso?: string;
  opcoes: OpcaoPai[];
  /** pai de hoje (familia), pra marcar "atual" na lista */
  atual?: string | null;
  /** botao de voltar ao padrao */
  padrao: { rotulo: string; detalhe: string; habilitado: boolean };
  /** "Nenhum" e a escolha de hoje? */
  nenhumAtivo: boolean;
  salvando?: boolean;
  onEscolher: (pai: string | null) => void;
  onFechar: () => void;
};

export function EscolherPaiModal({
  titulo,
  alcance,
  onAlcance,
  rotuloLinha,
  rotuloFamilia,
  descricao,
  aviso,
  opcoes,
  atual,
  padrao,
  nenhumAtivo,
  salvando,
  onEscolher,
  onFechar,
}: Props) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? opcoes.filter((o) => o.nome.toLowerCase().includes(q) || o.familia.includes(q)) : opcoes;
  }, [busca, opcoes]);

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

        <div className="hier-especiais">
          <button
            type="button"
            className="hier-opcao"
            disabled={salvando || !padrao.habilitado}
            onClick={() => onEscolher(null)}
            title={!padrao.habilitado ? "Já está assim" : undefined}
          >
            <span className="hier-opcao-nome">{padrao.rotulo}</span>
            <span className="hier-opcao-onde">
              {padrao.detalhe}
              {!padrao.habilitado ? " · atual" : ""}
            </span>
          </button>
          <button
            type="button"
            className={`hier-opcao${nenhumAtivo ? " ativo" : ""}`}
            disabled={salvando}
            onClick={() => onEscolher("")}
          >
            <span className="hier-opcao-nome">Nenhum — fica solto na raiz</span>
            <span className="hier-opcao-onde">{nenhumAtivo ? "atual" : "ignora o automático pelo nome"}</span>
          </button>
        </div>

        <input
          className="hier-busca"
          placeholder="Buscar script pai..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoFocus
        />
        <div className="hier-lista">
          {visiveis.length === 0 && (
            <p className="em-massa-vazio">
              {opcoes.length === 0 ? "Nenhum script pode ser pai aqui." : "Nenhum script com esse nome."}
            </p>
          )}
          {visiveis.map((o) => (
            <button
              key={o.familia}
              type="button"
              className={`hier-opcao${atual === o.familia ? " ativo" : ""}`}
              disabled={salvando}
              onClick={() => onEscolher(o.familia)}
            >
              <span className="hier-opcao-nome">{o.nome}</span>
              <span className="hier-opcao-onde">
                {o.onde}
                {atual === o.familia ? (o.onde ? " · atual" : "atual") : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="confirm-modal-actions">
          <button className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
