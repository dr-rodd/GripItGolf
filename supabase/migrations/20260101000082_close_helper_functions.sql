-- 082 — close two functions the Security Advisor flagged (11 Nov 2026).
--
-- Paste any time; nothing in the app calls either through the API.
--
--   cleanup_stale_live_data()        An old SQL twin of the nightly cleanup's
--                                    step 1 (the app does it in /api/cleanup).
--                                    It was runnable by anyone through the
--                                    API, with a mutable search path. Now the
--                                    server's alone, and pinned.
--   refuse_card_without_scorecard()  Migration 073's trigger function. A
--                                    trigger needs no caller's EXECUTE right,
--                                    so every phone loses it harmlessly.
--
-- The other "signed-in users can execute" warnings (readable_trips,
-- writable_trips, organiser_trips, readable_rounds, writable_rounds,
-- readable_live_rounds, writable_live_rounds) are deliberate: the row-level
-- security policies call them as the phone's own role, so a phone must keep
-- the right. Each returns only what the phone's own membership allows.

ALTER FUNCTION public.cleanup_stale_live_data() SET search_path = public;

REVOKE ALL ON FUNCTION public.cleanup_stale_live_data()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refuse_card_without_scorecard()    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_live_data()       TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     NOT has_function_privilege('anon',          'public.cleanup_stale_live_data()', 'EXECUTE') AS closed_to_anon,
--     NOT has_function_privilege('authenticated', 'public.cleanup_stale_live_data()', 'EXECUTE') AS closed_to_phones,
--     NOT has_function_privilege('authenticated', 'public.refuse_card_without_scorecard()', 'EXECUTE') AS gate_closed_to_phones,
--     has_function_privilege('authenticated',     'public.readable_trips()', 'EXECUTE') AS policy_helper_still_open;
--
-- And a card still refuses a course with no scorecard (scripts/rls-check.sql,
-- "Scorecard gate"). Undo: GRANT EXECUTE on the two back to PUBLIC.
