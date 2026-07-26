-- ============================================================
-- GripItGolf: How team points are calculated
--
-- Each team accrues points on every course played. This setting
-- decides how a team's score for a round is worked out:
--
--   hero        — the single best individual scorecard in the team
--                 counts for that round
--   better_ball — a composite card: the best N Stableford scores
--                 on each hole are added together (N = counting_scores)
--   aggregate   — every team member's score counts, over the final
--                 X holes of the round (X = aggregate_holes, 18 = all)
--
-- Stored as JSONB so new modes need no schema change.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS team_scoring JSONB NOT NULL
    DEFAULT '{"mode": "better_ball", "countingScores": 2, "aggregateHoles": 18}'::jsonb;
