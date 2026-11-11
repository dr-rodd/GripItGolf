-- 075 — A tee's marker colour (Ross, 11 Nov 2026).
--
-- PASTE THIS BEFORE OR AFTER THE DEPLOY — either order is safe. Before it,
-- the card check offers no colours, saves new tees without one, and every
-- tee dot falls back to its name as it always has.
--
-- Some tees are named after things the app's name-to-colour list does not
-- know. For those only — never Black, Blue, White, Red, Yellow, Sandstone,
-- Slate, Granite or Claret, which the app already colours — the card check
-- reads an approximate colour: the colour the tee is printed in on the
-- card, else what its name suggests. It is kept here, as
-- `#RRGGBB`, and drawn on the tee dot in place of the name's guess.
--
-- A swatch, never a scoring figure: nothing reads it to score. Written only
-- by the server (`/api/card-check/apply`) after the person says yes, and
-- never over a colour already stored. `tees` keeps its existing read policy
-- and grants (migration 040), which cover a new column.

ALTER TABLE tees ADD COLUMN IF NOT EXISTS colour text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tees_colour') THEN
    ALTER TABLE tees ADD CONSTRAINT ck_tees_colour CHECK (colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

-- ─── Did it land? ─────────────────────────────────────────────
--
-- One row, data_type text:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'tees' AND column_name = 'colour';

-- ─── Undo ─────────────────────────────────────────────────────
--
-- Safe at any time; the dots go back to the tee's name.
--
-- ALTER TABLE tees DROP COLUMN IF EXISTS colour;
