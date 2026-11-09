import { supabase } from '@/lib/supabase'
import { readAllRows } from '@/lib/allRows'
import { readRoundHandicaps } from '@/lib/scoreReads'
import type { Leaderboard } from '@/lib/leaderboards'
import { allowanceOf } from '@/lib/handicapAllowance'
import { teesForPlayer } from '@/lib/courseHandicap'
import { matchStrokes, foursomesStrokes, parseMatchTees } from '@/lib/matchArrangements'
import { playSessionCard, type CardHole, type CardSideView } from '@/lib/matchCard'
import { sessionBoardFor, defaultTeeIndex, type SessionMatchResult, type MatchFormat } from '@/lib/sessions'
import { tagOfTeam } from '@/lib/tagBoards'
import type { Membership } from '@/lib/teamSets'

/**
 * A Matches session's matches, read on the server (lib/sessions.ts) —
 * fetching only; lib/matchCard.ts decides where each card stands. The
 * leaderboard and the hub read the results; a match's own card page reads
 * its setup. All three come through `readSessionCards`, so the shots
 * cannot differ between them.
 *
 * Fail-soft throughout: before migration 067 there is no table, and an
 * event simply has no session matches yet.
 */

type Player = { id: string; name: string; handicap: number | null; gender: string }

export type SessionMatchRow = {
  id: string
  round_id: string
  slot: number
  side_a: string[]
  side_b: string[]
  result: 'a' | 'b' | 'halved' | null
  margin: string | null
  tees: unknown
}

export type SessionCardSetup = {
  row: SessionMatchRow
  format: MatchFormat
  card: { a: CardSideView; b: CardSideView; holes: CardHole[] } | null
  blocked: 'sides' | 'handicaps' | 'scorecard' | null
  courseName: string | null
  /** Each player's tee id, as the shots were worked out. */
  tees: Record<string, string>
  /** The tees each player may choose from. */
  teeChoices: Record<string, { id: string; name: string }[]>
}

/** Every session match on the event, rows only. */
export async function readSessionMatchRows(tripId: string): Promise<SessionMatchRow[]> {
  const { data, error } = await supabase
    .from('session_matches')
    .select('id, round_id, slot, side_a, side_b, result, margin, tees')
    .eq('trip_id', tripId)
    .order('slot')
  if (error) return []
  return (data ?? []) as SessionMatchRow[]
}

/** A side's name: its tag where every player shares one, else its players. */
export function sideName(
  ids: readonly string[], players: readonly Player[], teams: readonly { id: string; name: string }[],
  memberships: readonly Membership[],
): string {
  const tag = ids.length ? tagOfTeam([...ids], memberships) : null
  const named = tag ? teams.find(t => t.id === tag)?.name : null
  return named ?? (ids.map(id => players.find(p => p.id === id)?.name.split(' ')[0] ?? 'A player').join(' & ') || 'To be set')
}

/**
 * Each match's card setup and where it stands. `onlyIds` narrows to some
 * matches (a card page asks for one).
 */
export async function readSessionCards(
  trip: { id: string },
  boards: readonly Leaderboard[],
  players: readonly Player[],
  ctx: { teams: { id: string; name: string }[]; memberships: Membership[] },
  rows: readonly SessionMatchRow[],
): Promise<{ setups: Map<string, SessionCardSetup>; results: SessionMatchResult[] }> {
  const setups = new Map<string, SessionCardSetup>()
  if (rows.length === 0) return { setups, results: [] }
  const roundIds = [...new Set(rows.map(r => r.round_id))]
  const matchIds = rows.map(r => r.id)
  const [roundsRes, hcpRes, scoresRes] = await Promise.all([
    supabase.from('rounds').select('id, course_id, courses(name)').eq('trip_id', trip.id).in('id', roundIds),
    readRoundHandicaps<{ round_id: string; player_id: string; tee_id: string | null }>(supabase, 'round_id, player_id, tee_id', roundIds),
    // Past Supabase's 1,000-row cap — a Ryder Cup's cards are about 2,000
    // rows — so read whole, ordered on the table's own key (lib/allRows.ts).
    readAllRows<{ match_id: string; player_id: string; hole_number: number; gross: number | null }>(
      () => supabase.from('session_match_scores').select('match_id, player_id, hole_number, gross', { count: 'exact' })
        .eq('trip_id', trip.id).in('match_id', matchIds)
        .order('match_id').order('player_id').order('hole_number'),
      r => `${r.match_id}|${r.player_id}|${r.hole_number}`,
    ),
  ])
  type RoundRow = { id: string; course_id: string; courses: { name: string } | { name: string }[] | null }
  const roundById = new Map(((roundsRes.data ?? []) as unknown as RoundRow[]).map(r => [r.id, r]))
  const courseIds = [...new Set([...roundById.values()].map(r => r.course_id))]
  const [teesRes, holesRes] = courseIds.length === 0 ? [{ data: [] }, { data: [] }] : await Promise.all([
    supabase.from('tees').select('id, course_id, name, gender, slope, course_rating, par').in('course_id', courseIds),
    supabase.from('holes').select('course_id, hole_number, par, stroke_index, stroke_index_ladies').in('course_id', courseIds).order('hole_number'),
  ])
  type Tee = { id: string; course_id: string; name: string; gender: string; slope: number | null; course_rating: number | null; par: number | null }
  const tees = (teesRes.data ?? []) as Tee[]
  const holesOf = new Map<string, CardHole[]>()
  for (const h of (holesRes.data ?? []) as { course_id: string; hole_number: number; par: number; stroke_index: number; stroke_index_ladies: number | null }[]) {
    const list = holesOf.get(h.course_id) ?? []
    list.push({ holeNumber: h.hole_number, par: h.par, strokeIndex: h.stroke_index, strokeIndexLadies: h.stroke_index_ladies })
    holesOf.set(h.course_id, list)
  }
  const roundTee = new Map((hcpRes.data ?? [])
    .map(r => [`${r.round_id}:${r.player_id}`, r.tee_id]))
  const scoresOf = new Map<string, Map<string, Map<number, number | null>>>()
  for (const s of scoresRes.data ?? []) {
    const m = scoresOf.get(s.match_id) ?? new Map()
    const p = m.get(s.player_id) ?? new Map()
    p.set(s.hole_number, s.gross)
    m.set(s.player_id, p)
    scoresOf.set(s.match_id, m)
  }
  const playerById = new Map(players.map(p => [p.id, p]))

  const results: SessionMatchResult[] = []
  for (const row of rows) {
    const board = sessionBoardFor(boards, row.round_id)
    const format: MatchFormat = board?.matchFormat ?? 'singles'
    const round = roundById.get(row.round_id)
    const course = round ? (Array.isArray(round.courses) ? round.courses[0] : round.courses) : null
    const courseTees = round ? tees.filter(t => t.course_id === round.course_id) : []
    const chosen = parseMatchTees(row.tees)
    const ids = [...row.side_a, ...row.side_b]
    const teeOf: Record<string, string> = {}
    const teeChoices: Record<string, { id: string; name: string }[]> = {}
    for (const pid of ids) {
      const mine = teesForPlayer(courseTees, playerById.get(pid)?.gender ?? 'M')
      teeChoices[pid] = mine.map(t => ({ id: t.id, name: t.name }))
      const pick = chosen[pid] ?? roundTee.get(`${row.round_id}:${pid}`) ?? mine[defaultTeeIndex(mine.length)]?.id
      if (pick) teeOf[pid] = pick
    }
    const base: SessionCardSetup = { row, format, card: null, blocked: null, courseName: course?.name ?? null, tees: teeOf, teeChoices }
    const result: SessionMatchResult = {
      id: row.id, roundId: row.round_id, slot: row.slot, sideA: row.side_a, sideB: row.side_b,
      result: row.result, margin: row.margin,
    }
    if (!row.side_a.length || !row.side_b.length) {
      setups.set(row.id, { ...base, blocked: 'sides' }); results.push(result); continue
    }
    const allowance = board ? allowanceOf(board) : 100
    const asPlayer = (pid: string) => {
      const t = tees.find(x => x.id === teeOf[pid])
      const rated = t && t.slope != null && t.course_rating != null && t.par != null
        ? { slope: t.slope, course_rating: t.course_rating, par: t.par } : null
      return { playerId: pid, index: playerById.get(pid)?.handicap ?? null, tee: rated }
    }
    const holes = round ? (holesOf.get(round.course_id) ?? []).slice(0, 18) : []
    // Foursomes: one ball a side, off half the partners' combined handicaps
    // (`foursomesStrokes`) — the side is one entry on the card, its score
    // kept under its first player (D43, stage 7).
    const foursomes = format === 'foursomes'
      ? foursomesStrokes([
          { key: 'A', players: row.side_a.map(asPlayer) },
          { key: 'B', players: row.side_b.map(asPlayer) },
        ], allowance)
      : null
    const strokes = format === 'foursomes' ? null : matchStrokes(ids.map(asPlayer), allowance)
    if (format === 'foursomes' ? !foursomes : !strokes) { setups.set(row.id, { ...base, blocked: 'handicaps' }); results.push(result); continue }
    if (holes.length < 18) { setups.set(row.id, { ...base, blocked: 'scorecard' }); results.push(result); continue }
    const receives = new Map((strokes ?? []).map(s => [s.playerId, s.receives]))
    const side = (key: 'A' | 'B', sideIds: string[]): CardSideView => {
      const name = sideName(sideIds, players, ctx.teams, ctx.memberships)
      if (foursomes) {
        const lead = playerById.get(sideIds[0])
        const both = sideIds.map(id => playerById.get(id)?.name.split(' ')[0] ?? 'A player').join(' & ')
        return {
          id: `${row.id}:${key}`,
          name,
          // A mixed pair plays the men's stroke index unless both are women.
          players: lead ? [{
            id: lead.id, name: both,
            gender: sideIds.every(id => playerById.get(id)?.gender === 'F') ? 'F' : 'M',
            receives: foursomes.find(f => f.key === key)?.receives ?? 0,
          }] : [],
        }
      }
      return {
        id: `${row.id}:${key}`,
        name,
        players: sideIds.flatMap(pid => {
          const p = playerById.get(pid)
          return p ? [{ id: pid, name: p.name, gender: p.gender, receives: receives.get(pid) ?? 0 }] : []
        }),
      }
    }
    const card = { a: side('A', row.side_a), b: side('B', row.side_b), holes }
    setups.set(row.id, { ...base, card })
    const scores = scoresOf.get(row.id)
    if (!row.result && scores && scores.size > 0) {
      const { state } = playSessionCard(holes, card.a, card.b, scores)
      result.live = true
      result.leader = state.leader === 'A' ? 'a' : state.leader === 'B' ? 'b' : null
      result.progress = state.progress
      result.up = state.up
      result.thru = state.thru
    }
    results.push(result)
  }
  return { setups, results }
}

/** The event's session matches with where each stands — what the leaderboard and the hub read. */
export async function readSessionResults(
  trip: { id: string },
  boards: readonly Leaderboard[],
  players: readonly Player[],
  ctx: { teams: { id: string; name: string }[]; memberships: Membership[] },
): Promise<SessionMatchResult[]> {
  if (!boards.some(b => b.competition === 'matches')) return []
  const rows = await readSessionMatchRows(trip.id)
  return (await readSessionCards(trip, boards, players, ctx, rows)).results
}
