-- ============================================================
-- 077 — row-level security, stage 7: the match play card tables
-- ============================================================
--
-- Until now the four match card tables kept the open policies they were
-- made with (058, 067): anybody with the anon key could read or rewrite any
-- match's card. From here they answer only the event's members, exactly as
-- stage 3 locked the setup tables (070): a member reads, a member who may
-- write (player, guest, or the organiser in their twelve hours — the 30-day
-- cap included, 071) writes. The server reads through the service role and
-- is unaffected.
--
--   match_scores, match_concessions     — a knockout's card (058)
--   session_matches, session_match_scores — a Ryder Cup session (067)
--
-- **Paste after the stage 7 deploy.** That deploy sends every match card box
-- through the phone's score outbox, which counts a quietly refused write as
-- a failure, signs the phone back in and enters the event again, and keeps
-- the box on the phone until the server takes it — so a phone whose sign-in
-- lapsed mid-match loses nothing when this goes in.
--
-- No new table, so no new grants; `anon` keeps its old grant but no policy
-- names it, so a phone that has not signed in reads and writes nothing.

DROP POLICY IF EXISTS match_scores_read   ON match_scores;
DROP POLICY IF EXISTS match_scores_insert ON match_scores;
DROP POLICY IF EXISTS match_scores_update ON match_scores;
DROP POLICY IF EXISTS match_scores_delete ON match_scores;
CREATE POLICY match_scores_member_read   ON match_scores FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY match_scores_member_insert ON match_scores FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY match_scores_member_update ON match_scores FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY match_scores_member_delete ON match_scores FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

DROP POLICY IF EXISTS match_concessions_read   ON match_concessions;
DROP POLICY IF EXISTS match_concessions_insert ON match_concessions;
DROP POLICY IF EXISTS match_concessions_update ON match_concessions;
DROP POLICY IF EXISTS match_concessions_delete ON match_concessions;
CREATE POLICY match_concessions_member_read   ON match_concessions FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY match_concessions_member_insert ON match_concessions FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY match_concessions_member_update ON match_concessions FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY match_concessions_member_delete ON match_concessions FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

DROP POLICY IF EXISTS session_matches_read   ON session_matches;
DROP POLICY IF EXISTS session_matches_insert ON session_matches;
DROP POLICY IF EXISTS session_matches_update ON session_matches;
DROP POLICY IF EXISTS session_matches_delete ON session_matches;
CREATE POLICY session_matches_member_read   ON session_matches FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY session_matches_member_insert ON session_matches FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY session_matches_member_update ON session_matches FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY session_matches_member_delete ON session_matches FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

DROP POLICY IF EXISTS session_match_scores_read   ON session_match_scores;
DROP POLICY IF EXISTS session_match_scores_insert ON session_match_scores;
DROP POLICY IF EXISTS session_match_scores_update ON session_match_scores;
DROP POLICY IF EXISTS session_match_scores_delete ON session_match_scores;
CREATE POLICY session_match_scores_member_read   ON session_match_scores FOR SELECT TO authenticated USING (trip_id IN (SELECT public.readable_trips()));
CREATE POLICY session_match_scores_member_insert ON session_match_scores FOR INSERT TO authenticated WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY session_match_scores_member_update ON session_match_scores FOR UPDATE TO authenticated USING (trip_id IN (SELECT public.writable_trips())) WITH CHECK (trip_id IN (SELECT public.writable_trips()));
CREATE POLICY session_match_scores_member_delete ON session_match_scores FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Sixteen rows, every one named *_member_* and for authenticated:
--
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE tablename IN ('match_scores', 'match_concessions', 'session_matches', 'session_match_scores')
-- ORDER BY tablename, policyname;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Back to the open policies of 058 and 067, safe at any time:
--
-- DO $$
-- DECLARE t text; p record;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY['match_scores', 'match_concessions', 'session_matches', 'session_match_scores'] LOOP
--     FOR p IN SELECT policyname FROM pg_policies WHERE tablename = t LOOP
--       EXECUTE format('DROP POLICY %I ON %I', p.policyname, t);
--     END LOOP;
--     EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_read', t);
--     EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (true)', t || '_insert', t);
--     EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (true) WITH CHECK (true)', t || '_update', t);
--     EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (true)', t || '_delete', t);
--   END LOOP;
-- END $$;
