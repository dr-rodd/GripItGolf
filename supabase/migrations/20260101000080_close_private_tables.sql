-- ============================================================
-- 080 — server-only tables: take the automatic phone grants off
-- ============================================================
--
-- `trip_private` (078) and `pin_resets` (072) have RLS on and no policy, so a
-- phone reads nothing from them (checked: no rows). But this project still
-- hands new public tables to anon and authenticated on its own, so the
-- grants exist and only the missing policy is the lock. This removes the
-- grants as well — a second lock, as "New tables need grants" in CLAUDE.md
-- intends for a server-only table. The server (service_role) is untouched.

REVOKE ALL ON public.trip_private FROM anon, authenticated;
REVOKE ALL ON public.pin_resets   FROM anon, authenticated;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- All four false:
--
-- SELECT has_table_privilege('authenticated', 'public.trip_private', 'SELECT') AS a,
--        has_table_privilege('anon',          'public.trip_private', 'SELECT') AS b,
--        has_table_privilege('authenticated', 'public.pin_resets',   'SELECT') AS c,
--        has_table_privilege('anon',          'public.pin_resets',   'SELECT') AS d;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- GRANT ALL ON public.trip_private, public.pin_resets TO anon, authenticated;
