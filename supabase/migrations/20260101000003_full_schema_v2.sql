-- ============================================================
-- GripItGolf Schema v2 — Consolidated Structural Migration
-- Applies all loose SQL changes from the initial release;
-- fixes live scoring table schemas; adds multi-tenant columns.
--
-- Safe to run on the existing Donegal Masters database or a
-- fresh deployment. Uses IF NOT EXISTS / DROP CONSTRAINT IF EXISTS
-- throughout so every statement is idempotent.
-- ============================================================


-- ── 1. trips: trip_code ──────────────────────────────────────
-- 6-character uppercase alphanumeric code; used for invite links
-- and quick-join without knowing the full URL slug.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS trip_code CHAR(6);

CREATE UNIQUE INDEX IF NOT EXISTS uq_trips_trip_code ON trips(trip_code)
  WHERE trip_code IS NOT NULL;


-- ── 2. players: gender, composite support, is_lead ───────────

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'M'
    CHECK (gender IN ('M', 'F')),
  ADD COLUMN IF NOT EXISTS is_composite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS composite_source_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT false;


-- ── 3. holes: ladies par/SI columns, named yardage columns ───

ALTER TABLE holes
  ADD COLUMN IF NOT EXISTS par_ladies           SMALLINT,
  ADD COLUMN IF NOT EXISTS stroke_index_ladies  SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_black        SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_blue         SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_white        SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_red          SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_sandstone    SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_slate        SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_granite      SMALLINT,
  ADD COLUMN IF NOT EXISTS yardage_claret       SMALLINT;


-- ── 4. scores: no_return flag ────────────────────────────────

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS no_return BOOLEAN NOT NULL DEFAULT false;


-- ── 5. Drop old live scoring tables ──────────────────────────
-- The initial schema defined live_rounds with a per-player unique
-- constraint (round_id, player_id), live_scores linked via
-- live_round_id, and live_player_locks using round_id.
-- The app requires: live_rounds = one row per group session (not per player);
-- live_scores keyed by (player_id, round_id, hole_number); live_player_locks
-- linked to live_rounds.id (not rounds.id).
-- Drop in reverse dependency order and recreate correctly.

DROP TABLE IF EXISTS live_player_locks;
DROP TABLE IF EXISTS live_scores;
DROP TABLE IF EXISTS live_rounds;


-- ── 6. live_rounds ───────────────────────────────────────────
-- One row per active scoring session (a group's scorecard).
-- Multiple concurrent sessions per course are permitted.

CREATE TABLE live_rounds (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            UUID        NOT NULL REFERENCES courses(id)  ON DELETE RESTRICT,
  round_id             UUID        NOT NULL REFERENCES rounds(id)   ON DELETE RESTRICT,
  status               TEXT        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'closed', 'finalised')),
  activated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by         UUID        REFERENCES players(id) ON DELETE SET NULL,
  closed_at            TIMESTAMPTZ,
  session_finalised_at TIMESTAMPTZ
);

CREATE INDEX idx_live_rounds_status ON live_rounds(status);
CREATE INDEX idx_live_rounds_round  ON live_rounds(round_id);


-- ── 7. live_scores ───────────────────────────────────────────
-- Hole-by-hole scores during active play.
-- Uses hole_number (not hole_id) so the client never needs to
-- join holes just to submit a score.

CREATE TABLE live_scores (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         UUID        NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  round_id          UUID        NOT NULL REFERENCES rounds(id)   ON DELETE CASCADE,
  hole_number       SMALLINT    NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  gross_score       SMALLINT,
  stableford_points SMALLINT,
  fairway_hit       TEXT        CHECK (fairway_hit IN ('left', 'fairway', 'right')),
  putts             SMALLINT    CHECK (putts >= 0),
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed         BOOLEAN     NOT NULL DEFAULT false,
  CONSTRAINT uq_live_scores UNIQUE (player_id, round_id, hole_number)
);

CREATE INDEX idx_live_scores_player_round ON live_scores(player_id, round_id);
CREATE INDEX idx_live_scores_round        ON live_scores(round_id);


-- ── 8. live_player_locks ─────────────────────────────────────
-- Prevents the same player from appearing in two concurrent
-- scoring sessions. CASCADE-deleted when the session closes.

CREATE TABLE live_player_locks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  live_round_id UUID        NOT NULL REFERENCES live_rounds(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES players(id)     ON DELETE CASCADE,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (live_round_id, player_id)
);

CREATE INDEX idx_live_player_locks_round ON live_player_locks(live_round_id);


-- ── 9. tees ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tees (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID        NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  name          TEXT        NOT NULL,
  gender        CHAR(1)     NOT NULL CHECK (gender IN ('M', 'F')),
  par           SMALLINT    NOT NULL,
  course_rating NUMERIC(4,1) NOT NULL,
  slope         SMALLINT    NOT NULL CHECK (slope BETWEEN 55 AND 155),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fix constraint from (course_id, name) → (course_id, name, gender) so
-- White(M) and White(F) can coexist on the same course.
ALTER TABLE tees DROP CONSTRAINT IF EXISTS uq_tees_course_name;
ALTER TABLE tees DROP CONSTRAINT IF EXISTS uq_tees_course_name_gender;
ALTER TABLE tees ADD CONSTRAINT uq_tees_course_name_gender
  UNIQUE (course_id, name, gender);

CREATE INDEX IF NOT EXISTS idx_tees_course_id ON tees(course_id);


-- ── 10. round_handicaps: tee reference ───────────────────────

ALTER TABLE round_handicaps
  ADD COLUMN IF NOT EXISTS tee_id UUID REFERENCES tees(id) ON DELETE RESTRICT;


-- ── 11. tee_times ────────────────────────────────────────────
-- Scoped directly to a trip (not just indirectly via player).
-- day_number/group_number are trip-relative (day 1 = first round).

CREATE TABLE IF NOT EXISTS tee_times (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID     NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,
  day_number   SMALLINT NOT NULL CHECK (day_number   > 0),
  group_number SMALLINT NOT NULL CHECK (group_number > 0),
  player_id    UUID     NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tee_times_trip_day_player UNIQUE (trip_id, day_number, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tee_times_trip_day ON tee_times(trip_id, day_number);


-- ── 12. composite_holes ──────────────────────────────────────
-- Tracks which source player contributed each hole to a
-- composite (best-of-group) scorecard for a given round.

CREATE TABLE IF NOT EXISTS composite_holes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  composite_player_id UUID        NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  round_id            UUID        NOT NULL REFERENCES rounds(id)  ON DELETE RESTRICT,
  hole_id             UUID        NOT NULL REFERENCES holes(id)   ON DELETE RESTRICT,
  source_player_id    UUID        NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  source_player_name  TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_composite_holes UNIQUE (composite_player_id, round_id, hole_id)
);

CREATE INDEX IF NOT EXISTS idx_composite_holes_composite
  ON composite_holes(composite_player_id, round_id);
CREATE INDEX IF NOT EXISTS idx_composite_holes_source
  ON composite_holes(source_player_id, round_id);


-- ── 13. hole_tee_yardages ────────────────────────────────────
-- Normalised yardage per hole per tee. Use this for display;
-- the denormalised yardage_* columns on holes are legacy/fallback.

CREATE TABLE IF NOT EXISTS hole_tee_yardages (
  hole_id  UUID     NOT NULL REFERENCES holes(id) ON DELETE CASCADE,
  tee_id   UUID     NOT NULL REFERENCES tees(id)  ON DELETE CASCADE,
  yardage  SMALLINT NOT NULL CHECK (yardage > 0),
  PRIMARY KEY (hole_id, tee_id)
);


-- ── 14. Updated stableford trigger ───────────────────────────
-- Handles three cases in order:
--   a) no_return  → always 0 points
--   b) composite  → preserve client-supplied stableford_points (copied from source)
--   c) normal     → calculate from gross_score, handicap, and ladies par/SI
--
-- Ladies tees apply to ALL female players on any course that has
-- par_ladies / stroke_index_ladies defined — no hardcoded course UUID.

CREATE OR REPLACE FUNCTION calculate_stableford()
RETURNS TRIGGER AS $$
DECLARE
  v_is_composite     BOOLEAN;
  v_par              SMALLINT;
  v_stroke_index     SMALLINT;
  v_playing_handicap NUMERIC(4,1);
  v_shots_received   INT;
  v_net_score        INT;
  v_gender           TEXT;
  v_par_ladies       SMALLINT;
  v_si_ladies        SMALLINT;
BEGIN
  NEW.updated_at := now();

  -- a) No Return: always 0 points
  IF NEW.no_return IS TRUE THEN
    NEW.stableford_points := 0;
    RETURN NEW;
  END IF;

  -- b) Composite players: trust the client-supplied value
  SELECT is_composite INTO v_is_composite FROM players WHERE id = NEW.player_id;
  IF v_is_composite THEN
    RETURN NEW;
  END IF;

  -- c) Normal calculation
  SELECT par, stroke_index, par_ladies, stroke_index_ladies
    INTO v_par, v_stroke_index, v_par_ladies, v_si_ladies
    FROM holes
   WHERE id = NEW.hole_id;

  SELECT playing_handicap
    INTO v_playing_handicap
    FROM round_handicaps
   WHERE round_id = NEW.round_id
     AND player_id = NEW.player_id;

  IF NEW.gross_score IS NULL OR v_playing_handicap IS NULL THEN
    NEW.stableford_points := 0;
    RETURN NEW;
  END IF;

  SELECT gender INTO v_gender FROM players WHERE id = NEW.player_id;

  -- Apply ladies par/SI for female players on any course that defines them
  IF v_gender = 'F' AND v_par_ladies IS NOT NULL AND v_si_ladies IS NOT NULL THEN
    v_par          := v_par_ladies;
    v_stroke_index := v_si_ladies;
  END IF;

  v_shots_received  := FLOOR(v_playing_handicap / 18)::INT
                     + CASE WHEN v_stroke_index <= MOD(v_playing_handicap::INT, 18)
                            THEN 1 ELSE 0 END;

  v_net_score           := NEW.gross_score - v_shots_received;
  NEW.stableford_points := GREATEST(0, v_par + 2 - v_net_score);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scores_stableford ON scores;
CREATE TRIGGER trg_scores_stableford
  BEFORE INSERT OR UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION calculate_stableford();


-- ── 15. Stale live data cleanup ───────────────────────────────
-- Closes active live_rounds older than 2 hours that have zero
-- submitted scores. Called by /api/cleanup (Vercel cron).
-- In-progress rounds (any score submitted) are never touched.

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.live_rounds
  SET    status    = 'closed',
         closed_at = now()
  WHERE  status       = 'active'
    AND  activated_at < now() - interval '2 hours'
    AND  NOT EXISTS (
           SELECT 1
           FROM   public.live_player_locks lpl
           JOIN   public.live_scores ls
                  ON  ls.player_id = lpl.player_id
                  AND ls.round_id  = live_rounds.round_id
           WHERE  lpl.live_round_id = live_rounds.id
         );
END;
$$;

-- Uncomment to schedule via pg_cron (Database > Extensions):
-- SELECT cron.schedule(
--   'cleanup-stale-live-data',
--   '0 * * * *',
--   'SELECT public.cleanup_stale_live_data()'
-- );
