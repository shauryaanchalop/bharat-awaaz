import { createFileRoute } from "@tanstack/react-router";
import { resolveResume } from "@/lib/agent/state";

export const Route = createFileRoute("/api/agent/resume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { sessionId, validationId, payload } = (await request.json()) as {
          sessionId: string;
          validationId: string;
          payload: Record<string, unknown>;
        };
        const ok = resolveResume(sessionId, validationId, payload);
        return Response.json({ ok });
      },
    },
  },
});
