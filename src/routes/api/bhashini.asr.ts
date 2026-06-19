import { createFileRoute } from "@tanstack/react-router";
import { runAsrTranslate, bhashiniAvailable } from "@/lib/bhashini/pipeline.server";

export const Route = createFileRoute("/api/bhashini/asr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { audioBase64, lang } = (await request.json()) as { audioBase64: string; lang: string };
        if (!audioBase64) return new Response("audioBase64 required", { status: 400 });
        if (!bhashiniAvailable()) {
          return Response.json({
            ok: false,
            transcript: "",
            translatedEnglish: "",
            error: "Bhashini not configured. Add BHASHINI_USER_ID and BHASHINI_API_KEY.",
          });
        }
        try {
          const result = await runAsrTranslate(audioBase64, lang || "hi");
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json(
            { ok: false, transcript: "", translatedEnglish: "", error: e instanceof Error ? e.message : String(e) },
            { status: 502 },
          );
        }
      },
    },
  },
});
