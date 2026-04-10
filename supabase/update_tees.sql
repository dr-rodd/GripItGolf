-- ============================================================
-- DONEGAL MASTERS — UPDATE TEES
-- Deletes existing tee data and re-seeds with correct values.
-- Run in Supabase SQL editor.
-- ============================================================

-- Nullify tee_id references in round_handicaps before deleting
UPDATE round_handicaps SET tee_id = NULL WHERE tee_id IS NOT NULL;

-- Delete existing tees
DELETE FROM tees;

-- ============================================================
-- SANDY HILLS
-- Course ID: 11111111-0000-0000-0000-000000000001
-- ============================================================

-- Men (par 72) — sorted hardest to easiest by slope
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Black', 'M', 72, 73.2, 127),
  ('11111111-0000-0000-0000-000000000001', 'Blue',  'M', 72, 71.0, 121),
  ('11111111-0000-0000-0000-000000000001', 'White', 'M', 72, 68.9, 117);

-- Ladies (par 71)
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Red',   'F', 71, 69.3, 119);

-- ============================================================
-- OLD TOM MORRIS
-- Course ID: 11111111-0000-0000-0000-000000000002
-- ============================================================

-- Men (par 71) — sorted hardest to easiest by slope
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000002', 'Black', 'M', 71, 73.1, 126),
  ('11111111-0000-0000-0000-000000000002', 'Blue',  'M', 71, 71.0, 123),
  ('11111111-0000-0000-0000-000000000002', 'White', 'M', 71, 69.5, 121),
  ('11111111-0000-0000-0000-000000000002', 'Red',   'M', 71, 65.0, 104);

-- Ladies (par 71) — sorted hardest to easiest by slope
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000002', 'White', 'F', 71, 76.0, 130),
  ('11111111-0000-0000-0000-000000000002', 'Red',   'F', 71, 70.5, 114);

-- ============================================================
-- ST PATRICKS LINKS
-- Course ID: 11111111-0000-0000-0000-000000000003
-- ============================================================

-- Men (par 71) — sorted hardest to easiest by slope
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000003', 'Sandstone', 'M', 71, 73.2, 128),
  ('11111111-0000-0000-0000-000000000003', 'Slate',     'M', 71, 71.0, 125),
  ('11111111-0000-0000-0000-000000000003', 'Granite',   'M', 71, 68.7, 121),
  ('11111111-0000-0000-0000-000000000003', 'Claret',    'M', 71, 64.6, 104);

-- Ladies (par 72) — sorted hardest to easiest by slope
INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
  ('11111111-0000-0000-0000-000000000003', 'Granite', 'F', 72, 74.3, 129),
  ('11111111-0000-0000-0000-000000000003', 'Claret',  'F', 72, 70.1, 119);
