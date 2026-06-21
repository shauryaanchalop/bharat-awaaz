import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES, getTemplate, autoMapTemplate, type FormTemplate, type TemplateField } from "@/lib/pdf/templates";
import { getOrCreateSession, updateSession, type CustomTemplate } from "@/lib/agent/state";

function customToTemplate(c: CustomTemplate): FormTemplate {
  return {
    id: c.id,
    name: c.name,
    ministry: c.ministry,
    scheme: c.scheme,
    fields: c.fields as TemplateField[],
  };
}

function resolveTemplate(sessionId: string, id: string): FormTemplate | undefined {
  const s = getOrCreateSession(sessionId);
  const custom = s.customTemplates.find((c) => c.id === id);
  if (custom) return customToTemplate(custom);
  return getTemplate(id);
}

export const Route = createFileRoute("/api/templates")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        const templateId = url.searchParams.get("templateId");

        if (templateId && sessionId) {
          const tpl = resolveTemplate(sessionId, templateId);
          if (!tpl) return new Response("Template not found", { status: 404 });
          const s = getOrCreateSession(sessionId);
          const mapped = autoMapTemplate(tpl, s.documents, s.demographics);
          return Response.json({ template: tpl, mapped });
        }

        const built = TEMPLATES.map((t) => ({
          id: t.id,
          name: t.name,
          ministry: t.ministry,
          scheme: t.scheme,
          fieldCount: t.fields.length,
          custom: false as const,
        }));
        if (sessionId) {
          const s = getOrCreateSession(sessionId);
          const custom = s.customTemplates.map((t) => ({
            id: t.id,
            name: t.name,
            ministry: t.ministry,
            scheme: t.scheme,
            fieldCount: t.fields.length,
            custom: true as const,
          }));
          return Response.json({ templates: [...built, ...custom] });
        }
        return Response.json({ templates: built });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as
          | { action?: "select"; sessionId: string; templateId: string }
          | { action: "register"; sessionId: string; template: CustomTemplate }
          | { action: "remove"; sessionId: string; templateId: string };

        const { sessionId } = body as { sessionId: string };
        if (!sessionId) return new Response("sessionId required", { status: 400 });

        if ((body as { action?: string }).action === "register") {
          const t = (body as { template: CustomTemplate }).template;
          if (!t?.id || !/^[a-z0-9-]{2,32}$/.test(t.id))
            return Response.json({ ok: false, error: "id must be lowercase a-z0-9- (2..32 chars)" }, { status: 400 });
          if (!t.name?.trim() || !Array.isArray(t.fields) || t.fields.length === 0)
            return Response.json({ ok: false, error: "name and at least one field required" }, { status: 400 });
          for (const f of t.fields) {
            if (!f.key || !/^[a-z][a-z0-9_]{0,40}$/.test(f.key))
              return Response.json({ ok: false, error: `bad field key: ${f.key}` }, { status: 400 });
            if (!f.label?.trim()) return Response.json({ ok: false, error: `field ${f.key} needs a label` }, { status: 400 });
          }
          const exists = TEMPLATES.some((x) => x.id === t.id);
          if (exists) return Response.json({ ok: false, error: "id collides with built-in template" }, { status: 400 });
          updateSession(sessionId, (s) => {
            s.customTemplates = s.customTemplates.filter((x) => x.id !== t.id);
            s.customTemplates.push({ ...t, createdAt: Date.now() });
          });
          return Response.json({ ok: true });
        }

        if ((body as { action?: string }).action === "remove") {
          const id = (body as { templateId: string }).templateId;
          updateSession(sessionId, (s) => {
            s.customTemplates = s.customTemplates.filter((x) => x.id !== id);
          });
          return Response.json({ ok: true });
        }

        // default: select
        const templateId = (body as { templateId: string }).templateId;
        if (!templateId) return new Response("templateId required", { status: 400 });
        updateSession(sessionId, (s) => {
          s.selectedTemplateId = templateId;
        });
        return Response.json({ ok: true });
      },
    },
  },
});
