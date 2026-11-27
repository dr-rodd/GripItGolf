-- 109 — Who won each hole, marked by hand (D363; Ross, 27 Nov 2026:
-- "allow for a w/l/halve rather than score entry as it's not always
-- clear"). A spectator following an interclub match often knows who won a
-- hole and not what anybody scored, so a session match's hole can be marked
-- won by one side or halved, with no scores at all. lib/matchCard.ts is the
-- only copy of the rules (`readHoleMarks`, `withHoleMark`, `markIssue`):
-- a hole's scores, once both sides have them, decide it; a mark decides a
-- hole without them.
--
-- PASTE AFTER THE DEPLOY. Before it no hole can be marked (the match sheet
-- says "not set up yet") and every card reads exactly as it did.
--
-- session_matches.hole_marks — hole number → 'a', 'b' or 'halved', as one
-- object ({"1":"a","2":"halved"}). Null is none. Written only by the server
-- (/api/interclub, on the service role); session_matches keeps its grants,
-- so phones read it as they read the rest of the row.

ALTER TABLE session_matches ADD COLUMN IF NOT EXISTS hole_marks jsonb
  CHECK (hole_marks IS NULL OR jsonb_typeof(hole_marks) = 'object');

-- ─── Undo ──────────────────────────────────────────────────────
-- ALTER TABLE session_matches DROP COLUMN IF EXISTS hole_marks;

-- ─── Did it land? ──────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'session_matches' AND column_name = 'hole_marks';
