-- Migration 054 — Green Dot Run: Strava connections
--
-- Two tables, both closed to the browser (RLS on, no policies — the same
-- posture as `runs`, migration 053), and one column on `runs`.
--
-- * `strava_athletes` — one row per Strava account that has connected:
--   its access and refresh tokens and when the access token expires. These
--   are secrets. Only the server, on the service role, ever reads them;
--   they are never sent to a phone, not even the owner's.
--
-- * `strava_links` — which runner in which challenge a Strava account
--   feeds, and when they ticked the consent box ("my totals appear on this
--   challenge's leaderboard"). One runner, one Strava account; and within
--   one challenge one Strava account feeds one runner only, so nobody's
--   runs count twice under two names.
--
-- * `runs.device_name` — what recorded a Strava run, when Strava says.
--   Strava's terms ask that data recorded on a Garmin device is credited to
--   Garmin wherever it is shown; this is what lets the runner's own list
--   say so.
--
-- Deleting a challenge or a runner takes their links with it (CASCADE);
-- deleting an athlete row takes every link to it. A runner's Strava *runs*
-- are removed by the app when they disconnect or revoke access on Strava —
-- Strava requires their data gone within 30 days; the app does it at once.
--
-- Needs migrations 052 and 053. Safe to re-paste: every statement is
-- idempotent. Run once, by hand, in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS strava_athletes (
  athlete_id    bigint      PRIMARY KEY,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  scope         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strava_links (
  player_id      uuid        PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  trip_id        uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  athlete_id     bigint      NOT NULL REFERENCES strava_athletes(athlete_id) ON DELETE CASCADE,
  consented_at   timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  CONSTRAINT uq_strava_links_trip_athlete UNIQUE (trip_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS strava_links_athlete_idx ON strava_links (athlete_id);

ALTER TABLE strava_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_links ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: the service role bypasses RLS; nobody else
-- gets in.

ALTER TABLE runs ADD COLUMN IF NOT EXISTS device_name text;

COMMENT ON TABLE strava_athletes IS
  'Green Dot Run: Strava tokens per connected athlete. Secrets — server only (RLS on, no policies).';
COMMENT ON TABLE strava_links IS
  'Green Dot Run: which runner a Strava account feeds, with consent time. Server only.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Three rows back, each found = 1.
select 'strava_athletes (RLS on)' as what, count(*) as found from pg_class
  where relname = 'strava_athletes' and relrowsecurity
union all
select 'strava_links (RLS on)', count(*) from pg_class
  where relname = 'strava_links' and relrowsecurity
union all
select 'runs.device_name', count(*) from information_schema.columns
  where table_name = 'runs' and column_name = 'device_name';
