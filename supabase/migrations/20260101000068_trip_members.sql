-- 068 — who a phone is in an event (row-level security, stage 1).
--
-- PASTE THIS INTO THE SUPABASE SQL EDITOR BEFORE THE STAGE 1 DEPLOY.
--
-- Stage 1 signs every phone in silently as a Supabase anonymous user. A
-- signed-in phone stops being the `anon` role and becomes `authenticated`,
-- and the four tables below were only ever granted to `anon` (migrations 058
-- and 067, made after Supabase stopped granting new tables on its own). So
-- without the grants at the foot of this file, every match play card on a
-- signed-in phone would be refused with "permission denied". The deploy
-- checks this migration has landed before any phone signs in
-- (`GET /api/entry`), so the order cannot lose a score either way — but paste
-- it first all the same.
--
-- This enforces nothing. `trip_members` records who entered each event and
-- how; no policy on any trip table reads it until stage 3. Rules:
-- lib/membership.ts. Only writer: app/api/entry (service role).

-- ─── Signed-in phones keep reaching the match play cards ──────
--
-- Exactly what `anon` already has on these four, for `authenticated` too.
-- Their policies (USING (true), every role) are unchanged; stage 7 replaces
-- them with membership rules. First in the file on purpose: the deploy's
-- readiness check (`GET /api/entry`) looks for `entry_attempts`, the last
-- table made here, so finding it proves these grants ran before it.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_scores         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_concessions    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_matches      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_match_scores TO authenticated;

-- ─── trip_members ─────────────────────────────────────────────
--
-- One row per signed-in phone per event. `role` is where the phone stands in
-- the field — guest (entered with the code), player (claimed a name, which
-- `player_id` names), or spectator (reserved for a watch link; nothing grants
-- it yet). Organiser is not a role stored here: it is `organiser_until`,
-- twelve hours from the last time the admin PIN was entered on that phone.

CREATE TABLE IF NOT EXISTS trip_members (
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id         uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  role            text        NOT NULL DEFAULT 'guest'
                              CHECK (role IN ('player', 'guest', 'spectator')),
  player_id       uuid        NULL REFERENCES players(id) ON DELETE SET NULL,
  organiser_until timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);

-- A phone may read its own rows (so a screen can know its role later);
-- nothing in the browser may write any. No anon grant at all.
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_members_read_own ON trip_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.trip_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_members TO service_role;

-- ─── entry_attempts ───────────────────────────────────────────
--
-- The retry limit on a PIN typed into /api/entry: wrong PINs counted per
-- network address and per event, in a window (lib/membership.ts,
-- ATTEMPT_LIMITS). `key` is a hash — the address itself is never stored —
-- and the nightly cleanup deletes rows a day old. Server only.

CREATE TABLE IF NOT EXISTS entry_attempts (
  key            text        PRIMARY KEY,
  trip_id        uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  failures       integer     NOT NULL DEFAULT 0,
  window_started timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entry_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_attempts TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Run this on its own afterwards. Every column should read true.
--
--   SELECT
--     to_regclass('public.trip_members')   IS NOT NULL AS trip_members,
--     to_regclass('public.entry_attempts') IS NOT NULL AS entry_attempts,
--     has_table_privilege('authenticated', 'public.match_scores',         'INSERT') AS match_scores,
--     has_table_privilege('authenticated', 'public.match_concessions',    'INSERT') AS match_concessions,
--     has_table_privilege('authenticated', 'public.session_matches',      'UPDATE') AS session_matches,
--     has_table_privilege('authenticated', 'public.session_match_scores', 'INSERT') AS session_match_scores,
--     has_table_privilege('service_role',  'public.trip_members',         'INSERT') AS server_writes_members,
--     NOT has_table_privilege('anon',      'public.trip_members',         'SELECT') AS members_closed_to_anon;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Only together with turning anonymous sign-ins OFF in the dashboard (or
-- rolling the deploy back): revoking the grants while phones are signed in
-- is exactly the "permission denied" on every match card this file exists
-- to prevent. Dropping trip_members loses nothing a score depends on.
--
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON public.match_scores         FROM authenticated;
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON public.match_concessions    FROM authenticated;
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON public.session_matches      FROM authenticated;
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON public.session_match_scores FROM authenticated;
--   DROP TABLE IF EXISTS entry_attempts;
--   DROP TABLE IF EXISTS trip_members;
