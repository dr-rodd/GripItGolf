-- 084 — Green Dot members sign in (stage (a2), D128–D133; Ross, 14 Nov 2026).
--
-- PASTE THIS BEFORE THE DEPLOY. It only adds; nothing reads it until the
-- account page asks, and the account page is unlinked (ACCOUNTS_LINKED in
-- lib/account.ts). Nobody ever needs an account to join, play, score or
-- watch (D94), and nothing here is read on the way to any of those.
--
-- Three things, every one closed to phones (RLS on, no policy, REVOKE ALL
-- from anon and authenticated — this project still auto-grants new public
-- tables, which is why the REVOKE is needed as well as RLS; see 080):
--
-- (1) account_usernames — one username per account (D130): 3–20 of a–z,
--     0–9, dot and underscore, stored lower case, unique, no @, no dot at
--     either end. The reserved list is the app's (lib/account.ts), not here.
--     Read and written only by /api/account on the service role; a
--     username's email is looked up there and never sent to a browser.
-- (2) account_attempts — wrong sign-ins and username checks counted
--     (lib/account.ts SIGN_IN_LIMITS), the address and name only ever
--     hashed, cleared nightly by /api/cleanup. entry_attempts cannot be
--     shared: every row there belongs to an event.
-- (3) account_has_password(uuid) — whether an account has a password, so
--     the page knows to ask for one (D129). Supabase never says so to the
--     app; this reads auth.users for the server alone.

-- ─── (1) Usernames ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_usernames (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   text        NOT NULL
             CHECK (username ~ '^[a-z0-9._]{3,20}$' AND left(username, 1) <> '.' AND right(username, 1) <> '.'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_usernames_username ON account_usernames (lower(username));

ALTER TABLE account_usernames ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_usernames FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_usernames TO service_role;

-- ─── (2) Wrong tries ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_attempts (
  key            text        PRIMARY KEY,
  failures       integer     NOT NULL DEFAULT 0,
  window_started timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_attempts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_attempts TO service_role;

-- ─── (3) Has this account a password? ─────────────────────────

CREATE OR REPLACE FUNCTION public.account_has_password(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT u.encrypted_password IS NOT NULL AND u.encrypted_password <> ''
                   FROM auth.users u WHERE u.id = uid), false)
$$;

REVOKE ALL ON FUNCTION public.account_has_password(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_password(uuid) TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Every column true:
--
--   SELECT
--     to_regclass('public.account_usernames') IS NOT NULL AS usernames,
--     to_regclass('public.account_attempts')  IS NOT NULL AS attempts,
--     NOT has_table_privilege('authenticated', 'public.account_usernames', 'SELECT') AS usernames_closed_to_phones,
--     NOT has_table_privilege('anon',          'public.account_usernames', 'SELECT') AS usernames_closed_to_anon,
--     NOT has_table_privilege('authenticated', 'public.account_attempts',  'SELECT') AS attempts_closed_to_phones,
--     has_table_privilege('service_role',      'public.account_usernames', 'INSERT') AS server_writes,
--     NOT has_function_privilege('authenticated', 'public.account_has_password(uuid)', 'EXECUTE') AS check_closed_to_phones,
--     has_function_privilege('service_role',      'public.account_has_password(uuid)', 'EXECUTE') AS server_checks;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time: the account page then says it is signed in by email and
-- asks nothing more; signing in by password stops. Nothing an event needs is
-- here.
--
--   DROP FUNCTION IF EXISTS public.account_has_password(uuid);
--   DROP TABLE IF EXISTS account_attempts;
--   DROP TABLE IF EXISTS account_usernames;
