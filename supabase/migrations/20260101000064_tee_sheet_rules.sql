-- Migration 064 — a round's tee sheet rules.
--
-- A round's tee sheet is made in its own wizard now (Ross, 26 Oct 2026),
-- and is live only once it has been: until then the round is an empty slot
-- on the Tee times tab. What the wizard saves is one jsonb value on the
-- round, written and read whole (lib/teeSheet.ts `TeeRules`):
--
--   { "batches": [ { "start": "08:00", "interval": 10, "count": 12 },
--                  { "start": "12:00", "interval": 10, "count": 6 } ],
--     "groupSize": 4 }
--
-- A list of batches, so tee times need not run back to back — a morning
-- and an afternoon wave are one sheet, numbered straight through — and the
-- players on each tee time. Empty means the sheet has not been made.
--
-- jsonb rather than columns for the reason `trips.bracket_setup` is: it is
-- saved whole, only ever valid (the parser refuses half an answer), and
-- nothing in SQL reads inside it. The two migration-050 columns stay and
-- are written alongside from the first batch.
--
-- A column on an existing table, so no new grants. Every read asks for it
-- in a query of its own and fails soft: until this runs, the wizard says
-- it could not save, and a sheet that already has names on it keeps
-- working as before. Safe to re-paste. Run once, by hand, in the Supabase
-- SQL editor.

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_sheet jsonb;

COMMENT ON COLUMN rounds.tee_sheet IS
  'The round''s tee sheet rules — batches of tee times and players per tee time (lib/teeSheet.ts). Empty = not made yet.';

-- ── Did it land? ──────────────────────────────────────────
-- One row back.
select 'rounds.tee_sheet' as what, data_type from information_schema.columns
  where table_name = 'rounds' and column_name = 'tee_sheet';
