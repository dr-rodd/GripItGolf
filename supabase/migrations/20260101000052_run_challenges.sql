-- Migration 052 — Green Dot Run: a run challenge is a kind of trip
--
-- The platform's second sport. A run challenge — an ongoing team running
-- competition over a period — rides on the same `trips` row every golf
-- event does: the code, the organiser PIN, the confirmation email, the
-- teams. Two additions tell it apart and hold what golf has no column for:
--
-- * `trips.kind` gains 'run'. Golf never sends it, so nothing golf does
--   changes; the run creation form names it, so **run this before the
--   first run challenge is created** — until then that insert is refused
--   by the CHECK and the form says, calmly, that this update is missing.
--
-- * `trips.run_setup` — jsonb, the challenge's points rules and its boards
--   (lib/runChallenge.ts is the only reader and the only shape). NULL on
--   every golf trip, for ever. Points themselves are never stored: a board
--   applies the rules to the runs each time it is drawn.
--
-- Permissions need no column: they live in `trips.event_permissions`
-- (migration 049) under run-only keys.
--
-- Runs themselves, and Strava connections, are later stages with their own
-- migrations. Nothing here touches them.
--
-- Needs migration 046 (trips.kind) to have run — it re-adds the column
-- defensively in case it has not. Safe to re-paste: every statement is
-- idempotent. Run once, by hand, in the Supabase SQL editor.

BEGIN;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'trip';
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_kind_check;
ALTER TABLE trips ADD CONSTRAINT trips_kind_check
  CHECK (kind IN ('trip', 'tournament', 'run'));

COMMENT ON COLUMN trips.kind IS
  'trip = collaborative golf trip; tournament = organiser-run golf event (Event Hub); run = Green Dot Run challenge.';

ALTER TABLE trips ADD COLUMN IF NOT EXISTS run_setup jsonb;

COMMENT ON COLUMN trips.run_setup IS
  'Run challenges only: points rules and boards, read by lib/runChallenge.ts. NULL on golf trips.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Two rows back: the kind check now allows 'run' (found = 1), and the
-- run_setup column exists (found = 1).
select 'kind allows run' as what, count(*) as found
  from information_schema.check_constraints
  where constraint_name = 'trips_kind_check' and check_clause like '%run%'
union all
select 'trips.run_setup', count(*) from information_schema.columns
  where table_name = 'trips' and column_name = 'run_setup';
