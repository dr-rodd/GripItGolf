-- Add default tees for platform courses (trip_id IS NULL) that have no tee data yet.
-- Uses slope=113 and course_rating=par (net-zero WHS adjustment) as placeholders
-- until real slope/CR values are sourced per course.
--
-- Men get three tees: Black, Blue, White.
-- Women get one tee: Red.

DO $$
DECLARE
  rec RECORD;
  course_par INTEGER;
  ladies_par INTEGER;
BEGIN
  FOR rec IN
    SELECT c.id
    FROM courses c
    WHERE c.trip_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM tees t WHERE t.course_id = c.id)
  LOOP
    SELECT COALESCE(SUM(h.par), 72)         INTO course_par FROM holes h WHERE h.course_id = rec.id;
    SELECT COALESCE(SUM(h.par_ladies), 72)  INTO ladies_par FROM holes h WHERE h.course_id = rec.id;

    INSERT INTO tees (course_id, name, gender, par, course_rating, slope) VALUES
      (rec.id, 'Black', 'M', course_par, course_par, 113),
      (rec.id, 'Blue',  'M', course_par, course_par, 113),
      (rec.id, 'White', 'M', course_par, course_par, 113),
      (rec.id, 'Red',   'F', ladies_par, ladies_par, 113);
  END LOOP;
END $$;
