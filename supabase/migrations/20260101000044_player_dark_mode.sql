-- Per-player dark mode.
--
-- A claimed player's choice of theme, saved from the preferences gear on the
-- trip hub so it follows them to their other devices. Three states, and the
-- third matters: TRUE wants dark, FALSE chose light, NULL never said — a
-- NULL must not overwrite what the device's own cookie already decided.
--
-- The app tolerates this column being absent (the read and the write both
-- fail soft, and the cookie carries the preference device-locally), so the
-- code can deploy before this runs. Run it once, by hand, in the Supabase
-- SQL editor.

ALTER TABLE players ADD COLUMN IF NOT EXISTS dark_mode boolean;

COMMENT ON COLUMN players.dark_mode IS
  'Theme preference saved from the trip hub gear. NULL = never chosen.';
