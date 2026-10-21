-- Migration 060 — the public PIN.
--
-- An event may carry two PINs (docs/event-use-cases.md, story 2, stage 5):
-- the admin PIN it has always had (`settings_passcode_hash`) for the
-- organiser area, destructive actions and overriding a result, and now an
-- optional public PIN for getting into the event at all. lib/publicPin.ts
-- holds the rules; the trip layout sends a phone that has not entered it
-- to /enter/[code] first. Null — every event until its organiser sets one
-- — means open to anybody with the code, exactly as before.
--
-- Hashed on the organiser's device, like the admin PIN: the server has
-- never known either. A soft lock, like the admin PIN (lib/passcode.ts).
--
-- A column on an existing table, so no new grants. Safe to re-paste. Run
-- once, by hand, in the Supabase SQL editor.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS public_passcode_hash text;

COMMENT ON COLUMN trips.public_passcode_hash IS
  'SHA-256 of the public PIN — entry to the event''s pages (lib/publicPin.ts). Null = open to anybody with the code.';

-- ── Did it land? ──────────────────────────────────────────
-- One row back, found = 1.
select 'trips.public_passcode_hash' as what, count(*) as found from information_schema.columns
  where table_name = 'trips' and column_name = 'public_passcode_hash';
