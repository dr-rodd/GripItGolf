-- Migration 051 — a handicap the organiser does not know yet
--
-- `players.handicap` has been `numeric(4,1) NOT NULL DEFAULT 0` since the
-- very first schema, and that default is the bug this removes.
--
-- The trip creation form has always let a handicap box be left empty. What
-- happened to an empty one was `parseHandicap(p.handicap) ?? 0` — so a
-- player whose handicap the organiser genuinely did not know was entered as
-- **scratch**. Not a blank, not a warning: a real, plausible-looking number
-- that scores every round they play and quietly moves the leaderboard. The
-- one value a lead player is most likely to be unsure about became the one
-- value nothing could question.
--
-- So blank becomes NULL, and NULL means pending — a handicap nobody has
-- given yet, which is a different fact from scratch and is said out loud on
-- screen. `lib/handicap.ts` is the only copy of that rule.
--
-- Two things this deliberately does NOT do:
--
--   · **No backfill.** Every row already here holds a real number, 0 among
--     them, and a 0 already stored is somebody's actual scratch handicap
--     as far as anything can tell. Rewriting those to NULL would invent
--     pending players on trips that have already been played.
--   · **`round_handicaps.playing_handicap` stays NOT NULL.** A pending
--     player simply gets no snapshot row, which is exactly what the
--     Stableford trigger already handles: it returns early when the
--     playing handicap is NULL, so no points are calculated off a guess.
--     The scoring screen refuses to start a card for them in the first
--     place — see `pendingInCard` — and setting the handicap writes the
--     rows through `syncRoundHandicaps` like any other late joiner.
--
-- Safe to re-paste — idempotent. Run once, by hand, in the Supabase SQL
-- editor.

BEGIN;

ALTER TABLE players ALTER COLUMN handicap DROP NOT NULL;
ALTER TABLE players ALTER COLUMN handicap DROP DEFAULT;

COMMENT ON COLUMN players.handicap IS
  'Handicap index. NULL = pending — nobody has given it yet, which is NOT scratch (see lib/handicap.ts). A pending player gets no round_handicaps row and cannot be put on a scorecard until it is set.';

COMMIT;
