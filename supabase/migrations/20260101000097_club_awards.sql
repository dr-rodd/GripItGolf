-- 097 — Golfer of the Year (Ross, 17 Nov 2026; D264–D271, P14): a club's
-- season-long awards, kept by the Clubhouse. lib/clubAward.ts is the only
-- copy of the rules; the standing is NEVER stored — it is worked out on every
-- read from the club's certified Results and its match play draws, so a
-- weight changed re-tells the table at once and a reopened competition drops
-- out until it is certified again.
--
-- PASTE AFTER THE DEPLOY (or before — the code reads it fail-soft: before it
-- the Clubhouse's Golfer of the Year says "not set up yet" and members see
-- no award).
--
-- (1) club_awards — one award a row: the club, the year, its name (the
--     men's, the ladies', the seniors'…), and its rules as one jsonb — points
--     by finish, match play by stage reached, which kinds of competition
--     count, each competition's weight by its code, best N, and who appears
--     (the competitions' own entry rules). Server only.

-- (1)
CREATE TABLE IF NOT EXISTS club_awards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  year        smallint    NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  rules       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_club_awards_club_year ON club_awards(club_id, year);
ALTER TABLE club_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_awards FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_awards TO service_role;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- Both columns true:
--
--   SELECT
--     to_regclass('public.club_awards') IS NOT NULL                            AS awards,
--     NOT has_table_privilege('authenticated', 'public.club_awards', 'SELECT') AS awards_closed;

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Takes every award's rules with it; no result is touched — the standing
-- was never stored.
--
--   DROP TABLE IF EXISTS club_awards;
