# Bharat-Awaaz

> Speak once. Filed everywhere.  
> A voice-first AI grievance & welfare-scheme filing platform for every Indian, in every language.

---

## What is Bharat-Awaaz?

Bharat-Awaaz lets citizens **speak in their native Indian language** to file grievances on CPGRAMS and apply for welfare schemes — no forms, no typing, no digital literacy barrier required.

- **Voice-first** — Talk naturally; Bhashini ASR transcribes 13 Indian languages.
- **AI-guided** — A LangGraph agent extracts intent, auto-fills templates, and reads back confirmations.
- **Unified** — One flow for CPGRAMS grievances + MyScheme applications.
- **Kiosk-ready** — Same codebase runs on mobile, desktop, or unattended kiosk mode.
- **Audit-grade** — Immutable audit log, pipeline enforcement, real-time admin console.

---

## Live Demo

- **Published:** [bharat-awaaz.vercel.app](https://bharat-awaaz.vercel.app)

---

## Problem We Solve

| Challenge | Impact |
|---|---|
| 22 official languages, 2 government portals | Citizens struggle to navigate in their own language |
| CPGRAMS backlog ~20 lakh (2024) | ~40% rejected due to wrong category selection |
| Welfare scheme leakage | ~₹2 lakh crore unclaimed or lost to middlemen |
| Digital divide | Millions without smartphones or typing skills |
| No citizen audit trail | No visibility into where a complaint stands |

---

## How It Works

```
Citizen speaks (Hindi, Tamil, Bengali, etc.)
        ↓
  Bhashini ASR → Text
        ↓
  LangGraph Agent → Intent extraction
        ↓
  Auto-fill templates from versioned library
        ↓
  TTS reads back in native language → Confirm
        ↓
  Submit to CPGRAMS / MyScheme / PDF filler
```

**Admin console:** Real-time pipeline enforcement, optimistic UI with rollback, SSE/WebSocket updates, full audit history.

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Voice & Language (Bhashini ASR/MT/TTS) │
├─────────────────────────────────────────┤
│  Agent & Orchestration (LangGraph +     │
│  Lovable AI Gateway — Gemini/GPT-class) │
├─────────────────────────────────────────┤
│  Submission & Templates (CPGRAMS client,│
│  MyScheme API, PDF auto-fill)           │
├─────────────────────────────────────────┤
│  Data & Governance (Postgres + RLS,     │
│  SECURITY DEFINER RPCs, logical         │
│  replication for realtime updates)      │
└─────────────────────────────────────────┘
```

- **Edge-first:** TanStack Start on Cloudflare Workers.
- **Optimistic UI:** Instant feedback with server rollback on rejection.
- **Security:** Row-Level Security (RLS) everywhere, PII redaction, Aadhaar masking.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TanStack Start v1 + Vite 7 |
| Styling | Tailwind CSS v4 |
| Voice | Bhashini ULCA Pipeline API (13 Indian languages) |
| AI | Lovable AI Gateway (Gemini 2.5 / GPT-class) |
| Backend | Lovable Cloud (Postgres + Auth + Realtime) |
| PDF | pdf-lib |
| Animation | Framer Motion |
| Icons | Lucide React |
| Validation | Zod |

---

## Key Features

- **True voice-first** — No form required; entire flow by speech
- **13 Indian languages** via Bhashini
- **Unified CPGRAMS + MyScheme** filing
- **Kiosk-grade UX** — Works on same codebase for unattended booths
- **Production governance** — Pipeline enforcement, audit log, role-based access
- **Optimistic UI with rollback** — Instant updates, safe failures
- **Sovereign stack** — Built on India Stack, open government data
- **Accessibility by construction** — Screen-reader friendly, low-bandwidth mode

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-org/bharat-awaaz.git
cd bharat-awaaz

# Install dependencies
bun install

# Start dev server
bun run dev
```

The app runs at `http://localhost:8080`.

### Environment Variables

Create a `.env` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

---

## Project Structure

```
src/
  routes/           # TanStack file-based routes
  components/       # Reusable UI components
  hooks/            # Custom React hooks
  lib/              # Utilities, demo store, server functions
  integrations/     # Supabase client & auth middleware
  styles.css        # Tailwind v4 theme tokens
```

---

## References

- [CPGRAMS](https://pgportal.gov.in)
- [myScheme](https://myscheme.gov.in)
- [Bhashini](https://bhashini.gov.in)
- [DigiLocker](https://digilocker.gov.in)

---

## License

MIT — Built for Bharat.

> *"Every Indian, every language, one voice-away from their entitlement."*
