import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle2, Clock, AlertCircle, Mic, FilePlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Bharat-Awaaz" }] }),
  component: Dashboard,
});

type Grievance = {
  id: string;
  subject: string;
  status: string;
  registration_id: string | null;
  ministry: string | null;
  created_at: string;
};

function Dashboard() {
  const { user } = useAuth();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [templateCount, setTemplateCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [g, t] = await Promise.all([
        supabase.from("grievances").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("templates").select("id", { count: "exact", head: true }),
      ]);
      setGrievances((g.data as Grievance[]) ?? []);
      setTemplateCount(t.count ?? 0);
      setLoading(false);
    })();
  }, [user]);

  const stats = {
    total: grievances.length,
    submitted: grievances.filter((g) => g.status === "submitted").length,
    pending: grievances.filter((g) => ["draft", "ready", "pending_key"].includes(g.status)).length,
    failed: grievances.filter((g) => g.status === "failed").length,
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">Your citizen-services overview at a glance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Grievances" value={stats.total} icon={FileText} tone="primary" />
        <StatCard label="Submitted" value={stats.submitted} icon={CheckCircle2} tone="success" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard label="Failed" value={stats.failed} icon={AlertCircle} tone="destructive" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent grievances</h2>
            <Link to="/grievances"><Button variant="ghost" size="sm">View all →</Button></Link>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : grievances.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No grievances yet. Start a conversation with the voice agent.
            </div>
          ) : (
            <div className="divide-y">
              {grievances.slice(0, 6).map((g) => (
                <div key={g.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">{g.ministry ?? "—"}</div>
                  </div>
                  <StatusBadge status={g.status} regId={g.registration_id} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Quick actions</h2>
          <Link to="/app" className="block"><Button className="w-full justify-start" variant="outline"><Mic className="w-4 h-4 mr-2" /> Start voice agent</Button></Link>
          <Link to="/grievances" className="block"><Button className="w-full justify-start" variant="outline"><FilePlus className="w-4 h-4 mr-2" /> New grievance</Button></Link>
          <div className="pt-4 border-t">
            <div className="text-2xl font-bold">{templateCount}</div>
            <div className="text-xs text-muted-foreground">form templates available</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ElementType; tone: "primary" | "success" | "warning" | "destructive" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    warning: "bg-amber-500/10 text-amber-600",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-bold mt-1">{value}</div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
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
