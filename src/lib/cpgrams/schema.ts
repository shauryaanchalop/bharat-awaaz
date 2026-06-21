// Strict CPGRAMS payload validation. Mirrors known pgportal field constraints
// so we can fail fast in the UI before round-tripping to the live endpoint.

import { z } from "zod";

const NAME_RE = /^[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F\s.'-]{1,99}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const PIN_OR_ID_RE = /^[A-Za-z0-9\/-]{3,40}$/;

export const CpgramsSchema = z.object({
  applicant_name: z
    .string()
    .trim()
    .min(3, "Applicant name must be at least 3 characters.")
    .max(100, "Applicant name must be under 100 characters.")
    .regex(NAME_RE, "Name may only contain letters, spaces, dots, hyphens, apostrophes."),

  ministry_or_department: z
    .string()
    .trim()
    .min(3, "Ministry / department is required.")
    .max(120, "Ministry / department must be under 120 characters."),

  subject: z
    .string()
    .trim()
    .min(10, "Subject must be at least 10 characters.")
    .max(200, "Subject must be under 200 characters."),

  description: z
    .string()
    .trim()
    .min(30, "Description must be at least 30 characters (CPGRAMS rejects short complaints).")
    .max(3000, "Description must be under 3000 characters."),

  previous_application_id: z
    .string()
    .trim()
    .regex(PIN_OR_ID_RE, "Previous application ID may only contain letters, digits, '/', '-'.")
    .optional()
    .or(z.literal("")),

  state: z.string().trim().max(60).optional().or(z.literal("")),
  district: z.string().trim().max(60).optional().or(z.literal("")),

  contact_phone: z
    .string()
    .trim()
    .regex(PHONE_RE, "Must be a 10-digit Indian mobile number starting 6/7/8/9.")
    .optional()
    .or(z.literal("")),

  contact_email: z.string().trim().email("Invalid email address.").max(120).optional().or(z.literal("")),
});

export type CpgramsPayload = z.infer<typeof CpgramsSchema>;

export type FieldIssue = { field: string; message: string };

export function validateCpgramsPayload(input: unknown): { ok: true; data: CpgramsPayload } | { ok: false; issues: FieldIssue[] } {
  const parsed = CpgramsSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues: FieldIssue[] = parsed.error.issues.map((i) => ({
    field: i.path.join(".") || "_root",
    message: i.message,
  }));
  return { ok: false, issues };
}
