"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconAvatares,
  IconCenarios,
  IconPersonas,
  IconRelatorio,
  IconSimulacoes,
  IconTags,
} from "./icones-menu";

/**
 * Itens do menu lateral do Avatar IA (herdados do menu de dois modos que
 * existia quando este código morava no playwright-test-hub, lado a lado com
 * uma biblioteca de scripts Playwright/Cypress — aqui só sobrou o motor de
 * simulação de avatar, então é o único menu do site, sem seletor de modo).
 * 15/10/2026: a fileira de abas do topo virou menu lateral; cada item ganhou
 * ícone pra aparecer sozinho quando o menu está recolhido.
 */
const AVATAR_TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/testes-avatar", label: "Simulações", icon: <IconSimulacoes /> },
  { href: "/personas", label: "Personas", icon: <IconPersonas /> },
  { href: "/cenarios", label: "Cenários", icon: <IconCenarios /> },
  { href: "/avatares", label: "Avatares", icon: <IconAvatares /> },
  { href: "/testes-avatar/relatorio", label: "Relatório", icon: <IconRelatorio /> },
  { href: "/tags", label: "Tags", icon: <IconTags /> },
];

function isActive(href: string, pathname: string | null) {
  if (href === "/testes-avatar") {
    if (!pathname) return false;
    if (pathname.startsWith("/testes-avatar/relatorio")) return false;
    return pathname === href || pathname.startsWith("/testes-avatar/");
  }
  return pathname?.startsWith(href) ?? false;
}

export function MenuItens() {
  const pathname = usePathname();
  return (
    <nav className="menu-nav avatar" aria-label="Seções">
      {AVATAR_TABS.map((tab) => {
        const ativo = isActive(tab.href, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`menu-item${ativo ? " ativo" : ""}`}
            title={tab.label}
            aria-current={ativo ? "page" : undefined}
          >
            <span className="menu-icone">{tab.icon}</span>
            <span className="menu-rotulo">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
