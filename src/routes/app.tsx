import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { LANGUAGES, UI_STRINGS, type LangCode } from "@/lib/i18n/languages";
import { MicTestDialog } from "@/components/MicTest";
import { BackButton } from "@/components/BackButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const searchSchema = z.object({ lang: z.string().optional() });

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Bharat-Awaaz — Talk to your government" },
      { name: "description", content: "Voice-first agent for scheme discovery, document parsing, and form filling." },
    ],
  }),
  validateSearch: searchSchema,
  component: AppPage,
});

type FieldProposal = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  required: boolean;
};

type GrievancePayload = {
  applicant_name: string;
  ministry_or_department: string;
  subject: string;
  description: string;
  previous_application_id?: string;
  state?: string;
  district?: string;
  contact_phone?: string;
  contact_email?: string;
};

type DraftAuditEvent = {
  ts: number;
  action: string;
  detail?: string;
  changes?: { field: string; from: string; to: string }[];
  regId?: string;
  priority?: number;
};

type GrievanceDraft = {
  draftId: string;
  payload: GrievancePayload;
  normalisedPayload?: GrievancePayload;
  status: "draft" | "ready" | "pending_key" | "submitted" | "failed" | "cancelled";
  regId?: string;
  lastError?: string;
  attempts?: number;
  priority?: number;
  submittedAt?: number;
  validationIssues?: { field: string; message: string }[];
  auditEvents?: DraftAuditEvent[];
};

type AgentEvent =
  | { type: "thinking" }
  | { type: "say"; text: string; lang: string; audioUrl?: string }
  | { type: "schemes"; schemes: Scheme[] }
  | { type: "document"; doc: { id: string; kind: string; fields: Record<string, string> } }
  | { type: "awaiting_validation"; id: string; templateId: string; proposed: FieldProposal[]; resumeTo: string }
  | { type: "pdf_ready"; url: string; templateId: string }
  | { type: "grievance_draft"; draft: GrievanceDraft }
  | { type: "grievance_filed"; regId: string; draftId?: string }
  | { type: "error"; message: string }
  | { type: "done" };

type Scheme = {
  id: string;
  name: string;
  ministry: string;
  benefits: string;
  eligibility_match: string;
  documents_required: string[];
  apply_url?: string;
};

type Msg = { role: "user" | "assistant"; text: string; lang?: string; audioUrl?: string };

type TemplateMeta = {
  id: string;
  name: string;
  ministry: string;
  scheme: string;
  fieldCount: number;
  custom?: boolean;
  version?: number;
  historyCount?: number;
};

type ValidationRecord = {
  id: string;
  templateId: string;
  confirmedAt?: number;
  proposed: FieldProposal[];
  final: Record<string, string>;
  changes: { field: string; from: string; to: string }[];
};

function newSessionId() {
  return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function AppPage() {
  const { lang: langSearch } = Route.useSearch();
  const [lang, setLang] = useState<LangCode>(((langSearch as LangCode) || "hi") as LangCode);
  const t = UI_STRINGS[lang];

  const [sessionId] = useState(() => newSessionId());
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "नमस्ते! कोई योजना, कोई फॉर्म, या कोई शिकायत — मुझे बताइए।", lang: "hi" },
  ]);
  const [thinking, setThinking] = useState(false);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [docs, setDocs] = useState<{ id: string; kind: string; fields: Record<string, string> }[]>([]);
  const [pendingValidation, setPendingValidation] = useState<{
    id: string;
    templateId: string;
    proposed: FieldProposal[];
  } | null>(null);
  const [pdfs, setPdfs] = useState<{ url: string; templateId: string }[]>([]);
  const [grievances, setGrievances] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<GrievanceDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>("");
  const [mockVoice, setMockVoice] = useState(false);
  const [validationHistory, setValidationHistory] = useState<ValidationRecord[]>([]);
  const [cpgramsReady, setCpgramsReady] = useState(false);
  const [showTplBuilder, setShowTplBuilder] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadTemplates = useCallback(() => {
    fetch(`/api/templates?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((d: { templates: TemplateMeta[] }) => setTemplates(d.templates));
  }, [sessionId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Poll auto-resend queue: drains pending drafts the moment CPGRAMS_API_KEY arrives.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/grievance/draft?sessionId=${sessionId}`);
        const d = (await r.json()) as {
          drafts: GrievanceDraft[];
          cpgramsConfigured: boolean;
          autoResend: { drained: number; attempted: number };
        };
        if (cancelled) return;
        setCpgramsReady(d.cpgramsConfigured);
        setDrafts(d.drafts);
        if (d.autoResend.drained > 0) {
          setError(null);
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId]);

  // SSE
  useEffect(() => {
    const es = new EventSource(`/api/agent/stream?sessionId=${sessionId}`);
    es.onmessage = (ev) => {
      try {
        const e: AgentEvent = JSON.parse(ev.data);
        switch (e.type) {
          case "thinking":
            setThinking(true);
            break;
          case "say":
            setThinking(false);
            setMessages((m) => [...m, { role: "assistant", text: e.text, lang: e.lang, audioUrl: e.audioUrl }]);
            if (e.audioUrl && audioRef.current) {
              audioRef.current.src = e.audioUrl;
              audioRef.current.play().catch(() => {});
            } else if (mockVoice) {
              // mock TTS: speak via browser SpeechSynthesis if available
              try {
                const u = new SpeechSynthesisUtterance(e.text);
                u.lang = e.lang === "hi" ? "hi-IN" : "en-IN";
                window.speechSynthesis.speak(u);
              } catch {
                /* ignore */
              }
            }
            break;
          case "schemes":
            setSchemes(e.schemes);
            break;
          case "document":
            setDocs((d) => [...d, e.doc]);
            break;
          case "awaiting_validation":
            setPendingValidation({ id: e.id, templateId: e.templateId, proposed: e.proposed });
            setThinking(false);
            break;
          case "pdf_ready":
            setPdfs((p) => [...p, { url: e.url, templateId: e.templateId }]);
            break;
          case "grievance_draft":
            setDrafts((d) => [...d.filter((x) => x.draftId !== e.draft.draftId), e.draft]);
            break;
          case "grievance_filed":
            setGrievances((g) => [...g, e.regId]);
            if (e.draftId) {
              setDrafts((d) =>
                d.map((x) => (x.draftId === e.draftId ? { ...x, status: "submitted", regId: e.regId } : x)),
              );
            }
            break;
          case "error":
            setError(e.message);
            setThinking(false);
            break;
          case "done":
            setThinking(false);
            break;
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [sessionId, mockVoice]);

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setMessages((m) => [...m, { role: "user", text }]);
      setError(null);
      setThinking(true);
      await fetch("/api/agent/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text, language: lang }),
      });
    },
    [sessionId, lang],
  );

  const confirmValidation = useCallback(
    async (fields: Record<string, string>, changes: { field: string; from: string; to: string }[]) => {
      if (!pendingValidation) return;
      const record: ValidationRecord = {
        id: pendingValidation.id,
        templateId: pendingValidation.templateId,
        confirmedAt: Date.now(),
        proposed: pendingValidation.proposed,
        final: fields,
        changes,
      };
      setValidationHistory((h) => [...h, record]);
      await fetch("/api/agent/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          validationId: pendingValidation.id,
          payload: { fields, changes },
        }),
      });
      setPendingValidation(null);
      setThinking(true);
    },
    [pendingValidation, sessionId],
  );

  const onTemplateChange = useCallback(
    async (id: string) => {
      setSelectedTpl(id);
      if (!id) return;
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", sessionId, templateId: id }),
      });
      const tpl = templates.find((x) => x.id === id);
      if (tpl) sendText(`Use the ${tpl.name} (template id: ${id}) for my application. Propose the filled form for me to validate.`);
    },
    [sessionId, templates, sendText],
  );

  const submitDraft = useCallback(
    async (draftId: string) => {
      const r = await fetch("/api/grievance/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", sessionId, draftId }),
      });
      const d = (await r.json()) as { ok: boolean; regId?: string; error?: string; status?: string };
      if (!d.ok) setError(d.error ?? "Submit failed");
    },
    [sessionId],
  );

  const cancelDraft = useCallback(
    async (draftId: string) => {
      await fetch("/api/grievance/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", sessionId, draftId }),
      });
      setDrafts((arr) => arr.map((x) => (x.draftId === draftId ? { ...x, status: "cancelled" } : x)));
    },
    [sessionId],
  );

  const prioritizeDraft = useCallback(
    async (draftId: string, delta: number) => {
      const r = await fetch("/api/grievance/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prioritize", sessionId, draftId, priority: delta }),
      });
      const d = (await r.json()) as { ok: boolean; priority?: number };
      if (d.ok) {
        setDrafts((arr) => arr.map((x) => (x.draftId === draftId ? { ...x, priority: d.priority } : x)));
      }
    },
    [sessionId],
  );

  const retryAllDrafts = useCallback(async () => {
    const r = await fetch("/api/grievance/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry-all", sessionId }),
    });
    const d = (await r.json()) as { ok: boolean; drained: number; attempted: number };
    if (d.attempted > 0 && d.drained < d.attempted) {
      setError(`${d.attempted - d.drained} draft(s) still pending — CPGRAMS key not active yet.`);
    }
  }, [sessionId]);

  const bulkDraftAction = useCallback(
    async (op: "cancel" | "prioritize" | "deprioritize" | "submit", draftIds: string[]) => {
      if (draftIds.length === 0) return;
      const r = await fetch("/api/grievance/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", sessionId, op, draftIds }),
      });
      const d = (await r.json()) as { ok: boolean; error?: string; drained?: number };
      if (!d.ok) setError(d.error ?? "Bulk action failed");
      else if (op === "submit" && typeof d.drained === "number" && d.drained < draftIds.length) {
        setError(`${draftIds.length - d.drained} draft(s) still pending — CPGRAMS key not active yet.`);
      }
    },
    [sessionId],
  );

  const registerTemplate = useCallback(
    async (template: {
      id: string;
      name: string;
      ministry: string;
      scheme: string;
      fields: { key: string; label: string; required?: boolean; aliases?: string[]; source?: string }[];
    }) => {
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", sessionId, template }),
      });
      const d = (await r.json()) as { ok: boolean; error?: string };
      if (!d.ok) {
        setError(d.error ?? "Template registration failed");
        return false;
      }
      loadTemplates();
      return true;
    },
    [sessionId, loadTemplates],
  );

  const importTemplatesJson = useCallback(
    async (file: File) => {
      const text = await file.text();
      let parsed: { templates: unknown[] };
      try {
        const j = JSON.parse(text);
        parsed = Array.isArray(j) ? { templates: j } : j;
      } catch {
        setError("Invalid JSON file.");
        return;
      }
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import-json", sessionId, templates: parsed.templates }),
      });
      const d = (await r.json()) as { ok: boolean; imported: number; errors: string[] };
      if (d.errors?.length) setError(`Imported ${d.imported}. Skipped: ${d.errors.join(" · ")}`);
      else setError(null);
      loadTemplates();
    },
    [sessionId, loadTemplates],
  );

  const importTemplatesCsv = useCallback(
    async (file: File) => {
      const csv = await file.text();
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import-csv", sessionId, csv }),
      });
      const d = (await r.json()) as { ok: boolean; imported: number; parsed: number; errors: string[] };
      if (d.errors?.length) setError(`Imported ${d.imported}/${d.parsed}. Skipped: ${d.errors.join(" · ")}`);
      else setError(null);
      loadTemplates();
    },
    [sessionId, loadTemplates],
  );

  const rollbackTemplate = useCallback(
    async (templateId: string, toVersion: number) => {
      const r = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", sessionId, templateId, toVersion }),
      });
      const d = (await r.json()) as { ok: boolean; error?: string };
      if (!d.ok) setError(d.error ?? "Rollback failed");
      loadTemplates();
    },
    [sessionId, loadTemplates],
  );

  return (
    <div className="min-h-screen pb-32">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--saffron)] via-white to-[var(--india-green)]" />

      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4">
        <div className="flex items-center gap-3">
          <BackButton to="/" label="Home" />
          <div className="font-display text-xl font-bold">भारत-आवाज़</div>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent-foreground">
            agent live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            <input type="checkbox" checked={mockVoice} onChange={(e) => setMockVoice(e.target.checked)} />
            Mock voice
          </label>
          <a
            href={`/api/session/export?sessionId=${sessionId}`}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            ⬇ Session JSON
          </a>
          <a
            href={`/api/session/export?sessionId=${sessionId}&mode=docs`}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
          >
            ⬇ Docs JSON
          </a>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as LangCode)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native} · {l.english}
              </option>
            ))}
          </select>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <Conversation messages={messages} thinking={thinking} />
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {pendingValidation && (
            <ValidationPanel
              templateId={pendingValidation.templateId}
              proposed={pendingValidation.proposed}
              onConfirm={confirmValidation}
              onCancel={() => setPendingValidation(null)}
            />
          )}

          {drafts.length > 0 && (
            <GrievanceDrafts
              drafts={drafts}
              onSubmit={submitDraft}
              onCancel={cancelDraft}
              onPriorityChange={prioritizeDraft}
              onRetryAll={retryAllDrafts}
              onBulk={bulkDraftAction}
              cpgramsReady={cpgramsReady}
              sessionId={sessionId}
            />
          )}

          {validationHistory.length > 0 && (
            <ValidationHistory records={validationHistory} sessionId={sessionId} />
          )}

          {schemes.length > 0 && <SchemesList schemes={schemes} />}
          {pdfs.length > 0 && <PdfsList pdfs={pdfs} sessionId={sessionId} />}
          {grievances.length > 0 && <GrievanceList ids={grievances} />}
        </section>

        <aside className="space-y-4">
          <TemplatePicker
            templates={templates}
            value={selectedTpl}
            onChange={onTemplateChange}
            disabled={thinking || !!pendingValidation}
            onAddNew={() => setShowTplBuilder(true)}
            sessionId={sessionId}
            onImportJson={importTemplatesJson}
            onImportCsv={importTemplatesCsv}
            onRollback={rollbackTemplate}
          />
          {showTplBuilder && (
            <TemplateBuilder
              onSave={async (tpl) => {
                const ok = await registerTemplate(tpl);
                if (ok) setShowTplBuilder(false);
              }}
              onCancel={() => setShowTplBuilder(false)}
            />
          )}
          <DocumentUpload sessionId={sessionId} onUploaded={(d) => setDocs((x) => [...x, d])} />
          {docs.length > 0 && <DocsPanel docs={docs} />}
          <Tip text={t.sub} />
        </aside>
      </main>

      <Composer
        lang={lang}
        sessionId={sessionId}
        onSend={sendText}
        disabled={thinking || !!pendingValidation}
        mockVoice={mockVoice}
      />
      <audio ref={audioRef} hidden />
    </div>
  );
}

function Conversation({ messages, thinking }: { messages: Msg[]; thinking: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);
  return (
    <div ref={ref} className="h-[55vh] overflow-y-auto rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
      {messages.map((m, i) => (
        <div key={i} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            <div className="text-base leading-snug">{m.text}</div>
          </div>
        </div>
      ))}
      {thinking && (
        <div className="flex justify-start">
          <div className="rounded-2xl bg-secondary px-4 py-2 text-secondary-foreground">
            <span className="inline-flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function confidenceTone(c: number) {
  if (c >= 0.85) return { label: "high", cls: "bg-green-500/15 text-green-700 border-green-500/30" };
  if (c >= 0.5) return { label: "med", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  if (c > 0) return { label: "low", cls: "bg-red-500/15 text-red-700 border-red-500/30" };
  return { label: "empty", cls: "bg-muted text-muted-foreground border-border" };
}

function ValidationPanel({
  templateId,
  proposed,
  onConfirm,
  onCancel,
}: {
  templateId: string;
  proposed: FieldProposal[];
  onConfirm: (fields: Record<string, string>, changes: { field: string; from: string; to: string }[]) => void;
  onCancel: () => void;
}) {
  const initial = Object.fromEntries(proposed.map((p) => [p.key, p.value]));
  const [fields, setFields] = useState<Record<string, string>>(initial);
  const [audit, setAudit] = useState<{ field: string; from: string; to: string; at: number }[]>([]);

  const onEdit = (key: string, value: string) => {
    setFields((f) => {
      const from = f[key] ?? "";
      if (from !== value) {
        setAudit((a) => [...a, { field: key, from, to: value, at: Date.now() }]);
      }
      return { ...f, [key]: value };
    });
  };

  const missingRequired = proposed.filter((p) => p.required && !(fields[p.key] ?? "").trim());

  return (
    <div className="rounded-2xl border-2 border-primary/60 bg-card p-5 shadow-lg">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        Human validation required
      </div>
      <div className="mb-4 text-sm text-muted-foreground">
        Template <span className="font-mono">{templateId}</span> · {proposed.length} fields ·{" "}
        {proposed.filter((p) => p.confidence >= 0.85).length} high-confidence ·{" "}
        {proposed.filter((p) => p.confidence === 0).length} missing
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {proposed.map((p) => {
          const tone = confidenceTone(p.confidence);
          return (
            <label key={p.key} className="block text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {p.label}
                  {p.required && <span className="ml-1 text-destructive">*</span>}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${tone.cls}`}>
                  {tone.label} · {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <input
                value={fields[p.key] ?? ""}
                onChange={(e) => onEdit(p.key, e.target.value)}
                placeholder={p.confidence === 0 ? "— missing, please fill —" : ""}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${
                  p.required && !(fields[p.key] ?? "").trim()
                    ? "border-destructive/50"
                    : "border-input"
                }`}
              />
              <div className="mt-1 text-[11px] text-muted-foreground">
                source: <span className="font-mono">{p.source}</span>
              </div>
            </label>
          );
        })}
      </div>

      {audit.length > 0 && (
        <details className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Edit audit log ({audit.length})</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {audit.map((a, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{new Date(a.at).toLocaleTimeString()}</span>{" "}
                <span className="font-semibold">{a.field}</span>: "{a.from}" → "{a.to}"
              </li>
            ))}
          </ul>
        </details>
      )}

      {missingRequired.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
          ⚠ {missingRequired.length} required field(s) still empty: {missingRequired.map((m) => m.label).join(", ")}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => {
            const changes = audit.map(({ field, from, to }) => ({ field, from, to }));
            onConfirm(fields, changes);
          }}
          disabled={missingRequired.length > 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          ✓ Confirm &amp; generate PDF
        </button>
        <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function PayloadDiff({ a, b }: { a: GrievancePayload; b: GrievancePayload }) {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as (keyof GrievancePayload)[];
  const rows = keys
    .map((k) => ({ k, av: (a[k] ?? "") as string, bv: (b[k] ?? "") as string }))
    .filter((r) => r.av !== r.bv);
  if (rows.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-green-500/30 bg-green-500/10 p-2 text-[11px] text-green-700">
        ✓ Edited draft matches the strict-validated payload byte-for-byte.
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-[11px]">
      <div className="mb-1 font-semibold">Diff: your edits → normalised CPGRAMS payload ({rows.length} field(s))</div>
      <ul className="space-y-1 font-mono">
        {rows.map((r) => (
          <li key={r.k}>
            <span className="font-semibold">{r.k}</span>
            <div className="ml-2 text-red-700">- "{r.av}"</div>
            <div className="ml-2 text-green-700">+ "{r.bv}"</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function copyText(text: string) {
  try {
    navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function diffRowsCsv(a: GrievancePayload, b: GrievancePayload) {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as (keyof GrievancePayload)[];
  const header = "field,edited,normalised";
  const lines = [header];
  for (const k of keys) {
    const av = (a[k] ?? "") as string;
    const bv = (b[k] ?? "") as string;
    if (av === bv) continue;
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    lines.push(`${esc(String(k))},${esc(av)},${esc(bv)}`);
  }
  return lines.join("\n");
}

function diffRowsJson(a: GrievancePayload, b: GrievancePayload) {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as (keyof GrievancePayload)[];
  return JSON.stringify(
    keys
      .map((k) => ({ field: String(k), edited: (a[k] ?? "") as string, normalised: (b[k] ?? "") as string }))
      .filter((r) => r.edited !== r.normalised),
    null,
    2,
  );
}

function GrievanceDrafts({
  drafts,
  onSubmit,
  onCancel,
  onPriorityChange,
  onRetryAll,
  onBulk,
  cpgramsReady,
  sessionId,
}: {
  drafts: GrievanceDraft[];
  onSubmit: (id: string) => void;
  onCancel: (id: string) => void;
  onPriorityChange: (id: string, delta: number) => void;
  onRetryAll: () => void;
  onBulk: (op: "cancel" | "prioritize" | "deprioritize" | "submit", draftIds: string[]) => void;
  cpgramsReady: boolean;
  sessionId: string;
}) {
  const pending = drafts.filter((d) => d.status !== "submitted" && d.status !== "cancelled");
  const ordered = [...drafts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectablePending = ordered.filter((d) => d.status !== "submitted" && d.status !== "cancelled");
  const allSelected = selectablePending.length > 0 && selectablePending.every((d) => selected.has(d.draftId));
  const selectedIds = selectablePending.filter((d) => selected.has(d.draftId)).map((d) => d.draftId);

  const runBulk = (op: "cancel" | "prioritize" | "deprioritize" | "submit") => {
    onBulk(op, selectedIds);
    if (op === "cancel" || op === "submit") setSelected(new Set());
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Grievance drafts ({drafts.length})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
              cpgramsReady ? "bg-green-500/15 text-green-700" : "bg-amber-500/15 text-amber-700"
            }`}
            title={
              cpgramsReady
                ? "CPGRAMS_API_KEY is configured — drafts will auto-submit."
                : "Waiting for CPGRAMS_API_KEY — pending drafts auto-submit the moment it arrives."
            }
          >
            CPGRAMS {cpgramsReady ? "live" : "pending"}
          </span>
          <a
            href={`/api/session/export?sessionId=${sessionId}&mode=grievance-audit`}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
            title="Full audit log: edits, validations, queue actions, submit results"
          >
            ⬇ Audit JSON
          </a>
          <a
            href={`/api/session/export?sessionId=${sessionId}&mode=grievance-audit-csv`}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            ⬇ Audit CSV
          </a>
          {pending.length > 0 && (
            <button
              onClick={onRetryAll}
              className="rounded-md bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
            >
              ↻ Retry now
            </button>
          )}
        </div>
      </div>

      {selectablePending.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? new Set(selectablePending.map((d) => d.draftId)) : new Set(),
                )
              }
            />
            Select all pending ({selectablePending.length})
          </label>
          <span className="text-muted-foreground">· {selectedIds.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-1">
            <button
              disabled={selectedIds.length === 0}
              onClick={() => runBulk("prioritize")}
              className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
            >
              ▲ prioritize
            </button>
            <button
              disabled={selectedIds.length === 0}
              onClick={() => runBulk("deprioritize")}
              className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
            >
              ▼ deprioritize
            </button>
            <button
              disabled={selectedIds.length === 0 || !cpgramsReady}
              onClick={() => runBulk("submit")}
              title={cpgramsReady ? "Submit selected now" : "Waiting for CPGRAMS_API_KEY"}
              className="rounded-md bg-primary px-2 py-1 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              ✓ submit selected
            </button>
            <button
              disabled={selectedIds.length === 0}
              onClick={() => runBulk("cancel")}
              className="rounded-md border border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              ✕ cancel selected
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {ordered.map((d) => {
          const issueFields = new Set((d.validationIssues ?? []).map((i) => i.field));
          const checkable = d.status !== "submitted" && d.status !== "cancelled";
          return (
            <li key={d.draftId} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {checkable && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(d.draftId)}
                      onChange={() => toggle(d.draftId)}
                      aria-label={`Select draft ${d.draftId}`}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{d.payload.subject}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.payload.ministry_or_department} · {d.payload.applicant_name}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {(d.priority ?? 0) !== 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      prio {d.priority}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      d.status === "submitted"
                        ? "bg-green-500/15 text-green-700"
                        : d.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : d.status === "cancelled"
                            ? "bg-muted text-muted-foreground line-through"
                            : d.status === "pending_key"
                              ? "bg-blue-500/15 text-blue-700"
                              : d.status === "draft"
                                ? "bg-muted text-muted-foreground"
                                : "bg-amber-500/15 text-amber-700"
                    }`}
                  >
                    {d.status === "pending_key" ? "queued" : d.status}
                    {d.attempts ? ` · ${d.attempts}×` : ""}
                  </span>
                </div>
              </div>

              {d.status === "submitted" && d.regId && (
                <div className="mt-2 rounded-md border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-800">
                  ✓ CPGRAMS accepted ·{" "}
                  <span className="font-mono font-semibold">{d.regId}</span>
                  {d.submittedAt && (
                    <span className="ml-2 text-muted-foreground">
                      {new Date(d.submittedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              {d.validationIssues && d.validationIssues.length > 0 && (
                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  <div className="mb-1 font-semibold">
                    CPGRAMS rejected {d.validationIssues.length} field(s):
                  </div>
                  <table className="w-full font-mono text-[11px]">
                    <tbody>
                      {d.validationIssues.map((i, idx) => (
                        <tr key={idx} className="border-t border-destructive/20">
                          <td className="py-1 pr-2 align-top font-semibold">{i.field}</td>
                          <td className="py-1 pr-2 align-top">
                            <span className="text-destructive/80">
                              "{(d.payload as Record<string, string>)[i.field] ?? ""}"
                            </span>
                          </td>
                          <td className="py-1 align-top text-destructive">{i.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {d.normalisedPayload && d.status !== "submitted" && (
                <PayloadDiff a={d.payload} b={d.normalisedPayload} />
              )}

              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">CPGRAMS payload</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono">
                  {JSON.stringify(d.payload, null, 2)}
                </pre>
                {Object.keys(d.payload).map((k) =>
                  issueFields.has(k) ? (
                    <div key={k} className="ml-1 text-[10px] text-destructive">
                      ⚠ field <span className="font-mono">{k}</span> flagged above
                    </div>
                  ) : null,
                )}
              </details>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  onClick={() => copyText(JSON.stringify(d.normalisedPayload ?? d.payload, null, 2))}
                  className="rounded-md border border-border px-2 py-1 hover:bg-muted"
                  title="Copy the final (normalised if valid, otherwise raw) CPGRAMS payload as JSON"
                >
                  ⧉ payload JSON
                </button>
                {d.normalisedPayload && (
                  <>
                    <button
                      onClick={() => copyText(diffRowsJson(d.payload, d.normalisedPayload!))}
                      className="rounded-md border border-border px-2 py-1 hover:bg-muted"
                    >
                      ⧉ diff JSON
                    </button>
                    <button
                      onClick={() => copyText(diffRowsCsv(d.payload, d.normalisedPayload!))}
                      className="rounded-md border border-border px-2 py-1 hover:bg-muted"
                    >
                      ⧉ diff CSV
                    </button>
                  </>
                )}
                <a
                  href={`/api/session/export?sessionId=${sessionId}&mode=grievance-audit&draftId=${d.draftId}`}
                  className="rounded-md border border-border px-2 py-1 hover:bg-muted"
                >
                  ⬇ this draft (JSON)
                </a>
                <a
                  href={`/api/session/export?sessionId=${sessionId}&mode=grievance-audit-csv&draftId=${d.draftId}`}
                  className="rounded-md border border-border px-2 py-1 hover:bg-muted"
                >
                  ⬇ events CSV
                </a>
              </div>

              {d.lastError && !d.validationIssues && (
                <div className="mt-2 text-xs text-destructive">Last error: {d.lastError}</div>
              )}
              {d.status === "pending_key" && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  ⏳ Queued — will auto-send the instant CPGRAMS_API_KEY is added (polled every 15s).
                </div>
              )}

              {d.auditEvents && d.auditEvents.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Audit trail ({d.auditEvents.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                    {d.auditEvents.map((ev, i) => (
                      <li key={i}>
                        <span className="text-muted-foreground">
                          {new Date(ev.ts).toLocaleTimeString()}
                        </span>{" "}
                        <span className="font-semibold">{ev.action}</span>
                        {ev.detail ? ` — ${ev.detail}` : ""}
                        {ev.regId ? ` · regId=${ev.regId}` : ""}
                        {typeof ev.priority === "number" ? ` · prio=${ev.priority}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {d.status !== "submitted" && d.status !== "cancelled" && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {d.status !== "draft" && (
                    <button
                      onClick={() => onSubmit(d.draftId)}
                      className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                    >
                      Confirm &amp; send now
                    </button>
                  )}
                  <button
                    onClick={() => onPriorityChange(d.draftId, +1)}
                    title="Raise priority in auto-resend queue"
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    ▲ prioritize
                  </button>
                  <button
                    onClick={() => onPriorityChange(d.draftId, -1)}
                    title="Lower priority"
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => onCancel(d.draftId)}
                    className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    ✕ cancel
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ValidationHistory({
  records,
  sessionId,
}: {
  records: ValidationRecord[];
  sessionId: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Validation audit log ({records.length})
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/session/export?sessionId=${sessionId}&mode=audit`}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            ⬇ Audit JSON
          </a>
          <a
            href={`/api/session/export?sessionId=${sessionId}&mode=audit-csv`}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            ⬇ Audit CSV
          </a>
        </div>
      </div>
      <ul className="space-y-3">
        {records.map((v) => (
          <li key={v.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{v.templateId}</div>
                <div className="text-xs text-muted-foreground">
                  {v.confirmedAt ? new Date(v.confirmedAt).toLocaleString() : ""} · {v.changes.length} edit(s)
                </div>
              </div>
              <a
                href={`/api/session/export?sessionId=${sessionId}&mode=audit&validationId=${v.id}`}
                className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                ⬇ This record
              </a>
            </div>
            {v.changes.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Edits</summary>
                <ul className="mt-1 space-y-0.5 font-mono">
                  {v.changes.map((c, i) => (
                    <li key={i}>
                      <span className="font-semibold">{c.field}</span>: "{c.from}" → "{c.to}"
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}



function SchemesList({ schemes }: { schemes: Scheme[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Eligible schemes ({schemes.length})
      </div>
      <ul className="space-y-3">
        {schemes.map((s) => (
          <li key={s.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.ministry}</div>
              </div>
              {s.apply_url && (
                <a
                  href={s.apply_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                >
                  Apply
                </a>
              )}
            </div>
            <div className="mt-2 text-sm">{s.benefits}</div>
            {s.documents_required.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                Docs needed: {s.documents_required.join(", ")}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PdfsList({ pdfs, sessionId }: { pdfs: { url: string; templateId: string }[]; sessionId: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filled PDFs</div>
        <a
          href={`/api/session/export?sessionId=${sessionId}`}
          className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
        >
          ⬇ Bundle JSON
        </a>
      </div>
      <ul className="space-y-2">
        {pdfs.map((p, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="text-sm font-medium">📄 {p.templateId}.pdf</div>
            <a
              href={p.url}
              download={`${p.templateId}.pdf`}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GrievanceList({ ids }: { ids: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        CPGRAMS grievances filed
      </div>
      <ul className="space-y-2 font-mono text-sm">
        {ids.map((id) => (
          <li key={id} className="rounded-lg border border-border p-3">
            ⚖️ {id}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocsPanel({ docs }: { docs: { kind: string; fields: Record<string, string> }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Documents on file
      </div>
      {docs.map((d, i) => (
        <div key={i} className="mb-3 rounded-lg border border-border p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">{d.kind}</div>
          {Object.entries(d.fields).slice(0, 5).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{k}</span>
              <span className="truncate font-medium">{v}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TemplatePicker({
  templates,
  value,
  onChange,
  disabled,
  onAddNew,
  sessionId,
  onImportJson,
  onImportCsv,
  onRollback,
}: {
  templates: TemplateMeta[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  onAddNew: () => void;
  sessionId: string;
  onImportJson: (file: File) => void;
  onImportCsv: (file: File) => void;
  onRollback: (templateId: string, toVersion: number) => void;
}) {
  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  type SnapField = { key: string; label: string; required?: boolean; aliases?: string[]; source?: string };
  type Snap = { version: number; name: string; ministry: string; scheme: string; fields: SnapField[]; savedAt: number; note?: string };
  const [history, setHistory] = useState<Snap[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [currentSnap, setCurrentSnap] = useState<Snap | null>(null);
  const [diffA, setDiffA] = useState<number | null>(null);
  const [diffB, setDiffB] = useState<number | null>(null);

  const loadHistory = useCallback(
    async (id: string) => {
      const r = await fetch(`/api/templates?sessionId=${sessionId}&templateId=${id}`);
      const d = (await r.json()) as {
        history?: Snap[];
        version?: number;
        template?: { name: string; ministry: string; scheme: string; fields: SnapField[] };
      };
      setHistory(d.history ?? []);
      setCurrentVersion(d.version ?? null);
      setCurrentSnap(
        d.template && typeof d.version === "number"
          ? {
              version: d.version,
              name: d.template.name,
              ministry: d.template.ministry,
              scheme: d.template.scheme,
              fields: d.template.fields,
              savedAt: Date.now(),
              note: "current",
            }
          : null,
      );
      setDiffA(null);
      setDiffB(null);
      setShowHistory(id);
    },
    [sessionId],
  );

  const customCount = templates.filter((t) => t.custom).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-1">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          📋 Form template
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onAddNew}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            + new
          </button>
          <button
            type="button"
            onClick={() => jsonRef.current?.click()}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
            title="Bulk-import templates as JSON array"
          >
            ⬆ JSON
          </button>
          <button
            type="button"
            onClick={() => csvRef.current?.click()}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
            title="Bulk-import templates as CSV (one row per field)"
          >
            ⬆ CSV
          </button>
          <input
            ref={jsonRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportJson(f);
              if (jsonRef.current) jsonRef.current.value = "";
            }}
          />
          <input
            ref={csvRef}
            type="file"
            accept="text/csv,.csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportCsv(f);
              if (csvRef.current) csvRef.current.value = "";
            }}
          />
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— choose a template —</option>
        <optgroup label="Built-in">
          {templates.filter((t) => !t.custom).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.fieldCount} fields)
            </option>
          ))}
        </optgroup>
        {customCount > 0 && (
          <optgroup label="Your templates">
            {templates.filter((t) => t.custom).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} v{t.version ?? 1} ({t.fieldCount} fields)
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {customCount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <a
            href={`/api/templates?sessionId=${sessionId}&mode=export-json`}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            ⬇ Export JSON
          </a>
          <a
            href={`/api/templates?sessionId=${sessionId}&mode=export-csv`}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            ⬇ Export CSV
          </a>
        </div>
      )}

      {customCount > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Version history
          </div>
          <ul className="space-y-1 text-xs">
            {templates
              .filter((t) => t.custom)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="font-mono">{t.id}</span> · v{t.version ?? 1}
                    {t.historyCount ? ` · ${t.historyCount} older` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadHistory(t.id)}
                    disabled={!(t.historyCount && t.historyCount > 0)}
                    className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-40"
                  >
                    history
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {showHistory && (
        <div className="mt-3 rounded-md border border-primary/40 bg-muted/30 p-2 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">
              {showHistory} — versions (current v{currentVersion})
            </span>
            <button onClick={() => setShowHistory(null)} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>

          {(() => {
            const all: Snap[] = currentSnap ? [currentSnap, ...history] : [...history];
            if (all.length === 0) {
              return <div className="text-muted-foreground">No prior versions yet.</div>;
            }
            const pickHandler = (v: number) => () => {
              if (diffA === v) setDiffA(null);
              else if (diffB === v) setDiffB(null);
              else if (diffA == null) setDiffA(v);
              else if (diffB == null) setDiffB(v);
              else {
                setDiffA(v);
                setDiffB(null);
              }
            };
            const snapA = diffA != null ? all.find((s) => s.version === diffA) : null;
            const snapB = diffB != null ? all.find((s) => s.version === diffB) : null;
            return (
              <>
                <div className="mb-1 text-[10px] text-muted-foreground">
                  Tick two versions to compare field mappings before rolling back.
                </div>
                <ul className="space-y-1">
                  {all
                    .slice()
                    .sort((a, b) => b.version - a.version)
                    .map((h) => {
                      const isCurrent = h.version === currentVersion;
                      const checked = diffA === h.version || diffB === h.version;
                      return (
                        <li
                          key={h.version}
                          className="flex items-center justify-between gap-2 rounded border border-border bg-background/50 p-1.5"
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-1.5">
                            <input type="checkbox" checked={checked} onChange={pickHandler(h.version)} />
                            <span className="truncate">
                              <span className="font-semibold">v{h.version}</span>
                              {isCurrent ? " (current)" : ""} · {h.fields.length} fields ·{" "}
                              <span className="text-muted-foreground">
                                {new Date(h.savedAt).toLocaleString()}
                              </span>
                              {h.note && (
                                <span className="ml-1 italic text-muted-foreground">({h.note})</span>
                              )}
                            </span>
                          </label>
                          {!isCurrent && (
                            <button
                              onClick={() => {
                                onRollback(showHistory, h.version);
                                setShowHistory(null);
                              }}
                              className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90"
                            >
                              ↺ rollback
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>

                {snapA && snapB && <TemplateVersionDiff a={snapA} b={snapB} />}
                {(snapA && !snapB) || (!snapA && snapB) ? (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Pick one more version to render the field-mapping diff.
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      )}


      <div className="mt-2 text-[11px] text-muted-foreground">
        The agent auto-maps your extracted docs into the chosen layout. Re-registering a template archives the prior version for rollback.
      </div>
    </div>
  );
}

type BuilderField = {
  key: string;
  label: string;
  required: boolean;
  aliases: string;
  source: "aadhaar" | "ration" | "income" | "demographics" | "user";
};

function TemplateBuilder({
  onSave,
  onCancel,
}: {
  onSave: (tpl: {
    id: string;
    name: string;
    ministry: string;
    scheme: string;
    fields: { key: string; label: string; required?: boolean; aliases?: string[]; source?: string }[];
  }) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [ministry, setMinistry] = useState("");
  const [scheme, setScheme] = useState("");
  const [fields, setFields] = useState<BuilderField[]>([
    { key: "applicant_name", label: "Applicant name", required: true, aliases: "applicant_name,name", source: "aadhaar" },
    { key: "uid_number", label: "Aadhaar UID", required: true, aliases: "uid_number", source: "aadhaar" },
  ]);

  const updateField = (i: number, patch: Partial<BuilderField>) =>
    setFields((arr) => arr.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addField = () =>
    setFields((arr) => [...arr, { key: "", label: "", required: false, aliases: "", source: "user" }]);
  const removeField = (i: number) => setFields((arr) => arr.filter((_, j) => j !== i));

  const save = () => {
    onSave({
      id: id.trim(),
      name: name.trim(),
      ministry: ministry.trim(),
      scheme: scheme.trim() || name.trim(),
      fields: fields.map((f) => ({
        key: f.key.trim(),
        label: f.label.trim(),
        required: f.required,
        aliases: f.aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        source: f.source,
      })),
    });
  };

  return (
    <div className="rounded-2xl border-2 border-primary/60 bg-card p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wider text-primary">
          Register new template
        </div>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>
      <div className="space-y-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value.toLowerCase())}
          placeholder="template id (e.g. mnrega-jobcard)"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="display name"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <input
          value={ministry}
          onChange={(e) => setMinistry(e.target.value)}
          placeholder="ministry / department"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <input
          value={scheme}
          onChange={(e) => setScheme(e.target.value)}
          placeholder="scheme name (optional)"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Fields & mapping
      </div>
      <div className="mt-2 space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="rounded-md border border-border p-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={f.key}
                onChange={(e) => updateField(i, { key: e.target.value })}
                placeholder="key (snake_case)"
                className="rounded border border-input bg-background px-2 py-1"
              />
              <input
                value={f.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
                placeholder="label"
                className="rounded border border-input bg-background px-2 py-1"
              />
            </div>
            <input
              value={f.aliases}
              onChange={(e) => updateField(i, { aliases: e.target.value })}
              placeholder="aliases comma-sep (e.g. card_number,ration_no)"
              className="mt-2 w-full rounded border border-input bg-background px-2 py-1"
            />
            <div className="mt-2 flex items-center gap-2">
              <select
                value={f.source}
                onChange={(e) => updateField(i, { source: e.target.value as BuilderField["source"] })}
                className="rounded border border-input bg-background px-2 py-1"
              >
                <option value="aadhaar">aadhaar</option>
                <option value="ration">ration</option>
                <option value="income">income</option>
                <option value="demographics">demographics</option>
                <option value="user">user-entered</option>
              </select>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                />
                required
              </label>
              <button
                onClick={() => removeField(i)}
                className="ml-auto rounded border border-border px-2 py-0.5 text-muted-foreground hover:text-destructive"
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addField} className="mt-2 text-xs text-primary hover:underline">
        + add field
      </button>

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Register template
        </button>
        <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function TemplateVersionDiff({
  a,
  b,
}: {
  a: { version: number; fields: { key: string; label: string; required?: boolean; aliases?: string[]; source?: string }[] };
  b: { version: number; fields: { key: string; label: string; required?: boolean; aliases?: string[]; source?: string }[] };
}) {
  const sig = (f: { label: string; required?: boolean; aliases?: string[]; source?: string }) =>
    JSON.stringify({
      label: f.label,
      required: !!f.required,
      aliases: (f.aliases ?? []).slice().sort(),
      source: f.source ?? "user",
    });
  const aMap = new Map(a.fields.map((f) => [f.key, f]));
  const bMap = new Map(b.fields.map((f) => [f.key, f]));
  const keys = Array.from(new Set([...aMap.keys(), ...bMap.keys()])).sort();
  type Row = { key: string; kind: "added" | "removed" | "changed" | "same"; a?: typeof a.fields[number]; b?: typeof b.fields[number] };
  const rows: Row[] = keys.map((k) => {
    const fa = aMap.get(k);
    const fb = bMap.get(k);
    if (!fa) return { key: k, kind: "added", b: fb };
    if (!fb) return { key: k, kind: "removed", a: fa };
    if (sig(fa) !== sig(fb)) return { key: k, kind: "changed", a: fa, b: fb };
    return { key: k, kind: "same", a: fa, b: fb };
  });
  const counts = {
    added: rows.filter((r) => r.kind === "added").length,
    removed: rows.filter((r) => r.kind === "removed").length,
    changed: rows.filter((r) => r.kind === "changed").length,
  };
  return (
    <div className="mt-2 rounded-md border border-border bg-background/60 p-2">
      <div className="mb-1 text-[11px] font-semibold">
        Diff v{a.version} → v{b.version} · +{counts.added} added · −{counts.removed} removed ·{" "}
        ~{counts.changed} changed
      </div>
      <ul className="space-y-1 font-mono text-[11px]">
        {rows
          .filter((r) => r.kind !== "same")
          .map((r) => (
            <li key={r.key} className="rounded border border-border/60 bg-background p-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={
                    r.kind === "added"
                      ? "rounded bg-green-500/15 px-1.5 text-green-700"
                      : r.kind === "removed"
                        ? "rounded bg-red-500/15 px-1.5 text-red-700"
                        : "rounded bg-amber-500/15 px-1.5 text-amber-700"
                  }
                >
                  {r.kind}
                </span>
                <span className="font-semibold">{r.key}</span>
              </div>
              {r.kind === "changed" && (
                <div className="ml-2 mt-1">
                  <div className="text-red-700">- {sig(r.a!)}</div>
                  <div className="text-green-700">+ {sig(r.b!)}</div>
                </div>
              )}
              {r.kind === "added" && <div className="ml-2 text-green-700">+ {sig(r.b!)}</div>}
              {r.kind === "removed" && <div className="ml-2 text-red-700">- {sig(r.a!)}</div>}
            </li>
          ))}
        {rows.every((r) => r.kind === "same") && (
          <li className="text-green-700">✓ Identical field mappings.</li>
        )}
      </ul>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-accent/40 p-4 text-sm">
      <div className="mb-1 font-semibold">{text}</div>
      <div className="text-xs text-muted-foreground">
        Try: <em>"मेरी उम्र 65 है, गाँव में रहता हूँ, कोई पेंशन योजना है?"</em>
      </div>
    </div>
  );
}

type SttStatus = {
  state: "idle" | "recording" | "transcribing" | "ok" | "error";
  source?: string; // "bhashini" | "lovable-ai"
  message?: string;
};

function Composer({
  lang,
  onSend,
  disabled,
  mockVoice,
}: {
  lang: LangCode;
  sessionId: string;
  onSend: (text: string) => void;
  disabled: boolean;
  mockVoice: boolean;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [partial, setPartial] = useState("");
  const [pttMode, setPttMode] = useState(false);
  const [status, setStatus] = useState<SttStatus>({ state: "idle" });
  const [showMicTest, setShowMicTest] = useState(false);
  const [pending, setPending] = useState<{ text: string; source?: string } | null>(null);

  const recorderRef = useRef<{
    stop: () => Promise<Blob>;
    cancel: () => void;
    elapsedMs: () => number;
  } | null>(null);
  const liveRef = useRef<{ stop: () => void } | null>(null);
  const timerRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  // Cache the last recorded audio so users can retry transcription (or switch engine) without re-recording.
  const lastAudioRef = useRef<{ b64: string; lang: string } | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const startMock = useCallback(() => {
    const utterance = window.prompt(
      "🎙 Mock voice mode\nType what the user would have said (in any language). The agent will treat this as the ASR transcript:",
    );
    if (utterance && utterance.trim()) {
      setPending({ text: utterance.trim(), source: "mock" });
      setStatus({ state: "ok", source: "mock", message: "Mock transcript ready — review and send." });
    }
  }, []);

  // Shared call to the ASR endpoint. Used by both the initial stop() and Retry.
  const transcribe = useCallback(
    async (b64: string, useLang: string, prefer: "auto" | "bhashini" | "lovable-ai") => {
      setTranscribing(true);
      setStatus({
        state: "transcribing",
        message:
          prefer === "bhashini"
            ? "Retrying with Bhashini…"
            : prefer === "lovable-ai"
              ? "Retrying with Lovable AI fallback…"
              : "Sending audio to speech engine…",
      });
      try {
        const res = await fetch("/api/bhashini/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: b64, lang: useLang, prefer }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          transcript: string;
          translatedEnglish: string;
          source?: string;
          error?: string;
        };
        if (data.ok && (data.translatedEnglish || data.transcript)) {
          setStatus({
            state: "ok",
            source: data.source,
            message: `Transcribed via ${data.source === "bhashini" ? "Bhashini" : "Lovable AI fallback"} — review and send.`,
          });
          setPending({ text: data.translatedEnglish || data.transcript, source: data.source });
        } else {
          setStatus({
            state: "error",
            source: data.source,
            message:
              data.error ||
              "Speech recognition could not understand the audio. Try again, speak louder, or type instead.",
          });
        }
      } catch (err) {
        console.error("[mic] transcription failed", err);
        setStatus({
          state: "error",
          message:
            err instanceof Error
              ? `Transcription failed: ${err.message}`
              : "Transcription failed. Check your network and try again.",
        });
      } finally {
        setTranscribing(false);
        setPartial("");
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    liveRef.current?.stop();
    liveRef.current = null;
    setRecording(false);
    setLevel(0);
    if (!rec) {
      finishingRef.current = false;
      return;
    }
    setTranscribing(true);
    setStatus({ state: "transcribing", message: "Sending audio to speech engine…" });
    try {
      const blob = await rec.stop();
      if (blob.size < 2048) {
        setStatus({
          state: "error",
          message: "Recording was too short or silent. Hold the button longer and speak clearly.",
        });
        setCanRetry(false);
        lastAudioRef.current = null;
        return;
      }
      const { bytesToBase64 } = await import("@/lib/audio/wav");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToBase64(bytes);
      lastAudioRef.current = { b64, lang };
      setCanRetry(true);
      await transcribe(b64, lang, "auto");
    } catch (err) {
      console.error("[mic] recording failed", err);
      setStatus({
        state: "error",
        message:
          err instanceof Error
            ? `Recording failed: ${err.message}`
            : "Recording failed. Try again.",
      });
    } finally {
      finishingRef.current = false;
    }
  }, [lang, transcribe]);

  const retryTranscription = useCallback(
    async (prefer: "auto" | "bhashini" | "lovable-ai") => {
      const cached = lastAudioRef.current;
      if (!cached) return;
      setPending(null);
      await transcribe(cached.b64, cached.lang, prefer);
    },
    [transcribe],
  );

  const startReal = useCallback(async () => {
    if (recording) return;
    setStatus({ state: "recording", message: "Listening…" });
    setPartial("");
    setElapsed(0);
    try {
      const { startWavRecording } = await import("@/lib/audio/wav");
      const { startLiveTranscription } = await import("@/lib/audio/speech");

      const rec = await startWavRecording({
        onLevel: (rms) => setLevel(rms),
        silenceMs: 1800,
        onSilence: () => {
          // Auto-stop after 1.8 s of silence following speech.
          stop();
        },
        maxMs: 30_000,
        onMaxReached: () => stop(),
      });
      recorderRef.current = rec;
      timerRef.current = window.setInterval(() => {
        setElapsed(rec.elapsedMs());
      }, 100);

      // Live partials (Chrome/Edge). Falls back silently.
      liveRef.current = startLiveTranscription(
        lang,
        (txt) => setPartial(txt),
        () => {
          /* swallow Web Speech errors — server STT is authoritative */
        },
      );

      setRecording(true);
    } catch (err) {
      console.error(err);
      setStatus({
        state: "error",
        message:
          err instanceof Error && /denied|Permission/i.test(err.message)
            ? "Microphone permission was denied. Enable it in your browser site settings."
            : "Could not access the microphone. Is another app using it?",
      });
    }
  }, [lang, recording, stop]);

  // Push-to-talk handlers
  const pttDown = useCallback(() => {
    if (mockVoice) return;
    if (!recording && !transcribing) startReal();
  }, [mockVoice, recording, transcribing, startReal]);
  const pttUp = useCallback(() => {
    if (mockVoice) return;
    if (recording) stop();
  }, [mockVoice, recording, stop]);

  // Cancel current recording without transcribing (Esc key).
  const cancelRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    liveRef.current?.stop();
    liveRef.current = null;
    try {
      rec.cancel();
    } catch {
      /* ignore */
    }
    setRecording(false);
    setLevel(0);
    setPartial("");
    setStatus({ state: "idle", message: "Recording cancelled." });
  }, []);

  // Keyboard controls: Space/Enter to hold-to-talk (PTT), Esc to cancel.
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && recording) {
        e.preventDefault();
        cancelRecording();
        return;
      }
      if (!pttMode || mockVoice) return;
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        pttDown();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!pttMode || mockVoice) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        pttUp();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pttMode, mockVoice, recording, pttDown, pttUp, cancelRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      liveRef.current?.stop();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const onTap = mockVoice ? startMock : recording ? stop : startReal;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <>
      <MicTestDialog open={showMicTest} onClose={() => setShowMicTest(false)} lang={lang} />
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 pt-2">
          <SttStatusPanel
            status={status}
            recording={recording}
            elapsedMs={elapsed}
            level={level}
            partial={partial}
            pttMode={pttMode}
            onPttToggle={() => setPttMode((v) => !v)}
            onMicTest={() => setShowMicTest(true)}
          />
          {pending && (
            <TranscriptConfirm
              initialText={pending.text}
              source={pending.source}
              onConfirm={(finalText) => {
                onSend(finalText);
                setPending(null);
                setStatus({ state: "idle" });
              }}
              onDiscard={() => {
                setPending(null);
                setStatus({ state: "idle" });
              }}
              onRetake={() => {
                setPending(null);
                setStatus({ state: "idle" });
                if (!mockVoice) startReal();
                else startMock();
              }}
            />
          )}
        </div>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            // In PTT mode, hold to talk; otherwise tap to toggle.
            onClick={pttMode ? undefined : onTap}
            onPointerDown={pttMode ? pttDown : undefined}
            onPointerUp={pttMode ? pttUp : undefined}
            onPointerLeave={pttMode && recording ? pttUp : undefined}
            disabled={disabled || transcribing}
            aria-pressed={recording}
            aria-keyshortcuts={pttMode ? "Space Enter" : undefined}
            className={`relative flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full text-2xl shadow-lg transition disabled:opacity-50 ${
              recording ? "bg-destructive text-destructive-foreground pulse-ring" : "bg-primary text-primary-foreground"
            }`}
            aria-label={
              mockVoice
                ? "Mock voice input"
                : pttMode
                  ? recording
                    ? "Recording — release Space or Enter to stop, Esc to cancel"
                    : "Hold Space or Enter to talk"
                  : recording
                    ? "Stop recording (Esc to cancel)"
                    : "Start recording"
            }
            title={
              mockVoice
                ? "Mock voice (typed simulation)"
                : pttMode
                  ? "Push-to-talk (hold mic, Space, or Enter)"
                  : "Tap to talk"
            }
          >
            <span aria-hidden="true">
              {mockVoice ? "💬" : transcribing ? "⏳" : recording ? "■" : "🎙"}
            </span>
          </button>
          <form onSubmit={submit} className="flex flex-1 items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                mockVoice
                  ? "Mock voice on — tap 💬 to simulate, or type here"
                  : recording
                    ? partial || "Listening…"
                    : pttMode
                      ? "Hold the mic to talk, or type"
                      : "Type or tap the mic"
              }
              disabled={recording}
              className="flex-1 rounded-full border border-input bg-card px-5 py-3 text-base outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function SttStatusPanel({
  status,
  recording,
  elapsedMs,
  level,
  partial,
  pttMode,
  onPttToggle,
  onMicTest,
}: {
  status: SttStatus;
  recording: boolean;
  elapsedMs: number;
  level: number;
  partial: string;
  pttMode: boolean;
  onPttToggle: () => void;
  onMicTest: () => void;
}) {
  const sourceLabel =
    status.source === "bhashini"
      ? "Bhashini"
      : status.source === "lovable-ai"
        ? "Lovable AI fallback"
        : null;

  const stateColor =
    status.state === "ok"
      ? "border-[var(--india-green)]/30 bg-[var(--india-green)]/10 text-[var(--india-green)]"
      : status.state === "error"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : status.state === "recording"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : status.state === "transcribing"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-xs ${stateColor}`}
    >
      <div className="flex items-center gap-2 font-medium">
        {status.state === "recording" && <span>●</span>}
        {status.state === "transcribing" && <span>⏳</span>}
        {status.state === "ok" && <span>✓</span>}
        {status.state === "error" && <span>⚠</span>}
        {status.state === "idle" && <span>🎙</span>}
        <span>
          {status.state === "idle"
            ? "Mic ready"
            : status.state === "recording"
              ? "Listening"
              : status.state === "transcribing"
                ? "Transcribing"
                : status.state === "ok"
                  ? "Heard you"
                  : "Mic error"}
        </span>
        {sourceLabel && (
          <span className="ml-1 rounded-full bg-background/60 px-2 py-0.5 font-normal">
            via {sourceLabel}
          </span>
        )}
      </div>

      {recording && (
        <>
          <div className="flex items-center gap-2 text-foreground/80">
            <span className="tabular-nums">{(elapsedMs / 1000).toFixed(1)}s</span>
            <div className="flex h-3 w-24 items-end gap-px overflow-hidden rounded-sm bg-background/60">
              {Array.from({ length: 12 }).map((_, i) => {
                const threshold = (i + 1) / 12;
                const active = level >= threshold * 0.6;
                return (
                  <div
                    key={i}
                    className={`flex-1 ${active ? "bg-destructive" : "bg-muted-foreground/20"}`}
                    style={{ height: `${20 + threshold * 80}%` }}
                  />
                );
              })}
            </div>
          </div>
          {partial && (
            <div className="basis-full truncate text-foreground/90">
              <em>{partial}</em>
            </div>
          )}
        </>
      )}

      {!recording && status.message && (
        <div className="basis-full text-foreground/80">{status.message}</div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onPttToggle}
          aria-pressed={pttMode}
          aria-label={
            pttMode
              ? "Push-to-talk on — hold Space, Enter, or the mic to record"
              : "Push-to-talk off — tap the mic to toggle recording"
          }
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
            pttMode
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
          }`}
          title="Push-to-talk: hold the mic (or Space/Enter) to record. Esc cancels."
        >
          {pttMode ? "PTT on" : "PTT off"}
        </button>
        <button
          type="button"
          onClick={onMicTest}
          aria-label="Open microphone test"
          className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Mic test
        </button>
      </div>
    </div>
  );
}

function DocumentUpload({
  sessionId,
  onUploaded,
}: {
  sessionId: string;
  onUploaded: (d: { id: string; kind: string; fields: Record<string, string> }) => void;
}) {
  const [kind, setKind] = useState<"aadhaar" | "ration" | "income" | "other">("aadhaar");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const downscaleImage = async (file: File): Promise<{ b64: string; mime: string }> => {
    if (!file.type.startsWith("image/")) {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { b64: btoa(bin), mime: file.type || "application/octet-stream" };
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const b64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
      return { b64, mime: "image/jpeg" };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const { b64, mime } = await downscaleImage(file);
      const res = await fetch("/api/vision/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, kind, imageBase64: b64, mimeType: mime }),
      });
      const text = await res.text();
      let data: { ok?: boolean; fields?: Record<string, string>; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        alert(
          `Document extraction failed (HTTP ${res.status}). The image may be too large or the vision service is temporarily unavailable. Try a smaller/clearer photo.`,
        );
        return;
      }
      if (data.ok && data.fields) {
        onUploaded({ id: `d_${Date.now()}`, kind, fields: data.fields });
      } else {
        alert("Document extraction failed: " + (data.error ?? "unknown"));
      }
    } catch (e) {
      alert("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        📷 Snap a document
      </div>
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="aadhaar">Aadhaar card</option>
        <option value="ration">Ration card</option>
        <option value="income">Income certificate</option>
        <option value="other">Other</option>
      </select>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
        disabled={busy}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
      />
      {busy && <div className="mt-2 text-xs text-muted-foreground">Reading spatially with vision model…</div>}
      <div className="mt-2 text-[10px] text-muted-foreground">Held in memory only · UID auto-masked</div>
    </div>
  );
}

function TranscriptConfirm({
  initialText,
  source,
  onConfirm,
  onDiscard,
  onRetake,
}: {
  initialText: string;
  source?: string;
  onConfirm: (text: string) => void;
  onDiscard: () => void;
  onRetake: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setText(initialText);
    setEditing(false);
  }, [initialText]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const sourceLabel =
    source === "bhashini"
      ? "Bhashini"
      : source === "lovable-ai"
        ? "Lovable AI fallback"
        : source === "mock"
          ? "Mock voice"
          : "Speech engine";

  const empty = !text.trim();

  return (
    <div className="mt-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <div className="font-medium text-primary">
          🔎 Review transcript before sending
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            via {sourceLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
        >
          {editing ? "Done editing" : "✎ Edit"}
        </button>
      </div>
      {editing ? (
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !empty) {
              e.preventDefault();
              onConfirm(text.trim());
            }
          }}
          rows={2}
          className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
      ) : (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {text || <em className="text-muted-foreground">(empty)</em>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onRetake}
          className="rounded-full border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted"
        >
          🎙 Re-record
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() => onConfirm(text.trim())}
          className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-50"
        >
          Send ⏎
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Tip: ⌘/Ctrl + Enter to send while editing.
      </div>
    </div>
  );
}
