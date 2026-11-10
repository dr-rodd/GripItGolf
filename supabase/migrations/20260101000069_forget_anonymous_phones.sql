-- 069 — forgetting anonymous phones (row-level security, stage 2).
--
-- Paste any time after 068. Nothing deletes on its own when this lands: the
-- nightly cleanup only counts until FORGET_ANONYMOUS_PHONES in
-- lib/membership.ts is switched on, which happens after the dry-run count in
-- scripts/rls-check.sql has been looked at.
--
-- Supabase never expires an anonymous user by itself. The rule (Ross,
-- 10 Nov 2026), written once, here — the count and the deletion both read it:
--
--   an anonymous phone is forgotten when
--   (1) it belongs to no event and was made more than 7 days ago; or
--   (2) it has not been seen for 90 days — no sign-in and no session
--       refreshed — and none of its events is still open: every one has an
--       end date, and ended more than 30 days ago (Irish date).
--
-- Never a phone with an account behind it (`is_anonymous` only), and never
-- one in an event still being played or within its 30-day write window.
-- Forgetting a phone deletes its auth user; its trip_members rows go with it
-- (ON DELETE CASCADE, 068). A phone that comes back simply signs in afresh
-- and enters again — guest or player at once, organiser with the PIN.

CREATE OR REPLACE FUNCTION public.anonymous_phones_to_forget(as_of timestamptz DEFAULT now())
RETURNS TABLE (user_id uuid, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH anon AS (
    SELECT
      u.id,
      u.created_at,
      GREATEST(
        u.created_at,
        COALESCE(u.last_sign_in_at, u.created_at),
        COALESCE((SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
      ) AS last_seen
    FROM auth.users u
    WHERE u.is_anonymous IS TRUE
  )
  SELECT a.id, 'in no event'
  FROM anon a
  WHERE a.created_at < as_of - interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id = a.id)
  UNION ALL
  SELECT a.id, 'unseen 90 days, every event closed'
  FROM anon a
  WHERE a.last_seen < as_of - interval '90 days'
    AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id = a.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.trip_members m
      JOIN public.trips t ON t.id = m.trip_id
      WHERE m.user_id = a.id
        AND (t.end_date IS NULL OR t.end_date >= (as_of AT TIME ZONE 'Europe/Dublin')::date - 30)
    )
$$;

-- The nightly deletion: at most `max_rows` a night, so a backlog drains over
-- a few nights rather than in one long statement.
CREATE OR REPLACE FUNCTION public.forget_anonymous_phones(max_rows integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  forgotten integer;
BEGIN
  DELETE FROM auth.users u
  WHERE u.id IN (SELECT f.user_id FROM public.anonymous_phones_to_forget(now()) f LIMIT max_rows)
    AND u.is_anonymous IS TRUE;
  GET DIAGNOSTICS forgotten = ROW_COUNT;
  RETURN forgotten;
END
$$;

-- The server's alone. Supabase lets anon and authenticated execute a new
-- function in `public` unless told otherwise — and these read and delete
-- auth users.
REVOKE ALL ON FUNCTION public.anonymous_phones_to_forget(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_anonymous_phones(integer)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymous_phones_to_forget(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.forget_anonymous_phones(integer)        TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regprocedure('public.anonymous_phones_to_forget(timestamptz)') IS NOT NULL AS count_function,
--     to_regprocedure('public.forget_anonymous_phones(integer)')        IS NOT NULL AS delete_function,
--     NOT has_function_privilege('anon',          'public.forget_anonymous_phones(integer)', 'EXECUTE') AS closed_to_anon,
--     NOT has_function_privilege('authenticated', 'public.forget_anonymous_phones(integer)', 'EXECUTE') AS closed_to_phones,
--     has_function_privilege('service_role',      'public.forget_anonymous_phones(integer)', 'EXECUTE') AS server_may;
--
-- Then the dry-run count in scripts/rls-check.sql.

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time; the nightly job then reports the count as unavailable
-- and deletes nothing.
--
--   DROP FUNCTION IF EXISTS public.forget_anonymous_phones(integer);
--   DROP FUNCTION IF EXISTS public.anonymous_phones_to_forget(timestamptz);
