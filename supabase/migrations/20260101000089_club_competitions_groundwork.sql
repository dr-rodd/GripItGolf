-- 089 — club competitions, the groundwork (stage (d1); D161, D163, D179;
-- Ross, 16 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY. Nothing changes by pasting it: every column
-- is empty and both tables have no rows until the code writes them, and
-- every reader treats a missing column or table as "not set". Nobody ever
-- needs an account to join, play, score or watch (D94); an event outside a
-- club is untouched.
--
-- (1) A club's home course (D161) — new competitions default to it.
-- (2) A list row's own handicap index, for a row no account is linked to
--     yet (D179). Once linked, the account's value is the one value.
-- (3) A player made by booking a club competition points at its list row
--     (D163) — the player row and its tee time are the entry. One player per
--     list row per event.
-- (4) An event is a club competition (`trips.competition = 'club'`), or not
--     (null — every event today). Phones read it; only the server writes
--     it. 071 granted the trips columns that existed then by name, so this
--     one is granted by name too.
-- (5) The handicap index on the Green Dot account (D179): one value an
--     account, server only.
-- (6) Every change to an index logged: whose, old, new, when, by whom, from
--     where — server only.

-- (1)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS home_course_id uuid NULL REFERENCES courses(id) ON DELETE SET NULL;

-- (2)
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS handicap_index numeric(3,1) NULL
  CHECK (handicap_index IS NULL OR handicap_index BETWEEN -10 AND 54);

-- (3)
ALTER TABLE players ADD COLUMN IF NOT EXISTS club_member_id uuid NULL REFERENCES club_members(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_players_club_member ON players(trip_id, club_member_id) WHERE club_member_id IS NOT NULL;

-- (4)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS competition text NULL CHECK (competition IS NULL OR competition = 'club');
GRANT SELECT (competition) ON public.trips TO authenticated;

-- (5)
CREATE TABLE IF NOT EXISTS account_handicaps (
  user_id        uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handicap_index numeric(3,1) NOT NULL CHECK (handicap_index BETWEEN -10 AND 54),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_handicaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_handicaps FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_handicaps TO service_role;

-- (6)
CREATE TABLE IF NOT EXISTS handicap_changes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_member_id uuid        NULL REFERENCES club_members(id) ON DELETE CASCADE,
  old_index      numeric(3,1) NULL,
  new_index      numeric(3,1) NULL,
  changed_by     uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source         text        NOT NULL CHECK (source IN ('me', 'list', 'start_sheet', 'link', 'unlink')),
  round_id       uuid        NULL REFERENCES rounds(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR club_member_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_handicap_changes_user   ON handicap_changes(user_id, changed_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_handicap_changes_member ON handicap_changes(club_member_id, changed_at) WHERE club_member_id IS NOT NULL;
ALTER TABLE handicap_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.handicap_changes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handicap_changes TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clubs' AND column_name = 'home_course_id')        AS home_course,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'club_members' AND column_name = 'handicap_index') AS row_index,
--     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'club_member_id')       AS player_row,
--     has_column_privilege('authenticated', 'public.trips', 'competition', 'SELECT')                                          AS competition_readable,
--     NOT has_table_privilege('authenticated', 'public.account_handicaps', 'SELECT')                                          AS handicaps_closed,
--     NOT has_table_privilege('authenticated', 'public.handicap_changes', 'SELECT')                                           AS log_closed,
--     (SELECT relrowsecurity FROM pg_class WHERE relname = 'account_handicaps')                                               AS handicaps_rls,
--     (SELECT relrowsecurity FROM pg_class WHERE relname = 'handicap_changes')                                                AS log_rls;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Takes every index typed since with it (the log too); nothing else is
-- touched. A competition's player keeps its row, losing only the pointer:
--
--   DROP TABLE IF EXISTS handicap_changes;
--   DROP TABLE IF EXISTS account_handicaps;
--   REVOKE SELECT (competition) ON public.trips FROM authenticated;
--   ALTER TABLE trips DROP COLUMN IF EXISTS competition;
--   DROP INDEX IF EXISTS uq_players_club_member;
--   ALTER TABLE players DROP COLUMN IF EXISTS club_member_id;
--   ALTER TABLE club_members DROP COLUMN IF EXISTS handicap_index;
--   ALTER TABLE clubs DROP COLUMN IF EXISTS home_course_id;
