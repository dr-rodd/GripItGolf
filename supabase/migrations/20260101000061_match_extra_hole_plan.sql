-- Migration 061 — which hole each extra hole is played off.
--
-- A match all square after eighteen goes down the 19th (migration 059).
-- The 19th is the 1st by default, but a club often sends extra holes
-- elsewhere — the 10th, or straight back up the 18th — so the players pick
-- it on the card, and each extra hole after follows on in order unless
-- they pick that one too (lib/matchCard.ts, `extraCourseHole`).
--
-- One jsonb object per match: extra hole number → the course hole it is
-- played off, only the choices made, `{}` when none (the 1st and on). It
-- rides on the match row both phones already read and the browser already
-- writes, so no new table and no new grants.
--
-- Needs migration 014. Safe to re-paste. Run once, by hand, in the
-- Supabase SQL editor.

ALTER TABLE matchplay_matches
  ADD COLUMN IF NOT EXISTS extra_holes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN matchplay_matches.extra_holes IS
  'Extra hole number → the course hole it is played off, as chosen on the card. {} = the 1st and on (lib/matchCard.ts).';

-- ── Did it land? ──────────────────────────────────────────
-- One row back, found = 1.
select 'matchplay_matches.extra_holes' as what, count(*) as found from information_schema.columns
  where table_name = 'matchplay_matches' and column_name = 'extra_holes';
