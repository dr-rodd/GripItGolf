-- Migration 056 — Golf Ireland: club access, linked members, league cards
--
-- A league can read its cards from Golf Ireland (lib/golfIreland.ts).
-- Access is assumed to come **club by club**: Golf Ireland opens one club's
-- members to Green Dot with that club's permission, players find
-- themselves in their club's membership and ask to link that member to
-- their name in the league, the organiser confirms it, and the cards that
-- meet the league's rules are read in. docs/golf-ireland.md.
--
-- Four tables, all closed to the browser (RLS on, no policies — the
-- posture of `runs` and the Strava tables), and one column on `courses`.
--
-- * `golf_ireland_clubs` — one row per club that has given Green Dot
--   access: its credential (secret — only the server, on the service role,
--   ever reads it), when the permission was recorded and how
--   (`permission_note`: who said yes, on what), and when it was withdrawn.
--   A withdrawn club keeps its row, so the record of its yes and its no
--   survives; its credential is cleared.
--
-- * `golf_ireland_members` — a member somebody has linked: their id, the
--   club they were found in, their name. No tokens — nobody signs in.
--   Only members somebody linked are ever stored; a search is never kept.
--
-- * `golf_ireland_links` — which player in which league a member feeds,
--   when the player ticked consent, and when the organiser confirmed it.
--   A link with no `confirmed_at` is only requested, and no card is read
--   for it. One player, one member; within one league one member feeds
--   one player only.
--
-- * `golf_ireland_cards` — the cards read in for a player in a league.
--   Only what a board needs: when, where, 9 or 18 holes, the gross and
--   Stableford totals, the handicap of the day, hole scores when given. A
--   player's cards are deleted the moment they unlink, or their club
--   withdraws (decided October 2026) — the app does that explicitly,
--   because nothing here cascades from a link. Deleting the league or the
--   player takes their cards with them.
--
-- * `courses.golf_ireland_id` — Golf Ireland's id for a course, for the
--   "league venues only" rule and, later, course data from Golf Ireland.
--   NULL until matched; unique where set.
--
-- An earlier paste of this file (October 2026) was written for players
-- signing in one by one and held a token per member. Nothing ever read or
-- wrote those tables, so the block marked "bring an earlier paste into
-- line" reshapes them in place; on a fresh database it does nothing.
--
-- Needs nothing beyond the core schema. Safe to re-paste: every statement
-- is idempotent. Run once, by hand, in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS golf_ireland_clubs (
  club_id         text        PRIMARY KEY,
  name            text        NOT NULL DEFAULT '',
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  permission_note text        NOT NULL DEFAULT '',
  granted_at      timestamptz NOT NULL DEFAULT now(),
  withdrawn_at    timestamptz,
  last_ok_at      timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS golf_ireland_members (
  member_id  text        PRIMARY KEY,
  club_id    text        NOT NULL REFERENCES golf_ireland_clubs(club_id) ON DELETE CASCADE,
  name       text        NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS golf_ireland_links (
  player_id      uuid        PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  trip_id        uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id      text        NOT NULL REFERENCES golf_ireland_members(member_id) ON DELETE CASCADE,
  consented_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at   timestamptz,
  last_synced_at timestamptz,
  CONSTRAINT uq_golf_ireland_links_trip_member UNIQUE (trip_id, member_id)
);

CREATE TABLE IF NOT EXISTS golf_ireland_cards (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           uuid         NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  player_id         uuid         NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_id           text         NOT NULL,
  played_on         date         NOT NULL,
  holes_played      smallint     NOT NULL CHECK (holes_played IN (9, 18)),
  course_id         text,
  course_name       text         NOT NULL DEFAULT '',
  gross_total       smallint,
  stableford_points smallint,
  handicap_index    numeric(3,1),
  course_handicap   smallint,
  hole_scores       smallint[],
  imported_at       timestamptz  NOT NULL DEFAULT now(),
  refreshed_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_golf_ireland_cards_player_card UNIQUE (player_id, card_id),
  -- The same rule normaliseCard holds: a card with nothing to score never
  -- gets in.
  CONSTRAINT golf_ireland_cards_has_score
    CHECK (gross_total IS NOT NULL OR stableford_points IS NOT NULL)
);

-- ── Bring an earlier paste into line ─────────────────────────
-- The per-player shape kept tokens on members and had no club. Both
-- tables were never written, so dropping columns loses nothing; on a fresh
-- database every statement here is a no-op.

ALTER TABLE golf_ireland_members DROP COLUMN IF EXISTS access_token;
ALTER TABLE golf_ireland_members DROP COLUMN IF EXISTS refresh_token;
ALTER TABLE golf_ireland_members DROP COLUMN IF EXISTS expires_at;
ALTER TABLE golf_ireland_members DROP COLUMN IF EXISTS last_ok_at;
ALTER TABLE golf_ireland_members ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE golf_ireland_members ADD COLUMN IF NOT EXISTS club_id text
  REFERENCES golf_ireland_clubs(club_id) ON DELETE CASCADE;
-- NOT NULL to match the fresh shape. Holds because the table is empty —
-- and if it somehow were not, this fails the whole paste rather than
-- leaving a member with no club.
ALTER TABLE golf_ireland_members ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE golf_ireland_links ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- ── Indexes, locks, comments ─────────────────────────────────

CREATE INDEX IF NOT EXISTS golf_ireland_members_club_idx ON golf_ireland_members (club_id);
CREATE INDEX IF NOT EXISTS golf_ireland_links_member_idx ON golf_ireland_links (member_id);
CREATE INDEX IF NOT EXISTS golf_ireland_cards_trip_idx ON golf_ireland_cards (trip_id);

ALTER TABLE golf_ireland_clubs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_ireland_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_ireland_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_ireland_cards   ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: the service role bypasses RLS; nobody else
-- gets in.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS golf_ireland_id text;
CREATE UNIQUE INDEX IF NOT EXISTS courses_golf_ireland_id_key
  ON courses (golf_ireland_id) WHERE golf_ireland_id IS NOT NULL;

COMMENT ON TABLE golf_ireland_clubs IS
  'Clubs that gave Green Dot access to their members: credential (secret), permission record, withdrawal. Server only (RLS on, no policies).';
COMMENT ON TABLE golf_ireland_members IS
  'Golf Ireland members somebody linked: id, club, name. No tokens. Server only.';
COMMENT ON TABLE golf_ireland_links IS
  'Which league player a member feeds; consent time, and the organiser''s confirmation (NULL = requested only). Server only.';
COMMENT ON TABLE golf_ireland_cards IS
  'Golf Ireland cards read in for a league player. Deleted when they unlink or their club withdraws. Server only.';
COMMENT ON COLUMN courses.golf_ireland_id IS
  'Golf Ireland''s id for this course; NULL until matched.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Seven rows back, each found = 1.
select 'golf_ireland_clubs (RLS on)' as what, count(*) as found from pg_class
  where relname = 'golf_ireland_clubs' and relrowsecurity
union all
select 'golf_ireland_members (RLS on)', count(*) from pg_class
  where relname = 'golf_ireland_members' and relrowsecurity
union all
select 'golf_ireland_links (RLS on)', count(*) from pg_class
  where relname = 'golf_ireland_links' and relrowsecurity
union all
select 'golf_ireland_cards (RLS on)', count(*) from pg_class
  where relname = 'golf_ireland_cards' and relrowsecurity
union all
select 'members.club_id', count(*) from information_schema.columns
  where table_name = 'golf_ireland_members' and column_name = 'club_id' and is_nullable = 'NO'
union all
select 'members carry no token', (count(*) = 0)::int from information_schema.columns
  where table_name = 'golf_ireland_members' and column_name = 'access_token'
union all
select 'courses.golf_ireland_id', count(*) from information_schema.columns
  where table_name = 'courses' and column_name = 'golf_ireland_id';
