-- Migration 049 — event permissions
--
-- One jsonb column: what an event's field may do for itself, as a plain
-- map of permission key to boolean. The keys, labels and defaults live in
-- lib/eventPermissions.ts — the only copy — and a new permission later is
-- one line there, never another migration here: absent keys read as their
-- registry default, which is what jsonb is for.
--
-- Seeded meanings (all defaulting off — the organiser opts in):
--   add_courses  participants may add a platform course
--   add_players  participants may add a new name to the roster
--   edit_scores  participants may rework a scorecard from the summary
--
-- Trips never read this column and never change behaviour — the gate
-- helper answers "yes" for anything that is not an event. Reads fail soft
-- in their own query or ride a select('*'); writes name the column only
-- from event creation (when a toggle was actually flipped) and the
-- organiser's admin page, which says calmly when this has not run yet.
--
-- Safe to re-paste — idempotent. Run once, by hand, in the Supabase SQL
-- editor.

BEGIN;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS event_permissions jsonb;

COMMENT ON COLUMN trips.event_permissions IS
  'Event participant permissions (lib/eventPermissions.ts): {key: boolean}. NULL or absent keys = registry defaults (all off). Events only; trips never read it.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
select 'trips.event_permissions' as what, count(*) as found
  from information_schema.columns
  where table_name = 'trips' and column_name = 'event_permissions';
