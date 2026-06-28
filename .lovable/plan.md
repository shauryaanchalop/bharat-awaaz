# Bharat-Awaaz: Hackathon Winning Pass

## Phase 1 — Audit & stabilize (no UI churn yet)

- Run security scan, fix any net-new findings
- Read `/app`, `/dashboard`, `/grievances`, `/admin` end-to-end; check for: SSR loaders calling protected fns, missing error boundaries, broken imports, stale routes
- Verify Bhashini ASR/TTS wiring now that keys are live (quick server-fn smoke test)
- Patch any runtime issues found

## Phase 2 — Design system: "Digital India Modern"

Replace current saffron/green tokens with:
- **Bg**: `#0A0A0A` (deep black) + `#0F0F0F` surfaces
- **Ink**: `#FAFAFA` primary, `#A1A1A1` muted
- **Saffron**: `#FF6B35` (CTAs, focus)
- **Green**: `#138808` (success, impact metrics)
- **Tricolor stripe accent** on hero/cards only — not whole page
- **Type**: Space Grotesk (display, geometric) + Inter (body) via `@fontsource`
- **Motion**: framer-motion — slow hero parallax, number count-up, mic pulse
- Glass cards with hairline borders, subtle saffron glow on hover

All tokens in `src/styles.css`; rip out hardcoded colors in routes.

## Phase 3 — UI redesign (the surfaces judges see)

1. **Landing (`/`)**: full-screen black hero, animated mic orb, live impact counters ("₹2.3Cr unlocked", "12,847 schemes matched"), 3-step "how it works" with isometric illustrations, language picker as pill row, sticky CTA
2. **`/app`**: split layout — left = agent chat with streaming bubbles, right = live "what I know about you" panel (demographics, docs, eligible schemes, draft grievances). Voice bar pinned bottom with waveform.
3. **`/dashboard`**: bento grid — schemes unlocked, ₹ value, grievances, family members, recent activity feed

## Phase 4 — Four wow features

### A. Voice-Only Kiosk Mode (`/kiosk`)
Full-screen, zero-text. Giant pulsing mic in center. Auto-listens, auto-speaks back via Bhashini TTS. Language detected from first utterance. Shows only large icon + transcript caption. Exit = long-press. For CSC/panchayat demo.

### B. Live Impact Dashboard (`/impact`)
Animated India map (SVG state outlines, no Mapbox key needed). Live aggregated stats from `grievances` + `templates` tables: filings by state, top schemes, ₹ unlocked (computed from scheme benefits). Public route, great judge slide.

### C. Eligibility AI Explainer
New tool in agent: `explain_eligibility(scheme_id)`. Gemini takes user demographics + scheme rules JSON → returns structured `{verdict: "eligible|partial|ineligible", reasons: [...], missing_docs: [...], confidence}`. Renders as expandable card under each scheme.

### D. Family/Household Profiles
New table `household_members` (name, relation, age, demographics jsonb). UI: profile switcher pill in /app header — "Self / Wife / Father / Daughter". Agent context swaps to active member. One account = whole family's schemes.

## Phase 5 — Demo polish

- Seed demo data migration: 3 sample household members, 5 grievances across states for impact map, sample audit trail
- Loading skeletons everywhere (no spinners)
- Add `<presenter-mode>` toggle in admin → bumps font sizes, hides debug panels
- Update landing meta tags + OG image for judging links

## Technical guardrails

- All new server logic: `createServerFn` (not edge functions)
- Kiosk + impact = public routes (no auth gate)
- Household members + eligibility = `_authenticated/` + RLS
- Impact aggregates via narrow `TO anon` SELECT policy on a view, NOT raw grievances table
- Don't touch existing CPGRAMS / template / audit code — proven stable, just restyle
- Framer Motion + @fontsource via `bun add`; no Google CDN links

## Out of scope (will mention but skip)

WhatsApp, DigiLocker, PWA/offline, IVR — skipped per your 2-feature ask getting overridden to 4 features. If time permits at end I'll add a "Roadmap" section on landing showing these as Coming Soon (sells the vision without building).

## Risk / time

~Big session. Phases 1+2+3 land guaranteed. Phase 4 features land in priority order A→B→C→D — I'll ship as many as fit cleanly without breaking the build. Phase 5 polish always lands last 10%.

Approve to start; I'll work straight through.
