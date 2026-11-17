-- 094 — memberships, a person's gender and date of birth, and who may enter
-- a competition (stage (m); Ross, 17 Nov 2026). lib/clubMembership.ts is
-- the only copy of the rules.
--
-- PASTE THIS AFTER THE DEPLOY. The code reads every part fail-soft: before
-- it, nobody has a gender, a date of birth or a category, a club has no
-- memberships, its ages count on 1 January, and no competition restricts
-- who enters — everybody books exactly as today.
--
-- (1) club_categories — a club's memberships: a name, a short code for its
--     spreadsheets (unique in the club), and the days of the week it plays
--     (0 Monday … 6 Sunday). Server only.
-- (2) club_members.category_id — a row's membership, at most one; none
--     plays any day. club_members.gender and birth_date — the person's,
--     copied from their account onto every list row of theirs (one value
--     everywhere, set by a club); a row nobody has linked holds its own.
-- (3) account_details — a Green Dot account's gender and date of birth, one
--     value each, written only by a club through the server; the person
--     reads them on their account. Server only.
-- (4) clubs.age_date — the day each year a club counts ages on, 'MM-DD';
--     null is 1 January.
-- (5) trip_private.entry_rules — a competition's entry rules (genders,
--     categories, an age band). Server only, as trip_private is.

-- (1)
CREATE TABLE IF NOT EXISTS club_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  code        text        NOT NULL CHECK (code ~ '^[A-Z0-9]{1,12}$'),
  days        smallint[]  NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_categories_code ON club_categories(club_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_club_categories_name ON club_categories(club_id, lower(name));
ALTER TABLE club_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_categories FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_categories TO service_role;

-- (3), made before (2)'s columns so its grants read on their own
CREATE TABLE IF NOT EXISTS account_details (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gender      text        NULL CHECK (gender IN ('M', 'F')),
  birth_date  date        NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_details FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_details TO service_role;

-- (2)
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES club_categories(id) ON DELETE SET NULL;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS gender text NULL CHECK (gender IN ('M', 'F'));
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS birth_date date NULL;
CREATE INDEX IF NOT EXISTS idx_club_members_category ON club_members(category_id) WHERE category_id IS NOT NULL;

-- (4)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS age_date text NULL CHECK (age_date ~ '^[0-1][0-9]-[0-3][0-9]$');

-- (5)
ALTER TABLE trip_private ADD COLUMN IF NOT EXISTS entry_rules jsonb NULL;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.club_categories') IS NOT NULL                                                                 AS categories,
--     to_regclass('public.account_details') IS NOT NULL                                                                 AS account_details,
--     NOT has_table_privilege('authenticated', 'public.club_categories', 'SELECT')                                      AS categories_closed,
--     NOT has_table_privilege('authenticated', 'public.account_details', 'SELECT')                                      AS details_closed,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'category_id') AS row_category,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'gender')      AS row_gender,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'birth_date')  AS row_birth,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'age_date')           AS age_date,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trip_private' AND column_name = 'entry_rules') AS entry_rules;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Back to exactly 093: every competition open to everybody again, every
-- membership, gender and date of birth gone. Run all of it.
--
--   ALTER TABLE trip_private DROP COLUMN IF EXISTS entry_rules;
--   ALTER TABLE clubs DROP COLUMN IF EXISTS age_date;
--   DROP INDEX IF EXISTS idx_club_members_category;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS birth_date;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS gender;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS category_id;
--   DROP TABLE IF EXISTS account_details;
--   DROP TABLE IF EXISTS club_categories;
