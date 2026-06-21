import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { LANGUAGES, UI_STRINGS, type LangCode } from "@/lib/i18n/languages";

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

type GrievanceDraft = {
  draftId: string;
  payload: {
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
  status: "draft" | "ready" | "pending_key" | "submitted" | "failed";
  regId?: string;
  lastError?: string;
  attempts?: number;
  validationIssues?: { field: string; message: string }[];
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

type TemplateMeta = { id: string; name: string; ministry: string; scheme: string; fieldCount: number; custom?: boolean };

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

  return (
    <div className="min-h-screen pb-32">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--saffron)] via-white to-[var(--india-green)]" />

      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4">
        <div className="flex items-center gap-3">
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
            <GrievanceDrafts drafts={drafts} onSubmit={submitDraft} onRetryAll={retryAllDrafts} />
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
          />
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

function GrievanceDrafts({
  drafts,
  onSubmit,
  onRetryAll,
}: {
  drafts: GrievanceDraft[];
  onSubmit: (id: string) => void;
  onRetryAll: () => void;
}) {
  const pending = drafts.filter((d) => d.status !== "submitted");
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Grievance drafts ({drafts.length})
        </div>
        {pending.length > 0 && (
          <button
            onClick={onRetryAll}
            className="rounded-md bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
          >
            ↻ Retry all
          </button>
        )}
      </div>
      <ul className="space-y-3">
        {drafts.map((d) => (
          <li key={d.draftId} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{d.payload.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {d.payload.ministry_or_department} · {d.payload.applicant_name}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  d.status === "submitted"
                    ? "bg-green-500/15 text-green-700"
                    : d.status === "failed"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-amber-500/15 text-amber-700"
                }`}
              >
                {d.status}
              </span>
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">CPGRAMS payload</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono">
                {JSON.stringify(d.payload, null, 2)}
              </pre>
            </details>
            {d.status === "submitted" && d.regId && (
              <div className="mt-2 text-xs">
                Reg ID: <span className="font-mono font-semibold">{d.regId}</span>
              </div>
            )}
            {d.lastError && (
              <div className="mt-2 text-xs text-destructive">Last error: {d.lastError}</div>
            )}
            {d.status !== "submitted" && (
              <button
                onClick={() => onSubmit(d.draftId)}
                className="mt-2 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
              >
                Confirm &amp; send
              </button>
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
}: {
  templates: TemplateMeta[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        📋 Form template
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— choose a template —</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.fieldCount} fields)
          </option>
        ))}
      </select>
      <div className="mt-2 text-[11px] text-muted-foreground">
        The agent will auto-map your extracted docs into this template and ask you to validate.
      </div>
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startMock = useCallback(() => {
    const utterance = window.prompt(
      "🎙 Mock voice mode\nType what the user would have said (in any language). The agent will treat this as the ASR transcript:",
    );
    if (utterance && utterance.trim()) onSend(utterance.trim());
  }, [onSend]);

  const startReal = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1024) return;
        setTranscribing(true);
        try {
          const ab = await blob.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
          const res = await fetch("/api/bhashini/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: b64, lang }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            transcript: string;
            translatedEnglish: string;
            error?: string;
          };
          if (data.ok && (data.translatedEnglish || data.transcript)) {
            onSend(data.translatedEnglish || data.transcript);
          } else {
            const fallback = window.prompt(
              data.error ? `Voice unavailable: ${data.error}\nType your message:` : "Type your message:",
            );
            if (fallback) onSend(fallback);
          }
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  }, [lang, onSend]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={mockVoice ? startMock : recording ? stop : startReal}
          disabled={disabled || transcribing}
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl shadow-lg transition disabled:opacity-50 ${
            recording ? "bg-destructive text-destructive-foreground pulse-ring" : "bg-primary text-primary-foreground"
          }`}
          aria-label={mockVoice ? "Mock voice input" : recording ? "Stop recording" : "Start recording"}
          title={mockVoice ? "Mock voice (typed simulation)" : "Real microphone"}
        >
          {mockVoice ? "💬" : transcribing ? "⏳" : recording ? "■" : "🎙"}
        </button>
        <form onSubmit={submit} className="flex flex-1 items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mockVoice
                ? "Mock voice on — tap 💬 to simulate, or type here"
                : recording
                  ? "Listening…"
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

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const ab = await file.arrayBuffer();
      const b64 = btoa(new Uint8Array(ab).reduce((acc, b) => acc + String.fromCharCode(b), ""));
      const res = await fetch("/api/vision/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, kind, imageBase64: b64, mimeType: file.type || "image/jpeg" }),
      });
      const data = (await res.json()) as { ok: boolean; fields?: Record<string, string>; error?: string };
      if (data.ok && data.fields) {
        onUploaded({ id: `d_${Date.now()}`, kind, fields: data.fields });
      } else {
        alert("Document extraction failed: " + (data.error ?? "unknown"));
      }
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
