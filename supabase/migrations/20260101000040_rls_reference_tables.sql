-- ============================================================
-- Migration 040 — the course tables stop being writable by anyone
--
-- APPLY THIS ONE. It changes no data and no application code, and it closes
-- the largest hole in the platform.
--
-- What was true until this migration: `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships
-- inside the browser bundle — it has to, `lib/supabase.ts` is imported by the
-- join form, trip setup, the scoring flow and nine other client components —
-- and with no row-level security that key is unrestricted INSERT, UPDATE and
-- DELETE on every table in the schema. Anyone who opened greendot.live and
-- read the page source could rewrite the par and stroke index of all 88
-- platform courses, for every trip on the platform, from the browser console.
-- The Stableford trigger would then have re-scored every committed card
-- against the vandalised numbers, and nothing on any screen would have said
-- so. Supabase's own advisor is what surfaced it, in as many words:
-- "anyone with your project URL can read, edit, and delete all data".
--
-- ── Why these four tables and not the other fifteen ──────────
--
-- These four are the ones the browser READS AND NEVER WRITES. Every write to
-- them in the whole codebase comes from `app/api/courses`,
-- `app/api/card-check/**`, `app/admin/**`, or `lib/tripDelete.ts` — whose only
-- caller is `app/admin/trips/actions.ts` — and every one of those goes through
-- `createAdminClient()`. The service role bypasses RLS entirely, so a table
-- with a read policy and no write policy is exactly right: the app keeps
-- working untouched, and the anon key loses the ability to write.
--
-- The trip tables are a different problem and are deliberately left open for
-- now. There is no auth — the trip code is the only access control and the
-- database has never been told what a trip code is — and the browser writes
-- directly to `trips`, `players`, `teams`, `scores`, `live_scores`,
-- `round_handicaps`, `composite_holes`, `live_rounds`, `live_player_locks` and
-- `itinerary_items`. Enabling RLS there without a policy that can actually
-- authorise a caller stops the app dead. `docs/gotchas-and-debt.md` holds the
-- two candidate designs and the cost that decides between them.
--
-- ── The trap, so nobody closes the warning the easy way ──────
--
-- Enabling RLS with `USING (true)` write policies turns the advisor green and
-- protects nothing whatsoever. If a future migration adds an INSERT, UPDATE or
-- DELETE policy to any table below, that is what has happened. There is no
-- legitimate reason for one: nothing outside the service role writes here.
--
-- Safe to re-paste — every statement is idempotent.
-- ============================================================

BEGIN;

-- ── courses, holes, tees ────────────────────────────────────
-- Shared platform reference data. Read by everyone (the course picker, the
-- scoring card, the round summary all query these with the anon key), written
-- only by the server.

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courses_read ON courses;
CREATE POLICY courses_read ON courses
  FOR SELECT TO anon, authenticated
  USING (true);

ALTER TABLE holes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS holes_read ON holes;
CREATE POLICY holes_read ON holes
  FOR SELECT TO anon, authenticated
  USING (true);

ALTER TABLE tees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tees_read ON tees;
CREATE POLICY tees_read ON tees
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── hole_tee_yardages ───────────────────────────────────────
-- No policy at all, the way `weather_cache` has none in migration 026. Not an
-- oversight and not a stricter judgement call: no code anywhere in `app/` or
-- `lib/` reads or writes this table. If something ever needs it, it needs a
-- read policy alongside — a bare SELECT returning zero rows is how that
-- discovery would otherwise present itself.

ALTER TABLE hole_tee_yardages ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- This runs itself. Four rows back. `rls` must be true on all four;
-- `read_policies` is 1 on the first three and 0 on hole_tee_yardages; and
-- `write_policies` must be 0 on every row — a 1 there is the trap above.
select t.tablename,
       t.rowsecurity as rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.cmd = 'SELECT') as read_policies,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.cmd <> 'SELECT') as write_policies
from pg_tables t
where t.schemaname = 'public'
  and t.tablename in ('courses', 'holes', 'tees', 'hole_tee_yardages')
order by t.tablename;
