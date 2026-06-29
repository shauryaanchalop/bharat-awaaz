// Demo store: in-memory seed data persisted to localStorage. Powers both the
// Citizen and Admin panels without any backend dependency so the prototype
// shows realistic information from the very first visit.

import { useEffect, useState } from "react";

const KEY = "bharat-awaaz.demo-store.v2";
const EVENT = "demo-store-change";

export type DemoProfile = {
  id: string;
  display_name: string;
  email: string;
  locale: string;
  phone: string | null;
  state: string;
  created_at: string;
};

export type DemoMember = {
  id: string;
  user_id: string;
  name: string;
  relation: string;
  age: number | null;
  gender: string | null;
  state: string | null;
  occupation: string | null;
  is_primary: boolean;
  created_at: string;
};

export type ReviewDecision = "approved" | "rejected";

export type DemoGrievance = {
  id: string;
  user_id: string;
  subject: string;
  ministry: string | null;
  description: string | null;
  status: "draft" | "ready" | "pending_key" | "submitted" | "failed" | "cancelled";
  registration_id: string | null;
  priority: number;
  scheme: string | null;
  state: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  submitted_at: string | null;
  review_decision: ReviewDecision | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewer: string | null;
};

export type DemoTemplate = {
  id: string;
  slug: string;
  name: string;
  ministry: string;
  scheme: string;
  version: number;
  fields: number;
  created_at: string;
};

export type DemoAudit = {
  id: string;
  user_id: string;
  grievance_id: string | null;
  action: string;
  detail: string;
  created_at: string;
};

export type DemoStore = {
  profile: DemoProfile;
  profiles: DemoProfile[];
  members: DemoMember[];
  grievances: DemoGrievance[];
  templates: DemoTemplate[];
  audit: DemoAudit[];
};

// --- demo identity ---
export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

const rid = (p = "") => p + Math.random().toString(36).slice(2, 10);
const days = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function seed(): DemoStore {
  const me: DemoProfile = {
    id: DEMO_USER_ID,
    display_name: "Demo Citizen",
    email: "demo.citizen@bharat-awaaz.in",
    locale: "hi",
    phone: "+91 98765 43210",
    state: "Uttar Pradesh",
    created_at: days(45),
  };

  const otherCitizens: DemoProfile[] = [
    { id: rid("u_"), display_name: "Sita Devi", email: "sita.devi@example.in", locale: "hi", phone: "+91 90000 11122", state: "Bihar", created_at: days(38) },
    { id: rid("u_"), display_name: "Ramesh Kumar", email: "ramesh.k@example.in", locale: "hi", phone: "+91 90000 22233", state: "Uttar Pradesh", created_at: days(31) },
    { id: rid("u_"), display_name: "Lakshmi Iyer", email: "lakshmi.iyer@example.in", locale: "ta", phone: "+91 90000 33344", state: "Tamil Nadu", created_at: days(22) },
    { id: rid("u_"), display_name: "Arjun Patel", email: "arjun.patel@example.in", locale: "gu", phone: "+91 90000 44455", state: "Gujarat", created_at: days(18) },
    { id: rid("u_"), display_name: "Fatima Khan", email: "fatima.k@example.in", locale: "ur", phone: "+91 90000 55566", state: "West Bengal", created_at: days(14) },
    { id: rid("u_"), display_name: "Joseph D'Souza", email: "joseph.d@example.in", locale: "en", phone: "+91 90000 66677", state: "Goa", created_at: days(9) },
    { id: rid("u_"), display_name: "Meera Nair", email: "meera.nair@example.in", locale: "ml", phone: "+91 90000 77788", state: "Kerala", created_at: days(5) },
    { id: rid("u_"), display_name: "Birsa Munda", email: "birsa.m@example.in", locale: "hi", phone: "+91 90000 88899", state: "Jharkhand", created_at: days(2) },
  ];

  const members: DemoMember[] = [
    { id: rid("m_"), user_id: DEMO_USER_ID, name: "Aarav Sharma", relation: "Self", age: 34, gender: "Male", state: "Uttar Pradesh", occupation: "Farmer", is_primary: true, created_at: days(45) },
    { id: rid("m_"), user_id: DEMO_USER_ID, name: "Priya Sharma", relation: "Spouse", age: 31, gender: "Female", state: "Uttar Pradesh", occupation: "Homemaker", is_primary: false, created_at: days(44) },
    { id: rid("m_"), user_id: DEMO_USER_ID, name: "Ram Sharma", relation: "Father", age: 68, gender: "Male", state: "Uttar Pradesh", occupation: "Retired", is_primary: false, created_at: days(40) },
    { id: rid("m_"), user_id: DEMO_USER_ID, name: "Sita Sharma", relation: "Mother", age: 64, gender: "Female", state: "Uttar Pradesh", occupation: "Homemaker", is_primary: false, created_at: days(40) },
    { id: rid("m_"), user_id: DEMO_USER_ID, name: "Anaya Sharma", relation: "Daughter", age: 8, gender: "Female", state: "Uttar Pradesh", occupation: "Student", is_primary: false, created_at: days(20) },
  ];

  const templates: DemoTemplate[] = [
    { id: rid("t_"), slug: "pm-kisan", name: "PM-KISAN Enrolment", ministry: "Agriculture & Farmers Welfare", scheme: "PM-KISAN", version: 3, fields: 18, created_at: days(120) },
    { id: rid("t_"), slug: "ayushman-bharat", name: "Ayushman Bharat PMJAY Card", ministry: "Health & Family Welfare", scheme: "PMJAY", version: 2, fields: 22, created_at: days(95) },
    { id: rid("t_"), slug: "ujjwala", name: "PM Ujjwala Yojana 2.0", ministry: "Petroleum & Natural Gas", scheme: "PMUY", version: 4, fields: 15, created_at: days(82) },
    { id: rid("t_"), slug: "pmay-g", name: "PM Awas Yojana — Gramin", ministry: "Rural Development", scheme: "PMAY-G", version: 5, fields: 27, created_at: days(70) },
    { id: rid("t_"), slug: "nsap-iggoaps", name: "Indira Gandhi Old Age Pension", ministry: "Rural Development", scheme: "NSAP-IGNOAPS", version: 2, fields: 19, created_at: days(60) },
    { id: rid("t_"), slug: "scholarship-pre-matric", name: "Pre-Matric Scholarship (SC)", ministry: "Social Justice & Empowerment", scheme: "NSP Pre-Matric", version: 6, fields: 24, created_at: days(50) },
    { id: rid("t_"), slug: "ration-card-up", name: "Ration Card (NFSA) — UP", ministry: "Food & Public Distribution", scheme: "NFSA", version: 1, fields: 21, created_at: days(40) },
    { id: rid("t_"), slug: "sukanya-samriddhi", name: "Sukanya Samriddhi Account", ministry: "Finance", scheme: "SSY", version: 2, fields: 14, created_at: days(28) },
  ];

  const allUserIds = [DEMO_USER_ID, ...otherCitizens.map((p) => p.id)];

  const grievanceSeeds: Array<Partial<DemoGrievance> & { subject: string; ministry: string; scheme: string; state: string; status: DemoGrievance["status"]; description: string; age: number }> = [
    { subject: "PM-KISAN 16th installment not credited despite valid eKYC", ministry: "Agriculture & Farmers Welfare", scheme: "PM-KISAN", state: "Uttar Pradesh", status: "submitted", description: "Beneficiary ID issued in 2019. Last credit received Feb 2024. eKYC re-done at CSC on 12-Mar.", age: 1 },
    { subject: "Ujjwala refill subsidy reversed without notice", ministry: "Petroleum & Natural Gas", scheme: "PMUY", state: "Bihar", status: "submitted", description: "Subsidy of Rs 300 not credited for last 3 cylinder refills. Bank account is Aadhaar-seeded.", age: 2 },
    { subject: "Ayushman Bharat card request rejected at common service centre", ministry: "Health & Family Welfare", scheme: "PMJAY", state: "Tamil Nadu", status: "failed", description: "SECC list shows family as eligible but CSC operator says name not found.", age: 3 },
    { subject: "PMAY-Gramin first instalment pending for 7 months", ministry: "Rural Development", scheme: "PMAY-G", state: "Jharkhand", status: "ready", description: "House sanctioned in cycle 2024-25. Foundation cast in May. Geo-tag uploaded.", age: 0 },
    { subject: "Pre-Matric scholarship application stuck in 'institute verification'", ministry: "Social Justice & Empowerment", scheme: "NSP Pre-Matric", state: "West Bengal", status: "submitted", description: "Class 9 student. School principal has signed offline but NSP portal still shows pending.", age: 4 },
    { subject: "Old-age pension reduced from Rs 1000 to Rs 200 without intimation", ministry: "Rural Development", scheme: "NSAP-IGNOAPS", state: "Uttar Pradesh", status: "pending_key", description: "Pensioner aged 71. State top-up appears to be discontinued silently.", age: 6 },
    { subject: "Ration card e-KYC failing repeatedly on FPS POS device", ministry: "Food & Public Distribution", scheme: "NFSA", state: "Gujarat", status: "draft", description: "Fingerprint biometric mismatch for elderly member. OTP fallback disabled by FPS.", age: 0 },
    { subject: "Sukanya Samriddhi account interest not compounded for FY 2024-25", ministry: "Finance", scheme: "SSY", state: "Kerala", status: "submitted", description: "Post-office passbook shows principal only. No annual interest entry.", age: 9 },
    { subject: "MGNREGA wages delayed beyond 30 days", ministry: "Rural Development", scheme: "MGNREGA", state: "Bihar", status: "submitted", description: "Job-card holder worked 18 days in April. FTO generated but wages not credited.", age: 11 },
    { subject: "PM-KISAN beneficiary status shows 'Aadhaar bank-seed not done'", ministry: "Agriculture & Farmers Welfare", scheme: "PM-KISAN", state: "Uttar Pradesh", status: "submitted", description: "Bank confirms Aadhaar seeding completed at branch. Portal still flags rejected.", age: 14 },
    { subject: "Ujjwala new connection denied — said 'KYC mismatch'", ministry: "Petroleum & Natural Gas", scheme: "PMUY", state: "West Bengal", status: "submitted", description: "Applicant's ration card spelling differs from Aadhaar by one letter.", age: 18 },
    { subject: "Ayushman card lost — duplicate request pending 21 days", ministry: "Health & Family Welfare", scheme: "PMJAY", state: "Tamil Nadu", status: "submitted", description: "Reprint requested at empanelled hospital. No SMS received.", age: 22 },
    { subject: "Anganwadi nutrition kit not delivered for 2 months", ministry: "Women & Child Development", scheme: "ICDS", state: "Jharkhand", status: "ready", description: "Pregnant woman entitled to take-home ration. Anganwadi worker says stock-out.", age: 3 },
    { subject: "PMAY-G geo-tag verification rejected wrongly", ministry: "Rural Development", scheme: "PMAY-G", state: "Uttar Pradesh", status: "failed", description: "Block-level officer marked unit as 'not started' though walls are up.", age: 8 },
  ];

  const grievances: DemoGrievance[] = grievanceSeeds.map((s, idx) => {
    const user_id = idx < 3 ? DEMO_USER_ID : allUserIds[(idx % allUserIds.length)];
    const isSubmitted = s.status === "submitted";
    return {
      id: rid("g_"),
      user_id,
      subject: s.subject,
      ministry: s.ministry,
      description: s.description,
      status: s.status,
      registration_id: isSubmitted ? `CPGRAMS/${2026}/${String(100000 + idx * 137).slice(0, 6)}` : null,
      priority: idx < 2 ? 1 : 0,
      scheme: s.scheme,
      state: s.state,
      attempts: s.status === "failed" ? 2 : isSubmitted ? 1 : 0,
      last_error: s.status === "failed" ? "Upstream CPGRAMS returned 503 (gateway timeout)" : null,
      created_at: days(s.age),
      submitted_at: isSubmitted ? days(Math.max(0, s.age - 1)) : null,
      review_decision: null,
      review_notes: null,
      reviewed_at: null,
      reviewer: null,
    };
  });

  const audit: DemoAudit[] = [];
  grievances.forEach((g) => {
    audit.push({ id: rid("a_"), user_id: g.user_id, grievance_id: g.id, action: "create", detail: "Drafted via voice agent", created_at: g.created_at });
    if (g.status === "submitted") {
      audit.push({ id: rid("a_"), user_id: g.user_id, grievance_id: g.id, action: "validate", detail: "Citizen confirmed extracted fields", created_at: g.created_at });
      audit.push({ id: rid("a_"), user_id: g.user_id, grievance_id: g.id, action: "submit", detail: `CPGRAMS accepted — ${g.registration_id}`, created_at: g.submitted_at! });
    }
    if (g.status === "failed") {
      audit.push({ id: rid("a_"), user_id: g.user_id, grievance_id: g.id, action: "submit_failed", detail: g.last_error ?? "Submission failed", created_at: g.created_at });
    }
    if (g.status === "pending_key") {
      audit.push({ id: rid("a_"), user_id: g.user_id, grievance_id: g.id, action: "queue", detail: "Awaiting CPGRAMS API key", created_at: g.created_at });
    }
  });
  audit.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { profile: me, profiles: [me, ...otherCitizens], members, grievances, templates, audit };
}

function load(): DemoStore {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoStore;
  } catch {
    /* ignore */
  }
  const s = seed();
  window.localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}

function save(s: DemoStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useDemoStore(): DemoStore {
  const [state, setState] = useState<DemoStore>(() => load());
  useEffect(() => {
    const refresh = () => setState(load());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return state;
}

export function mutateDemo(fn: (s: DemoStore) => DemoStore) {
  const next = fn(load());
  save(next);
}

export function resetDemo() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

// --- mutators used by pages ---
export function addMember(input: Omit<DemoMember, "id" | "created_at" | "user_id" | "is_primary"> & { is_primary?: boolean }) {
  mutateDemo((s) => ({
    ...s,
    members: [
      ...s.members,
      {
        ...input,
        id: rid("m_"),
        user_id: DEMO_USER_ID,
        is_primary: s.members.length === 0,
        created_at: new Date().toISOString(),
      },
    ],
  }));
}

export function removeMember(id: string) {
  mutateDemo((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }));
}

export function addGrievance(input: { subject: string; ministry: string; description: string }) {
  mutateDemo((s) => {
    const g: DemoGrievance = {
      id: rid("g_"),
      user_id: DEMO_USER_ID,
      subject: input.subject,
      ministry: input.ministry || null,
      description: input.description,
      status: "ready",
      registration_id: null,
      priority: 0,
      scheme: null,
      state: s.profile.state,
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
      submitted_at: null,
      review_decision: null,
      review_notes: null,
      reviewed_at: null,
      reviewer: null,
    };
    const a: DemoAudit = { id: rid("a_"), user_id: DEMO_USER_ID, grievance_id: g.id, action: "create", detail: "Manual draft", created_at: g.created_at };
    return { ...s, grievances: [g, ...s.grievances], audit: [a, ...s.audit] };
  });
}

export function removeGrievance(id: string) {
  mutateDemo((s) => ({
    ...s,
    grievances: s.grievances.filter((g) => g.id !== id),
    audit: s.audit.filter((a) => a.grievance_id !== id),
  }));
}

export function bumpPriority(id: string, delta: number) {
  mutateDemo((s) => ({
    ...s,
    grievances: s.grievances.map((g) => (g.id === id ? { ...g, priority: g.priority + delta } : g)),
  }));
}

export function updateProfile(patch: Partial<Pick<DemoProfile, "display_name" | "phone" | "locale" | "state">>) {
  mutateDemo((s) => ({
    ...s,
    profile: { ...s.profile, ...patch },
    profiles: s.profiles.map((p) => (p.id === DEMO_USER_ID ? { ...p, ...patch } : p)),
  }));
}
