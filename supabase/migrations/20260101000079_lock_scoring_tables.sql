-- ============================================================
-- 079 — row-level security, stage 8: the stroke scoring tables, last
-- ============================================================
--
-- The last open door. `scores`, `live_scores`, `round_handicaps`,
-- `composite_holes`, `live_rounds` and `live_player_locks` have had no
-- row-level security at all since the Donegal Masters days: the anon key in
-- every browser could rewrite or delete any trip's committed card. From here
-- they answer the event's members only — the same rule as stages 3 and 7: a
-- member reads, a member who may write (player, guest, or the organiser in
-- their twelve hours; the 30-day cap from 071 included) writes.
--
-- None of these tables carries `trip_id`; each is reached through its round
-- (`round_id` → `rounds.trip_id`), and a player lock through its live round.
-- Four set-returning helpers below, built on 070's `readable_trips()` and
-- `writable_trips()`, so a policy asks once per query, not once per row.
--
-- **Paste after the stage 8 deploy, with no card open on a real event**
-- (/admin → live cards; Ross, 11 Nov 2026: only test cards live). That
-- deploy makes every scoring write tell a refusal from a lost signal: a
-- refused hole stays on the phone while the phone signs back in and enters
-- the event again; starting and submitting a card retry once the same way.
--
-- **Realtime**: the live board's `postgres_changes` on live_scores is
-- checked against the read policy for the phone that subscribed — members
-- still get it. The server reads through the service role and is unaffected;
-- the Stableford trigger runs as the writing phone, reading `players`,
-- `holes` and `round_handicaps`, all of which a member can read.
--
-- No new table, so no new grants; `anon` gets no policy and so nothing.

CREATE OR REPLACE FUNCTION public.readable_rounds()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id FROM public.rounds r WHERE r.trip_id IN (SELECT public.readable_trips())
$$;
REVOKE ALL ON FUNCTION public.readable_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.readable_rounds() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.writable_rounds()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id FROM public.rounds r WHERE r.trip_id IN (SELECT public.writable_trips())
$$;
REVOKE ALL ON FUNCTION public.writable_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.writable_rounds() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.readable_live_rounds()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id FROM public.live_rounds l WHERE l.round_id IN (SELECT public.readable_rounds())
$$;
REVOKE ALL ON FUNCTION public.readable_live_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.readable_live_rounds() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.writable_live_rounds()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id FROM public.live_rounds l WHERE l.round_id IN (SELECT public.writable_rounds())
$$;
REVOKE ALL ON FUNCTION public.writable_live_rounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.writable_live_rounds() TO authenticated, service_role;

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scores_member_read   ON scores;
DROP POLICY IF EXISTS scores_member_insert ON scores;
DROP POLICY IF EXISTS scores_member_update ON scores;
DROP POLICY IF EXISTS scores_member_delete ON scores;
CREATE POLICY scores_member_read   ON scores FOR SELECT TO authenticated USING (round_id IN (SELECT public.readable_rounds()));
CREATE POLICY scores_member_insert ON scores FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY scores_member_update ON scores FOR UPDATE TO authenticated USING (round_id IN (SELECT public.writable_rounds())) WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY scores_member_delete ON scores FOR DELETE TO authenticated USING (round_id IN (SELECT public.writable_rounds()));

ALTER TABLE live_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_scores_member_read   ON live_scores;
DROP POLICY IF EXISTS live_scores_member_insert ON live_scores;
DROP POLICY IF EXISTS live_scores_member_update ON live_scores;
DROP POLICY IF EXISTS live_scores_member_delete ON live_scores;
CREATE POLICY live_scores_member_read   ON live_scores FOR SELECT TO authenticated USING (round_id IN (SELECT public.readable_rounds()));
CREATE POLICY live_scores_member_insert ON live_scores FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY live_scores_member_update ON live_scores FOR UPDATE TO authenticated USING (round_id IN (SELECT public.writable_rounds())) WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY live_scores_member_delete ON live_scores FOR DELETE TO authenticated USING (round_id IN (SELECT public.writable_rounds()));

ALTER TABLE round_handicaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS round_handicaps_member_read   ON round_handicaps;
DROP POLICY IF EXISTS round_handicaps_member_insert ON round_handicaps;
DROP POLICY IF EXISTS round_handicaps_member_update ON round_handicaps;
DROP POLICY IF EXISTS round_handicaps_member_delete ON round_handicaps;
CREATE POLICY round_handicaps_member_read   ON round_handicaps FOR SELECT TO authenticated USING (round_id IN (SELECT public.readable_rounds()));
CREATE POLICY round_handicaps_member_insert ON round_handicaps FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY round_handicaps_member_update ON round_handicaps FOR UPDATE TO authenticated USING (round_id IN (SELECT public.writable_rounds())) WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY round_handicaps_member_delete ON round_handicaps FOR DELETE TO authenticated USING (round_id IN (SELECT public.writable_rounds()));

ALTER TABLE composite_holes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS composite_holes_member_read   ON composite_holes;
DROP POLICY IF EXISTS composite_holes_member_insert ON composite_holes;
DROP POLICY IF EXISTS composite_holes_member_update ON composite_holes;
DROP POLICY IF EXISTS composite_holes_member_delete ON composite_holes;
CREATE POLICY composite_holes_member_read   ON composite_holes FOR SELECT TO authenticated USING (round_id IN (SELECT public.readable_rounds()));
CREATE POLICY composite_holes_member_insert ON composite_holes FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY composite_holes_member_update ON composite_holes FOR UPDATE TO authenticated USING (round_id IN (SELECT public.writable_rounds())) WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY composite_holes_member_delete ON composite_holes FOR DELETE TO authenticated USING (round_id IN (SELECT public.writable_rounds()));

ALTER TABLE live_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_rounds_member_read   ON live_rounds;
DROP POLICY IF EXISTS live_rounds_member_insert ON live_rounds;
DROP POLICY IF EXISTS live_rounds_member_update ON live_rounds;
DROP POLICY IF EXISTS live_rounds_member_delete ON live_rounds;
CREATE POLICY live_rounds_member_read   ON live_rounds FOR SELECT TO authenticated USING (round_id IN (SELECT public.readable_rounds()));
CREATE POLICY live_rounds_member_insert ON live_rounds FOR INSERT TO authenticated WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY live_rounds_member_update ON live_rounds FOR UPDATE TO authenticated USING (round_id IN (SELECT public.writable_rounds())) WITH CHECK (round_id IN (SELECT public.writable_rounds()));
CREATE POLICY live_rounds_member_delete ON live_rounds FOR DELETE TO authenticated USING (round_id IN (SELECT public.writable_rounds()));

ALTER TABLE live_player_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_player_locks_member_read   ON live_player_locks;
DROP POLICY IF EXISTS live_player_locks_member_insert ON live_player_locks;
DROP POLICY IF EXISTS live_player_locks_member_update ON live_player_locks;
DROP POLICY IF EXISTS live_player_locks_member_delete ON live_player_locks;
CREATE POLICY live_player_locks_member_read   ON live_player_locks FOR SELECT TO authenticated USING (live_round_id IN (SELECT public.readable_live_rounds()));
CREATE POLICY live_player_locks_member_insert ON live_player_locks FOR INSERT TO authenticated WITH CHECK (live_round_id IN (SELECT public.writable_live_rounds()));
CREATE POLICY live_player_locks_member_update ON live_player_locks FOR UPDATE TO authenticated USING (live_round_id IN (SELECT public.writable_live_rounds())) WITH CHECK (live_round_id IN (SELECT public.writable_live_rounds()));
CREATE POLICY live_player_locks_member_delete ON live_player_locks FOR DELETE TO authenticated USING (live_round_id IN (SELECT public.writable_live_rounds()));

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Six rows, every one true:
--
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname IN ('scores', 'live_scores', 'round_handicaps', 'composite_holes', 'live_rounds', 'live_player_locks');
--
-- Twenty-four policies, all *_member_* and for authenticated:
--
-- SELECT tablename, count(*) FROM pg_policies
-- WHERE tablename IN ('scores', 'live_scores', 'round_handicaps', 'composite_holes', 'live_rounds', 'live_player_locks')
-- GROUP BY tablename;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Back to exactly as before (no row-level security on the six), safe at any time:
--
-- ALTER TABLE scores            DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE live_scores       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE round_handicaps   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE composite_holes   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE live_rounds       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE live_player_locks DISABLE ROW LEVEL SECURITY;
