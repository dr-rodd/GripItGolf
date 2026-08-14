-- ============================================================
-- Merge the two Carne Hackett courses into one.
--
-- Migration 042 imported 'Carne Golf Links -- Hackett Course' (slug
-- carne-hackett) — but a hand-added 'Carne Golf Links -- Hackett' was
-- already on the platform, invisible to the import gate because the gate
-- parses supabase/migrations/*.sql and a course added through the picker's
-- form is in the database only. Two rows, one eighteen.
--
-- The hand-added row is the keeper: it is the one the North West 26 trip's
-- round points at. Everything on the imported row moves across — tees are
-- MOVED (course_id updated) rather than copied, so any round_handicaps row
-- already pointing at one keeps pointing at the same tee id — and then the
-- imported row is deleted. The official Golf Ireland ratings are upserted
-- onto the keeper last, so the surviving course carries them whichever row
-- they were on before.
--
-- After this runs, DO NOT RE-PASTE migration 042. Its insert is
-- ON CONFLICT DO NOTHING against a row this migration deletes, so a
-- re-paste would quietly re-create the duplicate. (Its source file
-- data/courses/carne-hackett.json is deleted in the same commit, so the
-- generator will not re-emit it either.)
--
-- Replay-safe: a second run finds no carne-hackett row and only re-writes
-- the same tee figures.
-- ============================================================

BEGIN;

DO $$
DECLARE
  keeper uuid;
  loser  uuid;
BEGIN
  -- The hand-added Hackett: matches on the name, but is not the import.
  SELECT id INTO keeper FROM courses
   WHERE trip_id IS NULL
     AND name ILIKE '%carne%' AND name ILIKE '%hackett%'
     AND slug <> 'carne-hackett'
   ORDER BY created_at
   LIMIT 1;

  -- The imported duplicate.
  SELECT id INTO loser FROM courses
   WHERE trip_id IS NULL AND slug = 'carne-hackett';

  IF loser IS NULL THEN
    RAISE NOTICE 'carne-hackett is already gone — nothing to merge.';
    RETURN;
  END IF;

  IF keeper IS NULL THEN
    -- Only the import exists after all; it becomes the one Hackett.
    RAISE NOTICE 'no hand-added Hackett found — keeping carne-hackett as the only row.';
    RETURN;
  END IF;

  -- If the duplicate ever received a card (a scorecard photo) and the
  -- keeper has none, the eighteen move across rather than being lost.
  IF NOT EXISTS (SELECT 1 FROM holes WHERE course_id = keeper)
     AND EXISTS (SELECT 1 FROM holes WHERE course_id = loser) THEN
    UPDATE holes SET course_id = keeper WHERE course_id = loser;
  END IF;

  -- Tees the keeper does not have (by name + gender) are moved, keeping
  -- their ids — round_handicaps.tee_id references survive untouched.
  UPDATE tees t SET course_id = keeper
   WHERE t.course_id = loser
     AND NOT EXISTS (
       SELECT 1 FROM tees k
        WHERE k.course_id = keeper AND k.name = t.name AND k.gender = t.gender);

  -- Where both rows have the same tee, anything pointing at the duplicate's
  -- copy is repointed at the keeper's twin before the copy is deleted.
  UPDATE round_handicaps rh SET tee_id = k.id
    FROM tees l
    JOIN tees k ON k.course_id = keeper AND k.name = l.name AND k.gender = l.gender
   WHERE rh.tee_id = l.id AND l.course_id = loser;

  DELETE FROM tees WHERE course_id = loser;

  -- Any round on the duplicate follows the merge.
  UPDATE rounds SET course_id = keeper WHERE course_id = loser;

  DELETE FROM courses WHERE id = loser;

  -- The keeper takes the best of both records: the canonical county, the
  -- club site, and the course's own coordinates — migration 026's rule, the
  -- links in the dunes rather than the town, so the weather is the course's.
  UPDATE courses SET
    county      = 'Mayo',
    location    = COALESCE(location, 'Belmullet, Mayo, Ireland'),
    website     = COALESCE(website, 'https://carnegolflinks.com/'),
    latitude    = 54.2237,
    longitude   = -10.0338,
    geocoded_at = now()
  WHERE id = keeper;
END $$;

-- The official Golf Ireland ratings (listed there as Belmullet-Hackett,
-- Aug 2026) land on whichever Hackett survived. par follows the stored
-- holes where a card exists — the file figure only where there is none,
-- matching migration 041's rule.
INSERT INTO tees (course_id, name, gender, par, course_rating, slope)
SELECT c.id, spec.tee_name, spec.gender, spec.par::integer,
       spec.course_rating::numeric, spec.slope::integer
FROM (VALUES
  ('Blue',   'M', 72, 72.6, 124),
  ('White',  'M', 72, 71.2, 120),
  ('Yellow', 'M', 72, 68.4, 116),
  ('Red',    'F', 73, 72.0, 121)
) AS spec(tee_name, gender, par, course_rating, slope)
JOIN courses c
  ON c.trip_id IS NULL AND c.name ILIKE '%carne%' AND c.name ILIKE '%hackett%'
ON CONFLICT ON CONSTRAINT uq_tees_course_name_gender DO UPDATE SET
  course_rating = EXCLUDED.course_rating,
  slope         = EXCLUDED.slope,
  par           = COALESCE(
    CASE WHEN tees.gender = 'F' THEN (
      SELECT sum(h.par_ladies) FROM holes h WHERE h.course_id = tees.course_id
    ) END,
    (SELECT sum(h.par) FROM holes h WHERE h.course_id = tees.course_id),
    EXCLUDED.par);

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- This runs itself. Expect exactly one Hackett row, with at least the four
-- official tees and its round count — plus Kilmore and Wild Atlantic Dunes
-- as they were. A carne-hackett slug anywhere means the merge did not run.
select c.name, c.slug, c.county,
       (select count(*) from holes  h where h.course_id = c.id) as holes,
       (select count(*) from tees   t where t.course_id = c.id) as tees,
       (select count(*) from rounds r where r.course_id = c.id) as rounds
from courses c
where c.trip_id is null and c.name ilike '%carne%'
order by c.name;
