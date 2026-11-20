// A club match play's field from its qualifier (stage 5; P8, Ross, 17 Nov
// 2026) — on the service role. Once every round of the qualifier is
// certified, the top finishers (`qualifiedField`, in its Results' own order,
// No returns out) who are still on the club's list and play here become the
// match play's players, each from their place on the list with the one
// index (D179); and the draw plan is set (`qualifiedDrawPlan`) — at once, on
// its date, or left for the club by hand, by the finish or at random. The
// platform's draw job (`makeDueDraw`) then makes the draw.
//
// Made once: the job is taken by stamping `club.fieldingAt` where it is
// still empty (a compare-and-set on the row, as `claimDue` takes a draw),
// and a field already there is never touched. Reopening the qualifier
// afterwards changes nothing here.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { irishToday } from '@/lib/clubs'
import { qualifiedDrawPlan, qualifiedField, readClubMatchPlay } from '@/lib/clubMatchPlay'
import { bookingStore } from './bookingStore'
import { readQualifierFinish } from './matchPlayDraw'

export type FieldOutcome = 'made' | 'waiting' | 'already' | 'none'

/** A claim left by a visit that died is free again after this. */
const FIELDING_MS = 5 * 60_000

export async function makeQualifiedField(admin: SupabaseClient, tripId: string, now: Date): Promise<FieldOutcome> {
  const { data: t } = await admin.from('trips').select('id, bracket_setup').eq('id', tripId).maybeSingle()
  const raw = (t as { bracket_setup?: unknown } | null)?.bracket_setup
  const setup = readClubMatchPlay(raw)
  if (!setup || setup.field !== 'qualifier' || !setup.qualifierCode || !setup.qualify) return 'none'
  if (setup.fieldAt) return 'already'
  const { count } = await admin.from('players').select('id', { count: 'exact', head: true }).eq('trip_id', tripId)
  if ((count ?? 0) > 0) return 'already'

  // The qualifier: the club's own, every round certified.
  const [{ data: priv }, { data: q }] = await Promise.all([
    admin.from('trip_private').select('club_id').eq('trip_id', tripId).maybeSingle(),
    admin.from('trips').select('id, trip_code').eq('trip_code', setup.qualifierCode).maybeSingle(),
  ])
  const clubId = (priv as { club_id?: string | null } | null)?.club_id
  const qual = q as { id: string; trip_code: string } | null
  if (!clubId || !qual) return 'waiting'
  const [{ data: qPriv }, { data: rounds }] = await Promise.all([
    admin.from('trip_private').select('club_id').eq('trip_id', qual.id).maybeSingle(),
    admin.from('rounds').select('id, certified_at').eq('trip_id', qual.id),
  ])
  if ((qPriv as { club_id?: string | null } | null)?.club_id !== clubId) return 'waiting'
  const rs = (rounds ?? []) as { id: string; certified_at: string | null }[]
  if (!rs.length || rs.some(r => !r.certified_at)) return 'waiting'

  const [finish, { data: nrs }] = await Promise.all([
    readQualifierFinish(qual.trip_code),
    admin.from('round_no_returns').select('player_id').in('round_id', rs.map(r => r.id)),
  ])
  if (!finish) return 'waiting'
  const noReturn = new Set(((nrs ?? []) as { player_id: string }[]).map(n => n.player_id))
  const order = finish.filter(p => !noReturn.has(p.playerId))

  // Still on the list, and playing here (D209).
  const booking = bookingStore(admin)
  const rowIds = [...new Set(order.map(p => p.rowId).filter((r): r is string => !!r))]
  const rows = await booking.rowsByIds(clubId, rowIds)
  const playing = rows.filter(r => clubMay('play', { row: credentialsOf(r) }))
  const picked = qualifiedField(order, new Set(playing.map(r => r.id)), setup.qualify)
  if (picked.length < 2) return 'waiting'

  if (!(await claimFielding(admin, tripId, raw, now))) return 'already'
  try {
    const rowById = new Map(playing.map(r => [r.id, r]))
    // A name may be on the list twice; the event's names are one each (025).
    const used = new Set<string>()
    const inserts = await Promise.all(picked.map(async p => {
      const row = rowById.get(p.rowId!)!
      return { row, index: await booking.indexOf(row) }
    }))
    const toInsert = inserts.map(({ row, index }) => {
      let name = row.name
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${row.name} (${row.memberNumber ?? n})`
      used.add(name.toLowerCase())
      return {
        trip_id: tripId, name, handicap: index, club_member_id: row.id, claimed: !!row.userId,
        gender: row.gender ?? 'M', role: 'player', is_lead: false, team_id: null,
      }
    })
    const { data: made, error } = await admin.from('players').insert(toInsert).select('id, club_member_id')
    if (error || !made) throw error ?? new Error('no players')
    const playerOf = new Map((made as { id: string; club_member_id: string }[]).map(m => [m.club_member_id, m.id]))
    for (const { row } of inserts) {
      const pid = playerOf.get(row.id)
      if (pid && row.userId) await booking.linkAccount(row.userId, tripId, pid).catch(() => undefined)
    }
    const finishIds = picked.map(p => playerOf.get(p.rowId!)).filter((id): id is string => !!id)
    await writePlan(admin, tripId, setup, finishIds, now)
    return 'made'
  } catch (e) {
    await releaseFielding(admin, tripId)
    throw e
  }
}

/** Take the job: stamp `club.fieldingAt` where it is empty, or a claim gone stale. */
async function claimFielding(admin: SupabaseClient, tripId: string, raw: unknown, now: Date): Promise<boolean> {
  const r = raw as Record<string, unknown>
  const club = r.club as Record<string, unknown>
  const was = typeof club.fieldingAt === 'string' ? club.fieldingAt : null
  if (was && now.getTime() - new Date(was).getTime() < FIELDING_MS) return false
  let q = admin.from('trips').update({ bracket_setup: { ...r, club: { ...club, fieldingAt: now.toISOString() } } }).eq('id', tripId)
  q = was === null ? q.is('bracket_setup->club->>fieldingAt', null) : q.eq('bracket_setup->club->>fieldingAt', was)
  const { data, error } = await q.select('id')
  return !error && (data ?? []).length === 1
}

async function releaseFielding(admin: SupabaseClient, tripId: string): Promise<void> {
  const { data } = await admin.from('trips').select('bracket_setup').eq('id', tripId).maybeSingle()
  const raw = (data as { bracket_setup?: Record<string, unknown> } | null)?.bracket_setup
  const club = raw?.club as Record<string, unknown> | undefined
  if (!raw || !club) return
  const { fieldingAt: _gone, ...rest } = club
  void _gone
  await admin.from('trips').update({ bracket_setup: { ...raw, club: rest } }).eq('id', tripId)
}

/** The field made: `club.fieldAt` stamped and the draw plan set — read fresh and merged. */
async function writePlan(admin: SupabaseClient, tripId: string, setup: NonNullable<ReturnType<typeof readClubMatchPlay>>, finish: string[], now: Date): Promise<void> {
  const { data } = await admin.from('trips').select('bracket_setup').eq('id', tripId).maybeSingle()
  const raw = ((data as { bracket_setup?: Record<string, unknown> } | null)?.bracket_setup ?? {}) as Record<string, unknown>
  const club = { ...(raw.club as Record<string, unknown>) }
  delete club.fieldingAt
  const draw = qualifiedDrawPlan(setup, finish, irishToday(now))
  const { error } = await admin.from('trips').update({ bracket_setup: { ...raw, club: { ...club, fieldAt: now.toISOString() }, draw } }).eq('id', tripId)
  if (error) throw error
}

/**
 * Every club match play qualifying from this competition, asked to make its
 * field and draw — after the competition is certified. Fail-soft: a failure
 * is the next visit's or the night's to finish.
 */
export async function afterQualifierCertified(admin: SupabaseClient, code: string, now: Date, draw: (tripId: string) => Promise<unknown>): Promise<void> {
  const { data } = await admin.from('trips').select('id').eq('competition', 'club').eq('bracket_setup->qualifying->>eventCode', code)
  for (const t of (data ?? []) as { id: string }[]) {
    try {
      if (await makeQualifiedField(admin, t.id, now) === 'made') await draw(t.id)
    } catch (e) {
      console.error('qualified field failed:', t.id, e)
    }
  }
}
