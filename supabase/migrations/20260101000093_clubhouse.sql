-- 093 — the Clubhouse (stage (k1); D202, D207, D210, D217, D222; Ross,
-- 16 Nov 2026).
--
-- PASTE THIS AFTER THE DEPLOY. The code reads every part fail-soft: before
-- it, nobody is Green Dot staff, a person's standing is Joined, Not joined
-- or Taken off (no Invited), and the grid reads the list as it always has.
--
-- (1) green_dot_staff — the accounts Ross names by hand (D222): they open
--     any verified club's Clubhouse, finding it by search, and are shown to
--     the club as "Green Dot staff" (the sidebar, the activity log). Server
--     only. Add one by hand:
--       INSERT INTO green_dot_staff (user_id, name)
--       SELECT id, 'Ross' FROM auth.users WHERE email = '<their email>';
-- (2) club_members.invited_at — when the person's code was last emailed,
--     so the list can say Invited and filter by it on the server. Backfilled
--     from club_invites; written beside each new code from now on.
-- (3) An index for the Members grid: a club's rows in name order, 50 a page.

-- (1)
CREATE TABLE IF NOT EXISTS green_dot_staff (
  user_id   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name      text        NOT NULL DEFAULT '',
  added_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE green_dot_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.green_dot_staff FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.green_dot_staff TO service_role;

-- (2)
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS invited_at timestamptz NULL;
UPDATE club_members m SET invited_at = i.last
FROM (SELECT member_id, max(created_at) AS last FROM club_invites GROUP BY member_id) i
WHERE i.member_id = m.id AND m.invited_at IS NULL;

-- (3)
CREATE INDEX IF NOT EXISTS idx_club_members_list ON club_members(club_id, name, id);

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.green_dot_staff') IS NOT NULL                                                                AS staff_table,
--     NOT has_table_privilege('authenticated', 'public.green_dot_staff', 'SELECT')                                     AS staff_closed,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'invited_at') AS invited_at,
--     to_regclass('public.idx_club_members_list') IS NOT NULL                                                          AS list_index;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Back to exactly 092. Staff lose their way in; nothing a club holds changes.
--
--   DROP INDEX IF EXISTS idx_club_members_list;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS invited_at;
--   DROP TABLE IF EXISTS green_dot_staff;
