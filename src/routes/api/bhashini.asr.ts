import { createFileRoute } from "@tanstack/react-router";
import { runAsrTranslate, bhashiniAvailable } from "@/lib/bhashini/pipeline.server";

// Fallback: Lovable AI STT (OpenAI gpt-4o-mini-transcribe via Gateway).
// Used when Bhashini is not configured or fails (auth pending, format mismatch, etc.).
async function lovableSttFallback(
  audioBase64: string,
  lang: string,
): Promise<{ transcript: string; translatedEnglish: string } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const bin = atob(audioBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", new Blob([bytes], { type: "audio/wav" }), "recording.wav");
    // Let model auto-detect when language code isn't plain ISO-639-1.
    const iso = lang?.split("-")[0];
    if (iso && /^[a-z]{2}$/.test(iso)) form.append("language", iso);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim() ?? "";
    if (!text) return null;
    return { transcript: text, translatedEnglish: text };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/bhashini/asr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { audioBase64, lang, prefer } = (await request.json()) as {
          audioBase64: string;
          lang: string;
          prefer?: "auto" | "bhashini" | "lovable-ai";
        };
        if (!audioBase64) return new Response("audioBase64 required", { status: 400 });
        const mode = prefer ?? "auto";

        // Try Bhashini first unless caller asked to force the Lovable fallback.
        if (mode !== "lovable-ai" && bhashiniAvailable()) {
          try {
            const result = await runAsrTranslate(audioBase64, lang || "hi");
            if (result && (result.transcript || result.translatedEnglish)) {
              return Response.json({ ok: true, source: "bhashini", ...result });
            }
          } catch (e) {
            console.warn("[asr] bhashini failed", e);
            if (mode === "bhashini") {
              return Response.json(
                {
                  ok: false,
                  transcript: "",
                  translatedEnglish: "",
                  source: "bhashini",
                  error: "Bhashini transcription failed. Try the Lovable AI fallback.",
                },
                { status: 200 },
              );
            }
          }
        } else if (mode === "bhashini" && !bhashiniAvailable()) {
          return Response.json(
            {
              ok: false,
              transcript: "",
              translatedEnglish: "",
              source: "bhashini",
              error: "Bhashini is not configured. Use the Lovable AI fallback instead.",
            },
            { status: 200 },
          );
        }

        // Lovable AI fallback (or forced lovable-ai mode).
        if (mode !== "bhashini") {
          const fb = await lovableSttFallback(audioBase64, lang || "en");
          if (fb) return Response.json({ ok: true, source: "lovable-ai", ...fb });
        }

        return Response.json(
          {
            ok: false,
            transcript: "",
            translatedEnglish: "",
            error: bhashiniAvailable()
              ? "Speech recognition failed. Please try again or type your message."
              : "Speech recognition unavailable. Type your message instead.",
          },
          { status: 200 },
        );
      },
    },
  },
});
