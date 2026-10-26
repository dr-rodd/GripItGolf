// The match play scorecard — the only copy of its rules (docs/event-use-
// cases.md, story 2, stage 4). Each player enters their gross a hole; the
// shots come off the arrangement (lib/matchArrangements.ts `matchStrokes`,
// the difference from the lowest); a pairing takes its better nett. The
// wording of a result — "3&2", "2 up thru 14" — is lib/matchDecision.ts's,
// the one copy.
//
// **A player who picks up is an NR** (no return — the hole given up; Ross,
// 25 Oct 2026, in place of a Concede button): stored as a score row with
// no gross (migration 062). **An NR loses to any number**, however many
// strokes; a pairing with one NR plays its partner's ball; **two NRs halve
// the hole**. Concessions from before (`match_concessions`) still count.
//
// **A hole counts once it is finished on both sides**: every player has a
// score or an NR, or one side conceded it. The bracket's reader (`readMatch`) treats
// a hole only one side has as lost, which is right for a signed card and
// wrong for one being filled in on the green — the first phone to tap would
// win the hole. That difference is why this is its own small tally.
//
// **Level after eighteen, they go down the 19th** — extra holes off the
// course's own holes, the 1st unless the players choose another and on in
// order from there, shots as the round gave them, until a hole is won. A
// match play card always ends with a winner. Pure.

import { shotsReceived } from './handicap'
import { marginLabel, progressLabel } from './matchDecision'

/** A for the top of the draw, B for the bottom — the card's left and right. */
export type CardSideKey = 'A' | 'B'

export type CardPlayer = { id: string; gender: string; receives: number }
export type CardSide = { id: string; players: CardPlayer[] }
/** A side as the card draws it: its name, and each player's. */
export type CardSideView = { id: string; name: string; players: (CardPlayer & { name: string })[] }
export type CardHole = { holeNumber: number; par: number; strokeIndex: number; strokeIndexLadies?: number | null }

/** Player id → hole number → gross, or null for an NR. Absent is not yet entered. */
export type CardScores = ReadonlyMap<string, ReadonlyMap<number, number | null>>
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
  /** The side picked up — every player in it an NR. */
  nrA: boolean
  nrB: boolean
}

/** The stroke index this player plays the hole off — the ladies' where a woman has one. */
const siFor = (h: CardHole, gender: string) =>
  gender === 'F' && h.strokeIndexLadies ? h.strokeIndexLadies : h.strokeIndex

/** The shots this player gets on this hole, from their match allowance. */
export function shotsOn(h: CardHole, p: CardPlayer): number {
  return p.receives > 0 ? shotsReceived(p.receives, siFor(h, p.gender)) : 0
}

/**
 * A side's figure on a hole: its better nett once every player has a score
 * or an NR; 'NR' when all of them picked up; null while somebody has not
 * entered anything.
 */
function sideNett(h: CardHole, side: CardSide, scores: CardScores): number | 'NR' | null {
  const netts: number[] = []
  for (const p of side.players) {
    const mine = scores.get(p.id)
    if (!mine?.has(h.holeNumber)) return null
    const gross = mine.get(h.holeNumber)
    if (typeof gross === 'number') netts.push(gross - shotsOn(h, p))
  }
  if (side.players.length === 0) return null
  return netts.length > 0 ? Math.min(...netts) : 'NR'
}

/** Every hole of the card, in order, with who won it so far. */
export function holeOutcomes(
  holes: readonly CardHole[], a: CardSide, b: CardSide,
  scores: CardScores, concessions: CardConcessions,
): HoleOutcome[] {
  return [...holes].sort((x, y) => x.holeNumber - y.holeNumber).map(h => {
    const figA = sideNett(h, a, scores)
    const figB = sideNett(h, b, scores)
    const gave = concessions.get(h.holeNumber)
    let winner: HoleOutcome['winner'] = null
    if (gave) winner = gave === 'A' ? 'B' : 'A'
    else if (figA !== null && figB !== null) {
      winner = figA === 'NR' && figB === 'NR' ? 'halved'
        : figA === 'NR' ? 'B' : figB === 'NR' ? 'A'
          : figA === figB ? 'halved' : figA < figB ? 'A' : 'B'
    }
    return {
      holeNumber: h.holeNumber,
      winner,
      conceded: !!gave,
      nettA: typeof figA === 'number' ? figA : null,
      nettB: typeof figB === 'number' ? figB : null,
      nrA: figA === 'NR',
      nrB: figB === 'NR',
    }
  })
}

export type CardState = {
  leader: CardSideKey | null
  up: number
  /** Holes finished, extra holes included, up to the one that settled it. */
  played: number
  /**
   * The furthest hole with a result — what "thru" means to a golfer. Not
   * `played` when a hole behind it is still to finish: 1, 3 and 4 in with
   * the 2nd missing a score is thru 4, not thru 3 (Ross, 25 Oct 2026).
   */
  thru: number
  /** Holes behind `thru` with no result yet — a score still to enter. */
  unfinished: number[]
  /** True once nothing left to play can change it — what the bracket writes on. */
  settled: boolean
  /** Level after eighteen: the match has gone down the 19th. */
  extra: boolean
  /** "3&2", "2 up", "at 19th" once settled. */
  result: string | null
  /** "2 up thru 7", "All square thru 9", "All square after 18", "Not started". */
  progress: string
}

/** Eighteen holes, then extra holes until one is won. */
export const REGULATION_HOLES = 18
/** Hole numbers go to 36 — eighteen extra holes is further than any match has gone. */
export const MAX_CARD_HOLES = 36

/** "19th", "21st", "22nd", "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/**
 * The match as the card stands. Read in hole order, and **stopped the
 * moment it is settled** — a group that plays out the last two holes of a
 * 3&2 for fun does not turn the result into 5 up.
 *
 * Level after eighteen, the match goes on: the 19th, the 20th and so on
 * (`playCard` adds them), and the first of them won settles it — "at 19th".
 * A halved extra hole just sends them to the next.
 */
export function cardState(outcomes: readonly HoleOutcome[]): CardState {
  const inOrder = [...outcomes].sort((x, y) => x.holeNumber - y.holeNumber)
  let up = 0
  let played = 0
  let thru = 0
  let settledAt: number | null = null
  for (const o of inOrder) {
    if (o.holeNumber > REGULATION_HOLES) break
    if (o.winner === null) continue
    played++
    thru = o.holeNumber
    if (o.winner === 'A') up++
    else if (o.winner === 'B') up--
    if (Math.abs(up) > REGULATION_HOLES - played) { settledAt = o.holeNumber; break }
  }
  const extra = settledAt === null && played === REGULATION_HOLES && up === 0
  if (extra) {
    for (const o of inOrder) {
      if (o.holeNumber <= REGULATION_HOLES) continue
      if (o.winner === null) break
      played++
      thru = o.holeNumber
      if (o.winner === 'halved') continue
      up = o.winner === 'A' ? 1 : -1
      settledAt = o.holeNumber
      break
    }
  }
  const holesUp = Math.abs(up)
  const settled = settledAt !== null
  const remaining = Math.max(0, REGULATION_HOLES - played)
  const result = !settled ? null
    : settledAt! > REGULATION_HOLES ? `at ${ordinal(settledAt!)}` : marginLabel(holesUp, remaining)
  // Up and down, and whether it is over, count only finished holes — a hole
  // still to finish can swing it. "Thru" is the furthest hole with a result.
  const progress = extra && !settled
    ? thru === REGULATION_HOLES ? 'All square after 18' : `All square thru ${thru}`
    : extra ? `1 up thru ${thru}` : progressLabel(holesUp, thru, remaining)
  const unfinished = inOrder
    .filter(o => o.holeNumber < thru && o.winner === null && (settledAt === null || o.holeNumber < settledAt))
    .map(o => o.holeNumber)
  return {
    leader: up === 0 ? null : up > 0 ? 'A' : 'B',
    up: holesUp,
    played,
    thru,
    unfinished,
    settled,
    extra,
    result,
    progress,
  }
}

/**
 * Which course hole each extra hole is played off, as the players chose it
 * — extra hole number → course hole (`matchplay_matches.extra_holes`,
 * migration 061). Only the choices made are held; the rest follow.
 */
export type ExtraHolePlan = Readonly<Record<number, number>>

/** The stored object, tidied: 19–36 to 1–18, whole numbers, nothing else. Never null. */
export function parseExtraPlan(raw: unknown): ExtraHolePlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(k)
    if (!Number.isInteger(n) || n <= REGULATION_HOLES || n > MAX_CARD_HOLES) continue
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= REGULATION_HOLES) out[n] = v
  }
  return out
}

/**
 * The course hole an extra hole is played off. **The 19th is the 1st
 * unless the players chose another**, and each one after follows on from
 * the one before it — the 20th after a 19th played off the 10th is the
 * 11th — unless that one was chosen too.
 */
export function extraCourseHole(n: number, plan: ExtraHolePlan = {}): number {
  if (n <= REGULATION_HOLES) return n
  const chosen = plan[n]
  if (chosen) return chosen
  return n === REGULATION_HOLES + 1 ? 1 : (extraCourseHole(n - 1, plan) % REGULATION_HOLES) + 1
}

/** The plan with one extra hole's course hole chosen. */
export function withExtraHole(plan: ExtraHolePlan, n: number, courseHole: number): ExtraHolePlan {
  return { ...plan, [n]: courseHole }
}

/**
 * The whole card: the eighteen, and the extra holes a level match has
 * reached — each played off its course hole (`extraCourseHole`), shots and
 * all, as the round gave them — with the next one added for as long as the match is still
 * level and every hole so far is finished.
 */
export function playCard(
  holes: readonly CardHole[], a: CardSide, b: CardSide,
  scores: CardScores, concessions: CardConcessions,
  plan: ExtraHolePlan = {},
): { holes: CardHole[]; outcomes: HoleOutcome[]; state: CardState } {
  const base = [...holes].sort((x, y) => x.holeNumber - y.holeNumber).slice(0, REGULATION_HOLES)
  const list = [...base]
  for (;;) {
    const outcomes = holeOutcomes(list, a, b, scores, concessions)
    const state = cardState(outcomes)
    const allIn = outcomes.every(o => o.winner !== null)
    if (!state.extra || state.settled || !allIn || list.length >= MAX_CARD_HOLES || base.length < REGULATION_HOLES) {
      return { holes: list, outcomes, state }
    }
    const n = list.length + 1
    const from = base[extraCourseHole(n, plan) - 1]
    list.push({ ...from, holeNumber: n })
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
  if (!state.settled || !winnerId || !state.result) return false
  if (stored.winner === winnerId && stored.result === state.result) return false
  return stored.winner === null || organiser
}

/**
 * Why a finalised match may not be reopened, or null when it may: the match
 * its winner went on to has a result, or a score on its card. Reopening
 * takes the winner back out of that match, so it would undo theirs too
 * (Ross, 26 Oct 2026).
 */
export function reopenBlocked(nextRound: string, nextDecided: boolean, nextScored: boolean): string | null {
  if (nextDecided) return `The ${nextRound} match this fed already has a result, so this one can no longer be reopened.`
  if (nextScored) return `Scores are already in for the ${nextRound} match this fed, so this one can no longer be reopened.`
  return null
}
