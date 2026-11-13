/**
 * Changing an event's golf after it is made — the only copy of what a
 * round's new format does to its boards (Ross, 13 Nov 2026, D89; stage 6 of
 * docs/format-first-plan.md).
 *
 * The organiser changes a round's format; the rule (lib/eventShape.ts) reads
 * the rounds as they would then be. Where that keeps the event's shape, the
 * change is made in place. Where it crosses — a league whose round becomes
 * Matches is now the Overall; an Overall whose sessions all play one stroke
 * format could be one total again — **the change asks first**, shows the
 * standings before and after (`mainStandings`), and **deletes nothing**:
 * the Overall arrives beside the boards already there, and goes leaving its
 * sessions' boards where they are (`withOverallOn` / `withOverallOff` as
 * built, lib/sessions.ts).
 *
 * Pure. The organiser's Formats page saves what this returns.
 */

import { type Leaderboard, isTagBoard, isMatchTally } from './leaderboards'
import {
  type SessionFormat, type OverallRanks,
  overallOf, overallBoard, sessionBoard, sessionBoardFor, withSessionFormat, withOverallOff, isSessionBoard,
} from './sessions'
import { eventShape, roundFormatsOf, shapeKey, mainLeagueBoard, storedShape } from './eventShape'
import { withRoundAllowance } from './handicapAllowance'
import { daySheetId, nextSheetId } from './teamSets'
import { buildRows, type RowContext, type BoardRow } from './boardRows'
import { overallRows } from './overallRows'

/** What a round's new format does to the event. */
export type FormatChange = {
  /** The boards with the change made. */
  boards: Leaderboard[]
  /**
   * Null: the event keeps its shape, saved at once. Otherwise it crosses and
   * is asked first — `to_overall` because a league cannot hold it, or
   * `to_league` because the rule would now make it one total.
   */
  crossing: 'to_overall' | 'to_league' | null
  /**
   * `to_league` only: the change made on the Overall as it stands — the
   * organiser may keep points per round, as an event made that way always
   * could (stored is the truth).
   */
  staying?: Leaderboard[]
}

/** A plain league board covering every round: what a league's rounds play unless one has its own. */
const plainWhole = (b: Leaderboard) =>
  b.competition === 'league' && !isSessionBoard(b) && !isTagBoard(b) && !isMatchTally(b) && !(b.roundIds?.length)

/** The boards made for a round's own format at creation or here — the only ones a format change replaces. */
const ownBoardId = (roundId: string) => `lb-round-${roundId}`

/** A league board's format fields set from a stroke format, everything else on it kept. */
function withStrokeFormat(lb: Leaderboard, f: SessionFormat & { kind: 'stroke' }, others: readonly Leaderboard[]): Leaderboard {
  const next: Leaderboard = { ...lb, audience: f.audience, scoring: f.scoring }
  delete next.teamFormat
  delete next.countingScores
  if (f.audience === 'team') {
    next.teamFormat = f.teamFormat ?? 'better_ball'
    if (next.teamFormat === 'better_ball' && f.countingScores != null) next.countingScores = f.countingScores
    if (!next.teamSet || next.teamSet === 'main') next.teamSet = nextSheetId(others.filter(b => b.id !== lb.id), { reserveMain: true })
  } else {
    delete next.teamSet
  }
  const pct = f.handicapAllowance ?? 100
  if (pct !== 100) next.handicapAllowance = pct
  else delete next.handicapAllowance
  return next
}

/** A round's own league board in a stroke format. */
function ownBoard(roundId: string, f: SessionFormat & { kind: 'stroke' }): Leaderboard {
  return withStrokeFormat({
    id: ownBoardId(roundId), audience: f.audience, competition: 'league', scoring: f.scoring, combine: 'total',
    roundIds: [roundId],
  }, f, [])
}

/**
 * A round's format changed — or, with null, made TBC (an Overall's session
 * only; a league round always plays something).
 */
export function changeRoundFormat(
  boards: readonly Leaderboard[],
  roundIds: readonly string[],
  roundId: string,
  format: SessionFormat | null,
  tags: number,
): FormatChange {
  const stored = storedShape(boards)
  const before = roundFormatsOf(boards, roundIds)
  const after = roundIds.map((id, i) => (id === roundId ? format : before[i]))
  const rule = eventShape({ formats: after, tags })

  // ── An Overall ──
  if (stored.main === 'overall') {
    const changed = withSessionFormat(boards, roundId, format, daySheetId(roundId))
    if (rule.main !== 'league') return { boards: changed, crossing: null }
    // Every session one stroke format: one total is offered, never forced.
    const off = withOverallOff(changed)
    const f = after.find(x => x != null)
    const hasMain = off.some(plainWhole)
    const main = !hasMain && f && f.kind === 'stroke'
      ? [withStrokeFormat({ id: 'lb-primary', audience: f.audience, competition: 'league', scoring: f.scoring, combine: 'total' }, f, off)]
      : []
    return { boards: [...main, ...off], crossing: 'to_league', staying: changed }
  }

  // ── A league ──
  if (rule.main === 'overall') {
    // The Overall arrives beside every board already there; each round
    // becomes a session in the format it plays (a TBC round none).
    const sessions = roundIds.flatMap((id, i) => {
      const f = after[i]
      return f && !sessionBoardFor(boards, id) ? [sessionBoard(f, id, daySheetId(id))] : []
    })
    let next: Leaderboard[] = [overallBoard({ ranks: rule.ranks as OverallRanks }), ...boards, ...sessions]
    // A round that already had a session board takes the new format.
    if (sessionBoardFor(boards, roundId)) next = withSessionFormat(next, roundId, format, daySheetId(roundId))
    return { boards: next, crossing: 'to_overall' }
  }

  if (!format || format.kind !== 'stroke') return { boards: [...boards], crossing: null }
  const main = mainLeagueBoard(boards) ?? boards.find(plainWhole) ?? null
  const rest = boards.filter(b => b.id !== ownBoardId(roundId))

  if (!main) {
    // No board covering every round yet: the round's format is its own board.
    return { boards: [...rest, ownBoard(roundId, format)], crossing: null }
  }
  const mainFormat = roundFormatsOf([main], [roundId])[0]
  const pct = format.handicapAllowance ?? 100
  if (rule.main === 'league') {
    // Every round one format: the main board plays it, and the boards made
    // for a round's own format go — they would only repeat it.
    const own = new Set(roundIds.map(ownBoardId))
    const kept = boards.filter(b => !own.has(b.id))
    if (mainFormat && shapeKey(mainFormat) === shapeKey(format)) {
      const basePct = main.handicapAllowance ?? 100
      const withPct = withRoundAllowance(main as unknown as Record<string, unknown>, roundId, pct === basePct ? null : pct) as unknown as Leaderboard
      return { boards: kept.map(b => (b.id === main.id ? withPct : b)), crossing: null }
    }
    // Every round now plays something other than the main board did: the
    // main board takes the format, keeping its own allowance.
    const keepPct = { ...format, handicapAllowance: main.handicapAllowance }
    return { boards: kept.map(b => (b.id === main.id ? withStrokeFormat(b, keepPct, kept) : b)), crossing: null }
  }
  // Formats that fit one total (D90): the round's own board beside the main one.
  if (mainFormat && shapeKey(mainFormat) === shapeKey(format)) {
    const basePct = main.handicapAllowance ?? 100
    const withPct = withRoundAllowance(main as unknown as Record<string, unknown>, roundId, pct === basePct ? null : pct) as unknown as Leaderboard
    return { boards: rest.map(b => (b.id === main.id ? withPct : b)), crossing: null }
  }
  return { boards: [...rest, ownBoard(roundId, format)], crossing: null }
}

// ─── Standings, before and after ──────────────────────────────

/** A row as the crossing sheet shows it. */
export type StandingRow = { place: number; name: string; total: number }

/**
 * The board an event is about, ranked — the Overall where there is one,
 * else the main league board. The top few, for the before-and-after sheet.
 */
export function mainStandings(boards: readonly Leaderboard[], ctx: RowContext, limit = 5): { title: string; rows: StandingRow[] } {
  const overall = overallOf(boards)
  const main = overall ?? mainLeagueBoard(boards) ?? boards.find(plainWhole) ?? null
  if (!main) return { title: 'Leaderboard', rows: [] }
  const rows: BoardRow[] = overall ? overallRows(overall, boards, ctx) : buildRows(main, ctx)
  return {
    title: overall ? 'Overall' : 'Leaderboard',
    rows: rows.slice(0, limit).map(r => ({ place: r.place, name: r.name, total: r.total })),
  }
}
