# Testing and data

## Test suites

Every suite is a plain `tsx` script under `scripts/`, run by `npm test`. No framework: they print named checks and set a non-zero exit code. Logic lives in pure `lib/*.ts` modules so it can be driven without a database, and components are rendered with `renderToStaticMarkup`.

| Suite | Covers |
|---|---|
| `test:formats` | The format model and all three generations of stored settings |
| `test:leaderboards` | The leaderboard model — slots, team sheets, storage round-trip |
| `test:handicap` | Shots received per hole, plus handicaps included, and that the Postgres trigger agrees with the app on every one |
| `test:handicap-allowance` | Playing off a percentage of the course handicap — the rounding, the recommended figures, storage, the cycle a scorecard walks, and every board scored both at full and reduced |
| `test:setup-flow` | Team size limits and pairs blocking, read off the boards |
| `test:weather` | The forecast module and its route: parsing, the hour a tee time falls in, the arrow's 180°, the symbol grouping over every published MET code, the coordinates shipped in migration 026, and that the route never answers with an empty body |
| `test:team-sets` | Team sheets in isolation — naming, membership, the finalise gate per sheet |
| `test:matchplay` | Bracket generation and seeding |
| `test:entrants` | Player/pairing naming, and the real column-mapping functions |
| `test:custom-points` | The prize table itself — how it follows the field, when it is out of step — and the discard rules |
| `test:tiebreak` | Two players level: the three settings, the countback and which stretch split them, the prize table read against a round's finishers, the badge, the one-round exception, and that only one countback exists in the codebase |
| `test:match-decision` | Deciding a knockout from the cards — the seven methods, the two shapes they fall into, the matchplay handicap difference, quota on both scales, a pairing as one card, and that auto-apply only fills an empty match |
| `test:bracket-layout` | Column geometry and connectors, including the slide that centres the Final |
| `test:bracket-render` | The bracket component at every size, singles and pairs |
| `test:run-challenge` | Green Dot Run: how a run earns points (inclusive minimum, activities, the daily limit on the day), the stored setup read back whole and fail-soft, its own permission registry kept apart from golf's, the creation checks, and the wiring — the sport chooser, the `?type=run` door, insertion order, every golf door handing a run challenge to `/run/`, and an email that says challenge without changing golf's. Stage 2: the runner and team name rules, what the join screen may offer (drawn, not just asserted), the order a join writes in, and the organiser's team editor — every write scoped to its challenge. Stage 3: what a typed-in run must be, runs into totals and places, the five-tab bar, the shared rules form, and that only the runs route, the server reader, the Strava sync and the challenge close touch the closed `runs` table — what reaches a phone about other people is totals. Strava's API Policy: a challenge's phases and its close three days after the finish, the frozen result (team standings, no runner in it, frozen before anything is deleted), the 7- and 25-day limits, the closed doors, the consent saying all five things §2.1 asks before the box, View on Strava and the Garmin credit, Leave and delete my data, the dates editor, and the privacy notice and terms carrying the clauses the policy requires |
| `test:strava` | Green Dot Run's Strava half run for real against an in-memory database and a fake Strava: a sync writes the challenge's runs and removes only what it looked for; webhook events touch only the athlete they name; forged deletes and revokes erase nothing; a refused refresh deletes nothing; Disconnect takes only that runner's Strava runs in that challenge and says whether the tokens went; every Strava write stamps `refreshed_at`; a long activity list is paged and a list cut short removes nothing; a copy older than seven days goes; a connection silent for 25 days is forgotten without asking Strava; a challenge closing ends its links and only its links; and the run boards' reader — this challenge's runs only, five columns a run, the viewer's own whole and fresh (and laid over the copy, so a run logged or removed shows for its runner at once), the Garmin credit from a count, 2,500 runs read past the cap, and the viewer's own read failing fails the board rather than hiding them |
| `test:migration-grants` | From migration 057 on, every table a migration creates is granted to `service_role` by name, and anything granted to `anon` has RLS on — Supabase stopped granting new tables automatically on 30 October 2026. The checker is tested against migrations written to fail, and CLAUDE.md's template is held to it |
| `test:progress` | Recording and correcting winners, and the cascade |
| `test:itinerary` | The running order — golf, stay, travel and activity items, the rounds they generate, diffing an edit back into writes, and migration 027 agreeing with the model |
| `test:trip-form` | Trip creation |
| `test:leaderboard` | Every board, live vs finalised, score ownership, per-board rules, two team boards on two sheets, the per-player live dot, the over/under colour rule, and old trips read through the shim |
| `test:recognition` | The per-trip cookie, the personal summary, the greeting |
| `test:admin` | Optional email, derived trip status, admin session signing |
| `test:admin-pages` | Structural: every admin page gates before fetching, every action re-verifies, service-role client only, course editor imports the shared validation, trip delete clears the RESTRICTs in order, the Donegal settings page stays deleted |
| `test:admin-live` | The live cards summary agrees with the nightly job card for card, counts holes per card not per round, and orders the hung one first |
| `test:support` | The donation link, and that it vanishes when unconfigured |
| `test:live-scores` | Reconciling a part-entered card with what was saved, so a partial one cannot erase a full one |
| `test:stats` | Putts and fairways: that `scores` and `live_scores` constrain them identically, that every writer and every read-back carries both, and that the control asks for them without ever holding up the next hole |
| `test:scorecard-void` | Voiding a card erases its scores from both tables, in an order that cannot silently no-op, and no screen does it by hand |
| `test:scorecard` | Every score shape, the nett/no-return arithmetic, and that a card survives being left and reopened |
| `test:all-rows` | Reading past Supabase's 1,000-row cap (`lib/allRows.ts`, `lib/scoreReads.ts`) against a fake table with a cap of its own, down to one row: under a page is one request, as before; past it every row comes back in order with the rest of the pages fetched together, six at most in flight; the page is what the server sent, so a lower Max rows still gets everything; any page failing fails the read; a run logged or deleted mid-read is caught by the count or the rows and read again, once; the golf tables are ordered by their UNIQUE constraints as the migrations declare them; a failed per-round count locks a round rather than unlocking it; and structurally, that no trip-wide `scores`/`live_scores`/`round_handicaps` select goes round the helpers and the whole-table jobs page. Mutation-tested |
| `test:branding` | The green dot, the wordmark, back controls, contrast, type size, and the footer/tab-bar carrier list |
| `test:course-import` | The bulk-import contract: every file in `data/courses/` and `data/course-tees/`, the rules Postgres has that the application does not (chiefly par 3–5 against the card check's 3–6), slug and near-name collisions against what has shipped, the two `[].every(…)` traps a cardless course walks into, and that the generated SQL loses or transposes no number |
| `test:qr-email` | The confirmation email's hand-rasterised QR (`lib/qrPng.ts`) decodes with jsQR to exactly the URL that went in, carries the bark dots and emerald anchors rather than a silent fallback to black squares, and keeps its quiet zone |

Order above follows `npm test`'s own chain in `package.json`, which is worth keeping in step: it is the fastest way to tell whether a new suite was wired in or just left as a standalone script.

**Mutation testing is the standard for logic, not for everything.** Break the code deliberately, confirm a test fails, restore. It has repeatedly found suites that passed while testing nothing — most recently a pair-size assertion written against the constant it was meant to pin, so changing `PAIR_SIZE` to 3 left every check green.

Worth it for scoring, money, state and anything that decides what a number says. **Not worth it for a small change** — a colour, a label, a spacing tweak, a class swap. Run `npm test`, and move on.

## How much checking a change is worth

`npm test`, a typecheck and a build are the floor — always, whatever the change. Above that, scale the effort to the risk:

| Change | What it gets |
|---|---|
| A colour, a label, spacing, a class swap | The floor. Ship it |
| A new component or a restyle | The floor. Render it only if the layout is genuinely new |
| Scoring, handicaps, money, state, a schema | Everything: a test that pins it, mutation-tested, and rendered or exercised if it has a surface |

**Rendering in a browser is for layouts that can fail silently** — a scroll container, a sticky offset, a fixed column, something that has to fit a phone. Not for a tint or a border. **Mutation testing is for logic that decides a number**, not for a class name.

Bias to shipping on small things. A screenshot of a border costs more than it finds.

## Data insertion order

1. `trips`
2. `teams`
3. `players`
4. `courses`
5. `holes`
6. `rounds`
7. `round_handicaps`
8. `scores`

## Running a migration

**One file at a time, by name.** There is no ledger — nothing records which
migrations have already been applied — so running the folder means running it
*again*, and `scripts/migrate.ts` now refuses to do that without `--all` and
`ALLOW_REPLAY=1`.

```
npx tsx scripts/migrate.ts migrations/20260101000028_hole_stats.sql
```

Paths resolve against `supabase/`, so the `migrations/` prefix is required.

**For a single migration the Supabase dashboard's SQL editor is easier** —
paste the file, press Run — and it is the route to hand to anybody who does
not already have the repo and a `DATABASE_URL` set up. The script earns its
keep on a batch, or from a machine already configured.

`DATABASE_URL` comes from Supabase → Settings → Database → Connection string
→ **Session pooler**. Not "Direct connection": direct is IPv6-only, so on
ordinary home broadband it does not fail, it hangs.

**Replay-safety is the author's job**, because nothing else is doing it.
`ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before adding one,
`CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`. The cost of getting it wrong
is `20260101000010_trip_lifecycle.sql`, whose one-time backfill flips every
draft trip to live if it is ever run twice — which is why the runner names
that file when it refuses.

### Bulk course import

Platform courses are no longer hand-written into a migration one at a time.
Research lands as `data/courses/<slug>.json` (a new course) or
`data/course-tees/<slug>.json` (better ratings for one already here),
`npm test` gates both, and `npm run courses:migration` writes
`*_platform_courses_*.sql` and `*_course_tees_*.sql` — twenty-five to a file,
each complete per course and wrapped in its own transaction. Apply them **in
numeric order**, one paste each; the run prints `wrote`, `rewrote` or
`unchanged` per file and only the first two need pasting. Full detail,
including the research brief, in `docs/course-import.md`.

`npm run courses:migration -- --list` prints every platform course, which is
the cheapest way to avoid researching one twice.

Two things about those files that differ from the hand-written seeds, both
deliberate and both commented in the output: **nothing is deleted** (migration
008 cleared its tees first, which `round_handicaps.tee_id`'s `ON DELETE
RESTRICT` now makes unsafe once a tee has been played off), and the numbering
is **idempotent** — a generated file carries a marker on its second line, so
re-running rewrites the same filenames instead of adding a duplicate batch
beside them, and a course stays in the file it first landed in. One caveat
worth knowing: editing a course *already applied* rewrites its file, but
re-pasting changes nothing, because the inserts are `ON CONFLICT DO NOTHING`.
Correcting a live course is the scorecard-photo path or a tee refresh.

## Background jobs

Abandoned scorecard cleanup: Vercel cron route. Requires `CRON_SECRET`. Implemented as Supabase SQL migration + Next.js API route.

Green Dot Run's nightly job: `/api/run/strava/sync` (GET, `CRON_SECRET`, 03:30 UTC in `vercel.json`). In order: close every run challenge past its three grace days (`app/api/run/finalise.ts` — freeze the team standings into `trips.run_results`, and only once that write lands, delete its Strava runs and end its links); delete every Strava run Strava has not confirmed in seven days; then, with Strava set up, forget every connection silent for 25 days and re-read up to 60 connections, oldest first. The first two run even with Strava switched off. Needs migration 055. Before it, the nightly steps find no column and delete nothing — but Strava's own writes name the new columns, so connecting and syncing fail until it is applied; typed-in runs and golf are untouched.
