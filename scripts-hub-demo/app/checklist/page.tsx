"use client";

import { useEffect, useMemo, useState } from "react";
import { ScriptEntry, Tag } from "@/lib/types";
import { IconCheck, IconX, IconFlask } from "../icons";
import { FilterPopover } from "@/components/filter-popover";
import { SelectPopover } from "@/components/select-popover";
import { emptyFilter, filterValueCount, matchesFilter, MultiFilter } from "@/lib/filters";
import { SCRIPT_FILTER_KEYS } from "@/lib/sharedFilterKeys";
import { SavedFilters } from "@/components/saved-filters";
import { tagPillStyle, sortTagsByColor } from "@/lib/tagColor";
import { usePersistedState } from "@/lib/usePersistedState";

type MarkStatus = "pass" | "fail";
type Marks = Record<string, MarkStatus>;

const MARKS_STORAGE_KEY = "checklistMarks";

function frameworkLabel(framework: string) {
  if (framework === "playwright") return "Playwright";
  if (framework === "cypress") return "Cypress";
  return framework;
}

function statusLabel(status?: MarkStatus) {
  if (status === "pass") return "Aprovado";
  if (status === "fail") return "Reprovado";
  return "Não verificado";
}

export default function ChecklistPage() {
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [avatarFilter, setAvatarFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.avatar, emptyFilter("OR"));
  const [ambienteFilter, setAmbienteFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.ambiente, emptyFilter("OR"));
  const [frameworkFilter, setFrameworkFilter] = usePersistedState("checklist:frameworkFilter", "");
  const [search, setSearch] = usePersistedState(SCRIPT_FILTER_KEYS.search, "");

  const [tagFilter, setTagFilter] = usePersistedState<MultiFilter>(SCRIPT_FILTER_KEYS.tag, emptyFilter("AND"));

  const [marks, setMarks] = useState<Marks>({});
  const [marksLoaded, setMarksLoaded] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Cores reais cadastradas em /tags — pinta a pílula com a mesma cor
  // escolhida lá, em vez do hash fixo que existia antes.
  const [tagColors, setTagColors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/scripts")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setScripts(data.scripts);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error && Array.isArray(data.tags)) {
          const map: Record<string, string> = {};
          (data.tags as Tag[]).forEach((t) => {
            map[t.name] = t.color;
          });
          setTagColors(map);
        }
      })
      .catch(() => {});
  }, []);

  // Carrega marcações salvas (sobrevivem à troca de aba / navegação).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MARKS_STORAGE_KEY);
      if (raw) setMarks(JSON.parse(raw));
    } catch {}
    setMarksLoaded(true);
  }, []);

  // Só grava depois de ter carregado, pra não sobrescrever com {} antes da leitura.
  useEffect(() => {
    if (!marksLoaded) return;
    try {
      localStorage.setItem(MARKS_STORAGE_KEY, JSON.stringify(marks));
    } catch {}
  }, [marks, marksLoaded]);

  const avatars = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.avatar))).sort(),
    [scripts]
  );
  const ambientes = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.ambiente))).sort(),
    [scripts]
  );
  const frameworks = useMemo(
    () => Array.from(new Set(scripts.map((s) => s.framework))).sort(),
    [scripts]
  );
  const allTags = useMemo(
    () => Array.from(new Set(scripts.flatMap((s) => s.tags))).sort(),
    [scripts]
  );

  // Sem nenhum filtro selecionado, todos os scripts ficam visíveis.
  const filtered = scripts.filter((s) => {
    if (!matchesFilter([s.avatar], avatarFilter)) return false;
    if (!matchesFilter([s.ambiente], ambienteFilter)) return false;
    if (frameworkFilter && s.framework !== frameworkFilter) return false;
    if (!matchesFilter(s.tags, tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${s.name} ${s.cenario} ${s.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const verifiedCount = filtered.filter((s) => marks[s.id]).length;
  const hasActiveFilter =
    filterValueCount(avatarFilter) > 0 ||
    filterValueCount(ambienteFilter) > 0 ||
    !!frameworkFilter ||
    filterValueCount(tagFilter) > 0 ||
    !!search;

  function setMark(id: string, status: MarkStatus) {
    setMarks((prev) => {
      const next = { ...prev };
      if (next[id] === status) {
        // Clicar de novo no mesmo ícone desmarca o script.
        delete next[id];
      } else {
        next[id] = status;
      }
      return next;
    });
  }

  function requestReset() {
    setConfirmReset(true);
  }

  function confirmResetAction() {
    setMarks({});
    try {
      localStorage.removeItem(MARKS_STORAGE_KEY);
    } catch {}
    setConfirmReset(false);
  }

  async function generatePdf() {
    setGeneratingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
      const now = new Date();
      const dateTimeStr = now.toLocaleString("pt-BR");

      doc.setFontSize(16);
      doc.text("Relatório de Checklist — Repositório de Scripts", 40, 40);

      doc.setFontSize(10);
      doc.setTextColor(110);
      const summaryLine = hasActiveFilter
        ? `Filtro aplicado · ${filtered.length} script(s) · ${verifiedCount} verificado(s)`
        : `Todos os scripts · ${filtered.length} script(s) · ${verifiedCount} verificado(s)`;
      doc.text(summaryLine, 40, 58);
      doc.setTextColor(20);

      const rows = filtered.map((s) => [
        s.name,
        s.avatar,
        s.ambiente,
        s.cenario,
        frameworkLabel(s.framework),
        s.tags.join(", "),
        statusLabel(marks[s.id]),
      ]);

      autoTable(doc, {
        startY: 74,
        head: [["Nome", "Avatar", "Ambiente", "Cenário", "Sistema", "Tags", "Status"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [99, 102, 241] },
        columnStyles: { 6: { fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 6) {
            const value = data.cell.raw as string;
            if (value === "Aprovado") data.cell.styles.textColor = [22, 163, 74];
            else if (value === "Reprovado") data.cell.styles.textColor = [220, 38, 38];
            else data.cell.styles.textColor = [120, 120, 120];
          }
        },
        didDrawPage: (data) => {
          const pageHeight = doc.internal.pageSize.getHeight();
          doc.setFontSize(9);
          doc.setTextColor(130);
          doc.text(dateTimeStr, 40, pageHeight - 20);
          doc.setTextColor(20);
        },
        margin: { bottom: 40 },
      });

      const fileDate = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
      doc.save(`checklist-${fileDate}.pdf`);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1>Checklist</h1>
          <p className="subtitle">
            Marque manualmente cada script como aprovado ou reprovado depois de rodar o teste.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={requestReset}
            disabled={Object.keys(marks).length === 0}
          >
            Resetar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={generatePdf}
            disabled={generatingPdf || filtered.length === 0}
          >
            {generatingPdf ? "Gerando PDF..." : "Emitir relatório PDF"}
          </button>
        </div>
      </div>

      <div className="filters">
        <FilterPopover
          label="Avatar"
          options={avatars.map((a) => ({ name: a }))}
          filter={avatarFilter}
          onChange={setAvatarFilter}
          onClear={() => setAvatarFilter(emptyFilter("OR"))}
        />
        <FilterPopover
          label="Ambiente"
          options={ambientes.map((a) => ({ name: a }))}
          filter={ambienteFilter}
          onChange={setAmbienteFilter}
          onClear={() => setAmbienteFilter(emptyFilter("OR"))}
        />
        <SelectPopover
          allLabel="Todos os sistemas"
          value={frameworkFilter}
          options={frameworks}
          onChange={setFrameworkFilter}
          formatOption={frameworkLabel}
        />

        <FilterPopover
          label="Filtrar por etiqueta"
          options={allTags.map((t) => ({ name: t }))}
          filter={tagFilter}
          onChange={setTagFilter}
          onClear={() => setTagFilter(emptyFilter("AND"))}
        />

        <SavedFilters
          tagFilter={tagFilter}
          avatarFilter={avatarFilter}
          ambienteFilter={ambienteFilter}
          busca={search}
          onApply={(next) => {
            setTagFilter(next.tagFilter);
            setAvatarFilter(next.avatarFilter);
            setAmbienteFilter(next.ambienteFilter);
            setSearch(next.busca);
          }}
        />

        <input
          placeholder="Buscar por nome, cenário ou tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="checklist-summary">
        {verifiedCount}/{filtered.length} verificados
      </div>

      {loading && <p className="empty">Carregando...</p>}
      {error && <p className="status-msg err">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="empty">Nenhum script encontrado com esse filtro.</p>
      )}

      {filtered.map((s) => {
        const status = marks[s.id];
        return (
          <div className="checklist-row" key={s.id}>
            <div className="checklist-row-info">
              <div className="checklist-row-title">
                <IconFlask size={13} />
                {s.name}
              </div>
              <div className="meta">
                {s.avatar} · {s.ambiente} · {s.cenario} · {frameworkLabel(s.framework)}
              </div>
              <div className="tags">
                {sortTagsByColor(s.tags, (t) => tagColors[t]).map((t) => (
                  <span className="tag" style={tagPillStyle(tagColors[t])} key={t}>{t}</span>
                ))}
              </div>
            </div>
            <div className="checklist-row-actions">
              <span className={`checklist-status-label ${status || "pending"}`}>
                {statusLabel(status)}
              </span>
              <button
                type="button"
                className={`checklist-mark-btn pass${status === "pass" ? " active" : ""}`}
                onClick={() => setMark(s.id, "pass")}
                title="Marcar como aprovado"
                aria-label={`Marcar ${s.name} como aprovado`}
              >
                <IconCheck size={16} />
              </button>
              <button
                type="button"
                className={`checklist-mark-btn fail${status === "fail" ? " active" : ""}`}
                onClick={() => setMark(s.id, "fail")}
                title="Marcar como reprovado"
                aria-label={`Marcar ${s.name} como reprovado`}
              >
                <IconX size={16} />
              </button>
            </div>
          </div>
        );
      })}

      {confirmReset && (
        <div className="modal-backdrop" onClick={() => setConfirmReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Apagar todas as marcações do checklist? Esta ação não pode ser desfeita.</h3>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmReset(false)}>
                Cancelar
              </button>
              <button className="btn-danger-solid" onClick={confirmResetAction}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
