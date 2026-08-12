// The bracket, read against the cards.
//
// `lib/matchDecision.ts` knows how a match is decided and nothing about this
// app: hand it two sides, some holes and a handicap each, and it answers. This
// is the half that gets it those — turning the trip's `RowContext` into the
// shape it asks for, one match at a time.
//
// Kept apart for the reason the two halves usually are: the arithmetic of a
// match is worth testing exhaustively and would be miserable to test through a
// database, while the assembly is dull and only has to be right once.
//
// Pure. No I/O — the page fetches, `buildRowContext` assembles, this reads.

import {
  type RowContext, type RowHole, effectivePar, effectiveSI,
} from './boardRows'
import { FULL_ALLOWANCE, allowedHandicap } from './handicapAllowance'
import {
  type MatchState, type MatchSide, type PlayerHole, type RoundLink,
  readMatch, linkFor,
} from './matchDecision'
import type { ProgressMatch } from './matchplayProgress'

/** A match as the cards have it. */
export type MatchReading = {
  matchId: string
  /** The bracket round's link this was read through. */
  link: RoundLink
  state: MatchState
  /**
   * The bracket already records a winner, and it is not the one the cards
   * give.
   *
   * Never resolved automatically. A recorded result is somebody's decision —
   * either this module's own from an earlier visit, or a correction typed in
   * over the top of it — and a card edited afterwards is not grounds for
   * silently overturning it. The tile says the two disagree and leaves it to
   * a person, which is the only honest thing to do with a contradiction.
   */
  disagrees: boolean
}

export type ReadBracketInput = {
  matches: readonly ProgressMatch[]
  links: readonly RoundLink[]
  ctx: RowContext
  /**
   * The players behind a side.
   *
   * A singles draw seats player ids, so a side is its own single member. A
   * pairs draw seats team ids, and this is what turns one into its two
   * players. Supplied by the caller because the memberships are already on
   * the page — see lib/teamSets.ts.
   */
  playersOf: (sideId: string) => string[]
}

/**
 * Every linked match, read off the cards. Keyed by match id.
 *
 * A match whose bracket round has no link is simply absent — it is decided by
 * hand, the way every match was before linking existed. So is a bye, which
 * was never played, and a match still waiting on the round below it.
 */
export function readBracket(input: ReadBracketInput): Map<string, MatchReading> {
  const out = new Map<string, MatchReading>()
  if (input.links.length === 0) return out

  const holeById = new Map(input.ctx.holes.map(h => [h.id, h]))
  const genderOf = new Map(input.ctx.players.map(p => [p.id, p.gender]))
  const ownHandicap = new Map(input.ctx.players.map(p => [p.id, p.handicap]))

  for (const match of input.matches) {
    const link = linkFor(input.links, match.round_number)
    if (!link) continue
    if (match.player_a_is_bye || match.player_b_is_bye) continue
    if (!match.player_a_id || !match.player_b_id) continue

    const a: MatchSide = { id: match.player_a_id, playerIds: input.playersOf(match.player_a_id) }
    const b: MatchSide = { id: match.player_b_id, playerIds: input.playersOf(match.player_b_id) }
    const playerIds = [...a.playerIds, ...b.playerIds]
    if (playerIds.length === 0) continue

    const holes: PlayerHole[] = []
    const handicapOf = new Map<string, number>()

    for (const playerId of playerIds) {
      handicapOf.set(playerId, courseHandicap(input.ctx, link.roundId, playerId, ownHandicap))
      const gender = genderOf.get(playerId) ?? 'M'
      for (const s of input.ctx.resolved) {
        if (s.playerId !== playerId || s.roundId !== link.roundId) continue
        const hole = holeById.get(s.holeId)
        if (!hole) continue
        holes.push(playerHole(s, hole, gender))
      }
    }

    const state = readMatch({
      method: link.decidedBy,
      a, b, holes, handicapOf,
      holeCount: holeCountOf(input.ctx, link.roundId, holeById),
    })

    out.set(match.id, {
      matchId: match.id,
      link,
      state,
      disagrees: !!match.winner_player_id
        && state.settled
        && !!state.leaderId
        && match.winner_player_id !== state.leaderId,
    })
  }
  return out
}

/** One resolved score, with the course read against the player holding it. */
function playerHole(
  s: RowContext['resolved'][number], hole: RowHole, gender: string,
): PlayerHole {
  return {
    playerId: s.playerId,
    holeNumber: s.holeNumber,
    gross: s.gross,
    points: s.points,
    par: effectivePar(hole, gender),
    strokeIndex: effectiveSI(hole, gender),
    noReturn: s.noReturn,
  }
}

/**
 * The course handicap a match is played off.
 *
 * The same figure a leaderboard would use, at the full allowance — a knockout
 * has none, and lib/handicapAllowance.ts says why. The unrounded course
 * handicap is preferred where the tee is known, exactly as `boardHandicap`
 * prefers it, so the draw and the boards never disagree about a player's
 * shots on the same afternoon.
 */
function courseHandicap(
  ctx: RowContext, roundId: string, playerId: string,
  own: ReadonlyMap<string, number | null>,
): number {
  const key = `${roundId}:${playerId}`
  const found = ctx.exactHcpFor?.get(key) ?? ctx.hcpFor.get(key) ?? own.get(playerId) ?? 0
  return allowedHandicap(found, FULL_ALLOWANCE)
}

/**
 * How many holes the round is over.
 *
 * Counted off the course rather than assumed to be eighteen, because "3&2"
 * and "is it over yet" are both arithmetic on the holes remaining. A round
 * whose course has no holes yet — a course added but not card-checked — gives
 * nought, and every match on it reads as not started, which is right.
 */
function holeCountOf(
  ctx: RowContext, roundId: string, holeById: ReadonlyMap<string, RowHole>,
): number {
  const courseIds = new Set<string>()
  for (const s of ctx.resolved) {
    if (s.roundId !== roundId) continue
    const hole = holeById.get(s.holeId)
    if (hole) courseIds.add(hole.course_id)
  }
  if (courseIds.size === 0) return 18
  return ctx.holes.filter(h => courseIds.has(h.course_id)).length
}

/** What the bracket should be told, given what the cards now say. */
export type PendingResult = {
  matchId: string
  winnerId: string
  result: string | null
}

/**
 * Matches the cards have settled that the bracket has not recorded.
 *
 * **Only ever an empty match.** A match already carrying a winner is left
 * exactly as it is, whoever put it there — which is what makes a correction
 * stick, and what stops the bracket rewriting itself every time somebody
 * opens it. The disagreement between a recorded winner and an edited card is
 * surfaced on the tile instead; it is not a write.
 *
 * A halved match produces nothing. Somebody has to go through and the cards
 * did not say who.
 */
export function pendingResults(
  matches: readonly ProgressMatch[],
  readings: ReadonlyMap<string, MatchReading>,
): PendingResult[] {
  const out: PendingResult[] = []
  for (const match of matches) {
    if (match.winner_player_id) continue
    const reading = readings.get(match.id)
    if (!reading?.state.settled) continue
    const winnerId = reading.state.leaderId
    if (!winnerId) continue        // halved — left for a person
    out.push({ matchId: match.id, winnerId, result: reading.state.result })
  }
  return out
}
