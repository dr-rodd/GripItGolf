-- ============================================================
-- LIVE SCORES TABLE
-- Stores in-progress hole-by-hole scores during live play.
-- Separate from the official `scores` table until committed.
-- ============================================================

CREATE TABLE live_scores (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID        NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  round_id         UUID        NOT NULL REFERENCES rounds(id)   ON DELETE CASCADE,
  hole_number      SMALLINT    NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  gross_score      SMALLINT,
  stableford_points SMALLINT,
  fairway_hit      TEXT        CHECK (fairway_hit IN ('left', 'fairway', 'right')),
  putts            SMALLINT    CHECK (putts >= 0),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed        BOOLEAN     NOT NULL DEFAULT false,
  CONSTRAINT uq_live_scores UNIQUE (player_id, round_id, hole_number)
);

CREATE INDEX idx_live_scores_player_round ON live_scores(player_id, round_id);
CREATE INDEX idx_live_scores_round        ON live_scores(round_id);
