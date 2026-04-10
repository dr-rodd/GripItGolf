-- Allow multiple concurrent active scorecards per course.
-- Previously only one active live_round per course was permitted.
DROP INDEX IF EXISTS uq_live_rounds_active_course;

-- Allow 'finalised' as a live_round status (required for the above to be useful).
-- 'finalised' = group completed 18 holes and committed scores via in-app prompt.
-- 'closed'    = admin void / cleanup.
ALTER TABLE live_rounds DROP CONSTRAINT IF EXISTS live_rounds_status_check;

ALTER TABLE live_rounds
  ADD CONSTRAINT live_rounds_status_check
  CHECK (status IN ('active', 'closed', 'finalised'));
