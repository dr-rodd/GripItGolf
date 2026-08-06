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
NEXT_PUBLIC_DONATION_URL=... # unset = support link vanishes entirely.
                             # Currently moot: SUPPORT_ENABLED in lib/donation.ts
                             # is false, so the link is off whatever this says.
                             # Flip that constant to bring it back.
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
| `lib/handicap.ts` | Shots received on a hole, and how a handicap is written and read. **A plus handicap is negative** and gives shots back from SI 18 down |
| `lib/courseHandicap.ts` | The WHS course handicap, the only copy. Unrounded is primary — an allowance comes off that, not off the whole number |
| `lib/scorecardVoid.ts` | Voiding a card. **Erases its scores from `live_scores` and `scores`**, not just the locks. Every void route goes through it |
| `lib/handicapAllowance.ts` | Playing off a percentage of the course handicap. **Never stored reduced** — applied when a board reads the cards |
| `lib/leaderboardsCompat.ts` / `lib/formats.ts` / `lib/tripSetupFlow.ts` | Reading old trips' stored settings — don't extend, only read |
| `lib/roster.ts` | Who is confirmed, the join list's order, and the no-two-same-names rule. **Confirmed is `players.claimed === true`** — the column is nullable, so `!claimed` and `.eq('claimed', false)` are both wrong |
| `lib/upNext.ts` | What happens next on the trip. **Only golf can be counted down to** — a stay or a journey carries a day and nothing finer. Joins `rounds.scheduled_date` to `itinerary_items.tee_time`, the one place the two meet |
| `lib/standing.ts` / `lib/hubStanding.ts` | Where a player stands. Two paths: one query for an individual Stableford total, the full `buildRows` context for anything else. `test:hub` holds them against each other |
| `lib/rowContext.ts` | Raw rows → a `RowContext`, via `buildRowContext`. **The only assembly there is** — the leaderboard and the hub both call it. Fetching is each caller's own; deciding never is |
| `lib/nextMatch.ts` | The next tie: opponent known, undecided, a bye, or out. In a pairs draw the entrant is the pairing on *that draw's* sheet |
| `app/components/Section.tsx` | The collapsible hub sections. One open at a time — the stack owns that, not the section |
| `lib/currentPlayer.ts` | Cookie → the player holding this phone, matched against this trip's roster. **Personalises, never authorises** |
| `lib/roundHandicaps.ts` | The `round_handicaps` snapshot, written on a handicap edit and when somebody joins after the rounds exist |
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

**A plus handicap is the mirror of that, and is stored as a negative number.** A player better than scratch GIVES shots back, from the easiest hole down — a +1 gives one back on SI 18 and is level par by birdieing it and paring the other seventeen. `shots_received` is negative for them:

```
given_back    = FLOOR(|handicap| / 18) + (1 if stroke_index >= 19 - |handicap| % 18 else 0)
shots_received = -given_back
```

Never write either of these out again: `lib/handicap.ts` is the only copy, and `shots_received()` in migration 024 is the SQL twin the trigger calls. It was written out five times and every copy had the plus case wrong — `stroke_index <= -1` is false on all eighteen holes, so only `FLOOR(-1/18) = -1` survived and a +1 gave a shot back everywhere. `test:handicap` runs the two implementations against each other for every handicap on every stroke index.

Calculated by the Postgres trigger `trg_scores_stableford` on every insert/update to `scores`. Full detail (WHS playing-handicap formula, player states, tee data): `docs/schema-and-scoring.md`.

`handicap` here is always the **full** course handicap. A competition allowance (85% for a four-ball, 95% for a singles) belongs to the leaderboard, not to the card: it is applied when a board reads the scores and is never written to `round_handicaps` or `scores`. Store it reduced and a second board on a different allowance can no longer be scored. The percentage comes off the *unrounded* course handicap — 11.63 shows as 12, but 90% of those two are a shot apart.

**`round_handicaps.playing_handicap` starts life as the handicap _index_**, not a course handicap — creation, finalise and every handicap edit write it before any tee exists. Anything holding a tee must compute from the tee instead of trusting that snapshot.

## Two orderings, on purpose and not

`lib/boardRows.ts` `sortRows` is the leaderboard's order: by total, ties broken alphabetically by name. `lib/playerSummary.ts` `standings` is the hub's cheap path for an individual Stableford total, and `test:hub` holds the two against each other.

**`app/scoring/LiveLeaderboardPanel.tsx` `compareRows` is a third, and it disagrees.** It breaks a Stableford tie by **countback** — back 9, then back 6, then back 3, then back 2, then holes played — where `sortRows` breaks it by name. So two players level can be ordered one way on the in-play panel inside the scoring card and the other way on the trip leaderboard.

That panel is reachable from platform trips: `CourseDashboardClient` renders it, and that is what `/trip/[tripCode]/course/[roundNumber]` shows. Countback is arguably the more correct answer in golf, so this is a decision to make rather than a bug to patch — and it sits inside the scoring entry flow, which is why the extraction left it alone. Left documented rather than reconciled.

## Data insertion order

`trips` → `teams` → `players` → `courses` → `holes` → `rounds` → `round_handicaps` → `scores`

## CC Behaviour

- Act immediately on single-file, routine changes — no need to ask first.
- Pause and confirm first for anything multi-file, or touching schema/migrations: list what's about to change, then wait for a yes.
- Build in stages — test between dependent steps, don't chain too many changes at once.
- **Always push to `master`. Never a branch, never a PR** — `master` is what Vercel deploys to greendot.live, so work anywhere else is invisible to Big Dog. If a session is started on a branch (some tooling does this automatically), say so at the start and push to `master` anyway.
- Before reporting a fix as done, check that what was tested is what is deployed: `git log --oneline origin/master -1`. A screenshot from greendot.live is always `master`, never the working tree — a fix left on an unmerged branch comes back as "that didn't work" when the fix was fine and simply not live.
- Never expose the service role key client-side.
- All queries must filter by `trip_id`.
- When changing a function's signature, grep every call site by function name (not by argument variable names) and check each by hand.
- Scale verification effort to the change's risk — table in `docs/testing-and-data.md`. `npm test`, typecheck and build are the floor for everything.
- Keep this file current — a decision made but not written here causes inconsistency across sessions.

## Terminal use — last resort only

Prefer built-in file/commit/push tools, the GitHub website, or a committed SQL migration file over a terminal command. If the terminal is genuinely the only option, explain what the command does before running it — never run one silently.

### Never discard uncommitted work — this keeps happening

`git checkout -- <file>`, `git checkout HEAD -- <file>`, `git stash`, `git restore` and `git reset --hard` all throw away uncommitted changes **silently and unrecoverably**. There is no reflog for a working tree that was never committed. This has bitten more than once, both times in the same shape: hours of edits sitting unstaged, a "quick revert" of something unrelated, and the real work gone with it.

The trap is that the intent is always innocent — undoing a temporary edit, cleaning up after an experiment, reverting a deliberately-broken file used to check that a test fails. The command does exactly what it says; it just also takes everything else in that file.

**The rule: commit before running any command that can discard changes.** A commit can be amended, reworded, or reverted later — nothing is lost by making one early. Specifically:

- Finish the work and **commit it first**, then experiment. Never the other way round.
- To temporarily break a file (checking a test really fails, isolating a cause), commit the real work first, then mutate, then `git checkout HEAD -- <file>` to restore. That restores to the commit, which is what you want.
- Never `git stash` as a way to "see the old version" — use `git show HEAD:<path>` or `git diff`, which read without touching the working tree.
- `git stash --staged` stashes the *staged* changes, so `git add -A` followed by it empties the working tree. Two different mistakes with the same result.
- Before any destructive git command, run `git status` and read it. If anything is modified and uncommitted, commit it first.

If work is lost anyway: say so plainly, redo it, and re-run the full verification from scratch — a redo from memory is not the same as the original and cannot be assumed correct.
