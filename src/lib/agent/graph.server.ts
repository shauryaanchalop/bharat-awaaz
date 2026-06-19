// Stateful agent loop — TypeScript port of the LangGraph orchestrator.
// Nodes: router -> gather -> propose-fill (HITL pause) -> synthesize -> grievance
// Implements interrupt()/resume() via emit("awaiting_validation") + waitForResume().

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "../ai-gateway.server";
import {
  emit,
  getOrCreateSession,
  updateSession,
  waitForResume,
  type AgentState,
  type Scheme,
} from "./state";
import { searchSchemes } from "../myscheme/client.server";
import { fileGrievance } from "../cpgrams/client.server";
import { fillTemplate, generateDemoTemplate } from "../pdf/fill.server";
import { maskAadhaar } from "../privacy/aadhaar-mask";
import { runTranslateTts } from "../bhashini/pipeline.server";

const SYSTEM = `You are Bharat-Awaaz, a voice-first assistant for Indian citizens accessing government welfare.
You help with FOUR things:
1. Discover government schemes the user may be eligible for (use search_schemes).
2. Read uploaded documents (Aadhaar, ration, income certificate) — these arrive via the user's actions and update agent state automatically.
3. Fill official PDF application forms (use propose_form_fill, which pauses for human validation, then fill_pdf).
4. File grievances on CPGRAMS when applications are unjustly stalled (use file_grievance).

RULES:
- Be brief and warm. The user is often non-literate and on a low-end phone.
- Speak in plain language. Translate jargon.
- Ask ONE question at a time. Never bombard.
- Before generating any PDF, ALWAYS call propose_form_fill so the user can validate the data.
- Refuse to handle: religious matters, RTI requests, subjudice cases — gently redirect.
- All responses must be short (max 2 sentences) so they translate cleanly to the user's language.`;

async function speak(state: AgentState, englishText: string) {
  state.conversation.push({ role: "assistant", text: englishText, ts: Date.now() });
  let audioUrl: string | undefined;
  try {
    const tts = await runTranslateTts(englishText, state.language);
    if (tts?.audioBase64) {
      audioUrl = `data:audio/wav;base64,${tts.audioBase64}`;
      emit(state.sessionId, { type: "say", text: tts.translatedText, lang: state.language, audioUrl });
      return;
    }
  } catch (err) {
    console.warn("TTS failed", err);
  }
  emit(state.sessionId, { type: "say", text: englishText, lang: "en", audioUrl });
}

export async function runAgentTurn(sessionId: string, userEnglishText: string) {
  const state = getOrCreateSession(sessionId);
  state.conversation.push({ role: "user", text: userEnglishText, ts: Date.now() });
  state.status = "thinking";
  emit(sessionId, { type: "thinking" });

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    emit(sessionId, { type: "error", message: "AI gateway not configured." });
    return;
  }
  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const tools = {
    update_demographics: tool({
      description: "Record or update demographic facts about the user as they share them.",
      inputSchema: z.object({
        name: z.string().optional(),
        age: z.number().optional(),
        gender: z.enum(["male", "female", "other"]).optional(),
        marital_status: z.enum(["single", "married", "widowed", "divorced"]).optional(),
        residence_type: z.enum(["urban", "rural"]).optional(),
        social_category: z.enum(["general", "obc", "sc", "st"]).optional(),
        employment_status: z.enum(["employed", "unemployed", "self-employed", "student", "retired"]).optional(),
        income_annual: z.number().optional(),
        state: z.string().optional(),
        district: z.string().optional(),
        occupation: z.string().optional(),
      }),
      execute: async (patch) => {
        updateSession(sessionId, (s) => Object.assign(s.demographics, patch));
        return { ok: true, demographics: state.demographics };
      },
    }),

    search_schemes: tool({
      description:
        "Find government schemes the user may be eligible for, based on the demographics collected so far. Call only after you have at least gender + (age OR residence_type).",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await searchSchemes(state.demographics);
        updateSession(sessionId, (s) => {
          s.eligibleSchemes = result.schemes;
        });
        emit(sessionId, { type: "schemes", schemes: result.schemes });
        return {
          source: result.source,
          count: result.schemes.length,
          schemes: result.schemes.map((s) => ({ id: s.id, name: s.name, benefits: s.benefits })),
        };
      },
    }),

    propose_form_fill: tool({
      description:
        "Propose filled form values for human validation BEFORE generating the PDF. Pauses execution until the user confirms. Returns the user-confirmed payload.",
      inputSchema: z.object({
        templateId: z.string().describe("e.g. 'pmkisan' or 'pmuy' — used to look up the template"),
        fields: z.record(z.string(), z.string()).describe("field name -> value mapping"),
      }),
      execute: async ({ templateId, fields }) => {
        const validationId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        // Mask Aadhaar for the UI preview, keep cleartext in state.
        const maskedPayload: Record<string, unknown> = { templateId, fields: {} as Record<string, string> };
        for (const [k, v] of Object.entries(fields)) {
          (maskedPayload.fields as Record<string, string>)[k] = /aadhaar|uid/i.test(k) ? maskAadhaar(v) : v;
        }
        updateSession(sessionId, (s) => {
          s.pendingValidation = { id: validationId, payload: { templateId, fields }, resumeTo: "fill_pdf" };
          s.status = "awaiting_validation";
        });
        emit(sessionId, {
          type: "awaiting_validation",
          id: validationId,
          payload: maskedPayload,
          resumeTo: "fill_pdf",
        });
        const confirmed = await waitForResume(sessionId, validationId);
        updateSession(sessionId, (s) => {
          s.pendingValidation = undefined;
          s.status = "thinking";
        });
        return { confirmed };
      },
    }),

    fill_pdf: tool({
      description: "Generate the filled PDF after human validation. Returns a downloadable URL.",
      inputSchema: z.object({
        templateId: z.string(),
        fields: z.record(z.string(), z.string()),
      }),
      execute: async ({ templateId, fields }) => {
        const fieldNames = Object.keys(fields);
        const template = await generateDemoTemplate(`Application: ${templateId.toUpperCase()}`, fieldNames);
        const filled = await fillTemplate(template, { text: fields, flatten: true });
        const b64 = Buffer.from(filled).toString("base64");
        const url = `data:application/pdf;base64,${b64}`;
        emit(sessionId, { type: "pdf_ready", url, templateId });
        return { ok: true, templateId };
      },
    }),

    file_grievance: tool({
      description: "File a structured grievance with CPGRAMS. Use only when the user reports unjust rejection or stalled disbursement.",
      inputSchema: z.object({
        applicant_name: z.string(),
        ministry_or_department: z.string(),
        subject: z.string(),
        description: z.string(),
        previous_application_id: z.string().optional(),
        state: z.string().optional(),
        district: z.string().optional(),
        contact_phone: z.string().optional(),
      }),
      execute: async (payload) => {
        try {
          const result = await fileGrievance(payload);
          updateSession(sessionId, (s) => {
            s.grievances.push({ regId: result.regId, subject: payload.subject, filedAt: Date.now() });
          });
          emit(sessionId, { type: "grievance_filed", regId: result.regId });
          return result;
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };

  try {
    const historyMessages = state.conversation.slice(-12).map((c) => ({
      role: c.role,
      content: c.text,
    })) as { role: "user" | "assistant"; content: string }[];

    const result = await generateText({
      model,
      system: SYSTEM,
      messages: [
        ...historyMessages,
        {
          role: "user" as const,
          content: `Context (agent state):
demographics: ${JSON.stringify(state.demographics)}
documents on file: ${state.documents.map((d) => d.kind).join(", ") || "none"}
eligible schemes found: ${state.eligibleSchemes.length}
language: ${state.language}

Respond and use tools as needed. Keep your reply to the user under 2 short sentences.`,
        },
      ],
      tools,
      stopWhen: stepCountIs(50),
    });

    if (result.text?.trim()) {
      await speak(state, result.text.trim());
    }
    state.status = "idle";
    emit(sessionId, { type: "done" });
  } catch (err) {
    console.error("Agent error", err);
    state.status = "error";
    emit(sessionId, { type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
