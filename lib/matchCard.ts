// The match play scorecard — the only copy of its rules (docs/event-use-
// cases.md, story 2, stage 4). Each player enters their gross a hole; the
// shots come off the arrangement (lib/matchArrangements.ts `matchStrokes`,
// the difference from the lowest); a pairing takes its better nett; and a
// side may concede a hole outright. The wording of a result — "3&2",
// "2 up thru 14" — is lib/matchDecision.ts's, the one copy.
//
// **A hole counts once it is finished on both sides**: every player has a
// score, or one side conceded it. The bracket's reader (`readMatch`) treats
// a hole only one side has as lost, which is right for a signed card and
// wrong for one being filled in on the green — the first phone to tap would
// win the hole. That difference is why this is its own small tally. Pure.

import { shotsReceived } from './handicap'
import { marginLabel, progressLabel } from './matchDecision'

/** A for the top of the draw, B for the bottom — the card's left and right. */
export type CardSideKey = 'A' | 'B'

export type CardPlayer = { id: string; gender: string; receives: number }
export type CardSide = { id: string; players: CardPlayer[] }
export type CardHole = { holeNumber: number; par: number; strokeIndex: number; strokeIndexLadies?: number | null }

/** Player id → hole number → gross. */
export type CardScores = ReadonlyMap<string, ReadonlyMap<number, number>>
/** Hole number → the side that conceded it. */
export type CardConcessions = ReadonlyMap<number, CardSideKey>

export type HoleOutcome = {
  holeNumber: number
  /** Null while the hole is not finished on both sides. */
  winner: CardSideKey | 'halved' | null
  conceded: boolean
  /** Each side's figure — a pairing's better nett — once all its players have scored. */
  nettA: number | null
  nettB: number | null
}

/** The stroke index this player plays the hole off — the ladies' where a woman has one. */
const siFor = (h: CardHole, gender: string) =>
  gender === 'F' && h.strokeIndexLadies ? h.strokeIndexLadies : h.strokeIndex

/** The shots this player gets on this hole, from their match allowance. */
export function shotsOn(h: CardHole, p: CardPlayer): number {
  return p.receives > 0 ? shotsReceived(p.receives, siFor(h, p.gender)) : 0
}

/** A side's nett on a hole: the better of its players', once every one has scored. */
function sideNett(h: CardHole, side: CardSide, scores: CardScores): number | null {
  const netts: number[] = []
  for (const p of side.players) {
    const gross = scores.get(p.id)?.get(h.holeNumber)
    if (gross === undefined) return null
    netts.push(gross - shotsOn(h, p))
  }
  return netts.length > 0 ? Math.min(...netts) : null
}

/** Every hole of the card, in order, with who won it so far. */
export function holeOutcomes(
  holes: readonly CardHole[], a: CardSide, b: CardSide,
  scores: CardScores, concessions: CardConcessions,
): HoleOutcome[] {
  return [...holes].sort((x, y) => x.holeNumber - y.holeNumber).map(h => {
    const nettA = sideNett(h, a, scores)
    const nettB = sideNett(h, b, scores)
    const gave = concessions.get(h.holeNumber)
    if (gave) return { holeNumber: h.holeNumber, winner: gave === 'A' ? 'B' : 'A', conceded: true, nettA, nettB }
    const winner = nettA === null || nettB === null ? null
      : nettA === nettB ? 'halved' : nettA < nettB ? 'A' : 'B'
    return { holeNumber: h.holeNumber, winner, conceded: false, nettA, nettB }
  })
}

export type CardState = {
  leader: CardSideKey | null
  up: number
  played: number
  /** True once nothing left to play can change it — what the bracket writes on. */
  settled: boolean
  /** Settled and level after the last hole: put back to the people, never invented. */
  halved: boolean
  /** "3&2", "2 up" once settled. */
  result: string | null
  /** "2 up thru 7", "All square thru 9", "Not started". */
  progress: string
}

/** The match as the card stands. */
export function cardState(outcomes: readonly HoleOutcome[], holeCount = 18): CardState {
  let up = 0
  let played = 0
  for (const o of outcomes) {
    if (o.winner === null) continue
    played++
    if (o.winner === 'A') up++
    else if (o.winner === 'B') up--
  }
  const holesUp = Math.abs(up)
  const remaining = Math.max(0, holeCount - played)
  const settled = played > 0 && (remaining === 0 || holesUp > remaining)
  return {
    leader: up === 0 ? null : up > 0 ? 'A' : 'B',
    up: holesUp,
    played,
    settled,
    halved: settled && holesUp === 0,
    result: settled && holesUp > 0 ? marginLabel(holesUp, remaining) : null,
    progress: progressLabel(holesUp, played, remaining),
  }
}

/**
 * The hole the card opens on: the first not yet finished, or the last once
 * every hole is in.
 */
export function openingHole(outcomes: readonly HoleOutcome[]): number {
  return outcomes.find(o => o.winner === null)?.holeNumber ?? outcomes[outcomes.length - 1]?.holeNumber ?? 1
}

/**
 * Whether the card should write its result to the bracket now. Only a
 * settled, decided card; never over a different result already in unless
 * the organiser (the admin PIN) is the one holding the card — a result in
 * the bracket is changed with the PIN, from the card as from the bracket.
 */
export function shouldWrite(
  state: CardState, winnerId: string | null, stored: { winner: string | null; result: string | null },
  organiser: boolean,
): boolean {
  if (!state.settled || state.halved || !winnerId || !state.result) return false
  if (stored.winner === winnerId && stored.result === state.result) return false
  return stored.winner === null || organiser
}
