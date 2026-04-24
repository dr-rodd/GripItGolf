-- ============================================================
-- Platform courses: Old Tom Morris, St Patricks Links, Sandy Hills
-- Standalone rows with trip_id = NULL — available to any trip.
-- Hole data sourced from migration 20260101000002_seed_courses.sql.
-- ============================================================

-- 1. Make courses.trip_id nullable so platform courses can exist
--    without a trip. Trip-scoped courses retain cascade deletion.
ALTER TABLE courses ALTER COLUMN trip_id DROP NOT NULL;

-- 2. Prevent two platform courses sharing the same slug.
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_platform_slug
  ON courses(slug) WHERE trip_id IS NULL;

-- 3. Per-round scheduled date (optional, set during trip creation).
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- ============================================================
-- COURSES
-- Fixed UUIDs allow idempotent re-runs via ON CONFLICT (id).
-- ============================================================

INSERT INTO courses (id, trip_id, name, slug, location) VALUES
  ('cccccccc-0000-0000-0000-000000000001', NULL, 'Old Tom Morris',     'old-tom-morris',     'Rosapenna Resort, Co. Donegal'),
  ('cccccccc-0000-0000-0000-000000000002', NULL, 'St Patricks Links',  'st-patricks-links',  'Rosapenna Resort, Co. Donegal'),
  ('cccccccc-0000-0000-0000-000000000003', NULL, 'Sandy Hills',        'sandy-hills',        'Rosapenna Resort, Co. Donegal')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- HOLES — Old Tom Morris  (par 71 men / 71 ladies)
-- ============================================================

INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies) VALUES
  ('cccccccc-0000-0000-0000-000000000001',  1, 4,  6, 4, 14),
  ('cccccccc-0000-0000-0000-000000000001',  2, 3, 18, 3, 18),
  ('cccccccc-0000-0000-0000-000000000001',  3, 4,  4, 4, 10),
  ('cccccccc-0000-0000-0000-000000000001',  4, 4, 12, 4,  2),
  ('cccccccc-0000-0000-0000-000000000001',  5, 4,  8, 4,  8),
  ('cccccccc-0000-0000-0000-000000000001',  6, 4,  2, 4,  6),
  ('cccccccc-0000-0000-0000-000000000001',  7, 3, 16, 3, 16),
  ('cccccccc-0000-0000-0000-000000000001',  8, 5, 14, 5,  4),
  ('cccccccc-0000-0000-0000-000000000001',  9, 4, 10, 4, 12),
  ('cccccccc-0000-0000-0000-000000000001', 10, 4,  5, 4,  7),
  ('cccccccc-0000-0000-0000-000000000001', 11, 4,  1, 5, 13),
  ('cccccccc-0000-0000-0000-000000000001', 12, 4,  7, 4,  1),
  ('cccccccc-0000-0000-0000-000000000001', 13, 4, 15, 4, 17),
  ('cccccccc-0000-0000-0000-000000000001', 14, 3, 13, 3,  9),
  ('cccccccc-0000-0000-0000-000000000001', 15, 4,  3, 4,  5),
  ('cccccccc-0000-0000-0000-000000000001', 16, 5, 17, 5, 11),
  ('cccccccc-0000-0000-0000-000000000001', 17, 3, 11, 3, 15),
  ('cccccccc-0000-0000-0000-000000000001', 18, 5,  9, 5,  3)
ON CONFLICT (course_id, hole_number) DO NOTHING;

-- ============================================================
-- HOLES — St Patricks Links  (par 71 men / 72 ladies)
-- ============================================================

INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies) VALUES
  ('cccccccc-0000-0000-0000-000000000002',  1, 4,  9, 4,  7),
  ('cccccccc-0000-0000-0000-000000000002',  2, 4, 11, 4, 11),
  ('cccccccc-0000-0000-0000-000000000002',  3, 3, 17, 3, 17),
  ('cccccccc-0000-0000-0000-000000000002',  4, 5,  5, 5,  3),
  ('cccccccc-0000-0000-0000-000000000002',  5, 3, 13, 3, 13),
  ('cccccccc-0000-0000-0000-000000000002',  6, 5,  7, 5,  1),
  ('cccccccc-0000-0000-0000-000000000002',  7, 4,  3, 4,  9),
  ('cccccccc-0000-0000-0000-000000000002',  8, 4, 15, 4, 15),
  ('cccccccc-0000-0000-0000-000000000002',  9, 4,  1, 4,  5),
  ('cccccccc-0000-0000-0000-000000000002', 10, 4,  8, 4,  6),
  ('cccccccc-0000-0000-0000-000000000002', 11, 4,  6, 4,  4),
  ('cccccccc-0000-0000-0000-000000000002', 12, 5,  4, 5,  2),
  ('cccccccc-0000-0000-0000-000000000002', 13, 4, 12, 4, 12),
  ('cccccccc-0000-0000-0000-000000000002', 14, 4, 10, 4, 10),
  ('cccccccc-0000-0000-0000-000000000002', 15, 3, 18, 3, 18),
  ('cccccccc-0000-0000-0000-000000000002', 16, 4,  2, 5,  8),
  ('cccccccc-0000-0000-0000-000000000002', 17, 3, 14, 3, 16),
  ('cccccccc-0000-0000-0000-000000000002', 18, 4, 16, 4, 14)
ON CONFLICT (course_id, hole_number) DO NOTHING;

-- ============================================================
-- HOLES — Sandy Hills  (par 72 men / 72 ladies)
-- ============================================================

INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies) VALUES
  ('cccccccc-0000-0000-0000-000000000003',  1, 5, 13, 4,  5),
  ('cccccccc-0000-0000-0000-000000000003',  2, 4,  3, 4, 13),
  ('cccccccc-0000-0000-0000-000000000003',  3, 3, 17, 3,  7),
  ('cccccccc-0000-0000-0000-000000000003',  4, 4, 11, 4, 11),
  ('cccccccc-0000-0000-0000-000000000003',  5, 4,  5, 4,  1),
  ('cccccccc-0000-0000-0000-000000000003',  6, 4,  1, 4, 15),
  ('cccccccc-0000-0000-0000-000000000003',  7, 3, 15, 3, 17),
  ('cccccccc-0000-0000-0000-000000000003',  8, 5,  9, 5,  9),
  ('cccccccc-0000-0000-0000-000000000003',  9, 4,  7, 4,  3),
  ('cccccccc-0000-0000-0000-000000000003', 10, 4,  6, 4, 12),
  ('cccccccc-0000-0000-0000-000000000003', 11, 3, 12, 3, 10),
  ('cccccccc-0000-0000-0000-000000000003', 12, 4, 10, 4, 16),
  ('cccccccc-0000-0000-0000-000000000003', 13, 5,  8, 5,  2),
  ('cccccccc-0000-0000-0000-000000000003', 14, 4, 18, 4, 18),
  ('cccccccc-0000-0000-0000-000000000003', 15, 4,  2, 4,  8),
  ('cccccccc-0000-0000-0000-000000000003', 16, 3, 14, 3, 14),
  ('cccccccc-0000-0000-0000-000000000003', 17, 5, 16, 5,  4),
  ('cccccccc-0000-0000-0000-000000000003', 18, 4,  4, 4,  6)
ON CONFLICT (course_id, hole_number) DO NOTHING;
