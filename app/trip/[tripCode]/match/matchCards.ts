import { supabase } from '@/lib/supabase'
import { readAllRows } from '@/lib/allRows'
import { boardsForTrip } from '@/lib/leaderboardsCompat'
import { allowanceOf } from '@/lib/handicapAllowance'
import { isPlayable } from '@/lib/knockoutPortal'
import { matchStrokes, parseMatchTees } from '@/lib/matchArrangements'
import {
  playCard, type CardHole, type CardSideKey, type CardSideView, type CardState,
} from '@/lib/matchCard'
import type { KnockoutView } from '../knockout'

/**
 * Match play cards read on the server (docs/event-use-cases.md, story 2) —
 * fetching only; lib/matchCard.ts decides. Two callers: a match's own card
 * page, which needs its holes and sides to draw, and the Scoring tab's live
 * board, which needs every open match's standing.
 *
 * A card's shots come off the arrangement (the course and each player's
 * tee, migration 057), so both read it the same way here and cannot
 * disagree about who gets what.
 */

type Player = { id: string; name: string; handicap: number | null; gender: string }

export type CardSetup = {
  /** Null when the match cannot be scored yet; `blocked` says why. */
  card: { a: CardSideView; b: CardSideView; holes: CardHole[] } | null
  blocked: 'sides' | 'arrange' | 'scorecard' | null
  courseName: string | null
}

/** Every listed match's card, ready to draw or the reason it is not. */
export async function readCardSetups(
  trip: { id: string; leaderboards?: unknown; formats?: unknown; team_scoring?: unknown },
  view: KnockoutView,
  players: readonly Player[],
  matchIds: readonly string[],
): Promise<Map<string, CardSetup>> {
  const out = new Map<string, CardSetup>()
  if (matchIds.length === 0) return out

  // Its own query, fail-soft: the columns arrive with migration 057.
  const arrangedRes = await supabase.from('matchplay_matches').select('id, course_id, tees')
    .eq('trip_id', trip.id).in('id', [...matchIds])
  if (arrangedRes.error) console.error('Match arrangements read failed:', arrangedRes.error)
  const arranged = new Map(((arrangedRes.data ?? []) as { id: string; course_id: string | null; tees: unknown }[])
    .map(r => [r.id, r]))
  const courseIds = [...new Set([...arranged.values()].map(r => r.course_id).filter((c): c is string => !!c))]

  const [coursesRes, teesRes, holesRes] = courseIds.length === 0
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from('courses').select('id, name').in('id', courseIds),
        supabase.from('tees').select('id, course_id, slope, course_rating, par').in('course_id', courseIds),
        supabase.from('holes').select('course_id, hole_number, par, stroke_index, stroke_index_ladies')
          .in('course_id', courseIds).order('hole_number'),
      ])
  const courseName = new Map(((coursesRes.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
  const teeById = new Map(((teesRes.data ?? []) as {
    id: string; slope: number | null; course_rating: number | null; par: number | null
  }[]).map(t => [t.id, t]))
  const holesOf = new Map<string, CardHole[]>()
  for (const h of (holesRes.data ?? []) as {
    course_id: string; hole_number: number; par: number; stroke_index: number; stroke_index_ladies: number | null
  }[]) {
    const list = holesOf.get(h.course_id) ?? []
    list.push({ holeNumber: h.hole_number, par: h.par, strokeIndex: h.stroke_index, strokeIndexLadies: h.stroke_index_ladies })
    holesOf.set(h.course_id, list)
  }

  const playerById = new Map(players.map(p => [p.id, p]))
  const draw = boardsForTrip({
    leaderboards: trip.leaderboards, formats: trip.formats, team_scoring: trip.team_scoring,
  }).find(lb => lb.competition === 'matchplay')
  const allowance = draw ? allowanceOf(draw) : 100

  for (const id of matchIds) {
    const match = view.matches.find(m => m.id === id)
    const row = arranged.get(id)
    const courseId = row?.course_id ?? null
    const name = courseId ? courseName.get(courseId) ?? null : null
    if (!match || !match.sideA || !match.sideB) { out.set(id, { card: null, blocked: 'sides', courseName: name }); continue }
    const tees = parseMatchTees(row?.tees)
    const ids = [match.sideA, match.sideB].flatMap(s => view.members[s] ?? [])
    const strokes = matchStrokes(ids.map(pid => {
      const t = tees[pid] ? teeById.get(tees[pid]) : undefined
      const rated = t && t.slope != null && t.course_rating != null && t.par != null
        ? { slope: t.slope, course_rating: t.course_rating, par: t.par } : null
      return { playerId: pid, index: playerById.get(pid)?.handicap ?? null, tee: rated }
    }), allowance)
    const holes = (courseId ? holesOf.get(courseId) ?? [] : []).slice(0, 18)
    if (!courseId || !strokes) { out.set(id, { card: null, blocked: 'arrange', courseName: name }); continue }
    if (holes.length < 18) { out.set(id, { card: null, blocked: 'scorecard', courseName: name }); continue }
    const receives = new Map(strokes.map(s => [s.playerId, s.receives]))
    const side = (sid: string): CardSideView => ({
      id: sid,
      name: view.names[sid] ?? 'A player',
      players: (view.members[sid] ?? []).flatMap(pid => {
        const p = playerById.get(pid)
        return p ? [{ id: pid, name: p.name, gender: p.gender, receives: receives.get(pid) ?? 0 }] : []
      }),
    })
    out.set(id, { card: { a: side(match.sideA), b: side(match.sideB), holes }, blocked: null, courseName: name })
  }
  return out
}

/** A match being played now, as the live board shows it. */
export type LiveMatch = {
  id: string
  roundName: string
  sideA: string
  sideB: string
  state: CardState
  /** The side ahead, by its draw id; null when all square. */
  leaderId: string | null
}

/**
 * Every open match with anything on its card — the live board on the
 * Scoring tab. A match already in the bracket is not live, whatever its
 * card says; before migration 058 there are no cards and nothing is live.
 */
export async function readLiveMatches(
  trip: { id: string; leaderboards?: unknown; formats?: unknown; team_scoring?: unknown },
  view: KnockoutView,
  players: readonly Player[],
): Promise<LiveMatch[]> {
  const open = view.matches.filter(m => isPlayable(m) && m.winner === null && m.sideA && m.sideB)
  if (open.length === 0) return []
  const openIds = open.map(m => m.id)

  type ScoreRow = { match_id: string; player_id: string; hole_number: number; gross: number }
  type ConcessionRow = { match_id: string; hole_number: number; conceded_by: string }
  const [scoresRes, concessionsRes] = await Promise.all([
    readAllRows<ScoreRow>(
      () => supabase.from('match_scores').select('match_id, player_id, hole_number, gross', { count: 'exact' })
        .eq('trip_id', trip.id).in('match_id', openIds)
        .order('match_id').order('player_id').order('hole_number'),
      r => `${r.match_id}|${r.player_id}|${r.hole_number}`,
    ),
    readAllRows<ConcessionRow>(
      () => supabase.from('match_concessions').select('match_id, hole_number, conceded_by', { count: 'exact' })
        .eq('trip_id', trip.id).in('match_id', openIds)
        .order('match_id').order('hole_number'),
      r => `${r.match_id}|${r.hole_number}`,
    ),
  ])
  // Before migration 058 neither table exists — nothing is live, quietly.
  if (scoresRes.error || concessionsRes.error) return []

  const scoresOf = new Map<string, Map<string, Map<number, number>>>()
  for (const r of scoresRes.data) {
    const byPlayer = scoresOf.get(r.match_id) ?? new Map<string, Map<number, number>>()
    const holes = byPlayer.get(r.player_id) ?? new Map<number, number>()
    holes.set(r.hole_number, r.gross)
    byPlayer.set(r.player_id, holes)
    scoresOf.set(r.match_id, byPlayer)
  }
  const concededOf = new Map<string, Map<number, CardSideKey>>()
  for (const r of concessionsRes.data) {
    const m = concededOf.get(r.match_id) ?? new Map<number, CardSideKey>()
    m.set(r.hole_number, r.conceded_by === 'B' ? 'B' : 'A')
    concededOf.set(r.match_id, m)
  }

  const started = openIds.filter(id => scoresOf.has(id) || concededOf.has(id))
  const setups = await readCardSetups(trip, view, players, started)
  const live: LiveMatch[] = []
  for (const id of started) {
    const card = setups.get(id)?.card
    const match = open.find(m => m.id === id)
    if (!card || !match) continue
    const { state } = playCard(card.holes, card.a, card.b, scoresOf.get(id) ?? new Map(), concededOf.get(id) ?? new Map())
    live.push({
      id,
      roundName: match.roundName,
      sideA: match.sideA as string,
      sideB: match.sideB as string,
      state,
      leaderId: state.leader === 'A' ? card.a.id : state.leader === 'B' ? card.b.id : null,
    })
  }
  // Furthest round first, then the furthest on: the nearest finishes on top.
  return live.sort((x, y) => {
    const rx = view.matches.find(m => m.id === x.id)?.roundNumber ?? 0
    const ry = view.matches.find(m => m.id === y.id)?.roundNumber ?? 0
    return ry - rx || y.state.played - x.state.played
  })
}
