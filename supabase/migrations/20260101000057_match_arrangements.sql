-- Migration 057 — arranging a knockout match: where, when, off which tees,
-- a player's home club, and their contact details.
--
-- Corporate match play (docs/event-use-cases.md, story 2): players play
-- whatever course one of them is a member of and bring a guest, so a
-- match's course is not known until it is arranged, and nor are the shots
-- given and received. The match page chooses it.
--
-- * `matchplay_matches.course_id` / `played_on` — the venue and day, once
--   arranged. Null until then; a course deleted leaves the match unarranged
--   rather than taking it with it.
-- * `matchplay_matches.tees` — which tee each player plays off, as
--   `{ "<player id>": "<tee id>" }`. A small object on the match rather
--   than a table: one to four players, written whole by the match page,
--   read with the match. The shots come off it (lib/matchArrangements.ts).
-- * `players.home_course_id` — the player's home club, set from the hub,
--   offered first when a match's venue is chosen.
-- * `player_contacts` — a phone number and an email, both optional, and
--   who may see them: the field ('public') or the player's opponent only
--   ('opponent', the default). **Its own table, closed to the browser**
--   (RLS on, no policies, no anon grant): `players` is readable by anyone
--   holding the event's code, so an opponent-only number cannot live there.
--   Read and written only on the server (`app/api/match/contact`, the
--   match page), on the service role.
--
-- The first migration Supabase does not grant automatically (from 30
-- October 2026), so the new table carries its grant here — the server's
-- only. Needs nothing beyond the core schema and migration 014. Safe to
-- re-paste: every statement is idempotent. Run once, by hand, in the
-- Supabase SQL editor.

BEGIN;

ALTER TABLE matchplay_matches
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE matchplay_matches ADD COLUMN IF NOT EXISTS played_on date;
ALTER TABLE matchplay_matches ADD COLUMN IF NOT EXISTS tees jsonb;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS home_course_id uuid REFERENCES courses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS player_contacts (
  player_id  uuid        PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  trip_id    uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  phone      text        CHECK (phone IS NULL OR char_length(phone) <= 32),
  email      text        CHECK (email IS NULL OR char_length(email) <= 254),
  visibility text        NOT NULL DEFAULT 'opponent' CHECK (visibility IN ('public', 'opponent')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_contacts_trip_idx ON player_contacts (trip_id);

ALTER TABLE player_contacts ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies and no anon grant: the server alone reads and
-- writes it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_contacts TO service_role;

COMMENT ON COLUMN matchplay_matches.course_id IS 'Where a knockout match is played, once arranged.';
COMMENT ON COLUMN matchplay_matches.played_on IS 'The day a knockout match is played, once arranged.';
COMMENT ON COLUMN matchplay_matches.tees IS 'Which tee each player plays off: { player id: tee id }.';
COMMENT ON COLUMN players.home_course_id IS 'The player''s home club, offered first when a match venue is chosen.';
COMMENT ON TABLE player_contacts IS
  'A player''s phone and email, and whether the field or only their opponent may see them. Server only (RLS on, no policies).';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Six rows back, each found = 1.
select 'matchplay_matches.course_id' as what, count(*) as found from information_schema.columns
  where table_name = 'matchplay_matches' and column_name = 'course_id'
union all
select 'matchplay_matches.played_on', count(*) from information_schema.columns
  where table_name = 'matchplay_matches' and column_name = 'played_on'
union all
select 'matchplay_matches.tees', count(*) from information_schema.columns
  where table_name = 'matchplay_matches' and column_name = 'tees'
union all
select 'players.home_course_id', count(*) from information_schema.columns
  where table_name = 'players' and column_name = 'home_course_id'
union all
select 'player_contacts (RLS on)', count(*) from pg_class
  where relname = 'player_contacts' and relrowsecurity
union all
select 'player_contacts granted to service_role', count(*) from information_schema.role_table_grants
  where table_name = 'player_contacts' and grantee = 'service_role' and privilege_type = 'SELECT';
