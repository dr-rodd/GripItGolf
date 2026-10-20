# Pending concepts

Ideas Ross has agreed are good but has not asked to be built yet. Each is
kept here whole enough to be picked up cold by a later session: what it is,
why it came up, what it would touch, and the questions to settle first.
When one is built, move its decisions into the doc that owns that area and
delete it from here.

## Handicap cuts between rounds

**Where it came from.** The winter league (`docs/event-use-cases.md`, use
case 1). Ross's note asked to "change handicap increment for individual
days"; the per-round setting turned out to be the handicap *allowance*
(stage 3's gear), and a *cut* was agreed to be a good idea of its own,
October 2026.

**What it is.** A winter league's own adjustment of a player's handicap
after a result, the way club and society leagues keep the same winners
from winning every week: the winner of a round plays the next one off, say,
two shots less, the runner-up one shot less. Some leagues restore the cut
after a run of rounds without a placing, or cap the total cut.

**Why it is not an allowance.** An allowance is a percentage applied when a
board reads the cards, never stored (`lib/handicapAllowance.ts`). A cut is
a fact about a player that carries forward from one round to the next and
depends on results, so it changes what the *next* round's card is scored
off. It sits between the handicap index and the board.

**What it would touch.**

- Where the cut lives. Probably per player per round, beside the
  `round_handicaps` snapshot, or as a league-level adjustment the snapshot
  is computed from. Never by overwriting `players.handicap`, which is the
  player's real index and is shared with every other screen.
- When it is applied. After a round is final (its cards committed), the
  next round's snapshots are re-written with the cut in. A round already
  started must not have its handicaps moved under it
  (`docs/gotchas-and-debt.md` on mid-round snapshots).
- The Stableford trigger and the canonical formula are untouched: a cut
  changes the handicap fed in, not the maths.
- The organiser's rules: how many shots for 1st, 2nd, 3rd; whether cuts
  accumulate; a cap; whether a cut is ever restored; whether a round that
  does not count (stage 2) can cut.
- Saying it on screen: the player's card and the board should show "off
  12 (−2 cut)" so nobody thinks the handicap was mistyped.

**Questions to settle first.** The cut table and cap; whether a cut is
per league or follows the player into other events (almost certainly per
league); whether Golf Ireland cards in a mixed league are cut too, given
their Stableford is Golf Ireland's official figure and cannot be re-scored.
