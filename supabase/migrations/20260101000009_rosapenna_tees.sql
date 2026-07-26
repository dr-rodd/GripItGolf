-- ============================================================
-- GripItGolf: Real tee data for Rosapenna Resort courses
-- CR and slope data from official Donegal Masters 2026 scorecards
-- (sourced during DM app build; stored as comments in migration 002).
--
-- These courses are trip-scoped (trip_id IS NOT NULL) so they are
-- excluded from migration 008's platform-course INSERT.
-- Running this migration adds proper WHS tee data for scoring.
-- ============================================================

-- Old Tom Morris (bbbbbbbb-0000-0000-0000-000000000001)
-- Men: par 71, CR 70.0, slope 122
-- Women: par 71, CR 70.0, slope 113
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT id, 'Blue',  'M', 71, 70.0, 122 FROM courses WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM tees WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000001' AND name = 'Blue'  AND gender = 'M');
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT id, 'Red',   'F', 71, 70.0, 113 FROM courses WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM tees WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000001' AND name = 'Red'   AND gender = 'F');

-- St Patricks Links (bbbbbbbb-0000-0000-0000-000000000002)
-- Men: par 71, CR 73.2, slope 128
-- Women: par 72, CR 73.2, slope 120
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT id, 'Blue',  'M', 71, 73.2, 128 FROM courses WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  AND NOT EXISTS (SELECT 1 FROM tees WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND name = 'Blue'  AND gender = 'M');
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT id, 'Red',   'F', 72, 73.2, 120 FROM courses WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  AND NOT EXISTS (SELECT 1 FROM tees WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND name = 'Red'   AND gender = 'F');

-- Sandy Hills (bbbbbbbb-0000-0000-0000-000000000003)
-- Men: par 72, CR 73.2, slope 127
-- Women: par 72, CR 71.0, slope 117
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT id, 'Blue',  'M', 72, 73.2, 127 FROM courses WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003'
  AND NOT EXISTS (SELECT 1 FROM tees WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000003' AND name = 'Blue'  AND gender = 'M');
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT id, 'Red',   'F', 72, 71.0, 117 FROM courses WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003'
  AND NOT EXISTS (SELECT 1 FROM tees WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000003' AND name = 'Red'   AND gender = 'F');
