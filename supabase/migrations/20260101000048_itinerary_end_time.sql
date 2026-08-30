-- Migration 048 — an activity's end time
--
-- One column: when an itinerary activity finishes. Optional, and only ever
-- alongside a start — the day plan's timescale draws an event without an
-- end as an hour (lib/itinerary.ts, DEFAULT_EVENT_MINS), so absence is a
-- meaning, not a gap. Golf never stores one: its end is the five-hour rule
-- (golfSpanMins), derived, never written.
--
-- The shape constraint is replaced whole, the way migration 027 replaced
-- it: every branch again, so a drive or a bed cannot carry an end time and
-- an activity cannot carry an end without a start. Replaced by its own
-- name — 027 named it explicitly, so the name is a promise here.
--
-- Reads fail soft (the hub and the setup page fetch this column in their
-- own query, never inside the main select) and writes only name it when an
-- end was actually given — so everything works before this runs, and only
-- saving an actual end time needs it.
--
-- Safe to re-paste — idempotent. Run once, by hand, in the Supabase SQL
-- editor.

BEGIN;

ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS end_time time;

COMMENT ON COLUMN itinerary_items.end_time IS
  'When an activity finishes, local clock time. Optional — absent reads as an hour on the timescale. Activity only, and only with a start; golf''s end is derived (five hours from the last tee).';

ALTER TABLE itinerary_items
  DROP CONSTRAINT IF EXISTS ck_itinerary_shape;

ALTER TABLE itinerary_items
  ADD CONSTRAINT ck_itinerary_shape CHECK (
    CASE kind
      WHEN 'golf'     THEN stay_name IS NULL AND travel_mode IS NULL
                       AND from_place IS NULL AND to_place IS NULL AND duration_mins IS NULL
                       AND activity_name IS NULL AND activity_time IS NULL
                       AND end_time IS NULL
      WHEN 'stay'     THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                       AND travel_mode IS NULL AND from_place IS NULL AND to_place IS NULL
                       AND duration_mins IS NULL
                       AND activity_name IS NULL AND activity_time IS NULL
                       AND end_time IS NULL
      WHEN 'travel'   THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                       AND stay_name IS NULL
                       AND activity_name IS NULL AND activity_time IS NULL
                       AND end_time IS NULL
      -- An activity keeps 027's rule — a name, none of anyone else's
      -- columns — and adds: an end only ever alongside a start.
      WHEN 'activity' THEN course_id IS NULL AND tee_time IS NULL AND tee_count IS NULL
                       AND stay_name IS NULL AND travel_mode IS NULL
                       AND from_place IS NULL AND to_place IS NULL AND duration_mins IS NULL
                       AND activity_name IS NOT NULL
                       AND (end_time IS NULL OR activity_time IS NOT NULL)
    END
  );

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
select 'itinerary_items.end_time' as what, count(*) as found
  from information_schema.columns
  where table_name = 'itinerary_items' and column_name = 'end_time'
union all
select 'ck_itinerary_shape mentions end_time', count(*)
  from pg_constraint
  where conname = 'ck_itinerary_shape'
    and pg_get_constraintdef(oid) like '%end_time%';
