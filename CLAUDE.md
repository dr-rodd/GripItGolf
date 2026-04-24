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
Vercel project: grip-it-golf (auto-deploys from master branch on GitHub)

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

## CC Behaviour

- Never ask for permission or confirmation — just do it
- Always commit and push directly to master — never create a new branch
- Vercel auto-deploys from master via GitHub integration — no manual deploy steps needed
- Never expose service role key client-side
- All queries must filter by `trip_id`

## Multi-year architecture (inherited from Donegal Masters 2026 archive work)

Every table holding tournament-instance data has an `edition_year` INTEGER NOT NULL column. A `tournament_config` table holds one row with `current_year`. All live-app queries filter by `current_year` via a `lib/getCurrentYear.ts` helper (5-minute cache, server-side only — never call from client). Client components receive currentYear as a prop threaded from the server component chain.

Year-scoped unique constraints: any uniqueness that was implicitly "one tournament" must be `(original_columns, edition_year)`. Examples from Donegal Masters: `teams.name`, `rounds.round_number`, `rounds.course_id`.

Archive routes live at `/past/[year]` and are strictly read-only — no .insert/.update/.upsert/.delete anywhere under that path, and reused components take a `readOnly` prop that short-circuits all write handlers and realtime subscriptions.

In GripItGolf's multi-tenant model, this pattern needs scoping per-trip: `edition_year` likely becomes something like `(trip_id, edition_year)` or just `trip_id` since each trip IS a tournament instance.

## Iron-clad rules from the live tournament

1. **iOS Safari stacking context gotcha.** A `transform: translateX(0)` animation on a slide container combined with `overflow-hidden` on the parent breaks tap hit-testing until the first scroll. Use `margin-left` transitions instead. Never use transform for horizontal slide animations inside an overflow-hidden parent.

2. **Live leaderboard must merge uncommitted scores.** During live scoring, the leaderboard must fetch `live_scores` (uncommitted) alongside `scores` (finalised) and merge in real time. Do not gate updates on "session finalised" — users want to see leaderboard movement while rounds are still in progress.

3. **Offline score queue: stamp at enqueue time, not flush time.** Rosapenna had poor connectivity. Scores are queued in localStorage with 15-second retry. The `trip_id` MUST be stamped when the score is enqueued, not when it's flushed. A score entered offline must remain scoped to the correct trip regardless of when it syncs.

4. **Handicap formula is full Golf Ireland WHS.** `PH = HI × Slope ÷ 113 + CR − Par`. No 95% allowance. Do NOT truncate HI before the slope multiplication. Fetch `round_handicaps` live alongside scores so PH doesn't show as 0 on live leaderboards.

5. **Ladies tees must apply across ALL courses, not just one.** Stableford triggers, `effectivePar`, and `effectiveSI` must pull gender-specific par and stroke index for every course. Never special-case one course.

6. **Team scoring is best-2-of-3 per hole.** Both the page leaderboard and the live panel. Not best-1. Apply consistently.

7. **Scoring logic canonical rules:**
   - Nett per hole = gross minus strokes received
   - Max nett capped at the score giving 0 Stableford points (one over par after handicap strokes)
   - NR = max score, 0 points
   - Stableford: 3pts birdie, 2pts net par, 1pt bogey, 0pts double bogey+
   - Display vs 2pts/hole baseline

8. **Unique constraint on role-per-team needs null-swap pattern.** Swapping a player between two teams fails if both teams already have a player in that role, because of `UNIQUE (team_id, role)`. Use a 3-step write: null out the source, place the new player, restore the displaced player to the source team. Single-transaction optimistic UI revert on any failure.

9. **Silent Supabase write failures must surface.** Always check the `error` field on Supabase mutations and revert optimistic UI + show a toast on failure. Never assume success.

10. **Leaderboard cache must be force-dynamic (no ISR) during live play.** 30-second ISR caches caused team changes to lag. Use `export const dynamic = 'force-dynamic'` on any page displaying live tournament state.

11. **Gender-specific tee auto-selection.** On player setup and session resume, auto-select Blue/Slate for men and Red/Claret for women. Don't make users do this manually — they'll forget and score against the wrong tees.

12. **Session resume must restore confirmed playing handicaps.** When a scoring session resumes after an interruption, the confirmed round_handicaps row must be restored to the UI. Writing new round_handicaps rows at session start, then failing to re-read them on resume, causes PH to display as zero.

## Next.js 16 gotcha

Dynamic route params and searchParams are now Promises. Server components must destructure via `const { x } = await params` — synchronous access returns 404s on all dynamic routes. Applies to every `[slug]`, `[id]`, `[tripCode]`, `[roundNumber]`, `[sessionId]` segment.

## Performance pattern (from scorecard modal work)

Sequential multi-query page navigations should be replaced with inline bottom-sheet modals that reuse already-fetched data. Instant UX, zero additional queries. Applied this to individual scorecards in Donegal Masters pre-trip and it was the single biggest UX improvement of the app.

## Security debt carried from Donegal Masters

`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` was exposed client-side in Donegal Masters. This is acceptable for a closed 12-person family tournament but is NOT acceptable for GripItGolf, which will be public and paid. Before any GripItGolf public launch:
- Move service role key server-side only
- Enable RLS on every tournament-instance table
- Duplicate all trip filters at the RLS layer (client filters alone are insufficient once the service role key is gone, since anon users query via anon key)

## Build discipline (carried from Donegal Masters sessions)

- Build in stages. Test between dependent steps. Never chain too many changes.
- Audit-before-modify: for any multi-file change, produce an audit list first, pause for confirmation, then apply.
- Prompts scoped to specific files. Avoid broad "audit the codebase" requests.
- Automated/CLI approaches preferred over manual dashboard steps.
- Decisions not written into CLAUDE.md cause inconsistency across sessions. Keep CLAUDE.md current.
