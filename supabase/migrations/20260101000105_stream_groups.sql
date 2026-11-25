-- 105 — Stream groups (D343; Ross, 25 Nov 2026: "Replace friends stream with
-- allowing users to create stream groups and add friends to the group
-- stream. Users can then post in the stream"). A member makes a group,
-- names it and adds friends; it is its own stream, holding what its members
-- post in it and their signed cards. Admins add and take people out and
-- make other admins; anybody may leave. lib/feed.ts is the only copy of the
-- rules, app/api/feed/groups.ts the only reader and writer. Server only.
--
-- PASTE AFTER THE DEPLOY. Before it the Stream says groups are "not set up
-- yet" and nobody can make one; everything else is as it was.
--
-- (1) stream_groups — a group: its name, who made it, when.
-- (2) stream_group_members — who is in it, whether an admin, who added them.
-- (3) feed_items.stream also takes 'group:<id>' — a status posted in a group.

-- (1)
CREATE TABLE IF NOT EXISTS stream_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  created_by uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stream_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stream_groups FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stream_groups TO service_role;

-- (2)
CREATE TABLE IF NOT EXISTS stream_group_members (
  group_id   uuid        NOT NULL REFERENCES stream_groups(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin      boolean     NOT NULL DEFAULT false,
  added_by   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_stream_group_members_user ON stream_group_members(user_id);
ALTER TABLE stream_group_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stream_group_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stream_group_members TO service_role;

-- (3)
ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_stream_check;
ALTER TABLE feed_items ADD CONSTRAINT feed_items_stream_check
  CHECK (stream IS NULL OR stream = 'friends' OR stream ~ '^match:[0-9a-f-]{36}$' OR stream ~ '^group:[0-9a-f-]{36}$');

-- Did it land?
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stream_groups')        AS groups,
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stream_group_members') AS members;

-- UNDO (every group and what was posted in one gone):
--   DELETE FROM feed_items WHERE stream LIKE 'group:%';
--   DROP TABLE IF EXISTS stream_group_members;
--   DROP TABLE IF EXISTS stream_groups;
--   ALTER TABLE feed_items DROP CONSTRAINT IF EXISTS feed_items_stream_check;
--   ALTER TABLE feed_items ADD CONSTRAINT feed_items_stream_check
--     CHECK (stream IS NULL OR stream = 'friends' OR stream ~ '^match:[0-9a-f-]{36}$');
