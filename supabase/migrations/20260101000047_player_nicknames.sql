-- Migration 047 — a player's leaderboard nickname.
--
-- Chosen by the player themselves, from the preferences gear on the hub —
-- never by whoever is arranging teams, which is where renaming used to
-- live and why it renamed the *real* name. The stored name never changes;
-- the nickname is what the leaderboard's tight columns print instead.
-- Without one the board says the first name and the start of the last
-- ("Ross O"), growing on ties — lib/displayNames.ts is the only copy of
-- that rule.
--
-- The app folds and caps at 12 (MAX_NICKNAME); the CHECK is the backstop
-- against anything that skips the app. Reads and writes both fail soft, so
-- the code can deploy before this runs. Run it once, by hand, in the
-- Supabase SQL editor.

ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_nickname_check;
ALTER TABLE players ADD CONSTRAINT players_nickname_check
  CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 1 AND 24);

COMMENT ON COLUMN players.nickname IS
  'Leaderboard display name, chosen by the player. NULL = default first name + surname prefix.';
