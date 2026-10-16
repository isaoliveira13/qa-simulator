import "./globals.css";
import type { ReactNode } from "react";
import MenuLateral from "../components/menu-lateral";
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
    var menu = localStorage.getItem('menu');
    document.documentElement.setAttribute('data-menu', menu === 'fechado' ? 'fechado' : 'aberto');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-menu="aberto" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <div className="app-shell">
          <MenuLateral />
          <div className="app-main">
            <DemoBanner />
            <main className="container">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
