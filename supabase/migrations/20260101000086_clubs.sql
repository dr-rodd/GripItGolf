-- 086 — clubs and their members (stage (c); D116–D117, D133, D138–D140;
-- Ross, 14–15 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY. Nothing changes by pasting it: no club
-- exists until a Green Dot member sets one up and Ross approves it in
-- /admin, and no event belongs to a club until one of its admins puts it
-- there. Nobody ever needs an account, or a club, to join, play, score or
-- watch (D94) — the one rule below that changes only ever adds an OR.
--
-- (1) clubs — a golf club, set up by a Green Dot member, unverified until
--     Ross approves it (verified_at) or refuses it (refused_at). The skin's
--     columns (colour, crest, header photo) are here now and drawn later.
-- (2) club_members — the club's own list, kept by its owners and admins:
--     a name, the club's member number, the national (GUI) number, an
--     email, a role (owner | admin | member), and user_id — null until the
--     person links their own account by the code the club emails them.
--     Removing a member keeps the row (removed_at) and cuts the link; a
--     club never deletes anybody's account. on_boards: whether a removed
--     member still shows on the club's leaderboards (drawn later).
-- (3) club_invites — one code per email sent, kept only as a hash, 14 days,
--     one use.
-- (4) trip_private.club_id and club_access — the club an event belongs to,
--     and who changes it (D138–D140): 'admins' (an organiser PIN nobody is
--     given, so every page locks and the club's admins are its organisers),
--     'pin' (the admins, and anyone lent the PIN), 'anyone' (no PIN).
-- (5) account_trips() widened: a verified club's owners and admins, linked
--     and not removed, are the organisers of its events — on any phone they
--     are signed in on, as an event's owner is (085). Members are not.
--
-- All four tables server only: RLS on, no policy, closed to phones by name.

-- ─── (1) Clubs ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clubs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 48),
  name         text        NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 60),
  colour       text        NULL CHECK (colour ~ '^#[0-9A-Fa-f]{6}$'),
  crest_path   text        NULL,
  header_path  text        NULL,
  created_by   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at  timestamptz NULL,
  refused_at   timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clubs_created_by ON clubs(created_by);

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clubs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clubs TO service_role;

-- ─── (2) The club's list ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS club_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name          text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  member_number text        NULL CHECK (member_number ~ '^[A-Z0-9][A-Z0-9./-]{0,19}$'),
  gui_number    text        NULL CHECK (gui_number ~ '^[A-Z0-9][A-Z0-9./-]{0,19}$'),
  email         text        NULL CHECK (email IS NULL OR (email = lower(email) AND length(email) <= 254)),
  role          text        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  user_id       uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_at     timestamptz NULL,
  removed_at    timestamptz NULL,
  on_boards     boolean     NOT NULL DEFAULT true,
  added_at      timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Numbers unique within a club; one row per account per club.
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_number ON club_members(club_id, member_number) WHERE member_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_gui    ON club_members(club_id, gui_number)    WHERE gui_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_members_user   ON club_members(club_id, user_id)       WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_club_members_gui  ON club_members(gui_number) WHERE gui_number IS NOT NULL;

ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_members TO service_role;

-- ─── (3) The codes a club emails ───────────────────────────────

CREATE TABLE IF NOT EXISTS club_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid        NOT NULL REFERENCES club_members(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  code_hash   text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_invites_member ON club_invites(member_id);

ALTER TABLE club_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_invites FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_invites TO service_role;

-- ─── (4) An event's club ───────────────────────────────────────

ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS club_id uuid NULL REFERENCES clubs(id) ON DELETE SET NULL;
ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS club_access text NULL CHECK (club_access IN ('admins', 'pin', 'anyone'));
CREATE INDEX IF NOT EXISTS idx_trip_private_club ON trip_private(club_id) WHERE club_id IS NOT NULL;

-- ─── (5) A verified club's admins run its events ───────────────

CREATE OR REPLACE FUNCTION public.account_trips()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.trip_id FROM public.trip_private p
  WHERE p.owner_id IS NOT NULL AND p.owner_id = (SELECT auth.uid())
  UNION
  SELECT p.trip_id FROM public.trip_private p
  JOIN public.clubs c ON c.id = p.club_id AND c.verified_at IS NOT NULL
  JOIN public.club_members cm ON cm.club_id = c.id
  WHERE cm.user_id = (SELECT auth.uid())
    AND cm.removed_at IS NULL
    AND cm.role IN ('owner', 'admin')
$$;

REVOKE ALL ON FUNCTION public.account_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_trips() TO authenticated, service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.clubs') IS NOT NULL                                             AS clubs_table,
--     to_regclass('public.club_members') IS NOT NULL                                      AS list_table,
--     to_regclass('public.club_invites') IS NOT NULL                                      AS invites_table,
--     NOT has_table_privilege('authenticated', 'public.clubs', 'SELECT')                  AS clubs_closed,
--     NOT has_table_privilege('authenticated', 'public.club_members', 'SELECT')           AS list_closed,
--     NOT has_table_privilege('authenticated', 'public.club_invites', 'SELECT')           AS invites_closed,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'club_id')     AS club_column,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'club_access') AS access_column,
--     pg_get_functiondef('public.account_trips()'::regprocedure) LIKE '%club_members%'   AS admins_run_events,
--     pg_get_functiondef('public.account_trips()'::regprocedure) LIKE '%owner_id%'       AS owners_kept,
--     (SELECT count(*) FROM clubs) = 0                                                    AS no_club_yet;
--
-- (The last reads true only straight after pasting, before the deploy.)

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time: back to exactly 085 — owners keep what they had, and
-- every club, its list and its codes go. Run all of it.
--
--   CREATE OR REPLACE FUNCTION public.account_trips()
--   RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
--   AS $f$
--     SELECT p.trip_id FROM public.trip_private p
--     WHERE p.owner_id IS NOT NULL AND p.owner_id = (SELECT auth.uid())
--   $f$;
--
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS club_access;
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS club_id;
--   DROP TABLE IF EXISTS club_invites;
--   DROP TABLE IF EXISTS club_members;
--   DROP TABLE IF EXISTS clubs;
