"use client";

import { AvatarTest } from "@/lib/types";
import { PopoverMenu } from "./popover-menu";
import {
  AvatarDestino,
  ambientesConhecidos,
  avatarDesativado,
  avataresConhecidos,
} from "@/lib/destinos";

/**
 * Seletor de destino do card de Simulacoes: ambiente e avatar, uma escolha
 * por vez em cada um.
 *
 * 13/10/2026 (pedido da Isa): as duas fileiras de pilulas viraram seletores
 * pra ocupar menos espaco. No card fica so a pilula com o que esta escolhido;
 * clicar nela abre o menu com as opcoes (a escolhida com check). Continua
 * sendo uma opcao por vez — escolher outra troca a anterior.
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
 * O menu usa o mesmo PopoverMenu do seletor de prioridade (portal, abre pra
 * cima quando nao cabe embaixo).
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

  const ambienteAtual = ambientes.find((amb) => igual(test.ambiente, amb));
  const avatarAtual = avatares.find((av) => igual(test.avatar, av.valor));

  return (
    <div className="destino">
      <span className="destino-lab">Ambiente</span>
      <PopoverMenu
        panelWidth={190}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={`destino-pill${ambienteAtual ? "" : " vazio"}${open ? " aberto" : ""}`}
            onClick={toggle}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            title={
              ambienteAtual
                ? `"${test.name}" está configurada para rodar em ${ambienteAtual}. Clique para trocar.`
                : `Escolher o ambiente de "${test.name}".`
            }
          >
            <span>{ambienteAtual ?? "escolher"}</span>
            <Seta />
          </button>
        )}
      >
        {({ close }) => (
          <div className="destino-menu" role="menu">
            {ambientes.map((amb) => {
              const selecionado = igual(test.ambiente, amb);
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selecionado}
                  key={`amb-${amb}`}
                  className={`destino-menu-item${selecionado ? " ativo" : ""}`}
                  onClick={() => {
                    if (!selecionado) onSelect("ambiente", amb);
                    close();
                  }}
                  title={
                    selecionado
                      ? undefined
                      : `Passar "${test.name}" para ${amb}. É a mesma simulação, só muda o ambiente.`
                  }
                >
                  <span>{amb}</span>
                  {selecionado && <Check />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverMenu>

      <span className="destino-lab sec">Avatar</span>
      <PopoverMenu
        panelWidth={220}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={`destino-pill avatar${avatarAtual ? "" : " vazio"}${open ? " aberto" : ""}`}
            onClick={toggle}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            title={
              avatarAtual
                ? `"${test.name}" está configurada para rodar com ${avatarAtual.valor}. Clique para trocar.`
                : `Escolher o avatar de "${test.name}".`
            }
          >
            <span>{avatarAtual ? (avatarAtual.sub ? `↳ ${avatarAtual.label}` : avatarAtual.label) : "escolher"}</span>
            <Seta />
          </button>
        )}
      >
        {({ close }) => (
          <div className="destino-menu avatar" role="menu">
            {avatares.length === 0 && <div className="destino-menu-vazio">Nenhum avatar ativo na aba Avatares.</div>}
            {avatares.map((av) => {
              const selecionado = igual(test.avatar, av.valor);
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selecionado}
                  key={`av-${av.valor}`}
                  className={`destino-menu-item${selecionado ? " ativo" : ""}${av.sub ? " sub" : ""}`}
                  onClick={() => {
                    if (!selecionado) onSelect("avatar", av.valor);
                    close();
                  }}
                  title={
                    selecionado
                      ? undefined
                      : `Passar "${test.name}" para ${av.valor}. É a mesma simulação, só muda o avatar.`
                  }
                >
                  <span>{av.sub ? `↳ ${av.label}` : av.label}</span>
                  {selecionado && <Check />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverMenu>
      {desativado && (
        <span className="destino-aviso" title={`Reative "${test.avatar}" na aba Avatares para voltar a rodar aqui.`}>
          {test.avatar} está desativado
        </span>
      )}
    </div>
  );
}

function Seta() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className="destino-pill-seta">
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2 5 8.6 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
