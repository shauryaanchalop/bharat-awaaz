import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES, getTemplate, autoMapTemplate } from "@/lib/pdf/templates";
import { getOrCreateSession, updateSession } from "@/lib/agent/state";

export const Route = createFileRoute("/api/templates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        const templateId = url.searchParams.get("templateId");

        if (templateId && sessionId) {
          const tpl = getTemplate(templateId);
          if (!tpl) return new Response("Template not found", { status: 404 });
          const s = getOrCreateSession(sessionId);
          const mapped = autoMapTemplate(tpl, s.documents, s.demographics);
          return Response.json({ template: tpl, mapped });
        }
        return Response.json({
          templates: TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            ministry: t.ministry,
            scheme: t.scheme,
            fieldCount: t.fields.length,
          })),
        });
      },
      POST: async ({ request }) => {
        // Persist the user's selected template on the session
        const { sessionId, templateId } = (await request.json()) as {
          sessionId: string;
          templateId: string;
        };
        if (!sessionId || !templateId)
          return new Response("sessionId + templateId required", { status: 400 });
        updateSession(sessionId, (s) => {
          s.selectedTemplateId = templateId;
        });
        return Response.json({ ok: true });
      },
    },
  },
});
