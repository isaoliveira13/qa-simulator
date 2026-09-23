"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fileira de abas do hub.
 *
 * No projeto original (components/mode-nav.tsx) esta fileira convivia com um
 * segundo modo ("Avatar IA" — testes conversacionais), com um seletor pra
 * trocar entre os dois. Esta demo porta só a feature "Scripts", então o
 * seletor de modo saiu inteiro: sobra só a fileira de abas do Repositório de
 * Scripts.
 */
const SCRIPT_TABS = [
  { href: "/", label: "Biblioteca" },
  { href: "/upload", label: "Enviar script" },
  { href: "/rascunhos", label: "Rascunhos" },
  { href: "/suites", label: "Suítes" },
  { href: "/historico", label: "Histórico" },
  { href: "/cobertura", label: "Cobertura" },
  { href: "/checklist", label: "Checklist" },
  { href: "/tags", label: "Tags" },
];

function isActive(href: string, pathname: string | null) {
  if (href === "/") return pathname === href;
  return pathname?.startsWith(href) ?? false;
}

export function ScriptTabs() {
  const pathname = usePathname();
  return (
    <nav>
      {SCRIPT_TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={isActive(tab.href, pathname) ? "active" : ""}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
