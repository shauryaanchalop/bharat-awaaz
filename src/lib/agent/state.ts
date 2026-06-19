// In-memory session state. Hackathon-grade — single-instance only.
// For production, swap for Durable Objects or DB-backed storage.

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

export type AgentEvent =
  | { type: "asr"; text: string; lang: string }
  | { type: "thinking" }
  | { type: "say"; text: string; lang: string; audioUrl?: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "schemes"; schemes: Scheme[] }
  | { type: "document"; doc: ExtractedDoc }
  | { type: "awaiting_validation"; id: string; payload: Record<string, unknown>; resumeTo: string }
  | { type: "pdf_ready"; url: string; templateId: string }
  | { type: "grievance_filed"; regId: string }
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
  language: string; // ISO-639-1
  demographics: Demographics;
  documents: ExtractedDoc[];
  eligibleSchemes: Scheme[];
  targetForm?: {
    templateId: string;
    collected: Record<string, string>;
  };
  pendingValidation?: {
    id: string;
    payload: Record<string, unknown>;
    resumeTo: string;
  };
  grievances: { regId: string; subject: string; filedAt: number }[];
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
      grievances: [],
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

/** Per-session SSE listeners. */
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
      // ignore listener errors
    }
  }
}

/** Resume gate: graph awaits this promise after emitting awaiting_validation. */
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
