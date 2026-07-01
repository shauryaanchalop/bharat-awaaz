// Server-side persistence for admin pipeline transitions and reviewer stamps.
// The DB functions are locked to service_role, so we authorize the caller in
// TS (must be signed in AND have the `admin` role), then invoke via the
// admin client. Transition/decision validation happens inside the DB
// functions — this file just marshals arguments and shapes the response.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PipelineStatus = "received" | "in_progress" | "resolved" | "closed";
export type ReviewDecision = "approved" | "rejected";

export type GrievanceRow = {
  id: string;
  pipeline_status: PipelineStatus | null;
  pipeline_updated_at: string | null;
  pipeline_updated_by: string | null;
  review_decision: ReviewDecision | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewer: string | null;
  updated_at: string;
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(`role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const setGrievancePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    grievanceId: string;
    next: PipelineStatus;
    note?: string;
    reviewer?: string;
  }) => {
    if (!input.grievanceId) throw new Error("grievanceId required");
    const allowed = ["received", "in_progress", "resolved", "closed"] as const;
    if (!allowed.includes(input.next)) throw new Error(`invalid status: ${input.next}`);
    return input;
  })
  .handler(async ({ data, context }): Promise<GrievanceRow> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("admin_set_pipeline_status", {
      _grievance_id: data.grievanceId,
      _next: data.next,
      _note: data.note ?? "",
      _reviewer: data.reviewer ?? undefined,
    });
    if (error) throw new Error(error.message);
    return row as GrievanceRow;
  });

export const reviewGrievanceServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    grievanceId: string;
    decision: ReviewDecision;
    notes?: string;
    reviewer?: string;
  }) => {
    if (!input.grievanceId) throw new Error("grievanceId required");
    if (input.decision !== "approved" && input.decision !== "rejected") {
      throw new Error(`invalid decision: ${input.decision}`);
    }
    if (input.decision === "rejected" && !(input.notes ?? "").trim()) {
      throw new Error("notes are required to reject");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<GrievanceRow> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("admin_review_grievance", {
      _grievance_id: data.grievanceId,
      _decision: data.decision,
      _notes: data.notes ?? "",
      _reviewer: data.reviewer ?? undefined,
    });
    if (error) throw new Error(error.message);
    return row as GrievanceRow;
  });
