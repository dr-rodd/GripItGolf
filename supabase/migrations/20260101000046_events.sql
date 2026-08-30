-- Migration 046 — events: what a tournament is, its notices, and how a round starts
--
-- Three additions behind the Event Hub:
--
-- * `trips.kind` — 'trip' or 'tournament'. The create wizard's tournament
--   door writes 'tournament'; everything already stored defaults to 'trip'.
--   Reads fail soft (an absent column simply never says 'tournament'), but
--   the tournament INSERT names the column, so **run this before the first
--   tournament is created** — until then that insert fails with a calm
--   "database update not applied yet" message and ordinary trips are
--   untouched.
--
-- * `event_messages` — organiser notices shown on the Event Hub. Client-
--   writable like every trip-scoped table (there is no auth yet; the trip
--   code is the only access control — migration 040's note holds here too).
--   The organiser PIN in front of the posting screen is a soft UI gate,
--   exactly like the settings lock. ON DELETE CASCADE, so deleting a trip
--   takes its notices with it without lib/tripDelete.ts needing to know.
--
-- * `rounds.start_format` — how the field gets going: 'shotgun' (everyone
--   off at once; the time itself lives on the round's itinerary item, where
--   the countdown and the weather already read it) or 'tee_sheet' (groups
--   and times, functionality to follow). NULL means nobody has said.
--
-- Safe to re-paste — every statement is idempotent. Run once, by hand, in
-- the Supabase SQL editor.

BEGIN;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'trip';
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_kind_check;
ALTER TABLE trips ADD CONSTRAINT trips_kind_check
  CHECK (kind IN ('trip', 'tournament'));

COMMENT ON COLUMN trips.kind IS
  'trip = collaborative golf trip; tournament = organiser-run event (Event Hub).';

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS start_format text;
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_start_format_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_start_format_check
  CHECK (start_format IS NULL OR start_format IN ('shotgun', 'tee_sheet'));

COMMENT ON COLUMN rounds.start_format IS
  'shotgun = whole field at once (time on the itinerary item); tee_sheet = groups and times, to come. NULL = not chosen.';

CREATE TABLE IF NOT EXISTS event_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  -- The app folds and caps at 280 (lib/eventHub.ts); the CHECK is the
  -- backstop against anything that skips the app.
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_messages_trip_idx
  ON event_messages (trip_id, created_at DESC);

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Three rows back: both columns listed, and event_messages present.
select 'trips.kind' as what, count(*) as found from information_schema.columns
  where table_name = 'trips' and column_name = 'kind'
union all
select 'rounds.start_format', count(*) from information_schema.columns
  where table_name = 'rounds' and column_name = 'start_format'
union all
select 'event_messages', count(*) from information_schema.tables
  where table_name = 'event_messages';
