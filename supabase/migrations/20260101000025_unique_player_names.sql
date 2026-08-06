-- ============================================================
-- GripItGolf: no two people on a trip share a name
--
-- The join list is a list of names. Two of the same on one trip
-- makes claiming a slot a coin toss, and every screen that names
-- a player ambiguous.
--
-- The rule has been enforced in the browser since the claim flow
-- was built — three creation points and a rename, all through
-- `duplicateName` in lib/roster.ts. This is the same rule where
-- it cannot be raced: two people tapping "Join Trip" with the
-- same name at the same moment both pass a check that ran before
-- either insert, and only the database can see the second one
-- coming.
--
-- `lower(btrim(name))` is the rule as the code states it:
-- trimmed and case-folded, so "john smith" and "John Smith " are
-- one person. Internal spacing is deliberately NOT collapsed —
-- "John  Smith" with two spaces gets through both here and in
-- the code, and the two agree about that.
--
-- ── Composites are excluded, on purpose ──
--
-- `is_composite` rows are synthetic scorecards, not people —
-- "Composite Reds", generated from a team rather than typed by
-- anybody. The rule exists to stop two *people* sharing a name,
-- and constraining machine-generated cards protects nothing.
--
-- More to the point: nobody has ever checked whether composite
-- generation can produce the same name twice on one trip. The
-- audit run before this migration filtered composites out, so a
-- full constraint would be going in on unexamined data and could
-- break a feature it was never meant to touch.
--
-- A partial index, so the exclusion is in the constraint itself
-- rather than in a convention somebody has to remember.
--
-- Verified empty before writing this: the GROUP BY over
-- (trip_id, lower(btrim(name))) returned no rows.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_players_trip_name
  ON players (trip_id, lower(btrim(name)))
  WHERE is_composite = false;

COMMENT ON INDEX uq_players_trip_name IS
  'No two non-composite players on one trip share a name, compared trimmed and case-folded. The browser-side twin is duplicateName() in lib/roster.ts.';
