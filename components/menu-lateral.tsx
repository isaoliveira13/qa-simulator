"use client";

import ThemeToggle from "../app/theme-toggle";
import { IconMessageCircle } from "../app/icons";
import { MenuItens } from "./avatar-nav";
import { IconPanelLeftClose, IconPanelLeftOpen } from "./icones-menu";

/**
 * Menu lateral (15/10/2026) — substituiu a fileira de abas do topo: logo +
 * botão de recolher no alto, os itens com ícone e, no rodapé, o botão de
 * tema. Recolhido, fica só com os ícones; a escolha fica guardada no
 * localStorage ("menu") e é aplicada antes da pintura pelo script do layout,
 * pra não piscar aberto ao recarregar.
 */
export default function MenuLateral() {
  function alternar() {
    const html = document.documentElement;
    const fechar = html.getAttribute("data-menu") !== "fechado";
    html.setAttribute("data-menu", fechar ? "fechado" : "aberto");
    try {
      localStorage.setItem("menu", fechar ? "fechado" : "aberto");
    } catch {}
  }

  return (
    <aside className="menu-lateral">
      <div className="menu-topo">
        <a className="brand" href="/" title="QA Simulator Chat">
          <span className="brand-mark">
            <IconMessageCircle size={16} />
          </span>
          <span className="brand-nome">QA Simulator Chat</span>
        </a>
        <button
          type="button"
          className="menu-alternar"
          onClick={alternar}
          aria-label="Recolher ou expandir o menu"
          title="Recolher ou expandir o menu"
        >
          <span className="so-aberto"><IconPanelLeftClose size={18} /></span>
          <span className="so-fechado"><IconPanelLeftOpen size={18} /></span>
        </button>
      </div>
      <MenuItens />
      <div className="menu-rodape">
        <ThemeToggle />
      </div>
    </aside>
  );
}
