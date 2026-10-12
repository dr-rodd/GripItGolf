-- Migration 053 — Green Dot Run: the runs themselves
--
-- One row per run, in one challenge, by one runner. Typed in by the runner
-- (source 'manual') now; arriving from Strava (source 'strava') in the next
-- stage, which is why `strava_activity_id` exists already.
--
-- What is stored is what happened — the day, the activity, the distance,
-- the time. **Points are never stored**: a leaderboard applies the
-- challenge's rules (trips.run_setup, lib/runChallenge.ts) to these rows
-- each time it is drawn, so an organiser who changes a rule re-tells the
-- whole board at once.
--
-- ── Server only, both ways ──────────────────────────────────
--
-- Row level security is ON and there is **no policy at all**, so the
-- browser's key can neither read nor write this table — only the server, on
-- the service role. That is stricter than every golf table, on purpose:
--
--   · Strava's rules say a runner's data may only be shown to that runner.
--     With the table closed, the only way a run leaves the database is
--     through our own pages, which send other people's runs out as totals
--     and points and never as rows.
--   · Every write goes through one server route that checks it against the
--     challenge — its dates, what counts, whether typing runs in is allowed
--     — so a run that breaks the rules cannot be saved from anywhere.
--
-- ON DELETE CASCADE from both trips and players: deleting a challenge, or
-- removing a runner from it, takes their runs with it.
--
-- The CHECKs are the backstop, not the rules — lib/runChallenge.ts holds
-- the real limits (a run of up to 100 km, a time of up to a day) and the
-- route enforces them; these only refuse what no rule could ever allow.
--
-- Needs migration 052. Safe to re-paste: every statement is idempotent.
-- Run once, by hand, in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            uuid        NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,
  player_id          uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source             text        NOT NULL CHECK (source IN ('manual', 'strava')),
  activity           text        NOT NULL
                       CHECK (activity IN ('run', 'trail_run', 'treadmill', 'walk', 'hike')),
  -- The day the run counts on, as the runner saw it.
  run_date           date        NOT NULL,
  distance_m         integer     NOT NULL CHECK (distance_m > 0 AND distance_m <= 500000),
  moving_s           integer     CHECK (moving_s IS NULL OR (moving_s > 0 AND moving_s <= 172800)),
  -- Strava's own id for the activity, when it came from there. Unique per
  -- challenge, so a run Strava tells us about twice is stored once.
  strava_activity_id bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_runs_trip_strava UNIQUE (trip_id, strava_activity_id)
);

CREATE INDEX IF NOT EXISTS runs_trip_idx   ON runs (trip_id, run_date);
CREATE INDEX IF NOT EXISTS runs_player_idx ON runs (player_id);

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: the service role bypasses RLS; nobody else
-- gets in. Dropped defensively in case one was ever added by hand.
DROP POLICY IF EXISTS runs_read ON runs;
DROP POLICY IF EXISTS runs_write ON runs;

COMMENT ON TABLE runs IS
  'Green Dot Run: one row per run. Server only (RLS on, no policies). Points are derived by lib/runChallenge.ts, never stored.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Two rows back: the table exists (found = 1) with RLS on (found = 1).
select 'runs table' as what, count(*) as found
  from information_schema.tables where table_name = 'runs'
union all
select 'runs RLS on', count(*) from pg_class
  where relname = 'runs' and relrowsecurity;
