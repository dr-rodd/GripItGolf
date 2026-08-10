-- ============================================================
-- Course directory: user-added courses
--
-- Anyone can now add a course from the course picker. Two new
-- columns carry what that flow needs:
--
--   website        Where the course lives online. Used once, by the
--                  add-course lookup that reads tee data off the site —
--                  kept so a later correction can re-run the lookup.
--
--   card_verified  Whether the course record has been confirmed against
--                  a photograph of the printed scorecard. A user-added
--                  course starts false and stays false until a card photo
--                  is submitted — either in the add flow or on the day,
--                  from the pick-player screen. The card check sets it:
--                  on apply, and on a photo that matches exactly.
-- ============================================================

ALTER TABLE courses ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS card_verified BOOLEAN NOT NULL DEFAULT false;

-- One-time backfill: every course that already has a card recorded was
-- curated by hand (the platform seeds and the Donegal Masters courses),
-- so it counts as verified. A course with no holes at all has nothing to
-- verify and correctly stays false. Safe to re-run — the predicate only
-- ever widens to newly-carded courses, which the card check marks anyway.
UPDATE courses SET card_verified = true
WHERE EXISTS (SELECT 1 FROM holes WHERE holes.course_id = courses.id);
