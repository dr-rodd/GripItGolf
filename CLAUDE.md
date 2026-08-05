# Green Dot Golf

Multi-trip golf platform: a group leader creates a trip, gets a shareable code, and the group gets live scoring, leaderboards, and teams. Forked from Donegal Masters (single-trip family app) — its scoring code is already in this repo (`app/scoring/`), being generalised with `trip_id` scoping. Its look is not the target: `STYLE_GUIDE.md` + `app/globals.css` are the current design system, no gold, emerald only.

## Who's building this

Big Dog — no coding background. Claude.ai handles design decisions; Claude Code (CC) handles execution. Plain language, no unexplained jargon. Prompts to CC: succinct, scoped to specific files, one chunk at a time — test between dependent steps.

## Tech stack

- Next.js 16 (App Router, TypeScript), Tailwind, Supabase (Postgres + RLS)
- Vercel project `grip-it-golf`, auto-deploys from `master` — no manual deploy step
- Repo: github.com/dr-rodd/GripItGolf · Supabase ref: `bnnnnuxoczzuipefhvms`

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...
ADMIN_PASSWORD=...           # server only, no NEXT_PUBLIC_ prefix
NEXT_PUBLIC_DONATION_URL=... # unset = support link vanishes entirely
```

## Reference docs — open only the one the task needs

Don't read these up front. Open the matching file when the task actually touches that area.

| Doc | Open it for |
|---|---|
| `docs/design-system.md` | Colours, type, the wordmark, header, landing animation, scoring symbols, motion |
| `docs/schema-and-scoring.md` | Table structure, the Stableford trigger, WHS handicap formula, player states, tee data |
| `docs/leaderboards.md` | Leaderboard model, legacy `formats` compatibility, custom points, matchplay draws, team scoring modes |
| `docs/features.md` | Admin overview, lead player email, returning-player cookie, support link, itinerary, trip lifecycle |
| `docs/testing-and-data.md` | The test suites, how much checking a change is worth, insertion order, background jobs |
| `docs/gotchas-and-debt.md` | Past incidents, refactor discipline, security debt, multi-year architecture note |

## Platform concept

- A **lead player** creates a trip — no account required, open access for now
- A **6-character alphanumeric trip code** is generated on creation (e.g. `GX7K2P`)
- Other players join by entering the trip code at `/join`
- All trip data is scoped by `trip_id` — no data leaks between trips
- No auth gate yet — trip code is the only access control

## Routing

| Route | Purpose |
|---|---|
| `/` | Landing — create or join a trip |
| `/join` | Enter trip code |
| `/trip/[tripCode]` | Trip hub |
| `/trip/[tripCode]/setup` | Formats, players, finalise/unlock |
| `/trip/[tripCode]/teams` | Team assignment |
| `/trip/[tripCode]/players` | Join / claim a player slot |
| `/trip/[tripCode]/course` | Round picker |
| `/trip/[tripCode]/course/[roundNumber]` | Live scoring |
| `/trip/[tripCode]/leaderboard` | Leaderboard tabs |
| `/dashboard` | Lead player's trip list (future — post auth) |
| `/dashboard/create` | Trip creation wizard |
| `/admin/trips` | Owner-only, unlinked, password-gated |

## Key files

| File | Purpose |
|---|---|
| `lib/leaderboards.ts` | Current leaderboard model |
| `lib/boardRows.ts` | Scores → leaderboard rows, per board |
| `lib/leaderboardsCompat.ts` / `lib/formats.ts` / `lib/tripSetupFlow.ts` | Reading old trips' stored settings — don't extend, only read |
| `lib/teamLimits.ts` | Team size rules, pairing wording |
| `lib/matchplayEntrants.ts` | Player/pairing shape and naming |
| `lib/itinerarySync.ts` / `lib/itineraryStore.ts` | Itinerary diff-and-write |
| `supabase/migrations/` | All schema changes, in order. **Migration 010 has a one-time backfill — never replay it.** |
| `config/site.ts` | Global platform branding |

## Stableford scoring (canonical — never restate or vary this elsewhere)

```
shots_received = FLOOR(handicap / 18) + (1 if stroke_index <= handicap % 18 else 0)
net_score = gross_score - shots_received
points = GREATEST(0, par + 2 - net_score)
```

Calculated by the Postgres trigger `trg_scores_stableford` on every insert/update to `scores`. Full detail (WHS playing-handicap formula, player states, tee data): `docs/schema-and-scoring.md`.

## Data insertion order

`trips` → `teams` → `players` → `courses` → `holes` → `rounds` → `round_handicaps` → `scores`

## CC Behaviour

- Act immediately on single-file, routine changes — no need to ask first.
- Pause and confirm first for anything multi-file, or touching schema/migrations: list what's about to change, then wait for a yes.
- Build in stages — test between dependent steps, don't chain too many changes at once.
- Commit and push directly to `master` — never a new branch.
- Never expose the service role key client-side.
- All queries must filter by `trip_id`.
- When changing a function's signature, grep every call site by function name (not by argument variable names) and check each by hand.
- Scale verification effort to the change's risk — table in `docs/testing-and-data.md`. `npm test`, typecheck and build are the floor for everything.
- Keep this file current — a decision made but not written here causes inconsistency across sessions.

## Terminal use — last resort only

Prefer built-in file/commit/push tools, the GitHub website, or a committed SQL migration file over a terminal command. If the terminal is genuinely the only option, explain what the command does before running it — never run one silently.
