-- ============================================================
-- GripItGolf: More than one team sheet per trip
--
-- A trip can run a team league and a pairings knockout at the
-- same time, and they are not played by the same teams: four
-- teams of three in the league, six pairings in the draw. The
-- same twelve players, arranged twice.
--
-- `players.team_id` cannot say that. It is one column, so a
-- player is in exactly one team for the whole trip, and picking
-- the pairings would tear up the league.
--
-- So membership becomes its own table, and teams are grouped
-- into sheets. A leaderboard names the sheet it is played on
-- (`teamSet` in trips.leaderboards); teams on that sheet are the
-- teams it ranks.
--
-- `players.team_id` is kept and kept in step for the main sheet.
-- The Donegal Masters archive routes read it directly and are
-- deliberately frozen, so it must not change under them.
-- ============================================================

-- ── Which sheet a team belongs to ────────────────────────────
--
-- 'main' is the sheet every existing team is on, so a trip that
-- has never heard of this migration keeps exactly the teams it
-- had.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS team_set TEXT NOT NULL DEFAULT 'main';

-- Needed as the target of the composite foreign key below. It is
-- not a real constraint on its own — id is already unique — but
-- it is what lets a membership row prove which sheet it is on
-- rather than carry an unchecked copy of the answer.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_id_team_set_key;
ALTER TABLE teams
  ADD CONSTRAINT teams_id_team_set_key UNIQUE (id, team_set);

-- ── Membership ───────────────────────────────────────────────
--
-- One row per player per team.
--
-- `team_set` is denormalised on purpose, and the composite
-- foreign key is why that is safe: the database will not accept a
-- row claiming a sheet the team is not on, and ON UPDATE CASCADE
-- keeps it true if a sheet is ever renamed. That is what makes
-- `UNIQUE (player_id, team_set)` mean what it says — one team per
-- sheet, per player — which is not expressible without it.
CREATE TABLE IF NOT EXISTS team_members (
  trip_id   UUID NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,
  team_id   UUID NOT NULL,
  team_set  TEXT NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  PRIMARY KEY (team_id, player_id),
  UNIQUE (player_id, team_set),

  FOREIGN KEY (team_id, team_set) REFERENCES teams(id, team_set)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_members_trip   ON team_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_team_members_player ON team_members(player_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team   ON team_members(team_id);

-- ── Backfill ─────────────────────────────────────────────────
--
-- Every existing team sheet becomes the 'main' sheet, so nothing
-- a trip is already playing changes. Idempotent: running this
-- file twice adds nothing the second time.
INSERT INTO team_members (trip_id, team_id, team_set, player_id)
SELECT p.trip_id, t.id, t.team_set, p.id
FROM players p
JOIN teams t ON t.id = p.team_id
WHERE p.team_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN teams.team_set IS
  'Which team sheet this team belongs to. ''main'' is the trip''s first. A leaderboard names its sheet in trips.leaderboards[].teamSet.';

COMMENT ON TABLE team_members IS
  'Who is in which team. A player may hold one place on each sheet — a league team and a pairing at the same time. See lib/teamSets.ts.';
