-- ============================================================
-- GripItGolf: Matchplay result margins
--
-- A knockout match is reported by its margin, not a score: "3&2"
-- (three up with two to play), "2 up", "1 up". Free text rather than
-- a pair of numbers, because the conventional forms do not all reduce
-- to the same shape and the display is the point.
--
-- Only set alongside a winner, and never on a bye — a bye is awarded,
-- not played, so it has a winner but no margin.
-- ============================================================

ALTER TABLE matchplay_matches
  ADD COLUMN IF NOT EXISTS result TEXT;

ALTER TABLE matchplay_matches
  DROP CONSTRAINT IF EXISTS ck_matchplay_result;

ALTER TABLE matchplay_matches
  ADD CONSTRAINT ck_matchplay_result CHECK (
    result IS NULL
    OR (winner_player_id IS NOT NULL AND char_length(result) BETWEEN 1 AND 12)
  );
