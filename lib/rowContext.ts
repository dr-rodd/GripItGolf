// Raw database rows → the context a leaderboard is built from.
//
// `buildRows` takes a `RowContext`: players, teams, memberships, holes,
// rounds, every score resolved from both tables, and two maps of handicaps.
// Assembling one is a dozen lines of merging that have nothing to do with
// scoring, and the hub needs the same assembly the leaderboard does — one
// line saying where a player stands has to agree with the board it claims to
// be quoting.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ TripLeaderboardClient still assembles its own, inline, in useMemo.  │
// │ It predates this file and was left exactly as it was: Phase 2 reads │
// │ from the leaderboard, it does not change it, and rewiring the one   │
// │ screen the whole trip is scored on was not worth the risk this week.│
// │                                                                     │
// │ So there are two copies of this merge. Consolidating them — having  │
// │ that useMemo call `resolveScores` — is a small, mechanical follow-up │
// │ and should happen once the trip is over.                            │
// └─────────────────────────────────────────────────────────────────────┘
//
// Pure. No I/O — the caller does the queries and hands the rows in.

import type { ResolvedScore, RowHole, RowRound } from './boardRows'
import { exactCourseHandicap, type TeeRating } from './courseHandicap'

/** A committed score, as `scores` stores it. */
export type ScoreRow = {
  player_id: string
  round_id: string
  hole_id: string
  gross_score: number | null
  stableford_points: number | null
  no_return: boolean
}

/** An in-progress score, as `live_scores` stores it — keyed by hole *number*. */
export type LiveScoreRow = {
  player_id: string
  round_id: string
  hole_number: number
  gross_score: number | null
  stableford_points: number | null
}

export type HandicapRow = {
  round_id: string
  player_id: string
  playing_handicap: number
  tee_id?: string | null
}

export type TeeRow = TeeRating & { id: string }

/**
 * Committed and in-progress scores as one list.
 *
 * A committed score wins wherever both exist: the card was signed, and the
 * live row behind it is a leftover. `live: true` is what makes a round read
 * as how far ahead of level it stands rather than as a finished total.
 *
 * A live row is matched to its hole by number within the round's course,
 * because `live_scores` has no hole id — that is the shape of the table, not
 * a shortcut taken here.
 */
export function resolveScores(
  scores: readonly ScoreRow[],
  liveScores: readonly LiveScoreRow[],
  holes: readonly RowHole[],
  courseByRound: ReadonlyMap<string, string>,
): ResolvedScore[] {
  const holeById = new Map(holes.map(h => [h.id, h]))
  const out: ResolvedScore[] = []
  const seen = new Set<string>()

  for (const s of scores) {
    const hole = holeById.get(s.hole_id)
    if (!hole) continue
    seen.add(`${s.player_id}:${s.round_id}:${hole.hole_number}`)
    out.push({
      playerId: s.player_id,
      roundId: s.round_id,
      holeId: s.hole_id,
      holeNumber: hole.hole_number,
      gross: s.no_return ? null : s.gross_score,
      points: s.stableford_points ?? 0,
      noReturn: s.no_return,
      live: false,
    })
  }

  const byCourseAndNumber = new Map(holes.map(h => [`${h.course_id}:${h.hole_number}`, h]))

  for (const ls of liveScores) {
    if (seen.has(`${ls.player_id}:${ls.round_id}:${ls.hole_number}`)) continue
    if (ls.gross_score == null) continue
    const courseId = courseByRound.get(ls.round_id)
    const hole = courseId ? byCourseAndNumber.get(`${courseId}:${ls.hole_number}`) : undefined
    if (!hole) continue
    out.push({
      playerId: ls.player_id,
      roundId: ls.round_id,
      holeId: hole.id,
      holeNumber: ls.hole_number,
      gross: ls.gross_score,
      points: ls.stableford_points ?? 0,
      noReturn: false,
      live: true,
    })
  }

  return out
}

/** Playing handicaps as stored — whole numbers — keyed `${roundId}:${playerId}`. */
export function handicapMap(rows: readonly HandicapRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const h of rows) m.set(`${h.round_id}:${h.player_id}`, h.playing_handicap)
  return m
}

/**
 * The same handicaps before they were rounded, where the tee is known.
 *
 * A board playing off a percentage needs the real course handicap, not the
 * whole number stored beside it — 11.63 is stored as 12, and 90% of those
 * two are a shot apart. Rounds with no tee recorded are absent, and the
 * stored whole number is the fallback: it is all that was ever known.
 */
export function exactHandicapMap(
  rows: readonly HandicapRow[],
  tees: readonly TeeRow[],
  indexByPlayer: ReadonlyMap<string, number | null>,
): Map<string, number> {
  const teeById = new Map(tees.map(t => [t.id, t]))
  const m = new Map<string, number>()
  for (const h of rows) {
    const tee = h.tee_id ? teeById.get(h.tee_id) : undefined
    const index = indexByPlayer.get(h.player_id)
    if (!tee || index == null) continue
    m.set(`${h.round_id}:${h.player_id}`, exactCourseHandicap(index, tee))
  }
  return m
}

/** Rounds in the order they are played, which is the order a board columns them. */
export function sortRounds(rounds: readonly RowRound[]): RowRound[] {
  return [...rounds].sort((a, b) => a.round_number - b.round_number)
}
