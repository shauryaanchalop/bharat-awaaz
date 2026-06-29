import { createFileRoute } from "@tanstack/react-router";
import { SAMPLE_FIXTURES, getFixture, cardSvgFor } from "@/lib/samples/data";
import { getTemplate, TEMPLATES } from "@/lib/pdf/templates";
import { generateDemoTemplate } from "@/lib/pdf/fill.server";
import { updateSession, emit, type ExtractedDoc } from "@/lib/agent/state";
import { maskAadhaar } from "@/lib/privacy/aadhaar-mask";

export const Route = createFileRoute("/api/samples")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("mode") ?? "list";

        if (mode === "list") {
          return Response.json({
            fixtures: SAMPLE_FIXTURES.map((f) => ({ id: f.id, label: f.label, blurb: f.blurb })),
            forms: TEMPLATES.map((t) => ({ id: t.id, name: t.name, ministry: t.ministry })),
          });
        }

        if (mode === "form") {
          const templateId = url.searchParams.get("templateId") ?? "";
          const tpl = getTemplate(templateId);
          if (!tpl) return new Response("Unknown templateId", { status: 404 });
          const bytes = await generateDemoTemplate(tpl.name, tpl.fields.map((f) => f.key));
          return new Response(bytes as unknown as BodyInit, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="sample-${tpl.id}.pdf"`,
              "Cache-Control": "public, max-age=300",
            },
          });
        }

        if (mode === "card") {
          const kind = (url.searchParams.get("kind") ?? "aadhaar") as "aadhaar" | "ration" | "income";
          const fixtureId = url.searchParams.get("fixtureId") ?? SAMPLE_FIXTURES[0].id;
          const fix = getFixture(fixtureId);
          if (!fix) return new Response("Unknown fixtureId", { status: 404 });
          const svg = cardSvgFor(kind, fix);
          return new Response(svg, {
            headers: {
              "Content-Type": "image/svg+xml",
              "Content-Disposition": `inline; filename="sample-${kind}-${fix.id}.svg"`,
              "Cache-Control": "public, max-age=300",
            },
          });
        }

        return new Response("Unknown mode", { status: 400 });
      },

      POST: async ({ request }) => {
        const body = (await request.json()) as {
          action: "seed";
          sessionId: string;
          fixtureId?: string;
          replace?: boolean;
        };
        if (body.action !== "seed") return new Response("Unknown action", { status: 400 });
        if (!body.sessionId) return new Response("sessionId required", { status: 400 });
        const fix = getFixture(body.fixtureId ?? SAMPLE_FIXTURES[0].id);
        if (!fix) return new Response("Unknown fixtureId", { status: 404 });

        const seeded: ExtractedDoc[] = fix.docs.map((d, i) => ({
          id: `seed_${Date.now()}_${i}`,
          kind: d.kind,
          fields: { ...d.fields },
          extractedAt: Date.now(),
        }));

        updateSession(body.sessionId, (s) => {
          if (body.replace) {
            s.documents = [];
            s.demographics = {};
          }
          s.documents.push(...seeded);
          s.demographics = { ...s.demographics, ...fix.demographics };
        });

        // Emit to live stream so the UI updates immediately. Mask UID before broadcast.
        for (const d of seeded) {
          const safe: Record<string, string> = {};
          for (const [k, v] of Object.entries(d.fields)) {
            safe[k] = /uid|aadhaar/i.test(k) ? maskAadhaar(String(v)) : String(v ?? "");
          }
          emit(body.sessionId, { type: "document", doc: { ...d, fields: safe } });
        }

        return Response.json({
          ok: true,
          seeded: seeded.length,
          fixture: { id: fix.id, label: fix.label },
        });
      },
    },
  },
});
