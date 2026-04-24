# GripItGolf

A multi-trip golf platform. Each trip is a self-contained competition with its own players, courses, rounds, and scoring. Built on the Donegal Masters codebase, generalised to support any number of trips created and managed by an organiser.

## Platform Concept

- An **organiser** creates a trip, defines the players, courses, and rounds
- **Players** are scoped to a trip — the same person can appear across multiple trips as separate records
- All scoring, leaderboards, and game logic is trip-scoped
- The home page lists available trips; each trip has its own isolated app experience

## Design Philosophy

Mobile-first. All UI code must be designed and optimised for mobile by default.

- Write styles for mobile first; use `sm:` / `md:` / `lg:` breakpoints only to enhance for larger screens
- Touch targets minimum 44px
- Layouts, spacing, and typography should feel native on a phone screen
- Mobile-only interactions (e.g. swipe) must have a desktop fallback

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS (mobile-first utility classes)
- **Database:** Supabase (PostgreSQL)
- **Supabase client:** `lib/supabase.ts` — import as `import { supabase } from '@/lib/supabase'`
- **Package manager:** npm

## URL Structure

| Route | Purpose |
|---|---|
| `/` | Home — lists all active trips |
| `/trips/[tripSlug]` | Trip landing page |
| `/trips/[tripSlug]/courses` | Course portal for the trip |
| `/trips/[tripSlug]/courses/[courseSlug]` | Live dashboard for a course/round |
| `/trips/[tripSlug]/leaderboard` | Trip leaderboard |

## Database Schema

### Core Tables

| Table | Description |
|---|---|
| `trips` | Top-level. Each trip has a `name`, `slug`, `status` (upcoming/active/completed), `start_date`, `end_date` |
| `teams` | Scoped to a `trip_id`. Has `name` and `color` (hex) |
| `players` | Scoped to a `trip_id`. Has `team_id`, `name`, `role` (dad/mum/child/player), `handicap` |
| `courses` | Scoped to a `trip_id`. Has `name`, `slug`, `location` |
| `holes` | 18 holes per course — `hole_number`, `par`, `stroke_index` |
| `rounds` | Links `round_number` to a `course_id` and `trip_id`. Has `status` (upcoming/active/completed) |
| `round_handicaps` | Snapshot of each player's `playing_handicap` per round — use this for scoring, not `players.handicap` |
| `scores` | One row per player/hole/round — `gross_score` and auto-calculated `stableford_points` |

### Live Scoring Tables

| Table | Description |
|---|---|
| `live_rounds` | Active scoring sessions per player/round. Includes `session_finalised_at` |
| `live_scores` | Hole-by-hole scores during active play, before finalisation |
| `live_player_locks` | Prevents multiple concurrent scoring sessions for same player/round |

### Views

| View | Description |
|---|---|
| `leaderboard_by_round` | Best stableford per hole per team per round, with `running_team_total` |
| `leaderboard_summary` | Total team points per round per trip, ordered by score |

### Key Constraints

- One score per player per hole per round (unique constraint)
- Each course played only once per trip
- `players.trip_id` must match `teams.trip_id` (enforced via FK chain)
- Composite players have `team_id = NULL` — always fetch in flat queries, not via nested PostgREST

## Stableford Scoring

Points calculated by PostgreSQL trigger `trg_scores_stableford` on every insert/update to `scores`.shots_received = FLOOR(playing_handicap / 18) + (1 if stroke_index <= playing_handicap % 18 else 0)
net_score      = gross_score - shots_received
points         = GREATEST(0, par + 2 - net_score)
NR = 0 Stableford points. Max nett per hole capped at score giving 0 points.

## Team Scoring

Team score per hole = best (highest) stableford points by any team member on that hole. Team leaderboard sums best-ball scores across all 18 holes.

## Player States (Live Scoring)

| State | Description |
|---|---|
| Available | Not in any active scorecard this session |
| Active | Assigned to an in-progress scorecard |
| Finalised | Scorecard completed and committed |

A player cannot be in more than one state. Finalised players cannot be reselected unless manually unfinalised via settings.

## App Architecture

### Key Features per Trip

- Course portal with green glow for active rounds, completed badges
- Live dashboard with active scorecard cards per player
- Score entry with left/right hole navigation
- Post-round summary with provisional edit mode
- Settings tab: void active rounds, unfinalise finalised rounds, finalise session

### Background Jobs

- Abandoned scorecard cleanup: Vercel cron route. Requires `CRON_SECRET`. Implemented as Supabase SQL migration + Next.js API route.

## Scoring Display Conventions

- Stableford: running total vs 2pts per hole baseline — show as +/- relative to baseline, higher is better
- Gross: score vs par at holes played — lower is better
- Nett: `course par + 36 - stableford points` for finalised rounds; scale baseline to holes completed for in-progress
- Colour: gold for better than baseline, green for better than par nett
- Avoid red as a score indicator — most amateur scores will be over par; use gold instead

## Design Principles

- Mobile-first, used by older users — large legible text, generous touch targets
- Key numbers (scores, points, positions) must be immediately readable at a glance
- Paper scorecard style for review screens: parchment cream background, ink-style symbols
- Score symbols: thick gold ring (eagle), thin gold ring (birdie), blank (par), thin brown rounded square (bogey), thick brown rounded square (double bogey+)
- Contributor cells in composite scorecard: filled rounded square background

## Site Config

Each trip's name and branding can be configured. Do not hardcode trip names in components — pull from the `trips` table or `config/site.ts` for global branding.

## Environment Variables
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...

Stored in `.env.local` (gitignored). Service role key must remain server-side only — never expose client-side.

## Key Files

| File | Purpose |
|---|---|
| `app/page.tsx` | Home — trip listing |
| `app/layout.tsx` | Root layout |
| `lib/supabase.ts` | Supabase client |
| `supabase/migrations/` | All schema migrations in order |
| `config/site.ts` | Global platform branding |

## Data Insertion Order

1. `trips`
2. `teams`
3. `players`
4. `courses`
5. `holes`
6. `rounds`
7. `round_handicaps`
8. `scores`

## Prompting Guidelines for Claude Code

- Prompts must be succinct — avoid over-specifying logic the codebase already handles
- Target specific files or components
- Avoid unnecessary token usage — no broad sitewide audits when a targeted fix will do
- Build in chunks with testing between dependent steps
- Prefer CLI/automated approaches over manual dashboard steps
- User is not a coder — prompts must be clear and copiable without modification

## Claude Code Behaviour

- Never ask for permission or confirmation before making changes — just do it
- Always push to remote at the end of every task without being asked

## Donegal Masters 2026 lessons — compliance status

| # | Rule | Status | Reference |
|---|------|--------|-----------|
| 1 | iOS: `translateX` inside `overflow-hidden` breaks tap hit-testing | ⚠️ TODO | `app/scoring/LiveScoringFlow.tsx:921` — `translateX` inside `overflow-x-hidden` div. Not `overflow-hidden` exactly but adjacent enough to revisit before iOS testing. |
| 2 | Leaderboard merges uncommitted `live_scores` + committed `scores` | ⚠️ TODO | `app/leaderboard/LeaderboardClient.tsx` queries `scores` table only. `live_scores` not merged. In-progress rounds show stale data until finalised. |
| 3 | Offline queue stamps `trip_id` at enqueue, not flush | N/A | Feature not built. No offline queue exists in this codebase. |
| 4 | WHS formula: `PH = HI × Slope/113 + (CR − Par)`, no 95%, no truncation | ✅ Compliant | Verified 2026-04-24. `calcPlayingHandicap` in `LiveScoringFlow.tsx`, `LiveClient.tsx`, `LeaderboardClient.tsx`. |
| 5 | Ladies tees applied on all courses, not just one | ✅ Fixed | commit `a320b53` + `be82e21` (2026-04-24). `ST_PATRICKS_COURSE_ID` gate removed from all 4 files; missed call site fixed. |
| 6 | Team scoring: best-2-of-3 per hole, not best-1 | ✅ Fixed | commit `a320b53` (2026-04-24). `teamRoundPts` and `bestPts` in `LeaderboardClient.tsx` now sort and slice top 2. |
| 7 | Scoring canonical rules: NR cap, Stableford formula, 2pts baseline display | ✅ Compliant | `shotsReceived` ✅ `calcStableford` (MAX(0, par+2−net)) ✅ `nrGross` (par+2+shots cap) ✅ `no_return` flag ✅ `stablefordRelative = total − holesCompleted×2` ✅ |
| 8 | Team re-assignment: 3-step null/place/restore to satisfy role-per-team constraint | N/A | Feature not built. No team re-assignment UI exists yet. |
| 9 | Silent mutation failures surfaced to user | ⚠️ TODO | `// TODO(error-handling)` comments added 2026-04-24 to 7 unchecked mutation sites across `LiveScoringFlow.tsx` and `LiveClient.tsx`. Full fix requires error destructuring + UI feedback. |
| 10 | `force-dynamic` on leaderboard pages (not `revalidate = 30`) | ✅ Fixed | Fixed 2026-04-24 — was missed in initial port from Donegal Masters. Both `app/leaderboard/page.tsx` and `app/leaderboard/individual/page.tsx`. |
| 11 | Tee auto-selection on fresh start (Blue/Slate men, Red/Claret women) | ⚠️ TODO | TODO comment placed 2026-04-24 at tee selector blocks in `LiveClient.tsx` (~line 399) and `LiveScoringFlow.tsx` (~line 752). |
| 12 | Session resume fetches fresh `round_handicaps` (not stale page-load prop) | ✅ Fixed | commit `0d7296c` (2026-04-24). `doResume()` fetches fresh; `effectiveRoundHandicaps` state unifies sources; `resolvePlayingHandicap()` logs fallback. |
| — | Next.js 16: dynamic route `params` must be awaited as a Promise | ✅ Compliant | Both dynamic routes use `const { x } = await params`: `app/scoring/[slug]/page.tsx:19`, `app/scorecard/[playerId]/page.tsx:16`. |

## Refactoring Discipline

### Signature changes (arity or argument order)

Never use `sed` with variable-name patterns to update call sites. On 2026-04-23 a call site in `LiveLeaderboardPanel` was missed when removing the third argument from `effectivePar` because the sed pattern matched `h` (a reduce callback parameter) but the missed line used `hole` (a find result). The function compiled; the wrong par was silently used for nett scoring.

Required procedure when changing a function signature:
1. `grep -rn 'functionName(' app/` — list every call site.
2. Read the list. Acknowledge it explicitly.
3. Edit each call site by hand or with a pattern that matches the function name only, not the argument variable names.
