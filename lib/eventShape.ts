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
  type SessionFormat, type OverallRanks, type OverallRules, type SessionFeed,
  formatOfBoard, isSessionBoard, overallOf, sessionBoardFor, sessionBoard, overallBoard, feedFor,
  defaultMatchSlots, formatIssue,
} from './sessions'
import { allowanceOf } from './handicapAllowance'
import { nextSheetId, daySheetId } from './teamSets'

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
 * individual total needs from every round. A better-ball team is its
 * players' own cards, best taken per hole; **stroke foursomes is one ball a
 * pair (D88)**, and a match's card lives on the match.
 */
export function givesOwnCards(f: SessionFormat): boolean {
  return f.kind === 'stroke' && !(f.audience === 'team' && f.teamFormat === 'foursomes')
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
 * The boards the leaderboard draws as tabs, for deciding whether a board
 * stands alone: never the tag tally, which is drawn under the bracket, and
 * on an Overall never a session's own board (reached through its switch).
 * With no Overall a session's board is a day's own board like any other —
 * the leaderboard draws it beside the main one, so it is a secondary.
 */
function shownBoards(boards: readonly Leaderboard[]): Leaderboard[] {
  const overall = overallOf(boards) != null
  return boards.filter(b => !isMatchTally(b) && !(overall && isSessionBoard(b)))
}

/**
 * The board that leads a league event — the first board, when it is a league
 * board covering every round (`primary` in lib/leaderboards.ts is the first
 * board; this is the same board, and only when it can be called the main one).
 */
export function mainLeagueBoard(boards: readonly Leaderboard[]): Leaderboard | null {
  const first = shownBoards(boards)[0]
  if (!first || first.competition !== 'league' || (first.roundIds?.length ?? 0) > 0 || isSessionBoard(first)) return null
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

/**
 * What one of an event's rounds is called, from what is stored: on an
 * Overall it is a session, by its name or "Session n"; anywhere else
 * "Round n". The one place a screen asks.
 */
export function roundLabelOf(
  boards: readonly Leaderboard[], roundId: string, roundNumber: number,
  /** A league's round names (`LeagueSetup.roundNames`), where it has any. */
  roundNames?: Readonly<Record<string, string>> | null,
): string {
  const overall = overallOf(boards)
  return overall
    ? unitLabel('Session', roundNumber, overall.overall?.names?.[roundId])
    : unitLabel('Round', roundNumber, roundNames?.[roundId])
}

// ─── Creation: the read-back and the boards ────────────────────

/**
 * Why the platform chose the board it chose, as the Format step's read-back
 * card says it (D77) — one sentence, the event's own word for its rounds.
 */
export function shapeSentence(shape: EventShape, scoringLabel: string | null): string {
  switch (shape.reason) {
    case 'empty': return 'Pick Round 1’s format and the leaderboard follows from it.'
    case 'same': return scoringLabel
      ? `Every round plays ${scoringLabel}, so the rounds add up to a total.`
      : 'Every round plays the same format, so the rounds add up to a total.'
    case 'matches': return 'Your sessions are matches, so each one pays points to the Overall.'
    case 'matches_mixed': return 'Your sessions include matches, so each one pays points to the Overall.'
    case 'different': return shape.main === 'league'
      ? 'Your rounds play different formats. One total counts every round; each round’s own format gets a leaderboard beside it.'
      : shape.main === 'overall'
        ? 'Your rounds play different formats, so each one pays points to the Overall by finishing position.'
        : 'Your rounds play different formats. How should they count?'
    case 'mixed_scoring': return 'Your rounds are scored different ways, which don’t add up to one total, so each one pays points to the Overall.'
    case 'shared_cards': return 'Some rounds have no card of each player’s own, so each round pays points to the Overall.'
  }
}

/** One round as creation hands it over: its id (null while its venue is to be confirmed) and its format. */
export type CreationRound = {
  roundId: string | null
  format: SessionFormat | null
  name?: string
  /** A Matches session's count, where the organiser set one. */
  matches?: number
  /** Its feed into the Overall, where the organiser changed it. */
  feed?: SessionFeed
}

export type CreationBoards = {
  rounds: readonly CreationRound[]
  /** Answered: `ask` here reads as the Overall, the safe one of the two. */
  shape: EventShape
  ranks: OverallRanks
  /** How many the Overall ranks — the default points table's length. */
  entrants: number
  /** Named players so far — a Matches session's usual count. */
  fieldSize: number
  /** The league board's worst rounds dropped. */
  discard?: number
  secondaries: readonly Leaderboard[]
}

/** A league board in a stroke format — the Primary, or a round's own beside it. */
function strokeBoard(id: string, f: SessionFormat & { kind: 'stroke' }, extra: Partial<Leaderboard>): Leaderboard {
  const pct = f.handicapAllowance ?? 100
  return {
    id,
    audience: f.audience,
    competition: 'league',
    scoring: f.scoring,
    combine: 'total',
    ...(f.audience === 'team' ? { teamFormat: f.teamFormat ?? 'better_ball' } : {}),
    ...(f.audience === 'team' && (f.teamFormat ?? 'better_ball') === 'better_ball' && f.countingScores != null
      ? { countingScores: f.countingScores } : {}),
    ...(pct !== 100 ? { handicapAllowance: pct } : {}),
    ...extra,
  }
}

/**
 * The boards an event is made with, from its Format (D77): the rule's main
 * board first, then the secondaries. Pure — the wizard's save writes what
 * this returns and nothing else.
 *
 * · **league** — one board from Round 1's format, covering every round; a
 *   round played off another allowance keeps it as the board's per-round
 *   allowance (D86). Under D90's "one total" the board is each player's own
 *   total on Round 1's scoring, and a round in another format gets a board
 *   of its own beside it.
 * · **overall** — the Overall, a session board a round (none for TBC), as
 *   the sessions model has always stored them (lib/sessions.ts).
 */
export function boardsForCreation(o: CreationBoards): Leaderboard[] {
  const first = o.rounds.find(r => r.format)?.format ?? null
  if (o.shape.main === 'league') {
    if (!first || first.kind !== 'stroke') return [...o.secondaries]
    const differs = o.shape.reason === 'different'
    // "One total": each player's own card, on Round 1's scoring.
    const mainFormat: SessionFormat & { kind: 'stroke' } = differs
      ? { kind: 'stroke', audience: 'individual', scoring: first.scoring,
          ...(first.handicapAllowance != null ? { handicapAllowance: first.handicapAllowance } : {}) }
      : first
    const mainPct = mainFormat.handicapAllowance ?? 100
    const roundAllowances: Record<string, number> = {}
    const ownBoards: Leaderboard[] = []
    for (const r of o.rounds) {
      if (!r.roundId || !r.format || r.format.kind !== 'stroke') continue
      const pct = r.format.handicapAllowance ?? 100
      if (pct !== mainPct) roundAllowances[r.roundId] = pct
      if (differs && shapeKey(r.format) !== shapeKey(mainFormat)) {
        ownBoards.push(strokeBoard(`lb-round-${r.roundId}`, r.format, { roundIds: [r.roundId] }))
      }
    }
    const team = mainFormat.audience === 'team'
    const main = strokeBoard('lb-primary', mainFormat, {
      ...(team ? { teamSet: nextSheetId([...o.secondaries], { reserveMain: true }) } : {}),
      ...(Object.keys(roundAllowances).length > 0 ? { roundAllowances } : {}),
      ...(o.discard ? { discardWorst: o.discard } : {}),
    })
    return [main, ...ownBoards, ...o.secondaries]
  }

  // The Overall: a session a round.
  const rules: OverallRules = { ranks: o.ranks }
  const feeds: Record<string, SessionFeed> = {}
  const names: Record<string, string> = {}
  const slots: Record<string, number> = {}
  const sessions: Leaderboard[] = []
  for (const r of o.rounds) {
    if (!r.roundId) continue
    if (r.name?.trim()) names[r.roundId] = r.name.trim()
    if (!r.format) continue
    const board = sessionBoard(r.format, r.roundId, daySheetId(r.roundId))
    sessions.push(board)
    feeds[r.roundId] = feedFor({ ranks: o.ranks, ...(r.feed ? { feeds: { [r.roundId]: r.feed } } : {}) },
      r.roundId, board, o.entrants)
    if (r.format.kind === 'matches') slots[r.roundId] = r.matches ?? defaultMatchSlots(o.fieldSize, r.format.match)
  }
  if (Object.keys(feeds).length > 0) rules.feeds = feeds
  if (Object.keys(names).length > 0) rules.names = names
  if (Object.keys(slots).length > 0) rules.slots = slots
  return [overallBoard(rules), ...sessions, ...o.secondaries]
}

/**
 * Why the Format step cannot go on yet, or null. Round 1 always has a
 * format; every round a venue, unless it may be confirmed later — a
 * league's round may, a session may not, because its own board needs the
 * round it plays.
 */
export function formatStepIssue(
  rounds: readonly { courseId: string | null | undefined; format: SessionFormat | null; label: string; tbcVenue?: boolean }[],
  main: MainBoard,
): string | null {
  if (rounds.length === 0) return 'Add the first round.'
  if (!rounds[0].format) return `Pick ${rounds[0].label}’s format.`
  for (const r of rounds) {
    if (r.tbcVenue) {
      if (main !== 'league') return `${r.label} needs its venue — a session can’t be to be confirmed.`
      continue
    }
    if (!r.courseId) return `Pick a venue for ${r.label}.`
  }
  for (const r of rounds) {
    const issue = formatIssue(r.format)
    if (issue) return `${r.label}: ${issue}`
  }
  return null
}

// ─── A secondary over rounds it cannot read (D83, D87) ─────────

/**
 * The rounds a stroke board counts but cannot read: every Matches session in
 * its scope. A match card lives on the match — its own table, stopping when
 * the match is settled, a conceded hole without a score — so no stroke board
 * reads one. The board is never refused and the round never dropped from it;
 * it says so instead (Ross, 13 Nov 2026). Empty for anything that is not an
 * ordinary stroke board, a session's own included.
 */
export function unreadRounds(
  lb: Leaderboard, boards: readonly Leaderboard[], roundIds: readonly string[],
): string[] {
  if (lb.competition !== 'league' || isSessionBoard(lb)) return []
  const scope = lb.roundIds?.length ? roundIds.filter(id => lb.roundIds!.includes(id)) : roundIds
  // A board that is not foursomes itself cannot read a foursomes round
  // either: the pair's one ball is not either partner's own card (D88).
  const ownFoursomes = lb.audience === 'team' && lb.teamFormat === 'foursomes'
  const formats = roundFormatsOf(boards, scope)
  return scope.filter((id, i) => {
    if (sessionBoardFor(boards, id)?.competition === 'matches') return true
    const f = formats[i]
    return !ownFoursomes && !!f && f.kind === 'stroke' && f.audience === 'team' && f.teamFormat === 'foursomes'
  })
}

/**
 * The fact a board's line says about them — "Leaves out Session 2",
 * "Leaves out 3 sessions" — held to the facts line's length (28).
 */
export function unreadFact(names: readonly string[]): string | null {
  if (names.length === 0) return null
  const one = `Leaves out ${names[0]}`
  if (names.length === 1 && one.length <= 28) return one
  return `Leaves out ${names.length} session${names.length === 1 ? '' : 's'}`
}

/** The sentence the creation grid says under such a board. */
export function unreadSentence(title: string, names: readonly string[]): string | null {
  if (names.length === 0) return null
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${title} leaves out ${list}: ${names.length === 1 ? 'it has' : 'they have'} no card of each player’s own.`
}
