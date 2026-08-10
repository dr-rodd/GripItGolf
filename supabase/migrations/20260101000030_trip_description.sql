-- ============================================================
-- Trip description
--
-- A few lines from the lead player about what the trip is — set at
-- creation or later in Trip Settings, shown on the hub under the
-- countdown. Plain text, optional, null when nobody wrote one.
-- ============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS description TEXT;
