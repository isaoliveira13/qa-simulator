"use client";

import { AvatarTest } from "@/lib/types";
import {
  AvatarDestino,
  ambientesConhecidos,
  avatarDesativado,
  avataresConhecidos,
} from "@/lib/destinos";

/**
 * Switch de destino do card de Simulacoes: duas fileiras (ambiente e avatar)
 * com todos os rotulos conhecidos, uma escolha por vez em cada uma.
 *
 * Conceito (dito pela Isa em 25/08/2026, e a regra que manda aqui): uma
 * simulacao e UMA so. Turnos, personas, pessoas, cenario e etiquetas sao dela
 * e nao mudam de lugar pra lugar; **ambiente e avatar sao o unico parametro
 * que varia** — o mesmo site rodando em homologacao, staging ou producao
 * continua sendo o mesmo site. Por isso este switch nao escolhe "qual das
 * copias", e sim onde ESSA simulacao roda: a selecao e lida da propria linha
 * (test.ambiente / test.avatar) e o clique grava nela (ver mudarDestino em
 * app/testes-avatar/page.tsx). Nao existe mais estado de cobertura
 * ("existe em hml, falta em prod"): toda simulacao roda em qualquer destino.
 *
 * O desenho e o mesmo do seletor Scripts/Avatar IA do header (.mode-switch).
 */

export type DimensaoDestino = "ambiente" | "avatar";

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function DestinoSwitch({
  test,
  ambientesUsados,
  avataresUsados,
  avatares: avataresCadastrados,
  disabled,
  onSelect,
}: {
  test: AvatarTest;
  /** Rotulos que ja aparecem nas simulacoes salvas, pra nao sumir nada antigo. */
  ambientesUsados: string[];
  avataresUsados: string[];
  /**
   * O cadastro da aba "Avatares" (28/08/2026) — e ele que manda no que aparece
   * aqui. Apagar um avatar la tira ele daqui sem excecao: se a simulacao deste
   * card estiver justamente nesse avatar, o switch fica sem nenhum segmento
   * marcado ate ela escolher outro. E honesto — o avatar da simulacao continua
   * o que era, so nao esta mais na lista de opcoes.
   *
   * Subavatar nunca aparece aqui: quem escolhe subavatar e o assistente.
   */
  avatares: AvatarDestino[];
  /** Trava a troca enquanto a simulacao esta rodando ou salvando. */
  disabled?: boolean;
  onSelect: (dimensao: DimensaoDestino, valor: string) => void;
}) {
  const ambientes = ambientesConhecidos(ambientesUsados);
  const avatares = avataresConhecidos(avataresUsados, avataresCadastrados);
  // O avatar desta simulacao foi desligado na aba "Avatares": ele nao aparece
  // mais na fileira (o switch fica sem nada marcado), entao o card diz por que
  // — sem isso, some uma pilula e ninguem sabe o motivo.
  const desativado = avatarDesativado(test.avatar, avataresCadastrados);

  return (
    <div className="destino">
      <span className="destino-lab">Ambiente</span>
      <div className="destino-switch">
        {ambientes.map((amb) => {
          const selecionado = igual(test.ambiente, amb);
          return (
            <button
              type="button"
              key={`amb-${amb}`}
              className={`destino-seg${selecionado ? " sel" : ""}`}
              aria-pressed={selecionado}
              disabled={disabled}
              onClick={() => onSelect("ambiente", amb)}
              title={
                selecionado
                  ? `"${test.name}" está configurada para rodar em ${amb}.`
                  : `Passar "${test.name}" para ${amb}. É a mesma simulação, só muda o ambiente.`
              }
            >
              {amb}
            </button>
          );
        })}
      </div>

      <span className="destino-lab sec">Avatar</span>
      <div className="destino-switch avatar">
        {avatares.map((av) => {
          const selecionado = igual(test.avatar, av.valor);
          return (
            <button
              type="button"
              key={`av-${av.valor}`}
              className={`destino-seg${selecionado ? " sel" : ""}${av.sub ? " sub" : ""}`}
              aria-pressed={selecionado}
              disabled={disabled}
              onClick={() => onSelect("avatar", av.valor)}
              title={
                selecionado
                  ? `"${test.name}" está configurada para rodar com ${av.valor}.`
                  : `Passar "${test.name}" para ${av.valor}. É a mesma simulação, só muda o avatar.`
              }
            >
              {av.sub ? `↳ ${av.label}` : av.label}
            </button>
          );
        })}
      </div>
      {desativado && (
        <span className="destino-aviso" title={`Reative "${test.avatar}" na aba Avatares para voltar a rodar aqui.`}>
          {test.avatar} está desativado
        </span>
      )}
    </div>
  );
}
