import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import {
  useDemoStore,
  resetDemo,
  reviewGrievance,
  clearReview,
  setPipelineStatus,
  revertPipelineStatus,
  upsertGrievanceFromServer,
  appendAuditFromServer,
  pipelineLabel,
  PIPELINE_STATUSES,
  allowedNextStatuses,
  PipelineTransitionError,
  type DemoGrievance,
  type PipelineStatus,
} from "@/lib/demo/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, RotateCcw, CheckCircle2, XCircle, RefreshCw, Inbox, Loader2, CheckCheck, Archive } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "./dashboard";
import { useServerFn } from "@tanstack/react-start";
import { setGrievancePipeline, reviewGrievanceServer } from "@/lib/admin/grievances.functions";
import { supabase } from "@/integrations/supabase/client";

// Best-effort server persistence: demo grievance IDs live in localStorage and
// are not present in the real `grievances` table, so a "grievance not found"
// or "Unauthorized" is expected in demo mode and we swallow it silently. Any
// other failure (invalid transition, forbidden, network) surfaces as a toast
// so admins running against real data see the exact reason.
function reportServerPersistError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not found|Unauthorized|No authorization/i.test(msg)) {
    console.info("[admin] server persist skipped:", msg);
    return;
  }
  toast.error("Server persist failed", { description: msg });
}


const PIPELINE_META: Record<PipelineStatus, { icon: typeof Inbox; cls: string }> = {
  received: { icon: Inbox, cls: "text-sky-600 border-sky-500/40 bg-sky-500/10" },
  in_progress: { icon: Loader2, cls: "text-amber-600 border-amber-500/40 bg-amber-500/10" },
  resolved: { icon: CheckCheck, cls: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10" },
  closed: { icon: Archive, cls: "text-muted-foreground border-border bg-muted" },
};

function PipelinePill({ status }: { status: PipelineStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const { icon: Icon, cls } = PIPELINE_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" /> {pipelineLabel(status)}
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Bharat-Awaaz" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const store = useDemoStore();
  const [reviewTarget, setReviewTarget] = useState<DemoGrievance | null>(null);
  const [grievanceFilter, setGrievanceFilter] = useState<"all" | "pending_review" | "approved" | "rejected">("all");
  const [activeTab, setActiveTab] = useState<"grievances" | "users" | "templates" | "audit">("grievances");
  const [flashIds, setFlashIds] = useState<Record<string, number>>({});
  const [flashAuditIds, setFlashAuditIds] = useState<Record<string, number>>({});
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({});
  const flashRow = (id: string) => {
    setFlashIds((m) => ({ ...m, [id]: Date.now() }));
    window.setTimeout(() => setFlashIds((m) => { const n = { ...m }; delete n[id]; return n; }), 2200);
  };
  const persistPipeline = useServerFn(setGrievancePipeline);
  const persistReview = useServerFn(reviewGrievanceServer);

  // Auto-flash any audit entry that appears since last render (covers both
  // local mutations and realtime inserts) and flash the grievance row it
  // references so admins see the change without switching tabs.
  const prevAuditIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(store.audit.map((a) => a.id));
    if (prevAuditIdsRef.current === null) {
      prevAuditIdsRef.current = currentIds;
      return;
    }
    const fresh = store.audit.filter((a) => !prevAuditIdsRef.current!.has(a.id));
    prevAuditIdsRef.current = currentIds;
    if (!fresh.length) return;
    setFlashAuditIds((m) => {
      const n = { ...m };
      fresh.forEach((a) => { n[a.id] = Date.now(); });
      return n;
    });
    fresh.forEach((a) => { if (a.grievance_id) flashRow(a.grievance_id); });
    const ids = fresh.map((a) => a.id);
    window.setTimeout(() => {
      setFlashAuditIds((m) => { const n = { ...m }; ids.forEach((id) => delete n[id]); return n; });
    }, 2200);
  }, [store.audit]);

  // Realtime: mirror server-side grievance updates and audit inserts into
  // the demo store so the Admin table and Audit tab reflect backend changes
  // (from other admins, background jobs, or direct DB writes) live.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-grievances-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grievances" },
        (payload) => {
          const row = payload.new as { id?: string } | null;
          if (row?.id) upsertGrievanceFromServer(row as Parameters<typeof upsertGrievanceFromServer>[0]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_events" },
        (payload) => {
          const row = payload.new as Parameters<typeof appendAuditFromServer>[0] | null;
          if (row?.id) appendAuditFromServer(row);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);


  const userById = useMemo(() => Object.fromEntries(store.profiles.map((p) => [p.id, p])), [store.profiles]);

  const reviewCounts = useMemo(() => {
    const submitted = store.grievances.filter((g) => g.status === "submitted");
    return {
      pending: submitted.filter((g) => !g.review_decision).length,
      approved: store.grievances.filter((g) => g.review_decision === "approved").length,
      rejected: store.grievances.filter((g) => g.review_decision === "rejected").length,
    };
  }, [store.grievances]);

  const visibleGrievances = useMemo(() => {
    if (grievanceFilter === "pending_review") return store.grievances.filter((g) => g.status === "submitted" && !g.review_decision);
    if (grievanceFilter === "approved") return store.grievances.filter((g) => g.review_decision === "approved");
    if (grievanceFilter === "rejected") return store.grievances.filter((g) => g.review_decision === "rejected");
    return store.grievances;
  }, [store.grievances, grievanceFilter]);

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <Card className="p-8 text-center space-y-3">
          <Shield className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h2 className="text-xl font-semibold">Admin role required</h2>
          <p className="text-sm text-muted-foreground">Switch the demo role to <b>Admin</b> from the sidebar to view this panel.</p>
          <Link to="/dashboard"><Button variant="outline">Back to dashboard</Button></Link>
        </Card>
      </div>
    );
  }

  const byStatus = (s: string) => store.grievances.filter((g) => g.status === s).length;
  const byMinistry = store.grievances.reduce<Record<string, number>>((acc, g) => {
    const k = g.ministry ?? "Other";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const topMinistries = Object.entries(byMinistry).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">Admin Panel <Badge>admin</Badge></h1>
          <p className="text-muted-foreground">System-wide view of citizens, grievances, templates, and audit trail.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { if (confirm("Reset all demo data to the seeded values?")) resetDemo(); }}>
          <RotateCcw className="w-4 h-4 mr-2" /> Reset demo data
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5"><div className="text-sm text-muted-foreground">Citizens</div><div className="text-3xl font-bold tabular-nums">{store.profiles.length}</div></Card>
        <Card className="p-5"><div className="text-sm text-muted-foreground">Grievances</div><div className="text-3xl font-bold tabular-nums">{store.grievances.length}</div></Card>
        <Card className="p-5"><div className="text-sm text-muted-foreground">Templates</div><div className="text-3xl font-bold tabular-nums">{store.templates.length}</div></Card>
        <Card className="p-5"><div className="text-sm text-muted-foreground">Audit events</div><div className="text-3xl font-bold tabular-nums">{store.audit.length}</div></Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5 cursor-pointer hover:border-primary/60 transition" onClick={() => setGrievanceFilter("pending_review")}>
          <div className="text-sm text-muted-foreground flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Awaiting review</div>
          <div className="text-3xl font-bold tabular-nums">{reviewCounts.pending}</div>
        </Card>
        <Card className="p-5 cursor-pointer hover:border-emerald-500/60 transition" onClick={() => setGrievanceFilter("approved")}>
          <div className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Approved</div>
          <div className="text-3xl font-bold tabular-nums">{reviewCounts.approved}</div>
        </Card>
        <Card className="p-5 cursor-pointer hover:border-red-500/60 transition" onClick={() => setGrievanceFilter("rejected")}>
          <div className="text-sm text-muted-foreground flex items-center gap-2"><XCircle className="w-4 h-4 text-red-500" /> Rejected</div>
          <div className="text-3xl font-bold tabular-nums">{reviewCounts.rejected}</div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3">Pipeline by status</div>
          <div className="space-y-2">
            {(["submitted", "ready", "pending_key", "draft", "failed"] as const).map((s) => {
              const c = byStatus(s);
              const pct = store.grievances.length ? (c / store.grievances.length) * 100 : 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1"><span className="capitalize">{s.replace("_", " ")}</span><span className="tabular-nums">{c}</span></div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm font-semibold mb-3">Top ministries</div>
          <div className="space-y-2">
            {topMinistries.map(([name, count]) => (
              <div key={name} className="flex justify-between text-sm border-b last:border-0 py-1.5">
                <span className="truncate">{name}</span>
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="grievances">Grievances</TabsTrigger>
          <TabsTrigger value="users">Citizens</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="grievances" className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "pending_review", "approved", "rejected"] as const).map((f) => (
              <Button key={f} size="sm" variant={grievanceFilter === f ? "default" : "outline"} onClick={() => setGrievanceFilter(f)}>
                {f === "all" ? "All" : f === "pending_review" ? `Awaiting review (${reviewCounts.pending})` : f === "approved" ? `Approved (${reviewCounts.approved})` : `Rejected (${reviewCounts.rejected})`}
              </Button>
            ))}
          </div>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left"><tr><th className="p-3">Subject</th><th className="p-3">Citizen</th><th className="p-3">Ministry</th><th className="p-3">Status</th><th className="p-3">Pipeline</th><th className="p-3">Review</th><th className="p-3">Created</th><th className="p-3 text-right">Action</th></tr></thead>
                <tbody>
                  {visibleGrievances.map((g) => (
                    <tr
                      key={g.id}
                      className={`border-t align-top transition-colors duration-1000 ${flashIds[g.id] ? "bg-primary/10" : ""}`}
                    >
                      <td className="p-3 font-medium max-w-sm">
                        <div className="truncate">{g.subject}</div>
                        {g.review_notes && <div className="text-xs text-muted-foreground mt-1 italic">"{g.review_notes}"</div>}
                      </td>
                      <td className="p-3 text-xs">{userById[g.user_id]?.display_name ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{g.ministry ?? "—"}</td>
                      <td className="p-3"><StatusBadge status={g.status} regId={g.registration_id} /></td>
                      <td className="p-3 min-w-[180px]">
                        {g.status === "submitted" ? (
                          <div className="space-y-1.5">
                            <PipelinePill status={g.pipeline_status} />
                            <Select
                              value={g.pipeline_status ?? undefined}
                              onValueChange={(v) => {
                                const next = v as PipelineStatus;
                                const prev = g.pipeline_status;
                                try {
                                  setPipelineStatus(g.id, next);
                                  flashRow(g.id);
                                  toast.success(`Marked ${pipelineLabel(next)}`, {
                                    description: `${prev ? pipelineLabel(prev) : "—"} → ${pipelineLabel(next)} · by Admin (demo)`,
                                    action: { label: "View audit", onClick: () => setActiveTab("audit") },
                                  });
                                  persistPipeline({ data: { grievanceId: g.id, next, reviewer: "Admin (demo)" } })
                                    .catch(reportServerPersistError);
                                } catch (err) {
                                  if (err instanceof PipelineTransitionError) {
                                    toast.error("Invalid transition", { description: err.message });
                                  } else {
                                    toast.error("Update failed", { description: err instanceof Error ? err.message : String(err) });
                                  }
                                }
                              }}

                            >
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Set status…" /></SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const allowed = new Set(allowedNextStatuses(g.pipeline_status));
                                  return PIPELINE_STATUSES.map((s) => {
                                    const isCurrent = s === g.pipeline_status;
                                    const disabled = !isCurrent && !allowed.has(s);
                                    return (
                                      <SelectItem key={s} value={s} disabled={disabled} className="text-xs">
                                        {pipelineLabel(s)}{disabled ? " (not allowed)" : ""}
                                      </SelectItem>
                                    );
                                  });
                                })()}
                              </SelectContent>
                            </Select>

                            {g.pipeline_updated_at && (
                              <div className="text-[10px] text-muted-foreground">
                                {g.pipeline_updated_by ?? "—"} · {new Date(g.pipeline_updated_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {g.review_decision === "approved" && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>}
                        {g.review_decision === "rejected" && <Badge className="bg-red-500/15 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>}
                        {!g.review_decision && (g.status === "submitted" ? <Badge variant="outline">Pending</Badge> : <span className="text-xs text-muted-foreground">—</span>)}
                        {g.reviewed_at && <div className="text-[10px] text-muted-foreground mt-1">{new Date(g.reviewed_at).toLocaleString()}</div>}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {g.status === "submitted" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setReviewTarget(g)}>
                              {g.review_decision ? "Edit review" : "Review"}
                            </Button>
                            {g.review_decision && (
                              <Button size="sm" variant="ghost" className="ml-1 text-xs" onClick={() => clearReview(g.id)}>Reset</Button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not submitted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleGrievances.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">No grievances match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">State</th><th className="p-3">Locale</th><th className="p-3">Filings</th><th className="p-3">Joined</th></tr></thead>
                <tbody>
                  {store.profiles.map((p) => {
                    const filings = store.grievances.filter((g) => g.user_id === p.id).length;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="p-3 font-medium">{p.display_name}</td>
                        <td className="p-3 text-xs text-muted-foreground">{p.email}</td>
                        <td className="p-3 text-xs">{p.state}</td>
                        <td className="p-3 text-xs uppercase">{p.locale}</td>
                        <td className="p-3 text-xs tabular-nums">{filings}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left"><tr><th className="p-3">Name</th><th className="p-3">Ministry</th><th className="p-3">Scheme</th><th className="p-3">Fields</th><th className="p-3">Version</th></tr></thead>
                <tbody>
                  {store.templates.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-3 font-medium">{t.name}</td>
                      <td className="p-3 text-xs text-muted-foreground">{t.ministry}</td>
                      <td className="p-3 text-xs">{t.scheme}</td>
                      <td className="p-3 text-xs tabular-nums">{t.fields}</td>
                      <td className="p-3 text-xs">v{t.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-3">Action</th>
                    <th className="p-3">Change</th>
                    <th className="p-3">Reviewer</th>
                    <th className="p-3">Citizen</th>
                    <th className="p-3">Note</th>
                    <th className="p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {store.audit.slice(0, 100).map((a) => {
                    const isPipeline = a.action.startsWith("pipeline_");
                    const prev = a.meta?.prev_status ?? null;
                    const next = a.meta?.next_status ?? null;
                    return (
                      <tr key={a.id} className="border-t align-top">
                        <td className="p-3 font-medium text-xs uppercase tracking-wider whitespace-nowrap">{a.action}</td>
                        <td className="p-3 text-xs">
                          {isPipeline && next ? (
                            <span className="inline-flex items-center gap-1.5">
                              <PipelinePill status={prev} />
                              <span className="text-muted-foreground">→</span>
                              <PipelinePill status={next} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{a.detail}</span>
                          )}
                        </td>
                        <td className="p-3 text-xs">{a.meta?.reviewer ?? (isPipeline ? "—" : "")}</td>
                        <td className="p-3 text-xs text-muted-foreground">{userById[a.user_id]?.display_name ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground italic max-w-xs truncate">{a.meta?.note ?? ""}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>


      <ReviewDialog
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
        citizenName={reviewTarget ? userById[reviewTarget.user_id]?.display_name : undefined}
        persistReview={persistReview}
      />
    </div>
  );
}

function ReviewDialog({ target, onClose, citizenName, persistReview }: {
  target: DemoGrievance | null;
  onClose: () => void;
  citizenName?: string;
  persistReview: (opts: { data: { grievanceId: string; decision: "approved" | "rejected"; notes?: string; reviewer?: string } }) => Promise<unknown>;
}) {
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);

  // reset state whenever a new target is opened
  useEffect(() => {
    setNotes(target?.review_notes ?? "");
    setDecision(target?.review_decision ?? null);
  }, [target?.id, target?.review_notes, target?.review_decision]);

  const submit = (d: "approved" | "rejected") => {
    if (!target) return;
    if (d === "rejected" && !notes.trim()) {
      setDecision("rejected");
      return;
    }
    reviewGrievance(target.id, d, notes);
    persistReview({ data: { grievanceId: target.id, decision: d, notes, reviewer: "Admin (demo)" } })
      .catch(reportServerPersistError);
    onClose();
  };


  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review application</DialogTitle>
          <DialogDescription className="text-xs">
            {target?.scheme && <span className="font-medium">{target.scheme}</span>}
            {citizenName && <> · {citizenName}</>}
            {target?.registration_id && <> · {target.registration_id}</>}
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">{target.subject}</div>
              {target.description && <div className="text-xs text-muted-foreground mt-1">{target.description}</div>}
            </div>
            <div>
              <label className="text-xs font-medium">Reviewer notes {decision === "rejected" && <span className="text-red-500">(required to reject)</span>}</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add justification, missing documents, follow-up actions…" rows={4} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => submit("rejected")} disabled={!notes.trim()}>
            <XCircle className="w-4 h-4 mr-1" /> Reject
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-600/90 text-white" onClick={() => submit("approved")}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
