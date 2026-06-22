// Grievance draft workflow with:
// - strict CPGRAMS schema validation (action:"validate")
// - per-field diff (payload vs normalisedPayload) surfaced via GET
// - manual queue controls: submit / cancel / prioritize / retry-all + bulk
// - automatic resend queuing (status flips, key-arrival, timeouts), priority-sorted
// - append-only audit trail per draft (edits, queue actions, submit results)

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
import {
  getOrCreateSession,
  updateSession,
  emit,
  type GrievanceDraft,
  type GrievancePayload,
  type DraftAuditEvent,
} from "@/lib/agent/state";

function newDraftId() {
  return "gd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function pushAudit(d: GrievanceDraft, ev: Omit<DraftAuditEvent, "ts"> & { ts?: number }) {
  if (!d.auditEvents) d.auditEvents = [];
  d.auditEvents.push({ ts: ev.ts ?? Date.now(), ...ev });
}

function diffPayloads(a: GrievancePayload, b: GrievancePayload) {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])) as (keyof GrievancePayload)[];
  const changes: { field: string; from: string; to: string }[] = [];
  for (const k of keys) {
    const av = (a[k] ?? "") as string;
    const bv = (b[k] ?? "") as string;
    if (av !== bv) changes.push({ field: String(k), from: av, to: bv });
  }
  return changes;
}

type SubmitOutcome = { ok: true; regId: string } | { ok: false; error: string; status: GrievanceDraft["status"]; issues?: { field: string; message: string }[] };

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
      pushAudit(d, { action: "submit_attempt", detail: `attempt #${d.attempts}` });
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
        pushAudit(d, { action: "submit_success", regId: result.regId, detail: result.acknowledgement });
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
        pushAudit(d, { action: "submit_failed", detail: msg });
      }
    });
    return { ok: false, error: msg, status, issues };
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
            | "prioritize"
            | "bulk";
          sessionId: string;
          draftId?: string;
          draftIds?: string[];
          op?: "cancel" | "prioritize" | "deprioritize" | "submit";
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
          const now = Date.now();
          const draft: GrievanceDraft = {
            draftId: newDraftId(),
            payload: body.payload,
            normalisedPayload: validation.ok ? validation.data : undefined,
            status: validation.ok && !block ? "ready" : "draft",
            createdAt: now,
            attempts: 0,
            priority: 0,
            validationIssues: block
              ? [{ field: "description", message: `Out of CPGRAMS purview ("${block}").` }]
              : validation.ok
                ? undefined
                : validation.issues,
            auditEvents: [{ ts: now, action: "create", detail: validation.ok ? "draft ready" : "schema invalid" }],
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
            const changes = diffPayloads(d.payload, body.payload!);
            d.payload = body.payload!;
            d.normalisedPayload = validation.ok ? validation.data : undefined;
            d.status = validation.ok && !block ? "ready" : "draft";
            d.validationIssues = block
              ? [{ field: "description", message: `Out of CPGRAMS purview ("${block}").` }]
              : validation.ok
                ? undefined
                : validation.issues;
            pushAudit(d, { action: "update", changes, detail: `${changes.length} field edit(s)` });
            if (!validation.ok || block) {
              pushAudit(d, {
                action: "validation_failed",
                detail: (d.validationIssues ?? []).map((i) => `${i.field}:${i.message}`).join("; "),
              });
            }
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
              pushAudit(d, { action: "cancel", detail: "user cancelled" });
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
            if (d) {
              d.priority = (d.priority ?? 0) + delta;
              pushAudit(d, { action: "prioritize", priority: d.priority, detail: `Δ${delta >= 0 ? "+" : ""}${delta}` });
            }
          });
          const d = s.grievanceDrafts.find((x) => x.draftId === body.draftId);
          if (d) {
            recomputeNormalised(d);
            emit(sessionId, { type: "grievance_draft", draft: d });
          }
          return Response.json({ ok: true, priority: d?.priority ?? 0 });
        }

        if (action === "bulk") {
          const ids = body.draftIds ?? [];
          const op = body.op;
          if (!op || ids.length === 0) return Response.json({ ok: false, error: "op + draftIds required" }, { status: 400 });
          if (op === "submit") {
            let drained = 0;
            for (const id of ids) {
              const r = await attemptSubmit(sessionId, id);
              if (r.ok) drained++;
            }
            return Response.json({ ok: true, op, count: ids.length, drained });
          }
          updateSession(sessionId, (st) => {
            for (const id of ids) {
              const d = st.grievanceDrafts.find((x) => x.draftId === id);
              if (!d) continue;
              if (op === "cancel") {
                if (d.status !== "submitted") {
                  d.status = "cancelled";
                  d.lastError = undefined;
                  pushAudit(d, { action: "cancel", detail: "bulk cancel" });
                }
              } else if (op === "prioritize") {
                d.priority = (d.priority ?? 0) + 1;
                pushAudit(d, { action: "prioritize", priority: d.priority, detail: "bulk +1" });
              } else if (op === "deprioritize") {
                d.priority = (d.priority ?? 0) - 1;
                pushAudit(d, { action: "prioritize", priority: d.priority, detail: "bulk -1" });
              }
            }
          });
          for (const id of ids) {
            const d = s.grievanceDrafts.find((x) => x.draftId === id);
            if (d) emit(sessionId, { type: "grievance_draft", draft: d });
          }
          return Response.json({ ok: true, op, count: ids.length });
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
