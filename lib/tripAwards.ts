// The trip's honours, read off the stats.
//
// Six awards, each a superlative over one figure from `lib/holeStats.ts` —
// nothing is derived here, only chosen. The rules of what a fairway or a
// scramble *is* stay in that file; this one owns which of them deserves a
// line on the board, and that is the whole split.
//
// **Every award has a floor, and an award below its floor is simply not
// given.** Somebody who answered three fairway questions and hit two is not
// the trip's straightest driver — they are somebody who answered three
// questions. The floors are exported constants, like every other judgement
// in the stats package, so they can be argued with in one place.
//
// **Ties share.** Two players level on the winning figure both hold the
// award, the way `standings()` already shares a position — golf has never
// minded a shared trophy.
//
// Shown while the trip is still running, deliberately: "as it stands"
// honours move round-by-round the way a leaderboard does, and the wording
// switch to a final board is the caller's job via `tripState()` — dates are
// something screens know and this module does not.
//
// Pure. No I/O.

import type { PlayerStats } from './holeStats'

// ─── The floors ────────────────────────────────────────────────

/** Fairway questions answered before straightness means anything. */
export const MIN_AWARD_FAIRWAYS = 14
/** Holes with putts before a greens or putting figure is an award. */
export const MIN_AWARD_PUTT_HOLES = 18
/** Missed greens before somebody is the trip's scrambler. */
export const MIN_AWARD_SCRAMBLES = 5
/** Doubles answered-for before a bounce-back rate is a temperament. */
export const MIN_AWARD_BOUNCES = 3

export type Award = {
  key: string
  title: string
  /** What the figure is, in a reader's words. */
  line: string
  /** Everybody level on the winning figure. Empty = not awarded. */
  winnerIds: string[]
  /** The winning figure, already formatted for printing. */
  figure: string
}

type Candidate = {
  key: string
  title: string
  line: string
  /**
   * The figure a player is judged on, or null when they have not qualified.
   * Higher wins — a "fewest putts" award negates on the way in.
   */
  score: (p: PlayerStats) => number | null
  format: (best: number) => string
}

const pct = (r: number) => `${Math.round(r * 100)}%`

/**
 * The panel of candidates.
 *
 * A function rather than a constant so the qualification closures cannot be
 * mutated from outside, and because a list of behaviours reads better built
 * where its rules are stated.
 */
const CANDIDATES: Candidate[] = [
  {
    key: 'fairways',
    title: 'Fairway finder',
    line: 'The straightest driver on the trip.',
    score: p => p.fairways.counted >= MIN_AWARD_FAIRWAYS ? p.fairways.hitRate : null,
    format: best => pct(best),
  },
  {
    key: 'greens',
    title: 'Flag hunter',
    line: 'The most greens found in regulation.',
    score: p => p.putting.holes >= MIN_AWARD_PUTT_HOLES ? p.putting.girRate : null,
    format: best => pct(best),
  },
  {
    key: 'putter',
    title: 'Hot putter',
    line: 'The fewest putts per round.',
    // Negated so that, like every other award, the biggest figure wins.
    score: p => p.putting.holes >= MIN_AWARD_PUTT_HOLES && p.putting.puttsPer18 != null
      ? -p.putting.puttsPer18
      : null,
    format: best => `${(Math.round(-best * 10) / 10).toFixed(1)} a round`,
  },
  {
    key: 'scrambler',
    title: 'Scrambler',
    line: 'The most missed greens still saved.',
    score: p => p.scrambling.chances >= MIN_AWARD_SCRAMBLES ? p.scrambling.rate : null,
    format: best => pct(best),
  },
  {
    key: 'birdies',
    title: 'Birdie machine',
    line: 'The most birdies or better.',
    // The one count on the panel: a single birdie can win a quiet trip, so
    // the floor is simply having one.
    score: p => p.scoring.birdies + p.scoring.eaglesOrBetter > 0
      ? p.scoring.birdies + p.scoring.eaglesOrBetter
      : null,
    format: best => String(best),
  },
  {
    key: 'bounceback',
    title: 'Bounce-back',
    line: 'The best answer to a bad hole.',
    score: p => p.scoring.bounceBackChances >= MIN_AWARD_BOUNCES
      ? p.scoring.bounceBackRate
      : null,
    format: best => pct(best),
  },
]

/**
 * The board: every award somebody has qualified for, winners chosen.
 *
 * Rates are compared to a tenth of a percent rather than to the last
 * floating-point bit — two players on 13 of 18 greens are level however the
 * division rounded, and a shared award decided by bit fifty-two would be a
 * coin toss wearing a calculation.
 */
export function tripAwards(players: readonly PlayerStats[]): Award[] {
  const out: Award[] = []

  for (const c of CANDIDATES) {
    const scored = players
      .map(p => ({ id: p.playerId, score: c.score(p) }))
      .filter((x): x is { id: string; score: number } => x.score != null)
    if (scored.length === 0) continue

    const level = (n: number) => Math.round(n * 1000)
    const best = Math.max(...scored.map(x => x.score))
    const winners = scored.filter(x => level(x.score) === level(best)).map(x => x.id)

    out.push({
      key: c.key,
      title: c.title,
      line: c.line,
      winnerIds: winners,
      figure: c.format(best),
    })
  }

  return out
}
