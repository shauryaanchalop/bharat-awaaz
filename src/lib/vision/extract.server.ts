// Spatial document understanding via multimodal LLM.
// Blueprint specifies Qwen2.5-VL; we use Lovable AI Gateway (Gemini multimodal)
// with strict JSON schema enforcement. Same architectural pattern.

import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "../ai-gateway.server";

export const AadhaarSchema = z.object({
  applicant_name: z.string().describe("Full name printed on the Aadhaar card"),
  uid_number: z.string().describe("12-digit Aadhaar number (digits only)"),
  dob: z.string().optional().describe("Date of birth as printed, DD/MM/YYYY or YYYY"),
  gender: z.enum(["male", "female", "other"]).optional(),
  address_complete: z.string().optional().describe("Full address joined into one line"),
  father_or_husband_name: z.string().optional(),
});

export const RationSchema = z.object({
  card_number: z.string(),
  head_of_family: z.string(),
  card_type: z.enum(["APL", "BPL", "AAY", "PHH", "other"]).optional(),
  members: z.number().optional(),
  address: z.string().optional(),
});

export const IncomeSchema = z.object({
  applicant_name: z.string(),
  annual_income: z.number().describe("Annual income in INR"),
  issuing_authority: z.string().optional(),
  certificate_number: z.string().optional(),
  issue_date: z.string().optional(),
});

export const GenericSchema = z.object({
  document_kind_guess: z.string(),
  key_fields: z.record(z.string(), z.string()).describe("Best-effort key/value extraction"),
});

export type DocKind = "aadhaar" | "ration" | "income" | "other";

const SYSTEM_PROMPT = `You are a spatial document understanding model for Indian government documents.
You read photographs of physical documents (Aadhaar cards, ration cards, income certificates, etc.) which may be:
- skewed, rotated, or poorly lit
- partially faded or watermarked
- printed in English, Hindi, or other Indic scripts (mixed is common)
Use spatial reasoning to associate labels with their values. Return strict JSON matching the schema.
For Aadhaar: extract the 12-digit UID as digits only (no spaces). Ignore VID, enrollment numbers, and barcodes.
If a field is unreadable, omit it rather than guessing. Never fabricate digits.`;

export async function extractDocument(kind: DocKind, imageBase64: string, mimeType = "image/jpeg") {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const schema = kind === "aadhaar" ? AadhaarSchema : kind === "ration" ? RationSchema : kind === "income" ? IncomeSchema : GenericSchema;
  const promptText =
    kind === "aadhaar"
      ? "Extract the applicant's identity details from this Aadhaar card."
      : kind === "ration"
        ? "Extract ration card details."
        : kind === "income"
          ? "Extract income certificate details."
          : "Identify this document and extract its key fields.";

  const { object } = await generateObject({
    model,
    system: SYSTEM_PROMPT,
    schema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText },
          { type: "image", image: `data:${mimeType};base64,${imageBase64}` } as never,
        ] as never,
      },
    ],
  });
  return object as Record<string, unknown>;
}
