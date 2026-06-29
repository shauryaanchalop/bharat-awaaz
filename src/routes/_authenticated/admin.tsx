import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { useDemoStore, resetDemo } from "@/lib/demo/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Shield, RotateCcw } from "lucide-react";
import { StatusBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Bharat-Awaaz" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const store = useDemoStore();

  const userById = useMemo(() => Object.fromEntries(store.profiles.map((p) => [p.id, p])), [store.profiles]);

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

      <Tabs defaultValue="grievances">
        <TabsList>
          <TabsTrigger value="grievances">Grievances</TabsTrigger>
          <TabsTrigger value="users">Citizens</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="grievances">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left"><tr><th className="p-3">Subject</th><th className="p-3">Citizen</th><th className="p-3">Ministry</th><th className="p-3">State</th><th className="p-3">Status</th><th className="p-3">Created</th></tr></thead>
                <tbody>
                  {store.grievances.map((g) => (
                    <tr key={g.id} className="border-t">
                      <td className="p-3 font-medium max-w-sm truncate">{g.subject}</td>
                      <td className="p-3 text-xs">{userById[g.user_id]?.display_name ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{g.ministry ?? "—"}</td>
                      <td className="p-3 text-xs">{g.state ?? "—"}</td>
                      <td className="p-3"><StatusBadge status={g.status} regId={g.registration_id} /></td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(g.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
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
                <thead className="bg-muted text-left"><tr><th className="p-3">Action</th><th className="p-3">Detail</th><th className="p-3">Citizen</th><th className="p-3">Time</th></tr></thead>
                <tbody>
                  {store.audit.slice(0, 100).map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-medium text-xs uppercase tracking-wider">{a.action}</td>
                      <td className="p-3 text-xs">{a.detail}</td>
                      <td className="p-3 text-xs text-muted-foreground">{userById[a.user_id]?.display_name ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
