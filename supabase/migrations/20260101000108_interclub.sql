-- 108 — Interclub, stages 2 and 3 (D358–D362; Ross, 27 Nov 2026;
-- docs/interclub.md). A team captain sets up a match from the national draw
-- as an event — the two clubs its two tags, one Matches session, scored by
-- anybody with the link — fills their club's side, and settles it where the
-- cards cannot. lib/interclubTie.ts is the only copy of the rules,
-- app/api/interclub/ the only reader and writer. Server only.
--
-- PASTE AFTER THE DEPLOY. Before it nobody is a team captain (the tick says
-- "not set up yet"), a club's name in the draws is its own name, and the
-- draw pages offer no Set up; everything else is as it was.
--
-- (1) club_members.team_captain — the credential (D358), its own tick.
-- (2) clubs.interclub_name — how the draws spell the club, where they
--     spell it differently ("Co. Sligo"). Null is the club's own name.
-- (3) interclub_ties — a match on the draw and the event it is played as:
--     its two clubs (each null until a captain of that club takes the side),
--     the two tags, and what the captains settled (D361) or played off (D360).

-- (1)
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS team_captain boolean NOT NULL DEFAULT false;

-- (2)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS interclub_name text
  CHECK (interclub_name IS NULL OR char_length(interclub_name) BETWEEN 1 AND 80);

-- (3)
CREATE TABLE IF NOT EXISTS interclub_ties (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The competition's Golf Genius site, and the match's place in its draw.
  competition_id   text        NOT NULL CHECK (competition_id ~ '^[0-9]{6,24}$'),
  province         text        NOT NULL CHECK (province IN ('connacht', 'leinster', 'munster', 'ulster')),
  competition_slug text        NOT NULL CHECK (char_length(competition_slug) BETWEEN 1 AND 120),
  competition_name text        NOT NULL CHECK (char_length(competition_name) BETWEEN 1 AND 160),
  draw_round       smallint    NOT NULL CHECK (draw_round BETWEEN 0 AND 8),
  draw_slot        smallint    NOT NULL CHECK (draw_slot BETWEEN 0 AND 255),
  trip_id          uuid        NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  round_id         uuid        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  -- The two sides as the draw names them, and each one's Green Dot club once
  -- a captain of it has the side.
  name_a           text        NOT NULL CHECK (char_length(name_a) BETWEEN 1 AND 80),
  name_b           text        NOT NULL CHECK (char_length(name_b) BETWEEN 1 AND 80),
  club_a           uuid        NULL REFERENCES clubs(id) ON DELETE SET NULL,
  club_b           uuid        NULL REFERENCES clubs(id) ON DELETE SET NULL,
  tag_a            uuid        NOT NULL,
  tag_b            uuid        NOT NULL,
  -- What the competition plays (lib/interclubTie.ts `TieFormat`).
  format           jsonb       NOT NULL,
  -- D361: a captain's result over the cards. D360: the playoff's round.
  settled          jsonb       NULL,
  playoff_round_id uuid        NULL REFERENCES rounds(id) ON DELETE SET NULL,
  created_by       uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, draw_round, draw_slot)
);
CREATE INDEX IF NOT EXISTS idx_interclub_ties_competition ON interclub_ties(competition_id);
CREATE INDEX IF NOT EXISTS idx_interclub_ties_club_a ON interclub_ties(club_a);
CREATE INDEX IF NOT EXISTS idx_interclub_ties_club_b ON interclub_ties(club_b);
ALTER TABLE interclub_ties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interclub_ties FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interclub_ties TO service_role;

-- ─── Did it land? ──────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE (table_name = 'club_members' AND column_name = 'team_captain')
--      OR (table_name = 'clubs' AND column_name = 'interclub_name');   -- two rows
-- SELECT count(*) FROM interclub_ties;                                -- 0, no error

-- ─── Undo ──────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS interclub_ties;
-- ALTER TABLE clubs DROP COLUMN IF EXISTS interclub_name;
-- ALTER TABLE club_members DROP COLUMN IF EXISTS team_captain;
