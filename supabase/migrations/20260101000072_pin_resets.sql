-- 072 — Forgot PIN (D67; Ross, 11 Nov 2026).
--
-- PASTE THIS BEFORE OR AFTER THE DEPLOY — either order is safe. Before it,
-- "Email me a link" answers "Couldn't send just now" and nothing else
-- changes; after it, the link works.
--
-- One row per reset link emailed to an event's address. Only the token's
-- hash is kept (the token itself is only ever in the email), with the event,
-- when the link stops working (30 minutes), and when it was used — once.
-- The rows also count the links sent, for the limit of three per event an
-- hour. The nightly cleanup deletes them after a day.
--
-- Server only: RLS on, no policy, no phone grant. Writer and reader:
-- app/api/event/pinReset.ts, on the service role.

CREATE TABLE IF NOT EXISTS pin_resets (
  token_hash text        PRIMARY KEY,
  trip_id    uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_pin_resets_trip_created ON pin_resets(trip_id, created_at);

ALTER TABLE pin_resets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_resets TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Run as one block. One row, rowsecurity true:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'pin_resets';
--
-- And no phone can reach it (false, false):
--
-- SELECT has_table_privilege('authenticated', 'public.pin_resets', 'SELECT') AS phones_read,
--        has_table_privilege('anon',          'public.pin_resets', 'SELECT') AS strangers_read;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time; only unused or spent reset links are lost.
--
-- DROP TABLE IF EXISTS pin_resets;
