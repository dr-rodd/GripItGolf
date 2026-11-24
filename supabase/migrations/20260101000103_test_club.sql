-- 103 — the test club (D308–D317, Ross, 24 Nov 2026): Pints Golf Club becomes
-- a club whose season is played by fictional characters alongside Ross and a
-- few real friends. lib/testClub.ts is the only copy of the rules;
-- /admin/test-club is the page.
--
-- PASTE AFTER THE DEPLOY. The code reads every part fail-soft: before it the
-- Test club page says "not set up yet", no club is a test club, and nothing
-- else on the site changes. The email guard (lib/emailGuard.ts) needs none of
-- this — it reads the address.
--
-- (1) clubs.is_test — a test club: it can be wiped and reseeded from /admin,
--     and its events feed no platform-wide figure (D316). Pints is switched
--     on here. clubs is closed to phones already (086), so no grant.
-- (2) test_accounts — the fictional accounts and which character each plays.
--     Deleted with the account. Server only.
-- (3) test_club_keep — the keep-list: accounts a wipe never touches, nor
--     their own rows of the club's list (D311). Server only.
-- (4) test_week_loads — a week file's progress, one row a step done, so
--     loading a week twice changes nothing (D312). Server only.

-- (1)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
UPDATE clubs SET is_test = true WHERE slug = 'pints-golf-club';

-- (2)
CREATE TABLE IF NOT EXISTS test_accounts (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id       uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  character_key text        NOT NULL CHECK (character_key ~ '^[a-z0-9-]{1,40}$'),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_accounts_character ON test_accounts(club_id, character_key);
ALTER TABLE test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_accounts TO service_role;

-- (3)
CREATE TABLE IF NOT EXISTS test_club_keep (
  club_id   uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);
ALTER TABLE test_club_keep ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_club_keep FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_club_keep TO service_role;

-- (4)
CREATE TABLE IF NOT EXISTS test_week_loads (
  club_id  uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  week     text        NOT NULL CHECK (week ~ '^\d{4}-\d{2}-\d{2}$'),
  step     text        NOT NULL CHECK (char_length(step) BETWEEN 1 AND 120),
  detail   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  done_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, week, step)
);
ALTER TABLE test_week_loads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_week_loads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_week_loads TO service_role;

-- Did it land?
--   SELECT
--     (SELECT is_test FROM clubs WHERE slug = 'pints-golf-club') AS pints_is_test,
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'test_accounts')   AS accounts,
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'test_club_keep')  AS keep,
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'test_week_loads') AS weeks;

-- UNDO (nothing is a test club again; the fictional accounts themselves stay
-- until deleted — list them first with SELECT user_id FROM test_accounts;):
--   DROP TABLE IF EXISTS test_week_loads;
--   DROP TABLE IF EXISTS test_club_keep;
--   DROP TABLE IF EXISTS test_accounts;
--   ALTER TABLE clubs DROP COLUMN IF EXISTS is_test;
