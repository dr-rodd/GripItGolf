-- 095 — a club's calendar: its non-golf events, its event presets, what it
-- shows its members, what each member asks to see, and the Ref a calendar
-- import matches a competition on (Clubhouse stages c1–c2; Ross, 17 Nov
-- 2026). lib/clubEvents.ts, lib/clubPresets.ts and lib/calendarImport.ts are
-- the only copies of the rules.
--
-- PASTE THIS AFTER THE DEPLOY. The code reads every part fail-soft: before
-- it a club has no events but its competitions and other golf events, no
-- presets, shows its members everything, every member sees everything, and
-- New event, Presets and Import a calendar say "not set up yet".
--
-- (1) club_events — an event under the club that is not golf members book:
--     Golf (interclubs, societies — on the calendar, not booked here),
--     Social, Club business, Other sport, Course (closures, maintenance),
--     Miscellaneous. Members or Office only — and Office only never for
--     Golf or Course (Ross: anything that affects the tee sheets is the
--     members'). Ref is the calendar file's, unique in the club. Server only.
-- (2) club_presets — named templates a competition starts from: a short
--     code unique in the club, what it is used for, format, allowance,
--     entry rules, the tee plan (up to four runs, sunrise and sunset
--     allowed) and when booking opens. At most one the club's default.
--     Server only.
-- (3) clubs.hidden_event_types — the types the club does not show its
--     members (null: every type). Competitions, Golf and Course are always
--     shown; the code refuses to hide them.
-- (4) account_event_prefs — the types a member has asked not to see on the
--     club home and Upcoming. Server only.
-- (5) trip_private.import_ref — a competition's Ref from the calendar file
--     it came in on, unique in the club.

-- (1)
CREATE TABLE IF NOT EXISTS club_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  ref           text        NULL CHECK (ref IS NULL OR char_length(ref) BETWEEN 1 AND 40),
  title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  type          text        NOT NULL CHECK (type IN ('GOLF', 'SOCIAL', 'BUSINESS', 'SPORT', 'COURSE', 'MISC')),
  starts_on     date        NOT NULL,
  ends_on       date        NULL CHECK (ends_on IS NULL OR ends_on >= starts_on),
  start_time    text        NULL CHECK (start_time IS NULL OR start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time      text        NULL CHECK (end_time IS NULL OR end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  place         text        NULL CHECK (place IS NULL OR char_length(place) <= 80),
  notes         text        NULL CHECK (notes IS NULL OR char_length(notes) <= 1000),
  visibility    text        NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'office')),
  import_batch  uuid        NULL,
  created_by    uuid        NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_club_events_office CHECK (visibility = 'members' OR type IN ('SOCIAL', 'BUSINESS', 'SPORT', 'MISC'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_events_ref ON club_events(club_id, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_club_events_day ON club_events(club_id, starts_on);
ALTER TABLE club_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_events TO service_role;

-- (2)
CREATE TABLE IF NOT EXISTS club_presets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  code         text        NOT NULL CHECK (code ~ '^[A-Z0-9]{1,12}$'),
  name         text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  used_for     text        NULL CHECK (used_for IS NULL OR char_length(used_for) <= 120),
  scoring      text        NOT NULL DEFAULT 'stableford' CHECK (scoring IN ('stableford', 'strokes')),
  allowance    integer     NOT NULL DEFAULT 95 CHECK (allowance BETWEEN 50 AND 100),
  entry_rules  jsonb       NULL,
  tee_plan     jsonb       NOT NULL,
  is_default   boolean     NOT NULL DEFAULT false,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_presets_code ON club_presets(club_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_presets_default ON club_presets(club_id) WHERE is_default;
ALTER TABLE club_presets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_presets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_presets TO service_role;

-- (4), made before (3)'s column so its grants read on their own
CREATE TABLE IF NOT EXISTS account_event_prefs (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden_types  text[]      NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_event_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_event_prefs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_event_prefs TO service_role;

-- (3)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS hidden_event_types text[] NULL;

-- (5)
ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS import_ref text NULL CHECK (import_ref IS NULL OR char_length(import_ref) BETWEEN 1 AND 40);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trip_private_import_ref ON trip_private(club_id, import_ref) WHERE import_ref IS NOT NULL AND club_id IS NOT NULL;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.club_events') IS NOT NULL                                                                      AS events,
--     to_regclass('public.club_presets') IS NOT NULL                                                                     AS presets,
--     to_regclass('public.account_event_prefs') IS NOT NULL                                                              AS prefs,
--     NOT has_table_privilege('authenticated', 'public.club_events', 'SELECT')                                           AS events_closed,
--     NOT has_table_privilege('authenticated', 'public.club_presets', 'SELECT')                                          AS presets_closed,
--     NOT has_table_privilege('authenticated', 'public.account_event_prefs', 'SELECT')                                   AS prefs_closed,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'hidden_event_types') AS hidden_types,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'import_ref')   AS import_ref;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Takes the club's own events, presets and every member's choices with it.
--
--   DROP INDEX IF EXISTS uq_trip_private_import_ref;
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS import_ref;
--   ALTER TABLE clubs DROP COLUMN IF EXISTS hidden_event_types;
--   DROP TABLE IF EXISTS account_event_prefs;
--   DROP TABLE IF EXISTS club_presets;
--   DROP TABLE IF EXISTS club_events;
