// Thin wrapper around the browser's Web Speech API for *interim* partial
// transcripts shown while the user is talking. Final/accurate transcription
// still comes from the server (Bhashini / Lovable AI) once the WAV is sent.
// Available in Chrome/Edge/Safari (with prefix). Returns null where unsupported.

type SR = typeof window extends { SpeechRecognition: infer T } ? T : never;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type LiveTranscriber = {
  stop: () => void;
  supported: true;
};

// Map our app language codes to BCP-47 the browser STT wants.
function bcp47(lang: string): string {
  const m: Record<string, string> = {
    hi: "hi-IN", en: "en-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN",
    mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
    or: "or-IN", as: "as-IN", ur: "ur-IN",
  };
  if (m[lang]) return m[lang];
  if (/^[a-z]{2}$/.test(lang)) return `${lang}-IN`;
  return lang;
}

export function startLiveTranscription(
  lang: string,
  onPartial: (text: string, isFinal: boolean) => void,
  onError?: (msg: string) => void,
): LiveTranscriber | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;

  let rec: SpeechRecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }
  rec.lang = bcp47(lang);
  rec.continuous = true;
  rec.interimResults = true;

  let stopped = false;

  rec.onresult = (ev) => {
    let interim = "";
    let final = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const txt = r[0]?.transcript ?? "";
      if (r.isFinal) final += txt;
      else interim += txt;
    }
    if (final) onPartial(final, true);
    else if (interim) onPartial(interim, false);
  };

  rec.onerror = (ev) => {
    // Common: "no-speech", "aborted", "not-allowed". Only surface real failures.
    if (ev.error && ev.error !== "no-speech" && ev.error !== "aborted") {
      onError?.(ev.error);
    }
  };

  rec.onend = () => {
    // Auto-restart while user is still recording (Web Speech ends after silence)
    if (!stopped) {
      try { rec.start(); } catch { /* already started */ }
    }
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return {
    supported: true,
    stop: () => {
      stopped = true;
      try { rec.stop(); } catch { /* ignore */ }
    },
  };
}

export function liveTranscriptionSupported(): boolean {
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}
