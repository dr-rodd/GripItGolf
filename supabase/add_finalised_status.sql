-- Allow 'finalised' as a live_round status.
-- 'finalised' means the group completed all 18 holes and committed their scores
-- via the in-app prompt. 'closed' is still used for admin voids/cleanup.

ALTER TABLE live_rounds DROP CONSTRAINT IF EXISTS live_rounds_status_check;

ALTER TABLE live_rounds
  ADD CONSTRAINT live_rounds_status_check
  CHECK (status IN ('active', 'closed', 'finalised'));
