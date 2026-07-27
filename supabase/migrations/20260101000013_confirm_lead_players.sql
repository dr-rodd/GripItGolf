-- ============================================================
-- GripItGolf: Lead players count as confirmed
--
-- The trip hub now shows each player as Confirmed (they have claimed
-- their own slot) or Pending (the organiser named them and they have
-- not joined yet).
--
-- Trip creators entered themselves as the lead player, so they are
-- confirmed by definition. Trips created before the hub made this
-- distinction have claimed = false on every row, which would show the
-- organiser as pending on their own trip.
-- ============================================================

UPDATE players
SET claimed = true
WHERE is_lead = true
  AND (claimed IS NULL OR claimed = false);
