-- Migration 066 — who put each player in their team.
--
-- Teams and partnerships share one picker (Ross, 27 Oct 2026). Where the
-- organiser lets players pick their own teams, a player starts a team and
-- adds their partners — and may then take out only themselves and the
-- people they added, the same "medium security" the tee sheet keeps
-- (tee_assignments.booked_by, migration 065). The organiser changes anyone.
--
-- So each team_members row says who made it: the claimed player on the
-- phone that added them, or empty when the organiser did, or the row is
-- older than this. A player whose adder leaves the field keeps their team;
-- only the record of who added them goes.
--
-- A column on an existing table, so no new grants. The picker reads it in a
-- query of its own and fails soft: until this runs, players put themselves
-- in a team and only themselves. Safe to re-paste. Run once, by hand, in the
-- Supabase SQL editor.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES players(id) ON DELETE SET NULL;

COMMENT ON COLUMN team_members.added_by IS
  'The player who put this one in the team; empty for the organiser''s placings and older rows (lib/teamPicker.ts).';

-- ── Did it land? ──────────────────────────────────────────
-- One row back.
select 'team_members.added_by' as what, data_type from information_schema.columns
  where table_name = 'team_members' and column_name = 'added_by';
