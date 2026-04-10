# Donegal Masters

A golf tournament scoring app for a 3-round family competition at Rosapenna Resort, Co. Donegal.

## App Overview

- 12 players across 4 family teams (3 players each: 1 dad, 1 mum, 1 son)
- 3 rounds, one per course at Rosapenna Resort
- Hole-by-hole stableford scoring
- Team leaderboard based on best stableford score per hole per round

## Design Philosophy

This is a **mobile-first app**. All UI code must be designed and optimised for mobile by default.

- Write styles for mobile first; use `sm:` / `md:` / `lg:` breakpoints only to enhance for larger screens where it adds value
- Touch targets must be large enough for fingers (minimum 44px)
- Layouts, spacing, and typography should feel native on a phone screen
- The only time desktop-specific logic is needed is for interactions that are inherently mobile-only (e.g. swipe gestures) — in those cases, provide a desktop fallback

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS (mobile-first utility classes)
- **Database:** Supabase (PostgreSQL)
- **Supabase client:** `lib/supabase.ts` — import as `import { supabase } from '@/lib/supabase'`
- **Package manager:** npm

## Courses

| Round | Course |
|-------|--------|
| 1 | Old Tom Morris |
| 2 | St Patrick's Links |
| 3 | Sandy Hills |

## Players

| Category | Players (handicap) |
|----------|--------------------|
| Dads | John (11.9), Martin (14), Peter (18), Paul (14.6) |
| Mums | Aisling (21.1), Eithne (26), Liz (22), Gillian (24) |
| Sons | Ross (9.4), Matthew (5.1), Dave (3.3), Sam (12) |

Teams are pre-assigned before play (one from each category per team).

## Database Schema

### Tables (in schema.sql)

| Table | Description |
|-------|-------------|
| `teams` | 4 teams, each with a `name` and `color` (hex) |
| `players` | 12 players, each with `team_id`, `name`, `role` (dad/mum/child), `handicap` |
| `courses` | One row per course |
| `holes` | 18 holes per course — `hole_number`, `par`, `stroke_index` |
| `rounds` | Links `round_number` (1–3) to a `course_id`, has a `status` (upcoming/active/completed) |
| `round_handicaps` | Snapshot of each player's `playing_handicap` per round — use this for scoring, not `players.handicap` |
| `scores` | One row per player/hole/round — `gross_score` and auto-calculated `stableford_points` |

### Live Scoring Tables (in Supabase only, not in schema.sql)

These tables power the active scoring flow and exist only in the Supabase database:

| Table | Description |
|-------|-------------|
| `live_rounds` | Tracks active scoring sessions per player/round. Includes `session_finalised_at` (timestamptz) to mark when a session is finalised |
| `live_scores` | Hole-by-hole scores during active play, before finalisation |
| `live_player_locks` | Prevents multiple concurrent scoring sessions for the same player/round |

### Views

| View | Description |
|------|-------------|
| `leaderboard_by_round` | Best stableford score per hole per team per round, with `running_team_total` |
| `leaderboard_summary` | Total team points per round, ordered by score descending |

### Composite Player Notes

Composite players have `team_id = NULL`. PostgREST nested queries using `teams.select("players(...)")` will silently exclude composite players. Always fetch players in a flat query joined server-side when composite players need to be included.

### Key Constraints

- One dad, one mum, one son per team — dad/mum uniqueness enforced via partial unique indexes
- One score per player per hole per round (unique constraint)
- Each course played only once across the 3 rounds

## Stableford Scoring Rules

Points are calculated automatically by a PostgreSQL trigger (`trg_scores_stableford`) on every insert/update to `scores`.

**Formula:**
```
shots_received = FLOOR(playing_handicap / 18) + (1 if stroke_index <= playing_handicap % 18 else 0)
net_score      = gross_score - shots_received
points         = GREATEST(0, par + 2 - net_score)
```

**Points reference:**
| Result | Points |
|--------|--------|
| Albatross (3 under) | 5 |
| Eagle (2 under) | 4 |
| Birdie (1 under) | 3 |
| Par | 2 |
| Bogey (1 over) | 1 |
| Double bogey or worse | 0 |

**NR handling:** NR = max score for the hole = 0 Stableford points. Max nett per hole is capped at the score giving 0 points (i.e. one over par after handicap strokes applied).

**Nett total display:** `nett total = course par + 36 − Stableford points`. Leaderboard display uses a "vs 2pts/hole baseline" convention.

## Team Scoring

The team score for each hole is the **best (highest) stableford points** scored by any member of that team on that hole. The team leaderboard sums these best-ball scores across all 18 holes.

## App Architecture

### Page Structure

| Route | Purpose |
|-------|---------|
| `app/page.tsx` | Home page |
| Course portal page | Three course cards with green glow for active rounds, completed badges |
| Per-course dashboards | Live dashboards showing active scorecard cards |
| Score entry UI | Standalone tile component with left/right hole navigation |
| Post-round summary | Player tile navigation with provisional edit mode |

### Course Dashboard Features

- Active scorecard cards per player
- Settings tab with player state management (void active rounds, unfinalise finalised rounds)
- Finalise Session button (sets `session_finalised_at` on `live_rounds`)

### Background Jobs

- **Abandoned scorecard cleanup:** Vercel cron route that cleans up abandoned `live_rounds` entries. Requires `CRON_SECRET` env variable. Implemented as a Supabase SQL migration + Next.js API route.

## Data Insertion Order

When seeding, respect foreign key constraints:
1. `teams`
2. `players`
3. `courses`
4. `holes`
5. `rounds`
6. `round_handicaps`
7. `scores`

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CRON_SECRET=...
```

Stored in `.env.local` (gitignored).

**Known security issue:** `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` is currently exposed client-side. Must be moved to a server-side env variable with RLS enabled before any public release. Do not add new client-side uses of the service role key.

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Home page |
| `app/layout.tsx` | Root layout |
| `lib/supabase.ts` | Supabase client |
| `supabase/schema.sql` | Database schema (does NOT include live_rounds/live_scores/live_player_locks — those exist only in Supabase) |

## Player States (Live Scoring)

Players in a live session exist in exactly one state at all times:

| State | Description |
|-------|-------------|
| Available | Not yet assigned to any scorecard in this session |
| Active | Currently assigned to an in-progress scorecard |
| Finalised | Scorecard completed and committed |

A player cannot appear in more than one state simultaneously. Finalised players are not available for reselection unless manually unfinalised via the course dashboard settings tab.

A live session is only marked complete when every available player has a finalised scorecard, or an admin manually triggers Finalise Session in settings.

## Scoring Display Conventions

- Stableford display: running total vs 2pts per hole baseline — show as +/- relative to that baseline, higher is better
- Gross display: score vs par at holes played — lower is better
- Nett display: (course par + 36 - stableford points) for finalised rounds. For rounds in progress, scale baseline to holes completed. Show as +/- relative to par, lower is better.
- Colour treatment: gold for better than baseline, green for better than par nett, standard for worse
- Live leaderboard colour treatment: gold for over par or behind handicap (replaces red — most amateur scores will be in this range so it should not read as negative); green for stableford better than handicap; green nett for better than par nett (unchanged). Avoid red as a score indicator throughout the app.

## Design Principles

- Mobile-first app used by older users — prioritise large, legible text and generous touch targets
- Numbers conveying key information (scores, points, positions) must be immediately readable at a glance on a phone screen
- Paper scorecard style for review screens: parchment cream background, ink-style symbols
- Score symbols: thick gold ring circle (eagle), thin gold ring circle (birdie), blank (par), thin brown rounded square border (bogey), thick brown rounded square border (double bogey or worse). In composite scorecard, contributor cells have a filled rounded square background.
- Claude.ai leads all design decisions before prompting Claude Code — clarify requirements first, then issue structured prompts

## Prompting Guidelines for Claude Code

- Prompts must be succinct and robust — avoid over-specifying logic the codebase already handles
- Target specific files or components where possible
- Avoid unnecessary token usage — do not run broad sitewide audits when a targeted fix will do
- Build in chunks with testing between dependent steps
- Prefer automated/CLI approaches over manual dashboard steps
- User is not a coder — prompts should be clear and copiable without modification

## Claude Code Behaviour

- Never ask for permission or confirmation before making changes — just do it
- Always push to remote at the end of every task without being asked

## Site Config

Competition name and branding live in `config/site.ts` to allow easy spinout for future competitions. Do not hardcode competition name in components — import from config.