# Schema and scoring

## Database schema

### Core tables

| Table | Description |
|---|---|
| `trips` | Top-level. `name`, `slug`, `trip_code` (6-char unique), `status`, `formats` (JSONB), `num_teams`, `setup_status`, `edit_permission`, `finalised_at`, `start_date`, `end_date`, `created_at` |
| `tees` | Scoped to `course_id`. `name` (colour), `gender`, `par`, `course_rating`, `slope`. Unique on `(course_id, name, gender)` |
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
- A course may be played more than once per trip (the original `(trip_id, course_id)` unique constraint was dropped in migration 017). Round numbers are still unique within a trip.
- `players.trip_id` must match `teams.trip_id`
- Composite players have `team_id = NULL` — always fetch flat, never via nested PostgREST

## Stableford scoring (canonical — do not deviate)

Calculated by PostgreSQL trigger `trg_scores_stableford` on every insert/update to `scores`.
```
shots_received = FLOOR(handicap / 18) + (1 if stroke_index <= handicap % 18 else 0)
net_score      = gross_score - shots_received
points         = GREATEST(0, par + 2 - net_score)
```

- NR = 0 points
- Max nett capped at score giving 0 points (net double bogey)
- Leaderboard display: relative to 2pts/hole baseline. 36 points = "E", 38 = "+2"
- Team leaderboard: best individual stableford score per hole per team, summed across 18 holes

Handicap formula is full Golf Ireland WHS: `PH = HI × Slope ÷ 113 + CR − Par`. No 95% allowance. Do not truncate HI before the slope multiplication. Fetch `round_handicaps` live alongside scores so PH doesn't show as 0 on live leaderboards.

Ladies tees apply across **all** courses, not just one — stableford triggers, `effectivePar`, and `effectiveSI` must pull gender-specific par and stroke index for every course. Never special-case one course.

## Player states (live scoring)

| State | Description |
|---|---|
| Available | Not in any active scorecard this session |
| Active | Assigned to an in-progress scorecard |
| Finalised | Scorecard completed and committed |

One state at a time. Finalised players cannot be reselected unless manually unfinalised via settings.

Gender-specific tee auto-selection: on player setup and session resume, auto-select Blue/Slate for men and Red/Claret for women. Don't make users do this manually — they'll forget and score against the wrong tees.

### Leaving a card and coming back

**`live_scores` is the record of a round in progress, not the component's state.** Every hole is written there as it is entered. The card in memory is a view of it, and a view can be incomplete — a resume that failed, a reload, a second device.

**A hole is only a no return when nothing anywhere has a score for it.** `lib/liveScores.ts` (`mergeSaved`) folds what was saved into the card before commit decides anything, and memory wins only where it actually has an answer. Committing from memory alone is what caused a live data-loss bug: the resume asked `live_scores` for `no_return` — a column that exists on `scores` and not on `live_scores` — so the select failed, a `?? []` swallowed the error, the card opened blank on hole 1, and committing after re-entering a few holes wrote the rest of the round off as NRs with a max score.

Three rules came out of it, and all three are pinned:

- **Never ask `live_scores` for `no_return`.** An NR in live play is stored as its max-gross equivalent; there is no flag to read.
- **A read that fails must not fall through to a blank card.** Blank is indistinguishable from "nothing played yet", and the next commit writes that over the real round. The resume shows the failure and refuses to open.
- **Commit reconciles before it writes**, refuses an entirely blank card, and no longer deletes the round's scores first — every hole is upserted anyway, so the delete removed nothing the upsert would not have replaced while opening a window where a failure between the two left the round with none.

**Every entry point that can open a card must pass `autoResume`.** The trip dashboard does; the legacy `/scoring` route did not, so "Join Live Round" always started at player setup however far the round had got.

**Session resume must restore confirmed playing handicaps.** When a scoring session resumes after an interruption, the confirmed `round_handicaps` row must be restored to the UI — writing new `round_handicaps` rows at session start, then failing to re-read them on resume, causes PH to display as zero.

## Tee data

The `tees` table drives tee selection in live scoring and the WHS playing-handicap calculation. It was empty in production until July 2026 — tee selection was permanently blocked on every platform course.

- **Migration 008** — all 22 platform courses. Real tee colours, par, CR and slope researched from club sites and golf databases. Confidence is noted per course in the file comments.
- **Migration 009** — the three Rosapenna courses, using certified figures from the Donegal Masters 2026 scorecards.

**Still estimated, needs a real scorecard:** Ballyliffin Old (no WHS data published anywhere), Portsalon, Royal Portrush Valley (redesigned post-2019 Open, databases stale), Narin & Portnoo (Gil Hanse redesign changed par 73 → 70, databases stale). Ladies par is estimated on The Island and Doonbeg.

When adding a course, insert its tees in the same migration. A course with no tee rows cannot be scored.
