-- ============================================================
-- GripItGolf: Leaderboards as a list
--
-- `trips.formats` held every choice as a flag on one object, so
-- any combination was expressible — including ones with no
-- meaning, like a team format on an individual board.
--
-- A trip now carries a list. Each entry is one complete
-- competition: who is ranked, what they play, and every rule
-- needed to turn a card into a position. A leaderboard is either
-- fully answered or it is not in the list, which is what lets the
-- scoring module trust what it is handed.
--
-- `formats` is left in place and still read. Trips created before
-- this have no `leaderboards` array, and the app reads their old
-- settings as before — see lib/formats.ts.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS leaderboards JSONB NOT NULL DEFAULT '[]'::jsonb;

-- A list, not an object. Cheap guard against a shape the reader
-- would silently return nothing for.
ALTER TABLE trips DROP CONSTRAINT IF EXISTS ck_trips_leaderboards;
ALTER TABLE trips
  ADD CONSTRAINT ck_trips_leaderboards
    CHECK (jsonb_typeof(leaderboards) = 'array');

COMMENT ON COLUMN trips.leaderboards IS
  'Ordered list of complete leaderboard definitions. The first is the primary. See lib/leaderboards.ts.';
