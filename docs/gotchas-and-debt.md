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

## Security debt carried from Donegal Masters

`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` was exposed client-side in Donegal Masters. This is acceptable for a closed 12-person family tournament but is NOT acceptable for GripItGolf, which will be public and paid. Before any GripItGolf public launch:
- Move service role key server-side only
- Enable RLS on every tournament-instance table
- Duplicate all trip filters at the RLS layer (client filters alone are insufficient once the service role key is gone, since anon users query via anon key)

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
