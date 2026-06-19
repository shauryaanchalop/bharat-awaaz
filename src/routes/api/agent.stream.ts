// SSE stream of agent events for a session.
import { createFileRoute } from "@tanstack/react-router";
import { subscribe, type AgentEvent } from "@/lib/agent/state";

export const Route = createFileRoute("/api/agent/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) return new Response("sessionId required", { status: 400 });

        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            const send = (e: AgentEvent) => {
              try {
                controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
              } catch {
                // closed
              }
            };
            send({ type: "thinking" });
            const unsub = subscribe(sessionId, send);
            const ping = setInterval(() => {
              try {
                controller.enqueue(enc.encode(`: ping\n\n`));
              } catch {
                clearInterval(ping);
              }
            }, 25000);
            request.signal.addEventListener("abort", () => {
              clearInterval(ping);
              unsub();
              try {
                controller.close();
              } catch {
                /* */
              }
            });
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
