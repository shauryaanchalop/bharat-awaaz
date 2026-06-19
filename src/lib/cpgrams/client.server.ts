// CPGRAMS structured complaint submission.
// Production access is government-restricted; without a real key we draft and
// return a clearly-marked stub registration ID for demo purposes.

export type GrievancePayload = {
  applicant_name: string;
  contact_phone?: string;
  contact_email?: string;
  state?: string;
  district?: string;
  ministry_or_department: string;
  subject: string;
  description: string;
  previous_application_id?: string;
};

export type GrievanceResult = {
  regId: string;
  source: "cpgrams" | "draft";
  acknowledgement: string;
};

const ENDPOINT = process.env.CPGRAMS_API_URL ?? "https://pgportal.gov.in/api/grievance/lodge";

const DISALLOWED_KEYWORDS = [
  "subjudice",
  "subjudice court",
  "rti",
  "right to information",
  "religious",
];

export function isOutOfPurview(description: string): string | null {
  const lower = description.toLowerCase();
  for (const k of DISALLOWED_KEYWORDS) if (lower.includes(k)) return k;
  return null;
}

export async function fileGrievance(payload: GrievancePayload): Promise<GrievanceResult> {
  const block = isOutOfPurview(payload.description);
  if (block) {
    throw new Error(
      `This grievance topic ("${block}") falls outside the CPGRAMS purview and cannot be filed through this channel.`,
    );
  }

  const apiKey = process.env.CPGRAMS_API_KEY;
  if (!apiKey) {
    // Draft mode — generate a deterministic-looking stub id.
    const stub = "DRAFT/" + Date.now().toString(36).toUpperCase() + "/" + Math.random().toString(36).slice(2, 6).toUpperCase();
    return {
      regId: stub,
      source: "draft",
      acknowledgement:
        "Grievance drafted locally. Connect CPGRAMS_API_KEY to file with the live national portal.",
    };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`CPGRAMS error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { registrationNumber?: string; regId?: string; message?: string };
  return {
    regId: data.registrationNumber ?? data.regId ?? "UNKNOWN",
    source: "cpgrams",
    acknowledgement: data.message ?? "Grievance registered with CPGRAMS.",
  };
}
