-- 070 — the first lock: row-level security on the setup tables (stage 3).
--
-- PASTE THIS AFTER THE STAGE 3 DEPLOY IS LIVE — and after creating a test
-- event has been checked on a phone. Before that deploy the create forms
-- insert an event's row straight from the browser, which this refuses; the
-- deploy moves that one write to /api/trip/create. Pasted first, nobody can
-- create an event until the deploy lands.
--
-- What it does. On ten tables — trips, players, teams, team_members, rounds,
-- itinerary_items, event_messages, matchplay_matches, tee_assignments,
-- tee_times — a phone reads and writes an event's rows only if it is a
-- member of that event (a `trip_members` row: organiser, player or guest;
-- written by /api/entry since stage 1, by /api/trip/create from this stage).
-- No phone inserts or deletes an event's own `trips` row: the server makes
-- one and only the admin page deletes one. Roles are not told apart yet —
-- a guest may do here what an organiser may (stage 4) — and the read-only cap
-- thirty days after an event ends is not applied yet either (stage 4).
--
-- What it does not touch. The scoring tables stay as they are: scores,
-- live_scores, live_rounds, live_player_locks, round_handicaps,
-- composite_holes (stage 8), and the match card tables — match_scores,
-- match_concessions, session_matches, session_match_scores (stage 7). The
-- server reads every event through lib/eventReader.ts on the service role,
-- which row-level security never refuses, so no page goes blank.
--
-- The `anon` role (a phone that has not signed in) gets no policy, so it
-- reads nothing on these tables. Every phone has signed in since stage 1.

-- ─── Which events this phone may read, and write ─────────────
--
-- Set-returning, so a policy written `trip_id IN (SELECT …)` asks once per
-- query, not once per row. Run as their owner, so they read trip_members
-- whatever its own policy says; they answer only for the asking phone.

CREATE OR REPLACE FUNCTION public.readable_trips()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.trip_id FROM public.trip_members m WHERE m.user_id = (SELECT auth.uid())
$$;

-- A member: player or guest, or the organiser while their twelve hours run.
-- A spectator reads and does not write.
CREATE OR REPLACE FUNCTION public.writable_trips()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.trip_id FROM public.trip_members m
  WHERE m.user_id = (SELECT auth.uid())
    AND (m.role IN ('player', 'guest') OR m.organiser_until > now())
$$;

REVOKE ALL ON FUNCTION public.readable_trips() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.writable_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.readable_trips() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.writable_trips() TO authenticated, service_role;

-- ─── trips: read and change your own events; never make or delete one ──

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY trips_member_read ON trips FOR SELECT TO authenticated
  USING (id IN (SELECT public.readable_trips()));
CREATE POLICY trips_member_update ON trips FOR UPDATE TO authenticated
  USING (id IN (SELECT public.writable_trips()))
  WITH CHECK (id IN (SELECT public.writable_trips()));

-- ─── The nine tables that carry trip_id: members read and write ──

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY players_member_read   ON players FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY players_member_insert ON players FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY players_member_update ON players FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY players_member_delete ON players FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_member_read   ON teams FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY teams_member_insert ON teams FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY teams_member_update ON teams FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY teams_member_delete ON teams FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_members_member_read   ON team_members FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY team_members_member_insert ON team_members FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY team_members_member_update ON team_members FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY team_members_member_delete ON team_members FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY rounds_member_read   ON rounds FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY rounds_member_insert ON rounds FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY rounds_member_update ON rounds FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY rounds_member_delete ON rounds FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY itinerary_items_member_read   ON itinerary_items FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY itinerary_items_member_insert ON itinerary_items FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY itinerary_items_member_update ON itinerary_items FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY itinerary_items_member_delete ON itinerary_items FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_messages_member_read   ON event_messages FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY event_messages_member_insert ON event_messages FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY event_messages_member_update ON event_messages FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY event_messages_member_delete ON event_messages FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE matchplay_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY matchplay_matches_member_read   ON matchplay_matches FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY matchplay_matches_member_insert ON matchplay_matches FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY matchplay_matches_member_update ON matchplay_matches FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY matchplay_matches_member_delete ON matchplay_matches FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE tee_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tee_assignments_member_read   ON tee_assignments FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY tee_assignments_member_insert ON tee_assignments FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY tee_assignments_member_update ON tee_assignments FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY tee_assignments_member_delete ON tee_assignments FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

ALTER TABLE tee_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY tee_times_member_read   ON tee_times FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY tee_times_member_insert ON tee_times FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY tee_times_member_update ON tee_times FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY tee_times_member_delete ON tee_times FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

-- ─── The two old views: closed to phones ──────────────────────
--
-- leaderboard_summary and leaderboard_by_round (migration 000) read players,
-- teams and scores with their owner's rights, so they would read every
-- event's rows past every policy above. Nothing in the app reads either;
-- they are left defined and closed to every phone.

REVOKE ALL ON public.leaderboard_summary  FROM anon, authenticated;
REVOKE ALL ON public.leaderboard_by_round FROM anon, authenticated;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every row's rls true and policies 4 (trips 2):
--
--   SELECT c.relname AS table_name, c.relrowsecurity AS rls,
--          (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname IN ('trips', 'players', 'teams', 'team_members', 'rounds',
--     'itinerary_items', 'event_messages', 'matchplay_matches', 'tee_assignments', 'tee_times')
--   ORDER BY 1;
--
-- And the views closed (both false):
--
--   SELECT has_table_privilege('authenticated', 'public.leaderboard_summary',  'SELECT') AS summary_open,
--          has_table_privilege('authenticated', 'public.leaderboard_by_round', 'SELECT') AS by_round_open;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time, and the first thing to reach for if a phone is refused
-- something it should be allowed: switching row-level security off makes
-- every policy above dormant at once, and the app goes back to exactly how
-- it worked before. Run all of it; nothing here loses data.
--
--   ALTER TABLE trips             DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE players           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE teams             DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE team_members      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE rounds            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE itinerary_items   DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE event_messages    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE matchplay_matches DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE tee_assignments   DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE tee_times         DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON public.leaderboard_summary  TO anon, authenticated;
--   GRANT SELECT ON public.leaderboard_by_round TO anon, authenticated;
--
-- To remove it entirely afterwards (only once it is switched off, and only
-- if it will not be switched back on), drop the policies by name and then
--   DROP FUNCTION IF EXISTS public.writable_trips();
--   DROP FUNCTION IF EXISTS public.readable_trips();
