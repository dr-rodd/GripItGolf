-- Migration 058 — the match play scorecard.
--
-- A knockout match scored hole by hole on its own card (docs/event-use-
-- cases.md, story 2, stage 4): each player's gross on each hole, and a
-- hole conceded by one side. lib/matchCard.ts reads them — the shots off
-- each player's tee (migration 057), the better nett for a pairing, who
-- won each hole — and once the match is settled the result goes into the
-- bracket by itself.
--
-- * `match_scores` — one row per player per hole of one match, UNIQUE, so
--   two phones entering the same match interleave rather than clobber.
-- * `match_concessions` — one row per conceded hole: which side gave it.
--
-- Both are written from the browser, as the bracket and every scorecard
-- are, so both carry RLS with open policies (the event code is the access
-- control, as everywhere on Green Dot) and are granted to anon by name —
-- from migration 057 Supabase no longer grants a new table on its own —
-- and to the server's role. Deleting the match takes its card with it.
--
-- Needs migrations 014 and 057. Safe to re-paste: every statement is
-- idempotent. Run once, by hand, in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS match_scores (
  match_id    uuid        NOT NULL REFERENCES matchplay_matches(id) ON DELETE CASCADE,
  trip_id     uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  player_id   uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  hole_number smallint    NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  gross       smallint    NOT NULL CHECK (gross BETWEEN 1 AND 20),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_id, hole_number)
);
CREATE INDEX IF NOT EXISTS match_scores_trip_idx ON match_scores (trip_id);

CREATE TABLE IF NOT EXISTS match_concessions (
  match_id    uuid        NOT NULL REFERENCES matchplay_matches(id) ON DELETE CASCADE,
  trip_id     uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  hole_number smallint    NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  -- The side that conceded the hole: A is the top of the draw, B the bottom.
  conceded_by text        NOT NULL CHECK (conceded_by IN ('A', 'B')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, hole_number)
);
CREATE INDEX IF NOT EXISTS match_concessions_trip_idx ON match_concessions (trip_id);

ALTER TABLE match_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_concessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_scores_read   ON match_scores;
DROP POLICY IF EXISTS match_scores_insert ON match_scores;
DROP POLICY IF EXISTS match_scores_update ON match_scores;
DROP POLICY IF EXISTS match_scores_delete ON match_scores;
CREATE POLICY match_scores_read   ON match_scores FOR SELECT USING (true);
CREATE POLICY match_scores_insert ON match_scores FOR INSERT WITH CHECK (true);
CREATE POLICY match_scores_update ON match_scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY match_scores_delete ON match_scores FOR DELETE USING (true);

DROP POLICY IF EXISTS match_concessions_read   ON match_concessions;
DROP POLICY IF EXISTS match_concessions_insert ON match_concessions;
DROP POLICY IF EXISTS match_concessions_update ON match_concessions;
DROP POLICY IF EXISTS match_concessions_delete ON match_concessions;
CREATE POLICY match_concessions_read   ON match_concessions FOR SELECT USING (true);
CREATE POLICY match_concessions_insert ON match_concessions FOR INSERT WITH CHECK (true);
CREATE POLICY match_concessions_update ON match_concessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY match_concessions_delete ON match_concessions FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_scores      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_scores      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_concessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_concessions TO service_role;

COMMENT ON TABLE match_scores IS 'A knockout match''s card: each player''s gross on each hole (lib/matchCard.ts).';
COMMENT ON TABLE match_concessions IS 'A hole of a knockout match conceded by one side (A top of the draw, B bottom).';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Four rows back, each found = 1.
select 'match_scores (RLS on)' as what, count(*) as found from pg_class
  where relname = 'match_scores' and relrowsecurity
union all
select 'match_concessions (RLS on)', count(*) from pg_class
  where relname = 'match_concessions' and relrowsecurity
union all
select 'match_scores granted to anon', count(*) from information_schema.role_table_grants
  where table_name = 'match_scores' and grantee = 'anon' and privilege_type = 'INSERT'
union all
select 'match_concessions granted to anon', count(*) from information_schema.role_table_grants
  where table_name = 'match_concessions' and grantee = 'anon' and privilege_type = 'INSERT';
