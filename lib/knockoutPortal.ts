// A knockout read from a player's side of it — the hub's next-match card,
// the Scoring tab's portal of bracket rounds, and a match's own page
// (docs/event-use-cases.md, story 2). The bracket page draws the whole draw;
// this is the same rows sorted for the one person holding the phone.
//
// **The entrant is not always the player.** In a pairs draw the sides are
// pairings — their place on that draw's sheet — so the caller resolves the
// entrant (`teamFor` + `setOf`) and hands its id in, as lib/nextMatch.ts
// asks. Pure. No I/O.

/** A match as the portal reads it, one shape for singles and pairs. */
export type PortalMatch = {
  id: string
  roundNumber: number
  roundName: string
  slot: number
  sideA: string | null
  sideB: string | null
  aIsBye: boolean
  bIsBye: boolean
  winner: string | null
  /** "3&2", "1 up" — never on a bye. */
  result: string | null
}

export type PortalRound = {
  roundNumber: number
  roundName: string
  /** The date the round is played by, or null when none is set. */
  deadline: string | null
  /** Matches with a winner, of the matches anybody plays (byes are not). */
  played: number
  total: number
  /** The matches anybody plays, this entrant's own first, then in draw order. */
  matches: (PortalMatch & { mine: boolean })[]
}

/** A bye is awarded, not played — never listed as a match. */
export const isPlayable = (m: PortalMatch) => !m.aIsBye && !m.bIsBye

/** Does this entrant play in this match? */
export const isMine = (m: Pick<PortalMatch, 'sideA' | 'sideB'>, entrantId: string | null) =>
  !!entrantId && (m.sideA === entrantId || m.sideB === entrantId)

/**
 * Every bracket round in playing order, with its deadline and its matches.
 * `deadlines` is per drawn round, in order (`drawDeadlines` in
 * lib/bracketSetup.ts lines the setup's up with the draw).
 */
export function portalRounds(
  matches: readonly PortalMatch[], entrantId: string | null, deadlines: readonly (string | null)[] = [],
): PortalRound[] {
  const numbers = [...new Set(matches.map(m => m.roundNumber))].sort((a, b) => a - b)
  return numbers.map((n, i) => {
    const inRound = matches.filter(m => m.roundNumber === n)
    const playable = inRound.filter(isPlayable)
    return {
      roundNumber: n,
      roundName: inRound[0]?.roundName ?? '',
      deadline: deadlines[i] ?? null,
      played: playable.filter(m => m.winner !== null).length,
      total: playable.length,
      matches: playable
        .map(m => ({ ...m, mine: isMine(m, entrantId) }))
        .sort((a, b) => Number(b.mine) - Number(a.mine) || a.slot - b.slot),
    }
  })
}

/**
 * The round being played now — the first with a match still open — or the
 * last round once the draw is finished. Where the portal opens, and what
 * the hub's bird's-eye line names.
 */
export function currentRound(rounds: readonly PortalRound[]): PortalRound | null {
  return rounds.find(r => r.played < r.total) ?? rounds[rounds.length - 1] ?? null
}

/** "12 of 31 matches played" — the draw at a glance. */
export function describeProgress(rounds: readonly PortalRound[]): string {
  const played = rounds.reduce((n, r) => n + r.played, 0)
  const total = rounds.reduce((n, r) => n + r.total, 0)
  if (total === 0) return ''
  if (played === total) return 'Every match played'
  return `${played} of ${total} ${total === 1 ? 'match' : 'matches'} played`
}

/**
 * This entrant's next open match — the one the hub's card opens — or null
 * when they are out, through to nothing yet, or not in the draw. Earliest
 * round first. A bye is not a match to arrange, so it is passed over.
 */
export function myNextMatch(matches: readonly PortalMatch[], entrantId: string | null): PortalMatch | null {
  if (!entrantId) return null
  return matches
    .filter(m => isMine(m, entrantId) && m.winner === null && isPlayable(m))
    .sort((a, b) => a.roundNumber - b.roundNumber)[0] ?? null
}

/** The other side of a match, from this entrant's seat. Null while undecided. */
export function opponentOf(m: Pick<PortalMatch, 'sideA' | 'sideB'>, entrantId: string): string | null {
  return m.sideA === entrantId ? m.sideB : m.sideA
}

/** "Ross won 3&2", "Ross won" — a decided match in a sentence. Null while open. */
export function describeResult(m: PortalMatch, nameOf: (id: string) => string | null): string | null {
  if (!m.winner) return null
  const name = nameOf(m.winner) ?? 'Decided'
  return m.result ? `${name} won ${m.result}` : `${name} won`
}
