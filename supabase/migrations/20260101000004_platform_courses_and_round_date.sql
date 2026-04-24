-- ============================================================
-- Platform courses and per-round scheduling
-- ============================================================

-- 1. Make courses.trip_id nullable.
--    Platform-level (shared) courses have trip_id = NULL.
--    Trip-scoped courses retain cascade deletion behaviour.
ALTER TABLE courses ALTER COLUMN trip_id DROP NOT NULL;

-- 2. Prevent two platform courses sharing the same slug.
--    (NULL != NULL in UNIQUE, so trip-scoped slugs are unaffected.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_platform_slug
  ON courses(slug) WHERE trip_id IS NULL;

-- 3. Optional per-round scheduled date for trip scheduling.
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- 4. Seed platform copies of the Rosapenna courses.
--    Copies course + holes from the Donegal Masters seed trip.
--    Idempotent — skips any slug that already exists as a platform course.
DO $$
DECLARE
  v_src RECORD;
  v_new UUID;
BEGIN
  FOR v_src IN
    SELECT id, name, slug, location
    FROM   courses
    WHERE  trip_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    ORDER  BY name
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM courses WHERE trip_id IS NULL AND slug = v_src.slug
    );

    INSERT INTO courses (name, slug, location, trip_id)
    VALUES (v_src.name, v_src.slug, v_src.location, NULL)
    RETURNING id INTO v_new;

    INSERT INTO holes (course_id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies)
    SELECT v_new, hole_number, par, stroke_index, par_ladies, stroke_index_ladies
    FROM   holes
    WHERE  course_id = v_src.id;
  END LOOP;
END $$;
