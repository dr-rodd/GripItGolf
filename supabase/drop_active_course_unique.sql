-- Allow multiple concurrent active scorecards per course.
-- Previously only one active live_round per course was permitted.
DROP INDEX IF EXISTS uq_live_rounds_active_course;
