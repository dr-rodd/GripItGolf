-- Migration 055 — Green Dot Run: Strava retention, and final results
--
-- Strava's API Policy (2026) lets an app hold Strava data only as a short-
-- lived copy: no more than seven days old (§6.2), gone within 48 hours of
-- the runner deleting it on Strava (§6.3), and every trace of a runner
-- erased within 30 days of them revoking access (§7.4). Three columns make
-- that enforceable, and one holds what survives a challenge's end:
--
-- * `runs.refreshed_at` — when Strava last confirmed this run. Every sync
--   and webhook write stamps it; the nightly job deletes any Strava run not
--   confirmed within seven days, so a stored copy can never outlive the
--   policy even if syncing stops. Typed-in runs leave it NULL — they are
--   Green Dot's own data, not Strava's.
--
-- * `strava_athletes.last_ok_at` — when this connection last worked. A
--   connection that has not worked for 25 days is treated as revoked and
--   forgotten, inside §7.4's 30 days, even if Strava's revoke event never
--   arrived.
--
-- * `trips.run_results` — the frozen final standings of a finished run
--   challenge: team totals only, taken three days after the finish, at the
--   moment every Strava run in it is deleted and every Strava link to it is
--   ended. The connection lasts for the challenge; the team result is what
--   stays. (Keeping a total derived from Strava runs is a question put to
--   Strava — docs/run.md.)
--
-- Needs migrations 053 and 054. Safe to re-paste: every statement is
-- idempotent. Run once, by hand, in the Supabase SQL editor.

BEGIN;

ALTER TABLE runs ADD COLUMN IF NOT EXISTS refreshed_at timestamptz;
UPDATE runs SET refreshed_at = created_at WHERE source = 'strava' AND refreshed_at IS NULL;
CREATE INDEX IF NOT EXISTS runs_strava_refresh_idx ON runs (refreshed_at) WHERE source = 'strava';

ALTER TABLE strava_athletes ADD COLUMN IF NOT EXISTS last_ok_at timestamptz;
UPDATE strava_athletes SET last_ok_at = updated_at WHERE last_ok_at IS NULL;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS run_results jsonb;

COMMENT ON COLUMN runs.refreshed_at IS
  'Strava runs: when Strava last confirmed this run. Deleted when older than 7 days (Strava API Policy 6.2). NULL for typed-in runs.';
COMMENT ON COLUMN trips.run_results IS
  'Run challenges: frozen final team standings, taken when the challenge closes and its Strava data is deleted.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
-- Three rows back, each found = 1.
select 'runs.refreshed_at' as what, count(*) as found from information_schema.columns
  where table_name = 'runs' and column_name = 'refreshed_at'
union all
select 'strava_athletes.last_ok_at', count(*) from information_schema.columns
  where table_name = 'strava_athletes' and column_name = 'last_ok_at'
union all
select 'trips.run_results', count(*) from information_schema.columns
  where table_name = 'trips' and column_name = 'run_results';
