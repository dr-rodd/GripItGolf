-- ============================================================
-- DONEGAL MASTERS - DATABASE SCHEMA
-- Run this in the Supabase SQL editor in order.
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE player_role AS ENUM ('dad', 'mum', 'child');
CREATE TYPE round_status AS ENUM ('upcoming', 'active', 'completed');


-- ============================================================
-- TEAMS
-- ============================================================

CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL,  -- hex color for UI, e.g. '#E63946'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- PLAYERS
-- ============================================================

CREATE TABLE players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  role       player_role NOT NULL,
  handicap   NUMERIC(4,1) NOT NULL CHECK (handicap >= 0 AND handicap <= 54),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_team_id ON players(team_id);

-- Enforce max 1 dad and 1 mum per team at the DB level
CREATE UNIQUE INDEX idx_players_team_dad ON players(team_id) WHERE role = 'dad';
CREATE UNIQUE INDEX idx_players_team_mum ON players(team_id) WHERE role = 'mum';


-- ============================================================
-- COURSES
-- ============================================================

CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,  -- 'Sandy Hills', 'Old Tom Morris', 'St Patrick Links'
  total_holes SMALLINT NOT NULL DEFAULT 18 CHECK (total_holes > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- HOLES
-- ============================================================

CREATE TABLE holes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  hole_number  SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par          SMALLINT NOT NULL CHECK (par BETWEEN 3 AND 5),
  stroke_index SMALLINT NOT NULL CHECK (stroke_index BETWEEN 1 AND 18),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_holes_course_hole         UNIQUE (course_id, hole_number),
  CONSTRAINT uq_holes_course_stroke_index UNIQUE (course_id, stroke_index)
);

CREATE INDEX idx_holes_course_id ON holes(course_id);


-- ============================================================
-- ROUNDS
-- Each round is played on one course. One course per round.
-- ============================================================

CREATE TABLE rounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  round_number SMALLINT NOT NULL CHECK (round_number BETWEEN 1 AND 3),
  status       round_status NOT NULL DEFAULT 'upcoming',
  played_on    DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_rounds_course UNIQUE (course_id),
  CONSTRAINT uq_rounds_number UNIQUE (round_number)
);


-- ============================================================
-- ROUND HANDICAPS
-- Snapshot of each player's playing handicap per round.
-- Use this (not players.handicap) for all stableford calculations
-- so historical scores remain correct if handicaps change.
-- ============================================================

CREATE TABLE round_handicaps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  playing_handicap SMALLINT NOT NULL CHECK (playing_handicap >= 0 AND playing_handicap <= 54),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_round_handicaps_round_player UNIQUE (round_id, player_id)
);

CREATE INDEX idx_round_handicaps_round_id  ON round_handicaps(round_id);
CREATE INDEX idx_round_handicaps_player_id ON round_handicaps(player_id);


-- ============================================================
-- SCORES
-- One row per player per hole per round.
-- stableford_points is auto-calculated by trigger on insert/update.
-- ============================================================

CREATE TABLE scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id          UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  hole_id           UUID NOT NULL REFERENCES holes(id) ON DELETE RESTRICT,
  gross_score       SMALLINT NOT NULL CHECK (gross_score BETWEEN 1 AND 20),
  stableford_points SMALLINT NOT NULL DEFAULT 0 CHECK (stableford_points BETWEEN 0 AND 8),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_scores_round_player_hole UNIQUE (round_id, player_id, hole_id)
);

CREATE INDEX idx_scores_round_hole   ON scores(round_id, hole_id);
CREATE INDEX idx_scores_round_player ON scores(round_id, player_id);
CREATE INDEX idx_scores_player_id    ON scores(player_id);


-- ============================================================
-- TRIGGER: Auto-calculate stableford_points on scores insert/update
--
-- Formula:
--   shots_received = FLOOR(handicap / 18) + (1 if stroke_index <= handicap % 18)
--   net_score      = gross_score - shots_received
--   points         = GREATEST(0, par + 2 - net_score)
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_stableford()
RETURNS TRIGGER AS $$
DECLARE
  v_par              SMALLINT;
  v_stroke_index     SMALLINT;
  v_playing_handicap SMALLINT;
  v_shots_received   SMALLINT;
  v_net_score        SMALLINT;
  v_gender           TEXT;
  v_course_id        UUID;
  v_par_ladies       SMALLINT;
  v_si_ladies        SMALLINT;
BEGIN
  SELECT par, stroke_index, par_ladies, stroke_index_ladies, course_id
    INTO v_par, v_stroke_index, v_par_ladies, v_si_ladies, v_course_id
    FROM holes
   WHERE id = NEW.hole_id;

  SELECT playing_handicap
    INTO v_playing_handicap
    FROM round_handicaps
   WHERE round_id = NEW.round_id
     AND player_id = NEW.player_id;

  SELECT gender INTO v_gender FROM players WHERE id = NEW.player_id;

  -- Use ladies par/stroke_index for female players on St Patrick's course
  IF v_gender = 'F'
     AND v_course_id = '11111111-0000-0000-0000-000000000003'
     AND v_par_ladies IS NOT NULL
     AND v_si_ladies IS NOT NULL
  THEN
    v_par          := v_par_ladies;
    v_stroke_index := v_si_ladies;
  END IF;

  v_shots_received := FLOOR(v_playing_handicap::numeric / 18)::smallint
                    + CASE WHEN v_stroke_index <= (v_playing_handicap % 18) THEN 1 ELSE 0 END;

  v_net_score := NEW.gross_score - v_shots_received;
  NEW.stableford_points := GREATEST(0, v_par + 2 - v_net_score);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scores_stableford
  BEFORE INSERT OR UPDATE OF gross_score ON scores
  FOR EACH ROW
  EXECUTE FUNCTION calculate_stableford();


-- ============================================================
-- TRIGGER: updated_at maintenance
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rounds_updated_at
  BEFORE UPDATE ON rounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_scores_updated_at
  BEFORE UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- VIEW: Hole-by-hole leaderboard
-- Best stableford score per hole per team per round.
-- ============================================================

CREATE OR REPLACE VIEW leaderboard_by_round AS
SELECT
  r.id                     AS round_id,
  r.round_number,
  c.name                   AS course_name,
  t.id                     AS team_id,
  t.name                   AS team_name,
  t.color                  AS team_color,
  h.hole_number,
  h.par,
  MAX(s.stableford_points) AS best_stableford_points,
  SUM(MAX(s.stableford_points)) OVER (
    PARTITION BY r.id, t.id
    ORDER BY h.hole_number
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                        AS running_team_total
FROM scores s
JOIN players p ON p.id = s.player_id
JOIN teams   t ON t.id = p.team_id
JOIN holes   h ON h.id = s.hole_id
JOIN rounds  r ON r.id = s.round_id
JOIN courses c ON c.id = r.course_id
GROUP BY
  r.id, r.round_number,
  c.name,
  t.id, t.name, t.color,
  h.hole_number, h.par
ORDER BY
  r.round_number,
  h.hole_number,
  t.name;


-- ============================================================
-- VIEW: Overall leaderboard summary (total points per team per round)
-- ============================================================

CREATE OR REPLACE VIEW leaderboard_summary AS
SELECT
  round_id,
  round_number,
  course_name,
  team_id,
  team_name,
  team_color,
  SUM(best_stableford_points) AS total_team_points,
  COUNT(hole_number)          AS holes_completed
FROM leaderboard_by_round
GROUP BY
  round_id, round_number, course_name,
  team_id, team_name, team_color
ORDER BY
  round_number,
  total_team_points DESC;
