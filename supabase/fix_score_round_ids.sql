-- Fix score round_ids after round-course reassignment.
-- Each score's round_id should match the round whose course_id matches
-- the course_id of the hole that was played.
UPDATE scores s
SET round_id = r.id
FROM holes h
JOIN rounds r ON r.course_id = h.course_id
WHERE s.hole_id = h.id
  AND s.round_id != r.id;
