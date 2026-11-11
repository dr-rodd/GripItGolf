-- 073 — One scorecard gate (D68, D70; Ross, 11 Nov 2026).
--
-- PASTE THIS AFTER THE DEPLOY. Every door in the app already refuses to
-- start a card on a course that cannot be scored, and shows the scorecard
-- gate instead; this is the server saying the same, so no phone — an old
-- version of the page, a hand-made request — can mark a round live there.
--
-- A `live_rounds` row (a scorecard going live) is refused when its course
-- has fewer than 18 holes, or no tee with a course rating, a slope and a
-- par. lib/courseCard.ts `cardBlocker` is the app's copy of the same rule.
--
-- Nothing already live is touched: only an insert is checked. Match card
-- writes (`match_scores`, `session_match_scores`) are closed properly by
-- row-level security stages 7 and 8; nothing extra is built for them here.

CREATE OR REPLACE FUNCTION refuse_card_without_scorecard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM holes WHERE course_id = NEW.course_id) < 18 THEN
    RAISE EXCEPTION 'This course has no scorecard yet — photograph the printed card first.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tees
    WHERE course_id = NEW.course_id
      AND course_rating IS NOT NULL AND slope IS NOT NULL AND par IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This course has no tee ratings yet, so handicaps can''t be worked out.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION refuse_card_without_scorecard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_live_rounds_scorecard_gate ON live_rounds;
CREATE TRIGGER trg_live_rounds_scorecard_gate
  BEFORE INSERT ON live_rounds
  FOR EACH ROW EXECUTE FUNCTION refuse_card_without_scorecard();

-- ─── Did it land? ─────────────────────────────────────────────
--
-- One row:
--
-- SELECT tgname FROM pg_trigger
-- WHERE tgname = 'trg_live_rounds_scorecard_gate' AND NOT tgisinternal;
--
-- And it refuses (scripts/rls-check.sql, "Scorecard gate", does this too):
-- a course with no holes cannot go live. Inside a transaction, rolled back.

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time; cards start on any course again, as before 073.
--
-- DROP TRIGGER IF EXISTS trg_live_rounds_scorecard_gate ON live_rounds;
