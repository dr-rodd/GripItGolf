// Who this entrant plays next, in the knockout.
//
// Four answers, and all four happen on a real trip:
//
//   match       the other side is known. "Plays Ross · Semi-final."
//   undecided   the other side is empty because the match feeding it has
//               not been played yet. Says so, rather than printing a blank
//               where a name goes.
//   bye         the other side is a bye. A bye is awarded, not played.
//   null        knocked out, or never in the draw. The hub omits the line —
//               there is nothing to say and a placeholder would be worse.
//
// **The entrant is not always the player.** In a pairs draw the sides are
// pairings, and the pairing is their place on *that draw's* team sheet, which
// need not be the team they play the league in. Resolving that is the
// caller's job (`teamFor` + `setOf`); this takes whichever id came out.
//
// Pure. No I/O.

/** A match, reduced to what deciding "who is next" actually needs. */
export type DrawMatch = {
  roundNumber: number
  /** "Semi-final", "Final" — already human, straight off the row. */
  roundName: string
  sideA: string | null
  sideB: string | null
  aIsBye: boolean
  bIsBye: boolean
  winner: string | null
}

export type NextMatch =
  | { state: 'match'; roundName: string; opponentId: string }
  | { state: 'undecided'; roundName: string }
  | { state: 'bye'; roundName: string }

/**
 * The next match this entrant has still to play, or null.
 *
 * "Still to play" is a match they are in with no winner recorded. Byes are
 * settled when the draw is generated, so they normally carry a winner and
 * fall out here — the bye case survives for a draw where one has not been
 * awarded yet, rather than for the ordinary path.
 *
 * Earliest round first, so a player somehow sitting in two open matches is
 * told about the one in front of them.
 */
export function nextMatch(
  entrantId: string | null,
  matches: readonly DrawMatch[],
): NextMatch | null {
  if (!entrantId) return null

  const mine = matches
    .filter(m => m.sideA === entrantId || m.sideB === entrantId)
    .filter(m => m.winner === null)
    .sort((a, b) => a.roundNumber - b.roundNumber)

  const match = mine[0]
  if (!match) return null

  const amA = match.sideA === entrantId
  const otherId = amA ? match.sideB : match.sideA
  const otherIsBye = amA ? match.bIsBye : match.aIsBye

  if (otherIsBye) return { state: 'bye', roundName: match.roundName }
  if (otherId) return { state: 'match', roundName: match.roundName, opponentId: otherId }
  return { state: 'undecided', roundName: match.roundName }
}

/**
 * The line as it reads on the hub.
 *
 * `nameOf` resolves an entrant id to a name — a player's on a singles draw,
 * a pairing's on a pairs one. An id that resolves to nothing reads as an
 * undecided opponent rather than as an empty name.
 */
export function describeNextMatch(
  next: NextMatch | null,
  nameOf: (id: string) => string | null,
): string {
  if (!next) return ''
  if (next.state === 'bye') return `Bye into the ${next.roundName.toLowerCase()}`
  if (next.state === 'undecided') return `${next.roundName} · opponent to be decided`
  const name = nameOf(next.opponentId)
  if (!name) return `${next.roundName} · opponent to be decided`
  return `Plays ${name} · ${next.roundName}`
}
