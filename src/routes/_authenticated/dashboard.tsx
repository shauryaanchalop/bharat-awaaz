import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth/hooks";
import { useDemoStore, DEMO_USER_ID } from "@/lib/demo/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, Clock, AlertCircle, Mic, FilePlus, Users, Map, Sparkles, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Bharat-Awaaz" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const store = useDemoStore();
  const myGrievances = store.grievances.filter((g) => g.user_id === DEMO_USER_ID);
  const myMembers = store.members.filter((m) => m.user_id === DEMO_USER_ID);

  const stats = {
    total: myGrievances.length,
    submitted: myGrievances.filter((g) => g.status === "submitted").length,
    pending: myGrievances.filter((g) => ["draft", "ready", "pending_key"].includes(g.status)).length,
    failed: myGrievances.filter((g) => g.status === "failed").length,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-primary">Citizen console · Demo</div>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Welcome back, {store.profile.display_name}</h1>
          <p className="mt-1 text-muted-foreground">{user?.email} · {store.profile.state}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app" search={{ lang: "hi" }}><Button className="rounded-full"><Mic className="mr-2 h-4 w-4" /> Voice agent</Button></Link>
          <Link to="/impact"><Button variant="outline" className="rounded-full"><Map className="mr-2 h-4 w-4" /> Impact</Button></Link>
        </div>
      </motion.div>

      <div className="grid auto-rows-[minmax(140px,auto)] grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Grievances" value={stats.total} icon={FileText} tone="saffron" />
        <StatTile label="Submitted" value={stats.submitted} icon={CheckCircle2} tone="green" />
        <StatTile label="Pending" value={stats.pending} icon={Clock} tone="muted" />
        <StatTile label="Failed" value={stats.failed} icon={AlertCircle} tone="destructive" />

        <Link to="/household" className="group relative col-span-2 row-span-2 overflow-hidden rounded-2xl border border-border bg-card/60 p-6 backdrop-blur transition hover:border-primary/40">
          <div className="absolute right-4 top-4 text-muted-foreground transition group-hover:text-primary"><ArrowUpRight className="h-5 w-5" /></div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary"><Users className="h-6 w-6" /></div>
          <div className="mt-5 font-display text-5xl font-bold tracking-tight">{myMembers.length}</div>
          <div className="mt-1 text-sm text-muted-foreground">family members on your account</div>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">Add your spouse, parents, and children — the agent matches schemes per person and files for whoever needs it.</p>
          <div className="absolute bottom-6 right-6 text-xs uppercase tracking-widest text-primary opacity-0 transition group-hover:opacity-100">Manage household →</div>
        </Link>

        <Card className="col-span-2 p-6 backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Form library</div>
          <div className="mt-2 font-display text-3xl font-bold">{store.templates.length}</div>
          <div className="text-sm text-muted-foreground">government PDF templates ready to auto-fill</div>
          <Link to="/grievances" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><FilePlus className="h-4 w-4" /> New grievance</Link>
        </Card>

        <Card className="col-span-2 row-span-2 p-6 backdrop-blur md:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Activity</div>
              <div className="mt-1 font-display text-xl font-semibold">Recent grievances</div>
            </div>
            <Link to="/grievances"><Button variant="ghost" size="sm">View all →</Button></Link>
          </div>
          {myGrievances.length === 0 ? (
            <div className="py-10 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <div className="mt-2 text-sm text-muted-foreground">No grievances yet. Start a conversation with the voice agent.</div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {myGrievances.slice(0, 6).map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{g.subject}</div>
                    <div className="truncate text-xs text-muted-foreground">{g.ministry ?? "—"} · {new Date(g.created_at).toLocaleDateString()}</div>
                  </div>
                  <StatusBadge status={g.status} regId={g.registration_id} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone, className = "" }: { label: string; value: number; icon: React.ElementType; tone: "saffron" | "green" | "muted" | "destructive"; className?: string }) {
  const tones = {
    saffron: "text-[var(--saffron)] bg-[var(--saffron)]/15",
    green: "text-[var(--india-green)] bg-[var(--india-green)]/15",
    muted: "text-muted-foreground bg-muted",
    destructive: "text-destructive bg-destructive/15",
  };
  return (
    <Card className={`p-5 backdrop-blur ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-4xl font-bold tabular-nums">{value}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function StatusBadge({ status, regId }: { status: string; regId?: string | null }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "Draft", variant: "secondary" },
    ready: { label: "Ready", variant: "outline" },
    pending_key: { label: "Awaiting API key", variant: "outline" },
    submitted: { label: regId ? `Submitted · ${regId}` : "Submitted", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "secondary" },
  };
  const m = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
