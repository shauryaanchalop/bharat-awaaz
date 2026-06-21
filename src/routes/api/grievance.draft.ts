// Grievance draft workflow: build payload, store draft, submit on demand
// (or retry pending drafts once CPGRAMS_API_KEY arrives).

import { createFileRoute } from "@tanstack/react-router";
import { fileGrievance, isOutOfPurview } from "@/lib/cpgrams/client.server";
import { getOrCreateSession, updateSession, emit, type GrievanceDraft } from "@/lib/agent/state";

function newDraftId() {
  return "gd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const Route = createFileRoute("/api/grievance/draft")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) return new Response("sessionId required", { status: 400 });
        const s = getOrCreateSession(sessionId);
        return Response.json({ drafts: s.grievanceDrafts });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          action: "create" | "update" | "submit" | "retry-all";
          sessionId: string;
          draftId?: string;
          payload?: GrievanceDraft["payload"];
        };
        const { action, sessionId } = body;
        if (!sessionId) return new Response("sessionId required", { status: 400 });
        const s = getOrCreateSession(sessionId);

        if (action === "create") {
          if (!body.payload) return new Response("payload required", { status: 400 });
          const block = isOutOfPurview(body.payload.description);
          if (block) {
            return Response.json(
              { ok: false, error: `Out of CPGRAMS purview (${block}).` },
              { status: 400 },
            );
          }
          const draft: GrievanceDraft = {
            draftId: newDraftId(),
            payload: body.payload,
            status: "ready",
            createdAt: Date.now(),
          };
          updateSession(sessionId, (st) => st.grievanceDrafts.push(draft));
          emit(sessionId, { type: "grievance_draft", draft });
          return Response.json({ ok: true, draft });
        }

        if (action === "update") {
          if (!body.draftId || !body.payload) return new Response("draftId+payload required", { status: 400 });
          const idx = s.grievanceDrafts.findIndex((d) => d.draftId === body.draftId);
          if (idx === -1) return new Response("not found", { status: 404 });
          updateSession(sessionId, (st) => {
            st.grievanceDrafts[idx].payload = body.payload!;
            st.grievanceDrafts[idx].status = "ready";
          });
          return Response.json({ ok: true, draft: s.grievanceDrafts[idx] });
        }

        if (action === "submit") {
          const draft = s.grievanceDrafts.find((d) => d.draftId === body.draftId);
          if (!draft) return new Response("not found", { status: 404 });
          try {
            const result = await fileGrievance(draft.payload);
            updateSession(sessionId, (st) => {
              const d = st.grievanceDrafts.find((x) => x.draftId === draft.draftId);
              if (d) {
                d.status = "submitted";
                d.regId = result.regId;
                d.submittedAt = Date.now();
              }
              st.grievances.push({ regId: result.regId, subject: draft.payload.subject, filedAt: Date.now() });
            });
            emit(sessionId, { type: "grievance_filed", regId: result.regId, draftId: draft.draftId });
            return Response.json({ ok: true, result });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            updateSession(sessionId, (st) => {
              const d = st.grievanceDrafts.find((x) => x.draftId === draft.draftId);
              if (d) {
                d.status = "failed";
                d.lastError = msg;
              }
            });
            return Response.json({ ok: false, error: msg }, { status: 502 });
          }
        }

        if (action === "retry-all") {
          // Auto-resend every draft + previously-failed grievance
          const results: { draftId: string; ok: boolean; regId?: string; error?: string }[] = [];
          for (const draft of s.grievanceDrafts) {
            if (draft.status === "submitted") continue;
            try {
              const result = await fileGrievance(draft.payload);
              updateSession(sessionId, (st) => {
                const d = st.grievanceDrafts.find((x) => x.draftId === draft.draftId);
                if (d) {
                  d.status = "submitted";
                  d.regId = result.regId;
                  d.submittedAt = Date.now();
                }
                st.grievances.push({ regId: result.regId, subject: draft.payload.subject, filedAt: Date.now() });
              });
              emit(sessionId, { type: "grievance_filed", regId: result.regId, draftId: draft.draftId });
              results.push({ draftId: draft.draftId, ok: true, regId: result.regId });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              updateSession(sessionId, (st) => {
                const d = st.grievanceDrafts.find((x) => x.draftId === draft.draftId);
                if (d) {
                  d.status = "failed";
                  d.lastError = msg;
                }
              });
              results.push({ draftId: draft.draftId, ok: false, error: msg });
            }
          }
          return Response.json({ ok: true, results });
        }

        return new Response("unknown action", { status: 400 });
      },
    },
  },
});
