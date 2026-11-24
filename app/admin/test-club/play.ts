// Playing one test club competition (D311, D312) through the club's real
// paths, as its characters, with the clock set to the competition's own day:
//
//   made     — runNewCompetition as the office (CJ), six days before;
//   booked   — runBooking 'book', each player themselves, three days before;
//   played   — each group's card started and scored as a phone does it
//              (live_rounds, the locks, round_handicaps, live_scores — the
//              writes LiveScoringFlow makes), the scores from
//              lib/testClubCards.ts;
//   signed   — runSign 'finalise' by the group's first player, each marked
//              by the next in the group; every other player approves and
//              every marker marks, each on their own account;
//   certified — runCertify as the office that evening.
//
// Every step looks first, so a step done is never done again and a run cut
// short carries on. Real members are never booked, scored or signed for
// (D314): a spec names characters only. Server only.

import type { createAdminClient } from '@/lib/supabase-admin'
import { irishInstant } from '@/lib/irishTime'
import { courseHandicap, teesForPlayer } from '@/lib/courseHandicap'
import { testEmail, type Character, type PlaySpec } from '@/lib/testClub'
import { holePoints, makeCard } from '@/lib/testClubCards'
import type { CompForm } from '@/lib/clubComp'
import { runNewCompetition } from '@/app/api/club/competition'
import { competitionRouteStore } from '@/app/api/club/competition/routeStore'
import { runBooking } from '@/app/api/club/booking'
import { bookingStore } from '@/app/api/club/bookingStore'
import { runSign } from '@/app/api/card/sign'
import { signStore } from '@/app/api/card/store'
import { runCertify } from '@/app/api/card/certify'
import { certifyStore } from '@/app/api/card/certifyStore'
import { characterToken } from './characterCalls'

type Db = ReturnType<typeof createAdminClient>

export interface PlayContext {
  db: Db
  club: { id: string; slug: string; homeCourseId: string }
  cast: readonly Character[]
  /** Each character's row on the list, by key. */
  rowOf: ReadonlyMap<string, string>
  /** Membership ids by name. */
  cats: ReadonlyMap<string, string>
  deadline: number
}

export type PlayResult = { done: boolean; code: string | null; lines: string[] }

const at = (day: string, time: string, daysBefore = 0): Date => {
  const d = new Date(Date.parse(`${day}T12:00:00Z`) - daysBefore * 86_400_000).toISOString().slice(0, 10)
  return irishInstant(d, time) ?? new Date(`${d}T${time}:00Z`)
}
const said = (r: { status: number; body: unknown }) => String((r.body as { error?: string })?.error ?? r.status)

/** The competition a spec made before (`test:<key>`), or null. */
export async function findComp(db: Db, clubId: string, key: string): Promise<{ tripId: string; code: string; roundId: string } | null> {
  const { data } = await db.from('trip_private').select('trip_id').eq('club_id', clubId).eq('import_ref', `test:${key}`).maybeSingle()
  const tripId = (data as { trip_id?: string } | null)?.trip_id
  if (!tripId) return null
  const [{ data: trip }, { data: round }] = await Promise.all([
    db.from('trips').select('trip_code').eq('id', tripId).maybeSingle(),
    db.from('rounds').select('id').eq('trip_id', tripId).maybeSingle(),
  ])
  const code = (trip as { trip_code?: string } | null)?.trip_code
  const roundId = (round as { id?: string } | null)?.id
  return code && roundId ? { tripId, code, roundId } : null
}

export async function playCompetition(ctx: PlayContext, spec: PlaySpec): Promise<PlayResult> {
  const { db, club, cast } = ctx
  const lines: string[] = []
  const late = () => Date.now() > ctx.deadline
  const byKey = new Map(cast.map(c => [c.key, c]))
  const office = cast.find(c => c.clubhouse && c.officer)
  if (!office) return { done: true, code: null, lines: ['No character has Clubhouse — nobody can make the competition.'] }
  const tokenOf = (c: Character) => characterToken(testEmail(c.username, club.slug))
  const keys = spec.groups.flat().filter(k => byKey.has(k))

  // ── Made ──
  let comp = await findComp(db, club.id, spec.key)
  if (!comp) {
    const perTime = Math.max(3, ...spec.groups.map(g => g.length))
    const form: CompForm = {
      name: spec.name, date: spec.day, courseId: club.homeCourseId, scoring: spec.scoring,
      allowance: 100, watch: 'members',
      batches: [{ start: '09:00', interval: 10, perTime, times: Math.max(spec.groups.length + 1, 2) }],
      opens: null,
      entry: spec.entry
        ? {
            ...(spec.entry.genders ? { genders: spec.entry.genders } : {}),
            ...(spec.entry.membership && ctx.cats.get(spec.entry.membership) ? { categories: [ctx.cats.get(spec.entry.membership)!] } : {}),
          }
        : null,
    }
    const made = await runNewCompetition({ token: await tokenOf(office), clubId: club.id, form, from: 'clubhouse' }, competitionRouteStore(db), at(spec.day, '10:00', 6))
    if (made.status !== 200) return { done: true, code: null, lines: [`${spec.name}: not made — ${said(made)}`] }
    const code = (made.body as { code: string }).code
    const { data: t } = await db.from('trips').select('id').eq('trip_code', code).single()
    await db.from('trip_private').update({ import_ref: `test:${spec.key}` }).eq('trip_id', (t as { id: string }).id)
    comp = await findComp(db, club.id, spec.key)
    if (!comp) return { done: true, code, lines: [`${spec.name}: made, but not found again — press again.`] }
    lines.push(`${spec.name} (${spec.day}) made.`)
  }
  const { tripId, code, roundId } = comp

  // ── Booked ──
  const book = bookingStore(db)
  const playerOfRow = async () => new Map((await book.players(tripId)).filter(p => p.clubMemberId).map(p => [p.clubMemberId as string, p.id]))
  let players = await playerOfRow()
  let bookings = await book.bookings(roundId)
  for (const [slot, group] of spec.groups.entries()) {
    for (const k of group) {
      if (late()) return { done: false, code, lines }
      const c = byKey.get(k), rowId = ctx.rowOf.get(k)
      if (!c || !rowId) continue
      const pid = players.get(rowId)
      if (pid && bookings.some(b => b.playerId === pid)) continue
      const r = await runBooking({ token: await tokenOf(c), action: 'book', code, slot, memberIds: [rowId] }, book, at(spec.day, '10:00', 3))
      if (r.status !== 200) lines.push(`${c.name} not booked into ${spec.name}: ${said(r)}`)
    }
  }
  players = await playerOfRow()
  bookings = await book.bookings(roundId)
  const playerOf = (k: string) => { const row = ctx.rowOf.get(k); return row ? players.get(row) ?? null : null }
  const booked = (k: string) => { const p = playerOf(k); return !!p && bookings.some(b => b.playerId === p) }

  // The course as each player plays it.
  const [{ data: holeRows }, { data: teeRows }, { data: sigRows }] = await Promise.all([
    db.from('holes').select('hole_number, par, par_ladies, stroke_index, stroke_index_ladies').eq('course_id', club.homeCourseId).order('hole_number'),
    db.from('tees').select('id, name, gender, slope, course_rating, par').eq('course_id', club.homeCourseId),
    db.from('card_signatures').select('player_id, approved_at, marked_at').eq('round_id', roundId).is('sent_back_at', null),
  ])
  const holes = (holeRows ?? []) as { hole_number: number; par: number; par_ladies: number | null; stroke_index: number; stroke_index_ladies: number | null }[]
  const tees = (teeRows ?? []) as { id: string; name: string; gender: string; slope: number | null; course_rating: number | null; par: number | null }[]
  if (holes.length < 18 || !tees.some(t => t.slope && t.course_rating && t.par)) {
    return { done: true, code, lines: [...lines, `${spec.name}: the home course has no scorecard or no rated tee, so nothing can be played on it.`] }
  }
  const signed = new Map(((sigRows ?? []) as { player_id: string; approved_at: string | null; marked_at: string | null }[]).map(s => [s.player_id, s]))

  // ── Played and signed, a group at a time ──
  for (const group of spec.groups) {
    if (late()) return { done: false, code, lines }
    const here = group.filter(k => byKey.has(k) && booked(k))
    if (here.length === 0) continue
    const pids = here.map(k => playerOf(k)!)
    const finaliser = byKey.get(here[0])!
    const markerOf = (i: number) => here.length > 1 ? here[(i + 1) % here.length] : office.key !== here[0] ? office.key : null

    if (!pids.every(p => signed.has(p))) {
      // The card started as a phone starts it.
      const { data: lockRow } = await db.from('live_player_locks').select('live_round_id').eq('player_id', pids[0]).maybeSingle()
      let liveId = (lockRow as { live_round_id?: string } | null)?.live_round_id ?? null
      if (liveId) {
        const { data: lr } = await db.from('live_rounds').select('round_id').eq('id', liveId).maybeSingle()
        if ((lr as { round_id?: string } | null)?.round_id !== roundId) liveId = null
      }
      if (!liveId) {
        const { data, error } = await db.from('live_rounds').insert({ course_id: club.homeCourseId, round_id: roundId, status: 'active' }).select('id').single()
        if (error || !data) return { done: true, code, lines: [...lines, `${spec.name}: a card could not start — ${error?.message ?? 'unknown'}`] }
        liveId = (data as { id: string }).id
      }
      await db.from('live_player_locks').upsert(pids.map(p => ({ live_round_id: liveId, player_id: p })), { onConflict: 'live_round_id,player_id' })
      for (const [i, k] of here.entries()) {
        const c = byKey.get(k)!
        const rated = teesForPlayer(tees.filter(t => t.slope && t.course_rating && t.par), c.gender)
        // A man off the second tee down where there is one (the club's medal tee), a woman off her first.
        const tee = rated[c.gender === 'M' && rated.length > 1 ? 1 : 0]
        const ch = courseHandicap(c.handicap, { slope: tee.slope!, course_rating: tee.course_rating!, par: tee.par! })
        await db.from('round_handicaps').upsert({ round_id: roundId, player_id: pids[i], playing_handicap: ch, tee_id: tee.id }, { onConflict: 'round_id,player_id' })
        const asPlayed = holes.map(h => ({
          number: h.hole_number,
          par: c.gender === 'F' && h.par_ladies ? h.par_ladies : h.par,
          si: c.gender === 'F' && h.stroke_index_ladies ? h.stroke_index_ladies : h.stroke_index,
        }))
        const card = makeCard({
          holes: asPlayed, courseHcp: ch, form: spec.players[k] ?? 'steady', seed: `${spec.key}:${k}`,
          set: (spec.set ?? []).filter(s => s.who === k).map(s => ({ hole: s.hole, gross: s.gross })),
        })
        const { error } = await db.from('live_scores').upsert(card.map(h => {
          const hole = asPlayed.find(x => x.number === h.hole)!
          return { player_id: pids[i], round_id: roundId, hole_number: h.hole, gross_score: h.gross, stableford_points: holePoints(h.gross, hole.par, hole.si, ch), committed: false }
        }), { onConflict: 'player_id,round_id,hole_number' })
        if (error) return { done: true, code, lines: [...lines, `${spec.name}: ${c.name}’s card not written — ${error.message}`] }
      }
      // Finalised by the first player, each card marked by the next.
      const markers = Object.fromEntries(here.map((k, i) => {
        const m = markerOf(i)
        return [playerOf(k)!, m && playerOf(m) ? { playerId: playerOf(m)! } : { memberId: ctx.rowOf.get(office.key)! }]
      }))
      const f = await runSign({ token: await tokenOf(finaliser), action: 'finalise', code, liveRoundId: liveId, markers }, signStore(db), at(spec.day, '14:30'))
      if (f.status !== 200) { lines.push(`${spec.name}: ${finaliser.name}’s group not signed — ${said(f)}`); continue }
    }
    // Every other player approves; every marker marks — each on their own account.
    for (const [i, k] of here.entries()) {
      if (late()) return { done: false, code, lines }
      const c = byKey.get(k)!
      const pid = playerOf(k)!
      const s = signed.get(pid)
      if (!s?.approved_at) {
        const r = await runSign({ token: await tokenOf(c), action: 'approve', code, playerId: pid }, signStore(db), at(spec.day, '14:40'))
        if (r.status !== 200) lines.push(`${c.name} did not approve: ${said(r)}`)
      }
      if (!s?.marked_at) {
        const mk = byKey.get(markerOf(i) ?? office.key)!
        const r = await runSign({ token: await tokenOf(mk), action: 'mark', code, playerId: pid }, signStore(db), at(spec.day, '14:45'))
        if (r.status !== 200) lines.push(`${mk.name} did not mark ${c.name}: ${said(r)}`)
      }
    }
  }
  if (keys.length) lines.push(`${spec.name}: ${keys.filter(booked).length} cards played and signed.`)

  // ── Certified ──
  if (spec.certify && at(spec.day, '19:00').getTime() <= Date.now()) {
    const { data: r } = await db.from('rounds').select('certified_at').eq('id', roundId).maybeSingle()
    if (!(r as { certified_at?: string | null } | null)?.certified_at) {
      const c = await runCertify({ token: await tokenOf(office), action: 'certify', code }, certifyStore(db), at(spec.day, '19:00'))
      lines.push(c.status === 200 ? `${spec.name}: certified.` : `${spec.name}: not certified — ${said(c)}`)
    }
  }
  // What it wrote to the feed is dated the competition's day, not today.
  await db.from('feed_items').update({ created_at: at(spec.day, '15:00').toISOString() }).eq('trip_id', tripId)
  return { done: true, code, lines }
}

/** Whether a spec is played out already — made, and certified (or every card signed where it is not to be). */
export async function alreadyPlayed(db: Db, clubId: string, spec: PlaySpec): Promise<boolean> {
  const comp = await findComp(db, clubId, spec.key)
  if (!comp) return false
  const { data } = await db.from('rounds').select('certified_at').eq('id', comp.roundId).maybeSingle()
  return spec.certify && !!(data as { certified_at?: string | null } | null)?.certified_at
}
