-- ============================================================
-- Migration 035 — a tee's par follows its holes
--
-- APPLY THIS ONE. It is not optional and it is not about new courses:
-- it corrects live scoring on courses people can pick today.
--
-- `PH = HI × Slope/113 + (CR − Par)` reads `tees.par`. Cross-checking every
-- shipped tee row against its own stored holes found **15 rows on 12 platform
-- courses whose par disagrees with the card they belong to**:
--
--   county-louth            Red   F  72 vs 75      narin-portnoo   White M  70 vs 73
--   county-sligo-colt-…     Red   F  73 vs 75      narin-portnoo   Red   F  70 vs 73
--   portsalon               Red   F  73 vs 75      ballybunion-old Red   F  72 vs 74
--   lahinch-old             Red   F  72 vs 74      royal-portrush-dunluce Red F 72 vs 74
--   waterville              Red   F  72 vs 73      carne-wild-atlantic-…  Red F 72 vs 73
--   portstewart-strand      Black F  72 vs 73      portstewart-strand     Red F 72 vs 73
--   ballyliffin-old         Red   F  72 vs 71      royal-portrush-valley  White M 70 vs 71
--   the-island              Red   F  74 vs 72
--
-- County Louth stores 72 against 75 holes, so every woman there is handed
-- **three shots too many**. Thirteen of the fifteen are ladies tees, which is
-- its own kind of unfair: the people worst served by the data are the ones
-- least likely to have a second card to check it against.
--
-- Nothing needs researching. The holes are already right — they came off the
-- scorecards — so the fix is to stop `tees.par` being a second, independent
-- copy of a number the card already answers.
--
-- The fallback is `diffCard`'s own, in the same order: the ladies total for a
-- ladies tee, the men's total when that gender has no card, and the stored
-- figure when the course has no card at all.
--
-- Finalised rounds do not move. `round_handicaps.playing_handicap` is a
-- snapshot taken when the round was set up, and the Stableford trigger has
-- already written its points from it. This corrects what future and in-play
-- rounds compute.
--
-- Scoped to platform courses (`trip_id IS NULL`). The Donegal Masters archive
-- keeps the numbers that trip was played off — migration 015 settled those.
--
-- Idempotent: re-running sets the same values again, and it is a no-op on the
-- other 67 rows. Same UPDATE…FROM shape as migration 015.
-- ============================================================

UPDATE tees t
SET par = COALESCE(
      -- A ladies tee measured against the ladies card, when there is one.
      -- `sum` over a column that is NULL on every hole is NULL, not 0, so a
      -- course with no ladies card falls through rather than reading zero.
      CASE WHEN t.gender = 'F' THEN (
        SELECT sum(h.par_ladies) FROM holes h WHERE h.course_id = t.course_id
      ) END,
      -- Otherwise — and for every men's tee — the men's card.
      (SELECT sum(h.par) FROM holes h WHERE h.course_id = t.course_id),
      -- A course with no card yet keeps whatever it was given. The first
      -- scorecard photo settles it.
      t.par)
FROM courses c
WHERE c.id = t.course_id
  AND c.trip_id IS NULL;
