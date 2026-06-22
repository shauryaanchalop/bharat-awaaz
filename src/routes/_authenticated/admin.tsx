import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Bharat-Awaaz" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!role) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const [grievances, setGrievances] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [g, p, a, t] = await Promise.all([
        supabase.from("grievances").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("templates").select("*").order("created_at", { ascending: false }),
      ]);
      setGrievances(g.data ?? []);
      setProfiles(p.data ?? []);
      setAudit(a.data ?? []);
      setTemplates(t.data ?? []);
    })();
  }, [isAdmin]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">Admin Panel <Badge>admin</Badge></h1>
        <p className="text-muted-foreground">System-wide view of users, grievances, templates, and audit trail.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5"><div className="text-sm text-muted-foreground">Total users</div><div className="text-3xl font-bold">{profiles.length}</div></Card>
        <Card className="p-5"><div className="text-sm text-muted-foreground">Grievances</div><div className="text-3xl font-bold">{grievances.length}</div></Card>
        <Card className="p-5"><div className="text-sm text-muted-foreground">Templates</div><div className="text-3xl font-bold">{templates.length}</div></Card>
        <Card className="p-5"><div className="text-sm text-muted-foreground">Audit events</div><div className="text-3xl font-bold">{audit.length}</div></Card>
      </div>

      <Tabs defaultValue="grievances">
        <TabsList>
          <TabsTrigger value="grievances">Grievances</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="grievances">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-3">Subject</th><th className="p-3">User</th><th className="p-3">Status</th><th className="p-3">Created</th></tr></thead>
              <tbody>
                {grievances.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="p-3 font-medium">{g.subject}</td>
                    <td className="p-3 text-xs text-muted-foreground">{g.user_id.slice(0, 8)}…</td>
                    <td className="p-3"><StatusBadge status={g.status} regId={g.registration_id} /></td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-3">Name</th><th className="p-3">Locale</th><th className="p-3">Joined</th></tr></thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-medium">{p.display_name ?? "—"}</td>
                    <td className="p-3">{p.locale}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-3">Name</th><th className="p-3">Ministry</th><th className="p-3">Version</th></tr></thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3">{t.ministry}</td>
                    <td className="p-3">v{t.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-3">Action</th><th className="p-3">Detail</th><th className="p-3">User</th><th className="p-3">Time</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-3 font-medium">{a.action}</td>
                    <td className="p-3 text-xs">{a.detail ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{a.user_id.slice(0, 8)}…</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
