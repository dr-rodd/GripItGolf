-- ============================================================
-- GripItGolf: When the confirmation email went
--
-- One email per trip, ever — sent to lead_email just after the
-- trip is created, carrying the trip link and the QR code. This
-- column is both halves of that promise at once: the send claims
-- it (UPDATE ... WHERE confirmation_sent_at IS NULL) before
-- talking to Resend, so a second call finds it taken, and a
-- failed send hands it back so the column only ever says what
-- actually happened.
--
-- Nullable with no default: NULL means no email has gone —
-- because none was asked for, because the key is not set, or
-- because a send failed. The app treats all three the same.
--
-- Standalone on purpose — nothing here reads or writes any other
-- column, so this file can be run on its own without replaying
-- the earlier migrations.
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN trips.confirmation_sent_at IS
  'When the one confirmation email was sent to lead_email. NULL = never sent (not asked for, key unset, or the send failed).';
