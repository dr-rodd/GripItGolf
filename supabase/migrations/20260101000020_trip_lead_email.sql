-- ============================================================
-- GripItGolf: Lead player email
--
-- Optional, and deliberately so. A trip is created without an
-- account and without an email; this is only somewhere to put an
-- address if the organiser volunteers one, so the trip can be
-- confirmed and followed up.
--
-- Nullable with no default: "not given" and "given as empty" are
-- the same thing, and both are NULL. The app normalises before
-- writing (lib/email.ts) so a blank or malformed value never
-- reaches this column.
--
-- Standalone on purpose — nothing here reads or writes any other
-- column, so this file can be run on its own without replaying
-- the earlier migrations.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS lead_email TEXT;

-- Cheap guard against something obviously wrong being written by
-- hand later. Not a validity check — no regex is — just a shape.
ALTER TABLE trips DROP CONSTRAINT IF EXISTS ck_trips_lead_email;

ALTER TABLE trips
  ADD CONSTRAINT ck_trips_lead_email CHECK (
    lead_email IS NULL
    OR (lead_email LIKE '%_@_%.__%' AND lead_email NOT LIKE '% %'
        AND char_length(lead_email) BETWEEN 6 AND 254)
  );

-- The admin overview lists trips newest first
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON trips(created_at DESC);

COMMENT ON COLUMN trips.lead_email IS
  'Optional contact address for whoever created the trip. Never required, never shown to other players.';
