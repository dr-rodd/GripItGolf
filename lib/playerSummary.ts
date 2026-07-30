// One player's own line, for the trip hub.
//
// Nothing new is calculated here. It is the same Stableford total the
// leaderboard shows, under the same discard rule (lib/customPoints.ts), read
// back for one person rather than for a table — plus their position in that
// table, which is only meaningful against everyone else's.
//
// Pure, so the trip hub can render it on the server without a round trip and
// the tests can drive it without a database.

import { totalAfterDiscard } from './customPoints'

/** The least a score needs to expose to count towards a total. */
export type SummaryScore = {
  playerId: string
  roundId: string
  points: number
}

export type Standing = {
  playerId: string
  /** After any discard the trip applies. */
  total: number
  /** Holes with a score on them, across every round. */
  holes: number
  /** Rounds they have a card in. */
  rounds: number
  /**
   * Position on the board, sharing where level. Two players tied for first
   * are both 1st and the next is 3rd — the way a scoreboard reads.
   */
  position: number
  /** Against two points a hole, which is what level means in Stableford. */
  relative: number
}

/**
 * Everyone with a card, in board order.
 *
 * A player with no scores at all is not on the board — they have not played,
 * which is different from having played badly. That matches the leaderboard,
 * which filters the same way.
 */
export function standings(
  scores: readonly SummaryScore[],
  discardWorst = 0,
): Standing[] {
  const byPlayer = new Map<string, Map<string, number>>()
  const holesByPlayer = new Map<string, number>()

  for (const s of scores) {
    let rounds = byPlayer.get(s.playerId)
    if (!rounds) { rounds = new Map(); byPlayer.set(s.playerId, rounds) }
    rounds.set(s.roundId, (rounds.get(s.roundId) ?? 0) + s.points)
    holesByPlayer.set(s.playerId, (holesByPlayer.get(s.playerId) ?? 0) + 1)
  }

  const rows = [...byPlayer.entries()].map(([playerId, rounds]) => {
    const perRound = [...rounds.values()]
    const holes = holesByPlayer.get(playerId) ?? 0
    const total = totalAfterDiscard(perRound, discardWorst)
    return {
      playerId,
      total,
      holes,
      rounds: perRound.length,
      position: 0,
      // Two points a hole is level; this is how far off that they stand
      relative: total - holes * 2,
    }
  })

  // Highest total wins. Ties share the place they occupy, so the position is
  // "how many people are strictly ahead of you, plus one".
  rows.sort((a, b) => b.total - a.total)
  for (const row of rows) {
    row.position = rows.filter(r => r.total > row.total).length + 1
  }
  return rows
}

/** This player's line, or null if they have not played a hole yet. */
export function standingFor(
  playerId: string,
  rows: readonly Standing[],
): Standing | null {
  return rows.find(r => r.playerId === playerId) ?? null
}

// ─── Matchplay ─────────────────────────────────────────────────

/** The least a match needs to expose. Sides are ids, whoever they belong to. */
export type SummaryMatch = {
  sideA: string | null
  sideB: string | null
  winner: string | null
  /** A bye is awarded, not played. */
  isBye: boolean
}

export type MatchRecord = {
  /** Matches actually contested. A bye is not one of them. */
  played: number
  won: number
  /** Still in the draw — nothing they were in has been lost. */
  stillIn: boolean
}

/**
 * How one entrant is doing in the draw.
 *
 * `entrantId` is a player in a singles draw and a pairing in a pairs one —
 * the bracket stores whichever, and this does not need to know which.
 *
 * A bye counts towards staying in but not towards a record: walking into the
 * next round is not a win, and a trip where half the field drew byes would
 * otherwise read as half the field having beaten somebody.
 */
export function matchRecord(
  entrantId: string,
  matches: readonly SummaryMatch[],
): MatchRecord {
  const mine = matches.filter(m => m.sideA === entrantId || m.sideB === entrantId)
  const contested = mine.filter(m => !m.isBye)

  return {
    played: contested.filter(m => m.winner !== null).length,
    won: contested.filter(m => m.winner === entrantId).length,
    // Out only once a decided match went the other way. An undecided match is
    // not a loss, and neither is not being in the draw at all.
    stillIn: mine.length > 0
      && !mine.some(m => m.winner !== null && m.winner !== entrantId),
  }
}

/** "1st of 8", "T2 of 8" — position with a marker when it is shared. */
export function describePosition(row: Standing, fieldSize: number): string {
  const shared = fieldSize > 0 && row.position > 0
  if (!shared) return ''
  return `${ordinal(row.position)} of ${fieldSize}`
}

/** 1st, 2nd, 3rd, 4th … */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** Level prints as E; everything else carries its sign. */
export function formatRelative(n: number): string {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}
