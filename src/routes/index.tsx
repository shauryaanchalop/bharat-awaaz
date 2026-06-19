import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LANGUAGES, UI_STRINGS, type LangCode } from "@/lib/i18n/languages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bharat-Awaaz — Voice access to government schemes" },
      {
        name: "description",
        content:
          "A voice-first multilingual AI agent that helps every Indian citizen discover welfare schemes, read documents, fill forms, and file grievances — in their own language.",
      },
      { property: "og:title", content: "Bharat-Awaaz — Voice access to government schemes" },
      {
        property: "og:description",
        content: "Speak to your government — in your voice. Schemes · documents · forms · grievances.",
      },
    ],
  }),
  component: Landing,
});

function Chakra() {
  return (
    <svg viewBox="0 0 100 100" className="chakra-spin h-24 w-24 text-[var(--ashoka)] opacity-80" aria-hidden>
      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="3" />
      {Array.from({ length: 24 }).map((_, i) => (
        <line
          key={i}
          x1="50"
          y1="50"
          x2="50"
          y2="8"
          stroke="currentColor"
          strokeWidth="1.5"
          transform={`rotate(${(360 / 24) * i} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="5" fill="currentColor" />
    </svg>
  );
}

function Landing() {
  const [lang, setLang] = useState<LangCode>("hi");
  const t = UI_STRINGS[lang];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[var(--saffron)] via-white to-[var(--india-green)]" />

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 pt-20 pb-16">
        <div className="mb-8 flex items-center gap-4">
          <Chakra />
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Bharat · Awaaz · Agentic Framework
            </div>
            <h1 className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">भारत-आवाज़</h1>
          </div>
        </div>

        <h2 className="max-w-3xl text-center text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
          {t.tagline}
        </h2>
        <p className="mt-5 max-w-2xl text-center text-lg text-muted-foreground sm:text-xl">{t.sub}</p>

        <div className="mt-12 w-full max-w-3xl">
          <div className="mb-3 text-center text-sm font-medium text-muted-foreground">{t.pick_lang}</div>
          <div className="flex flex-wrap justify-center gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                className={`rounded-full border px-4 py-2 text-base transition ${
                  lang === l.code
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
              >
                <span className="font-medium">{l.native}</span>
                <span className="ml-2 text-xs opacity-70">{l.english}</span>
              </button>
            ))}
          </div>
        </div>

        <Link
          to="/app"
          search={{ lang }}
          className="mt-12 inline-flex items-center gap-3 rounded-full bg-primary px-10 py-5 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:translate-y-[-2px] hover:shadow-xl"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
          </span>
          {t.start}
        </Link>

        <div className="mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            { t: "Discover", d: "Find every scheme you qualify for via myScheme", icon: "🔎" },
            { t: "Read", d: "Snap any document — we extract what matters", icon: "📄" },
            { t: "Fill", d: "Auto-fill official PDF forms after you confirm", icon: "✍️" },
            { t: "Escalate", d: "File a CPGRAMS grievance when systems stall", icon: "⚖️" },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
              <div className="text-3xl">{f.icon}</div>
              <div className="mt-2 text-base font-semibold">{f.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.d}</div>
            </div>
          ))}
        </div>

        <footer className="mt-20 text-center text-xs text-muted-foreground">
          Powered by Bhashini ASR/NMT/TTS · myScheme · CPGRAMS · spatial document understanding.
          <br />
          Aadhaar numbers are masked by default. Audio &amp; images are never stored.
        </footer>
      </div>
    </main>
  );
}
