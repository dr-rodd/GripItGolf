-- 099 — a club's locations and the day calendar (D277, Ross, 21 Nov 2026):
-- clubs book things into places — rooms, the bar, the courses — and the
-- office's day view shows every place side by side. lib/clubLocations.ts is
-- the only copy of the rules.
--
-- PASTE AFTER THE DEPLOY. The code reads every part fail-soft: before it the
-- Locations card says "not set up yet", an event's Where is the free text it
-- always was, and the day view still draws — the club's courses are worked
-- out from its home course and its competitions, and an event with no room
-- goes in an "Elsewhere" column.
--
-- (1) club_locations — a place the club books into: a room (the bar, the
--     function room) by its name, or a course (a second course before any
--     competition uses it) by its course. The home course and any course a
--     competition uses are never stored here — they are worked out, Course 1,
--     Course 2… (a one-course club's is simply "Course"). Server only.
-- (2) club_events.location_id — the room an event is in.
--     club_events.location_course_id — the course a Golf or Course event is
--     on, null meaning Course 1 (a one-course club never chooses). At most
--     one of the two; an event in neither keeps its free-text place ("Other").

-- (1)
CREATE TABLE IF NOT EXISTS club_locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        text        NULL CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 40),
  course_id   uuid        NULL REFERENCES courses(id) ON DELETE CASCADE,
  position    smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_club_locations_kind CHECK ((name IS NULL) <> (course_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_locations_name ON club_locations(club_id, lower(name)) WHERE name IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_locations_course ON club_locations(club_id, course_id) WHERE course_id IS NOT NULL;
ALTER TABLE club_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_locations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_locations TO service_role;

-- (2)
ALTER TABLE club_events ADD COLUMN IF NOT EXISTS location_id uuid NULL REFERENCES club_locations(id) ON DELETE SET NULL;
ALTER TABLE club_events ADD COLUMN IF NOT EXISTS location_course_id uuid NULL REFERENCES courses(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE club_events ADD CONSTRAINT ck_club_events_one_location CHECK (location_id IS NULL OR location_course_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Did it land?
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name = 'club_locations') AS locations,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_events' AND column_name = 'location_id') AS event_room,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_events' AND column_name = 'location_course_id') AS event_course;

-- UNDO (events keep their free-text place; a room picked since is lost):
--   ALTER TABLE club_events DROP CONSTRAINT IF EXISTS ck_club_events_one_location;
--   ALTER TABLE club_events DROP COLUMN IF EXISTS location_course_id, DROP COLUMN IF EXISTS location_id;
--   DROP TABLE IF EXISTS club_locations;
