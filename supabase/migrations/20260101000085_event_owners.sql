-- 085 — events with an owner, and Green Dot members linked to their players
-- (stage (b1); D105–D107, D134; Ross, 15 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY. Nothing changes by pasting it: no event has
-- an owner until the new code records one, no link exists until a signed-in
-- phone claims a name, and an unanswered `settings_by` reads as today's rule.
-- Nobody ever needs an account to join, play, score or watch (D94) — every
-- line below only ever adds an OR.
--
-- (1) trip_private.owner_id — the Green Dot member who owns the event: its
--     maker, when the maker was signed in; or whoever claims it, by the
--     email it was made with or by typing its organiser PIN while signed
--     in. An owner is the organiser on any phone they are signed in on —
--     no PIN, no twelve hours, never capped at 30 days (as the PIN holder
--     is not). The PIN still lends organiser to a helper for twelve hours.
--     Kept on trip_private, which no phone reads; a page is only ever told
--     "this phone owns this event".
-- (2) trip_private.settings_by — D107: an owned event with no PIN asks who
--     may change its settings, 'owner' ("Just me") or 'anyone' ("Anyone in
--     the event"). NULL — never asked — is today's rule: every member of an
--     event without a PIN is its organiser. Only 'owner' narrows it.
-- (3) account_players — D134: a Green Dot member linked to their player in
--     an event. One account per player (UNIQUE player_id) and one player per
--     account per event. Server only.
-- (4) account_trips(), and an OR for it in writable_trips() and
--     organiser_trips() — 071's two functions, word for word, with the
--     owner added. lib/membership.ts (`organiserNow`, `roleOf`, `mayWrite`,
--     `mayChangeEvent`) says the same in TypeScript.
-- (5) claim_events_by_email(uid, email) — the events made with this email
--     and owned by nobody yet become this account's (D106). Server only.

-- ─── (1) and (2) The owner, and D107 ──────────────────────────

ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS owner_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS owner_claimed_at timestamptz NULL;
ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS settings_by text NULL CHECK (settings_by IN ('owner', 'anyone'));
CREATE INDEX IF NOT EXISTS idx_trip_private_owner ON trip_private(owner_id) WHERE owner_id IS NOT NULL;

-- ─── (3) A Green Dot member linked to their player (D134) ─────

CREATE TABLE IF NOT EXISTS account_players (
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id   uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  player_id uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_id),
  UNIQUE (player_id)
);
CREATE INDEX IF NOT EXISTS idx_account_players_trip ON account_players(trip_id);

ALTER TABLE account_players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_players FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_players TO service_role;

-- ─── (4) The events this signed-in account owns ───────────────

CREATE OR REPLACE FUNCTION public.account_trips()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.trip_id FROM public.trip_private p
  WHERE p.owner_id IS NOT NULL AND p.owner_id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION public.account_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_trips() TO authenticated, service_role;

-- 071's writable_trips(), the owner added: never capped, like the PIN.
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
      OR m.trip_id IN (SELECT public.account_trips())
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

-- 071's organiser_trips(), the owner added — and D107: an owned event with
-- no PIN set to 'owner' ("Just me") is no longer every member's to change.
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
      OR m.trip_id IN (SELECT public.account_trips())
      OR (COALESCE(t.settings_passcode_hash, '') = ''
          AND NOT EXISTS (SELECT 1 FROM public.trip_private p
                          WHERE p.trip_id = m.trip_id
                            AND p.owner_id IS NOT NULL
                            AND p.settings_by = 'owner')
          AND m.trip_id IN (SELECT public.writable_trips()))
    )
$$;

-- ─── (5) Claimed by the email the event was made with (D106) ──

CREATE OR REPLACE FUNCTION public.claim_events_by_email(uid uuid, email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed integer;
BEGIN
  IF uid IS NULL OR email IS NULL OR btrim(email) = '' THEN RETURN 0; END IF;
  UPDATE public.trip_private p
     SET owner_id = uid, owner_claimed_at = now(), updated_at = now()
   WHERE p.owner_id IS NULL
     AND p.lead_email IS NOT NULL
     AND lower(btrim(p.lead_email)) = lower(btrim(email));
  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END
$$;

REVOKE ALL ON FUNCTION public.claim_events_by_email(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_events_by_email(uuid, text) TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'owner_id')    AS owner_column,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'settings_by') AS settings_by_column,
--     to_regclass('public.account_players') IS NOT NULL                                                                  AS links_table,
--     NOT has_table_privilege('authenticated', 'public.account_players', 'SELECT')                                       AS links_closed,
--     pg_get_functiondef('public.writable_trips()'::regprocedure)  LIKE '%account_trips()%'                              AS writable_has_owner,
--     pg_get_functiondef('public.organiser_trips()'::regprocedure) LIKE '%account_trips()%'                              AS organiser_has_owner,
--     pg_get_functiondef('public.writable_trips()'::regprocedure)  LIKE '%end_date + 31%'                                AS cap_kept,
--     NOT has_function_privilege('authenticated', 'public.claim_events_by_email(uuid, text)', 'EXECUTE')               AS claim_closed,
--     (SELECT count(*) FROM trip_private WHERE owner_id IS NOT NULL) = 0                                                 AS nobody_owns_yet;
--
-- (The last reads true only straight after pasting, before the deploy.)

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time: back to exactly 071 — owners lose nothing they did not
-- have before, and the links table goes. Run all of it.
--
--   CREATE OR REPLACE FUNCTION public.writable_trips()
--   RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
--   AS $f$
--     SELECT m.trip_id FROM public.trip_members m JOIN public.trips t ON t.id = m.trip_id
--     WHERE m.user_id = (SELECT auth.uid())
--       AND (m.organiser_until > now()
--         OR (m.role IN ('player', 'guest') AND (
--               t.end_date IS NULL
--            OR now() < ((t.end_date + 31)::timestamp AT TIME ZONE 'Europe/Dublin')
--            OR (t.kind = 'tournament'
--                AND jsonb_typeof(t.bracket_setup) = 'object'
--                AND t.bracket_setup -> 'format' = '"league"'::jsonb
--                AND t.bracket_setup -> 'schedule' = '"series"'::jsonb
--                AND COALESCE(t.bracket_setup -> 'repeat', 'null'::jsonb) = 'null'::jsonb
--                AND jsonb_typeof(t.event_permissions) = 'object'
--                AND t.event_permissions -> 'add_rounds' = 'true'::jsonb))))
--   $f$;
--
--   CREATE OR REPLACE FUNCTION public.organiser_trips()
--   RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
--   AS $f$
--     SELECT m.trip_id FROM public.trip_members m JOIN public.trips t ON t.id = m.trip_id
--     WHERE m.user_id = (SELECT auth.uid())
--       AND (m.organiser_until > now()
--         OR (COALESCE(t.settings_passcode_hash, '') = ''
--             AND m.trip_id IN (SELECT public.writable_trips())))
--   $f$;
--
--   DROP FUNCTION IF EXISTS public.claim_events_by_email(uuid, text);
--   DROP FUNCTION IF EXISTS public.account_trips();
--   DROP TABLE IF EXISTS account_players;
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS settings_by;
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS owner_claimed_at;
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS owner_id;
