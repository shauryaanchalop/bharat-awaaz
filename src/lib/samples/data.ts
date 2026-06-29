// Demo fixtures: realistic-looking (but synthetic) Aadhaar / Ration / Income
// data used to seed the agent session for end-to-end "extract → map → fill" demos
// without burning real OCR calls.

import type { ExtractedDoc, Demographics } from "@/lib/agent/state";

export type SampleFixture = {
  id: string;
  label: string;
  blurb: string;
  demographics: Demographics;
  docs: Array<Pick<ExtractedDoc, "kind" | "fields">>;
};

export const SAMPLE_FIXTURES: SampleFixture[] = [
  {
    id: "sunita-rural-farmer",
    label: "Sunita Devi — small farmer, Bihar (PM-KISAN / PMAY-G fit)",
    blurb: "Female head of household, 1.2 acres land, BPL ration card. Use to test PM-KISAN, PMAY-G, PMUY.",
    demographics: {
      name: "Sunita Devi",
      age: 38,
      gender: "female",
      marital_status: "married",
      residence_type: "rural",
      social_category: "obc",
      employment_status: "self-employed",
      income_annual: 96000,
      state: "Bihar",
      district: "Gaya",
      occupation: "Marginal farmer",
    },
    docs: [
      {
        kind: "aadhaar",
        fields: {
          applicant_name: "Sunita Devi",
          uid_number: "XXXXXXXX4521", // masked at API boundary anyway
          dob: "12/07/1987",
          gender: "female",
          address_complete: "Vill. Bodhgaya, P.O. Mastipur, Gaya, Bihar — 824231",
          father_or_husband_name: "Ramesh Yadav",
        },
      },
      {
        kind: "ration",
        fields: {
          card_number: "BR-GYA-0094521",
          head_of_family: "Sunita Devi",
          card_type: "BPL",
          members: "5",
          address: "Vill. Bodhgaya, Gaya, Bihar",
        },
      },
      {
        kind: "income",
        fields: {
          applicant_name: "Sunita Devi",
          annual_income: "96000",
          issuing_authority: "Tehsildar, Gaya",
          certificate_number: "INC/GYA/2025/3318",
          issue_date: "04/02/2025",
        },
      },
    ],
  },
  {
    id: "ramesh-senior-pension",
    label: "Ramesh Kumar — senior citizen, UP (IGNOAPS fit)",
    blurb: "67-year-old retired weaver, below poverty line. Use to test IGNOAPS, Ayushman Bharat.",
    demographics: {
      name: "Ramesh Kumar",
      age: 67,
      gender: "male",
      marital_status: "widowed",
      residence_type: "rural",
      social_category: "sc",
      employment_status: "retired",
      income_annual: 42000,
      state: "Uttar Pradesh",
      district: "Varanasi",
      occupation: "Retired handloom weaver",
    },
    docs: [
      {
        kind: "aadhaar",
        fields: {
          applicant_name: "Ramesh Kumar",
          uid_number: "XXXXXXXX1108",
          dob: "1958",
          gender: "male",
          address_complete: "H. No. 14, Lohta, Varanasi, Uttar Pradesh — 221106",
          father_or_husband_name: "Late Shri Mohan Lal",
        },
      },
      {
        kind: "ration",
        fields: {
          card_number: "UP-VNS-0011082",
          head_of_family: "Ramesh Kumar",
          card_type: "AAY",
          members: "1",
          address: "Lohta, Varanasi, UP",
        },
      },
      {
        kind: "income",
        fields: {
          applicant_name: "Ramesh Kumar",
          annual_income: "42000",
          issuing_authority: "SDM, Varanasi",
          certificate_number: "INC/VNS/2025/0991",
          issue_date: "18/01/2025",
        },
      },
    ],
  },
  {
    id: "asha-urban-mother",
    label: "Asha Pillai — urban mother, Kerala (PMUY / Ayushman fit)",
    blurb: "Two-child household in Kochi, husband daily-wage labourer. Use to test PMUY, Ayushman Bharat.",
    demographics: {
      name: "Asha Pillai",
      age: 31,
      gender: "female",
      marital_status: "married",
      residence_type: "urban",
      social_category: "obc",
      employment_status: "unemployed",
      income_annual: 144000,
      state: "Kerala",
      district: "Ernakulam",
      occupation: "Homemaker",
    },
    docs: [
      {
        kind: "aadhaar",
        fields: {
          applicant_name: "Asha Pillai",
          uid_number: "XXXXXXXX7732",
          dob: "03/11/1994",
          gender: "female",
          address_complete: "Flat 3B, Vyttila, Kochi, Ernakulam, Kerala — 682019",
          father_or_husband_name: "Sajeev Pillai",
        },
      },
      {
        kind: "ration",
        fields: {
          card_number: "KL-EKM-0077320",
          head_of_family: "Sajeev Pillai",
          card_type: "PHH",
          members: "4",
          address: "Vyttila, Kochi, Kerala",
        },
      },
    ],
  },
];

export function getFixture(id: string): SampleFixture | undefined {
  return SAMPLE_FIXTURES.find((f) => f.id === id);
}

/* ---------------- SVG mock card generator (downloadable visual) ---------------- */

function esc(s: string) {
  return String(s).replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}

export function aadhaarCardSvg(f: SampleFixture): string {
  const a = f.docs.find((d) => d.kind === "aadhaar")?.fields ?? {};
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff7ed"/><stop offset="1" stop-color="#fde68a"/>
    </linearGradient>
  </defs>
  <rect width="900" height="560" fill="url(#bg)" rx="24"/>
  <rect x="20" y="20" width="860" height="80" fill="#0f172a" rx="12"/>
  <text x="40" y="72" fill="#fde68a" font-family="serif" font-size="36" font-weight="700">भारत सरकार · Government of India</text>
  <text x="40" y="140" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="600">आधार · UNIQUE IDENTIFICATION AUTHORITY OF INDIA</text>
  <rect x="40" y="170" width="180" height="220" fill="#94a3b8" rx="8"/>
  <text x="130" y="290" text-anchor="middle" fill="#0f172a" font-family="sans-serif" font-size="14">[Photo]</text>
  <g font-family="sans-serif" fill="#0f172a">
    <text x="250" y="200" font-size="14" fill="#64748b">Name / नाम</text>
    <text x="250" y="226" font-size="22" font-weight="700">${esc(a.applicant_name ?? "")}</text>
    <text x="250" y="266" font-size="14" fill="#64748b">DOB / जन्म तिथि</text>
    <text x="250" y="290" font-size="18">${esc(a.dob ?? "")}</text>
    <text x="500" y="266" font-size="14" fill="#64748b">Gender / लिंग</text>
    <text x="500" y="290" font-size="18">${esc(a.gender ?? "")}</text>
    <text x="250" y="330" font-size="14" fill="#64748b">S/O · W/O</text>
    <text x="250" y="354" font-size="16">${esc(a.father_or_husband_name ?? "")}</text>
    <text x="40" y="430" font-size="14" fill="#64748b">Address / पता</text>
    <text x="40" y="454" font-size="16">${esc(a.address_complete ?? "")}</text>
  </g>
  <rect x="40" y="480" width="820" height="56" fill="#0f172a" rx="10"/>
  <text x="60" y="518" fill="#fde68a" font-family="monospace" font-size="34" letter-spacing="6">${esc(a.uid_number ?? "")}</text>
  <text x="860" y="546" text-anchor="end" fill="#475569" font-family="sans-serif" font-size="11">DEMO / SAMPLE — NOT A REAL AADHAAR</text>
</svg>`;
}

export function rationCardSvg(f: SampleFixture): string {
  const r = f.docs.find((d) => d.kind === "ration")?.fields ?? {};
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <rect width="900" height="560" fill="#ecfdf5" rx="24"/>
  <rect x="20" y="20" width="860" height="70" fill="#065f46" rx="12"/>
  <text x="40" y="65" fill="#ecfdf5" font-family="serif" font-size="28" font-weight="700">Department of Food &amp; Public Distribution — Ration Card</text>
  <g font-family="sans-serif" fill="#064e3b">
    <text x="40" y="140" font-size="14" fill="#047857">Card No.</text>
    <text x="40" y="170" font-size="26" font-weight="700">${esc(r.card_number ?? "")}</text>
    <text x="500" y="140" font-size="14" fill="#047857">Category</text>
    <text x="500" y="170" font-size="26" font-weight="700">${esc(r.card_type ?? "")}</text>
    <text x="40" y="220" font-size="14" fill="#047857">Head of family</text>
    <text x="40" y="248" font-size="20">${esc(r.head_of_family ?? "")}</text>
    <text x="500" y="220" font-size="14" fill="#047857">Members</text>
    <text x="500" y="248" font-size="20">${esc(r.members ?? "")}</text>
    <text x="40" y="300" font-size="14" fill="#047857">Address</text>
    <text x="40" y="328" font-size="18">${esc(r.address ?? "")}</text>
  </g>
  <text x="860" y="540" text-anchor="end" fill="#475569" font-family="sans-serif" font-size="11">DEMO / SAMPLE — NOT A REAL RATION CARD</text>
</svg>`;
}

export function incomeCertSvg(f: SampleFixture): string {
  const i = f.docs.find((d) => d.kind === "income")?.fields ?? {};
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
  <rect width="900" height="600" fill="#fef2f2" rx="24"/>
  <rect x="20" y="20" width="860" height="70" fill="#7f1d1d" rx="12"/>
  <text x="40" y="65" fill="#fef2f2" font-family="serif" font-size="26" font-weight="700">Income Certificate · आय प्रमाण पत्र</text>
  <g font-family="sans-serif" fill="#7f1d1d">
    <text x="40" y="140" font-size="14" fill="#991b1b">Certificate No.</text>
    <text x="40" y="168" font-size="22" font-weight="700">${esc(i.certificate_number ?? "")}</text>
    <text x="500" y="140" font-size="14" fill="#991b1b">Issue date</text>
    <text x="500" y="168" font-size="22">${esc(i.issue_date ?? "")}</text>
    <text x="40" y="230" font-size="14" fill="#991b1b">Applicant</text>
    <text x="40" y="258" font-size="22" font-weight="700">${esc(i.applicant_name ?? "")}</text>
    <text x="40" y="320" font-size="14" fill="#991b1b">Annual income (INR)</text>
    <text x="40" y="356" font-size="32" font-weight="800">₹ ${esc(Number(i.annual_income ?? 0).toLocaleString("en-IN"))}</text>
    <text x="40" y="440" font-size="14" fill="#991b1b">Issued by</text>
    <text x="40" y="466" font-size="18">${esc(i.issuing_authority ?? "")}</text>
  </g>
  <text x="860" y="580" text-anchor="end" fill="#475569" font-family="sans-serif" font-size="11">DEMO / SAMPLE — NOT A REAL CERTIFICATE</text>
</svg>`;
}

export function cardSvgFor(kind: "aadhaar" | "ration" | "income", f: SampleFixture): string {
  if (kind === "aadhaar") return aadhaarCardSvg(f);
  if (kind === "ration") return rationCardSvg(f);
  return incomeCertSvg(f);
}
