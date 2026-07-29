-- ============================================================
-- GripItGolf: Pairs matchplay
--
-- A matchplay draw can now be contested by pairings rather than
-- players. A pairing IS a team of two, so the entrant is a row
-- in `teams` — which the player columns cannot hold, since they
-- carry a foreign key to `players`.
--
-- Rather than loosen those keys, each side gets a team column
-- alongside the player one, and `entrant_type` says which pair
-- of columns a bracket is using. Every constraint that guards
-- the player columns is mirrored for the team ones, so a pairs
-- draw is exactly as hard to corrupt as a singles draw.
--
-- Existing brackets are all singles. The default backfills them
-- without touching a row.
--
-- Bracket logic lives in lib/matchplay.ts; the mapping between
-- these columns and it lives in lib/matchplayStore.ts.
-- ============================================================

ALTER TABLE matchplay_matches
  ADD COLUMN IF NOT EXISTS entrant_type   TEXT NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS team_a_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS team_b_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS winner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Re-runnable: CHECK constraints have no IF NOT EXISTS
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_entrant_type;
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_entrant_columns;
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_bye_team_a;
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_bye_team_b;
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_team_distinct;
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_team_winner;

ALTER TABLE matchplay_matches
  ADD CONSTRAINT ck_matchplay_entrant_type
    CHECK (entrant_type IN ('player', 'pair')),

  -- A bracket uses one set of columns or the other, never both. Without
  -- this a half-written row could claim a player beat a pairing.
  ADD CONSTRAINT ck_matchplay_entrant_columns CHECK (
    (entrant_type = 'player'
      AND team_a_id IS NULL AND team_b_id IS NULL AND winner_team_id IS NULL)
    OR
    (entrant_type = 'pair'
      AND player_a_id IS NULL AND player_b_id IS NULL AND winner_player_id IS NULL)
  ),

  -- A bye slot holds nobody, whichever kind of entrant it would have held
  ADD CONSTRAINT ck_matchplay_bye_team_a
    CHECK (NOT (player_a_is_bye AND team_a_id IS NOT NULL)),
  ADD CONSTRAINT ck_matchplay_bye_team_b
    CHECK (NOT (player_b_is_bye AND team_b_id IS NOT NULL)),

  -- A pairing cannot play itself
  ADD CONSTRAINT ck_matchplay_team_distinct CHECK (
    team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id
  ),

  -- The winner has to be one of the two pairings in the match
  ADD CONSTRAINT ck_matchplay_team_winner CHECK (
    winner_team_id IS NULL
    OR winner_team_id = team_a_id
    OR winner_team_id = team_b_id
  );

-- A margin needs a winner, and a pairs match's winner is a pairing. The
-- constraint from migration 016 only knew about players, so a "3&2" on a
-- pairs match was refused outright.
ALTER TABLE matchplay_matches DROP CONSTRAINT IF EXISTS ck_matchplay_result;

ALTER TABLE matchplay_matches
  ADD CONSTRAINT ck_matchplay_result CHECK (
    result IS NULL
    OR ((winner_player_id IS NOT NULL OR winner_team_id IS NOT NULL)
        AND char_length(result) BETWEEN 1 AND 12)
  );

CREATE INDEX IF NOT EXISTS idx_matchplay_teams
  ON matchplay_matches(team_a_id, team_b_id);
