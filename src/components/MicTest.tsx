import { useCallback, useEffect, useRef, useState } from "react";

type Stage = "idle" | "recording" | "transcribing" | "result" | "error";

export function MicTestDialog({
  open,
  onClose,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  lang: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [level, setLevel] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [transcript, setTranscript] = useState("");
  const [source, setSource] = useState<string>("");
  const [errMsg, setErrMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const recRef = useRef<{ stop: () => Promise<Blob>; cancel: () => void } | null>(null);
  const timerRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStage("idle");
    setLevel(0);
    setLevels([]);
    setTranscript("");
    setSource("");
    setErrMsg("");
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (!open) {
      recRef.current?.cancel();
      recRef.current = null;
      if (timerRef.current) window.clearInterval(timerRef.current);
      reset();
    }
  }, [open, reset]);

  const runTest = useCallback(async () => {
    reset();
    setStage("recording");
    try {
      const { startWavRecording, bytesToBase64 } = await import("@/lib/audio/wav");
      const localLevels: number[] = [];
      const rec = await startWavRecording({
        maxMs: 2200,
        onLevel: (rms) => {
          setLevel(rms);
          localLevels.push(rms);
          if (localLevels.length > 60) localLevels.shift();
          setLevels([...localLevels]);
        },
        onMaxReached: () => {
          // finish naturally below
        },
      });
      recRef.current = rec;
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor(rec.elapsedMs()));
      }, 100);

      // Hard stop at 2s
      await new Promise((r) => setTimeout(r, 2000));
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const blob = await rec.stop();
      recRef.current = null;

      if (blob.size < 2048) {
        setStage("error");
        setErrMsg("Recording was empty. Check your microphone and try again.");
        return;
      }

      setStage("transcribing");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToBase64(bytes);
      const res = await fetch("/api/bhashini/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: b64, lang }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        transcript?: string;
        translatedEnglish?: string;
        source?: string;
        error?: string;
      };
      if (data.ok && (data.transcript || data.translatedEnglish)) {
        setTranscript(data.transcript || data.translatedEnglish || "");
        setSource(data.source || "unknown");
        setStage("result");
      } else {
        setStage("error");
        setErrMsg(data.error || "Transcription failed. Try again or use text input.");
        setSource(data.source || "");
      }
    } catch (err) {
      setStage("error");
      setErrMsg(
        err instanceof Error && err.message.includes("Permission")
          ? "Microphone permission denied. Allow mic access in your browser settings."
          : "Could not start the microphone. Is another app using it?",
      );
    }
  }, [lang, reset]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold">Mic test</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll record 2 seconds, show the level, and confirm transcription works
              before your real conversation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Waveform */}
        <div className="mt-5 h-24 rounded-xl border border-border bg-background p-3">
          <Waveform levels={levels} live={stage === "recording"} currentLevel={level} />
        </div>

        {/* Status row */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <StagePill stage={stage} />
            {stage === "recording" && (
              <span className="tabular-nums text-muted-foreground">
                {(elapsed / 1000).toFixed(1)}s / 2.0s
              </span>
            )}
            {source && stage !== "recording" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                via {source === "bhashini" ? "Bhashini" : source === "lovable-ai" ? "Lovable AI" : source}
              </span>
            )}
          </div>
          <span className="text-muted-foreground">Language: {lang}</span>
        </div>

        {/* Result */}
        {stage === "result" && (
          <div className="mt-4 rounded-lg border border-[var(--india-green)]/30 bg-[var(--india-green)]/10 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--india-green)]">
              ✓ Heard you
            </div>
            <div className="mt-1.5 text-base">{transcript || <em>(silence)</em>}</div>
          </div>
        )}

        {stage === "error" && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errMsg}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={runTest}
            disabled={stage === "recording" || stage === "transcribing"}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {stage === "idle"
              ? "🎙 Start mic test"
              : stage === "recording"
                ? "Recording…"
                : stage === "transcribing"
                  ? "Transcribing…"
                  : "🔁 Test again"}
          </button>
          {stage === "result" && (
            <button
              onClick={onClose}
              className="rounded-full bg-[var(--india-green)] px-5 py-2 text-sm font-medium text-white"
            >
              ✓ Looks good, continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StagePill({ stage }: { stage: Stage }) {
  const map: Record<Stage, { label: string; cls: string }> = {
    idle: { label: "Ready", cls: "bg-muted text-muted-foreground" },
    recording: { label: "● Recording", cls: "bg-destructive/15 text-destructive" },
    transcribing: { label: "⏳ Transcribing", cls: "bg-primary/15 text-primary" },
    result: { label: "✓ Done", cls: "bg-[var(--india-green)]/15 text-[var(--india-green)]" },
    error: { label: "✗ Failed", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[stage];
  return <span className={`rounded-full px-2 py-0.5 font-medium ${m.cls}`}>{m.label}</span>;
}

function Waveform({
  levels,
  live,
  currentLevel,
}: {
  levels: number[];
  live: boolean;
  currentLevel: number;
}) {
  const bars = 40;
  const display: number[] = [];
  for (let i = 0; i < bars; i++) {
    const v = levels[Math.floor((i / bars) * levels.length)] ?? 0;
    display.push(v);
  }
  return (
    <div className="flex h-full items-center gap-1">
      {display.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-all ${
            live ? "bg-primary" : "bg-muted-foreground/40"
          }`}
          style={{ height: `${Math.max(6, v * 100)}%` }}
        />
      ))}
      {live && (
        <div
          className="ml-2 h-full w-1.5 rounded-full bg-destructive"
          style={{ opacity: 0.3 + currentLevel * 1.4 }}
        />
      )}
    </div>
  );
}
