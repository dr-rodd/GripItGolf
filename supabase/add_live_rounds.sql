-- ============================================================
-- LIVE ROUNDS TABLE
-- Tracks which round is currently being played live.
-- One active live round per course enforced via partial unique index.
-- ============================================================

CREATE TABLE live_rounds (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID        NOT NULL REFERENCES courses(id)  ON DELETE RESTRICT,
  round_id     UUID        NOT NULL REFERENCES rounds(id)   ON DELETE RESTRICT,
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'closed')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by UUID        REFERENCES players(id) ON DELETE SET NULL,
  closed_at    TIMESTAMPTZ
);

-- Only one active live round per course at a time
CREATE UNIQUE INDEX uq_live_rounds_active_course
  ON live_rounds(course_id) WHERE status = 'active';

CREATE INDEX idx_live_rounds_status ON live_rounds(status);

-- Allow anon reads/writes (consistent with rest of app)
ALTER TABLE live_rounds DISABLE ROW LEVEL SECURITY;
