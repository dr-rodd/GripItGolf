-- Add default tees for platform courses (trip_id IS NULL) that have no tee data yet.
-- Uses slope=113 and course_rating=par (net-zero WHS adjustment) as placeholders
-- until real slope/CR values are sourced.

INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT
  c.id,
  'Blue',
  'M',
  COALESCE((SELECT SUM(h.par) FROM holes h WHERE h.course_id = c.id), 72),
  COALESCE((SELECT SUM(h.par) FROM holes h WHERE h.course_id = c.id), 72),
  113
FROM courses c
WHERE c.trip_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM tees t WHERE t.course_id = c.id AND t.gender = 'M');

INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT
  c.id,
  'Red',
  'F',
  COALESCE((SELECT SUM(h.par_ladies) FROM holes h WHERE h.course_id = c.id), 72),
  COALESCE((SELECT SUM(h.par_ladies) FROM holes h WHERE h.course_id = c.id), 72),
  113
FROM courses c
WHERE c.trip_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM tees t WHERE t.course_id = c.id AND t.gender = 'F');
