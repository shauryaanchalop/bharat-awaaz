// In-memory session state. Hackathon-grade — single-instance only.

export type Demographics = {
  name?: string;
  age?: number;
  gender?: "male" | "female" | "other";
  marital_status?: "single" | "married" | "widowed" | "divorced";
  residence_type?: "urban" | "rural";
  social_category?: "general" | "obc" | "sc" | "st";
  employment_status?: "employed" | "unemployed" | "self-employed" | "student" | "retired";
  income_annual?: number;
  state?: string;
  district?: string;
  occupation?: string;
};

export type ExtractedDoc = {
  id: string;
  kind: "aadhaar" | "ration" | "income" | "other";
  fields: Record<string, string>;
  extractedAt: number;
};

export type FieldProposal = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
  required: boolean;
};

export type ValidationRecord = {
  id: string;
  templateId: string;
  proposedAt: number;
  confirmedAt?: number;
  proposed: FieldProposal[];
  final: Record<string, string>;
  changes: { field: string; from: string; to: string }[];
};

export type GrievanceDraft = {
  draftId: string;
  payload: {
    applicant_name: string;
    ministry_or_department: string;
    subject: string;
    description: string;
    previous_application_id?: string;
    state?: string;
    district?: string;
    contact_phone?: string;
    contact_email?: string;
  };
  status: "draft" | "ready" | "pending_key" | "submitted" | "failed";
  regId?: string;
  createdAt: number;
  submittedAt?: number;
  lastError?: string;
  attempts: number;
  lastAttemptAt?: number;
  validationIssues?: { field: string; message: string }[];
};

export type CustomTemplateField = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
  source?: "aadhaar" | "ration" | "income" | "demographics" | "user";
};

export type CustomTemplate = {
  id: string;
  name: string;
  ministry: string;
  scheme: string;
  fields: CustomTemplateField[];
  createdAt: number;
};

export type AgentEvent =
  | { type: "asr"; text: string; lang: string }
  | { type: "thinking" }
  | { type: "say"; text: string; lang: string; audioUrl?: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "schemes"; schemes: Scheme[] }
  | { type: "document"; doc: ExtractedDoc }
  | {
      type: "awaiting_validation";
      id: string;
      templateId: string;
      proposed: FieldProposal[];
      resumeTo: string;
    }
  | { type: "pdf_ready"; url: string; templateId: string }
  | { type: "grievance_draft"; draft: GrievanceDraft }
  | { type: "grievance_filed"; regId: string; draftId?: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type Scheme = {
  id: string;
  name: string;
  ministry: string;
  benefits: string;
  eligibility_match: string;
  documents_required: string[];
  apply_url?: string;
};

export type AgentState = {
  sessionId: string;
  language: string;
  demographics: Demographics;
  documents: ExtractedDoc[];
  eligibleSchemes: Scheme[];
  selectedTemplateId?: string;
  pendingValidation?: {
    id: string;
    templateId: string;
    proposed: FieldProposal[];
    resumeTo: string;
  };
  validationHistory: ValidationRecord[];
  grievances: { regId: string; subject: string; filedAt: number }[];
  grievanceDrafts: GrievanceDraft[];
  filledPdfs: { templateId: string; url: string; at: number }[];
  status: "idle" | "thinking" | "awaiting_validation" | "speaking" | "done" | "error";
  conversation: { role: "user" | "assistant"; text: string; ts: number }[];
  lastActive: number;
};

const SESSIONS = new Map<string, AgentState>();
const TTL_MS = 30 * 60 * 1000;

export function getOrCreateSession(sessionId: string, language = "en"): AgentState {
  evictStale();
  let s = SESSIONS.get(sessionId);
  if (!s) {
    s = {
      sessionId,
      language,
      demographics: {},
      documents: [],
      eligibleSchemes: [],
      validationHistory: [],
      grievances: [],
      grievanceDrafts: [],
      filledPdfs: [],
      status: "idle",
      conversation: [],
      lastActive: Date.now(),
    };
    SESSIONS.set(sessionId, s);
  }
  s.lastActive = Date.now();
  return s;
}

export function updateSession(sessionId: string, mutator: (s: AgentState) => void) {
  const s = getOrCreateSession(sessionId);
  mutator(s);
  s.lastActive = Date.now();
  return s;
}

export function getSession(sessionId: string): AgentState | undefined {
  return SESSIONS.get(sessionId);
}

function evictStale() {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of SESSIONS) {
    if (v.lastActive < cutoff) SESSIONS.delete(k);
  }
}

const LISTENERS = new Map<string, Set<(e: AgentEvent) => void>>();

export function subscribe(sessionId: string, cb: (e: AgentEvent) => void) {
  let set = LISTENERS.get(sessionId);
  if (!set) {
    set = new Set();
    LISTENERS.set(sessionId, set);
  }
  set.add(cb);
  return () => set!.delete(cb);
}

export function emit(sessionId: string, event: AgentEvent) {
  const set = LISTENERS.get(sessionId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(event);
    } catch {
      // ignore
    }
  }
}

const RESUME_WAITERS = new Map<string, (payload: Record<string, unknown>) => void>();

export function waitForResume(sessionId: string, validationId: string) {
  return new Promise<Record<string, unknown>>((resolve) => {
    RESUME_WAITERS.set(`${sessionId}:${validationId}`, resolve);
  });
}

export function resolveResume(sessionId: string, validationId: string, payload: Record<string, unknown>) {
  const key = `${sessionId}:${validationId}`;
  const w = RESUME_WAITERS.get(key);
  if (w) {
    RESUME_WAITERS.delete(key);
    w(payload);
    return true;
  }
  return false;
}
