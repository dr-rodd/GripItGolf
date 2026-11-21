-- 098 — "Plays here" retired as a tick (D275, Ross, 21 Nov 2026): whether a
-- member plays here follows their membership — no membership, or one that
-- plays on at least one day (`playsByMembership` in lib/clubMay.ts, worked
-- out as each list row is read in app/api/club/rows.ts). Since that deploy
-- no code reads or writes club_members.plays_here, so the column goes.
--
-- PASTE AFTER THE D275 DEPLOY IS LIVE (it is safe in either order — the code
-- no longer names the column — but after is the habit). Nothing else in the
-- database reads it: not RLS, not account_trips(), not 092's owner trigger.
--
-- UNDO (the column comes back with everybody ticked; the old ticks are not
-- recoverable, and nothing reads them):
--   ALTER TABLE club_members ADD COLUMN IF NOT EXISTS plays_here boolean NOT NULL DEFAULT true;

ALTER TABLE club_members DROP COLUMN IF EXISTS plays_here;

-- Did it land? (false = dropped)
--   SELECT EXISTS (SELECT 1 FROM information_schema.columns
--     WHERE table_name = 'club_members' AND column_name = 'plays_here') AS plays_here_still_there;
