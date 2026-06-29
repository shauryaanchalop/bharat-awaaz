import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { useDemoStore, DEMO_USER_ID, addMember, removeMember } from "@/lib/demo/store";
import { useRoleGuard } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, User, Users, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/household")({
  head: () => ({ meta: [{ title: "My Family — Bharat-Awaaz" }] }),
  component: HouseholdPage,
});

const RELATIONS = ["Self", "Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Grandparent", "Other"];

function HouseholdPage() {
  const store = useDemoStore();
  const members = store.members.filter((m) => m.user_id === DEMO_USER_ID);
  const [form, setForm] = useState({ name: "", relation: "Spouse", age: "", gender: "", state: "", occupation: "" });

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    addMember({
      name: form.name,
      relation: form.relation,
      age: form.age ? parseInt(form.age) : null,
      gender: form.gender || null,
      state: form.state || null,
      occupation: form.occupation || null,
    });
    toast.success(`${form.name} added`);
    setForm({ name: "", relation: "Spouse", age: "", gender: "", state: "", occupation: "" });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground"><Users className="h-3 w-3" /> Family profiles</div>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Your household</h1>
          <p className="mt-1 text-muted-foreground">One account, every family member. The agent matches schemes to whoever you're filing for.</p>
        </div>
        <Link to="/app" search={{ lang: "hi" }}>
          <Button className="rounded-full"><Sparkles className="mr-2 h-4 w-4" /> Find schemes</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {members.length === 0 ? (
            <Card className="p-10 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <div className="mt-3 font-display text-xl font-semibold">No family members yet</div>
              <p className="mt-1 text-sm text-muted-foreground">Add yourself first, then your spouse, parents, or children.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {members.map((m, i) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="group relative overflow-hidden p-5 transition hover:border-primary/40">
                    {m.is_primary && (
                      <div className="absolute right-4 top-4 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-primary">Primary</div>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--saffron)]/20 to-[var(--india-green)]/20 text-foreground">
                        <User className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-lg font-semibold">{m.name}</div>
                        <div className="text-xs uppercase tracking-widest text-muted-foreground">{m.relation}</div>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      {m.age && (<><dt className="text-muted-foreground">Age</dt><dd className="text-right tabular-nums">{m.age}</dd></>)}
                      {m.gender && (<><dt className="text-muted-foreground">Gender</dt><dd className="text-right">{m.gender}</dd></>)}
                      {m.state && (<><dt className="text-muted-foreground">State</dt><dd className="text-right">{m.state}</dd></>)}
                      {m.occupation && (<><dt className="text-muted-foreground">Work</dt><dd className="text-right">{m.occupation}</dd></>)}
                    </dl>
                    <div className="mt-4 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => removeMember(m.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit p-6">
          <div className="mb-4 flex items-center gap-2 font-display text-lg font-semibold"><Plus className="h-4 w-4" /> Add member</div>
          <form onSubmit={add} className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sita Devi" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Relation</Label>
                <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
                  {RELATIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Age</Label>
                <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="62" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Gender</Label>
                <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">—</option><option>Female</option><option>Male</option><option>Other</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Uttar Pradesh" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Occupation</Label>
              <Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} placeholder="Farmer / Homemaker / Student" />
            </div>
            <Button type="submit" className="w-full">Add to household</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
