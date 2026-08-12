# Gotchas and debt

## Next.js 16 gotcha

Dynamic route params and searchParams are now Promises. Server components must destructure via `const { x } = await params` — synchronous access returns 404s on all dynamic routes. Applies to every `[slug]`, `[id]`, `[tripCode]`, `[roundNumber]`, `[sessionId]` segment.

## iOS Safari stacking context gotcha

A `transform: translateX(0)` animation on a slide container combined with `overflow-hidden` on the parent breaks tap hit-testing until the first scroll. Use `margin-left` transitions instead. Never use transform for horizontal slide animations inside an overflow-hidden parent.

**Status: TODO.** `app/scoring/LiveScoringFlow.tsx:921` uses `translateX` inside an `overflow-x-hidden` div. Not `overflow-hidden` exactly but adjacent enough to revisit before iOS testing.

## Refactoring discipline — signature changes (arity or argument order)

Never use `sed` with variable-name patterns to update call sites. A call site in `LiveLeaderboardPanel` was once missed when removing the third argument from `effectivePar` because the sed pattern matched `h` (a reduce callback parameter) but the missed line used `hole` (a find result). The function compiled; the wrong par was silently used for nett scoring.

Required procedure when changing a function signature:
1. `grep -rn 'functionName(' app/` — list every call site.
2. Read the list. Acknowledge it explicitly.
3. Edit each call site by hand or with a pattern that matches the function name only, not the argument variable names.

## Performance pattern (from scorecard modal work)

Sequential multi-query page navigations should be replaced with inline bottom-sheet modals that reuse already-fetched data. Instant UX, zero additional queries. Applied this to individual scorecards in Donegal Masters pre-trip and it was the single biggest UX improvement of the app.

## Row-level security — half done, on purpose

Inherited from Donegal Masters, where `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` was exposed client-side. That much is fixed: the key is `SUPABASE_SERVICE_ROLE_KEY` now, server-only, reached through `lib/supabase-admin.ts` and nothing else. What came with it was subtler and lasted longer — **no RLS on any table**, which meant the anon key that necessarily ships in the browser bundle was unrestricted INSERT, UPDATE and DELETE on the whole schema. Supabase's advisor is what finally said it out loud: *"anyone with your project URL can read, edit, and delete all data in this table."*

**Done — migration 040.** `courses`, `holes`, `tees` have RLS with a read policy and **no write policy**; `hole_tee_yardages` has RLS and no policy at all, like `weather_cache` before it. These four were separable because the browser reads them and never writes them: every write comes from `app/api/courses`, `app/api/card-check/**`, `app/admin/**` or `lib/tripDelete.ts`, all through `createAdminClient()`, and the service role bypasses RLS. So the app did not change by a line. It was also the worst of the exposure — courses are shared platform rows, so anyone could have rewritten the pars of all 88 courses for every trip at once, and the Stableford trigger would have re-scored every committed card against them.

**Still open, and why.** Every trip table: `trips`, `players`, `teams`, `team_members`, `rounds`, `round_handicaps`, `scores`, `live_scores`, `live_rounds`, `live_player_locks`, `composite_holes`, `itinerary_items`, `matchplay_matches`, `tee_times`. The browser writes to most of them directly. There is no auth — the trip code is the only access control and **the database has never been told what a trip code is** — so a policy has nothing to key on. Enabling RLS there without a policy that can authorise a caller stops the app dead; enabling it with a permissive one protects nothing. Two designs, and the thing that decides between them is realtime:

- **Trip code in a request header**, read in policies via `current_setting('request.headers')`. Cheap, and enforces exactly the access model already documented — no more, no less. But **Supabase Realtime does not evaluate PostgREST request headers**, so every such policy denies on the realtime channel: the live leaderboard's `postgres_changes` subscription on `live_scores` goes dark and falls back to its 15-second poll.
- **Supabase anonymous sign-in.** Each device silently gets a real identity with no login screen, policies key on it, realtime keeps working. Bigger, touches scoring, and is the foundation a paid product needs anyway.

**The trap, named once.** Enabling RLS with `USING (true)` write policies turns the advisor green and changes nothing about who can delete your data. If the remaining warnings are ever "fixed" quickly, that is what happened. Nothing outside the service role has any business writing to `courses`, `holes` or `tees`, so a write policy on those three is always wrong.

## Multi-year architecture (inherited from Donegal Masters 2026 archive work)

Every table holding tournament-instance data has an `edition_year` INTEGER NOT NULL column. A `tournament_config` table holds one row with `current_year`. All live-app queries filter by `current_year` via a `lib/getCurrentYear.ts` helper (5-minute cache, server-side only — never call from client). Client components receive currentYear as a prop threaded from the server component chain.

Year-scoped unique constraints: any uniqueness that was implicitly "one tournament" must be `(original_columns, edition_year)`. Examples from Donegal Masters: `teams.name`, `rounds.round_number`, `rounds.course_id`.

Archive routes live at `/past/[year]` and are strictly read-only — no .insert/.update/.upsert/.delete anywhere under that path, and reused components take a `readOnly` prop that short-circuits all write handlers and realtime subscriptions.

In GripItGolf's multi-tenant model, this pattern needs scoping per-trip: `edition_year` likely becomes something like `(trip_id, edition_year)` or just `trip_id` since each trip IS a tournament instance.

## Iron-clad rules from the live tournament

1. **iOS Safari stacking context gotcha.** See above.
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

## Donegal Masters 2026 lessons — compliance status

| # | Rule | Status | Reference |
|---|------|--------|-----------|
| 1 | iOS: `translateX` inside `overflow-hidden` breaks tap hit-testing | ⚠️ TODO | `app/scoring/LiveScoringFlow.tsx:921` — `translateX` inside `overflow-x-hidden` div. Not `overflow-hidden` exactly but adjacent enough to revisit before iOS testing. |
| 2 | Leaderboard merges uncommitted `live_scores` + committed `scores` | ✅ Fixed (trip pages) | `app/trip/[tripCode]/leaderboard/` fetches both and merges — committed always wins per hole. In-progress rounds show a pulsing dot. The legacy DM `app/leaderboard/` still queries `scores` only. |
| 3 | Offline queue stamps `trip_id` at enqueue, not flush | N/A | Feature not built. No offline queue exists in this codebase. |
| 4 | WHS formula: `PH = HI × Slope/113 + (CR − Par)`, no 95%, no truncation | ✅ Compliant | Verified 2026-04-24. `calcPlayingHandicap` in `LiveScoringFlow.tsx`, `LiveClient.tsx`, `LeaderboardClient.tsx`. |
| 5 | Ladies tees applied on all courses, not just one | ✅ Fixed | commit `a320b53` + `be82e21` (2026-04-24). `ST_PATRICKS_COURSE_ID` gate removed from all 4 files; missed call site fixed. |
| 6 | Team scoring: best-2-of-3 per hole, not best-1 | ✅ Fixed | commit `a320b53` (2026-04-24). `teamRoundPts` and `bestPts` in `LeaderboardClient.tsx` now sort and slice top 2. |
| 7 | Scoring canonical rules: NR cap, Stableford formula, 2pts baseline display | ✅ Compliant | `shotsReceived` ✅ `calcStableford` (MAX(0, par+2−net)) ✅ `nrGross` (par+2+shots cap) ✅ `no_return` flag ✅ `stablefordRelative = total − holesCompleted×2` ✅ |
| 8 | Team re-assignment: 3-step null/place/restore to satisfy role-per-team constraint | N/A | Feature not built. No team re-assignment UI exists yet. |
| 9 | Silent mutation failures surfaced to user | ⚠️ TODO | `// TODO(error-handling)` comments added 2026-04-24 to 7 unchecked mutation sites across `LiveScoringFlow.tsx` and `LiveClient.tsx`. Full fix requires error destructuring + UI feedback. |
| 10 | `force-dynamic` on leaderboard pages (not `revalidate = 30`) | ✅ Fixed | Fixed 2026-04-24 — was missed in initial port from Donegal Masters. Both `app/leaderboard/page.tsx` and `app/leaderboard/individual/page.tsx`. |
| 11 | Tee auto-selection on fresh start | ✅ Fixed | `togglePlayer` in `LiveScoringFlow.tsx` auto-selects when a player's gender has exactly one tee on that course. Men usually see 2–3 options and choose, since the choice changes their playing handicap. |
| 12 | Session resume fetches fresh `round_handicaps` (not stale page-load prop) | ✅ Fixed | commit `0d7296c` (2026-04-24). `doResume()` fetches fresh; `effectiveRoundHandicaps` state unifies sources; `resolvePlayingHandicap()` logs fallback. |
| — | Next.js 16: dynamic route `params` must be awaited as a Promise | ✅ Compliant | Both dynamic routes use `const { x } = await params`: `app/scoring/[slug]/page.tsx:19`, `app/scorecard/[playerId]/page.tsx:16`. |

## Build discipline (carried from Donegal Masters sessions)

The current CC Behaviour rule in the main `CLAUDE.md` (act immediately on single-file/routine changes, pause and confirm for multi-file or schema/migration changes) is the resolved version of what used to be two contradictory rules here: "never ask for confirmation" versus "for any multi-file change, produce an audit list first, pause for confirmation." Follow the CLAUDE.md rule, not this history.

- Build in stages. Test between dependent steps. Never chain too many changes.
- Prompts scoped to specific files. Avoid broad "audit the codebase" requests.
- Automated/CLI approaches preferred over manual dashboard steps.
- Decisions not written into CLAUDE.md cause inconsistency across sessions. Keep CLAUDE.md current.

## Phantom in-progress scores

`live_scores` has **no foreign key to `live_rounds`**. Migration 003 rekeyed it to `(player_id, round_id, hole_number)` so the client never has to join `holes` to submit a score, and in doing so dropped the link back to the session. `live_player_locks` still cascades from `live_rounds`; the scores do not.

So when a session ends — closed, deleted, or voided — its half-entered holes stay in the table unless something deletes them by hand.

**But the commoner case was worse, and the first diagnosis here had it backwards.** An abandoned card does not end at all. Nothing in the app ever closed it: the nightly job would only close an old session with **zero** scores against it, deliberately, so the moment a card had one hole on it, it stayed `status = 'active'` for good. That is not an inert leftover — an open card is the definition of a round in play. Its part-played scores stood on the leaderboard as a round that never settled, and its players stayed locked into it, so that round could never be scored properly on a new card.

Read back without a guard, those rows are indistinguishable from a card being played right now. They stood on the leaderboard as a partial score, marked the round in play, made the round picker say "Scores in", and — once round summaries existed — gave a round a podium nobody earned.

**The rule now: a live score counts only while its round has a card open on it.** One line in `buildRowContext` (`lib/rowContext.ts`), and the same rule restated in the round picker. `liveRoundIds` is the open sessions and nothing else — it used to also include any round with uncommitted scores, which is the same phantom seen from the other side.

Pinned in `test:hub`, and the leaderboard's golden master carries a `live-scores-with-no-open-card` case: before the fix it rendered a partial score of `+7` and a total of 75; after, that round reads as unplayed. Every other case in that fixture is byte-identical across the change.

### Closing the card, and clearing what it leaves

The read-side guard stops the phantom being *shown*. It does not stop it existing, and it cannot help the round that stays unplayable because its players are still locked into a card from three days ago. That is the nightly job's work, and `lib/staleLive.ts` is the rule it follows — pure, so `test:live-scores` drives it without a database.

**A card is closed on the last hole entered, never on when it opened.** `live_scores.submitted_at` is what says when anybody last touched it. Keying off `activated_at` would close a group who started early and are still out on the course, which is the one thing this must never do.

| | Threshold | What happens |
|---|---|---|
| Card with nothing on it | 2 hours from opening | Closed. The original rule, unchanged. |
| Part-played card | 12 hours from the last hole | Closed — crosses a night, so a real interruption never trips it. |
| Its rows | 48 hours from the last hole | Deleted. |

Closing writes nothing away: it takes the card off the leaderboard, stops the round reading as in play, and releases the players so the round can be scored again. Only the third step is destructive, and the gap before it is the point — a card closed in error can be rescued by hand for a day and a half, because its scores are all still there.

A row is deleted only when **no card can reach it**: no active card to resume it, and no finalised one to unfinalise. A finalised card keeps its locks on purpose, so its rows are reachable and are never touched. Deletes are scoped by player *and* round — a delete by round alone would take the group still out on that round with it, which is the mistake `lib/scorecardVoid.ts` exists to warn about.

`GET /api/cleanup?dryRun=1` reports exactly what both steps would do and writes nothing. Worth running first, and worth running again after.

**Still open:** `live_scores` has no `live_round_id`, so a resume and a commit both read every row for a player and round whichever card wrote it. Between a card being closed and its rows aging out, a new card on the same round for the same player would merge them in. The window is 36 hours and the flow makes it hard to reach — but the real fix is the missing column, and that is a schema job inside the scoring entry flow.

## A par 6 passes the app and fails the database

`holes.par` has been CHECKed `between 3 and 5` since migration 000. Every application-layer validator allows **3 to 6** — `validateCard`, `validateNewHoleRows` and `HOLE_COLUMN_RANGE` in `lib/cardCheck.ts`, and the extraction prompt itself. So the two disagree, and the permissive one is the one a person meets first.

It is not theoretical: par-6 holes exist on real courses. Today, a photograph of one passes `validateCard`, so the card is offered as trustworthy; passes `validateNewHoleRows`, so the apply route accepts it; and is then rejected by Postgres, so `handleCreate` fails on the insert *after* telling the person their card looked fine.

**The bulk import routes around it rather than fixing it.** `DB_HOLE_PAR` in `lib/courseImport.ts` is the only place in the codebase that knows the database is stricter than the application, and it refuses a par 6 before a migration can be written. That keeps a generated migration safe. It does nothing for the photo path.

**The fix is written and not applied:** `supabase/migrations/20260101000033_hole_par_six.sql` widens the CHECK to 3–6 so the database agrees with the four places that already say so, and adds the matching CHECK on `par_ladies`, which has never had one at all. It finds the old constraint by its definition rather than its name, because migration 000 declared it inline and Postgres named it — dropping a guessed name would be a silent no-op that leaves the old rule in force behind the new one.

Once it is applied, `DB_HOLE_PAR` becomes `[3, 6]` and the special case in `lib/courseImport.ts` can go with it.

## A course with no ladies tee stopped the whole fourball

`tees` rows carry a gender, and every scoring surface filtered on it — `courseTees.filter(t => t.gender === player.gender)` — with no fallback. A course whose tees are all `M` therefore gave a woman an empty list.

That was never only her problem. `canStart` in `LiveScoringFlow.tsx` is an `.every` over the selected players, so one player with no assignable tee **disabled Start for everybody on the card**, including the three men who had already picked theirs. Worse, the "Select a tee to continue" hint was guarded on `playerCourseTees.length > 0`, so the one case that needed an explanation was the one case that got none: a dead grey button and no stated reason. And `togglePlayer` refused to deselect the last selected player, so a woman scoring alone could not even back out — only a page reload escaped.

The maths was never involved. `effectivePar` and `effectiveSI` in `lib/boardRows.ts` already fall back to the men's par and stroke index per hole when `par_ladies` is null, which is correct and unchanged. This was purely the tee gate.

**It was reachable two ways.** The add-course form imposes no gender requirement, so anyone could create a men's-only course from the picker; and the bulk import warns about a missing ladies tee rather than refusing it, because refusing would mean dropping real courses whose clubs publish no ladies card. Castlerock Mussenden is exactly that case — the R&A rates a par-75 ladies tee, but with no hole-by-hole ladies card it cannot be represented, since `tees.par` has to equal the hole total or the playing-handicap formula reads the wrong number.

**The fix was already written, in one place, and not shared.** The resume path had always ended `?? courseTees[0]`. That rule now lives once, as `teesForPlayer` in `lib/courseHandicap.ts`, and the setup auto-select, the tee picker, the resume and manual score entry all go through it. A fifth copy of the gender filter is how this reopens, so `test:handicap-allowance` carries a structural check that no scoring surface filters tees by gender on its own.

## `tees.par` was a second copy of a number the card already answered

`PH = HI × Slope/113 + (CR − Par)` reads `tees.par`. That column was researched and stored independently of `holes`, so the two could disagree — and on the shipped platform courses they did, on **15 rows across 12 courses**. County Louth's ladies tee said par 72 against a 75-par ladies card, handing every woman there **three shots too many**. Thirteen of the fifteen were ladies tees, which is its own unfairness: the people worst served by the data were the ones least likely to have a second card to check it against.

Nobody noticed because nothing on any screen shows the two numbers together. The leaderboard shows points, the card shows pars, and the tee's par is only ever consumed by a formula.

Fixed by `supabase/migrations/20260101000035_tee_par_follows_holes.sql`, which makes `tees.par` derive from the stored holes for every platform course — the ladies total for a ladies tee, the men's when that gender has no card, the stored figure when there is no card at all. That is `diffCard`'s fallback, in the same order, and it is now the rule in three places that agree: `diffCard`, `teeParProblems` in the import gate, and this migration.

**The import gate has refused this since it existed** — `teeParProblems` builds a card from a research file and asks `diffCard` whether any tee disagrees with it. So no course added through `data/courses/` can carry the fault. It was the hand-written seeds (`_008` and its predecessors) that had no such check, and the generated tee-refresh path derives `par` in SQL rather than trusting a researched figure for the same reason.

**Finalised rounds did not move.** `round_handicaps.playing_handicap` is a snapshot and the Stableford trigger had already written its points from it. Only future and in-play rounds change.

## Men's and ladies' stroke index diverge a lot, and that is normal — do not build a check for it

Reviewing a researched course I noticed that its men's and ladies' stroke index agreed closely on most holes and wildly on two adjacent ones, and proposed flagging that pattern as a probable transposition. **Calibrating against the 28 shipped courses killed the idea, and the specific accusation with it.**

- A rule of "Δ > 8 with no par change" flags **27 holes across the hand-curated set** — Adare Manor, Ballybunion Old, Royal County Down, Royal Portrush Dunluce, Lahinch, Rosapenna Sandy Hills (4 holes), Enniscrone (4), Donegal (3). These are the carefully-sourced courses.
- Within-course tightness varies enormously and means nothing on its own. Six courses are perfectly identical across all 18 holes (Portmarnock, Portsalon, The Island, Doonbeg, Narin & Portnoo, Royal Portrush Valley); County Sligo agrees on only 6 of 18. The median is 14.
- The Heath, the course I flagged, sits at **exactly that median of 14**, with a profile indistinguishable from Ballybunion Old.

A ladies card is rated for a different player off different tees; a hole that is a driver-wedge for a man can be the hardest on the course for a shorter hitter. Big divergence is the game, not a smell. **Only a par change is evidence of anything**, and `teeParProblems` already catches the case where that matters.

The general lesson is the one `docs/course-import.md` already names: eighteen pars summing correctly with a clean 1–18 index is a valid card whether or not it is *this* course's card. No statistical check distinguishes plausible-wrong from right. Corroboration between two independent sources, and a scorecard photo, are the only things that do.

## The course picker still cannot tell a researched course from a cardless one

`cardState` in `lib/courseCard.ts` gives a course three states, and `/admin/courses` shows all three. **The picker shows two.** `CourseSelect.tsx` marks `Awaiting card` on `card_verified === false` and nothing else, so a course with eighteen researched holes and a course with no card at all look identical to whoever is building a trip — and only one of them can be scored.

The reason it was not fixed with the admin side is that the picker has no hole data at all. `DirectoryCourse` (`lib/courseDirectory.ts`) carries id, name, location, county, website and `card_verified`, and all three callers feed it a plain `courses` select with no join:

- `app/trip/[tripCode]/setup/page.tsx`
- `app/trip/[tripCode]/scoring/page.tsx`
- `app/dashboard/create/CreateTripForm.tsx`

So closing it means adding a hole count to `DirectoryCourse` and to those three fetches. The tidy way is PostgREST's nested aggregate — `.select('*, holes(count)')` — which is one query and no schema change, but it is syntax this repo does not use anywhere yet and there is no database in the container to try it against. It was left rather than shipped blind into three trip-facing screens.

**Until it is done, a cardless course is a trap in the picker.** It appears under its county, carries its weather, and is chosen exactly like any other course; the round page then has no card to print and the scoring flow has nothing to score. The admin list is the only place that says so, and only somebody with the password sees it.

Same shape as the row cap in `app/admin/courses/page.tsx` that was fixed alongside it: a query written when the numbers were small, and correct only while they stay small.

## "Success. No rows returned." reads exactly like a migration that did nothing

Two generated course migrations were pasted into the Supabase SQL editor and both reported
**"Success. No rows returned."** — the correct result for a file of inserts, and
indistinguishable from a file that inserted nothing. The 37 courses were in fact all there.
The doubt was the defect.

Each generated file already carried a `-- ── Did it land? ──` block naming its own courses,
placed after the `COMMIT` precisely so it could answer this. **Every line of it was
commented out**, and `docs/course-import.md` told you to uncomment it and run it. The test
suite pinned the commenting, with the reasoning inline: "or pasting the file would run a
SELECT as live SQL."

That trade was backwards. The SELECT reads three tables and writes to none, it sits outside
the transaction, and `scripts/migrate.ts` discards results — so it cost nothing on either
path. Against that, the one instruction it depended on was "before you find out whether
this worked, first edit the file", which nobody does. **A safeguard that requires a manual
step at the moment of anxiety is not a safeguard.** The block is live now, so a paste ends
on a row per course with its hole and tee counts, and "no rows returned" from a generated
course file means something genuinely went wrong.

**A related trap, caught by an existing test rather than by review.** The verify block is
shared by both generators, and the first wording of its new prose said "every insert above
is ON CONFLICT DO NOTHING". True of a course migration, false of a tee refresh, which is
`DO UPDATE` — and `test:course-import` asserts `!/DO NOTHING/` anywhere in a refresh, so it
failed immediately. The guard was right and the prose was wrong; the wording changed, not
the assertion. Shared output needs claims true of every file that carries it.

## A research patch's batch letters are not this repo's

Cowork sends its courses as a patch that includes generated `*_platform_courses_*.sql` of
its own. Those are discarded and regenerated from the JSON — its generator is often a
different vintage with a different batch size, and it numbers from what it can see, not
from what has landed on `master` since. One of its files arrived as
`_035_platform_courses_d.sql` against the already-applied `_035_tee_par_follows_holes.sql`:
two migrations at one number, on a number half-run.

The visible consequence is that **a patch's "batch C" and "batch D" do not exist in the
repo under those names**, which reads as courses having gone missing. They have not. The
mapping is whatever each file's own `-- Platform courses batch X` line says, and
`npm run courses:migration -- --list` is the authority on which courses exist.

The rule underneath: **the migration is a projection of `data/courses/`, never the other
way round.** Because that holds, a numbering collision is a regeneration rather than an
unpicking job.

## The bulk gate was stricter than the app it feeds

`validateCourseImport` made a men's tee fatal — "a course needs at least one" — and
`validNewTee` needs par, course rating **and slope** together. Irish clubs publish
**SSS**, a CONGU scratch score, not a USGA slope. So a club could publish a flawless
scorecard and still have nothing a tee row could be written from, and the course was
refused outright.

That refused **all 24** courses of the first top-100 run's tail, including nine whose
cards were perfect and verified. The reason it went unnoticed is that the shipped 65 all
came from clubs that happened to publish ratings, so the rule never fired in anger.

The rule was also **stricter than the app**, which is the part worth remembering.
`app/api/courses/route.ts` takes `tees: []` from the add-course form without complaint,
`teeDraftBlank` skips a row nobody touched, and there is an explicit path that ships a
course whose tee insert *failed* — "The course was added, but its tees could not be
saved". A teeless course had been a normal production state the whole time. Nothing can
be mis-scored by one either: `canStart` requires a tee for every selected player, so no
tees gates a round exactly as no holes does.

**A gate in front of a pipeline should be checked against what the app already accepts.**
Where the two disagree and the app is the looser, the gate is usually the one that is
wrong — it was written from the happy path, and the app was written from what turned up.

**The badge had the matching hole.** `cardState` read hole count and the verified flag,
so a course with a card and no ratings would have said *Awaiting photo* — and a
photograph cannot fix it, because the card is not what is missing and Irish cards do not
print slope. It has a fourth state now, `unrated` / **Awaiting ratings**, and it ranks
ahead of `confirmed`: a photographed card with nothing to play off still cannot be
started, and nothing else on the row would ever say so. **The badge names the blocker,
not the paperwork.**

## Two things blocking a faster first paint that code alone cannot fix

Both came out of the round-trip and motion work and neither could be finished from
Claude Code's container. Neither affects tab-to-tab navigation — they are **first
load** costs — which is why they were reported rather than half-done.

**The Fontshare stylesheet is the one render-blocking third-party request on every
page** (`app/layout.tsx`). Archivo comes through `next/font/google`, so it is
self-hosted, subsetted and immune to somebody else's outage. Clash Display and Bespoke
Serif do not: they load from `api.fontshare.com` via a `<link rel="stylesheet">` in
`<head>`, and those are the *display* faces — every heading, every trip name, every
score. `preconnect` hints are in place and the fallback chain in `globals.css` was
chosen so a dead CDN degrades gracefully, but the request still blocks the first paint
of every screen.

The fix is `next/font/local` with the two WOFF2 files committed, which removes the
third party entirely. **Fontshare is blocked by the container's proxy**, so the files
have to be downloaded by hand and dropped into the repo before the code change is worth
making. The tempting shortcut — loading the stylesheet non-blocking with
`media="print"` and flipping it on load — was considered and not taken: it trades the
block for a visible reflow of the largest type on the screen, on the one face the
design system is most particular about.

**The `title-*.png` header artwork is heavier than it needs to be.** Two-colour
lettering at 28–66 KB each, served raw with `fetchPriority="high"` and
`decoding="sync"` in the header of the leaderboard, scoring, Trip Setup and stats
screens. As WebP, or as SVG, they would be a fraction of that. **No image tooling is
installed in the container** — and it does not need to be: `TitleMark.tsx` renders them
as plain `<img>` precisely so a file can be swapped with no code change. This is a file
replacement, not a task for a session.

**And one that is not code at all.** `vercel.json` sets no `regions`, so every function
runs in Vercel's default US region. If the Supabase project is in Europe — which an
Irish golf app plausibly is — each of the ten to twenty queries a page makes pays a
transatlantic hop, and that would outweigh every query change made here put together.
It could not be checked from the container: Supabase's API sits behind Cloudflare, so
DNS says nothing about where the database is. It is one look at the Supabase dashboard,
and if the answer is Europe, `"regions": ["dub1"]` in `vercel.json`. **Do not set it on
a guess** — pointing the functions away from the database is the same mistake in
reverse.
