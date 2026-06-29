import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/hooks";
import { useDemoStore, updateProfile } from "@/lib/demo/store";
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
  const store = useDemoStore();
  const [form, setForm] = useState({ display_name: store.profile.display_name, phone: store.profile.phone ?? "", locale: store.profile.locale, state: store.profile.state });

  useEffect(() => {
    setForm({ display_name: store.profile.display_name, phone: store.profile.phone ?? "", locale: store.profile.locale, state: store.profile.state });
  }, [store.profile]);

  function save() {
    updateProfile(form);
    toast.success("Profile saved.");
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <div><h1 className="text-3xl font-bold">Profile</h1><p className="text-muted-foreground">Your personal details and preferences.</p></div>
      <Card className="p-6 space-y-4">
        <div className="space-y-1.5"><Label>Email</Label><Input value={user?.email ?? ""} disabled /></div>
        <div className="space-y-1.5"><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>State</Label><Input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Preferred language</Label>
          <select className="w-full h-10 px-3 border rounded-md bg-background" value={form.locale} onChange={(e) => setForm((p) => ({ ...p, locale: e.target.value }))}>
            <option value="en">English</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option><option value="te">తెలుగు</option><option value="bn">বাংলা</option><option value="mr">मराठी</option>
          </select>
        </div>
        <Button onClick={save}>Save changes</Button>
      </Card>
    </div>
  );
}
