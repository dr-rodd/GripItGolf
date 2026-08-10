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
SUPABASE_SERVICE_ROLE_KEY=...# server only. `createAdminClient` throws without
                             # it, which takes the nightly cleanup and the
                             # weather route with it. Was undocumented here
                             # for a long time while both depended on it.
CRON_SECRET=...
ADMIN_PASSWORD=...           # server only, no NEXT_PUBLIC_ prefix
MET_USER_AGENT=...           # server only. Identifies this app to MET Norway
                             # and carries a contact address; they throttle and
                             # then refuse requests without one. Falls back to
                             # the site URL alone, which is weaker — set it.
                             # Format: GreenDotGolf/1.0 (+https://greendot.live; you@example.com)
ANTHROPIC_API_KEY=...        # server only. The card check — photographing a
                             # scorecard on the pick-player screen to correct
                             # pars, indices, slopes and yardages — sends the
                             # photo to the Claude API with this key. Unset,
                             # the check answers with a calm "not set up yet"
                             # and everything else works as before.
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
| `docs/ios-app.md` | The home-screen install layer (manifest, generated icons, standalone quirks), how players install, and the deferred App Store route |

## Platform concept

- A **lead player** creates a trip — no account required, open access for now
- A **6-character alphanumeric trip code** is generated on creation (e.g. `GX7K2P`)
- Other players join by entering the trip code at `/join`
- All trip data is scoped by `trip_id` — no data leaks between trips
- No auth gate yet — trip code is the only access control
- **Installable as a home-screen app** — manifest + icons generated at build
  from `lib/iconTile.tsx`, no service worker, App Store deliberately
  deferred: `docs/ios-app.md`. The installed app has its own cookie jar, so
  a player claims their name once more on first launch
- **Anyone can add a course** from the course picker. Courses are shared
  platform rows (`trip_id IS NULL`), so an addition is for everyone. A new
  course has no holes and `card_verified = false` until a scorecard photo is
  confirmed — the card check creates the 18 holes from the first trusted
  photo (`mode: 'create'`) and flips the flag; scoring is gated until then

## Routing

| Route | Purpose |
|---|---|
| `/` | Landing — create or join a trip |
| `/join` | Enter trip code |
| `/trip/[tripCode]` | Trip hub |
| `/trip/[tripCode]/setup` | Formats, players, finalise/unlock |
| `/trip/[tripCode]/teams` | Team assignment |
| `/trip/[tripCode]/players` | Join / claim a player slot |
| `/trip/[tripCode]/round/[roundNumber]` | Round summary — card, tees, result |
| `/trip/[tripCode]/scoring` | Round picker |
| `/trip/[tripCode]/scoring/[roundNumber]` | Live scoring |
| `/trip/[tripCode]/leaderboard` | Leaderboard tabs |
| `/dashboard` | Lead player's trip list (future — post auth) |
| `/dashboard/create` | Trip creation wizard |
| `/admin/trips` | Owner-only, unlinked, password-gated |

## Key files

| File | Purpose |
|---|---|
| `lib/leaderboards.ts` | Current leaderboard model |
| `lib/boardRows.ts` | Scores → leaderboard rows, per board. **`total` is always the competition's total, after any discard**; `totalAll` is the all-in figure and exists only where a round was actually dropped, for the leaderboard's Discard switch. **A casual round (`rounds.casual`) is dropped here, in `buildRows`, and nowhere else** — scored as usual, on no board; a round summary gets its result back by clearing the flag (`fetchRoundRows`) |
| `lib/handicap.ts` | Shots received on a hole, and how a handicap is written and read. **A plus handicap is negative** and gives shots back from SI 18 down |
| `lib/courseHandicap.ts` | The WHS course handicap, the only copy. Unrounded is primary — an allowance comes off that, not off the whole number |
| `lib/scorecardVoid.ts` | Voiding a card. **Erases its scores from `live_scores` and `scores`**, not just the locks. Every void route goes through it |
| `lib/staleLive.ts` | When a scorecard nobody came back to is closed, and when its rows are deleted. **Closed on the last hole entered, never on when the card opened** — keying off `activated_at` would close a group still out on the course. Run nightly by `/api/cleanup`; `?dryRun=1` reports without writing |
| `lib/weather.ts` | Reading a MET Norway forecast: parsing, picking the hour a tee time falls in, compass, symbol grouping, the yr.no link, cache freshness. **Pure — `app/api/weather/route.ts` does all the I/O.** Two traps it exists to hold: the arrow points at `wind_from_direction + 180`, and `next_1_hours` stops existing ~3 days out so precipitation falls back to `next_6_hours`. A missing gust or rain chance is null, never 0 |
| `lib/handicapAllowance.ts` | Playing off a percentage of the course handicap. **Never stored reduced** — applied when a board reads the cards |
| `lib/leaderboardsCompat.ts` / `lib/formats.ts` / `lib/tripSetupFlow.ts` | Reading old trips' stored settings — don't extend, only read |
| `lib/roster.ts` | Who is confirmed, the join list's order, and the no-two-same-names rule. **Confirmed is `players.claimed === true`** — the column is nullable, so `!claimed` and `.eq('claimed', false)` are both wrong |
| `lib/upNext.ts` | What happens next on the trip. **Only golf can be counted down to** — a stay or a journey carries a day and nothing finer. Joins `rounds.scheduled_date` to `itinerary_items.tee_time`, the one place the two meet |
| `lib/standing.ts` / `lib/hubStanding.ts` | Where a player stands. Two paths: one query for an individual Stableford total, the full `buildRows` context for anything else. `test:hub` holds them against each other |
| `lib/rowContext.ts` | Raw rows → a `RowContext`, via `buildRowContext`. **The only assembly there is** — the leaderboard and the hub both call it. Fetching is each caller's own; deciding never is |
| `lib/holeStats.ts` | Putts and fairways → greens in regulation, accuracy, hole difficulty, and gained on the field. **The only copy of every one of those rules** — nothing on a screen derives any of them. Greens in regulation is never a stored column: it needs the player's own par. Gains are **gross and self-excluding**, which is what makes them sum to zero over a hole |
| `lib/courseDirectory.ts` | The course picker's rules and the add-course gate: search, the region chips (derived from `location`, county before country), slugs, and validation for a new course's name, website and tees. **Tee ranges are `TEE_COLUMN_RANGE` from `lib/cardCheck.ts`** — one copy, or the form would accept what the check refuses. `app/api/courses` writes; this only decides |
| `lib/courseLookup.ts` | Reading ratings off a club website for the add-course form: HTML→text, which same-origin links to follow, the Sonnet prompt/schema, and clamping what comes back to the card-check ranges (a bad figure costs the field, never the lookup). **Everything it returns is a suggestion the person confirms.** Pure — `app/api/course-lookup/` fetches and asks |
| `app/components/CourseSelect.tsx` | The course picker: search + region chips pinned over a scrolling list, and the add-course form (name, website lookup, tees, then a scorecard ask via `CardCheck`). Replaces the old native select in the golf sheet. A course added mid-build lives in `ItineraryBuilder`'s own `addedCourses` state — callers' fetched lists are never mutated |
| `lib/courseCard.ts` | A course's card, two nines with their pars. **One set of numbers, never two** — the ladies card or the men's, decided by who is holding the phone. No yardages: those columns have never held a value |
| `lib/nextMatch.ts` | The next tie: opponent known, undecided, a bye, or out. In a pairs draw the entrant is the pairing on *that draw's* sheet |
| `app/components/CourseWeather.tsx` | The weather, in two shapes from one component — the round page's block and the hub's one line — so the two cannot disagree about the same course. Fetched in the browser: the hub does not know which round is next until hydration. **The line variant renders no anchor**, because the up-next block it sits in is already inside a `<Link>` |
| `app/components/Section.tsx` | The collapsible hub sections. One open at a time — the stack owns that, not the section |
| `app/trip/[tripCode]/layout.tsx` | The bottom bar, drawn **once for the whole trip subtree and never by a page**. A page that renders its own tears the bar off the screen on every navigation, because a component rendered by a page unmounts with it. Pages still carry `has-tabbar` — the page is what scrolls |
| `app/trip/[tripCode]/**/loading.tsx` | Why a tab feels instant. Without a loading file Next holds the current page, fully painted, until the next one's queries come back — and every trip route is `force-dynamic`, so that was seconds of a screen that gave no sign of having been tapped. It is also the only part of these routes a prefetch can warm. Six of them; `docs/design-system.md` has the split and the rule about not promising a shape |
| `app/components/TabBar.tsx` | The five tabs, identical on purpose — the leaderboard holds the centre and position is the whole emphasis; the emerald circle around it was tried and retired. **A tab lights on `active` *or* `pending`** — `active` comes from the pathname, which does not change until the destination has rendered on the server, so lighting on it alone means the tap looks like nothing for as long as the query takes |
| `lib/currentPlayer.ts` | Cookie → the player holding this phone, matched against this trip's roster. **Personalises, never authorises**. Read on the server by the hub, the stats page and a round summary — so **anything that changes the cookie must `router.refresh()` before it navigates**, or the router serves back a page it rendered for whoever this device was a moment ago. That is the whole of the "claiming doesn't stick" bug, and the cookie was never the part that was wrong. For the same reason **no link may force a full `prefetch` of those three routes** |
| `lib/cardCheck.ts` | Confirming the course record against a photo of the printed scorecard, from the pick-player screen. **Pure** — types, validation (a stroke index column must be a permutation of 1–18; the ladies card is all or nothing; a misread never reaches a diff), the diff, and the whitelist the apply route checks writes against. `app/api/card-check/` does the I/O: extraction via the Claude API, then apply after the person says yes. **The photo is only ever the challenger** — a card with no ladies row never erases a stored one. Applying re-fires the Stableford trigger on the asking trip's committed scores for that course, so corrected pars re-tell the leaderboard; **the most recent photo wins** — each apply overwrites, nothing merges. Courses are shared platform rows, so a correction is a correction for everyone, which is the point. **A course with no holes gets its card here**: the first trusted photo is offered back whole (`mode: 'create'`), apply inserts the 18 holes and any fully-rated tees, and either path — create, apply, or an exact match — sets `courses.card_verified` |
| `lib/roundHandicaps.ts` | The `round_handicaps` snapshot, written on a handicap edit and when somebody joins after the rounds exist |
| `lib/teamLimits.ts` | Team size rules, pairing wording |
| `lib/matchplayEntrants.ts` | Player/pairing shape and naming |
| `lib/itinerarySync.ts` / `lib/itineraryStore.ts` | Itinerary diff-and-write. **`toItemRow` is the only row mapping** — trip creation had a second copy of it, field for field, and a kind gaining a column reached one writer and not the other. **The golf lock is per round** (`touchesLockedGolf`): a round with scores can't be removed or re-coursed, everything else — adding golf mid-trip included — stays open |
| `supabase/migrations/` | All schema changes, in order. **Migration 010 has a one-time backfill — never replay it**: it flips every draft trip to live. `scripts/migrate.ts` now enforces that rather than trusting the reader — a bare run lists and stops, and the whole folder needs `--all` plus `ALLOW_REPLAY=1`. Run one file by name; for a single migration the Supabase SQL editor is easier still |
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

## Stats

Two answers a hole — putts, and which way the tee shot went — recorded per
player on the scorecard when a trip switches `trips.track_stats` on in the
Trip Settings drawer. Off by default. Everything else is derived in
`lib/holeStats.ts`, and that is the only copy: full detail in
`docs/features.md`.

The hub at `/trip/[code]/stats` is **pure views over one fetched
`HoleStat[]`** — every toggle is client-side filtering, and **the filter
narrows the holes, never the field**: a gain on one course is measured
against everybody's play of that course, whoever is selected. **The course
picker is a choice of one** — `null` for every course or a single id, never a
set — so no tap can leave the page with no holes on it and nothing has to
guard against it. Net gained is
Stableford points vs the field — the handicap arrives baked into each
stored point, never re-derived. Charts are hand-drawn SVG; polarity is
encoded by side-of-zero, never by the emerald/rust pair alone, which a
colour-blind reader cannot split.

Four things that are easy to get wrong twice:

- **Greens in regulation is never stored.** It needs `effectivePar` for the
  player holding the card, so a stored column would be a second answer
  waiting to drift from the first.
- **Gained on the field is gross, and excludes the player from their own
  field average.** Both halves come off the same subset, so putting plus
  tee-to-green is exactly the gain in gross shots, and the gains over a hole
  sum to zero. No handicap appears anywhere in that file.
- **The two columns exist on both score tables under the same names**, so a
  commit copies a row rather than translating it. `scores.putts` has no
  upper bound against the gross for the same reason `live_scores.putts` has
  none — a commit that fails on the eighteenth green is the worse failure, so
  an impossible card is dropped on the way in instead.
- **Stats are editable wherever the gross is.** The Edit Scorecard screen
  renders the same `StatsRow` the live tile does — one implementation, in
  `LiveScoringFlow.tsx`, gated the same way on both screens. It edited the
  gross alone for one release; that gap is closed, and a second copy of the
  control is how it would reopen.

## Two orderings, on purpose and not

`lib/boardRows.ts` `sortRows` is the leaderboard's order: by total, ties broken alphabetically by name. **`orderRowsUndiscarded` is not a second one** — it is the same comparator, `rowOrder`, reading `totalAll` instead of `total` for the leaderboard's Discard switch. Add an ordering by extending `rowOrder`, never beside it. `lib/playerSummary.ts` `standings` is the hub's cheap path for an individual Stableford total, and `test:hub` holds the two against each other.

**`app/scoring/LiveLeaderboardPanel.tsx` `compareRows` is a third, and it disagrees.** It breaks a Stableford tie by **countback** — back 9, then back 6, then back 3, then back 2, then holes played — where `sortRows` breaks it by name. So two players level can be ordered one way on the in-play panel inside the scoring card and the other way on the trip leaderboard.

That panel is reachable from platform trips: `CourseDashboardClient` renders it, and that is what `/trip/[tripCode]/scoring/[roundNumber]` shows. Countback is arguably the more correct answer in golf, so this is a decision to make rather than a bug to patch — and it sits inside the scoring entry flow, which is why the extraction left it alone. Left documented rather than reconciled.

## Data insertion order

`trips` → `teams` → `players` → `courses` → `holes` → `rounds` → `round_handicaps` → `scores`

## What things are called on screen

Settled in a sitewide copy review — `docs/copy-review.md` holds the sheet, item
by item, and is the place to propose wording rather than changing strings
piecemeal. Four rules came out of it, and they are rules because each one had
three or four variants in the wild:

- **The person who made the trip is the lead player.** Not organiser, not trip
  owner, not "whoever created it".
- **The screen at `/trip/[code]/setup` is Trip Setup** — the tab bar's fourth
  label and every sentence that points at it. **Trip Settings is the drawer
  inside it**, behind the gear: name, dates, itinerary, who can edit. Two
  similar names for two different things, deliberately.
- **Errors are calm.** "Could not X — try again", never "Failed to X" or
  "Please…".
- **One leaderboard is a leaderboard.** "Competition" is the golf sense of the
  word (as in a competition allowance), not a name for the object.

**A scoring or team-format `hint` in `lib/leaderboards.ts` is not only a hint.**
`boardRules` joins the hints into the line under a saved board's title, and
`label` becomes the board's tab, so a word changed there lands in three places.
Both need a full stop or the joined line runs on.

## CC Behaviour

- Act immediately on single-file, routine changes — no need to ask first.
- Pause and confirm first for anything multi-file, or touching schema/migrations: list what's about to change, then wait for a yes.
- Build in stages — test between dependent steps, don't chain too many changes at once.
- **Always push to `master`. Never a branch, never a PR** — `master` is what Vercel deploys to greendot.live, so work anywhere else is invisible to Big Dog. If a session is started on a branch (some tooling does this automatically), say so at the start and push to `master` anyway. Reaffirmed deliberately, not by default: see "Pushing straight to production" below.
- Before reporting a fix as done, check that what was tested is what is deployed: `git log --oneline origin/master -1`. A screenshot from greendot.live is always `master`, never the working tree — a fix left on an unmerged branch comes back as "that didn't work" when the fix was fine and simply not live.
- Never expose the service role key client-side.
- All queries must filter by `trip_id`.
- When changing a function's signature, grep every call site by function name (not by argument variable names) and check each by hand.
- Scale verification effort to the change's risk — table in `docs/testing-and-data.md`. `npm test`, typecheck and build are the floor for everything.
- Keep this file current — a decision made but not written here causes inconsistency across sessions.

## Pushing straight to production

Every push to `master` deploys to greendot.live within a minute or two. There is no staging step and, by decision, no branch to check first. That was re-examined and re-chosen — **while there are no live trips.** The reasoning, and the condition, both matter:

- The cost of a bad deploy right now is a few minutes of a broken site nobody is on. Once groups are out on a course scoring, the same deploy is visible to everyone at once, mid-round, and there is no way to tell them to wait.
- The safety net is the test suite, which is structural: it catches a component that stopped rendering, a rule that changed, a colour that fails contrast. It cannot tell whether a screen *looks right on a phone*. That check happens on greendot.live, after the fact.
- **Instant Rollback is the real backstop.** Vercel keeps every past deployment; the project dashboard has a one-click rollback on each. Live again in about thirty seconds, and it needs nobody's help. Reach for this first when something ships broken, before debugging under pressure.

**When trips go live, this decision has to be taken again** — not silently kept. Vercel builds a preview deployment for any branch push, on its own URL, with no setup: that is the protected environment for anything worth eyeballing before the field sees it. Two things to know before relying on it: preview shares the production Supabase, so it is safe for looking and not for writing test data; and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be ticked for **Preview** in the Vercel environment variables, or preview builds fail on the same "Missing Supabase environment variables" error a local build without a `.env` hits.

### The stop hook that cries wolf

Sessions are often started on a `claude/…` branch by the tooling. The stop hook does not read the branch's configured upstream — it looks for a *remote branch of the same name*, and one is created at session start. Since every push goes to `master`, that ref never moves, and the hook reports a climbing count of "unpushed commits" that were all pushed.

The fix is one command, not a nineteen-turn argument: `git checkout -B master <current HEAD>` with a clean tree. Same commit, no file touched, and the hook then compares `master` against `origin/master` and finds nothing. Do it early rather than declining the hook repeatedly.

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
