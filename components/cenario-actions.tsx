"use client";

import { ReactNode } from "react";

type Props = {
  /** Abre o modal "Usar persona" — omita onde escolher uma pessoa não faz sentido. */
  onPersona?: () => void;
  /** Abre o modal "Selecionar cenário salvo" — omita na própria Biblioteca de Cenários. */
  onCenarioSalvo?: () => void;
  /** Escreve o TEMPLATE_CENARIO_PADRAO no campo (passando pela ConflictModal se já tiver texto). */
  onPadrao: () => void;
  /** "Gerar pessoa fictícia" — só onde a ação preenche uma pessoa inteira de uma vez. */
  onFicticia?: () => void;
  /** Botões extras da tela, renderizados depois dos padrões. */
  children?: ReactNode;
};

/**
 * Fileira de botões que acompanha TODO campo de cenário do Avatar IA
 * (23/08/2026, a pedido da Isa): assistente de simulação, cenário por
 * pessoa, edição de simulação salva, cadastro de Persona e da Biblioteca de
 * Cenários. Antes cada tela montava a sua fileira na mão, com um conjunto
 * diferente de botões em cada lugar — o "Inserir cenário padrão" nasceu
 * junto com este componente justamente pra não repetir esse espalhamento.
 *
 * Cada botão só aparece se a tela passar o handler correspondente; nenhum
 * deles decide o que fazer com um campo já preenchido — quem chama resolve
 * isso (normalmente abrindo a ConflictModal, ver lib/cenarioConflict.ts).
 */
export function CenarioActions({ onPersona, onCenarioSalvo, onPadrao, onFicticia, children }: Props) {
  return (
    <div className="actions-row cenario-actions">
      {onPersona && (
        <button type="button" className="btn-picker-accent" onClick={onPersona}>
          Usar persona
        </button>
      )}
      {onCenarioSalvo && (
        <button type="button" className="btn-picker-accent" onClick={onCenarioSalvo}>
          Selecionar cenário salvo
        </button>
      )}
      <button type="button" className="btn-picker-accent" onClick={onPadrao}>
        Inserir cenário padrão
      </button>
      {onFicticia && (
        <button type="button" className="btn-primary" onClick={onFicticia}>
          Gerar pessoa fictícia
        </button>
      )}
      {children}
    </div>
  );
}
