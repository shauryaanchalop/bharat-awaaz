import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DEMO_USER_ID, addGrievance, useDemoStore, type DemoGrievance } from "@/lib/demo/store";
import { useCan, useRoleGuard } from "@/lib/auth/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/BackButton";
import {
  Check,
  Circle,
  FileText,
  ShieldCheck,
  Send,
  Clock,
  XCircle,
  Search,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/schemes")({
  ssr: false,
  component: SchemesPage,
});

type DiscoveredScheme = {
  code: string;
  name: string;
  ministry: string;
  summary: string;
  benefit: string;
  eligibility: string[];
  tags: string[];
  match: number; // 0-100
};

// Curated catalogue, ordered roughly by relevance for the demo persona
// (rural household in UP, farmer, 5 members incl. minor & elder).
const CATALOGUE: DiscoveredScheme[] = [
  {
    code: "PM-KISAN",
    name: "PM Kisan Samman Nidhi",
    ministry: "Agriculture & Farmers Welfare",
    summary: "₹6,000/year direct income support to small & marginal farmer families in three installments.",
    benefit: "₹2,000 every 4 months to Aadhaar-seeded bank account",
    eligibility: ["Landholding farmer family", "Cultivable land ≤ 2 hectares", "Aadhaar + bank seeding"],
    tags: ["farmer", "income-support", "dbt"],
    match: 96,
  },
  {
    code: "PMJAY",
    name: "Ayushman Bharat – PMJAY",
    ministry: "Health & Family Welfare",
    summary: "Health cover of ₹5 lakh per family per year for secondary & tertiary care hospitalisation.",
    benefit: "₹5,00,000 cashless cover per family / year",
    eligibility: ["SECC-2011 deprivation criteria", "BPL family", "No private insurance"],
    tags: ["health", "insurance", "family"],
    match: 92,
  },
  {
    code: "PMUY",
    name: "PM Ujjwala Yojana 2.0",
    ministry: "Petroleum & Natural Gas",
    summary: "Free LPG connection with deposit-free first refill and stove for women from BPL households.",
    benefit: "Free connection + 1st refill + stove",
    eligibility: ["Adult woman from BPL household", "No LPG connection in household", "Self-declaration accepted"],
    tags: ["women", "energy", "household"],
    match: 88,
  },
  {
    code: "PMAY-G",
    name: "PM Awas Yojana – Gramin",
    ministry: "Rural Development",
    summary: "Financial assistance to construct a pucca house with basic amenities for the rural homeless.",
    benefit: "₹1.20 – ₹1.30 lakh in 3 instalments",
    eligibility: ["Houseless / kutcha house", "Listed in SECC Awas+ survey", "Rural address"],
    tags: ["housing", "rural"],
    match: 84,
  },
  {
    code: "NSAP-IGNOAPS",
    name: "Indira Gandhi Old Age Pension",
    ministry: "Rural Development",
    summary: "Monthly pension to BPL persons aged 60+ years under the National Social Assistance Programme.",
    benefit: "₹200 – ₹500 / month (centre) + state top-up",
    eligibility: ["Age ≥ 60", "BPL household", "Not receiving other central pension"],
    tags: ["elderly", "pension", "social-security"],
    match: 80,
  },
  {
    code: "NSP-PreMatric",
    name: "Pre-Matric Scholarship (SC)",
    ministry: "Social Justice & Empowerment",
    summary: "Scholarship for SC students in classes IX & X to reduce drop-out and support schooling expenses.",
    benefit: "Up to ₹3,500 + book grant per year",
    eligibility: ["SC category", "Studying in Class IX or X", "Parental income ≤ ₹2.5 lakh / yr"],
    tags: ["education", "scholarship", "minor"],
    match: 76,
  },
  {
    code: "NFSA",
    name: "Ration Card (NFSA) – UP",
    ministry: "Food & Public Distribution",
    summary: "Subsidised foodgrains (rice, wheat, coarse grains) through Fair Price Shops under NFSA.",
    benefit: "5 kg / person / month at ₹1–3 / kg",
    eligibility: ["Priority household / Antyodaya", "Resident of Uttar Pradesh", "Aadhaar e-KYC of all members"],
    tags: ["food-security", "household"],
    match: 74,
  },
  {
    code: "SSY",
    name: "Sukanya Samriddhi Yojana",
    ministry: "Finance",
    summary: "Small-savings scheme for a girl child with high interest, tax benefits, and a 21-year tenure.",
    benefit: "8.2% p.a. (FY 25-26) + 80C tax benefit",
    eligibility: ["Girl child below 10 yrs", "Indian resident", "Max 2 accounts per family"],
    tags: ["girl-child", "savings", "education"],
    match: 70,
  },
  {
    code: "MGNREGA",
    name: "MGNREGA Job Card",
    ministry: "Rural Development",
    summary: "Guarantee of 100 days of wage employment per year to rural households doing unskilled work.",
    benefit: "100 days × notified state wage",
    eligibility: ["Adult member of rural household", "Willing to do unskilled manual work"],
    tags: ["employment", "rural", "wages"],
    match: 68,
  },
  {
    code: "ICDS",
    name: "ICDS – Take-home Ration",
    ministry: "Women & Child Development",
    summary: "Supplementary nutrition for pregnant women, lactating mothers, and children under 6 via Anganwadi.",
    benefit: "Monthly THR kit + health check",
    eligibility: ["Pregnant / lactating woman", "Child < 6 yrs", "Registered at local Anganwadi"],
    tags: ["women", "nutrition", "child"],
    match: 64,
  },
];

type Step = { key: string; label: string; icon: typeof Circle };

const STEPS: Step[] = [
  { key: "discovered", label: "Discovered", icon: Sparkles },
  { key: "drafted", label: "Drafted", icon: FileText },
  { key: "validated", label: "Validated", icon: ShieldCheck },
  { key: "submitted", label: "Submitted", icon: Send },
  { key: "ack", label: "Acknowledged", icon: Clock },
  { key: "decided", label: "Decision", icon: Check },
];

function stepIndexFor(g: DemoGrievance | undefined): { idx: number; failed: boolean; decided: "approved" | "rejected" | null } {
  if (!g) return { idx: 0, failed: false, decided: null };
  if (g.review_decision) return { idx: 5, failed: false, decided: g.review_decision };
  switch (g.status) {
    case "draft":
      return { idx: 1, failed: false, decided: null };
    case "ready":
      return { idx: 2, failed: false, decided: null };
    case "pending_key":
      return { idx: 3, failed: false, decided: null };
    case "submitted":
      return { idx: 4, failed: false, decided: null };
    case "failed":
      return { idx: 3, failed: true, decided: null };
    case "cancelled":
      return { idx: 0, failed: true, decided: null };
    default:
      return { idx: 0, failed: false, decided: null };
  }
}

function SchemesPage() {
  useRoleGuard(["user", "admin"]); // both can browse; mutations gated below
  const canStart = useCan("start_application");
  const store = useDemoStore();
  const [query, setQuery] = useState("");

  const myGrievancesByScheme = useMemo(() => {
    const map = new Map<string, DemoGrievance>();
    for (const g of store.grievances) {
      if (g.user_id !== DEMO_USER_ID || !g.scheme) continue;
      const existing = map.get(g.scheme);
      if (!existing || (g.submitted_at ?? g.created_at) > (existing.submitted_at ?? existing.created_at)) {
        map.set(g.scheme, g);
      }
    }
    return map;
  }, [store.grievances]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOGUE;
    return CATALOGUE.filter((s) =>
      [s.name, s.code, s.ministry, s.summary, ...s.tags].some((v) => v.toLowerCase().includes(q))
    );
  }, [query]);

  const counts = useMemo(() => {
    let inProgress = 0;
    let submitted = 0;
    let approved = 0;
    for (const s of CATALOGUE) {
      const g = myGrievancesByScheme.get(s.code);
      if (!g) continue;
      if (g.review_decision === "approved") approved++;
      else if (g.status === "submitted") submitted++;
      else inProgress++;
    }
    return { discovered: CATALOGUE.length, inProgress, submitted, approved };
  }, [myGrievancesByScheme]);

  function startApplication(s: DiscoveredScheme) {
    addGrievance({
      subject: `Application: ${s.name}`,
      ministry: s.ministry,
      description: `Apply for ${s.name} (${s.code}). Benefit: ${s.benefit}.`,
    });
    // Tag the just-created grievance with the scheme code so progress shows up.
    // addGrievance writes status="ready" with scheme=null; patch it here.
    try {
      const KEY = "bharat-awaaz.demo-store.v2";
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const latest = parsed.grievances?.[0];
        if (latest && !latest.scheme) {
          latest.scheme = s.code;
          localStorage.setItem(KEY, JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent("demo-store-change"));
        }
      }
    } catch {
      /* ignore */
    }
    toast.success(`Application started for ${s.code}`);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-2xl font-bold mt-2">Schemes for you</h1>
          <p className="text-sm text-muted-foreground">
            Eligibility-matched government schemes with live application progress.
          </p>
        </div>
        <Link to="/app">
          <Button variant="outline" size="sm">
            <Sparkles className="w-4 h-4 mr-2" /> Discover via voice
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Discovered" value={counts.discovered} />
        <Stat label="In progress" value={counts.inProgress} tone="amber" />
        <Stat label="Submitted" value={counts.submitted} tone="blue" />
        <Stat label="Approved" value={counts.approved} tone="green" />
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, ministry, or category (e.g. health, women, farmer)"
          className="pl-9"
        />
      </div>

      <div className="grid gap-4">
        {filtered.map((s) => {
          const g = myGrievancesByScheme.get(s.code);
          const { idx, failed, decided } = stepIndexFor(g);
          return (
            <Card key={s.code}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                      <span>{s.name}</span>
                      <Badge variant="outline" className="text-[10px]">{s.code}</Badge>
                      <Badge className="text-[10px] bg-green-600/10 text-green-700 dark:text-green-400 hover:bg-green-600/10">
                        {s.match}% match
                      </Badge>
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">{s.ministry}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Benefit</div>
                    <div className="text-sm font-medium">{s.benefit}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{s.summary}</p>

                <div className="flex flex-wrap gap-2">
                  {s.eligibility.map((e) => (
                    <Badge key={e} variant="secondary" className="font-normal">{e}</Badge>
                  ))}
                </div>

                <Progress idx={idx} failed={failed} decided={decided} />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-muted-foreground">
                    {g ? (
                      <>
                        Linked grievance:{" "}
                        <Link to="/grievances" className="underline">
                          {g.registration_id ?? g.id.slice(0, 10)}
                        </Link>
                        {g.review_decision && (
                          <>
                            {" · "}
                            <span className={g.review_decision === "approved" ? "text-green-600" : "text-red-600"}>
                              {g.review_decision}
                            </span>
                            {g.review_notes ? ` — ${g.review_notes}` : ""}
                          </>
                        )}
                      </>
                    ) : (
                      <>Not started yet</>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {g ? (
                      <Link to="/grievances">
                        <Button size="sm" variant="outline">
                          Track <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" onClick={() => startApplication(s)}>
                        Start application
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">No schemes match that search.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "blue" | "green" }) {
  const color =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "blue"
      ? "text-blue-600 dark:text-blue-400"
      : tone === "green"
      ? "text-green-600 dark:text-green-400"
      : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Progress({
  idx,
  failed,
  decided,
}: {
  idx: number;
  failed: boolean;
  decided: "approved" | "rejected" | null;
}) {
  return (
    <ol className="flex items-stretch gap-1 overflow-x-auto pb-1" aria-label="Application progress">
      {STEPS.map((step, i) => {
        const reached = i <= idx;
        const current = i === idx;
        const isDecision = step.key === "decided";
        const Icon =
          isDecision && decided === "rejected"
            ? XCircle
            : isDecision && decided === "approved"
            ? Check
            : current && failed
            ? XCircle
            : reached
            ? step.icon
            : Circle;

        const color = isDecision && decided === "approved"
          ? "bg-green-600 text-white border-green-600"
          : isDecision && decided === "rejected"
          ? "bg-red-600 text-white border-red-600"
          : current && failed
          ? "bg-red-600 text-white border-red-600"
          : reached
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-muted-foreground border-border";

        return (
          <li key={step.key} className="flex-1 min-w-[88px]">
            <div className="flex items-center gap-1">
              <div className={`w-7 h-7 shrink-0 rounded-full border flex items-center justify-center ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 ${i < idx ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
            <div className={`mt-1 text-[10px] uppercase tracking-wider ${current ? "font-semibold" : "text-muted-foreground"}`}>
              {isDecision && decided ? decided : step.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
