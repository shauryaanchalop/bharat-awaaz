import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type AgentEvent =
  | { type: "thinking" }
  | { type: "say"; text: string; lang: string; audioUrl?: string }
  | { type: "schemes"; schemes: Scheme[] }
  | { type: "document"; doc: { id: string; kind: string; fields: Record<string, string> } }
  | { type: "awaiting_validation"; id: string; payload: { templateId: string; fields: Record<string, string> }; resumeTo: string }
  | { type: "pdf_ready"; url: string; templateId: string }
  | { type: "grievance_filed"; regId: string }
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

function newSessionId() {
  return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function AppPage() {
  const { lang: langSearch } = Route.useSearch();
  const [lang, setLang] = useState<LangCode>(((langSearch as LangCode) || "hi") as LangCode);
  const t = UI_STRINGS[lang];

  const [sessionId] = useState(() => newSessionId());
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "नमस्ते! मुझे बताइए — आप क्या जानना चाहते हैं? कोई योजना, कोई फॉर्म, या कोई शिकायत?", lang: "hi" },
  ]);
  const [thinking, setThinking] = useState(false);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [docs, setDocs] = useState<{ id: string; kind: string; fields: Record<string, string> }[]>([]);
  const [pendingValidation, setPendingValidation] = useState<{
    id: string;
    templateId: string;
    fields: Record<string, string>;
  } | null>(null);
  const [pdfs, setPdfs] = useState<{ url: string; templateId: string }[]>([]);
  const [grievances, setGrievances] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

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
            }
            break;
          case "schemes":
            setSchemes(e.schemes);
            break;
          case "document":
            setDocs((d) => [...d, e.doc]);
            break;
          case "awaiting_validation":
            setPendingValidation({ id: e.id, templateId: e.payload.templateId, fields: e.payload.fields });
            setThinking(false);
            break;
          case "pdf_ready":
            setPdfs((p) => [...p, { url: e.url, templateId: e.templateId }]);
            break;
          case "grievance_filed":
            setGrievances((g) => [...g, e.regId]);
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
        // ignore
      }
    };
    es.onerror = () => {
      // browser will auto-retry
    };
    return () => es.close();
  }, [sessionId]);

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
    async (fields: Record<string, string>) => {
      if (!pendingValidation) return;
      await fetch("/api/agent/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          validationId: pendingValidation.id,
          payload: { templateId: pendingValidation.templateId, fields },
        }),
      });
      setPendingValidation(null);
      setThinking(true);
    },
    [pendingValidation, sessionId],
  );

  return (
    <div className="min-h-screen pb-32">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--saffron)] via-white to-[var(--india-green)]" />

      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="font-display text-xl font-bold">भारत-आवाज़</div>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent-foreground">
            agent live
          </span>
        </div>
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
              initial={pendingValidation.fields}
              onConfirm={confirmValidation}
              onCancel={() => setPendingValidation(null)}
            />
          )}

          {schemes.length > 0 && <SchemesList schemes={schemes} />}
          {pdfs.length > 0 && <PdfsList pdfs={pdfs} />}
          {grievances.length > 0 && <GrievanceList ids={grievances} />}
        </section>

        <aside className="space-y-4">
          <DocumentUpload sessionId={sessionId} onUploaded={(d) => setDocs((x) => [...x, d])} />
          {docs.length > 0 && <DocsPanel docs={docs} />}
          <Tip text={t.sub} />
        </aside>
      </main>

      <Composer lang={lang} sessionId={sessionId} onSend={sendText} disabled={thinking || !!pendingValidation} />
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
              m.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            <div className="text-base leading-snug">{m.text}</div>
            {m.audioUrl && (
              <button
                onClick={() => {
                  const a = new Audio(m.audioUrl);
                  a.play();
                }}
                className="mt-1 text-xs opacity-70 hover:opacity-100"
              >
                ▶ replay audio
              </button>
            )}
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

function ValidationPanel({
  templateId,
  initial,
  onConfirm,
  onCancel,
}: {
  templateId: string;
  initial: Record<string, string>;
  onConfirm: (fields: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState(initial);
  return (
    <div className="rounded-2xl border-2 border-primary/60 bg-card p-5 shadow-lg">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        Human validation required
      </div>
      <div className="mb-4 text-sm text-muted-foreground">
        Review and edit before we generate the official PDF for{" "}
        <span className="font-mono">{templateId}</span>. Aadhaar UIDs are masked by default.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(fields).map(([k, v]) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">{k}</span>
            <input
              value={v}
              onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onConfirm(fields)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          ✓ Confirm &amp; generate PDF
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Cancel
        </button>
      </div>
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

function PdfsList({ pdfs }: { pdfs: { url: string; templateId: string }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Filled PDFs
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
          <li key={id} className="rounded-lg border border-border p-3">⚖️ {id}</li>
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
  sessionId,
  onSend,
  disabled,
}: {
  lang: LangCode;
  sessionId: string;
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
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
          const data = (await res.json()) as { ok: boolean; transcript: string; translatedEnglish: string; error?: string };
          if (data.ok && (data.translatedEnglish || data.transcript)) {
            onSend(data.translatedEnglish || data.transcript);
          } else {
            // Bhashini not available — surface helpful message
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
  }, [lang, onSend, sessionId]);

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
          onClick={recording ? stop : start}
          disabled={disabled || transcribing}
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl shadow-lg transition disabled:opacity-50 ${
            recording ? "bg-destructive text-destructive-foreground pulse-ring" : "bg-primary text-primary-foreground"
          }`}
          aria-label={recording ? "Stop recording" : "Start recording"}
        >
          {transcribing ? "⏳" : recording ? "■" : "🎙"}
        </button>
        <form onSubmit={submit} className="flex flex-1 items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={recording ? "Listening…" : "Type or tap the mic"}
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
      const b64 = btoa(
        new Uint8Array(ab).reduce((acc, b) => acc + String.fromCharCode(b), ""),
      );
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
      <div className="mt-2 text-[10px] text-muted-foreground">
        Held in memory only · UID auto-masked
      </div>
    </div>
  );
}
