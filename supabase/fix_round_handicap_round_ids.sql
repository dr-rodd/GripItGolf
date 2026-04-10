-- Fix round_handicap round_ids after round-course reassignment.
-- Old mapping: Round 1 = Sandy Hills, Round 3 = St Patricks
-- New mapping: Round 2 = St Patricks, Round 3 = Sandy Hills
--
-- For players who have Round 2 scores (St Patricks) but no Round 2 handicap,
-- copy their Round 3 handicap (which was entered for old St Patricks) to Round 2.
-- Then update their Round 3 handicap to reflect the Sandy Hills round.
--
-- Do this atomically by dropping and recreating the unique constraint.

ALTER TABLE round_handicaps DROP CONSTRAINT IF EXISTS uq_round_handicaps_round_player;

UPDATE round_handicaps
SET round_id = CASE round_id
  WHEN '22222222-0000-0000-0000-000000000001'::uuid THEN '22222222-0000-0000-0000-000000000003'::uuid
  WHEN '22222222-0000-0000-0000-000000000003'::uuid THEN '22222222-0000-0000-0000-000000000002'::uuid
END
WHERE round_id IN (
  '22222222-0000-0000-0000-000000000001'::uuid,
  '22222222-0000-0000-0000-000000000003'::uuid
)
-- Only update players whose Round 1 handicap is orphaned (no Round 1 scores)
AND player_id NOT IN (
  SELECT DISTINCT player_id FROM scores
  WHERE round_id = '22222222-0000-0000-0000-000000000001'::uuid
);

ALTER TABLE round_handicaps ADD CONSTRAINT uq_round_handicaps_round_player UNIQUE (round_id, player_id);
