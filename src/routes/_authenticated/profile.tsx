import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Bharat-Awaaz" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({ display_name: "", phone: "", locale: "en" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setProfile({ display_name: data.display_name ?? "", phone: data.phone ?? "", locale: data.locale ?? "en" });
    });
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, ...profile });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved.");
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-3xl font-bold">Profile</h1><p className="text-muted-foreground">Your personal details and preferences.</p></div>
      <Card className="p-6 space-y-4">
        <div className="space-y-1.5"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
        <div className="space-y-1.5"><Label>Display name</Label><Input value={profile.display_name} onChange={(e) => setProfile((p) => ({ ...p, display_name: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Preferred language</Label>
          <select className="w-full h-10 px-3 border rounded-md bg-background" value={profile.locale} onChange={(e) => setProfile((p) => ({ ...p, locale: e.target.value }))}>
            <option value="en">English</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option><option value="te">తెలుగు</option><option value="bn">বাংলা</option><option value="mr">मराठी</option>
          </select>
        </div>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
      </Card>
    </div>
  );
}
