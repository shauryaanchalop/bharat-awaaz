// Grievance draft workflow with:
// - strict CPGRAMS schema validation (action:"validate")
// - per-field diff (payload vs normalisedPayload) surfaced via GET
// - manual queue controls: submit / cancel / prioritize / retry-all
// - automatic resend queuing (status flips, key-arrival, timeouts), priority-sorted

import { createFileRoute } from "@tanstack/react-router";
import {
  fileGrievance,
  isOutOfPurview,
  cpgramsConfigured,
  CpgramsKeyMissingError,
  CpgramsTimeoutError,
  CpgramsValidationError,
} from "@/lib/cpgrams/client.server";
import { validateCpgramsPayload } from "@/lib/cpgrams/schema";
import { getOrCreateSession, updateSession, emit, type GrievanceDraft } from "@/lib/agent/state";

function newDraftId() {
  return "gd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

type SubmitOutcome = { ok: true; regId: string } | { ok: false; error: string; status: GrievanceDraft["status"] };

async function attemptSubmit(sessionId: string, draftId: string): Promise<SubmitOutcome> {
  const s = getOrCreateSession(sessionId);
  const draft = s.grievanceDrafts.find((d) => d.draftId === draftId);
  if (!draft) return { ok: false, error: "draft not found", status: "failed" };
  if (draft.status === "cancelled") return { ok: false, error: "draft cancelled", status: "cancelled" };

  updateSession(sessionId, (st) => {
    const d = st.grievanceDrafts.find((x) => x.draftId === draftId);
    if (d) {
      d.attempts += 1;
      d.lastAttemptAt = Date.now();
    }
  });

  try {
    const result = await fileGrievance(draft.payload);
    updateSession(sessionId, (st) => {
      const d = st.grievanceDrafts.find((x) => x.draftId === draftId);
      if (d) {
        d.status = "submitted";
        d.regId = result.regId;
        d.submittedAt = Date.now();
        d.lastError = undefined;
        d.validationIssues = undefined;
        const v = validateCpgramsPayload(d.payload);
        if (v.ok) d.normalisedPayload = v.data;
      }
      st.grievances.push({ regId: result.regId, subject: draft.payload.subject, filedAt: Date.now() });
    });
    emit(sessionId, { type: "grievance_filed", regId: result.regId, draftId });
    return { ok: true, regId: result.regId };
  } catch (e) {
    let status: GrievanceDraft["status"] = "failed";
    let msg = e instanceof Error ? e.message : String(e);
    let issues: { field: string; message: string }[] | undefined;
    if (e instanceof CpgramsKeyMissingError) status = "pending_key";
    else if (e instanceof CpgramsTimeoutError) status = "ready";
    else if (e instanceof CpgramsValidationError) {
      status = "failed";
      issues = e.issues;
      msg = "Schema validation failed: " + e.issues.map((i) => `${i.field} — ${i.message}`).join("; ");
    }
    updateSession(sessionId, (st) => {
      const d = st.grievanceDrafts.find((x) => x.draftId === draftId);
      if (d) {
        d.status = status;
        d.lastError = msg;
        d.validationIssues = issues;
      }
    });
    return { ok: false, error: msg, status };
  }
}

async function autoResendPending(sessionId: string) {
  if (!cpgramsConfigured()) return { drained: 0, attempted: 0 };
  const s = getOrCreateSession(sessionId);
  const pending = [...s.grievanceDrafts]
    .filter((d) => d.status === "pending_key" || (d.status === "ready" && d.attempts > 0))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt);
  let drained = 0;
  for (const d of pending) {
    const r = await attemptSubmit(sessionId, d.draftId);
    if (r.ok) drained += 1;
  }
  return { drained, attempted: pending.length };
}

function recomputeNormalised(d: GrievanceDraft) {
  const v = validateCpgramsPayload(d.payload);
  d.normalisedPayload = v.ok ? v.data : undefined;
  return v;
}

export const Route = createFileRoute("/api/grievance/draft")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) return new Response("sessionId required", { status: 400 });
        const auto = await autoResendPending(sessionId);
        const s = getOrCreateSession(sessionId);
        return Response.json({
          drafts: s.grievanceDrafts,
          cpgramsConfigured: cpgramsConfigured(),
          autoResend: auto,
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          action:
            | "create"
            | "update"
            | "submit"
            | "retry-all"
            | "validate"
            | "status"
            | "cancel"
            | "prioritize";
          sessionId: string;
          draftId?: string;
          payload?: GrievanceDraft["payload"];
          priority?: number;
        };
        const { action, sessionId } = body;
        if (!sessionId) return new Response("sessionId required", { status: 400 });
        const s = getOrCreateSession(sessionId);

        if (action === "status") {
          const auto = await autoResendPending(sessionId);
          return Response.json({
            cpgramsConfigured: cpgramsConfigured(),
            pending: s.grievanceDrafts.filter((d) => d.status !== "submitted" && d.status !== "cancelled").length,
            autoResend: auto,
          });
        }

        if (action === "validate") {
          if (!body.payload) return Response.json({ ok: false, error: "payload required" }, { status: 400 });
          const block = isOutOfPurview(body.payload.description);
          if (block) {
            return Response.json({
              ok: false,
              issues: [{ field: "description", message: `Out of CPGRAMS purview ("${block}").` }],
            });
          }
          const result = validateCpgramsPayload(body.payload);
          if (!result.ok) return Response.json({ ok: false, issues: result.issues });
          return Response.json({ ok: true, normalised: result.data });
        }

        if (action === "create") {
          if (!body.payload) return new Response("payload required", { status: 400 });
          const validation = validateCpgramsPayload(body.payload);
          const block = isOutOfPurview(body.payload.description);
          const draft: GrievanceDraft = {
            draftId: newDraftId(),
            payload: body.payload,
            normalisedPayload: validation.ok ? validation.data : undefined,
            status: validation.ok && !block ? "ready" : "draft",
            createdAt: Date.now(),
            attempts: 0,
            priority: 0,
            validationIssues: block
              ? [{ field: "description", message: `Out of CPGRAMS purview ("${block}").` }]
              : validation.ok
                ? undefined
                : validation.issues,
          };
          updateSession(sessionId, (st) => st.grievanceDrafts.push(draft));
          emit(sessionId, { type: "grievance_draft", draft });
          return Response.json({ ok: true, draft });
        }

        if (action === "update") {
          if (!body.draftId || !body.payload) return new Response("draftId+payload required", { status: 400 });
          const idx = s.grievanceDrafts.findIndex((d) => d.draftId === body.draftId);
          if (idx === -1) return new Response("not found", { status: 404 });
          const validation = validateCpgramsPayload(body.payload);
          const block = isOutOfPurview(body.payload.description);
          updateSession(sessionId, (st) => {
            const d = st.grievanceDrafts[idx];
            d.payload = body.payload!;
            d.normalisedPayload = validation.ok ? validation.data : undefined;
            d.status = validation.ok && !block ? "ready" : "draft";
            d.validationIssues = block
              ? [{ field: "description", message: `Out of CPGRAMS purview ("${block}").` }]
              : validation.ok
                ? undefined
                : validation.issues;
          });
          emit(sessionId, { type: "grievance_draft", draft: s.grievanceDrafts[idx] });
          return Response.json({ ok: true, draft: s.grievanceDrafts[idx] });
        }

        if (action === "cancel") {
          if (!body.draftId) return new Response("draftId required", { status: 400 });
          updateSession(sessionId, (st) => {
            const d = st.grievanceDrafts.find((x) => x.draftId === body.draftId);
            if (d && d.status !== "submitted") {
              d.status = "cancelled";
              d.lastError = undefined;
            }
          });
          const d = s.grievanceDrafts.find((x) => x.draftId === body.draftId);
          if (d) emit(sessionId, { type: "grievance_draft", draft: d });
          return Response.json({ ok: true });
        }

        if (action === "prioritize") {
          if (!body.draftId) return new Response("draftId required", { status: 400 });
          const delta = typeof body.priority === "number" ? body.priority : 1;
          updateSession(sessionId, (st) => {
            const d = st.grievanceDrafts.find((x) => x.draftId === body.draftId);
            if (d) d.priority = (d.priority ?? 0) + delta;
          });
          const d = s.grievanceDrafts.find((x) => x.draftId === body.draftId);
          if (d) {
            recomputeNormalised(d);
            emit(sessionId, { type: "grievance_draft", draft: d });
          }
          return Response.json({ ok: true, priority: d?.priority ?? 0 });
        }

        if (action === "submit") {
          if (!body.draftId) return new Response("draftId required", { status: 400 });
          const r = await attemptSubmit(sessionId, body.draftId);
          return Response.json(r);
        }

        if (action === "retry-all") {
          const auto = await autoResendPending(sessionId);
          return Response.json({ ok: true, ...auto });
        }

        return new Response("unknown action", { status: 400 });
      },
    },
  },
});
