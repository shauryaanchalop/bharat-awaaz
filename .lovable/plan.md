
# Bharat-Awaaz Agentic Framework — TanStack Start Build

The original blueprint specifies Python/FastAPI/LangGraph/pypdf. Lovable runs on TanStack Start (TypeScript) on Cloudflare Workers, so I'll port the architecture to an equivalent TS stack with the **same behavior and pillars**. No mocks where APIs are reachable; graceful fallbacks where keys are unavailable.

## Stack mapping (blueprint → what I'll build)

| Blueprint | TanStack Start equivalent |
|---|---|
| FastAPI async + WebSockets | TanStack server routes + SSE (`/api/agent/stream`) |
| LangGraph stateful graph + `interrupt()` | AI SDK agent loop with tool-calling + an `awaiting_human_validation` state persisted per session, resumed via `/api/agent/resume` |
| Bhashini ULCA pipeline (ASR + NMT + TTS) | Server functions that POST to Bhashini config + compute endpoints; browser MediaRecorder for capture, `<audio>` for TTS playback |
| Qwen2.5-VL spatial KIE | Lovable AI Gateway with `google/gemini-3-flash-preview` (multimodal, schema-enforced JSON via AI SDK `Output.object`) — Qwen route added behind a feature flag if a DashScope/OpenRouter key is provided |
| pypdf AcroForm injection | `pdf-lib` (`form.getTextField().setText()`, `getCheckBox().check()`, `form.flatten()`) |
| API Setu / myScheme | Server function POSTing to myScheme Personalised Search endpoint |
| CPGRAMS | Server function with structured complaint payload; falls back to a queued "draft grievance" record when no API key is configured |
| LangGraph state persistence | In-memory `Map<sessionId, AgentState>` on the server (single-instance fine for hackathon demo) |

## User flow

1. User opens `/` → picks language (Hindi/Tamil/Bengali/etc.) → taps mic
2. Audio → Bhashini ASR+NMT → English text → agent
3. Agent decides: discover scheme | parse document | fill form | file grievance
4. For documents: user snaps photo → vision model returns strict JSON → merged into state
5. Agent keeps asking missing fields in user's language (Bhashini TTS plays response audio)
6. Before PDF generation: **HITL pause** — UI shows extracted fields, user confirms/edits → resume
7. PDF generated via pdf-lib, downloadable; or grievance submitted, registration ID read aloud

## Routes & files

```text
src/routes/
  index.tsx                       # Landing: language picker + "Start talking"
  app.tsx                         # Main agent UI (mic, transcript, doc upload, HITL panel, PDF preview)
  schemes.tsx                     # Eligibility results list
  grievance.tsx                   # Grievance status / registration IDs
  api/
    agent.stream.ts               # SSE: streams agent events (asr, thinking, tool_call, awaiting_validation, tts_url, done)
    agent.resume.ts               # POST: { sessionId, validatedFields } → resumes paused graph
    bhashini.asr.ts               # POST audio blob → { text, detectedLang }
    bhashini.tts.ts               # POST { text, lang } → audio bytes
    vision.extract.ts             # POST image → strict JSON (Aadhaar/ration/etc.)
    myscheme.search.ts            # POST demographics → eligible schemes
    cpgrams.file.ts               # POST complaint → registration ID
    pdf.fill.ts                   # POST { templateId, fields } → filled PDF bytes

src/lib/
  agent/
    state.ts                      # AgentState type, in-memory session store
    graph.ts                      # Orchestrator: nodes (router, gather, validate, synthesize, grievance)
    tools.ts                      # AI SDK tools wrapping each server function
    prompts.ts                    # System prompts per node
  bhashini/
    pipeline.server.ts            # ULCA config + compute calls
  vision/
    extract.server.ts             # Multimodal call with Output.object schema for Aadhaar/ration/income
  pdf/
    fill.server.ts                # pdf-lib utilities (text, checkbox NameObject equivalent, flatten, masking)
    templates/                    # Bundled blank PDFs (1-2 sample govt forms)
  myscheme/
    client.server.ts              # Personalised Search payload + fetch
  cpgrams/
    client.server.ts              # Structured complaint payload + fetch
  privacy/
    aadhaar-mask.ts               # Mask first 8 digits of UID before logging/display
  ai-gateway.server.ts            # Lovable AI Gateway helper (from knowledge)

src/components/
  MicRecorder.tsx                 # MediaRecorder → webm → POST
  AgentTranscript.tsx             # Streaming transcript with parts
  HitlValidationPanel.tsx         # Renders awaiting fields, edit/confirm → resume
  SchemeCard.tsx, DocPreview.tsx, GrievanceCard.tsx
```

## Agent state (TS port of LangGraph state)

```ts
type AgentState = {
  sessionId: string;
  language: string;                    // ISO code e.g. "hi"
  history: UIMessage[];
  demographics: Partial<Demographics>; // age, gender, income, residence, social_category, ...
  documents: ExtractedDoc[];           // each = { kind, fields, maskedPreviewUrl }
  targetForm?: { templateId: string; required: string[]; collected: Record<string,string> };
  eligibleSchemes?: Scheme[];
  pendingValidation?: { id: string; payload: Record<string,unknown>; resumeTo: string };
  grievances: { regId: string; status: string }[];
  status: "idle" | "thinking" | "awaiting_validation" | "done" | "error";
};
```

The "graph" is an AI SDK agent loop with `stopWhen: stepCountIs(50)` and tools:
`discoverSchemes`, `extractDocument`, `proposeFormFill` (triggers HITL), `fillPdf`, `fileGrievance`, `askUser`. `proposeFormFill` sets `pendingValidation` and returns a sentinel; the SSE stream emits `awaiting_validation`, and the next agent step only runs after `/api/agent/resume` writes the confirmed payload back into state.

## Bhashini integration

- `pipeline.server.ts` calls the ULCA config endpoint with `pipelineTasks: [asr, translation, tts]`, caches per-language service IDs.
- ASR route accepts the browser's webm/mp4 blob, base64-encodes it, POSTs to the compute endpoint, returns transcript + English translation.
- TTS route returns audio bytes for `<audio>` playback.
- Requires `BHASHINI_USER_ID` and `BHASHINI_API_KEY` (free tier) — I'll request these via `add_secret` after build mode.

## Vision (Qwen2.5-VL substitute)

Uses Lovable AI Gateway (`google/gemini-3-flash-preview`, multimodal-capable) with AI SDK `Output.object` enforcing schemas:

```ts
const AadhaarSchema = z.object({
  applicant_name: z.string(),
  uid_number: z.string().regex(/^\d{12}$/),
  dob: z.string().optional(),
  gender: z.enum(["M","F","O"]).optional(),
  address_complete: z.string(),
});
```

If user later supplies a real Qwen endpoint, swap provider with one line. Output is masked (first 8 UID digits) before logging or HITL display.

## PDF filling (pypdf substitute via pdf-lib)

```ts
const pdf = await PDFDocument.load(templateBytes);
const form = pdf.getForm();
for (const [name, value] of Object.entries(textFields)) {
  form.getTextField(name).setText(value);
}
for (const [name, on] of Object.entries(checkboxes)) {
  const cb = form.getCheckBox(name);
  on ? cb.check() : cb.uncheck();   // pdf-lib handles /V and /AS automatically
}
// For radio groups with non-standard export values:
form.getRadioGroup(groupName).select(exportValue);
form.flatten();                      // equivalent to pypdf flattening
```

Bundle 1–2 sample blank government PDFs under `src/lib/pdf/templates/` so the demo is end-to-end.

## myScheme & CPGRAMS

- `myscheme.search.ts` builds the Personalised Search JSON (gender, age, marital_status, residence_type, social_category, employment_status) and POSTs to API Setu. If no key, returns a curated static fallback for demo continuity (clearly labeled "demo data").
- `cpgrams.file.ts` posts a structured complaint and returns the registration ID; without credentials, persists a "draft grievance" and shows a stub ID with explanation.

## Security & privacy

- All keys live in server secrets; never `VITE_*`.
- Audio + images held in memory only; never written to disk.
- Aadhaar UID masked (`XXXXXXXX1234`) everywhere except the in-memory state used for PDF injection.
- Session store auto-evicts after 30 min idle.

## Out of scope (would need explicit follow-up)

- Real Python/LangGraph/pypdf services
- Production CPGRAMS access (government-restricted)
- Self-hosted Qwen2.5-VL GPU deployment
- Multi-instance session store (needs Durable Objects / DB)

## Secrets I'll request after you approve (in build mode)

`BHASHINI_USER_ID`, `BHASHINI_API_KEY`, `MYSCHEME_API_KEY` (optional), `CPGRAMS_API_KEY` (optional). `LOVABLE_API_KEY` for the vision/agent calls is auto-provisioned.

## Build order

1. Scaffold routes, agent state store, Lovable AI Gateway helper
2. Landing + language picker UI
3. Mic capture + Bhashini ASR/TTS routes (with mock fallback until keys arrive)
4. Vision extract route + Aadhaar/ration schemas + HITL panel
5. Agent loop + tools + SSE stream + resume endpoint
6. myScheme + scheme results UI
7. pdf-lib fill route + bundled template + download
8. CPGRAMS submission + status UI
9. Polish: Hindi-first copy, voice-first interactions, error toasts

Ready to switch to build mode?
