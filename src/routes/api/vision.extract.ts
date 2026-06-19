import { createFileRoute } from "@tanstack/react-router";
import { extractDocument, type DocKind } from "@/lib/vision/extract.server";
import { updateSession, type ExtractedDoc, emit } from "@/lib/agent/state";
import { maskAadhaar } from "@/lib/privacy/aadhaar-mask";

export const Route = createFileRoute("/api/vision/extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { sessionId, kind, imageBase64, mimeType } = (await request.json()) as {
          sessionId: string;
          kind: DocKind;
          imageBase64: string;
          mimeType?: string;
        };
        if (!sessionId || !imageBase64) return new Response("sessionId & imageBase64 required", { status: 400 });

        try {
          const fields = await extractDocument(kind, imageBase64, mimeType ?? "image/jpeg");
          // Mask UID before returning to client
          const safe: Record<string, string> = {};
          for (const [k, v] of Object.entries(fields)) {
            safe[k] = /uid|aadhaar/i.test(k) ? maskAadhaar(String(v)) : String(v ?? "");
          }
          const doc: ExtractedDoc = {
            id: `d_${Date.now()}`,
            kind,
            fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v ?? "")])),
            extractedAt: Date.now(),
          };
          updateSession(sessionId, (s) => {
            s.documents.push(doc);
            // Hydrate demographics from the doc
            if (kind === "aadhaar") {
              const f = doc.fields;
              if (f.applicant_name && !s.demographics.name) s.demographics.name = f.applicant_name;
              if (f.gender) s.demographics.gender = f.gender as "male" | "female" | "other";
              if (f.dob && !s.demographics.age) {
                const yr = parseInt(f.dob.match(/\d{4}/)?.[0] ?? "0", 10);
                if (yr > 1900) s.demographics.age = new Date().getFullYear() - yr;
              }
            }
          });
          emit(sessionId, { type: "document", doc: { ...doc, fields: safe } });
          return Response.json({ ok: true, fields: safe });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
        }
      },
    },
  },
});
