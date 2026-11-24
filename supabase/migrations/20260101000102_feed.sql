-- 102 — the feed and its streams (social v1, D293–D307; Ross, 23–24 Nov
-- 2026). Green Dot members' signed cards, highlights, comments, match results
-- and leaderboard moves, in streams they choose. lib/feed.ts is the only copy
-- of the rules; app/api/feed/ the only reader and writer.
--
-- PASTE AFTER THE DEPLOY. The code reads every part fail-soft: before it the
-- feed simply does not show on Home, Find friends says "not set up yet", and
-- signing a card works exactly as before (a status typed is dropped).
--
-- Every table is server only (D305): RLS on, no policy, closed to phones by
-- name, granted to the service role. No phone reads or writes any of it.
--
-- (1) feed_settings — one row an account: its audience ('wide' = Friends and
--     my clubs, 'me' = Only me), its chosen streams (null = the starting
--     set), and when it last saw the comments on its cards (the Home dot).
-- (2) friendships — one row a pair, the lower id first; pending until the
--     other accepts (D297). Survives either leaving a club.
-- (3) feed_items — the one activity table: a card, a highlight, a comment, a
--     leaderboard move or a match result. `key` makes a writer idempotent
--     (a card is one item a round a player). `held` is a status typed before
--     its card exists — never shown.
-- (4) feed_dots — the one-tap dot, once an account an item.
-- (5) feed_reports — a report, and where it went: a club (its Clubhouse) or
--     Green Dot (/admin) when club_id is null (D303).
-- (6) club_categories.junior — a membership the club marks as Junior (D230):
--     its people never appear in the feed or in Find friends (D297, D304).
--     Ticked here for any membership already named Junior; the club corrects
--     it on the Memberships page.

-- (1)
CREATE TABLE IF NOT EXISTS feed_settings (
  user_id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  audience         text        NOT NULL DEFAULT 'wide' CHECK (audience IN ('wide', 'me')),
  streams          jsonb       NULL,
  comments_seen_at timestamptz NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feed_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_settings TO service_role;

-- (2)
CREATE TABLE IF NOT EXISTS friendships (
  user_a       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid        NOT NULL,
  accepted     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b),
  CHECK (requested_by = user_a OR requested_by = user_b)
);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friendships FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO service_role;

-- (3)
CREATE TABLE IF NOT EXISTS feed_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NULL UNIQUE,
  kind        text        NOT NULL CHECK (kind IN ('card', 'highlight', 'comment', 'board_move', 'match_result')),
  author_id   uuid        NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   uuid        NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  trip_id     uuid        NULL REFERENCES trips(id) ON DELETE CASCADE,
  round_id    uuid        NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id   uuid        NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id     uuid        NULL REFERENCES clubs(id) ON DELETE SET NULL,
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NULL CHECK (status IS NULL OR char_length(status) <= 140),
  audience    text        NULL CHECK (audience IS NULL OR audience IN ('wide', 'me')),
  held        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz NULL,
  removed_at  timestamptz NULL,
  removed_by  uuid        NULL
);
CREATE INDEX IF NOT EXISTS idx_feed_items_author ON feed_items(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_club   ON feed_items(club_id, created_at DESC) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_trip   ON feed_items(trip_id, created_at DESC) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_parent ON feed_items(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_round  ON feed_items(round_id) WHERE round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_made   ON feed_items(created_at);
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_items TO service_role;

-- (4)
CREATE TABLE IF NOT EXISTS feed_dots (
  item_id    uuid        NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
ALTER TABLE feed_dots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_dots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_dots TO service_role;

-- (5)
CREATE TABLE IF NOT EXISTS feed_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid        NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id     uuid        NULL REFERENCES clubs(id) ON DELETE CASCADE,
  reason      text        NULL CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  resolved_by uuid        NULL,
  outcome     text        NULL CHECK (outcome IS NULL OR outcome IN ('removed', 'dismissed')),
  UNIQUE (item_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_reports_club ON feed_reports(club_id, created_at DESC);
ALTER TABLE feed_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_reports TO service_role;

-- (6)
ALTER TABLE club_categories ADD COLUMN IF NOT EXISTS junior boolean NOT NULL DEFAULT false;
UPDATE club_categories SET junior = true WHERE name ILIKE '%junior%' AND junior = false;

-- Did it land?
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'feed_items')    AS items,
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'friendships')   AS friends,
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'feed_settings') AS settings,
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'feed_dots')     AS dots,
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'feed_reports')  AS reports,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_categories' AND column_name = 'junior') AS junior;

-- UNDO (the feed gone from Home, nothing else changes):
--   DROP TABLE IF EXISTS feed_reports;
--   DROP TABLE IF EXISTS feed_dots;
--   DROP TABLE IF EXISTS feed_items;
--   DROP TABLE IF EXISTS friendships;
--   DROP TABLE IF EXISTS feed_settings;
--   ALTER TABLE club_categories DROP COLUMN IF EXISTS junior;
