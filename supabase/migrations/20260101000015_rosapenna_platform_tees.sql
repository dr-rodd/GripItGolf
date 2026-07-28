-- ============================================================
-- GripItGolf: Correct the Rosapenna tee ratings
--
-- Two problems, both found in production July 2026:
--
-- 1. The three Rosapenna PLATFORM courses (the ones anyone can pick
--    when creating a trip) carried placeholder tees — slope 113 with
--    course_rating equal to par. That cancels out of the WHS formula
--    entirely, so a player's playing handicap came out as their raw
--    handicap index with no course adjustment at all. Migration 008
--    never covered these courses; its slug list is the 23 non-Rosapenna
--    platform courses.
--
-- 2. Ladies par was wrong on Old Tom Morris and Sandy Hills in the
--    trip-scoped copies written by migration 009. Those took their par
--    from the summary comments at the top of migration 002, which
--    disagree with that same migration's hole-by-hole par_ladies data.
--    The per-hole data is authoritative — it came straight off the 2026
--    scorecards — so par is now derived from it rather than restated.
--
-- Certified course rating and slope are from the Donegal Masters 2026
-- scorecards. Both copies of each course end up identical.
--
-- Idempotent: re-running sets the same values again.
-- ============================================================

UPDATE tees t
SET slope         = v.slope,
    course_rating = v.cr,
    -- Par follows the actual hole data for the tee's gender
    par           = COALESCE((
      SELECT CASE WHEN t.gender = 'F' THEN sum(h.par_ladies) ELSE sum(h.par) END
      FROM holes h WHERE h.course_id = t.course_id), t.par)
FROM courses c,
     (VALUES
       ('otm', 'M', 122, 70.0),   -- Old Tom Morris
       ('otm', 'F', 113, 70.0),
       ('stp', 'M', 128, 73.2),   -- St Patricks Links
       ('stp', 'F', 120, 73.2),
       ('sh',  'M', 127, 73.2),   -- Sandy Hills
       ('sh',  'F', 117, 71.0)
     ) AS v(course_key, gender, slope, cr)
WHERE c.id = t.course_id
  AND t.gender = v.gender
  -- Each course exists twice: once trip-scoped from the Donegal Masters
  -- seed, once as a platform course. Both are corrected.
  AND v.course_key = CASE
        WHEN c.slug = 'old-tom-morris'                              THEN 'otm'
        WHEN c.slug IN ('st-patricks-links','rosapenna-st-patricks') THEN 'stp'
        WHEN c.slug IN ('sandy-hills','rosapenna-sandy-hills')       THEN 'sh'
      END;
