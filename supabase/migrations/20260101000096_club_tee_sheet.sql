-- 096 — a club's casual tee sheet (Ross, 17 Nov 2026): casual golf booked by
-- the club's members on the members app and kept by the Clubhouse, on the
-- club's home course. lib/clubTeeSheet.ts is the only copy of the rules.
--
-- PASTE 095 FIRST, THEN THIS, AFTER THE DEPLOY. (4) changes 095's
-- club_events. The code reads every part fail-soft: before it the Tee times
-- tab and the Clubhouse's Tee sheet say "not set up yet", every membership
-- books, and no event takes the sheet.
--
-- (1) club_tee_bookings — one place on one casual tee time: a member on the
--     list or a guest by name, who booked it (a list row; null when the
--     Clubhouse's Green Dot staff did), and the seat it holds. One place a
--     seat, so two phones booking the last place together cannot both have
--     it; one member once a time. Server only.
-- (2) clubs.tee_settings — the sheet's minutes between times, players a
--     time, when booking opens, tee times a member a day (null: ten minutes,
--     fours, seven days before at 7 pm, one).
-- (3) club_categories.books_tee_times — whether a membership books casual
--     tee times, on its playing days. On to start with.
-- (4) club_events.blocks_tee_sheet — a Golf or Course event that takes the
--     casual tee sheet for its times (all day without) — a corporate outing,
--     a society, a course closure. Never any other type (a CHECK).

-- (1)
CREATE TABLE IF NOT EXISTS club_tee_bookings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  play_on     date        NOT NULL,
  tee_time    text        NOT NULL CHECK (tee_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  seat        smallint    NOT NULL CHECK (seat BETWEEN 1 AND 4),
  member_id   uuid        NULL REFERENCES club_members(id) ON DELETE CASCADE,
  guest_name  text        NULL CHECK (guest_name IS NULL OR char_length(guest_name) BETWEEN 1 AND 40),
  booked_by   uuid        NULL REFERENCES club_members(id) ON DELETE SET NULL,
  created_by  uuid        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_club_tee_bookings_who CHECK ((member_id IS NULL) <> (guest_name IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_tee_bookings_seat ON club_tee_bookings(club_id, play_on, tee_time, seat);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_tee_bookings_member ON club_tee_bookings(club_id, play_on, tee_time, member_id) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_club_tee_bookings_day ON club_tee_bookings(club_id, play_on);
ALTER TABLE club_tee_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_tee_bookings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_tee_bookings TO service_role;

-- (2)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tee_settings jsonb NULL;

-- (3)
ALTER TABLE club_categories ADD COLUMN IF NOT EXISTS books_tee_times boolean NOT NULL DEFAULT true;

-- (4)
ALTER TABLE club_events ADD COLUMN IF NOT EXISTS blocks_tee_sheet boolean NOT NULL DEFAULT false;
ALTER TABLE club_events DROP CONSTRAINT IF EXISTS ck_club_events_block;
ALTER TABLE club_events ADD CONSTRAINT ck_club_events_block CHECK (NOT blocks_tee_sheet OR (type IN ('GOLF', 'COURSE') AND visibility = 'members'));

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.club_tee_bookings') IS NOT NULL                                                                     AS bookings,
--     NOT has_table_privilege('authenticated', 'public.club_tee_bookings', 'SELECT')                                          AS bookings_closed,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'tee_settings')             AS settings,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_categories' AND column_name = 'books_tee_times') AS books,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_events' AND column_name = 'blocks_tee_sheet')    AS blocks;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Takes every casual booking with it.
--
--   ALTER TABLE club_events DROP CONSTRAINT IF EXISTS ck_club_events_block;
--   ALTER TABLE club_events DROP COLUMN IF EXISTS blocks_tee_sheet;
--   ALTER TABLE club_categories DROP COLUMN IF EXISTS books_tee_times;
--   ALTER TABLE clubs DROP COLUMN IF EXISTS tee_settings;
--   DROP TABLE IF EXISTS club_tee_bookings;
