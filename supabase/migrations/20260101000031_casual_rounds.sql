-- ═══════════════════════════════════════════════════════════════
-- Migration 031 — casual rounds
-- ═══════════════════════════════════════════════════════════════
--
-- A subgroup playing an extra course mid-trip wants everything scoring
-- already does — the live card, the round's own leaderboard, the podium on
-- its page — without the round counting. `casual` is that: a round kept off
-- every trip leaderboard, the hub's standing line and the discard rule,
-- while its own page and live scoring work exactly as ever. The rule that
-- reads it lives in lib/boardRows.ts and nowhere else.
--
-- `casual_stats` is the opt-in for a casual round's putts and fairways to
-- still feed the trip's stats screen. It is asked when the round is marked
-- casual on a trip already tracking stats, and defaults to out — a trip
-- that switches stats on later never re-asks, so a casual round played
-- before then stays out unless somebody flips it on the round's page.
-- It means nothing on a round that is not casual: those always count.
--
-- Nothing is backfilled: every existing round counts, which is what every
-- existing round has always done.
--
-- Replay-safe: there is no migration ledger — `npm run migrate` with no
-- arguments runs every file in this directory, every time.

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS casual       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS casual_stats BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN rounds.casual IS
  'A casual round is scored as usual but kept off every leaderboard. lib/boardRows.ts is the only place that reads this.';
COMMENT ON COLUMN rounds.casual_stats IS
  'Whether a casual round''s cards still feed the trip stats. Meaningless unless casual is true.';
