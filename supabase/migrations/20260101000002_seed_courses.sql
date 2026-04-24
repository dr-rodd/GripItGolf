-- ============================================================
-- GripItGolf: Real course data for Rosapenna Resort
-- Updates placeholder holes inserted in 000001 with actual
-- par and stroke index from Donegal Masters 2026 scorecards.
-- Also adds ladies par and stroke index columns to holes.
-- ============================================================

-- Add ladies tee columns (not in initial schema)
ALTER TABLE holes ADD COLUMN IF NOT EXISTS par_ladies integer;
ALTER TABLE holes ADD COLUMN IF NOT EXISTS stroke_index_ladies integer;

-- ============================================================
-- OLD TOM MORRIS (bbbbbbbb-0000-0000-0000-000000000001)
-- Men: par 71, course rating 70.0, slope 122
-- Women: par 71, course rating 70.0, slope 113
-- ============================================================

UPDATE holes SET
  par = CASE hole_number
    WHEN 1  THEN 4  WHEN 2  THEN 3  WHEN 3  THEN 4  WHEN 4  THEN 4
    WHEN 5  THEN 4  WHEN 6  THEN 4  WHEN 7  THEN 3  WHEN 8  THEN 5
    WHEN 9  THEN 4  WHEN 10 THEN 4  WHEN 11 THEN 4  WHEN 12 THEN 4
    WHEN 13 THEN 4  WHEN 14 THEN 3  WHEN 15 THEN 4  WHEN 16 THEN 5
    WHEN 17 THEN 3  WHEN 18 THEN 5
  END,
  stroke_index = CASE hole_number
    WHEN 1  THEN  6  WHEN 2  THEN 18  WHEN 3  THEN  4  WHEN 4  THEN 12
    WHEN 5  THEN  8  WHEN 6  THEN  2  WHEN 7  THEN 16  WHEN 8  THEN 14
    WHEN 9  THEN 10  WHEN 10 THEN  5  WHEN 11 THEN  1  WHEN 12 THEN  7
    WHEN 13 THEN 15  WHEN 14 THEN 13  WHEN 15 THEN  3  WHEN 16 THEN 17
    WHEN 17 THEN 11  WHEN 18 THEN  9
  END,
  par_ladies = CASE hole_number
    WHEN 1  THEN 4  WHEN 2  THEN 3  WHEN 3  THEN 4  WHEN 4  THEN 4
    WHEN 5  THEN 4  WHEN 6  THEN 4  WHEN 7  THEN 3  WHEN 8  THEN 5
    WHEN 9  THEN 4  WHEN 10 THEN 4  WHEN 11 THEN 5  WHEN 12 THEN 4
    WHEN 13 THEN 4  WHEN 14 THEN 3  WHEN 15 THEN 4  WHEN 16 THEN 5
    WHEN 17 THEN 3  WHEN 18 THEN 5
  END,
  stroke_index_ladies = CASE hole_number
    WHEN 1  THEN 14  WHEN 2  THEN 18  WHEN 3  THEN 10  WHEN 4  THEN  2
    WHEN 5  THEN  8  WHEN 6  THEN  6  WHEN 7  THEN 16  WHEN 8  THEN  4
    WHEN 9  THEN 12  WHEN 10 THEN  7  WHEN 11 THEN 13  WHEN 12 THEN  1
    WHEN 13 THEN 17  WHEN 14 THEN  9  WHEN 15 THEN  5  WHEN 16 THEN 11
    WHEN 17 THEN 15  WHEN 18 THEN  3
  END
WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ============================================================
-- ST PATRICKS LINKS (bbbbbbbb-0000-0000-0000-000000000002)
-- Men: par 71, course rating 73.2, slope 128
-- Women: par 72, course rating 73.2, slope 120
-- ============================================================

UPDATE holes SET
  par = CASE hole_number
    WHEN 1  THEN 4  WHEN 2  THEN 4  WHEN 3  THEN 3  WHEN 4  THEN 5
    WHEN 5  THEN 3  WHEN 6  THEN 5  WHEN 7  THEN 4  WHEN 8  THEN 4
    WHEN 9  THEN 4  WHEN 10 THEN 4  WHEN 11 THEN 4  WHEN 12 THEN 5
    WHEN 13 THEN 4  WHEN 14 THEN 4  WHEN 15 THEN 3  WHEN 16 THEN 4
    WHEN 17 THEN 3  WHEN 18 THEN 4
  END,
  stroke_index = CASE hole_number
    WHEN 1  THEN  9  WHEN 2  THEN 11  WHEN 3  THEN 17  WHEN 4  THEN  5
    WHEN 5  THEN 13  WHEN 6  THEN  7  WHEN 7  THEN  3  WHEN 8  THEN 15
    WHEN 9  THEN  1  WHEN 10 THEN  8  WHEN 11 THEN  6  WHEN 12 THEN  4
    WHEN 13 THEN 12  WHEN 14 THEN 10  WHEN 15 THEN 18  WHEN 16 THEN  2
    WHEN 17 THEN 14  WHEN 18 THEN 16
  END,
  par_ladies = CASE hole_number
    WHEN 1  THEN 4  WHEN 2  THEN 4  WHEN 3  THEN 3  WHEN 4  THEN 5
    WHEN 5  THEN 3  WHEN 6  THEN 5  WHEN 7  THEN 4  WHEN 8  THEN 4
    WHEN 9  THEN 4  WHEN 10 THEN 4  WHEN 11 THEN 4  WHEN 12 THEN 5
    WHEN 13 THEN 4  WHEN 14 THEN 4  WHEN 15 THEN 3  WHEN 16 THEN 5
    WHEN 17 THEN 3  WHEN 18 THEN 4
  END,
  stroke_index_ladies = CASE hole_number
    WHEN 1  THEN  7  WHEN 2  THEN 11  WHEN 3  THEN 17  WHEN 4  THEN  3
    WHEN 5  THEN 13  WHEN 6  THEN  1  WHEN 7  THEN  9  WHEN 8  THEN 15
    WHEN 9  THEN  5  WHEN 10 THEN  6  WHEN 11 THEN  4  WHEN 12 THEN  2
    WHEN 13 THEN 12  WHEN 14 THEN 10  WHEN 15 THEN 18  WHEN 16 THEN  8
    WHEN 17 THEN 16  WHEN 18 THEN 14
  END
WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- ============================================================
-- SANDY HILLS (bbbbbbbb-0000-0000-0000-000000000003)
-- Men: par 72, course rating 73.2, slope 127
-- Women: par 72, course rating 71.0, slope 117
-- ============================================================

UPDATE holes SET
  par = CASE hole_number
    WHEN 1  THEN 5  WHEN 2  THEN 4  WHEN 3  THEN 3  WHEN 4  THEN 4
    WHEN 5  THEN 4  WHEN 6  THEN 4  WHEN 7  THEN 3  WHEN 8  THEN 5
    WHEN 9  THEN 4  WHEN 10 THEN 4  WHEN 11 THEN 3  WHEN 12 THEN 4
    WHEN 13 THEN 5  WHEN 14 THEN 4  WHEN 15 THEN 4  WHEN 16 THEN 3
    WHEN 17 THEN 5  WHEN 18 THEN 4
  END,
  stroke_index = CASE hole_number
    WHEN 1  THEN 13  WHEN 2  THEN  3  WHEN 3  THEN 17  WHEN 4  THEN 11
    WHEN 5  THEN  5  WHEN 6  THEN  1  WHEN 7  THEN 15  WHEN 8  THEN  9
    WHEN 9  THEN  7  WHEN 10 THEN  6  WHEN 11 THEN 12  WHEN 12 THEN 10
    WHEN 13 THEN  8  WHEN 14 THEN 18  WHEN 15 THEN  2  WHEN 16 THEN 14
    WHEN 17 THEN 16  WHEN 18 THEN  4
  END,
  par_ladies = CASE hole_number
    WHEN 1  THEN 4  WHEN 2  THEN 4  WHEN 3  THEN 3  WHEN 4  THEN 4
    WHEN 5  THEN 4  WHEN 6  THEN 4  WHEN 7  THEN 3  WHEN 8  THEN 5
    WHEN 9  THEN 4  WHEN 10 THEN 4  WHEN 11 THEN 3  WHEN 12 THEN 4
    WHEN 13 THEN 5  WHEN 14 THEN 4  WHEN 15 THEN 4  WHEN 16 THEN 3
    WHEN 17 THEN 5  WHEN 18 THEN 4
  END,
  stroke_index_ladies = CASE hole_number
    WHEN 1  THEN  5  WHEN 2  THEN 13  WHEN 3  THEN  7  WHEN 4  THEN 11
    WHEN 5  THEN  1  WHEN 6  THEN 15  WHEN 7  THEN 17  WHEN 8  THEN  9
    WHEN 9  THEN  3  WHEN 10 THEN 12  WHEN 11 THEN 10  WHEN 12 THEN 16
    WHEN 13 THEN  2  WHEN 14 THEN 18  WHEN 15 THEN  8  WHEN 16 THEN 14
    WHEN 17 THEN  4  WHEN 18 THEN  6
  END
WHERE course_id = 'bbbbbbbb-0000-0000-0000-000000000003';
