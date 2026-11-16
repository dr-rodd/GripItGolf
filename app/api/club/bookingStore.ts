import type { createAdminClient } from '@/lib/supabase-admin'
import { entryToken } from '@/lib/pinHash'
import { parseTeeRules } from '@/lib/teeSheet'
import { handicapStore } from '../handicaps/store'
import { setIndex } from '../handicaps/handicaps'
import { serviceStore } from '../entry/store'
import { ROW_COLS, asRow, clubStore, type RowRow } from './store'
import type { BookingStore, CompRecord } from './booking'
import { readRoundLock, readSignatures } from '../card/signatures'
import { signedOff } from '../card/sign'

// A club competition's booking, on the service role (stage (d2)). The
// competition is read by its code and must be a verified club's; every read
// of 089's columns fails soft — before it, nothing is a competition.

type Db = ReturnType<typeof createAdminClient>

/** A verified club's competition by its code, with its one round and its sheet — or null. */
export async function readCompetition(db: Db, code: string): Promise<(CompRecord & { name: string; courseId: string }) | null> {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return null
  const { data: t, error } = await db.from('trips').select('id, trip_code, name, competition, public_passcode_hash').eq('trip_code', code).maybeSingle()
  const trip = (error ? null : t) as { id: string; trip_code: string; name: string; competition?: string | null; public_passcode_hash?: string | null } | null
  if (!trip || trip.competition !== 'club') return null
  const [{ data: priv }, { data: round }] = await Promise.all([
    db.from('trip_private').select('club_id').eq('trip_id', trip.id).maybeSingle(),
    db.from('rounds').select('id, scheduled_date, tee_sheet, course_id').eq('trip_id', trip.id).order('round_number').limit(1).maybeSingle(),
  ])
  const clubId = (priv as { club_id?: string | null } | null)?.club_id
  const r = round as { id: string; scheduled_date: string | null; tee_sheet?: unknown; course_id: string } | null
  const rules = r ? parseTeeRules(r.tee_sheet) : null
  if (!clubId || !r || !r.scheduled_date || !rules) return null
  const { data: club } = await db.from('clubs').select('verified_at').eq('id', clubId).maybeSingle()
  if (!(club as { verified_at?: string | null } | null)?.verified_at) return null
  return {
    tripId: trip.id, code: trip.trip_code, name: trip.name, clubId, roundId: r.id, date: r.scheduled_date, rules, courseId: r.course_id,
    publicHash: trip.public_passcode_hash ?? null,
  }
}

export function bookingStore(db: Db): BookingStore {
  const clubs = clubStore(db)
  const handicaps = handicapStore(db)
  const entry = serviceStore(db)
  return {
    userFromToken: t => clubs.userFromToken(t),
    competition: code => readCompetition(db, code),
    async myRow(clubId, userId) {
      const { data } = await db.from('club_members').select(ROW_COLS).eq('club_id', clubId).eq('user_id', userId).is('removed_at', null).limit(1)
      const row = ((data ?? []) as RowRow[])[0]
      return row ? asRow(row) : null
    },
    async rowsByIds(clubId, ids) {
      if (ids.length === 0) return []
      const { data, error } = await db.from('club_members').select(ROW_COLS).eq('club_id', clubId).in('id', ids).is('removed_at', null)
      if (error) throw error
      return ((data ?? []) as RowRow[]).map(asRow)
    },
    async searchRows(clubId, q, limit) {
      const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`
      const { data, error } = await db.from('club_members').select('id, name, user_id').eq('club_id', clubId).is('removed_at', null)
        .ilike('name', like).order('name').limit(limit)
      return error ? [] : ((data ?? []) as { id: string; name: string; user_id: string | null }[]).map(r => ({ id: r.id, name: r.name, linked: !!r.user_id }))
    },
    async indexOf(row) {
      return row.userId ? handicaps.accountIndex(row.userId) : handicaps.rowIndex(row.id)
    },
    async players(tripId) {
      const { data, error } = await db.from('players').select('id, club_member_id').eq('trip_id', tripId)
      if (error) throw error
      return ((data ?? []) as { id: string; club_member_id: string | null }[]).map(p => ({ id: p.id, clubMemberId: p.club_member_id }))
    },
    async bookings(roundId) {
      const { data, error } = await db.from('tee_assignments').select('player_id, slot_index, booked_by').eq('round_id', roundId)
      if (error) throw error
      return ((data ?? []) as { player_id: string; slot_index: number; booked_by: string | null }[])
        .map(b => ({ playerId: b.player_id, slot: b.slot_index, bookedBy: b.booked_by }))
    },
    async insertPlayer(row) {
      const { data, error } = await db.from('players').insert({ ...row, role: 'player', is_lead: false, team_id: null }).select('id').single()
      if (error || !data) throw error ?? new Error('no player')
      return (data as { id: string }).id
    },
    async insertBookings(rows) {
      const { error } = await db.from('tee_assignments').insert(rows)
      if (error?.code === '23505') return 'clash'
      if (error) throw error
      return 'ok'
    },
    async deleteBookings(roundId, playerIds) {
      const { error } = await db.from('tee_assignments').delete().eq('round_id', roundId).in('player_id', playerIds)
      if (error) throw error
    },
    async deletePlayerIfUnplayed(playerId, roundId) {
      const [live, done] = await Promise.all([
        db.from('live_scores').select('player_id', { count: 'exact', head: true }).eq('player_id', playerId).eq('round_id', roundId),
        db.from('scores').select('player_id', { count: 'exact', head: true }).eq('player_id', playerId).eq('round_id', roundId),
      ])
      if (live.error || done.error || (live.count ?? 0) > 0 || (done.count ?? 0) > 0) return
      await db.from('players').delete().eq('id', playerId)
    },
    linkAccount: (userId, tripId, playerId) => entry.linkPlayer!(userId, tripId, playerId),
    doorToken: c => (c.publicHash ? entryToken(c.publicHash, c.code) : null),
    async setIndexFromCard(row, value, by, roundId) {
      await setIndex(handicaps, row.userId ? { userId: row.userId } : { memberId: row.id }, value, by, 'start_sheet', roundId)
      // Everywhere: this row's players in every competition — but never one
      // whose card has started, whose snapshot is its own.
      const { data } = await db.from('players').select('id').eq('club_member_id', row.id)
      const ids = ((data ?? []) as { id: string }[]).map(p => p.id)
      if (ids.length === 0) return
      const { data: locked } = await db.from('live_player_locks').select('player_id').in('player_id', ids)
      const started = new Set(((locked ?? []) as { player_id: string }[]).map(l => l.player_id))
      const open = ids.filter(id => !started.has(id))
      if (open.length > 0) {
        const { error } = await db.from('players').update({ handicap: value }).in('id', open)
        if (error) throw error
      }
    },
  }
}

/** Who is booked on a competition's sheet, and where each card stands — the competition page's read. */
export interface CompSheet {
  seats: { playerId: string; rowId: string | null; name: string; handicap: number | null; slot: number; bookedBy: string | null }[]
  /** Players on a card still open, and on a card signed. */
  onCourse: string[]
  signed: string[]
  /**
   * Stage (d3): of the cards signed, those final — the player's approval and
   * a marker's — and those still waiting on one. Before migration 090 a card
   * finalised is final, as it was.
   */
  final: string[]
  waiting: string[]
  /** Stage (d4): booked players marked No return, and when the round was certified — none before 091. */
  noReturns: string[]
  certifiedAt: string | null
  courseName: string | null
}

export async function readCompSheet(db: Db, c: { tripId: string; roundId: string; courseId: string }): Promise<CompSheet> {
  const [assign, players, cards, course] = await Promise.all([
    db.from('tee_assignments').select('player_id, slot_index, booked_by').eq('round_id', c.roundId),
    db.from('players').select('id, name, handicap, club_member_id').eq('trip_id', c.tripId),
    db.from('live_rounds').select('id, status').eq('round_id', c.roundId),
    db.from('courses').select('name').eq('id', c.courseId).maybeSingle(),
  ])
  const byId = new Map(((players.data ?? []) as { id: string; name: string; handicap: number | null; club_member_id: string | null }[]).map(p => [p.id, p]))
  const seats = ((assign.data ?? []) as { player_id: string; slot_index: number; booked_by: string | null }[]).flatMap(a => {
    const p = byId.get(a.player_id)
    return p ? [{ playerId: p.id, rowId: p.club_member_id, name: p.name, handicap: p.handicap === null ? null : Number(p.handicap), slot: a.slot_index, bookedBy: a.booked_by }] : []
  })
  const liveCards = (cards.data ?? []) as { id: string; status: string }[]
  const locks = liveCards.length
    ? ((await db.from('live_player_locks').select('live_round_id, player_id').in('live_round_id', liveCards.map(l => l.id))).data ?? []) as { live_round_id: string; player_id: string }[]
    : []
  const statusOf = new Map(liveCards.map(l => [l.id, l.status]))
  const onCourse = locks.filter(l => statusOf.get(l.live_round_id) === 'active').map(l => l.player_id)
  const signed = locks.filter(l => statusOf.get(l.live_round_id) === 'finalised').map(l => l.player_id)
  const [sigs, lock] = await Promise.all([readSignatures(db, c.roundId), readRoundLock(db, c.roundId)])
  const final = sigs === null ? signed : sigs.filter(signedOff).map(x => x.playerId)
  const waiting = sigs === null ? [] : sigs.filter(x => !signedOff(x)).map(x => x.playerId)
  return { seats, onCourse, signed, final, waiting, noReturns: lock.noReturns, certifiedAt: lock.certifiedAt, courseName: (course.data as { name?: string } | null)?.name ?? null }
}
