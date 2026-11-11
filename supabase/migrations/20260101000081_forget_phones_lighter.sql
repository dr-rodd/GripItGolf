-- 081 — forgetting anonymous phones, lighter (Ross, 11 Nov 2026).
--
-- Paste any time after 069. Replaces the two functions only; nothing is
-- deleted by pasting, and the nightly cleanup still deletes only once
-- FORGET_ANONYMOUS_PHONES (lib/membership.ts) is switched on.
--
-- Why: a forgotten phone costs nothing to bring back — its cookie and event
-- code sign it in afresh and `/api/entry` re-links its claimed name — so the
-- rule need not ask whether a phone was recently seen where an event's end
-- date already says it is done. That question (the latest session of every
-- phone, in auth.sessions) was the costly part of 069 on a free-tier
-- database, and it ran for every anonymous phone. Now it runs only for the
-- few phones in an open-ended event.
--
--   an anonymous phone is forgotten when
--   (1) it belongs to no event and was made more than 7 days ago; or
--   (2) none of its events is still within 30 days of ending (Irish date) —
--       an event with an end date is closed 30 days after it —
--       and, if any of its events is open-ended (no end date, or an ad hoc
--       series whose field may still add rounds — the twin of 071's
--       `writable_trips()` and `fieldOpenEnded`), it has also not been seen
--       for 90 days.
--
-- Never a phone with an account behind it (`is_anonymous` only).

CREATE OR REPLACE FUNCTION public.anonymous_phones_to_forget(as_of timestamptz DEFAULT now())
RETURNS TABLE (user_id uuid, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, 'in no event'
  FROM auth.users u
  WHERE u.is_anonymous IS TRUE
    AND u.created_at < as_of - interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id = u.id)
  UNION ALL
  SELECT u.id, 'every event closed'
  FROM auth.users u
  WHERE u.is_anonymous IS TRUE
    AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id = u.id)
    -- no event with an end date still within its 30 days
    AND NOT EXISTS (
      SELECT 1
      FROM public.trip_members m
      JOIN public.trips t ON t.id = m.trip_id
      WHERE m.user_id = u.id
        AND t.end_date IS NOT NULL
        AND t.end_date >= (as_of AT TIME ZONE 'Europe/Dublin')::date - 30
    )
    -- an open-ended event (no end date, or an ad hoc series still adding
    -- rounds) is left to the phone's own silence: unseen for 90 days
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.trip_members m
        JOIN public.trips t ON t.id = m.trip_id
        WHERE m.user_id = u.id
          AND (
               t.end_date IS NULL
            OR (t.kind = 'tournament'
                AND jsonb_typeof(t.bracket_setup) = 'object'
                AND t.bracket_setup -> 'format' = '"league"'::jsonb
                AND t.bracket_setup -> 'schedule' = '"series"'::jsonb
                AND COALESCE(t.bracket_setup -> 'repeat', 'null'::jsonb) = 'null'::jsonb
                AND jsonb_typeof(t.event_permissions) = 'object'
                AND t.event_permissions -> 'add_rounds' = 'true'::jsonb))
      )
      OR GREATEST(
           u.created_at,
           COALESCE(u.last_sign_in_at, u.created_at),
           COALESCE((SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
         ) < as_of - interval '90 days'
    )
$$;

-- The deletion, bounded per run. Unchanged but for being the only call the
-- cleanup makes when it deletes: it returns how many it removed.
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

REVOKE ALL ON FUNCTION public.anonymous_phones_to_forget(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forget_anonymous_phones(integer)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymous_phones_to_forget(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.forget_anonymous_phones(integer)        TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     pg_get_functiondef('public.anonymous_phones_to_forget(timestamptz)'::regprocedure) LIKE '%every event closed%' AS new_rule,
--     NOT has_function_privilege('anon',          'public.forget_anonymous_phones(integer)', 'EXECUTE') AS closed_to_anon,
--     NOT has_function_privilege('authenticated', 'public.forget_anonymous_phones(integer)', 'EXECUTE') AS closed_to_phones,
--     has_function_privilege('service_role',      'public.forget_anonymous_phones(integer)', 'EXECUTE') AS server_may;
--
-- Undo: paste 069 again (it replaces both functions).
