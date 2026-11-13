/**
 * The shape of an event, read from its golf — the only copy of the rule
 * (Ross, 12–13 Nov 2026, D77–D90; docs/leaderboards.md, "The platform names
 * the leaderboard").
 *
 * An organiser never sets up a "leaderboard". They give the event a Format —
 * its rounds, each with a format — and the platform reads it: which board
 * leads, what it is called, and whether its rounds are rounds or sessions.
 *
 *   any Matches round                      → the Overall, sessions
 *   stroke only, one format                → a league board, rounds
 *   stroke only, formats that fit one
 *     board (same scoring, every player
 *     keeps their own card)                → ask: one total, or points per round
 *   stroke only, anything else (Stableford
 *     beside strokes, say)                 → the Overall, sessions
 *
 * Ross, 13 Nov 2026: "Any rounds that don't fit neatly on a leaderboard get
 * an overall, incl mixing stableford and strokes."
 *
 * **It reads formats and tags, never the field.** An empty field gives the
 * same answer as a full one; `test:event-shape` holds it.
 *
 * **The rule proposes; what is stored is the truth.** `eventShape` runs when
 * an event is made and when a round's format is changed. Every screen reads
 * `storedShape` instead, so an event made before this — an Overall over
 * identical Stableford sessions, say — reads exactly as it always has.
 *
 * Pure.
 */

import {
  type Leaderboard, type Scoring, dayBoardFor, hasMatchplay, isMatchTally, isTagBoard, boardTitle,
} from './leaderboards'
import {
  type SessionFormat, type OverallRanks, formatOfBoard, isSessionBoard, overallOf, sessionBoardFor,
} from './sessions'
import { allowanceOf } from './handicapAllowance'

// ─── The rule ──────────────────────────────────────────────────

/** Which board leads an event. `ask` is D90: stroke formats that could go either way. */
export type MainBoard = 'league' | 'overall' | 'ask'

/** What an event's rounds are called on screen. */
export type RoundUnit = 'Round' | 'Session'

/** Why the rule chose what it chose — the read-back card's sentence is keyed on it. */
export type ShapeReason =
  /** Nothing set yet — every round TBC, or none. */
  | 'empty'
  /** Every round the same stroke format, allowance aside. */
  | 'same'
  /** Every round Matches. */
  | 'matches'
  /** Matches beside stroke rounds. */
  | 'matches_mixed'
  /** Stroke formats that could make one total or pay per round. */
  | 'different'
  /** Stroke rounds scored different ways — Stableford beside strokes. */
  | 'mixed_scoring'
  /** A round with no card of each player's own, so no individual total reads it. */
  | 'shared_cards'

export type EventShape = {
  main: MainBoard
  unit: RoundUnit
  /** What an Overall ranks, were there one. */
  ranks: OverallRanks
  /** Two tags facing off over Matches — the ticker (D50). */
  faceOff: boolean
  reason: ShapeReason
}

/**
 * What the rule is handed. Deliberately the formats and the number of tags
 * and nothing else: no players, no field size, no course.
 */
export type ShapeInput = {
  /** One a round, in running order. Null is Format TBC, which the rule ignores. */
  formats: readonly (SessionFormat | null)[]
  /** How many tags the event has. Fewer than two is none to speak of. */
  tags: number
}

/**
 * A format with its allowance taken off — what two rounds are compared on.
 * D86: a round played off 90% beside one off 100% is the same format at a
 * different allowance, which a league board already holds per round.
 */
export function shapeKey(f: SessionFormat): string {
  if (f.kind === 'matches') return `m:${f.match}`
  return `s:${f.audience}:${f.scoring}:${f.audience === 'team' ? f.teamFormat ?? '-' : '-'}`
}

/**
 * Whether every player has a card of their own in this format — what an
 * individual total needs from every round. Every stroke format built today
 * keeps one (a better-ball team is its players' own cards, best taken per
 * hole); a match does not, its card living on the match.
 */
export function givesOwnCards(f: SessionFormat): boolean {
  return f.kind === 'stroke'
}

/** The scoring a stroke format is played on; null for Matches. */
function scoringOf(f: SessionFormat): Scoring | null {
  return f.kind === 'stroke' ? f.scoring : null
}

/** The rule. */
export function eventShape(input: ShapeInput): EventShape {
  const formats = input.formats.filter((f): f is SessionFormat => f != null)
  const twoTags = input.tags === 2
  const ranks: OverallRanks = input.tags >= 2 ? 'tags' : 'individuals'
  const hasMatches = formats.some(f => f.kind === 'matches')
  const shape = (main: MainBoard, reason: ShapeReason): EventShape => ({
    main,
    unit: main === 'overall' ? 'Session' : 'Round',
    ranks,
    faceOff: main === 'overall' && twoTags && hasMatches,
    reason,
  })

  if (formats.length === 0) return shape('league', 'empty')
  if (hasMatches) {
    return shape('overall', formats.every(f => f.kind === 'matches') ? 'matches' : 'matches_mixed')
  }
  const keys = new Set(formats.map(shapeKey))
  if (keys.size === 1) return shape('league', 'same')
  if (new Set(formats.map(scoringOf)).size > 1) return shape('overall', 'mixed_scoring')
  if (!formats.every(givesOwnCards)) return shape('overall', 'shared_cards')
  return shape('ask', 'different')
}

/** D90's two answers to `ask`. */
export type ShapeAnswer = 'one_total' | 'per_round'

/** The shape once `ask` is answered — any other shape as it was. */
export function answeredShape(shape: EventShape, answer: ShapeAnswer | null): EventShape {
  if (shape.main !== 'ask' || !answer) return shape
  const main = answer === 'one_total' ? 'league' : 'overall'
  return { ...shape, main, unit: main === 'overall' ? 'Session' : 'Round' }
}

// ─── Reading what is stored ────────────────────────────────────

/** A stored event's shape: whatever its boards already say. */
export type StoredShape = { main: 'league' | 'overall' | 'knockout'; unit: RoundUnit }

/**
 * What an event is, from its boards. An Overall board means the Overall,
 * whatever its sessions play — never re-derived from the formats, or an event
 * made before the rule would change under the people playing it.
 */
export function storedShape(boards: readonly Leaderboard[]): StoredShape {
  if (overallOf(boards)) return { main: 'overall', unit: 'Session' }
  // The tag tally and a tags board sit beside a bracket; neither makes it a league.
  const league = boards.some(b => b.competition === 'league' && !isMatchTally(b) && !isTagBoard(b))
  if (!league && hasMatchplay(boards)) {
    return { main: 'knockout', unit: 'Round' }
  }
  return { main: 'league', unit: 'Round' }
}

/**
 * Each round's format as the event's boards say it — what the rule is handed
 * when a stored event's format changes, and how every stored event is put
 * through it in the tests. A round's own session board first, then a board
 * scoped to that round alone, then the first board covering the whole event;
 * none of them is Format TBC. On an Overall only the session board counts. Tags boards are never a round's format — they
 * rank the event's sides from cards played in some other format.
 */
export function roundFormatsOf(
  boards: readonly Leaderboard[], roundIds: readonly string[],
): (SessionFormat | null)[] {
  const plain = (b: Leaderboard) => b.competition === 'league' && !isTagBoard(b) && !isMatchTally(b)
  const whole = boards.find(b => plain(b) && !isSessionBoard(b) && !(b.roundIds?.length))
  // On an Overall a round's format is its session board and nothing else: a
  // secondary covering every round ranks them, it does not set what they play.
  const overall = overallOf(boards) != null
  return roundIds.map(id => {
    const session = sessionBoardFor(boards, id)
    if (overall && !session) return null
    const day = session ? null : dayBoardFor(boards.filter(plain), id)
    const covering = session ?? day
      ?? boards.find(b => plain(b) && !isSessionBoard(b) && (b.roundIds?.includes(id) ?? false))
      ?? whole
    if (!covering) return null
    const f = formatOfBoard(covering)
    if (!f) return null
    // The round's own allowance where the board holds one (a league round's gear).
    const { handicapAllowance: _board, ...rest } = f
    void _board
    const pct = allowanceOf(covering, id)
    return (pct !== 100 ? { ...rest, handicapAllowance: pct } : rest) as SessionFormat
  })
}

// ─── Naming ────────────────────────────────────────────────────

/**
 * The boards the leaderboard counts when it decides whether a board stands
 * alone: never a session's own board (reached through the Overall's switch)
 * and never the tag tally, which is drawn under the bracket.
 */
function shownBoards(boards: readonly Leaderboard[]): Leaderboard[] {
  return boards.filter(b => !isSessionBoard(b) && !isMatchTally(b))
}

/**
 * The board that leads a league event — the first board, when it is a league
 * board covering every round (`primary` in lib/leaderboards.ts is the first
 * board; this is the same board, and only when it can be called the main one).
 */
export function mainLeagueBoard(boards: readonly Leaderboard[]): Leaderboard | null {
  const first = shownBoards(boards)[0]
  if (!first || first.competition !== 'league' || (first.roundIds?.length ?? 0) > 0) return null
  return overallOf(boards) ? null : first
}

/**
 * What a board is called on screen (D79): the Overall is "Overall"; the board
 * leading a league is "Leaderboard" when it is the only one and "Primary"
 * once a secondary sits beside it; every other board keeps its own title.
 */
export function boardName(lb: Leaderboard, boards: readonly Leaderboard[]): string {
  if (lb.competition === 'overall') return 'Overall'
  const main = mainLeagueBoard(boards)
  if (main && lb.id === main.id) return shownBoards(boards).length > 1 ? 'Primary' : 'Leaderboard'
  return boardTitle(lb)
}

/** "Round 3", "Session 2", or the name a session was given. */
export function unitLabel(unit: RoundUnit, number: number, name?: string | null): string {
  return name?.trim() || `${unit} ${number}`
}
