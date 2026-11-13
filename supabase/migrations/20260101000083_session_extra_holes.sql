-- Migration 083 — extra holes on a session match's card.
--
-- A Matches session may now finish a tied match on extra holes (Ross, 13
-- Nov 2026: "how is a tied match finished — half point, extra holes,
-- manual winner"). The card then goes down the 19th off the 1st, as a
-- knockout's does (lib/matchCard.ts playSessionCard), so its scores table
-- (migration 067) must take hole numbers past 18. To 36, as migration 059
-- did for the knockout's card.
--
-- No new table, so no new grants. Needs migration 067. Safe to re-paste:
-- the constraint is dropped if it is there and put back wider. Run once, by
-- hand, in the Supabase SQL editor — before or after its deploy. Until it
-- is in, a session set to extra holes cannot save the 19th, and the card
-- says so; a half or a picked winner needs nothing.

BEGIN;

ALTER TABLE session_match_scores DROP CONSTRAINT IF EXISTS session_match_scores_hole_number_check;
ALTER TABLE session_match_scores ADD CONSTRAINT session_match_scores_hole_number_check
  CHECK (hole_number BETWEEN 1 AND 36);

COMMIT;

-- ── Undo ──────────────────────────────────────────────────
-- Only once no session card holds a hole past 18:
-- ALTER TABLE session_match_scores DROP CONSTRAINT session_match_scores_hole_number_check;
-- ALTER TABLE session_match_scores ADD CONSTRAINT session_match_scores_hole_number_check
--   CHECK (hole_number BETWEEN 1 AND 18);

-- ── Did it land? ──────────────────────────────────────────
-- One row back, found = 1.
select 'session_match_scores takes the 19th' as what, count(*) as found from pg_constraint
  where conname = 'session_match_scores_hole_number_check' and pg_get_constraintdef(oid) like '%36%';
