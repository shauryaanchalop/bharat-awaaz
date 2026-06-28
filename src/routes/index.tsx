import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mic, ArrowRight, FileText, ScanLine, Scale, Sparkles, MonitorSpeaker, Map, Users, ShieldCheck } from "lucide-react";
import { LANGUAGES, UI_STRINGS, type LangCode } from "@/lib/i18n/languages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bharat-Awaaz — Voice access to government schemes" },
      { name: "description", content: "A voice-first multilingual AI agent that helps every Indian citizen discover welfare schemes, read documents, fill forms, and file grievances — in their own language." },
      { property: "og:title", content: "Bharat-Awaaz — Voice access to government schemes" },
      { property: "og:description", content: "Speak to your government — in your voice. Schemes · documents · forms · grievances." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bharat-awaaz.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://bharat-awaaz.lovable.app/" }],
  }),
  component: Landing,
});

function CountUp({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span>{prefix}{n.toLocaleString("en-IN")}{suffix}</span>;
}

function Landing() {
  const [lang, setLang] = useState<LangCode>("hi");
  const t = UI_STRINGS[lang];

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* top tricolor hairline */}
      <div className="tricolor-bar absolute inset-x-0 top-0 h-[3px]" />

      {/* grid bg */}
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />

      {/* nav */}
      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--saffron)] to-[var(--india-green)] font-display text-lg font-bold text-black">
            भ
          </div>
          <div className="font-display text-base font-semibold tracking-tight">Bharat-Awaaz</div>
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          <Link to="/impact" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">Impact</Link>
          <Link to="/kiosk" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">Kiosk Mode</Link>
          <Link to="/auth" className="rounded-full px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">Sign in</Link>
          <Link to="/app" search={{ lang }} className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110">
            Launch app <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-12 pb-24 sm:pt-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--india-green)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--india-green)]" />
            </span>
            Built on Bhashini · myScheme · CPGRAMS · DigiLocker-ready
          </div>

          <h1 className="font-display text-balance text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl md:text-[88px]">
            Speak to your{" "}
            <span className="relative whitespace-nowrap">
              <span className="bg-gradient-to-r from-[var(--saffron)] via-orange-400 to-[var(--india-green)] bg-clip-text text-transparent">government</span>
              <svg className="absolute -bottom-2 left-0 h-3 w-full text-primary/60" viewBox="0 0 200 12" preserveAspectRatio="none"><path d="M2 8 Q 50 2, 100 6 T 198 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/></svg>
            </span>
            <br />
            in <span className="font-display italic text-foreground/90">your</span> voice.
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            An agentic AI that discovers welfare schemes, reads your documents, fills official PDF forms, and files grievances — across <span className="text-foreground">22 Indian languages</span>.
          </p>

          {/* language pills */}
          <div className="mt-10">
            <div className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.pick_lang}</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    lang === l.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span className="font-medium">{l.native}</span>
                </button>
              ))}
            </div>
          </div>

          {/* mic orb CTA */}
          <div className="mt-12 flex flex-col items-center gap-5">
            <Link to="/app" search={{ lang }} className="group relative">
              <div className="pulse-ring grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-[var(--saffron)] to-orange-600 transition group-hover:scale-105">
                <Mic className="h-12 w-12 text-black" strokeWidth={2.5} />
              </div>
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/app" search={{ lang }} className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:bg-foreground/90">
                {t.start} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/kiosk" className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur transition hover:border-primary/40">
                <MonitorSpeaker className="h-4 w-4" /> Kiosk Mode
              </Link>
            </div>
          </div>
        </motion.div>

        {/* live counters */}
        <div className="mx-auto mt-20 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border/60 md:grid-cols-4">
          {[
            { label: "Schemes indexed", value: 487, suffix: "+" },
            { label: "Languages", value: 22 },
            { label: "₹ Unlocked (demo)", value: 23, prefix: "₹", suffix: "Cr" },
            { label: "Citizens served", value: 12847 },
          ].map((s) => (
            <div key={s.label} className="bg-card/80 px-6 py-7 backdrop-blur">
              <div className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                <CountUp to={s.value} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-widest text-primary">How it works</div>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Four steps. One conversation.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {[
            { icon: ScanLine, title: "Discover", desc: "Tell us about yourself. The agent finds every scheme you qualify for via myScheme.", num: "01" },
            { icon: FileText, title: "Read", desc: "Snap your Aadhaar, ration, income certificate. Spatial AI extracts what matters.", num: "02" },
            { icon: Sparkles, title: "Fill", desc: "Official PDFs are auto-filled. You confirm every field before anything is submitted.", num: "03" },
            { icon: Scale, title: "Escalate", desc: "When systems stall, file a CPGRAMS grievance with one sentence in your language.", num: "04" },
          ].map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6 backdrop-blur transition hover:border-primary/40"
            >
              <div className="absolute right-4 top-4 font-display text-5xl font-bold text-muted-foreground/15">{step.num}</div>
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                <step.icon className="h-5 w-5" />
              </div>
              <div className="mt-5 font-display text-xl font-semibold">{step.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* feature highlights */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            tone="saffron"
            icon={MonitorSpeaker}
            title="Voice-Only Kiosk"
            desc="Full-screen, zero-text mode for panchayats and CSCs. The mic is the only UI."
            link="/kiosk"
            cta="Try kiosk"
          />
          <FeatureCard
            tone="green"
            icon={Map}
            title="Live Impact Map"
            desc="Animated India map: ₹ unlocked, top schemes, grievances filed by state — updated in real time."
            link="/impact"
            cta="See impact"
          />
          <FeatureCard
            tone="saffron"
            icon={Users}
            title="Family Profiles"
            desc="One account handles schemes for your parents, spouse, children. Switch personas in one tap."
            link="/auth"
            cta="Sign up free"
          />
        </div>
      </section>

      {/* trust strip */}
      <section className="relative z-10 border-y border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-[var(--india-green)]" />
            Aadhaar UIDs masked by default · Audio &amp; images never stored · RLS-enforced data
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs uppercase tracking-widest text-muted-foreground/70">
            <span>Bhashini</span><span>·</span><span>myScheme</span><span>·</span><span>CPGRAMS</span><span>·</span><span>DigiLocker</span><span>·</span><span>India Stack</span>
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-7xl px-6 py-10 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Bharat-Awaaz · Built for Digital India · Open prototype.
      </footer>
    </main>
  );
}

function FeatureCard({ tone, icon: Icon, title, desc, link, cta }: { tone: "saffron" | "green"; icon: typeof Mic; title: string; desc: string; link: string; cta: string }) {
  const glow = tone === "saffron" ? "hover:glow-saffron" : "hover:glow-green";
  const iconBg = tone === "saffron" ? "bg-primary/15 text-primary" : "bg-[var(--india-green)]/15 text-[var(--india-green)]";
  return (
    <Link to={link} className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card/60 p-7 backdrop-blur transition ${glow}`}>
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${iconBg}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="font-display text-2xl font-semibold tracking-tight">{title}</div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        {cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
