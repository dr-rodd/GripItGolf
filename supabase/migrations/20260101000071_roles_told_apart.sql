-- 071 — roles told apart (row-level security stage 4; Ross, 11 Nov 2026).
--
-- PASTE THIS AFTER THE STAGE 4 DEPLOY IS LIVE. Before that deploy the
-- padlock compares a PIN's hash in the browser and a few screens write the
-- trips row from a phone; the deploy moves all of that to the server. Pasted
-- first, the padlock and every PIN prompt stop working (they cannot read the
-- hash this hides) until the deploy lands.
--
-- What it does, on top of 070:
--
-- (1) The 30-day read-only cap (D59). The field — players and guests —
--     writes an event's setup tables until midnight, Irish time, at the end
--     of the thirtieth day after its end date; the organiser holding the PIN
--     is never capped. An event with no end date is never capped, nor is an
--     ad hoc series whose field may still add rounds (`add_rounds` on): its
--     end date is only ever its last round so far. lib/membership.ts
--     (`mayWrite`, `fieldOpenEnded`) is the same rule in TypeScript.
--
-- (2) Only the organiser changes the event (D65, D66). The trips row is
--     updated, and a player, a round or a notice deleted, only by a phone
--     holding the PIN's twelve hours — or, on an event with no PIN, by any
--     member who may write, as now. A team is deleted by the organiser; by
--     anybody who may write on a golf trip, whose teams are the group's; and
--     by the field elsewhere only when it has at most one member left and is
--     not an event's tag — the team picker's and the tee sheet's medium
--     security, and a run join taking back the team it just made.
--
-- (3) No PIN hash reaches a phone (D64). Phones read and write every column
--     of trips except the two hashes, which only the server touches now —
--     where they are re-stored salted and slow the next time each PIN is
--     typed (lib/pinHash.ts). A column added to trips after this needs its
--     own `GRANT SELECT (col)` (and UPDATE, if phones write it) — the grants
--     below are made from the columns that exist today.
--
-- Everything else stays as 070 left it: any member reads, and inserts and
-- updates the other nine tables. The scoring tables are untouched.

-- ─── (1) The cap, in who may write ───────────────────────────

CREATE OR REPLACE FUNCTION public.writable_trips()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.trip_id
  FROM public.trip_members m
  JOIN public.trips t ON t.id = m.trip_id
  WHERE m.user_id = (SELECT auth.uid())
    AND (
      m.organiser_until > now()
      OR (m.role IN ('player', 'guest') AND (
            t.end_date IS NULL
         OR now() < ((t.end_date + 31)::timestamp AT TIME ZONE 'Europe/Dublin')
         OR (t.kind = 'tournament'
             AND jsonb_typeof(t.bracket_setup) = 'object'
             AND t.bracket_setup -> 'format' = '"league"'::jsonb
             AND t.bracket_setup -> 'schedule' = '"series"'::jsonb
             AND COALESCE(t.bracket_setup -> 'repeat', 'null'::jsonb) = 'null'::jsonb
             AND jsonb_typeof(t.event_permissions) = 'object'
             AND t.event_permissions -> 'add_rounds' = 'true'::jsonb)))
    )
$$;

-- ─── (2) Who may change the event itself ─────────────────────
--
-- The organiser while the PIN's twelve hours run; on an event with no PIN,
-- any member who may write (lib/membership.ts `mayChangeEvent`).

CREATE OR REPLACE FUNCTION public.organiser_trips()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.trip_id
  FROM public.trip_members m
  JOIN public.trips t ON t.id = m.trip_id
  WHERE m.user_id = (SELECT auth.uid())
    AND (
      m.organiser_until > now()
      OR (COALESCE(t.settings_passcode_hash, '') = ''
          AND m.trip_id IN (SELECT public.writable_trips()))
    )
$$;

REVOKE ALL ON FUNCTION public.organiser_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organiser_trips() TO authenticated, service_role;

DROP POLICY IF EXISTS trips_member_update ON trips;
CREATE POLICY trips_organiser_update ON trips FOR UPDATE TO authenticated
  USING (id IN (SELECT public.organiser_trips()))
  WITH CHECK (id IN (SELECT public.organiser_trips()));

DROP POLICY IF EXISTS players_member_delete ON players;
CREATE POLICY players_organiser_delete ON players FOR DELETE TO authenticated
  USING (trip_id IN (SELECT public.organiser_trips()));

DROP POLICY IF EXISTS rounds_member_delete ON rounds;
CREATE POLICY rounds_organiser_delete ON rounds FOR DELETE TO authenticated
  USING (trip_id IN (SELECT public.organiser_trips()));

DROP POLICY IF EXISTS event_messages_member_delete ON event_messages;
CREATE POLICY event_messages_organiser_delete ON event_messages FOR DELETE TO authenticated
  USING (trip_id IN (SELECT public.organiser_trips()));

DROP POLICY IF EXISTS teams_member_delete ON teams;
CREATE POLICY teams_delete ON teams FOR DELETE TO authenticated
  USING (
    trip_id IN (SELECT public.organiser_trips())
    OR (trip_id IN (SELECT public.writable_trips()) AND (
         -- A golf trip: its teams are the group's.
         EXISTS (SELECT 1 FROM public.trips t
                 WHERE t.id = teams.trip_id
                   AND t.kind IS DISTINCT FROM 'tournament'
                   AND t.kind IS DISTINCT FROM 'run')
         -- Anywhere else: a team left with at most one, never an event's tag.
         OR ((SELECT count(*) FROM public.team_members tm WHERE tm.team_id = teams.id) <= 1
             AND NOT (teams.team_set = 'main'
                      AND EXISTS (SELECT 1 FROM public.trips t
                                  WHERE t.id = teams.trip_id AND t.kind = 'tournament')))
    ))
  );

-- ─── (3) The hashes, closed to phones ────────────────────────

REVOKE SELECT, UPDATE ON public.trips FROM anon, authenticated;

DO $$
DECLARE
  readable   text;
  changeable text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO readable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trips'
    AND column_name NOT IN ('settings_passcode_hash', 'public_passcode_hash');

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO changeable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trips'
    AND column_name NOT IN ('settings_passcode_hash', 'public_passcode_hash', 'id', 'trip_code', 'created_at');

  EXECUTE format('GRANT SELECT (%s) ON public.trips TO authenticated', readable);
  EXECUTE format('GRANT UPDATE (%s) ON public.trips TO authenticated', changeable);
END $$;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- The new rules by name — five rows, one for each table:
--
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND policyname IN ('trips_organiser_update',
--     'players_organiser_delete', 'rounds_organiser_delete',
--     'event_messages_organiser_delete', 'teams_delete')
--   ORDER BY 1;
--
-- The hashes closed and everything else open (false, false, true, true):
--
--   SELECT has_column_privilege('authenticated', 'public.trips', 'settings_passcode_hash', 'SELECT') AS admin_hash_open,
--          has_column_privilege('authenticated', 'public.trips', 'public_passcode_hash',   'SELECT') AS public_hash_open,
--          has_column_privilege('authenticated', 'public.trips', 'name',                   'SELECT') AS name_readable,
--          has_column_privilege('authenticated', 'public.trips', 'leaderboards',           'UPDATE') AS boards_writable;
--
-- And scripts/rls-check.sql's stage 4 blocks pretend to be a guest and an
-- organiser.

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time: back to exactly stage 3 (070) — members read and write
-- everything on the ten tables, no cap, the columns open again. Run all of
-- it; nothing here loses data. (070's own undo, switching row-level
-- security off on the ten tables, still works on top of this too.)
--
--   GRANT SELECT, UPDATE ON public.trips TO anon, authenticated;
--
--   CREATE OR REPLACE FUNCTION public.writable_trips()
--   RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
--   AS $f$
--     SELECT m.trip_id FROM public.trip_members m
--     WHERE m.user_id = (SELECT auth.uid())
--       AND (m.role IN ('player', 'guest') OR m.organiser_until > now())
--   $f$;
--
--   DROP POLICY IF EXISTS trips_organiser_update ON trips;
--   CREATE POLICY trips_member_update ON trips FOR UPDATE TO authenticated
--     USING (id IN (SELECT public.writable_trips())) WITH CHECK (id IN (SELECT public.writable_trips()));
--   DROP POLICY IF EXISTS players_organiser_delete ON players;
--   CREATE POLICY players_member_delete ON players FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));
--   DROP POLICY IF EXISTS rounds_organiser_delete ON rounds;
--   CREATE POLICY rounds_member_delete ON rounds FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));
--   DROP POLICY IF EXISTS event_messages_organiser_delete ON event_messages;
--   CREATE POLICY event_messages_member_delete ON event_messages FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));
--   DROP POLICY IF EXISTS teams_delete ON teams;
--   CREATE POLICY teams_member_delete ON teams FOR DELETE TO authenticated USING (trip_id IN (SELECT public.writable_trips()));
--
--   DROP FUNCTION IF EXISTS public.organiser_trips();
--
-- The hashes re-stored salted and slow stay so — the stage 4 code reads
-- both kinds, and an earlier deploy would not: roll the code back to before
-- stage 4 only with this undo run AND no PIN typed since, or that event's
-- padlock will not open on the old code.
