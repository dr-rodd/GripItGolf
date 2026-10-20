-- Migration 056 — Golf Ireland: linked members and their league cards
--
-- A league can read its cards from Golf Ireland (lib/golfIreland.ts):
-- players hand their scores in as they always do, link their Golf Ireland
-- account to their name in the league, and the cards that meet the
-- league's rules are read in. Three tables, all closed to the browser (RLS
-- on, no policies — the posture of `runs` and the Strava tables), and one
-- column on `courses`.
--
-- * `golf_ireland_members` — one row per Golf Ireland account that has
--   linked: its tokens and when the access token expires. Secrets. Only the
--   server, on the service role, ever reads them; never sent to a phone,
--   not even the owner's. `last_ok_at` is when the connection last worked.
--
-- * `golf_ireland_links` — which player in which league a Golf Ireland
--   account feeds, and when they ticked the consent box. One player, one
--   account; and within one league one account feeds one player only, so
--   nobody's cards count twice under two names.
--
-- * `golf_ireland_cards` — the cards read in for a player in a league.
--   Only what a board needs: when, where, 9 or 18 holes, the gross and
--   Stableford totals, the handicap of the day, and hole scores when Golf
--   Ireland gives them. A player's cards are deleted the moment they unlink
--   (decided October 2026) — the app does that, explicitly, because the
--   link row is what it deletes and nothing here cascades from a link.
--   Deleting the league or the player takes their cards with them.
--   `refreshed_at` is when Golf Ireland last confirmed the card, stamped
--   by every write.
--
-- * `courses.golf_ireland_id` — Golf Ireland's id for a course, so a card
--   can be matched to a league venue (the "league venues only" rule) and,
--   later, so course and tee data can come from Golf Ireland. NULL for every
--   course until it is matched; UNIQUE, because two of our courses cannot
--   both be the same Golf Ireland course.
--
-- Nothing reads these yet: this is the ground the linking and the import
-- are built on. Needs nothing beyond the core schema. Safe to re-paste:
-- every statement is idempotent. Run once, by hand, in the Supabase SQL
-- editor.

BEGIN;

CREATE TABLE IF NOT EXISTS golf_ireland_members (
  member_id     text        PRIMARY KEY,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  last_ok_at    timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS golf_ireland_links (
  player_id      uuid        PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  trip_id        uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id      text        NOT NULL REFERENCES golf_ireland_members(member_id) ON DELETE CASCADE,
  consented_at   timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  CONSTRAINT uq_golf_ireland_links_trip_member UNIQUE (trip_id, member_id)
);

CREATE INDEX IF NOT EXISTS golf_ireland_links_member_idx ON golf_ireland_links (member_id);

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

CREATE INDEX IF NOT EXISTS golf_ireland_cards_trip_idx ON golf_ireland_cards (trip_id);

ALTER TABLE golf_ireland_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_ireland_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_ireland_cards   ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: the service role bypasses RLS; nobody else
-- gets in.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS golf_ireland_id text;
CREATE UNIQUE INDEX IF NOT EXISTS courses_golf_ireland_id_key
  ON courses (golf_ireland_id) WHERE golf_ireland_id IS NOT NULL;

COMMENT ON TABLE golf_ireland_members IS
  'Golf Ireland tokens per linked member. Secrets — server only (RLS on, no policies).';
COMMENT ON TABLE golf_ireland_links IS
  'Which league player a Golf Ireland account feeds, with consent time. Server only.';
COMMENT ON TABLE golf_ireland_cards IS
  'Golf Ireland cards read in for a league player. Deleted when they unlink. Server only.';
COMMENT ON COLUMN courses.golf_ireland_id IS
  'Golf Ireland''s id for this course; NULL until matched.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Four rows back, each found = 1.
select 'golf_ireland_members (RLS on)' as what, count(*) as found from pg_class
  where relname = 'golf_ireland_members' and relrowsecurity
union all
select 'golf_ireland_links (RLS on)', count(*) from pg_class
  where relname = 'golf_ireland_links' and relrowsecurity
union all
select 'golf_ireland_cards (RLS on)', count(*) from pg_class
  where relname = 'golf_ireland_cards' and relrowsecurity
union all
select 'courses.golf_ireland_id', count(*) from information_schema.columns
  where table_name = 'courses' and column_name = 'golf_ireland_id';
