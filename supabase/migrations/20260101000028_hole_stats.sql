-- ═══════════════════════════════════════════════════════════════
-- Migration 028 — hole stats on the committed card
-- ═══════════════════════════════════════════════════════════════
--
-- `live_scores` has carried `fairway_hit` and `putts` since migration 003 and
-- nothing has ever written them (§7 of that file). `scores` has neither, so
-- anything captured during play was stranded on a table the leaderboard
-- treats as phantom the moment the card closes — see
-- docs/gotchas-and-debt.md, "Phantom in-progress scores".
--
-- These two columns are the other half of that pair, named and constrained
-- identically so **one row shape serves both tables** and a commit is a copy
-- rather than a translation.
--
-- Greens in regulation is deliberately NOT a column. It is `gross - putts <=
-- par - 2`, it needs the player's own par (a ladies card and a men's disagree
-- about the same hole), and a stored copy is a second answer waiting to drift
-- from the first. lib/holeStats.ts is the only place that rule is written.
--
-- Replay-safe: there is no migration ledger — `npm run migrate` with no
-- arguments runs every file in this directory, every time.

-- ── 1. The two stats, on the committed card ────────────────────
--
-- Nullable, and nothing is backfilled. A hole played before this migration
-- has no answer, which is different from an answer of zero: nobody was asked.
-- A trip that never turns stats on writes nulls for ever, and that is a
-- legitimate steady state rather than missing data.

ALTER TABLE scores ADD COLUMN IF NOT EXISTS putts       SMALLINT;
ALTER TABLE scores ADD COLUMN IF NOT EXISTS fairway_hit TEXT;

-- Dropped before being added so the constraint can be corrected by editing
-- this file, rather than needing a migration to undo a migration.
ALTER TABLE scores DROP CONSTRAINT IF EXISTS ck_scores_putts;
ALTER TABLE scores ADD  CONSTRAINT ck_scores_putts
  CHECK (putts IS NULL OR putts >= 0);

-- The same three values as `live_scores.fairway_hit`, verbatim. 'fairway' is
-- the hit; 'left' and 'right' are which side it missed. A par 3 stores NULL —
-- there is no fairway to find, which is not the same as missing one.
ALTER TABLE scores DROP CONSTRAINT IF EXISTS ck_scores_fairway_hit;
ALTER TABLE scores ADD  CONSTRAINT ck_scores_fairway_hit
  CHECK (fairway_hit IS NULL OR fairway_hit IN ('left', 'fairway', 'right'));

-- ── 2. Opt-in, per trip ────────────────────────────────────────
--
-- Off by default. Fairways and putts are two more taps per player per hole,
-- and on a fourball card that is real: a group that did not ask for it should
-- see the scorecard exactly as it is today. The lead player turns it on in
-- the Trip Settings drawer.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS track_stats BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN scores.putts       IS 'Putts on this hole. NULL = not recorded, never 0-by-default.';
COMMENT ON COLUMN scores.fairway_hit IS 'left | fairway | right. NULL on a par 3 and when not recorded.';
COMMENT ON COLUMN trips.track_stats  IS 'Ask for fairways and putts during scoring. Off unless the trip opts in.';

-- ── 3. What this does NOT touch ────────────────────────────────
--
-- `trg_scores_stableford` needs no change. `calculate_stableford()` (migration
-- 024) is BEFORE INSERT OR UPDATE, reads NEW.gross_score and writes
-- NEW.stableford_points; new columns ride through untouched.
--
-- Worth knowing rather than fixing: because it is a row trigger with no
-- column list, an update that only corrects a putt count still re-runs the
-- whole stableford calculation and re-reads `round_handicaps`. Harmless, and
-- not free.
