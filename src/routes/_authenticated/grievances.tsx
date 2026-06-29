import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDemoStore, DEMO_USER_ID, addGrievance, removeGrievance, bumpPriority, quickSubmitGrievance } from "@/lib/demo/store";
import { useRoleGuard } from "@/lib/auth/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Zap } from "lucide-react";
import { StatusBadge } from "./dashboard";

const QUICK_PRESETS: Array<{ subject: string; ministry: string; scheme: string; description: string }> = [
  {
    subject: "PM-KISAN installment not credited despite valid eKYC",
    ministry: "Agriculture & Farmers Welfare",
    scheme: "PM-KISAN",
    description: "Beneficiary ID active since 2020. Last credit received earlier this year. eKYC re-verified at CSC. Requesting release of the pending installment.",
  },
  {
    subject: "Ujjwala refill subsidy reversed without notice",
    ministry: "Petroleum & Natural Gas",
    scheme: "PMUY",
    description: "Subsidy of Rs 300 not credited for last 3 cylinder refills. Bank account is Aadhaar-seeded and active. Requesting reconciliation.",
  },
  {
    subject: "Ration card e-KYC failing on FPS POS device",
    ministry: "Food & Public Distribution",
    scheme: "NFSA",
    description: "Fingerprint biometric mismatch for an elderly member of the household. OTP fallback is disabled at the Fair Price Shop. Requesting alternative verification.",
  },
  {
    subject: "PMAY-Gramin first instalment pending for 7 months",
    ministry: "Rural Development",
    scheme: "PMAY-G",
    description: "House sanctioned in cycle 2024-25. Foundation cast and geo-tag uploaded. First instalment not released despite multiple block-office visits.",
  },
];


export const Route = createFileRoute("/_authenticated/grievances")({
  head: () => ({ meta: [{ title: "My Grievances — Bharat-Awaaz" }] }),
  component: GrievancesPage,
});

function GrievancesPage() {
  useRoleGuard("user");
  const store = useDemoStore();
  const navigate = useNavigate();
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

  function quickSubmit(preset: typeof QUICK_PRESETS[number]) {
    const g = quickSubmitGrievance(preset);
    toast.success(`Submitted — ${g?.registration_id ?? "registered"}`, {
      description: "Now visible in the Admin pipeline.",
      action: { label: "Open Admin", onClick: () => navigate({ to: "/admin" }) },
    });
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

      <Card className="p-5 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-md bg-primary/10 text-primary"><Zap className="w-5 h-5" /></div>
          <div>
            <h2 className="font-semibold">One-click submit</h2>
            <p className="text-sm text-muted-foreground">Pick a common grievance template — it's created, signed off, and dropped into the Admin pipeline instantly.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {QUICK_PRESETS.map((p) => (
            <button
              key={p.subject}
              onClick={() => quickSubmit(p)}
              className="text-left p-3 rounded-lg border bg-background hover:border-primary hover:shadow-sm transition group"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-primary">{p.scheme}</span>
                <span className="text-xs text-muted-foreground group-hover:text-primary">Submit →</span>
              </div>
              <div className="text-sm font-medium line-clamp-2">{p.subject}</div>
              <div className="text-xs text-muted-foreground mt-1">{p.ministry}</div>
            </button>
          ))}
        </div>
      </Card>

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
