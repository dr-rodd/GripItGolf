-- 107 — A golfer's career stats (Ross, 26 Nov 2026: "Let's revamp stats …
-- the pentagon, the rolling averages, and all the previous tournaments in
-- scrollable format with the SG"). Each card summary (088) carries its
-- strokes gained — against the player's handicap and against scratch, split
-- into putting, tee to green, driving and approach where the card allows —
-- and where it finished in its round. One jsonb, written whole by the
-- summary writer (lib/cardSummary.ts, lib/careerStats.ts). Server only, as
-- 088 left the table.
--
-- PASTE AFTER THE DEPLOY. Before it the summaries are written without it and
-- the stats page shows points and gross with dashes for strokes gained. After
-- pasting, press "Fill card summaries" on /admin (Trips) until it says none
-- remain: every card is summed up again under the new rules (version 2).

ALTER TABLE card_summaries ADD COLUMN IF NOT EXISTS sg jsonb NULL;

-- Did it land?
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name = 'card_summaries' AND column_name = 'sg') AS career_stats;

-- UNDO (the stats page goes back to dashes for strokes gained):
--   ALTER TABLE card_summaries DROP COLUMN IF EXISTS sg;
