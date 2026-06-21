// CPGRAMS structured complaint submission.
// Without a real key, calls throw a typed error so the draft stays pending
// in the queue and is auto-resent the moment CPGRAMS_API_KEY arrives.

import { validateCpgramsPayload } from "./schema";

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
  source: "cpgrams";
  acknowledgement: string;
};

export class CpgramsKeyMissingError extends Error {
  code = "CPGRAMS_KEY_MISSING" as const;
  constructor() {
    super("CPGRAMS_API_KEY not configured — draft kept pending in the auto-resend queue.");
  }
}

export class CpgramsTimeoutError extends Error {
  code = "CPGRAMS_TIMEOUT" as const;
  constructor() {
    super("CPGRAMS upstream timed out — draft re-queued for automatic retry.");
  }
}

export class CpgramsValidationError extends Error {
  code = "CPGRAMS_VALIDATION" as const;
  issues: { field: string; message: string }[];
  constructor(issues: { field: string; message: string }[]) {
    super("Payload failed strict CPGRAMS schema validation.");
    this.issues = issues;
  }
}

const ENDPOINT = process.env.CPGRAMS_API_URL ?? "https://pgportal.gov.in/api/grievance/lodge";

const DISALLOWED_KEYWORDS = ["subjudice", "subjudice court", "rti", "right to information", "religious"];

export function isOutOfPurview(description: string): string | null {
  const lower = (description ?? "").toLowerCase();
  for (const k of DISALLOWED_KEYWORDS) if (lower.includes(k)) return k;
  return null;
}

export function cpgramsConfigured() {
  return !!process.env.CPGRAMS_API_KEY;
}

export async function fileGrievance(payload: GrievancePayload, opts: { timeoutMs?: number } = {}): Promise<GrievanceResult> {
  const block = isOutOfPurview(payload.description);
  if (block) throw new Error(`Out of CPGRAMS purview ("${block}").`);

  const validation = validateCpgramsPayload(payload);
  if (!validation.ok) throw new CpgramsValidationError(validation.issues);

  const apiKey = process.env.CPGRAMS_API_KEY;
  if (!apiKey) throw new CpgramsKeyMissingError();

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(validation.data),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`CPGRAMS error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { registrationNumber?: string; regId?: string; message?: string };
    return {
      regId: data.registrationNumber ?? data.regId ?? "UNKNOWN",
      source: "cpgrams",
      acknowledgement: data.message ?? "Grievance registered with CPGRAMS.",
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new CpgramsTimeoutError();
    if (e instanceof Error && /aborted/i.test(e.message)) throw new CpgramsTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
