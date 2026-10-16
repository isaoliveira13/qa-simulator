"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconBiblioteca,
  IconChecklist,
  IconCobertura,
  IconEnviar,
  IconHistorico,
  IconMomentos,
  IconRascunhos,
  IconSuites,
  IconTags,
} from "./icones-menu";

/**
 * Itens do menu lateral do hub.
 *
 * No projeto original (components/mode-nav.tsx) o menu convive com um segundo
 * modo ("Avatar IA" — testes conversacionais), com um seletor pra trocar entre
 * os dois. Esta demo porta só a feature "Scripts", então o seletor de modo
 * saiu inteiro: sobram só os itens do Repositório de Scripts. Cada item tem
 * ícone pra aparecer sozinho quando o menu está recolhido.
 */
const SCRIPT_TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "Biblioteca", icon: <IconBiblioteca /> },
  { href: "/upload", label: "Enviar script", icon: <IconEnviar /> },
  { href: "/rascunhos", label: "Rascunhos", icon: <IconRascunhos /> },
  { href: "/suites", label: "Suítes", icon: <IconSuites /> },
  { href: "/momentos", label: "Momentos", icon: <IconMomentos /> },
  { href: "/historico", label: "Histórico", icon: <IconHistorico /> },
  { href: "/cobertura", label: "Cobertura", icon: <IconCobertura /> },
  { href: "/checklist", label: "Checklist", icon: <IconChecklist /> },
  { href: "/tags", label: "Tags", icon: <IconTags /> },
];

function isActive(href: string, pathname: string | null) {
  if (href === "/") return pathname === href;
  return pathname?.startsWith(href) ?? false;
}

export function MenuItens() {
  const pathname = usePathname();
  return (
    <nav className="menu-nav" aria-label="Seções">
      {SCRIPT_TABS.map((tab) => {
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
