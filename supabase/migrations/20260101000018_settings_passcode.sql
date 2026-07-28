-- ============================================================
-- GripItGolf: Optional settings passcode
--
-- A trip may be locked so only someone with a passcode can open its
-- settings. Set once, at creation — deliberately not editable later,
-- because until auth exists anyone holding the trip code could
-- otherwise lock a trip they do not run.
--
-- Stores a SHA-256 hex digest, never the code itself. This is a soft
-- lock, not a security control: the anon key is public and a short
-- numeric code is trivially brute-forced from a readable hash. It stops
-- a player wandering into settings; it does not stop anyone determined.
-- See lib/passcode.ts.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS settings_passcode_hash TEXT;

ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS ck_trips_passcode_hash;

-- Either unset, or a full SHA-256 hex digest — nothing half-written,
-- and nothing that could be a passcode stored in the clear.
ALTER TABLE trips
  ADD CONSTRAINT ck_trips_passcode_hash CHECK (
    settings_passcode_hash IS NULL
    OR settings_passcode_hash ~ '^[0-9a-f]{64}$'
  );
