// The test club's match play, part-way through its draw (D311, stage s1c),
// made and played through the club's own paths with the clock set to each
// moment, as the season is (./play.ts):
//
//   made      — runNewMatchPlay as the office (CJ), three weeks ago;
//   entered   — each character enters themselves (runMatchPlayEntry);
//   drawn     — makeDueDraw once entries have closed, by handicap, so the
//               best players have byes;
//   arranged  — each match's course, day and tees (what the match page's
//               arrange sheet writes);
//   scored    — each card hole by hole, from lib/testClubCards.ts, the shots
//               off matchStrokes and the result decided by playCard — the
//               very rules the phone's card applies — writing match_scores
//               as the phone's outbox does;
//   finalised — the winner into the bracket through recordWinner, so the
//               next round's places fill as they do on a phone, and the
//               result into the feed.
//
// A match the plan leaves "live" is scored through its ninth hole and not
// finalised; one it leaves "waiting" is not even arranged (and so overdue).
// Every step looks first, so pressing again changes nothing. Server only.

import type { createAdminClient } from '@/lib/supabase-admin'
import { exactCourseHandicap } from '@/lib/courseHandicap'
import { matchStrokes } from '@/lib/matchArrangements'
import { recordWinner } from '@/lib/matchplayProgress'
import { toRow, toStored, type MatchRow, type StoredMatch } from '@/lib/matchplayStore'
import { formFor, matchPlayPlan, stageOf, testEmail, type Character, type MatchPlayPlan } from '@/lib/testClub'
import { scoreMatch } from '@/lib/testClubMatch'
import { runNewMatchPlay } from '@/app/api/club/competition'
import { competitionRouteStore } from '@/app/api/club/competition/routeStore'
import { runMatchPlayEntry } from '@/app/api/club/matchPlayEntry'
import { matchPlayEntryStore } from '@/app/api/club/matchplay/routeStore'
import { makeDueDraw } from '@/app/api/match/dueDraws'
import { writeMatchResult } from '@/app/api/feed/write'
import { at, said, teeOf } from './play'
import { characterToken } from './characterCalls'

type Db = ReturnType<typeof createAdminClient>

export interface MatchPlayContext {
  db: Db
  club: { id: string; slug: string; homeCourseId: string }
  cast: readonly Character[]
  rowOf: ReadonlyMap<string, string>
  today: string
  deadline: number
}

const ALLOWANCE = 100

/** The match play a plan made before (`test:<key>`), or null. */
async function findMatchPlay(db: Db, clubId: string, key: string): Promise<{ tripId: string; code: string } | null> {
  const { data } = await db.from('trip_private').select('trip_id').eq('club_id', clubId).eq('import_ref', `test:${key}`).maybeSingle()
  const tripId = (data as { trip_id?: string } | null)?.trip_id
  if (!tripId) return null
  const { data: trip } = await db.from('trips').select('trip_code').eq('id', tripId).maybeSingle()
  const code = (trip as { trip_code?: string } | null)?.trip_code
  return code ? { tripId, code } : null
}

type MatchRecord = MatchRow & { course_id?: string | null }

export async function playMatchPlay(ctx: MatchPlayContext, plan: MatchPlayPlan = matchPlayPlan(ctx.today)): Promise<{ done: boolean; code: string | null; lines: string[] }> {
  const { db, club, cast } = ctx
  const lines: string[] = []
  const late = () => Date.now() > ctx.deadline
  const office = cast.find(c => c.clubhouse && c.officer)
  if (!office) return { done: true, code: null, lines: ['No character has Clubhouse — nobody can make the match play.'] }
  const tokenOf = (c: Character) => characterToken(testEmail(c.username, club.slug))
  const byKey = new Map(cast.map(c => [c.key, c]))
  const keyOfRow = new Map([...ctx.rowOf].map(([k, row]) => [row, k]))

  // ── Made ──
  let comp = await findMatchPlay(db, club.id, plan.key)
  if (!comp) {
    const form = {
      name: plan.name, format: 'singles', allowance: ALLOWANCE, watch: 'members', entry: null,
      field: 'entries', closes: { date: plan.closesOn, time: '18:00' }, qualifier: null, maxField: 16,
      draw: { when: 'auto', date: null, time: null, seeding: 'handicap' },
      deadlines: plan.deadlines, venue: 'home', tie: 'extra', handicap: 'on_day',
    }
    const made = await runNewMatchPlay({ token: await tokenOf(office), clubId: club.id, form }, competitionRouteStore(db), at(plan.madeOn, '10:00'))
    if (made.status !== 200) return { done: true, code: null, lines: [`${plan.name}: not made — ${said(made)}`] }
    const code = (made.body as { code: string }).code
    const { data: t } = await db.from('trips').select('id').eq('trip_code', code).single()
    await db.from('trip_private').update({ import_ref: `test:${plan.key}` }).eq('trip_id', (t as { id: string }).id)
    comp = await findMatchPlay(db, club.id, plan.key)
    if (!comp) return { done: true, code, lines: [`${plan.name}: made, but not found again — press again.`] }
    lines.push(`${plan.name} made, entries closing ${plan.closesOn}.`)
  }
  const { tripId, code } = comp

  // ── Entered ──
  const entryStore = matchPlayEntryStore(db)
  const havePlayers = async () => new Set(((await db.from('players').select('club_member_id').eq('trip_id', tripId)).data ?? [])
    .map(p => (p as { club_member_id: string | null }).club_member_id).filter((x): x is string => !!x))
  let have = await havePlayers()
  let entered = 0
  for (const [i, c] of cast.entries()) {
    const rowId = ctx.rowOf.get(c.key)
    if (!rowId || have.has(rowId)) continue
    if (late()) return { done: false, code, lines }
    const r = await runMatchPlayEntry({ token: await tokenOf(c), action: 'enter', code }, entryStore, at(plan.madeOn, '12:00', -(1 + (i % 2))))
    if (r.status === 200) entered++
    else lines.push(`${c.name} not entered: ${said(r)}`)
  }
  if (entered) lines.push(`${entered} characters entered the ${plan.name}.`)
  have = await havePlayers()

  // ── Drawn ──
  const matchRows = async (): Promise<MatchRecord[]> => {
    const { data, error } = await db.from('matchplay_matches').select('*').eq('trip_id', tripId).order('round_number').order('slot')
    if (error) throw error
    return (data ?? []) as MatchRecord[]
  }
  let all = await matchRows()
  if (all.length === 0) {
    if (have.size < 2) return { done: true, code, lines: [...lines, `${plan.name}: not enough entrants to draw.`] }
    const { data: trip } = await db.from('trips').select('id, leaderboards, formats, team_scoring, bracket_setup').eq('id', tripId).single()
    const report = await makeDueDraw(db, trip as Parameters<typeof makeDueDraw>[1], at(plan.closesOn, '18:05'), false)
    all = await matchRows()
    if (all.length === 0) return { done: true, code, lines: [...lines, `${plan.name}: the draw was not made — ${report.why ?? report.outcome}.`] }
    lines.push(`${plan.name} drawn by handicap: ${all.filter(m => m.round_number === 1 && m.player_a_id && m.player_b_id && !m.player_a_is_bye && !m.player_b_is_bye).length} first-round matches.`)
  }

  // ── The course, as each player plays it ──
  const [{ data: holeRows }, { data: teeRows }, { data: playerRows }] = await Promise.all([
    db.from('holes').select('hole_number, par, par_ladies, stroke_index, stroke_index_ladies').eq('course_id', club.homeCourseId).order('hole_number'),
    db.from('tees').select('id, name, gender, slope, course_rating, par').eq('course_id', club.homeCourseId),
    db.from('players').select('id, name, gender, handicap, club_member_id').eq('trip_id', tripId),
  ])
  const holes = (holeRows ?? []) as { hole_number: number; par: number; par_ladies: number | null; stroke_index: number; stroke_index_ladies: number | null }[]
  const tees = (teeRows ?? []) as { id: string; name: string; gender: string; slope: number | null; course_rating: number | null; par: number | null }[]
  if (holes.length < 18 || !tees.some(t => t.slope && t.course_rating && t.par)) {
    return { done: true, code, lines: [...lines, `${plan.name}: the home course has no scorecard or no rated tee, so no match can be played on it.`] }
  }
  const players = new Map(((playerRows ?? []) as { id: string; name: string; gender: string; handicap: number | null; club_member_id: string | null }[]).map(p => [p.id, p]))

  // ── Round by round: arranged, scored, finalised ──
  const rounds = [...new Set(all.map(m => m.round_number))].sort((a, b) => a - b)
  let live = 0
  for (const round of rounds) {
    all = await matchRows()
    const real = all.filter(m => m.round_number === round && m.player_a_id && m.player_b_id && !m.player_a_is_bye && !m.player_b_is_bye)
    for (const [n, m] of real.entries()) {
      const stage = stageOf(plan, round, n)
      if (stage === 'waiting') continue
      if (late()) return { done: false, code, lines }
      const a = players.get(m.player_a_id!), b = players.get(m.player_b_id!)
      if (!a || !b) continue
      const decided = !!m.winner_player_id
      if (decided && stage === 'finalised') continue

      // Arranged: the home course, a day, each player's tee.
      const playedOn = stage === 'live' ? ctx.today : addDay(plan.playedOn[round] ?? ctx.today, n % 2)
      const teeA = teeOf(tees, a.gender), teeB = teeOf(tees, b.gender)
      await db.from('matchplay_matches').update({ course_id: club.homeCourseId, played_on: playedOn, tees: { [a.id]: teeA.id, [b.id]: teeB.id } }).eq('id', m.id)

      const strokes = matchStrokes([
        { playerId: a.id, index: a.handicap, tee: { slope: teeA.slope, course_rating: teeA.course_rating, par: teeA.par } },
        { playerId: b.id, index: b.handicap, tee: { slope: teeB.slope, course_rating: teeB.course_rating, par: teeB.par } },
      ], ALLOWANCE)
      if (!strokes) { lines.push(`${plan.name}: ${a.name} v ${b.name} has no handicap to play off.`); continue }
      // Each player's own card, from their form that day, played hole by hole until it is settled — or, for the match in play, the ninth.
      const spec = (p: typeof a, tee: { slope: number; course_rating: number; par: number }) => {
        const key = keyOfRow.get(p.club_member_id ?? '') ?? p.name
        const c = byKey.get(key)
        const seed = `${plan.key}:${round}:${m.slot}:${key}`
        return {
          id: p.id, gender: p.gender, receives: strokes.find(s => s.playerId === p.id)?.receives ?? 0,
          courseHcp: Math.round(exactCourseHandicap(p.handicap ?? 0, tee)), form: c ? formFor(c, seed) : 'steady' as const, seed,
        }
      }
      const played = scoreMatch({
        holes: holes.map(h => ({ number: h.hole_number, par: h.par, parLadies: h.par_ladies, si: h.stroke_index, siLadies: h.stroke_index_ladies })),
        a: spec(a, teeA), b: spec(b, teeB), ...(stage === 'live' ? { stopAfter: plan.liveHoles } : {}),
      })
      const { state } = played
      const stamp = at(playedOn, '15:00').toISOString()
      const rows = played.rows.map(r => ({ match_id: m.id, trip_id: tripId, player_id: r.playerId, hole_number: r.hole, gross: r.gross, updated_at: stamp }))
      const { error } = await db.from('match_scores').upsert(rows, { onConflict: 'match_id,player_id,hole_number' })
      if (error) { lines.push(`${plan.name}: ${a.name} v ${b.name} card not written — ${error.message}`); continue }

      if (stage === 'live') { live++; continue }
      if (!state.settled || !state.leader || !state.result) { lines.push(`${plan.name}: ${a.name} v ${b.name} did not finish — left on its card.`); continue }
      const winner = state.leader === 'A' ? a.id : b.id
      let change: ReturnType<typeof recordWinner<StoredMatch>>
      try {
        change = recordWinner<StoredMatch>((await matchRows()).map(r => toStored(r as MatchRow)), m.id, winner, { result: state.result })
      } catch (e) { lines.push(`${plan.name}: ${a.name} v ${b.name} result not recorded — ${e instanceof Error ? e.message : 'unknown'}`); continue }
      const { error: wErr } = await db.from('matchplay_matches').upsert(change.changed.map(toRow), { onConflict: 'id' })
      if (wErr) { lines.push(`${plan.name}: ${a.name} v ${b.name} result not saved — ${wErr.message}`); continue }
      await writeMatchResult(db, m.id).catch(e => console.error('match result not in the feed:', e))
      await db.from('feed_items').update({ created_at: stamp }).eq('key', `match:${m.id}`)
      lines.push(`${plan.name}, ${m.round_name}: ${players.get(winner)!.name} beat ${winner === a.id ? b.name : a.name} ${state.result}.`)
    }
  }
  if (live) lines.push(`${plan.name}: one match is on the course now.`)
  return { done: true, code, lines }
}

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
