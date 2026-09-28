import "./globals.css";
import type { ReactNode } from "react";
import ThemeToggle from "./theme-toggle";
import { IconMessageCircle } from "./icons";
import { AvatarTabs } from "../components/avatar-nav";
import { DemoBanner } from "../components/demo-banner";

const faviconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💬</text></svg>`;

export const metadata = {
  title: "QA Simulator Chat — Avatar IA",
  description: "Motor de simulação de conversas com o avatar de IA da Zenta",
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
                <IconMessageCircle size={16} />
              </span>
              QA Simulator Chat
            </span>
          </div>
          <div className="topbar-right">
            <AvatarTabs />
            <ThemeToggle />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
