// myScheme Personalised Search via API Setu.
// Docs: https://www.myscheme.gov.in/ + https://apisetu.gov.in/

import type { Demographics, Scheme } from "../agent/state";

const ENDPOINT = "https://api.myscheme.gov.in/search/v4/schemes";

type MySchemeApiResponse = {
  data?: {
    hits?: {
      items?: Array<{
        fields: {
          schemeShortTitle?: string;
          schemeName?: string;
          nodalMinistryName?: { preferred_name?: string } | string;
          briefDescription?: string;
          slug?: string;
          tags?: string[];
        };
      }>;
    };
  };
};

function buildFilters(d: Demographics): string[] {
  const f: string[] = [];
  if (d.gender) f.push(`gender:${d.gender}`);
  if (d.residence_type) f.push(`residence:${d.residence_type}`);
  if (d.social_category) f.push(`caste:${d.social_category}`);
  if (d.employment_status) f.push(`occupation:${d.employment_status}`);
  if (typeof d.age === "number") f.push(`age:${d.age}`);
  return f;
}

const FALLBACK_SCHEMES: Scheme[] = [
  {
    id: "pmkisan",
    name: "PM-KISAN Samman Nidhi",
    ministry: "Ministry of Agriculture & Farmers Welfare",
    benefits: "₹6,000/year direct cash transfer in three equal installments",
    eligibility_match: "Small and marginal landholding farmer families",
    documents_required: ["Aadhaar", "Land records", "Bank account"],
    apply_url: "https://pmkisan.gov.in/",
  },
  {
    id: "pmjay",
    name: "Ayushman Bharat — PM-JAY",
    ministry: "Ministry of Health & Family Welfare",
    benefits: "₹5 lakh per family per year for secondary & tertiary hospitalisation",
    eligibility_match: "SECC-listed deprived families and unorganised workers",
    documents_required: ["Aadhaar", "Ration card"],
    apply_url: "https://pmjay.gov.in/",
  },
  {
    id: "pmay-g",
    name: "Pradhan Mantri Awas Yojana (Gramin)",
    ministry: "Ministry of Rural Development",
    benefits: "Financial assistance up to ₹1.30 lakh for pucca house construction",
    eligibility_match: "Houseless / shelter-deprived rural households per SECC",
    documents_required: ["Aadhaar", "Job card (MGNREGA)", "Bank account"],
    apply_url: "https://pmayg.nic.in/",
  },
  {
    id: "pmuy",
    name: "Pradhan Mantri Ujjwala Yojana 2.0",
    ministry: "Ministry of Petroleum & Natural Gas",
    benefits: "Free LPG connection with first refill and stove",
    eligibility_match: "Adult women from BPL households without existing LPG connection",
    documents_required: ["Aadhaar", "Ration card", "Bank account"],
    apply_url: "https://www.pmuy.gov.in/",
  },
  {
    id: "nsap-iggppns",
    name: "Indira Gandhi National Old Age Pension Scheme",
    ministry: "Ministry of Rural Development",
    benefits: "Monthly pension of ₹200–₹500 for BPL elderly citizens",
    eligibility_match: "BPL citizens aged 60+",
    documents_required: ["Aadhaar", "Age proof", "BPL certificate"],
  },
];

function rankFallback(d: Demographics): Scheme[] {
  return FALLBACK_SCHEMES.filter((s) => {
    if (d.age && s.id === "nsap-iggppns" && d.age < 60) return false;
    if (d.residence_type === "urban" && s.id === "pmay-g") return false;
    return true;
  });
}

export async function searchSchemes(d: Demographics): Promise<{ schemes: Scheme[]; source: "myscheme" | "fallback" }> {
  const apiKey = process.env.MYSCHEME_API_KEY;
  const filters = buildFilters(d);

  if (!apiKey) {
    return { schemes: rankFallback(d), source: "fallback" };
  }

  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set("lang", "en");
    url.searchParams.set("q", "");
    url.searchParams.set("keyword", "");
    url.searchParams.set("sort", "");
    url.searchParams.set("from", "0");
    url.searchParams.set("size", "10");
    if (filters.length) url.searchParams.set("filter", filters.join(","));

    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`myScheme ${res.status}`);
    const json = (await res.json()) as MySchemeApiResponse;
    const items = json.data?.hits?.items ?? [];
    const schemes: Scheme[] = items.slice(0, 10).map((it, idx) => ({
      id: it.fields.slug ?? `scheme-${idx}`,
      name: it.fields.schemeName ?? it.fields.schemeShortTitle ?? "Unnamed scheme",
      ministry:
        typeof it.fields.nodalMinistryName === "string"
          ? it.fields.nodalMinistryName
          : (it.fields.nodalMinistryName?.preferred_name ?? "—"),
      benefits: it.fields.briefDescription ?? "",
      eligibility_match: (it.fields.tags ?? []).join(", "),
      documents_required: [],
      apply_url: it.fields.slug ? `https://www.myscheme.gov.in/schemes/${it.fields.slug}` : undefined,
    }));
    return { schemes: schemes.length ? schemes : rankFallback(d), source: schemes.length ? "myscheme" : "fallback" };
  } catch {
    return { schemes: rankFallback(d), source: "fallback" };
  }
}
