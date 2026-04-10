-- ============================================================
-- DONEGAL MASTERS — TEES
-- Run in Supabase SQL editor
-- ============================================================

-- ── Tees table ──────────────────────────────────────────────

CREATE TABLE tees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,              -- 'Yellow', 'White', 'Blue', 'Red'
  gender        CHAR(1) NOT NULL CHECK (gender IN ('M', 'F')),
  par           SMALLINT NOT NULL,
  course_rating NUMERIC(4,1) NOT NULL,
  slope         SMALLINT NOT NULL CHECK (slope BETWEEN 55 AND 155),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_tees_course_name UNIQUE (course_id, name)
);

CREATE INDEX idx_tees_course_id ON tees(course_id);

-- ── Add tee reference to round_handicaps ────────────────────

ALTER TABLE round_handicaps
  ADD COLUMN tee_id UUID REFERENCES tees(id) ON DELETE RESTRICT;

-- ── Seed tees ───────────────────────────────────────────────
-- Course IDs match seed_2_data.sql fixed UUIDs

-- Sandy Hills
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Yellow', 'M', 72, 73.2, 127),
  ('11111111-0000-0000-0000-000000000001', 'Blue',   'M', 72, 71.0, 121),
  ('11111111-0000-0000-0000-000000000001', 'Red',    'F', 72, 71.0, 117);

-- Old Tom Morris
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000002', 'Yellow', 'M', 71, 70.0, 122),
  ('11111111-0000-0000-0000-000000000002', 'Red',    'F', 71, 70.0, 113);

-- St Patricks Links
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000003', 'Yellow', 'M', 71, 73.2, 128),
  ('11111111-0000-0000-0000-000000000003', 'Red',    'F', 71, 73.2, 120);
