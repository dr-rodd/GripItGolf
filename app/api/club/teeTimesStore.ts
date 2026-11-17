import type { createAdminClient } from '@/lib/supabase-admin'
import { parseTeeRules, teeClocks } from '@/lib/teeSheet'
import { readEntryRules, readAgeDate } from '@/lib/clubMembership'
import { readCasualSettings, type CasualSettings } from '@/lib/clubTeeSheet'
import { asRow, clubStore, readCategories, rowCols, withTicks, type RowRow } from './store'
import { readNotes } from './notesStore'
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
    async comps(clubId, from, to): Promise<TeeComp[]> {
      const { data: priv, error } = await db.from('trip_private').select('trip_id, entry_rules').eq('club_id', clubId)
      // Before 094 there is no entry_rules column: ask again without it.
      const privRows = error
        ? (((await db.from('trip_private').select('trip_id').eq('club_id', clubId)).data ?? []) as { trip_id: string; entry_rules?: unknown }[])
        : ((priv ?? []) as { trip_id: string; entry_rules?: unknown }[])
      if (!privRows.length) return []
      const { data: trips, error: te } = await db.from('trips').select('id, trip_code, name, start_date')
        .in('id', privRows.map(p => p.trip_id)).eq('competition', 'club').gte('start_date', from).lte('start_date', to)
      if (te || !trips?.length) return []
      const tripRows = trips as { id: string; trip_code: string; name: string; start_date: string }[]
      const [{ data: rounds }, certs] = await Promise.all([
        db.from('rounds').select('id, trip_id, course_id, scheduled_date, tee_sheet').in('trip_id', tripRows.map(t => t.id)),
        db.from('rounds').select('trip_id, certified_at').in('trip_id', tripRows.map(t => t.id)),
      ])
      const roundRows = (rounds ?? []) as { id: string; trip_id: string; course_id: string | null; scheduled_date: string | null; tee_sheet?: unknown }[]
      const certified = new Set(certs.error ? [] : ((certs.data ?? []) as { trip_id: string; certified_at: string | null }[]).filter(c => c.certified_at).map(c => c.trip_id))
      return tripRows.map(t => {
        const r = roundRows.find(x => x.trip_id === t.id)
        const rules = parseTeeRules(r?.tee_sheet)
        return {
          code: t.trip_code, name: t.name, date: r?.scheduled_date ?? t.start_date, courseId: r?.course_id ?? null,
          clocks: rules ? teeClocks(rules) : [],
          entry: readEntryRules(privRows.find(p => p.trip_id === t.id)?.entry_rules),
          certified: certified.has(t.id),
        }
      })
    },
    async blocks(clubId, from, to) {
      return (await readNotes(db, clubId, { from, to, membersOnly: true, blocking: true })) ?? []
    },
    async ageDate(clubId) {
      const { data } = await db.from('clubs').select('age_date').eq('id', clubId).maybeSingle()
      return readAgeDate((data as { age_date?: string | null } | null)?.age_date)
    },
  }
}
