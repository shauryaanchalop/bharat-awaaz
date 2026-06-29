import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useDemoStore, DEMO_USER_ID, addGrievance, removeGrievance, bumpPriority } from "@/lib/demo/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { StatusBadge } from "./dashboard";

export const Route = createFileRoute("/_authenticated/grievances")({
  head: () => ({ meta: [{ title: "My Grievances — Bharat-Awaaz" }] }),
  component: GrievancesPage,
});

function GrievancesPage() {
  const store = useDemoStore();
  const items = store.grievances.filter((g) => g.user_id === DEMO_USER_ID);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", ministry: "", description: "" });

  function createOne() {
    if (form.subject.length < 10 || form.description.length < 30) {
      toast.error("Subject ≥10 chars, description ≥30 chars (CPGRAMS rules).");
      return;
    }
    addGrievance(form);
    toast.success("Grievance saved.");
    setOpen(false);
    setForm({ subject: "", ministry: "", description: "" });
  }

  function remove(id: string) {
    if (!confirm("Delete this grievance?")) return;
    removeGrievance(id);
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Grievances</h1>
          <p className="text-muted-foreground">Drafts, queued submissions, and CPGRAMS responses.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> New grievance</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New grievance</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Min 10 characters" />
              </div>
              <div className="space-y-1.5">
                <Label>Ministry / Department</Label>
                <Input value={form.ministry} onChange={(e) => setForm((f) => ({ ...f, ministry: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={6} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Min 30 characters" />
              </div>
              <Button onClick={createOne} className="w-full">Save grievance</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No grievances yet. Use the voice agent or click "New grievance".
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((g) => (
            <Card key={g.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold">{g.subject}</h3>
                    <StatusBadge status={g.status} regId={g.registration_id} />
                    {g.priority !== 0 && <span className="text-xs px-2 py-0.5 rounded bg-muted">P{g.priority}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{g.ministry ?? "—"}{g.scheme ? ` · ${g.scheme}` : ""}</p>
                  {g.description && <p className="text-sm mt-2 line-clamp-2">{g.description}</p>}
                  {g.last_error && <p className="text-xs mt-2 text-destructive">⚠ {g.last_error}</p>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => bumpPriority(g.id, 1)} aria-label="Raise priority">↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => bumpPriority(g.id, -1)} aria-label="Lower priority">↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(g.id)} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
