-- 092 — credentials as ticks, and the club's activity log (stage (k0);
-- D208, D209, D210, D219, D220; Ross, 16 Nov 2026).
--
-- PASTE THIS AFTER THE DEPLOY. The code reads every part of it fail-soft:
-- before it, each row's ticks are read off its role (owners and admins
-- Officer and Clubhouse, everyone Plays here — exactly what pasting writes),
-- a change of ticks is answered "not set up yet", and nothing is logged.
--
-- (1) Three ticks on a row of a club's list, independent of each other
--     (lib/clubMay.ts is the only copy of what they allow):
--       plays_here — a golfer at the club: in its fields, boards and stats.
--       officer    — edit access in the members app (competitions, tee
--                    times, cards, results); the organiser of club events.
--       clubhouse  — admin access to the Clubhouse: the list, the look, and
--                    giving Plays here and Officer.
--     Live rows: everybody plays_here; today's owners and admins get
--     officer and clubhouse. `role` stays: `owner` keeps its meaning, and
--     the code keeps `admin` as a mirror of "officer and clubhouse both",
--     so a rollback of the code fails safe.
-- (2) An owner always holds officer and clubhouse — made so by a trigger,
--     whoever writes the row (the code before this sets `role` alone).
-- (3) account_trips(): a verified club's Officers, linked and not removed,
--     are the organisers of its events — 086's function with `officer` in
--     place of the role. Owners are Officers by (2).
-- (4) club_activity — every change made to the club's list and its
--     credentials, look and home course: who (an account, and whether they
--     were Green Dot staff), when, what, which row (its name as it was),
--     and each changed field before and after. Numbers are kept as the
--     screen showed them. Server only. Handicap index changes are already
--     in handicap_changes (089) and are not written twice.

-- (1)
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS plays_here boolean NOT NULL DEFAULT true;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS officer    boolean NOT NULL DEFAULT false;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS clubhouse  boolean NOT NULL DEFAULT false;
UPDATE club_members SET officer = true, clubhouse = true WHERE role IN ('owner', 'admin');
CREATE INDEX IF NOT EXISTS idx_club_members_officers ON club_members(club_id) WHERE officer AND removed_at IS NULL;

-- (2)
CREATE OR REPLACE FUNCTION public.club_owner_holds_all()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    NEW.officer := true;
    NEW.clubhouse := true;
  ELSIF NEW.role = 'admin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'admin') THEN
    NEW.officer := true;
    NEW.clubhouse := true;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.club_owner_holds_all() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_club_owner_holds_all ON club_members;
CREATE TRIGGER trg_club_owner_holds_all
  BEFORE INSERT OR UPDATE ON club_members
  FOR EACH ROW EXECUTE FUNCTION public.club_owner_holds_all();

-- (4), made before (3) so its grants read on their own
CREATE TABLE IF NOT EXISTS club_activity (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  at           timestamptz NOT NULL DEFAULT now(),
  by_user      uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  by_name      text        NOT NULL DEFAULT '',
  by_staff     boolean     NOT NULL DEFAULT false,
  action       text        NOT NULL,
  member_id    uuid        NULL REFERENCES club_members(id) ON DELETE SET NULL,
  member_name  text        NULL,
  changes      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  batch_id     uuid        NULL
);
CREATE INDEX IF NOT EXISTS idx_club_activity_club ON club_activity(club_id, at DESC);
ALTER TABLE club_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_activity FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_activity TO service_role;

-- (3)
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
    AND cm.officer
$$;

REVOKE ALL ON FUNCTION public.account_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_trips() TO authenticated, service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'plays_here') AS plays_here,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'officer')    AS officer,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'clubhouse')  AS clubhouse,
--     NOT EXISTS (SELECT 1 FROM club_members WHERE role IN ('owner', 'admin') AND NOT (officer AND clubhouse))          AS runners_ticked,
--     EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_club_owner_holds_all')                                       AS owner_trigger,
--     pg_get_functiondef('public.account_trips()'::regprocedure) LIKE '%cm.officer%'                                   AS officers_run_events,
--     pg_get_functiondef('public.account_trips()'::regprocedure) LIKE '%owner_id%'                                     AS owners_kept,
--     to_regclass('public.club_activity') IS NOT NULL                                                                   AS activity_table,
--     NOT has_table_privilege('authenticated', 'public.club_activity', 'SELECT')                                        AS activity_closed;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Back to exactly 091. Ticks given since are lost; a row ticked both
-- Officer and Clubhouse since keeps `admin` (the mirror), owners stay
-- owners. Run all of it.
--
--   CREATE OR REPLACE FUNCTION public.account_trips()
--   RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
--   AS $f$
--     SELECT p.trip_id FROM public.trip_private p
--     WHERE p.owner_id IS NOT NULL AND p.owner_id = (SELECT auth.uid())
--     UNION
--     SELECT p.trip_id FROM public.trip_private p
--     JOIN public.clubs c ON c.id = p.club_id AND c.verified_at IS NOT NULL
--     JOIN public.club_members cm ON cm.club_id = c.id
--     WHERE cm.user_id = (SELECT auth.uid())
--       AND cm.removed_at IS NULL
--       AND cm.role IN ('owner', 'admin')
--   $f$;
--   REVOKE ALL ON FUNCTION public.account_trips() FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.account_trips() TO authenticated, service_role;
--
--   DROP TABLE IF EXISTS club_activity;
--   DROP TRIGGER IF EXISTS trg_club_owner_holds_all ON club_members;
--   DROP FUNCTION IF EXISTS public.club_owner_holds_all();
--   DROP INDEX IF EXISTS idx_club_members_officers;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS clubhouse;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS officer;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS plays_here;
