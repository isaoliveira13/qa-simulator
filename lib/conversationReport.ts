import { AvatarTurn } from "@/lib/types";

// Relatório de PDF de UMA conversa — porta fiel de construirRelatorioHTML/
// abrirRelatorioPDF do coisasdaisa (index.html): abre uma aba nova com um
// HTML standalone e chama window.print() nela. Usado tanto no teste único
// quanto em cada card do teste em lote (um botão "Exportar PDF" por pessoa).
// Diferente do relatório geral (/testes-avatar/relatorio, jsPDF+autotable em
// tabela) — este é o relatório detalhado de uma conversa só, turno a turno.

export type ConversationReportData = {
  resultado?: string;
  motivo_encerramento?: string;
  total_turnos?: number;
  max_turnos?: number;
  tempo_segundos?: number;
  transcricao?: AvatarTurn[];
  conversation_id?: string;
};

export type ConversationReportOptions = {
  titulo: string;
  d: ConversationReportData;
  cenario: string;
  criterio: string;
};

function escapeHTML(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function construirRelatorioHTML({ titulo, d, cenario, criterio }: ConversationReportOptions): string {
  const corResultado =
    d.resultado === "SUCESSO" ? "#059669" : d.resultado === "ENCERRADO" ? "#4f46e5" : "#dc2626";
  const rows = (d.transcricao || [])
    .map(
      (t) =>
        '<div class="turn-block">' +
        '<div class="turn-header">Turno ' +
        t.turno +
        "</div>" +
        '<div class="sim-line"><strong>Simulador:</strong> ' +
        escapeHTML(t.enviado || "") +
        (t.anexos && t.anexos.length
          ? " " +
            t.anexos
              .map(
                (a) => '<span class="anexo-link">📎 ' + escapeHTML(a.nome) + "</span>"
              )
              .join(" ")
          : "") +
        "</div>" +
        '<div class="avatar-line"><strong>Avatar:</strong> ' +
        escapeHTML(t.resposta_avatar || "(sem resposta)") +
        "</div>" +
        "</div>"
    )
    .join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>${escapeHTML(titulo)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #201c35; background: #f6f6fb; max-width: 780px; margin: 0 auto; padding: 2rem; }
    h1 { font-size: 20px; margin-bottom: 4px; color: #201c35; }
    .subtitle { color: #6b6884; font-size: 13px; margin-bottom: 1.5rem; }
    .meta-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 1.5rem; }
    .meta-box { background: #ffffff; border: 1px solid #e6e6f2; border-radius: 10px; padding: 10px 14px; }
    .meta-label { font-size: 10px; color: #9c99b4; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta-val { font-size: 18px; font-weight: 700; margin-top: 2px; color: ${corResultado}; }
    .info-box { background: #ffffff; border: 1px solid #e6e6f2; border-radius: 10px; padding: 12px 16px; margin-bottom: 1rem; font-size: 12px; line-height: 1.6; }
    .info-box strong { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #9c99b4; margin-bottom: 4px; }
    h2 { font-size: 13px; font-weight: 600; color: #6b6884; text-transform: uppercase; letter-spacing: 0.06em; margin: 1.5rem 0 12px; border-top: 1px solid #e6e6f2; padding-top: 1rem; }
    .turn-block { background: #ffffff; border: 1px solid #e6e6f2; border-radius: 10px; margin-bottom: 10px; padding: 10px 14px; }
    .turn-header { font-size: 10px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
    .sim-line { color: #4f46e5; margin-bottom: 3px; }
    .avatar-line { color: #059669; }
    .footer { margin-top: 2rem; font-size: 11px; color: #9c99b4; border-top: 1px solid #e6e6f2; padding-top: 1rem; }
    @media print { body { padding: 1rem; background: white; } .meta-box, .info-box, .turn-block { border-color: #ddd; } }
  </style></head><body>
  <h1>${escapeHTML(titulo)}</h1>
  <div class="subtitle">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
  <div class="meta-grid">
    <div class="meta-box"><div class="meta-label">Resultado</div><div class="meta-val">${escapeHTML(d.resultado || "—")}</div></div>
    <div class="meta-box"><div class="meta-label">Turnos</div><div class="meta-val" style="color:#201c35">${d.total_turnos || 0} / ${d.max_turnos || "—"}</div></div>
    <div class="meta-box"><div class="meta-label">Tempo</div><div class="meta-val" style="color:#201c35">${d.tempo_segundos || 0}s</div></div>
  </div>
  <div class="info-box"><strong>Cenário</strong>${escapeHTML(cenario)}</div>
  <div class="info-box"><strong>Critério de sucesso</strong>${escapeHTML(criterio)}</div>
  <div class="info-box"><strong>Motivo do encerramento</strong>${escapeHTML(d.motivo_encerramento || "—")}</div>
  <h2>Transcrição da conversa</h2>
  ${rows}
  <div class="footer">Repositório de Scripts — Zenta · conversation_id: ${escapeHTML(d.conversation_id || "—")}</div>
  </body></html>`;
}

export function abrirRelatorioPDF(opcoes: ConversationReportOptions) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(construirRelatorioHTML(opcoes));
  win.document.close();
  setTimeout(() => win.print(), 400);
}
