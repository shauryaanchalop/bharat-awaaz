// Stateful agent loop. Nodes: router -> gather -> propose-fill (HITL pause) -> fill_pdf
// plus draft_grievance (deferred submit) and file_grievance (live submit).

import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "../ai-gateway.server";
import {
  emit,
  getOrCreateSession,
  updateSession,
  waitForResume,
  type AgentState,
  type FieldProposal,
  type GrievanceDraft,
} from "./state";
import { searchSchemes } from "../myscheme/client.server";
import { fileGrievance, isOutOfPurview } from "../cpgrams/client.server";
import { fillTemplate, generateDemoTemplate } from "../pdf/fill.server";
import { maskAadhaar } from "../privacy/aadhaar-mask";
import { runTranslateTts } from "../bhashini/pipeline.server";
import { getTemplate, autoMapTemplate, TEMPLATES } from "../pdf/templates";

const SYSTEM = `You are Bharat-Awaaz, a voice-first assistant for Indian citizens accessing government welfare.
You help with FOUR things:
1. Discover government schemes (use search_schemes).
2. Read uploaded documents (they arrive automatically and update agent state).
3. Fill official PDF application forms: pick a template with set_template, then propose_form_fill (pauses for human validation), then fill_pdf.
4. Draft & file CPGRAMS grievances: use draft_grievance to build a payload for the user to review; only call file_grievance directly when the user explicitly asks to send now.

Available templates: ${TEMPLATES.map((t) => `${t.id} (${t.name})`).join("; ")}

RULES:
- Be brief and warm. Single question at a time.
- Plain language. Translate jargon.
- ALWAYS propose_form_fill before fill_pdf so the user can audit.
- Prefer draft_grievance over file_grievance — drafts auto-resend once API keys land.
- Refuse: religious matters, RTI, subjudice cases.
- Max 2 short sentences per reply.`;

async function speak(state: AgentState, englishText: string) {
  state.conversation.push({ role: "assistant", text: englishText, ts: Date.now() });
  try {
    const tts = await runTranslateTts(englishText, state.language);
    if (tts?.audioBase64) {
      const audioUrl = `data:audio/wav;base64,${tts.audioBase64}`;
      emit(state.sessionId, { type: "say", text: tts.translatedText, lang: state.language, audioUrl });
      return;
    }
  } catch (err) {
    console.warn("TTS failed", err);
  }
  emit(state.sessionId, { type: "say", text: englishText, lang: "en" });
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
        "Find government schemes for the user. Call after at least gender + (age OR residence_type) is known.",
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

    set_template: tool({
      description: "Select which government PDF template to fill. Use one of the registered template IDs.",
      inputSchema: z.object({ templateId: z.string() }),
      execute: async ({ templateId }) => {
        const tpl = getTemplate(templateId);
        if (!tpl) return { ok: false, error: `Unknown template ${templateId}` };
        updateSession(sessionId, (s) => {
          s.selectedTemplateId = templateId;
        });
        return { ok: true, template: { id: tpl.id, name: tpl.name, fields: tpl.fields.map((f) => f.key) } };
      },
    }),

    propose_form_fill: tool({
      description:
        "Auto-map extracted documents + demographics into the chosen template, surface per-field confidence, and pause for the user to edit/confirm. Returns the confirmed values.",
      inputSchema: z.object({
        templateId: z.string(),
        userOverrides: z.record(z.string(), z.string()).optional(),
      }),
      execute: async ({ templateId, userOverrides }) => {
        const tpl = getTemplate(templateId);
        if (!tpl) return { ok: false, error: `Unknown template ${templateId}` };
        const proposed: FieldProposal[] = autoMapTemplate(
          tpl,
          state.documents,
          state.demographics as Record<string, unknown>,
          userOverrides ?? {},
        );
        const validationId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        // mask UIDs for the SSE payload (state keeps cleartext for PDF write)
        const safeProposed = proposed.map((p) => ({
          ...p,
          value: /uid|aadhaar/i.test(p.key) ? maskAadhaar(p.value) : p.value,
        }));
        updateSession(sessionId, (s) => {
          s.selectedTemplateId = templateId;
          s.pendingValidation = { id: validationId, templateId, proposed, resumeTo: "fill_pdf" };
          s.status = "awaiting_validation";
        });
        emit(sessionId, {
          type: "awaiting_validation",
          id: validationId,
          templateId,
          proposed: safeProposed,
          resumeTo: "fill_pdf",
        });
        const confirmed = (await waitForResume(sessionId, validationId)) as {
          fields: Record<string, string>;
          changes: { field: string; from: string; to: string }[];
        };
        updateSession(sessionId, (s) => {
          s.pendingValidation = undefined;
          s.status = "thinking";
          s.validationHistory.push({
            id: validationId,
            templateId,
            proposedAt: Date.now(),
            confirmedAt: Date.now(),
            proposed,
            final: confirmed.fields,
            changes: confirmed.changes ?? [],
          });
        });
        return { ok: true, confirmed: confirmed.fields, edits: confirmed.changes?.length ?? 0 };
      },
    }),

    fill_pdf: tool({
      description: "Generate the filled PDF after human validation. Returns a downloadable URL.",
      inputSchema: z.object({
        templateId: z.string(),
        fields: z.record(z.string(), z.string()),
      }),
      execute: async ({ templateId, fields }) => {
        const tpl = getTemplate(templateId);
        const title = tpl ? `${tpl.name} — Application` : `Application: ${templateId.toUpperCase()}`;
        const fieldNames = tpl ? tpl.fields.map((f) => f.key) : Object.keys(fields);
        const template = await generateDemoTemplate(title, fieldNames);
        const filled = await fillTemplate(template, { text: fields, flatten: true });
        const b64 = Buffer.from(filled).toString("base64");
        const url = `data:application/pdf;base64,${b64}`;
        updateSession(sessionId, (s) => {
          s.filledPdfs.push({ templateId, url, at: Date.now() });
        });
        emit(sessionId, { type: "pdf_ready", url, templateId });
        return { ok: true, templateId };
      },
    }),

    draft_grievance: tool({
      description:
        "Build a CPGRAMS-ready grievance payload for the user to confirm. Does NOT submit. The draft auto-resends once CPGRAMS_API_KEY is configured.",
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
        const block = isOutOfPurview(payload.description);
        if (block) return { ok: false, error: `Out of CPGRAMS purview (${block}).` };
        const { validateCpgramsPayload } = await import("../cpgrams/schema");
        const validation = validateCpgramsPayload(payload);
        const draft: GrievanceDraft = {
          draftId: "gd_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          payload,
          status: validation.ok ? "ready" : "draft",
          createdAt: Date.now(),
          attempts: 0,
          validationIssues: validation.ok ? undefined : validation.issues,
        };
        updateSession(sessionId, (s) => s.grievanceDrafts.push(draft));
        emit(sessionId, { type: "grievance_draft", draft });
        return { ok: true, draftId: draft.draftId, validationOk: validation.ok, issues: validation.ok ? [] : validation.issues };
      },
    }),

    file_grievance: tool({
      description: "Immediately file a CPGRAMS grievance. Only use when the user explicitly asks to send now.",
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
eligible schemes: ${state.eligibleSchemes.length}
selected template: ${state.selectedTemplateId ?? "none"}
pending grievance drafts: ${state.grievanceDrafts.filter((d) => d.status !== "submitted").length}
language: ${state.language}

Respond and use tools as needed. Keep your reply under 2 short sentences.`,
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
