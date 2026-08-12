// Deciding a knockout match from the cards.
//
// A bracket round can be linked to a round of golf, and told how a match is
// settled. Once the cards are in, the winner follows from them — nobody taps
// a name.
//
// Seven ways, and they fall into two shapes that behave quite differently:
//
//   **hole by hole** — stableford matchplay, strokes matchplay gross and
//   nett. The match is won when somebody is more holes up than there are
//   holes left, which is why "3&2" is a real result and a total is not: the
//   last two holes were never played.
//
//   **the whole card** — total stableford, total strokes gross and nett, and
//   total quota. Nothing is settled until both cards are complete, because
//   any hole left can still change the answer.
//
// **The quota scale is not chosen here either.** `lib/quota.ts` owns the table
// and the target, and *which* scale is the trip's own answer — the Quota
// leaderboard is asked when it is created. A link may override it for the
// knockout alone, which is what `RoundLink.quotaScale` is; this file is handed
// whichever won.
//
// **A pairing reads as one card.** Every method builds a per-hole card for
// each side first — for a singles draw that is simply the player's own — so
// nothing below has to ask how many people are on a side. Better ball is the
// rule, and it comes from lib/teamScoring.ts rather than being restated here.
// Quota is the one exception, and says why at the point it makes it.
//
// **A halved match is left halved.** In a knockout somebody has to go
// through, but the cards did not say who, and inventing an answer would be
// putting a name on a result nobody played. The tile says All Square and
// whoever is there records who went through.
//
// Pure. No I/O, no React. See scripts/test-match-decision.ts.

import { shotsReceived } from './handicap'
import { bestOnHole, type ScoringBasis } from './teamScoring'
import {
  type QuotaScale, DEFAULT_QUOTA_SCALE, parseQuotaScale, quotaPoints, quotaTarget,
} from './quota'

// ─── The methods ───────────────────────────────────────────────

export type MatchDecision =
  | 'stableford_match'
  | 'stableford_total'
  | 'strokes_match_gross'
  | 'strokes_match_nett'
  | 'strokes_total_gross'
  | 'strokes_total_nett'
  | 'quota_total'

export const MATCH_DECISIONS: {
  key: MatchDecision
  label: string
  hint: string
}[] = [
  { key: 'stableford_match', label: 'Stableford matchplay',
    hint: 'More points on the hole wins the hole.' },
  { key: 'stableford_total', label: 'Total Stableford points',
    hint: 'The higher points total over the round.' },
  { key: 'strokes_match_gross', label: 'Strokes matchplay — gross',
    hint: 'Fewer shots on the hole wins the hole. No handicaps.' },
  { key: 'strokes_match_nett', label: 'Strokes matchplay — nett',
    hint: 'The same, with the difference in handicaps given on the stroke index.' },
  { key: 'strokes_total_gross', label: 'Total strokes — gross',
    hint: 'The lower gross score over the round.' },
  { key: 'strokes_total_nett', label: 'Total strokes — nett',
    hint: 'The lower nett score, each off their own full course handicap.' },
  { key: 'quota_total', label: 'Total quota',
    hint: 'Quota is 36 minus your course handicap. Beat it by most.' },
]

export const DEFAULT_MATCH_DECISION: MatchDecision = 'stableford_match'

export function decisionOf(v: unknown): MatchDecision | null {
  const found = MATCH_DECISIONS.find(m => m.key === v)?.key
  if (found) return found
  // The two quota methods that used to be separate are one method and a
  // scale now. A link stored under either old name is still a real link.
  return legacyScale(v) ? 'quota_total' : null
}

/** The scale an older, scale-in-the-method link was naming. */
function legacyScale(v: unknown): QuotaScale | null {
  if (v === 'quota_liverpool') return 'liverpool'
  if (v === 'quota_chicago') return 'chicago'
  return null
}

export function decisionLabel(m: MatchDecision): string {
  return MATCH_DECISIONS.find(d => d.key === m)?.label ?? 'Matchplay'
}

/** Whether this method earns quota points, and so needs a scale. */
export function isQuota(m: MatchDecision): boolean {
  return m === 'quota_total'
}

/** Whether this method is settled hole by hole rather than over the whole card. */
export function isHoleByHole(m: MatchDecision): boolean {
  return m === 'stableford_match'
    || m === 'strokes_match_gross'
    || m === 'strokes_match_nett'
}

/** Whether lower is better in this method's units. */
function lowerWins(m: MatchDecision): boolean {
  return m === 'strokes_match_gross' || m === 'strokes_match_nett'
    || m === 'strokes_total_gross' || m === 'strokes_total_nett'
}

/** What a margin is counted in, for the wording. */
function unit(m: MatchDecision, n: number): string {
  const word = lowerWins(m) ? 'shot' : 'point'
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// ─── What it reads ─────────────────────────────────────────────

/**
 * One player's hole, with the course already resolved against them.
 *
 * `par` and `strokeIndex` are the **effective** ones — a woman's card where
 * the club publishes one. Resolving that here would mean this module knowing
 * about gender, and there is already one copy of that rule in
 * lib/boardRows.ts. The caller applies it on the way in.
 *
 * `points` is Stableford at the player's own full course handicap, which is
 * what the Postgres trigger wrote. No allowance is applied anywhere in this
 * file: a knockout has no competition allowance — see lib/handicapAllowance.ts.
 */
export type PlayerHole = {
  playerId: string
  holeNumber: number
  /** Null where the hole has not been played, or was picked up. */
  gross: number | null
  points: number
  par: number
  strokeIndex: number
  noReturn: boolean
}

/** One side of a match: a player, or the two players of a pairing. */
export type MatchSide = {
  /** The id the bracket knows this side by — a player id, or a team id. */
  id: string
  playerIds: string[]
}

export type MatchInput = {
  method: MatchDecision
  a: MatchSide
  b: MatchSide
  holes: readonly PlayerHole[]
  /** Full course handicap per player for this round. */
  handicapOf: ReadonlyMap<string, number>
  /** How many holes the round is over. */
  holeCount?: number
  /**
   * The scale a quota is earned on, for the one method that earns any.
   *
   * Resolved by the caller — the link's own override if it has one, otherwise
   * the trip's Quota board, otherwise the default. This module is handed the
   * answer rather than working it out, because "which scale is this trip on"
   * is a question about the trip's leaderboards and this file knows nothing
   * about those. See lib/matchResults.ts.
   */
  quotaScale?: QuotaScale
}

// ─── What it answers ───────────────────────────────────────────

export type MatchState = {
  /** Who is ahead, or null when nothing separates them. */
  leaderId: string | null
  /** How far — holes for a hole-by-hole method, the method's units otherwise. */
  margin: number
  /** Holes both sides have completed. */
  holesPlayed: number
  /**
   * True once the cards cannot change the answer.
   *
   * That is what the bracket writes on, and it is why a hole-by-hole method
   * can settle on the sixteenth while a total cannot settle until both cards
   * are complete.
   */
  settled: boolean
  /**
   * Settled, complete, and level.
   *
   * Never resolved here. A knockout needs somebody to go through and the
   * cards did not say who, so this is a question put back to the people who
   * were there rather than an answer invented from a seeding.
   */
  halved: boolean
  /** "3&2", "2 up", "by 4 points" — what goes on the tile once it is over. */
  result: string | null
  /** "2 up thru 14", "All square thru 9" — what it says while it is going on. */
  progress: string
}

const NOTHING: MatchState = {
  leaderId: null, margin: 0, holesPlayed: 0,
  settled: false, halved: false, result: null, progress: 'Not started',
}

/**
 * Read a match off the cards.
 *
 * Returns `NOTHING` for a match nobody has started, which reads on a tile as
 * an ordinary undecided match — the same as a match whose round has not been
 * linked at all.
 */
export function readMatch(input: MatchInput): MatchState {
  const holeCount = input.holeCount ?? 18
  const cards = {
    a: sideCard(input, input.a),
    b: sideCard(input, input.b),
  }
  if (cards.a.holes.size === 0 && cards.b.holes.size === 0) return NOTHING

  return isHoleByHole(input.method)
    ? holeByHole(input.method, cards.a, cards.b, holeCount)
    : overTheCard(input.method, cards.a, cards.b, holeCount)
}

// ─── One side, as one card ─────────────────────────────────────

type Card = {
  id: string
  /** Hole number → the side's figure on it, in this method's units. */
  holes: Map<number, number>
  /**
   * Taken off the total before comparing. Quota only — everything else is 0.
   * Kept as an offset rather than folded into the holes so a per-hole figure
   * stays a per-hole figure.
   */
  target: number
  /** True when every hole of the round has a figure. */
  complete: boolean
}

/**
 * The shots a player receives in this match.
 *
 * **A matchplay handicap is a difference.** The lowest course handicap in the
 * match plays off scratch and everybody else receives the difference, on the
 * stroke index — which is the rule for a singles match and a four-ball alike,
 * and is why this is worked out across all four players rather than per side.
 *
 * The *total* methods do not use it: those are two cards compared, each off
 * its own full handicap, exactly as a strokeplay board reads them.
 */
function receivedIn(input: MatchInput, playerId: string): number {
  const own = input.handicapOf.get(playerId) ?? 0
  if (input.method !== 'strokes_match_nett') return own
  const inMatch = [...input.a.playerIds, ...input.b.playerIds]
    .map(id => input.handicapOf.get(id) ?? 0)
  return own - Math.min(...inMatch)
}

/**
 * One side's card, in the units the method compares.
 *
 * A pairing's is the better ball of its two members, hole by hole, using the
 * same rule a team board uses. Quota is the exception and is handled by
 * `quotaCard` — a quota is a target for a whole round, so there is no better
 * of two on a single hole to take.
 */
function sideCard(input: MatchInput, side: MatchSide): Card {
  const holeCount = input.holeCount ?? 18
  if (isQuota(input.method)) return quotaCard(input, side, holeCount)

  const basis: ScoringBasis = lowerWins(input.method) ? 'strokes' : 'stableford'
  const holes = new Map<number, number>()

  for (let n = 1; n <= holeCount; n++) {
    const values: number[] = []
    for (const playerId of side.playerIds) {
      const h = input.holes.find(x => x.playerId === playerId && x.holeNumber === n)
      if (!h) continue
      const v = valueOf(input, h)
      if (v !== null) values.push(v)
    }
    if (values.length > 0) holes.set(n, bestOnHole(values, basis, 1)[0])
  }

  return { id: side.id, holes, target: 0, complete: holes.size >= holeCount }
}

/** What one player's hole is worth, or null where it cannot be counted. */
function valueOf(input: MatchInput, h: PlayerHole): number | null {
  if (input.method === 'stableford_match' || input.method === 'stableford_total') {
    // A no-return is nought points, which is what the trigger already wrote —
    // and nought points is a real score, not a missing one. It loses the hole
    // rather than voiding it.
    return h.noReturn ? 0 : h.points
  }
  // Every strokes method needs a gross to work from. A hole picked up has no
  // number of shots that can honestly be compared, so the side simply has no
  // figure on it — which stops a strokes total settling at all.
  if (h.gross == null || h.noReturn) return null
  if (input.method === 'strokes_match_nett') {
    return h.gross - shotsReceived(receivedIn(input, h.playerId), h.strokeIndex)
  }
  if (input.method === 'strokes_total_nett') {
    return h.gross - shotsReceived(input.handicapOf.get(h.playerId) ?? 0, h.strokeIndex)
  }
  return h.gross
}

/**
 * A side's quota card.
 *
 * **A pairing takes the better of its two members' own quota scores**, rather
 * than a hole-by-hole better ball like every other method. A quota is a
 * target for a whole round — 36 less your handicap — so there is no share of
 * it belonging to the ninth hole and nothing to take the better of there.
 * Best card counts is what a society does with it, and it is the only reading
 * that does not invent an arithmetic nobody plays.
 *
 * The card that comes back is the winning member's own, so the holes on it
 * are real holes rather than a composite of two players.
 */
function quotaCard(input: MatchInput, side: MatchSide, holeCount: number): Card {
  const scale = input.quotaScale ?? DEFAULT_QUOTA_SCALE

  const cards = side.playerIds.map(playerId => {
    const holes = new Map<number, number>()
    for (const h of input.holes) {
      if (h.playerId !== playerId) continue
      if (h.gross == null || h.noReturn) continue
      holes.set(h.holeNumber, quotaPoints(h.gross, h.par, scale))
    }
    const target = quotaTarget(input.handicapOf.get(playerId) ?? 0)
    return { id: side.id, holes, target, complete: holes.size >= holeCount }
  })

  if (cards.length === 0) {
    return { id: side.id, holes: new Map(), target: 0, complete: false }
  }
  // Best card counts — measured against its own quota, which is the whole
  // point of the format
  return cards.reduce((best, c) => (total(c) > total(best) ? c : best))
}

/** A card's figure: what it scored, less what it had to beat. */
function total(card: Card): number {
  let sum = 0
  for (const v of card.holes.values()) sum += v
  return sum - card.target
}

// ─── Hole by hole ──────────────────────────────────────────────

function holeByHole(
  method: MatchDecision, a: Card, b: Card, holeCount: number,
): MatchState {
  const lower = lowerWins(method)
  let up = 0            // positive means a is ahead
  let played = 0

  for (let n = 1; n <= holeCount; n++) {
    const va = a.holes.get(n)
    const vb = b.holes.get(n)
    // A hole only one side has a figure on is not yet a hole of the match.
    // The exception is a strokes hole one side picked up: they have no
    // figure, and losing the hole is exactly what picking up means.
    if (va === undefined && vb === undefined) continue
    played++
    if (va === undefined) { up -= 1; continue }
    if (vb === undefined) { up += 1; continue }
    if (va === vb) continue
    const aWins = lower ? va < vb : va > vb
    up += aWins ? 1 : -1
  }

  const holesUp = Math.abs(up)
  const remaining = Math.max(0, holeCount - played)
  const leaderId = up === 0 ? null : up > 0 ? a.id : b.id
  // Over when it cannot change: somebody is further up than there are holes
  // left, **or** there are no holes left at all. That second clause is not
  // implied by the first — a match all square on the eighteenth green is
  // finished, and `0 > 0` is false.
  const settled = remaining === 0 || holesUp > remaining

  return {
    leaderId,
    margin: holesUp,
    holesPlayed: played,
    settled,
    halved: settled && holesUp === 0,
    result: settled ? marginLabel(holesUp, remaining) : null,
    progress: progressLabel(holesUp, played, remaining),
  }
}

/**
 * "3&2", "2 up", "1 up" — how a match that is over is described.
 *
 * The ampersand form names the holes that were never played, so it only
 * applies when the match ended early. A match that went the distance is
 * simply so many up.
 */
function marginLabel(holesUp: number, remaining: number): string {
  if (holesUp === 0) return 'Halved'
  return remaining > 0 ? `${holesUp}&${remaining}` : `${holesUp} up`
}

function progressLabel(holesUp: number, played: number, remaining: number): string {
  if (played === 0) return 'Not started'
  const thru = remaining === 0 ? 'thru 18' : `thru ${played}`
  return holesUp === 0 ? `All square ${thru}` : `${holesUp} up ${thru}`
}

// ─── Over the whole card ───────────────────────────────────────

function overTheCard(
  method: MatchDecision, a: Card, b: Card, holeCount: number,
): MatchState {
  const lower = lowerWins(method)
  const ta = total(a)
  const tb = total(b)
  const played = Math.min(a.holes.size, b.holes.size)
  const complete = a.complete && b.complete

  const diff = lower ? tb - ta : ta - tb     // positive means a is ahead
  const leaderId = diff === 0 ? null : diff > 0 ? a.id : b.id
  const margin = Math.abs(diff)

  return {
    leaderId,
    margin,
    holesPlayed: played,
    // Nothing is settled while a hole is still out: on a total, the last
    // hole can turn it over however big the gap looks.
    settled: complete,
    halved: complete && margin === 0,
    result: complete ? (margin === 0 ? 'Halved' : `by ${unit(method, margin)}`) : null,
    progress: played === 0
      ? 'Not started'
      : margin === 0
        ? `Level thru ${played}`
        : `${unit(method, margin)} thru ${played}`,
  }
}

// ─── Linking a bracket round to a round of golf ────────────────

/**
 * One bracket round, and the golf it is played over.
 *
 * `bracketRound` is `matchplay_matches.round_number` — 1 is the first round
 * played, whatever it is called. Named by number rather than by "Quarter-
 * Final" because a bracket gains and loses names as the field changes size,
 * and a link that survived a redraw pointing at a round that no longer exists
 * would be worse than one that plainly does not.
 */
export type RoundLink = {
  bracketRound: number
  /** `rounds.id`. */
  roundId: string
  decidedBy: MatchDecision
  /**
   * The quota scale this link overrides the trip's with. `quota_total` only.
   *
   * Absent means the trip's own — the Quota leaderboard's, if it runs one.
   * That is the point of it being an override rather than a setting: a trip
   * playing Liverpool all week does not have to say so twice, and the one
   * knockout somebody wants on Chicago says so once, here.
   */
  quotaScale?: QuotaScale
}

export function parseRoundLinks(raw: unknown): RoundLink[] {
  if (!Array.isArray(raw)) return []
  const out: RoundLink[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    const bracketRound = Number(r.bracketRound)
    const decidedBy = decisionOf(r.decidedBy)
    if (!Number.isInteger(bracketRound) || bracketRound < 1) continue
    if (typeof r.roundId !== 'string' || !r.roundId) continue
    if (!decidedBy) continue

    // The scale rides on the link, and only where the method earns any. It
    // used to be part of the method itself — `quota_liverpool` beside
    // `quota_chicago` — which put the trip's choice of scale in two places
    // with nothing keeping them in step. Those older links read back as the
    // one method carrying the scale they named.
    const scale = decidedBy === 'quota_total'
      ? parseQuotaScale(r.quotaScale) ?? legacyScale(r.decidedBy)
      : null
    // One link per bracket round. A second is not a second competition, it is
    // a contradiction about how the same matches are decided.
    if (out.some(l => l.bracketRound === bracketRound)) continue
    out.push({
      bracketRound, roundId: r.roundId, decidedBy,
      ...(scale ? { quotaScale: scale } : {}),
    })
  }
  return out.sort((a, b) => a.bracketRound - b.bracketRound)
}

export function linkFor(
  links: readonly RoundLink[], bracketRound: number,
): RoundLink | null {
  return links.find(l => l.bracketRound === bracketRound) ?? null
}
