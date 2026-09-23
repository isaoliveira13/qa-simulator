import "./globals.css";
import type { ReactNode } from "react";
import ThemeToggle from "./theme-toggle";
import { IconCode } from "./icons";
import { ScriptTabs } from "../components/script-tabs";
import { DemoBanner } from "../components/demo-banner";

const faviconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧪</text></svg>`;

export const metadata = {
  title: "Repositório de Scripts (demo)",
  description: "Demonstração de portfólio: biblioteca e organização de scripts Playwright/Cypress",
  icons: {
    icon: `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`,
  },
};

const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <DemoBanner />
        <header className="topbar">
          <div className="brand-col">
            <span className="brand">
              <span className="brand-mark">
                <IconCode size={16} />
              </span>
              Repositório de Scripts
            </span>
          </div>
          <div className="topbar-right">
            <ScriptTabs />
            <ThemeToggle />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
