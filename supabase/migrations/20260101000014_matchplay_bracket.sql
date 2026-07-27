-- ============================================================
-- GripItGolf: Matchplay bracket
--
-- One row per match in a knockout draw. The bracket is always a
-- power of two; seeds beyond the registered player count become
-- byes, and a bye is settled at generation time rather than
-- waiting for someone to confirm it.
--
-- Advancement is baked in: every match carries the match its
-- winner feeds into and which side of it they take, so recording
-- a result is a write rather than a re-derivation of the draw.
--
-- Generation logic lives in lib/matchplay.ts.
-- ============================================================

CREATE TABLE IF NOT EXISTS matchplay_matches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID        NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,

  -- Position in the draw
  round_number     SMALLINT    NOT NULL CHECK (round_number > 0),
  round_name       TEXT        NOT NULL,
  slot             SMALLINT    NOT NULL CHECK (slot >= 0),

  -- The two sides. NULL with is_bye = a bye; NULL without = not yet decided.
  player_a_id      UUID        REFERENCES players(id) ON DELETE CASCADE,
  player_b_id      UUID        REFERENCES players(id) ON DELETE CASCADE,
  player_a_is_bye  BOOLEAN     NOT NULL DEFAULT false,
  player_b_is_bye  BOOLEAN     NOT NULL DEFAULT false,

  -- Seed numbers, first round only
  seed_a           SMALLINT    CHECK (seed_a IS NULL OR seed_a > 0),
  seed_b           SMALLINT    CHECK (seed_b IS NULL OR seed_b > 0),

  winner_player_id UUID        REFERENCES players(id) ON DELETE SET NULL,

  -- Where the winner goes. NULL on the final, which advances nowhere.
  next_match_id    UUID        REFERENCES matchplay_matches(id) ON DELETE CASCADE
                                 DEFERRABLE INITIALLY DEFERRED,
  next_slot        CHAR(1)     CHECK (next_slot IN ('A', 'B')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One match per position in the draw
  CONSTRAINT uq_matchplay_slot UNIQUE (trip_id, round_number, slot),

  -- Advancement is all-or-nothing
  CONSTRAINT ck_matchplay_next CHECK (
    (next_match_id IS     NULL AND next_slot IS     NULL) OR
    (next_match_id IS NOT NULL AND next_slot IS NOT NULL)
  ),

  -- A bye slot holds nobody
  CONSTRAINT ck_matchplay_bye_a CHECK (NOT (player_a_is_bye AND player_a_id IS NOT NULL)),
  CONSTRAINT ck_matchplay_bye_b CHECK (NOT (player_b_is_bye AND player_b_id IS NOT NULL)),

  -- Both sides can never be byes: standard seeding always pairs a top-half
  -- seed with a bottom-half one, and the draw is never more than half empty.
  CONSTRAINT ck_matchplay_not_both_byes CHECK (NOT (player_a_is_bye AND player_b_is_bye)),

  -- A match cannot be played against oneself
  CONSTRAINT ck_matchplay_distinct CHECK (
    player_a_id IS NULL OR player_b_id IS NULL OR player_a_id <> player_b_id
  ),

  -- The winner has to be one of the two players
  CONSTRAINT ck_matchplay_winner CHECK (
    winner_player_id IS NULL
    OR winner_player_id = player_a_id
    OR winner_player_id = player_b_id
  )
);

CREATE INDEX IF NOT EXISTS idx_matchplay_trip
  ON matchplay_matches(trip_id, round_number, slot);
CREATE INDEX IF NOT EXISTS idx_matchplay_next
  ON matchplay_matches(next_match_id);
CREATE INDEX IF NOT EXISTS idx_matchplay_players
  ON matchplay_matches(player_a_id, player_b_id);
