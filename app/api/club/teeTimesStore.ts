import type { createAdminClient } from '@/lib/supabase-admin'
import { opensAt, parseTeeRules, teeClocks } from '@/lib/teeSheet'
import { memberSees } from '@/lib/clubEvents'
import { readEntryRules, readAgeDate } from '@/lib/clubMembership'
import { readCasualSettings, type CasualSettings } from '@/lib/clubTeeSheet'
import { asRow, clubStore, readCategories, rowCols, withTicks, type RowRow } from './store'
import { readClubHidden, readMemberHiddenOf, readNotes } from './notesStore'
import { readClubEvents } from './store'
import { TeeSheetNotReady, type StoredBooking, type TeeComp, type TeeTimesStore } from './teeTimes'

// A club's casual tee sheet on the service role. Migration 096 is read
// fail-soft: before it there are no bookings (the sheet says it is not set
// up yet), the settings are the defaults, every membership books and no
// event takes the sheet.

type Db = ReturnType<typeof createAdminClient>

/** A table or column 096 makes, not there yet. */
export function missing096(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703' || e.code === 'PGRST204')
}

type BookingRow = { id: string; play_on: string; tee_time: string; seat: number; member_id: string | null; guest_name: string | null; booked_by: string | null }
const asBooking = (r: BookingRow): StoredBooking => ({ id: r.id, date: r.play_on, time: r.tee_time, seat: r.seat, memberId: r.member_id, guestName: r.guest_name, bookedBy: r.booked_by })

export function teeTimesStore(db: Db): TeeTimesStore {
  const clubs = clubStore(db)
  return {
    userFromToken: t => clubs.userFromToken(t),
    readerFromToken: t => clubs.readerFromToken ? clubs.readerFromToken(t) : clubs.userFromToken(t),
    club: id => clubs.club(id),
    rowOf: (clubId, userId) => clubs.rowOf ? clubs.rowOf(clubId, userId) : Promise.resolve(null),
    isStaff: userId => clubs.isStaff ? clubs.isStaff(userId) : Promise.resolve(false),
    logActivity: entries => clubs.logActivity ? clubs.logActivity(entries) : Promise.resolve(),
    async settings(clubId) {
      const [{ data, error }, probe] = await Promise.all([
        db.from('clubs').select('tee_settings').eq('id', clubId).maybeSingle(),
        db.from('club_tee_bookings').select('id', { count: 'exact', head: true }).eq('club_id', clubId).limit(1),
      ])
      return {
        settings: readCasualSettings(error ? null : (data as { tee_settings?: unknown } | null)?.tee_settings),
        ready: !error && !probe.error,
      }
    },
    async saveSettings(clubId, s: CasualSettings) {
      const { error } = await db.from('clubs').update({ tee_settings: s }).eq('id', clubId)
      if (error) { if (missing096(error)) throw new TeeSheetNotReady(); throw error }
    },
    async place(courseId) {
      const { data } = await db.from('courses').select('latitude, longitude').eq('id', courseId).maybeSingle()
      const p = data as { latitude: number | null; longitude: number | null } | null
      return p ? { lat: p.latitude, lng: p.longitude } : null
    },
    async categories(clubId) {
      const [cats, { data, error }] = await Promise.all([
        readCategories(db, clubId),
        db.from('club_categories').select('id, books_tee_times').eq('club_id', clubId),
      ])
      const books = new Map(error ? [] : ((data ?? []) as { id: string; books_tee_times: boolean }[]).map(r => [r.id, r.books_tee_times]))
      return cats.map(c => ({ ...c, booksTeeTimes: books.get(c.id) ?? true }))
    },
    async setBooks(clubId, categoryId, books) {
      const { error } = await db.from('club_categories').update({ books_tee_times: books }).eq('id', categoryId).eq('club_id', clubId)
      if (error) { if (missing096(error)) throw new TeeSheetNotReady(); throw error }
    },
    async bookings(clubId, from, to) {
      const { data, error } = await db.from('club_tee_bookings')
        .select('id, play_on, tee_time, seat, member_id, guest_name, booked_by')
        .eq('club_id', clubId).gte('play_on', from).lte('play_on', to)
        .order('play_on').order('tee_time').order('seat').limit(5000)
      if (error) { if (missing096(error)) return null; throw error }
      return ((data ?? []) as BookingRow[]).map(asBooking)
    },
    async insertBookings(rows) {
      const { error } = await db.from('club_tee_bookings').insert(rows)
      if (!error) return 'ok'
      if (error.code === '23505') return 'clash'
      if (missing096(error)) throw new TeeSheetNotReady()
      throw error
    },
    async deleteBookings(clubId, ids) {
      if (!ids.length) return
      const { error } = await db.from('club_tee_bookings').delete().eq('club_id', clubId).in('id', ids)
      if (error) throw error
    },
    async moveBookings(clubId, moves) {
      for (const m of moves) {
        const { error } = await db.from('club_tee_bookings').update({ play_on: m.date, tee_time: m.time, seat: m.seat }).eq('id', m.id).eq('club_id', clubId)
        if (error?.code === '23505') return 'clash'
        if (error) throw error
      }
      return 'ok'
    },
    async rowsByIds(clubId, ids) {
      if (!ids.length) return []
      const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('club_id', clubId).in('id', ids).is('removed_at', null))
      if (error) throw error
      return ((data ?? []) as unknown as RowRow[]).map(asRow)
    },
    async searchRows(clubId, q, limit) {
      const like = `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`
      const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('club_id', clubId).is('removed_at', null).ilike('name', like).order('name').limit(limit))
      return error ? [] : ((data ?? []) as unknown as RowRow[]).map(asRow)
    },
    async comps(clubId, from, to, opts = {}): Promise<TeeComp[]> {
      // MO3 (D282): the club's competitions in the days asked, with their
      // round, in one read; the entry rules (094) and the certified stamp
      // (091) asked for with them, and without them when either is missing.
      type R = { id: string; trip_id?: string; course_id: string | null; scheduled_date: string | null; tee_sheet?: unknown; certified_at?: string | null }
      type T = { id: string; trip_code: string; name: string; start_date: string; rounds?: R[] }
      type P = { trip_id: string; entry_rules?: unknown; trips: T | T[] | null }
      const ask = (full: boolean) => db.from('trip_private')
        .select(`trip_id, ${full ? 'entry_rules, ' : ''}trips!inner(id, trip_code, name, start_date, competition, rounds(id, course_id, scheduled_date, tee_sheet${full ? ', certified_at' : ''}))`)
        .eq('club_id', clubId).eq('trips.competition', 'club').gte('trips.start_date', from).lte('trips.start_date', to)
      let res = await ask(true)
      if (res.error) res = await ask(false)
      if (res.error) return []
      const comps = ((res.data ?? []) as unknown as P[]).flatMap(p => {
        const t = Array.isArray(p.trips) ? p.trips[0] : p.trips
        if (!t) return []
        const r = (t.rounds ?? [])[0]
        const rules = parseTeeRules(r?.tee_sheet)
        const date = r?.scheduled_date ?? t.start_date
        return [{
          code: t.trip_code, name: t.name, date, courseId: r?.course_id ?? null,
          clocks: rules ? teeClocks(rules) : [],
          entry: readEntryRules(p.entry_rules),
          certified: !!(t.rounds ?? []).find(x => x.certified_at),
          roundId: r?.id ?? null,
          opensAt: opts.seats && rules ? opensAt(rules, date)?.getTime() ?? null : null,
        }]
      })
      // D286: who is on each time, for the calendar's "Booked in at … with:" — one read of the seats, one of the names.
      if (opts.seats) {
        const roundIds = comps.map(c => c.roundId).filter((x): x is string => !!x)
        const seats = roundIds.length ? await db.from('tee_assignments').select('round_id, player_id, slot_index').in('round_id', roundIds) : { data: [] }
        const rows = (seats.data ?? []) as { round_id: string; player_id: string; slot_index: number }[]
        const ids = [...new Set(rows.map(s => s.player_id))]
        const players = ids.length ? await db.from('players').select('id, name, club_member_id').in('id', ids) : { data: [] }
        const who = new Map(((players.data ?? []) as { id: string; name: string; club_member_id?: string | null }[]).map(p => [p.id, p]))
        for (const c of comps) {
          (c as TeeComp).seats = rows.filter(s => s.round_id === c.roundId).flatMap(s => {
            const p = who.get(s.player_id)
            const clock = c.clocks[s.slot_index]
            return p && clock ? [{ memberId: p.club_member_id ?? null, name: p.name, clock }] : []
          })
        }
      }
      return comps.map(({ roundId: _r, ...c }) => c)
    },
    async blocks(clubId, from, to) {
      return (await readNotes(db, clubId, { from, to, membersOnly: true, blocking: true })) ?? []
    },
    async events(clubId, userId, from, to) {
      const [notes, clubHidden, mine] = await Promise.all([
        readNotes(db, clubId, { from, to, membersOnly: true }),
        readClubHidden(db, clubId).catch(() => []),
        readMemberHiddenOf(db, userId).catch(() => []),
      ])
      return (notes ?? []).filter(n => memberSees(n, clubHidden, mine))
    },
    async golfEvents(clubId) {
      const events = await readClubEvents(db, clubId).catch(() => [])
      return events.filter(e => !e.competition).map(e => ({ code: e.code, name: e.name, startDate: e.startDate, endDate: e.endDate }))
    },
    async ageDate(clubId) {
      const { data } = await db.from('clubs').select('age_date').eq('id', clubId).maybeSingle()
      return readAgeDate((data as { age_date?: string | null } | null)?.age_date)
    },
  }
}
