"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Abas do Avatar IA (herdadas do ModeTabs de dois modos que existia quando
 * este código morava no playwright-test-hub, lado a lado com uma biblioteca
 * de scripts Playwright/Cypress — aqui só sobrou o motor de simulação de
 * avatar, então virou a única fileira de abas do site, sem seletor de modo).
 */
const AVATAR_TABS = [
  { href: "/testes-avatar", label: "Simulações" },
  { href: "/personas", label: "Personas" },
  { href: "/cenarios", label: "Cenários" },
  { href: "/avatares", label: "Avatares" },
  { href: "/testes-avatar/relatorio", label: "Relatório" },
  { href: "/tags", label: "Tags" },
];

function isActive(href: string, pathname: string | null) {
  if (href === "/testes-avatar") {
    if (!pathname) return false;
    if (pathname.startsWith("/testes-avatar/relatorio")) return false;
    return pathname === href || pathname.startsWith("/testes-avatar/");
  }
  return pathname?.startsWith(href) ?? false;
}

export function AvatarTabs() {
  const pathname = usePathname();
  return (
    <nav className="avatar">
      {AVATAR_TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={isActive(tab.href, pathname) ? "active" : ""}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
