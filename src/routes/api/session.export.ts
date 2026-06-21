// Bundle the whole session — conversation, extracted docs, validation audit,
// grievance drafts, filled-PDF references — as a single downloadable JSON.

import { createFileRoute } from "@tanstack/react-router";
import { getOrCreateSession } from "@/lib/agent/state";
import { maskAadhaar } from "@/lib/privacy/aadhaar-mask";

function redactDocFields(fields: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = /uid|aadhaar/i.test(k) ? maskAadhaar(v) : v;
  }
  return out;
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function auditCsv(s: ReturnType<typeof getOrCreateSession>) {
  const rows = [
    ["validationId", "templateId", "confirmedAt", "field", "from", "to"],
  ];
  for (const v of s.validationHistory) {
    const ts = v.confirmedAt ? new Date(v.confirmedAt).toISOString() : "";
    if (!v.changes?.length) {
      rows.push([v.id, v.templateId, ts, "(no manual edits)", "", ""]);
      continue;
    }
    for (const c of v.changes) {
      rows.push([
        v.id,
        v.templateId,
        ts,
        c.field,
        /uid|aadhaar/i.test(c.field) ? "***masked***" : c.from,
        /uid|aadhaar/i.test(c.field) ? "***masked***" : c.to,
      ]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export const Route = createFileRoute("/api/session/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        const mode = (url.searchParams.get("mode") ?? "full") as
          | "full"
          | "docs"
          | "audit"
          | "audit-csv";
        const validationId = url.searchParams.get("validationId");
        if (!sessionId) return new Response("sessionId required", { status: 400 });
        const s = getOrCreateSession(sessionId);

        if (mode === "docs") {
          const payload = {
            schema: "bharat-awaaz.docs.v1",
            exportedAt: new Date().toISOString(),
            sessionId,
            documents: s.documents.map((d) => ({
              id: d.id,
              kind: d.kind,
              extractedAt: d.extractedAt,
              fields: redactDocFields(d.fields),
            })),
            demographics: s.demographics,
          };
          return new Response(JSON.stringify(payload, null, 2), {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="bharat-awaaz-docs-${sessionId}.json"`,
            },
          });
        }

        if (mode === "audit-csv") {
          const csv = auditCsv(s);
          return new Response(csv, {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="bharat-awaaz-audit-${sessionId}.csv"`,
            },
          });
        }

        if (mode === "audit") {
          const history = validationId
            ? s.validationHistory.filter((v) => v.id === validationId)
            : s.validationHistory;
          const payload = {
            schema: "bharat-awaaz.audit.v1",
            exportedAt: new Date().toISOString(),
            sessionId,
            records: history.map((v) => ({
              ...v,
              proposed: v.proposed.map((p) => ({
                ...p,
                value: /uid|aadhaar/i.test(p.key) ? maskAadhaar(p.value) : p.value,
              })),
              final: Object.fromEntries(
                Object.entries(v.final).map(([k, val]) => [
                  k,
                  /uid|aadhaar/i.test(k) ? maskAadhaar(val) : val,
                ]),
              ),
              changes: v.changes.map((c) => ({
                ...c,
                from: /uid|aadhaar/i.test(c.field) ? "***masked***" : c.from,
                to: /uid|aadhaar/i.test(c.field) ? "***masked***" : c.to,
              })),
            })),
          };
          const fname = validationId
            ? `bharat-awaaz-audit-${validationId}.json`
            : `bharat-awaaz-audit-${sessionId}.json`;
          return new Response(JSON.stringify(payload, null, 2), {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="${fname}"`,
            },
          });
        }

        const payload = {
          schema: "bharat-awaaz.session.v1",
          exportedAt: new Date().toISOString(),
          sessionId: s.sessionId,
          language: s.language,
          demographics: s.demographics,
          documents: s.documents.map((d) => ({
            id: d.id,
            kind: d.kind,
            extractedAt: d.extractedAt,
            fields: redactDocFields(d.fields),
          })),
          eligibleSchemes: s.eligibleSchemes,
          selectedTemplateId: s.selectedTemplateId,
          customTemplates: s.customTemplates,
          validationHistory: s.validationHistory.map((v) => ({
            ...v,
            final: Object.fromEntries(
              Object.entries(v.final).map(([k, val]) => [
                k,
                /uid|aadhaar/i.test(k) ? maskAadhaar(val) : val,
              ]),
            ),
            proposed: v.proposed.map((p) => ({
              ...p,
              value: /uid|aadhaar/i.test(p.key) ? maskAadhaar(p.value) : p.value,
            })),
          })),
          grievanceDrafts: s.grievanceDrafts,
          grievancesFiled: s.grievances,
          filledPdfs: s.filledPdfs.map((p) => ({ templateId: p.templateId, at: p.at })),
          conversation: s.conversation,
        };

        return new Response(JSON.stringify(payload, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="bharat-awaaz-session-${sessionId}.json"`,
          },
        });
      },
    },
  },
});
