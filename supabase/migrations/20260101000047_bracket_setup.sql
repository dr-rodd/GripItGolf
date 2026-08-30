-- Migration 047 — the tournament bracket setup
--
-- One jsonb column: the organiser's answers from the bracket setup form
-- behind the organiser PIN — format (match play now; league is anticipated
-- by the shape, not built), strict or relaxed mode, bracket size (16/32/
-- 64/128), how players get in, an optional qualifying event with its
-- seeding, a deadline per bracket round, and whether the structure is
-- finalised or still open to joiners.
--
-- jsonb rather than columns for the same reason `trips.leaderboards` is:
-- the object is written and read whole, only ever complete (lib/
-- bracketSetup.ts refuses half an answer in both directions), and nothing
-- in SQL joins on any of its fields — the draw itself stays in
-- matchplay_matches.
--
-- Reads fail soft (the setup page asks for this column in its own query,
-- never inside the page's main select), but the save names the column, so
-- **run this before a bracket is set up** — until then the form fails with
-- a calm "database update not applied yet" message and everything else is
-- untouched.
--
-- Safe to re-paste — idempotent. Run once, by hand, in the Supabase SQL
-- editor.

BEGIN;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS bracket_setup jsonb;

COMMENT ON COLUMN trips.bracket_setup IS
  'Tournament bracket setup (lib/bracketSetup.ts): format, mode, size, entry, qualifying, deadlines, finalized. NULL = not set up.';

COMMIT;

-- ── Did it land? ──────────────────────────────────────────
select 'trips.bracket_setup' as what, count(*) as found
  from information_schema.columns
  where table_name = 'trips' and column_name = 'bracket_setup';
