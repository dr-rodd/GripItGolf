-- ============================================================
-- GripItGolf: Multiple competition formats per trip
--
-- Replaces the single-choice group_style / competition_style
-- pair with a set of independently toggleable formats. A trip
-- can run Individual Stableford and Team Play at the same time;
-- the leaderboard shows a tab per enabled format.
--
-- formats keys (all boolean):
--   individual_stableford — total Stableford points
--   individual_strokes    — gross and nett strokeplay
--   individual_matchplay  — head-to-head, round robin
--   teams                 — team competition, best 2 of 3 per hole
--
-- Stored as JSONB so new formats need no schema change.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS formats JSONB NOT NULL
    DEFAULT '{"individual_stableford": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS num_teams INTEGER NOT NULL DEFAULT 2
    CHECK (num_teams BETWEEN 2 AND 12);

-- Carry existing trips over from the old single-choice columns.
-- Only touch trips still on the default, so re-running is safe.
UPDATE trips
SET formats = jsonb_build_object(
      'individual_stableford', true,
      'individual_matchplay',  COALESCE(competition_style, 'league') = 'matchplay',
      'teams',                 COALESCE(group_style, 'individual')   = 'teams'
    )
WHERE formats = '{"individual_stableford": true}'::jsonb;

-- Set num_teams from the teams each trip actually has
UPDATE trips t
SET num_teams = GREATEST(2, LEAST(12, sub.team_count))
FROM (
  SELECT trip_id, COUNT(*)::int AS team_count
  FROM teams
  GROUP BY trip_id
) sub
WHERE sub.trip_id = t.id AND sub.team_count >= 2;
