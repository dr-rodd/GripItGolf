# GripItGolf

A multi-trip golf platform. Any group leader creates a trip, gets a shareable code, and their group gets a full live scoring experience — courses, scorecards, leaderboards, teams.

Forked from Donegal Masters — a single-trip family golf app. This project converts it into a platform where anyone can run their own trip. The Donegal Masters UX is the gold standard for look and feel.

## Who is building this

Big Dog — not a coder. Uses Claude.ai for all design decisions and Claude Code (CC) for all execution. Never ask for confirmation before making changes. Always push to remote at the end of every task.

## Working approach

- Claude.ai leads design and clarifies requirements before any CC prompt is written
- CC prompts must be: succinct, robust, copiable, targeted to specific files or components
- Chunked sequential prompts preferred — test and deploy between dependent steps
- CLI and automated approaches preferred over manual dashboard steps
- No jargon without explanation
- Do not over-specify logic the codebase already handles
- User refers to Claude Code as "CC"

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS (mobile-first)
- **Database:** Supabase (PostgreSQL + RLS)
- **Hosting:** Vercel (Hobby)
- **Repo:** github.com/dr-rodd/GripItGolf (branch: master)
- **Supabase project ref:** bnnnnuxoczzuipefhvms
- **Package manager:** npm

## Environment variables
NEXT_PUBLIC_SUPABASE_URL=https://bnnnnuxoczzuipefhvms.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...

Stored in `.env.local` (gitignored). Service role key must never be exposed client-side.

## Design philosophy

Mobile-first. Used on the course, on phones, by non-technical users.

- All styles mobile-first; use `sm:` / `md:` / `lg:` only to enhance for larger screens
- Touch targets minimum 44px
- Large, legible text — key numbers must be readable at a glance
- Paper scorecard style for review screens: parchment cream background, ink-style symbols
- Avoid red as a score indicator — use gold instead
- Score symbols: thick gold ring (eagle), thin gold ring (birdie), blank (par), thin brown rounded square (bogey), thick brown rounded square (double bogey+)

## Platform concept

- A **lead player** creates a trip — no account required, open access for now
- A **6-character alphanumeric trip code** is generated on creation (e.g. `GX7K2P`)
- Other players join by entering the trip code at `/join`
- All trip data is scoped by `trip_id` — no data leaks between trips
- No auth gate yet — trip code is the only access control
- Auth (Supabase email/password) will be added later for trip management

## Routing

| Route | Purpose |
|---|---|
| `/` | Landing page — create or join a trip |
| `/join` | Enter trip code to join |
| `/trip/[tripCode]` | Trip home — course portal |
| `/trip/[tripCode]/course/[roundNumber]` | Course dashboard — live scoring |
| `/trip/[tripCode]/scorecard/[sessionId]` | Score entry |
| `/trip/[tripCode]/leaderboard` | Leaderboard |
| `/trip/[tripCode]/summary/[sessionId]` | Post-round summary |
| `/dashboard` | Lead player's trip list (future — post auth) |
| `/dashboard/create` | Trip creation wizard (future — post auth) |

## Database schema

### Core tables

| Table | Description |
|---|---|
| `trips` | Top-level. `name`, `slug`, `trip_code` (6-char unique), `status`, `competition_type`, `start_date`, `end_date`, `created_at` |
| `teams` | Scoped to `trip_id`. `name`, `color` (hex) |
| `players` | Scoped to `trip_id`. `team_id` (nullable), `name`, `role` (player), `handicap`, `is_lead` (boolean) |
| `courses` | Scoped to `trip_id`. `name`, `slug`, `location` |
| `holes` | 18 per course. `hole_number`, `par`, `stroke_index` |
| `rounds` | Scoped to `trip_id`. Links `round_number` to `course_id`. `status` (upcoming/active/completed) |
| `round_handicaps` | Snapshot of `playing_handicap` per player per round — use this for scoring, never `players.handicap` |
| `scores` | One row per player/hole/round. `gross_score`, auto-calculated `stableford_points` |

### Live scoring tables

| Table | Description |
|---|---|
| `live_rounds` | Active scoring sessions per player/round. `session_finalised_at` marks completion |
| `live_scores` | Hole-by-hole scores during active play, before finalisation |
| `live_player_locks` | Prevents concurrent scoring sessions for same player/round |

### Views

| View | Description |
|---|---|
| `leaderboard_by_round` | Best stableford per hole per team per round, with `running_team_total` |
| `leaderboard_summary` | Total team points per round per trip, ordered by score |

### Key constraints

- One score per player per hole per round
- Each course played only once per trip
- `players.trip_id` must match `teams.trip_id`
- Composite players have `team_id = NULL` — always fetch flat, never via nested PostgREST

## Stableford scoring (canonical — do not deviate)

Calculated by PostgreSQL trigger `trg_scores_stableford` on every insert/update to `scores`.
shots_received = FLOOR(handicap / 18) + (1 if stroke_index <= handicap % 18 else 0)
net_score      = gross_score - shots_received
points         = GREATEST(0, par + 2 - net_score)

- NR = 0 points
- Max nett capped at score giving 0 points (net double bogey)
- Leaderboard display: relative to 2pts/hole baseline. 36 points = "E", 38 = "+2"
- Team leaderboard: best individual stableford score per hole per team, summed across 18 holes

## Player states (live scoring)

| State | Description |
|---|---|
| Available | Not in any active scorecard this session |
| Active | Assigned to an in-progress scorecard |
| Finalised | Scorecard completed and committed |

One state at a time. Finalised players cannot be reselected unless manually unfinalised via settings.

## Competition formats

**Now:** Stableford Teams, Stableford Individual

**Future:** Match Play, Skins, Nassau, Best Ball, Scramble

The `competition_type` field on `trips` and a `settings` JSONB column support adding formats without schema changes.

## Key files

| File | Purpose |
|---|---|
| `app/page.tsx` | Landing page |
| `app/layout.tsx` | Root layout |
| `lib/supabase.ts` | Supabase client |
| `supabase/migrations/` | All schema migrations in order |
| `supabase/seed.sql` | Empty — trip data entered through the app |
| `config/site.ts` | Global platform branding |

## Data insertion order

1. `trips`
2. `teams`
3. `players`
4. `courses`
5. `holes`
6. `rounds`
7. `round_handicaps`
8. `scores`

## Background jobs

Abandoned scorecard cleanup: Vercel cron route. Requires `CRON_SECRET`. Implemented as Supabase SQL migration + Next.js API route.

## CC behaviour

- Never ask for permission or confirmation — just do it
- Always push to remote at the end of every task
- Never expose service role key client-side
- All queries must filter by `trip_id`
