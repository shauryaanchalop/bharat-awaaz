import { createFileRoute } from "@tanstack/react-router";
import { runAgentTurn } from "@/lib/agent/graph.server";
import { getOrCreateSession } from "@/lib/agent/state";

export const Route = createFileRoute("/api/agent/turn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { sessionId, text, language } = (await request.json()) as {
          sessionId: string;
          text: string;
          language?: string;
        };
        if (!sessionId || !text) return new Response("sessionId & text required", { status: 400 });
        const s = getOrCreateSession(sessionId, language ?? "en");
        if (language) s.language = language;
        // Fire-and-forget; events flow over /api/agent/stream
        runAgentTurn(sessionId, text).catch((e) => console.error("turn failed", e));
        return Response.json({ ok: true });
      },
    },
  },
});
