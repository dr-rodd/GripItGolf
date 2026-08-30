-- Migration 050 — the tee sheet
--
-- Two settings on the round and one table of assignments:
--
-- * `rounds.tee_interval_mins` — minutes between groups. NULL reads as 10,
--   the same ten minutes the golf-span rule has always assumed.
-- * `rounds.tee_group_size` — players per slot, 2 to 4. NULL reads as 4.
--   Both are clamped in lib/teeSheet.ts, the only copy of the bounds; the
--   CHECKs here are the backstop against anything that skips the app.
--
-- * `tee_assignments` — one row per player per round: who stands in which
--   slot. The slots themselves are never rows — a slot exists because the
--   maths says so (start time + index × interval), and an empty one is a
--   vacancy, not data. One row per player per round (UNIQUE), so two
--   phones adding the same player resolve to one answer, and moving a
--   player is an update, not a dance. The sheet's start time stays on the
--   round's itinerary item — no second copy of the clock.
--
-- Client-writable like every trip-scoped table (no auth yet; the trip code
-- is the only access control — migration 040's note holds). The
-- `edit_tee_sheet` event permission in front of the buttons is a UI gate,
-- exactly like the organiser PIN. ON DELETE CASCADE throughout, so
-- deleting a trip or a player takes their assignments without
-- lib/tripDelete.ts needing to know.
--
-- Safe to re-paste — idempotent. Run once, by hand, in the Supabase SQL
-- editor.

BEGIN;

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_interval_mins smallint;
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_tee_interval_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_tee_interval_check
  CHECK (tee_interval_mins IS NULL OR tee_interval_mins BETWEEN 5 AND 30);

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_group_size smallint;
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_tee_group_size_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_tee_group_size_check
  CHECK (tee_group_size IS NULL OR tee_group_size BETWEEN 2 AND 4);

COMMENT ON COLUMN rounds.tee_interval_mins IS
  'Minutes between tee-sheet groups. NULL = 10 (lib/teeSheet.ts).';
COMMENT ON COLUMN rounds.tee_group_size IS
  'Players per tee-sheet slot, 2-4. NULL = 4 (lib/teeSheet.ts).';

CREATE TABLE IF NOT EXISTS tee_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,
  round_id   uuid NOT NULL REFERENCES rounds(id)  ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  slot_index smallint NOT NULL CHECK (slot_index >= 0 AND slot_index < 64),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- A player stands in one slot per round, full stop.
  CONSTRAINT uq_tee_assignment UNIQUE (round_id, player_id)
);

CREATE INDEX IF NOT EXISTS tee_assignments_round_idx
  ON tee_assignments (round_id, slot_index, created_at);
CREATE INDEX IF NOT EXISTS tee_assignments_trip_idx
  ON tee_assignments (trip_id);

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
select 'rounds.tee_interval_mins' as what, count(*) as found
  from information_schema.columns
  where table_name = 'rounds' and column_name = 'tee_interval_mins'
union all
select 'rounds.tee_group_size', count(*) from information_schema.columns
  where table_name = 'rounds' and column_name = 'tee_group_size'
union all
select 'tee_assignments', count(*) from information_schema.tables
  where table_name = 'tee_assignments';
