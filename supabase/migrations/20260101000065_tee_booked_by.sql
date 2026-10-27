-- Migration 065 — who booked each player onto a tee time.
--
-- Where players pick their own tee times — now the default — a player may
-- book themselves and anyone they bring (their fourball, say), and may then
-- move or remove only themselves and the people they booked (Ross, 26 Oct
-- 2026: "medium security", so a stranger's name cannot be taken off by
-- accident). A phone with organiser access can still remove anybody.
--
-- So each tee_assignments row says who made it: the claimed player on the
-- phone that booked it, or empty when the organiser placed them or the row
-- is older than this. A player whose booker leaves the field keeps their
-- time; only the record of who booked them goes.
--
-- A column on an existing table, so no new grants. The sheet reads it in a
-- query of its own and fails soft: until this runs, players book
-- themselves and only themselves, exactly as before. Safe to re-paste. Run
-- once, by hand, in the Supabase SQL editor.

ALTER TABLE tee_assignments
  ADD COLUMN IF NOT EXISTS booked_by uuid REFERENCES players(id) ON DELETE SET NULL;

COMMENT ON COLUMN tee_assignments.booked_by IS
  'The player who booked this one onto the tee time; empty for the organiser''s placings and older rows (lib/teeSheet.ts).';

-- ── Did it land? ──────────────────────────────────────────
-- One row back.
select 'tee_assignments.booked_by' as what, data_type from information_schema.columns
  where table_name = 'tee_assignments' and column_name = 'booked_by';
