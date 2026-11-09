-- Migration 067 — Matches: match play results counted on a leaderboard.
--
-- A Ryder Cup session's matches (docs/sessions-plan.md, stage 5; Ross,
-- 9 Nov 2026, D34): each match won, halved or lost and worth points to the
-- Dynamic Overall Leaderboard. **Never a bracket** — these are not
-- `matchplay_matches`, which the Knockout owns and whose draw writer
-- deletes every row on an event, so no bracket reader can ever see one.
--
-- * `session_matches` — one row per match: its session's round, its place
--   in the running order (`slot`, the tee time or the order of play, from
--   0), the players on each side, and the result once the card is
--   finalised: 'a', 'b' or 'halved' (a session match may end halved, D44)
--   with its margin ("3&2"). `tees` is each player's tee for the shots.
--   UNIQUE (round_id, slot), so two phones setting one match collide
--   rather than make two.
-- * `session_match_scores` — the card: one row per player per hole,
--   UNIQUE, so phones interleave rather than clobber. An empty gross is an
--   NR, as on the Knockout's card (migration 062). Eighteen holes only — a
--   session match is never taken down the 19th.
--
-- Written from the browser, as every scorecard is, so both carry RLS with
-- open policies (the event code is the access control, as everywhere on
-- Green Dot), granted to anon by name — from migration 057 Supabase no
-- longer grants a new table on its own — and to the server's role.
-- Deleting the round takes its matches and their cards with it.
--
-- Safe to re-paste: every statement is idempotent. Run once, by hand, in
-- the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS session_matches (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  round_id    uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  slot        smallint    NOT NULL CHECK (slot >= 0),
  side_a      uuid[]      NOT NULL DEFAULT '{}',
  side_b      uuid[]      NOT NULL DEFAULT '{}',
  result      text        CHECK (result IS NULL OR result IN ('a', 'b', 'halved')),
  margin      text,
  tees        jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, slot)
);
CREATE INDEX IF NOT EXISTS session_matches_trip_idx ON session_matches (trip_id);

CREATE TABLE IF NOT EXISTS session_match_scores (
  match_id    uuid        NOT NULL REFERENCES session_matches(id) ON DELETE CASCADE,
  trip_id     uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  player_id   uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  hole_number smallint    NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  gross       smallint    CHECK (gross IS NULL OR gross BETWEEN 1 AND 20),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_id, hole_number)
);
CREATE INDEX IF NOT EXISTS session_match_scores_trip_idx ON session_match_scores (trip_id);

ALTER TABLE session_matches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_match_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_matches_read   ON session_matches;
DROP POLICY IF EXISTS session_matches_insert ON session_matches;
DROP POLICY IF EXISTS session_matches_update ON session_matches;
DROP POLICY IF EXISTS session_matches_delete ON session_matches;
CREATE POLICY session_matches_read   ON session_matches FOR SELECT USING (true);
CREATE POLICY session_matches_insert ON session_matches FOR INSERT WITH CHECK (true);
CREATE POLICY session_matches_update ON session_matches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY session_matches_delete ON session_matches FOR DELETE USING (true);

DROP POLICY IF EXISTS session_match_scores_read   ON session_match_scores;
DROP POLICY IF EXISTS session_match_scores_insert ON session_match_scores;
DROP POLICY IF EXISTS session_match_scores_update ON session_match_scores;
DROP POLICY IF EXISTS session_match_scores_delete ON session_match_scores;
CREATE POLICY session_match_scores_read   ON session_match_scores FOR SELECT USING (true);
CREATE POLICY session_match_scores_insert ON session_match_scores FOR INSERT WITH CHECK (true);
CREATE POLICY session_match_scores_update ON session_match_scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY session_match_scores_delete ON session_match_scores FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_matches      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_matches      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_match_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_match_scores TO service_role;

COMMENT ON TABLE session_matches IS 'A Matches session''s match: sides, slot, result (lib/sessions.ts). Never a bracket.';
COMMENT ON TABLE session_match_scores IS 'A session match''s card: each player''s gross on each hole; empty is an NR.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Four rows back, each found = 1.
select 'session_matches (RLS on)' as what, count(*) as found from pg_class
  where relname = 'session_matches' and relrowsecurity
union all
select 'session_match_scores (RLS on)', count(*) from pg_class
  where relname = 'session_match_scores' and relrowsecurity
union all
select 'session_matches granted to anon', count(*) from information_schema.role_table_grants
  where table_name = 'session_matches' and grantee = 'anon' and privilege_type = 'INSERT'
union all
select 'session_match_scores granted to anon', count(*) from information_schema.role_table_grants
  where table_name = 'session_match_scores' and grantee = 'anon' and privilege_type = 'INSERT';
