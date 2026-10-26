-- Migration 063 — a player's own colour.
--
-- On an event without sides (tags), a player picks a colour for themselves
-- on the Settings tab (Ross, 26 Oct 2026): the dot beside their name on the
-- leaderboard and the scorecard, and their side of a match play card and
-- the bracket. One of the team palette's twelve (lib/teamColors.ts); empty
-- is no pick. Once the event has a side, the side's colour wins and the
-- pick is set aside, not deleted (lib/playerColours.ts).
--
-- A column on an existing table, so no new grants. Every read asks for it
-- in a query of its own and fails soft: until this runs, the picker says it
-- could not save and every screen is as it was. Safe to re-paste. Run once,
-- by hand, in the Supabase SQL editor.

ALTER TABLE players ADD COLUMN IF NOT EXISTS colour text;

DO $$ BEGIN
  ALTER TABLE players ADD CONSTRAINT players_colour_hex
    CHECK (colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN players.colour IS
  'The player''s own colour on an event without sides, as #RRGGBB; empty is none (lib/playerColours.ts).';

-- ── Did it land? ──────────────────────────────────────────
-- One row back.
select 'players.colour' as what, data_type from information_schema.columns
  where table_name = 'players' and column_name = 'colour';
