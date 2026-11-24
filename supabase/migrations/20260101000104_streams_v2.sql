-- 104 — Streams v2 (D318–D332; Ross, 24 Nov 2026). The feed becomes the
-- Stream tab: four streams (club, comp, match, friends), standalone statuses,
-- the club's own posts, one item per card with its comments grouped on it,
-- and following a match stream. lib/feed.ts is the only copy of the rules;
-- app/api/feed/ the only reader and writer. Everything stays server only.
--
-- PASTE AFTER THE DEPLOY. The code reads every part fail-soft: before it the
-- streams order by when an item was made (a comment does not lift its card),
-- comments still group onto their cards, and posting a status or a club post
-- says "not set up yet". Follows are none.
--
-- (1) feed_items.kind takes 'status' (a member's own, with no card — D328)
--     and 'post' (the club's official word in club.stream — D325).
-- (2) feed_items.status takes up to 280 characters — a standalone status.
--     A card's status at signing stays at 140 (the app holds it there).
-- (3) feed_items.bumped_at — when anything last happened to an item: made,
--     or a comment on it (a dot does not count — D329). Streams order by it.
--     Backfilled: an item's own time, a card's latest comment where later.
-- (4) feed_items.stream — where a status was posted: 'friends', or a match
--     stream 'match:<id>' (seen only by its followers — D326).
-- (5) feed_items.link — a club post's one link, https only.
-- (6) feed_follows — a member following a match stream (D326). None can be
--     followed until the Clubhouse lists interclub teams (D332).

-- (1), (2)
ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_kind_check;
ALTER TABLE feed_items ADD CONSTRAINT feed_items_kind_check
  CHECK (kind IN ('card', 'highlight', 'comment', 'board_move', 'match_result', 'status', 'post'));
ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_status_check;
ALTER TABLE feed_items ADD CONSTRAINT feed_items_status_check
  CHECK (status IS NULL OR char_length(status) <= 280);

-- (3)
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS bumped_at timestamptz NULL;
UPDATE feed_items SET bumped_at = created_at WHERE bumped_at IS NULL;
UPDATE feed_items f SET bumped_at = c.latest
  FROM (SELECT parent_id, max(created_at) AS latest FROM feed_items
        WHERE kind = 'comment' AND parent_id IS NOT NULL AND removed_at IS NULL GROUP BY parent_id) c
  WHERE f.id = c.parent_id AND c.latest > f.bumped_at;
ALTER TABLE feed_items ALTER COLUMN bumped_at SET DEFAULT now();
ALTER TABLE feed_items ALTER COLUMN bumped_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_club_bump   ON feed_items(club_id, bumped_at DESC) WHERE club_id IS NOT NULL AND parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_trip_bump   ON feed_items(trip_id, bumped_at DESC) WHERE trip_id IS NOT NULL AND parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_feed_items_author_bump ON feed_items(author_id, bumped_at DESC) WHERE parent_id IS NULL;

-- (4), (5)
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS stream text NULL;
ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_stream_check;
ALTER TABLE feed_items ADD CONSTRAINT feed_items_stream_check
  CHECK (stream IS NULL OR stream = 'friends' OR stream ~ '^match:[0-9a-f-]{36}$');
CREATE INDEX IF NOT EXISTS idx_feed_items_stream ON feed_items(stream, bumped_at DESC) WHERE stream IS NOT NULL;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS link text NULL;
ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_link_check;
ALTER TABLE feed_items ADD CONSTRAINT feed_items_link_check
  CHECK (link IS NULL OR (char_length(link) <= 500 AND link ~ '^https://'));

-- (6)
CREATE TABLE IF NOT EXISTS feed_follows (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream     text        NOT NULL CHECK (stream ~ '^match:[0-9a-f-]{36}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stream)
);
CREATE INDEX IF NOT EXISTS idx_feed_follows_stream ON feed_follows(stream);
ALTER TABLE feed_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_follows FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_follows TO service_role;

-- Did it land?
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feed_items' AND column_name = 'bumped_at') AS bumped,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feed_items' AND column_name = 'stream')    AS stream,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feed_items' AND column_name = 'link')      AS link,
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'feed_follows')                            AS follows;

-- UNDO (statuses and club posts gone; streams back to when each item was made):
--   DROP TABLE IF EXISTS feed_follows;
--   DELETE FROM feed_items WHERE kind IN ('status', 'post');
--   ALTER TABLE feed_items DROP COLUMN IF EXISTS link;
--   ALTER TABLE feed_items DROP COLUMN IF EXISTS stream;
--   ALTER TABLE feed_items DROP COLUMN IF EXISTS bumped_at;
--   ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_kind_check;
--   ALTER TABLE feed_items ADD CONSTRAINT feed_items_kind_check
--     CHECK (kind IN ('card', 'highlight', 'comment', 'board_move', 'match_result'));
--   UPDATE feed_items SET status = left(status, 140) WHERE char_length(status) > 140;
--   ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_status_check;
--   ALTER TABLE feed_items ADD CONSTRAINT feed_items_status_check
--     CHECK (status IS NULL OR char_length(status) <= 140);
