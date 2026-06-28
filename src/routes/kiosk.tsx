import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, X, Volume2 } from "lucide-react";
import { LANGUAGES, type LangCode } from "@/lib/i18n/languages";

export const Route = createFileRoute("/kiosk")({
  head: () => ({
    meta: [
      { title: "Kiosk Mode — Bharat-Awaaz" },
      { name: "description", content: "Full-screen voice-only mode designed for Common Service Centres and panchayat kiosks." },
      { property: "og:title", content: "Bharat-Awaaz Kiosk Mode" },
      { property: "og:url", content: "https://bharat-awaaz.lovable.app/kiosk" },
    ],
    links: [{ rel: "canonical", href: "https://bharat-awaaz.lovable.app/kiosk" }],
  }),
  component: Kiosk,
});

type Turn = { who: "user" | "agent"; text: string };

function Kiosk() {
  const [lang, setLang] = useState<LangCode>("hi");
  const [recording, setRecording] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(true);
  const exitTimer = useRef<number | null>(null);

  const langName = LANGUAGES.find((l) => l.code === lang)?.native ?? lang;

  function startExit() {
    exitTimer.current = window.setTimeout(() => (window.location.href = "/"), 1500);
  }
  function cancelExit() {
    if (exitTimer.current) { clearTimeout(exitTimer.current); exitTimer.current = null; }
  }

  async function speak(text: string) {
    try {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      const langMap: Record<string, string> = { hi: "hi-IN", en: "en-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", or: "or-IN", ur: "ur-IN" };
      u.lang = langMap[lang] ?? "en-IN";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  async function handleTurn(userText: string) {
    setTurns((t) => [...t, { who: "user", text: userText }]);
    setThinking(true);
    // Demo agent: simulate via simple kiosk reply that hints at the real /app
    await new Promise((r) => setTimeout(r, 900));
    const replies: Record<string, string> = {
      hi: "मैं आपकी मदद के लिए तैयार हूँ। कृपया मुझे अपनी आयु, राज्य और परिवार के बारे में बताइए। फिर मैं आपके लिए उपयुक्त सरकारी योजनाएँ खोजूँगा।",
      en: "I'm ready to help. Please tell me your age, state, and a little about your family. I'll find the welfare schemes you qualify for.",
      bn: "আমি সাহায্য করতে প্রস্তুত। দয়া করে আপনার বয়স, রাজ্য এবং পরিবার সম্পর্কে বলুন।",
      ta: "உங்களுக்கு உதவ நான் தயாராக இருக்கிறேன். உங்கள் வயது, மாநிலம் மற்றும் குடும்பம் பற்றி சொல்லுங்கள்.",
    };
    const reply = replies[lang] ?? replies.en;
    setTurns((t) => [...t, { who: "agent", text: reply }]);
    setThinking(false);
    speak(reply);
  }

  function toggleRecord() {
    if (recording) {
      setRecording(false);
      // mock transcript — in production this goes to Bhashini ASR
      const mocks: Record<string, string> = {
        hi: "मेरी उम्र 62 साल है, मैं उत्तर प्रदेश से हूँ। क्या मेरे लिए कोई पेंशन योजना है?",
        en: "I am 62 years old from Uttar Pradesh. Is there a pension scheme for me?",
        bn: "আমার বয়স ৬২। উত্তরপ্রদেশে থাকি। আমার জন্য কোনো পেনশন আছে?",
        ta: "எனக்கு வயது 62. உத்தரப் பிரதேசத்தில் இருக்கிறேன். எனக்கு ஓய்வூதியம் உண்டா?",
      };
      handleTurn(mocks[lang] ?? mocks.en);
    } else {
      setRecording(true);
      setShowLangPicker(false);
    }
  }

  useEffect(() => () => cancelExit(), []);

  return (
    <main className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* exit (long-press) */}
      <button
        onMouseDown={startExit}
        onMouseUp={cancelExit}
        onMouseLeave={cancelExit}
        onTouchStart={startExit}
        onTouchEnd={cancelExit}
        className="absolute right-6 top-6 z-10 grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-white/60 backdrop-blur transition hover:bg-white/10"
        aria-label="Long press to exit"
      >
        <X className="h-5 w-5" />
      </button>
      <Link to="/" className="absolute left-6 top-6 z-10 text-xs uppercase tracking-widest text-white/40">Bharat-Awaaz · Kiosk</Link>

      {/* language picker overlay */}
      <AnimatePresence>
        {showLangPicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center bg-black/80 backdrop-blur-xl">
            <div className="max-w-2xl px-6 text-center">
              <div className="mb-3 text-sm uppercase tracking-widest text-white/40">Tap your language · अपनी भाषा चुनें</div>
              <h1 className="font-display text-5xl font-bold tracking-tight">Choose language</h1>
              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {LANGUAGES.slice(0, 12).map((l) => (
                  <button key={l.code} onClick={() => { setLang(l.code); setShowLangPicker(false); }} className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-left transition hover:border-[var(--saffron)] hover:bg-white/10">
                    <div className="font-display text-2xl font-semibold">{l.native}</div>
                    <div className="mt-0.5 text-xs uppercase tracking-widest text-white/50">{l.english}</div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* main stage */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        {/* status caption */}
        <div className="mb-12 text-center">
          <div className="text-sm uppercase tracking-[0.3em] text-white/40">{langName}</div>
          <div className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            {thinking ? "Thinking…" : recording ? "Listening…" : "Tap to speak"}
          </div>
        </div>

        {/* giant mic */}
        <motion.button
          onClick={toggleRecord}
          whileTap={{ scale: 0.92 }}
          className={`relative grid h-64 w-64 place-items-center rounded-full transition ${
            recording
              ? "bg-gradient-to-br from-red-500 to-red-700 pulse-ring"
              : "bg-gradient-to-br from-[var(--saffron)] to-orange-700 hover:scale-105"
          }`}
          style={{ boxShadow: recording ? "0 0 120px oklch(0.62 0.24 25 / 0.6)" : "0 0 120px oklch(0.72 0.19 45 / 0.4)" }}
          aria-label={recording ? "Stop recording" : "Start recording"}
        >
          <Mic className="h-28 w-28 text-black" strokeWidth={2} />
        </motion.button>

        {/* last turn captions */}
        <div className="mt-12 min-h-[120px] w-full max-w-3xl space-y-3 text-center">
          {turns.slice(-2).map((turn, i) => (
            <motion.div key={turns.length - 2 + i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className={`text-xs uppercase tracking-widest ${turn.who === "user" ? "text-white/40" : "text-[var(--saffron)]"}`}>
                {turn.who === "user" ? "You" : "Agent"}
              </div>
              <div className={`mt-1 font-display text-2xl ${turn.who === "user" ? "text-white/80" : "text-white"}`}>{turn.text}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* bottom strip */}
      <div className="border-t border-white/10 px-8 py-4 text-center text-xs uppercase tracking-widest text-white/30">
        <Volume2 className="mr-2 inline h-3 w-3" />
        Long-press × to exit · Powered by Bhashini ASR · TTS
      </div>
    </main>
  );
}
