-- ============================================================
-- 076 — an organiser PIN may be stored the new way (D64, D67)
-- ============================================================
--
-- Migration 018 allowed `trips.settings_passcode_hash` to be null or a
-- 64-character SHA-256 hex digest, nothing else. From stage 4 a PIN is
-- stored salted and slow (`s1$salt$key$fp`, lib/pinHash.ts), which that
-- check refuses — so every save of a new PIN (Forgot PIN's among them)
-- failed at "store-pin". This lets the column hold either: the old digest
-- (still opens, and is re-stored the first time it is typed right) or the
-- new form. Nothing else about the column changes; no grants needed.

ALTER TABLE trips DROP CONSTRAINT IF EXISTS ck_trips_passcode_hash;
ALTER TABLE trips ADD CONSTRAINT ck_trips_passcode_hash CHECK (
  settings_passcode_hash IS NULL
  OR settings_passcode_hash ~ '^[0-9a-f]{64}$'
  OR settings_passcode_hash ~ '^s1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
);

-- ─── Did it land? ─────────────────────────────────────────────
--
-- One row, mentioning s1:
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_trips_passcode_hash';

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Only while no PIN is stored the new way (the old check would refuse them):
--
-- ALTER TABLE trips DROP CONSTRAINT IF EXISTS ck_trips_passcode_hash;
-- ALTER TABLE trips ADD CONSTRAINT ck_trips_passcode_hash CHECK (
--   settings_passcode_hash IS NULL OR settings_passcode_hash ~ '^[0-9a-f]{64}$');
