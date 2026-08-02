// Reading a pre-migration trip as a list of leaderboards.
//
// Trips created before `trips.leaderboards` existed carry their competition
// in `trips.formats` — a set of flags, plus one trip-wide discard rule and
// one trip-wide team-scoring setting. That model could not say "Stableford
// keeping every card, and Strokes dropping the worst"; it had one answer and
// applied it to every board.
//
// This turns those flags into the boards they were always describing, so the
// leaderboard has one thing to render and nothing downstream has to know
// which generation a trip came from. Nothing here is ever written back: the
// moment an organiser opens settings and saves, the trip has a real list and
// this file stops being consulted for it.
//
// Delete this file whole once no trip has an empty `leaderboards`.
//
// Pure. No I/O.

import { parseFormats, type TripFormats } from './formats'
import { parseTeamScoring, type TeamScoring } from './teamScoring'
import { parseLeaderboards, type Leaderboard } from './leaderboards'

/**
 * The boards an old trip was running.
 *
 * Teams lead when both are on, which is the order the old `leaderboardTabs`
 * used: the team board is the competition, the individual ones sit behind it.
 */
export function boardsFromFormats(f: TripFormats, teamScoring: TeamScoring): Leaderboard[] {
  const out: Leaderboard[] = []

  // The old model scored teams on Stableford whatever else was on, so a team
  // league exists whenever teams do, and the rounds were always simply added
  // up — there was no way to say anything else.
  if (f.teams) {
    out.push({
      id: 'legacy-team',
      audience: 'team',
      competition: 'league',
      teamFormat: teamScoring.mode,
      scoring: 'stableford',
      combine: 'total',
    })
  }

  if (f.individual && f.league.on) {
    // Discard was one number for the trip, so every board inherits it. That
    // is exactly the limitation the new model removes, and it is faithfully
    // what these trips have been playing.
    const discardWorst = f.league.discardWorst

    if (f.league.stableford) {
      out.push({
        id: 'legacy-stableford',
        audience: 'individual',
        competition: 'league',
        scoring: 'stableford',
        combine: 'total',
        discardWorst,
      })
    }
    if (f.league.strokes) {
      out.push({
        id: 'legacy-strokes',
        audience: 'individual',
        competition: 'league',
        scoring: 'strokes',
        combine: 'total',
        discardWorst,
      })
    }
    if (f.league.custom) {
      out.push({
        id: 'legacy-custom',
        audience: 'individual',
        competition: 'league',
        // "Custom points" was never a way of scoring a round — it is
        // Stableford, paid out by finishing position each round.
        scoring: 'stableford',
        combine: 'position',
        discardWorst,
        customPoints: [...f.league.customPoints],
      })
    }
  }

  // The draw is between pairings when the old settings said pairs, and a
  // pairing is a team — so it is a team competition however it was stored.
  if (f.matchplay.on) {
    out.push({
      id: 'legacy-matchplay',
      audience: f.matchplay.format === 'pairs' && f.teams ? 'team' : 'individual',
      competition: 'matchplay',
    })
  }

  return out
}

/**
 * What this trip is playing for, whichever generation it was set up under.
 *
 * A stored list always wins. An empty one is not "no competitions" — it is a
 * trip that predates the column — so the flags are read instead. A trip that
 * genuinely runs nothing has nothing under either model, and the leaderboard
 * says so.
 */
export function tripBoards(
  stored: Leaderboard[],
  formats: TripFormats,
  teamScoring: TeamScoring,
): Leaderboard[] {
  return stored.length > 0 ? stored : boardsFromFormats(formats, teamScoring)
}

/** The three columns any page needs to know what a trip plays for. */
export type TripBoardColumns = {
  formats: unknown
  leaderboards: unknown
  team_scoring: unknown
}

/**
 * What a trip plays for, straight off its row.
 *
 * Every page that asks the question asks it the same way — parse all three
 * columns, prefer the stored list, fall back to the flags. Doing that by hand
 * in each page is how the matchplay screen came to read a flag nothing writes
 * any more, and answered "matchplay isn't switched on" for a trip whose
 * primary leaderboard was a knockout.
 */
export function boardsForTrip(trip: TripBoardColumns): Leaderboard[] {
  return tripBoards(
    parseLeaderboards(trip.leaderboards),
    parseFormats(trip.formats),
    parseTeamScoring(trip.team_scoring),
  )
}

/**
 * Whether these boards came from the old flags rather than being chosen.
 *
 * The team board only carries its options — how many scores count on a hole,
 * the grandstand finish — when it did, so the caller knows whether to pass
 * the trip's old team scoring through to the maths.
 */
export function isLegacy(stored: Leaderboard[]): boolean {
  return stored.length === 0
}
