-- ============================================================
-- LIVE PLAYER LOCKS TABLE
-- Tracks which players are actively in a live scoring session.
-- Prevents the same player being picked on multiple devices.
-- Automatically cleared when the live round is closed (CASCADE).
-- ============================================================

CREATE TABLE live_player_locks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  live_round_id UUID        NOT NULL REFERENCES live_rounds(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES players(id)     ON DELETE CASCADE,
  locked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(live_round_id, player_id)
);

CREATE INDEX idx_live_player_locks_round ON live_player_locks(live_round_id);

ALTER TABLE live_player_locks DISABLE ROW LEVEL SECURITY;
