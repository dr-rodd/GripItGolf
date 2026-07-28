-- ============================================================
-- GripItGolf: A course may be played more than once per trip
--
-- The initial schema declared UNIQUE (trip_id, course_id) on rounds,
-- so a trip could never play the same course twice. That is wrong for
-- real trips: societies commonly open and close on the same links, and
-- a two-round day at one venue is ordinary.
--
-- Nothing depended on the uniqueness. Holes and tees belong to the
-- course and are shared by both rounds quite happily; scores,
-- round_handicaps and live scoring are all keyed on round_id.
--
-- UNIQUE (trip_id, round_number) stays — round numbers must still be
-- distinct within a trip.
--
-- The constraint was declared inline, so Postgres named it. Look it up
-- rather than guessing, and drop whatever is found.
-- ============================================================

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM   pg_constraint con
  JOIN   pg_class rel ON rel.oid = con.conrelid
  JOIN   pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE  rel.relname = 'rounds'
    AND  nsp.nspname = 'public'
    AND  con.contype = 'u'
    -- exactly the two columns, in either order
    AND  ARRAY(
           SELECT att.attname::text
           FROM   unnest(con.conkey) AS k(attnum)
           JOIN   pg_attribute att
                  ON att.attrelid = con.conrelid AND att.attnum = k.attnum
           ORDER  BY att.attname
         ) = ARRAY['course_id', 'trip_id']
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE rounds DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped %', constraint_name;
  ELSE
    RAISE NOTICE 'No (trip_id, course_id) unique constraint on rounds — nothing to drop';
  END IF;
END $$;

-- A plain index keeps course lookups fast now the unique one is gone
CREATE INDEX IF NOT EXISTS idx_rounds_trip_course ON rounds(trip_id, course_id);
