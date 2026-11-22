-- 100 — an event under a club, taken out of the members app (D285, Ross, 22
-- Nov 2026): a standalone event on the club's calendar opens outside the
-- members app (its own pages), so a legacy one can be UNLINKED — it stays
-- under the club, the Clubhouse still reads its dates and details, greyed,
-- but members never see it in Comps, Home or Other events — and LINKED again
-- with a tap. Set from the Clubhouse's Events (the chain-link in the status
-- place) and from the event's own "Run by <club>" card.
--
-- PASTE AFTER THE DEPLOY. The code reads it fail-soft: before it nothing is
-- unlinked, and the chain-link says "not set up yet" when tapped.
--
-- trip_private.club_unlinked_at — when it was unlinked; null = linked (the
-- default, so every event today is exactly as it was). Server only, like the
-- rest of trip_private (080 closed it to phones; no new grant needed).

ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS club_unlinked_at timestamptz NULL;

-- Did it land?
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'club_unlinked_at') AS unlinked_column;

-- UNDO (every event is linked again):
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS club_unlinked_at;
