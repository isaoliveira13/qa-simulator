"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Framework, Tag } from "@/lib/types";
import { TagPopover } from "@/components/tag-popover";
import { TELAS } from "@/lib/telas";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const DEFAULT_TAG_COLOR = "#6366f1";

function UploadForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");
    const isEditing = !!editId;

  const [name, setName] = useState("");
    const [avatar, setAvatar] = useState("");
    const [ambiente, setAmbiente] = useState("");
    const [cenario, setCenario] = useState("");
    const [tela, setTela] = useState("");
    const [framework, setFramework] = useState<Framework>("playwright");
    const [content, setContent] = useState("");
    const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const [existingAttachmentPath, setExistingAttachmentPath] = useState<string | null>(null);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduleTime, setScheduleTime] = useState("09:00");
    const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [loadingEdit, setLoadingEdit] = useState(isEditing);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
        fetch("/api/tags")
          .then((r) => r.json())
          .then((data) => {
                    if (!data.error && Array.isArray(data.tags)) setAvailableTags(data.tags);
          })
          .catch(() => {});
  }, []);

  useEffect(() => {
        if (!editId) return;
        (async () => {
                try {
                          const res = await fetch(`/api/scripts/${editId}`);
                          const data = await res.json();
                          if (data.error) throw new Error(data.error);
                          const { entry, content: existingContent } = data;
                          setName(entry.name);
                          setAvatar(entry.avatar);
                          setAmbiente(entry.ambiente);
                          setCenario(entry.cenario);
                          setTela(entry.tela || "");
                          setSelectedTags(entry.tags || []);
                          setFramework(entry.framework);
                          setContent(existingContent || "");
                          if (entry.attachmentPath) setExistingAttachmentPath(entry.attachmentPath);
                          if (entry.schedule) {
                                      setScheduleEnabled(!!entry.schedule.enabled);
                                      setScheduleTime(entry.schedule.time || "09:00");
                                      setScheduleDays(entry.schedule.days || []);
                          }
                } catch (err: any) {
                          setMsg({ text: err.message, ok: false });
                } finally {
                          setLoadingEdit(false);
                }
        })();
  }, [editId]);

  async function handleFileLoad(f: File) {
        const text = await f.text();
        setContent(text);
        setLoadedFileName(f.name);
        if (!name) setName(f.name.replace(/\.(spec|cy)\.(ts|js)$/, ""));
        if (f.name.endsWith(".cy.ts") || f.name.endsWith(".cy.js")) setFramework("cypress");
        if (f.name.endsWith(".spec.ts") || f.name.endsWith(".spec.js")) setFramework("playwright");
  }

  function toggleDay(day: number) {
        setScheduleDays((prev) =>
                prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
                            );
  }

  function toggleTag(tag: string) {
        setSelectedTags((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                            );
  }

  async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setMsg(null);
        try {
                const payload: Record<string, unknown> = {
                          name,
                          avatar,
                          ambiente,
                          cenario,
                          tela: tela || null,
                          tags: selectedTags.join(", "),
                          framework,
                          content,
                };

          if (isEditing) payload.id = editId;

          if (attachmentFile) {
                    setUploadingAttachment(true);
                    try {
                                // MODO DEMO: sem Vercel Blob nenhum — o arquivo é enviado direto
                                // (POST multipart) pra nossa própria rota, que devolve uma data URL
                                // (o arquivo em base64) guardada no próprio registro em memória. Ver
                                // app/api/blob-upload/route.ts pro limite de tamanho desta demo.
                                const formData = new FormData();
                                formData.append("file", attachmentFile);
                                const uploadRes = await fetch("/api/blob-upload", {
                                              method: "POST",
                                              body: formData,
                                });
                                const uploadData = await uploadRes.json();
                                if (uploadData.error) throw new Error(uploadData.error);
                                payload.attachment = {
                                              filename: attachmentFile.name,
                                              url: uploadData.url,
                                };
                    } finally {
                                setUploadingAttachment(false);
                    }
          }

          if (scheduleEnabled) {
                    payload.schedule = {
                                enabled: true,
                                time: scheduleTime,
                                days: scheduleDays,
                    };
          } else if (isEditing) {
                    payload.schedule = { enabled: false, time: scheduleTime, days: scheduleDays };
          }

          const res = await fetch("/api/scripts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
          });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                setMsg({ text: isEditing ? "Script atualizado com sucesso!" : "Script salvo com sucesso!", ok: true });
                setTimeout(() => router.push("/"), 900);
        } catch (err: any) {
                setMsg({ text: err.message, ok: false });
        } finally {
                setSubmitting(false);
        }
  }

  const selectedTagObjects = useMemo(() => {
    const byName = new Map(availableTags.map((t) => [t.name, t]));
    return [...selectedTags]
      .map((n) => byName.get(n) || { name: n, color: DEFAULT_TAG_COLOR })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [availableTags, selectedTags]);

  if (loadingEdit) {
    return (
      <div>
        <h1>Editar script</h1>
        <p className="subtitle">Carregando dados do script...</p>
      </div>
    );
  }

  return (
    <div>
      <h1>{isEditing ? "Editar script" : "Enviar script"}</h1>
      <p className="subtitle">Preencha os campos abaixo com os dados do script.</p>

      {!isEditing && (
        <div className="notice">
          <span>&#9432;</span>
          <span>
            Tem varios testes de uma vez? A{" "}
            <a href="/upload/lote">importacao em lote</a> le o nome do arquivo
            (ex.: HML_nimbus_campanha-template-imagem.spec.js) e ja preenche nome, ambiente, avatar e
            cenario de cada card.
          </span>
        </div>
      )}

      <form className="upload-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2 className="form-section-title">Informações básicas</h2>

          <div className="row">
            <div className="field">
              <label>Nome do teste</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Login básico" required />
            </div>
            <div className="field">
              <label>Framework</label>
              <select value={framework} onChange={(e) => setFramework(e.target.value as Framework)}>
                <option value="playwright">Playwright</option>
                <option value="cypress">Cypress</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Avatar</label>
              <input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="Ex.: Bot A, Bot B"
                required
                disabled={isEditing}
              />
            </div>
            <div className="field">
              <label>Ambiente</label>
              <input
                value={ambiente}
                onChange={(e) => setAmbiente(e.target.value)}
                placeholder="Ex.: hml, stg, prod"
                required
                disabled={isEditing}
              />
            </div>
          </div>

          {isEditing && (
            <div className="notice">
              <span>&#9432;</span>
              <span>Avatar e ambiente não podem ser alterados na edição, pois definem o caminho do arquivo.</span>
            </div>
          )}

          <div className="field">
            <label>Cenário</label>
            <input
              value={cenario}
              onChange={(e) => setCenario(e.target.value)}
              placeholder="Ex.: Mensagem do gestor"
              required
            />
          </div>

          <div className="field">
            <label>Tela do CRM</label>
            <select value={tela} onChange={(e) => setTela(e.target.value)}>
              <option value="">Nenhuma / não se aplica</option>
              {TELAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="hint">
              Usado no dashboard de cobertura por tela — opcional.
            </div>
          </div>

          <div className="field">
            <label>Tags</label>
            <TagPopover
              label="Selecionar tags"
              options={availableTags}
              selected={selectedTags}
              onToggle={toggleTag}
            />

            {selectedTagObjects.length > 0 && (
              <div className="day-chips selected-tags-row">
                {selectedTagObjects.map((tag) => (
                  <button
                    type="button"
                    key={tag.name}
                    className="tag-chip selected"
                    style={{ background: tag.color, borderColor: tag.color, color: "#fff" }}
                    onClick={() => toggleTag(tag.name)}
                    title="Remover dos selecionados"
                  >
                    {tag.name} ×
                  </button>
                ))}
              </div>
            )}

            <div className="hint">
              Para criar, editar ou apagar tags do catálogo, use a aba{" "}
              <a href="/tags">Tags</a>.
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2 className="form-section-title">Conteúdo do script</h2>
          <div className="field">
            <label>Código</label>
            <div className="file-input-wrap">
              <input
                type="file"
                accept=".ts,.js"
                onChange={(e) => e.target.files && handleFileLoad(e.target.files[0])}
              />
              {loadedFileName && <span className="hint">Carregado: {loadedFileName}</span>}
            </div>
            <textarea
              className="code-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Cole aqui o código do script (.spec.ts, .spec.js, .cy.ts ou .cy.js)."
              required
            />
            <div className="hint">
              Carregue um arquivo .spec.ts, .spec.js, .cy.ts ou .cy.js já pronto do seu computador
              ou cole o código acima.
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2 className="form-section-title">Anexo</h2>
          <div className="field">
            <label>Arquivo (opcional)</label>
            <input
              type="file"
              onChange={(e) => e.target.files && setAttachmentFile(e.target.files[0])}
            />
            {attachmentFile && <div className="hint">Novo anexo: {attachmentFile.name}</div>}
            {!attachmentFile && existingAttachmentPath && (
              <div className="hint">Este script já tem um anexo guardado nesta sessão de demonstração.</div>
            )}
            <div className="hint">
              Nesta demonstração o anexo fica guardado só na memória do servidor (nada sobe pra
              nenhum serviço externo), com no máximo 2MB — arquivos maiores são recusados com um
              aviso claro. No produto real, o anexo fica disponível ao script rodando no GitHub
              Actions via a variável ATTACHMENT_PATH; aqui nenhum teste roda de verdade.
            </div>
          </div>
        </div>

        <div className="form-section">
          <label className="toggle-row">
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
              />
              <span className="toggle-slider" />
            </span>
            Agendar execução automática
          </label>

          {scheduleEnabled && (
            <div className="schedule-box">
              <div className="field">
                <label>Horário (America/Sao_Paulo)</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Dias da semana</label>
                <div className="day-chips">
                  {DAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      className={`day-chip ${scheduleDays.includes(day) ? "selected" : ""}`}
                      onClick={() => toggleDay(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {msg && <div className={`status-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}

        <button className="btn-primary" type="submit" disabled={submitting}>
          {uploadingAttachment ? "Enviando anexo..." : submitting ? "Salvando..." : isEditing ? "Salvar alterações" : "Salvar script"}
        </button>
      </form>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <div>
          <h1>Enviar script</h1>
          <p className="subtitle">Carregando...</p>
        </div>
      }
    >
      <UploadForm />
    </Suspense>
  );
}
