-- Migration 062 — a no return (NR) on the match play card.
--
-- A player who picks up on a hole taps NR (Ross, 25 Oct 2026 — in place of
-- the Concede button). It is kept as the player's score row with no gross:
-- an NR loses the hole to any number, a pairing with one NR plays its
-- partner's ball, and two NRs halve the hole (lib/matchCard.ts). No row at
-- all still means nothing entered yet.
--
-- So `match_scores.gross` may now be empty. The 1–20 check stays and
-- passes an empty value by itself. Older concessions in `match_concessions`
-- still count; the card no longer writes new ones.
--
-- Needs migration 058. No new table, so no new grants. Safe to re-paste.
-- Run once, by hand, in the Supabase SQL editor.

ALTER TABLE match_scores ALTER COLUMN gross DROP NOT NULL;

COMMENT ON COLUMN match_scores.gross IS
  'The player''s gross on the hole; empty is an NR — picked up (lib/matchCard.ts).';

-- ── Did it land? ──────────────────────────────────────────
-- One row back, is_nullable = YES.
select 'match_scores.gross' as what, is_nullable from information_schema.columns
  where table_name = 'match_scores' and column_name = 'gross';
