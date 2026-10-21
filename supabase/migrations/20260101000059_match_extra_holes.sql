-- Migration 059 — extra holes on the match play card.
--
-- A match all square after eighteen goes down the 19th (docs/event-use-
-- cases.md, story 2): extra holes, played off the course's own holes from
-- the 1st again, until one side wins a hole. lib/matchCard.ts numbers them
-- 19, 20, 21… so the card's two tables (migration 058) must take hole
-- numbers past 18. They go to 36 — eighteen extra holes is further than any
-- match has gone.
--
-- No new table, so no new grants. Needs migration 058. Safe to re-paste:
-- each constraint is dropped if it is there and put back wider. Run once,
-- by hand, in the Supabase SQL editor.

BEGIN;

ALTER TABLE match_scores DROP CONSTRAINT IF EXISTS match_scores_hole_number_check;
ALTER TABLE match_scores ADD CONSTRAINT match_scores_hole_number_check
  CHECK (hole_number BETWEEN 1 AND 36);

ALTER TABLE match_concessions DROP CONSTRAINT IF EXISTS match_concessions_hole_number_check;
ALTER TABLE match_concessions ADD CONSTRAINT match_concessions_hole_number_check
  CHECK (hole_number BETWEEN 1 AND 36);

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Two rows back, each found = 1.
select 'match_scores takes the 19th' as what, count(*) as found from pg_constraint
  where conname = 'match_scores_hole_number_check' and pg_get_constraintdef(oid) like '%36%'
union all
select 'match_concessions takes the 19th', count(*) from pg_constraint
  where conname = 'match_concessions_hole_number_check' and pg_get_constraintdef(oid) like '%36%';
