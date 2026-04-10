-- Adds a timestamp column to live_rounds that is set when an admin explicitly
-- finalises a session via the course dashboard settings tab.
-- When set on any live_round for a course, CoursePortalClient treats that
-- course's session as complete regardless of whether every player has a lock.

ALTER TABLE public.live_rounds
  ADD COLUMN IF NOT EXISTS session_finalised_at TIMESTAMPTZ;
