// Why a set of old-model formats cannot be saved.
//
// This file used to be a decision tree: a list of questions trip settings
// walked through in order, each answer opening the next. The leaderboard
// cards ask all of that properly now — each one a complete competition
// rather than a flag on a shared object — so the tree, the steps it built
// and the finalise gate it fed are gone. `lib/leaderboards.ts` owns those
// questions, and `finaliseBlockedReason` there reads the boards.
//
// What is left is the one rule that still applies to `trips.formats`, which
// old trips carry and the matchplay panel still writes.

import { type TripFormats, hasCompetitors, anyLeagueBoard } from './formats'

/**
 * A trip with nothing switched on has no storable form — `parseFormats`
 * returns the default instead of an empty object, so reloading the page
 * would quietly replace it and throw away the rest of the answers.
 *
 * The refusal therefore names the switch that does what the organiser meant:
 * unticking the last board is a different action from turning the league off.
 */
export function emptyFormatsReason(f: TripFormats): string {
  if (!hasCompetitors(f)) {
    return 'A trip needs someone competing — pick teams or individuals'
  }
  if (!f.league.on && !f.matchplay.on) {
    return 'Switch on a league or a matchplay draw'
  }
  if (f.league.on && !anyLeagueBoard(f)) {
    return 'A league needs a board — pick one, or switch the league off above'
  }
  return 'Keep at least one competition switched on'
}
