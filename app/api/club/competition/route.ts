import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { createStore } from '../../trip/create/store'
import { clubStore } from '../store'
import { EntryNotReady, runChangeCompetition, runCopyCompetition, runNewCompetition, runNewMatchPlay, runReadMatchPlay, runReadCompetition, type CompNow, type CompetitionStore } from '../competition'
import { parseTeeRules } from '@/lib/teeSheet'
import { readAgeDate } from '@/lib/clubMembership'
import { asRow, rowCols, withTicks, type RowRow } from '../rows'
import { missing095, readNotes, saveNote } from '../notesStore'
import { readPresets } from '../presetsStore'
import { runCalendarImport, type ImportStore } from '../calendarImport'
import { compFormFrom, type CompForm } from '@/lib/clubComp'
import { isMissingColumn } from '../rows'
import { readEntryRulesOf } from '../entryRules'
import { readMatchPlayComp } from '../matchPlayStore'
import { readClubDraw } from '../matchPlayDraw'

// POST /api/club/competition — `{ clubId, form }` with a Green Dot member's
// token: a verified club's owner or admin makes a competition (D162). The
// rules are ../competition.ts. Sets the maker's way through a members-only
// door on the way out.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { action?: unknown; clubId?: unknown; form?: unknown; code?: unknown; dates?: unknown; from?: unknown; rows?: unknown; confirmed?: unknown; batch?: unknown; year?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const clubs = clubStore(db)
    const store: ImportStore = {
      userFromToken: t => clubs.userFromToken(t),
      clubsOf: u => clubs.clubsOf(u),
      create: createStore(db),
      async insertItem(row) {
        const { data, error } = await db.from('itinerary_items').insert(row).select('id').single()
        if (error || !data) throw error ?? new Error('no item')
        return (data as { id: string }).id
      },
      async insertRound(row) {
        const { error } = await db.from('rounds').insert(row)
        if (error) throw error
      },
      async deleteTrip(tripId) { await db.from('trips').delete().eq('id', tripId) },
      newCode: () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''),
      newId: () => randomUUID(),
      compSource: code => readCompSource(db, code),
      logActivity: entries => clubs.logActivity ? clubs.logActivity(entries) : Promise.resolve(),
      categories: clubId => clubs.categories ? clubs.categories(clubId) : Promise.resolve([]),
      async setEntryRules(tripId, rules) {
        const { error } = await db.from('trip_private').update({ entry_rules: rules }).eq('trip_id', tripId)
        if (error) throw isMissingColumn(error) ? new EntryNotReady() : error
      },
      async setImportRef(tripId, ref) {
        const { error } = await db.from('trip_private').update({ import_ref: ref }).eq('trip_id', tripId)
        if (error && !missing095(error)) throw error
      },
      // Stage c1: the Clubhouse makes and changes competitions.
      club: clubId => clubs.club(clubId),
      rowOf: (clubId, userId) => clubs.rowOf ? clubs.rowOf(clubId, userId) : Promise.resolve(null),
      isStaff: userId => clubs.isStaff ? clubs.isStaff(userId) : Promise.resolve(false),
      compNow: code => readCompNow(db, code),
      async rowsByIds(clubId, ids) {
        if (!ids.length) return []
        const { data, error } = await withTicks(t => db.from('club_members').select(rowCols(t)).eq('club_id', clubId).in('id', ids))
        if (error) throw error
        return ((data ?? []) as unknown as RowRow[]).map(asRow)
      },
      async ageDate(clubId) {
        const { data } = await db.from('clubs').select('age_date').eq('id', clubId).maybeSingle()
        return readAgeDate((data as { age_date?: string | null } | null)?.age_date)
      },
      async overrides(clubId, code) {
        const { data, error } = await db.from('club_activity').select('member_id, changes').eq('club_id', clubId).eq('action', 'booking.override').not('member_id', 'is', null)
        if (error) return new Set<string>()
        return new Set(((data ?? []) as { member_id: string; changes: Record<string, unknown> | null }[]).filter(r => r.changes && code in r.changes).map(r => r.member_id))
      },
      applyChange: (c, change) => applyChange(db, c, change),
      // Stage c2: a calendar imported.
      notes: clubId => readNotes(db, clubId),
      saveNote: (clubId, note, by) => saveNote(db, clubId, note, by),
      presets: clubId => readPresets(db, clubId),
      async course(courseId) {
        const { data } = await db.from('courses').select('name, latitude, longitude').eq('id', courseId).maybeSingle()
        const c = data as { name: string; latitude: number | null; longitude: number | null } | null
        return c ? { name: c.name, lat: c.latitude === null ? null : Number(c.latitude), lng: c.longitude === null ? null : Number(c.longitude) } : null
      },
      clubComps: clubId => readClubComps(db, clubId),
    }
    // Stage c2, M12–M16: a calendar imported in the Clubhouse.
    if (body?.action === 'import.prompt' || body?.action === 'import.preview' || body?.action === 'import.rows') {
      const out = await runCalendarImport({ token, action: body.action, clubId: body.clubId, rows: body.rows, confirmed: body.confirmed, batch: body.batch, year: body.year }, store, new Date())
      return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
    }
    // Stage (k2): Copy to another date, and Repeat weekly.
    if (body?.action === 'copy') {
      const copied = await runCopyCompetition({ token, clubId: body.clubId, code: body.code, dates: body.dates }, store, new Date())
      return NextResponse.json(copied.body, { status: copied.status, headers: NO_STORE })
    }
    // Stage c1, M10–M11: a competition read into the Clubhouse's panel, and changed there.
    if (body?.action === 'read') {
      const read = await runReadCompetition({ token, clubId: body.clubId, code: body.code }, store)
      return NextResponse.json(read.body, { status: read.status, headers: NO_STORE })
    }
    if (body?.action === 'matchplay.read') {
      const read = await runReadMatchPlay({ token, clubId: body.clubId, code: body.code }, { ...store, matchPlayComp: code => readMatchPlayComp(db, code), matchPlayDraw: code => readClubDraw(code) }, new Date())
      return NextResponse.json(read.body, { status: read.status, headers: NO_STORE })
    }
    if (body?.action === 'change') {
      const changed = await runChangeCompetition({ token, clubId: body.clubId, code: body.code, form: body.form }, store, new Date())
      return NextResponse.json(changed.body, { status: changed.status, headers: NO_STORE })
    }
    // A club match play (Ross, 17 Nov 2026), made in the Clubhouse.
    const out = body?.action === 'matchplay.new'
      ? await runNewMatchPlay({ token, clubId: body.clubId, form: body.form }, store, new Date())
      : await runNewCompetition({ token, clubId: body?.clubId, form: body?.form, from: body?.from === 'clubhouse' ? 'clubhouse' : 'app' }, store, new Date())
    const res = NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
    if (out.status === 200 && out.doorCookie) {
      res.cookies.set(entryCookie(out.body.code), out.doorCookie, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: ENTRY_COOKIE_DAYS * 86_400,
      })
    }
    return res
  } catch (e) {
    console.error('competition failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not make the competition — try again.' }, { status: 503, headers: NO_STORE })
  }
}

/** A competition as it was made (stage (k2)): its club, name, day, course, board, tee sheet, and whether members only. */
async function readCompSource(db: ReturnType<typeof createAdminClient>, code: string) {
  const { data: trip } = await db.from('trips').select('id, name, start_date, leaderboards, competition, public_passcode_hash').eq('trip_code', code).maybeSingle()
  const t = trip as { id: string; name: string; start_date: string | null; leaderboards: unknown; competition: string | null; public_passcode_hash: string | null } | null
  if (!t || t.competition !== 'club') return null
  const [priv, entry, round] = await Promise.all([
    db.from('trip_private').select('club_id').eq('trip_id', t.id).maybeSingle(),
    readEntryRulesOf(db, t.id),
    db.from('rounds').select('course_id, scheduled_date, tee_sheet').eq('trip_id', t.id).order('round_number').limit(1).maybeSingle(),
  ])
  const clubId = (priv.data as { club_id?: string | null } | null)?.club_id
  const r = round.data as { course_id: string; scheduled_date: string | null; tee_sheet: unknown } | null
  if (!clubId || !r) return null
  const board = (Array.isArray(t.leaderboards) ? t.leaderboards : []).find(b => (b as { clubCompetition?: boolean }).clubCompetition) as { scoring?: unknown; handicapAllowance?: unknown } | undefined
  return {
    clubId, name: t.name, date: r.scheduled_date ?? t.start_date ?? '', courseId: r.course_id,
    board: board ?? null, teeSheet: r.tee_sheet, membersOnly: !!t.public_passcode_hash, entry,
  }
}

type Db = ReturnType<typeof createAdminClient>

/** A competition as it stands, for a change (stage c1, M11): its rows, sheet, bookings, and whether a card has started or it is certified. */
async function readCompNow(db: Db, code: string): Promise<CompNow | null> {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return null
  const { data: trip } = await db.from('trips').select('id, trip_code, name, leaderboards, competition, public_passcode_hash').eq('trip_code', code).maybeSingle()
  const t = trip as { id: string; trip_code: string; name: string; leaderboards: unknown; competition: string | null; public_passcode_hash: string | null } | null
  if (!t || t.competition !== 'club') return null
  const [priv, entry, round] = await Promise.all([
    db.from('trip_private').select('club_id').eq('trip_id', t.id).maybeSingle(),
    readEntryRulesOf(db, t.id),
    db.from('rounds').select('id, course_id, scheduled_date, tee_sheet, itinerary_item_id').eq('trip_id', t.id).order('round_number').limit(1).maybeSingle(),
  ])
  const clubId = (priv.data as { club_id?: string | null } | null)?.club_id
  const r = round.data as { id: string; course_id: string; scheduled_date: string | null; tee_sheet: unknown; itinerary_item_id: string | null } | null
  const rules = r ? parseTeeRules(r.tee_sheet) : null
  if (!clubId || !r || !r.scheduled_date || !rules) return null
  const [live, cert, seats] = await Promise.all([
    db.from('live_rounds').select('round_id', { count: 'exact', head: true }).eq('round_id', r.id),
    // Migration 091 — fail-soft: before it nothing is certified.
    db.from('rounds').select('certified_at').eq('id', r.id).maybeSingle(),
    db.from('tee_assignments').select('player_id, slot_index, players(name, club_member_id)').eq('round_id', r.id),
  ])
  if (seats.error) throw seats.error
  type Seat = { player_id: string; slot_index: number; players: { name: string; club_member_id: string | null } | { name: string; club_member_id: string | null }[] | null }
  return {
    tripId: t.id, roundId: r.id, itemId: r.itinerary_item_id, clubId, code: t.trip_code, name: t.name, date: r.scheduled_date, courseId: r.course_id,
    rules, leaderboards: Array.isArray(t.leaderboards) ? t.leaderboards : [], entry, membersOnly: !!t.public_passcode_hash,
    started: (live.count ?? 0) > 0,
    certified: !cert.error && !!(cert.data as { certified_at?: string | null } | null)?.certified_at,
    bookings: ((seats.data ?? []) as unknown as Seat[]).map(a => {
      const p = Array.isArray(a.players) ? a.players[0] : a.players
      return { playerId: a.player_id, rowId: p?.club_member_id ?? null, name: p?.name ?? 'A player', slot: a.slot_index }
    }),
  }
}

/**
 * A change written (stage c1, M11): who may enter first (the one write that
 * can be refused before 094), then the bookings moved to their tee times'
 * new numbers, then the round, its golf item and the event. A failure after
 * the bookings moved puts them back.
 */
async function applyChange(db: Db, c: CompNow, ch: import('../competition').CompChange): Promise<void> {
  const ent = await db.from('trip_private').update({ entry_rules: ch.entry }).eq('trip_id', c.tripId)
  if (ent.error && !(isMissingColumn(ent.error) && !ch.entry)) throw isMissingColumn(ent.error) ? new EntryNotReady() : ent.error
  const was = new Map(c.bookings.map(b => [b.playerId, b.slot]))
  const done: string[] = []
  try {
    for (const m of ch.moves) {
      const { error } = await db.from('tee_assignments').update({ slot_index: m.slot }).eq('round_id', c.roundId).eq('player_id', m.playerId)
      if (error) throw error
      done.push(m.playerId)
    }
    const rnd = await db.from('rounds').update({ tee_sheet: ch.teeSheet, scheduled_date: ch.date, course_id: ch.courseId }).eq('id', c.roundId)
    if (rnd.error) throw rnd.error
  } catch (e) {
    for (const pid of done) await db.from('tee_assignments').update({ slot_index: was.get(pid) }).eq('round_id', c.roundId).eq('player_id', pid)
    throw e
  }
  if (c.itemId) {
    const item = await db.from('itinerary_items').update({ tee_time: ch.firstTee, course_id: ch.courseId }).eq('id', c.itemId)
    if (item.error) throw item.error
  }
  const trip = await db.from('trips').update({ name: ch.name, start_date: ch.date, end_date: ch.date, leaderboards: ch.leaderboards }).eq('id', c.tripId)
  if (trip.error) throw trip.error
}

/**
 * Every competition under a club as its form, with the Ref a calendar file
 * gave it (stage c2) — three reads, whatever the season's size. The Ref
 * (095) is read fail-soft; before it nothing has one.
 */
async function readClubComps(db: Db, clubId: string): Promise<{ code: string; ref: string | null; name: string; date: string; form: CompForm | null }[]> {
  // The Ref is 095's and the entry rules 094's: each column asked for only while it is there.
  type Priv = { trip_id: string; entry_rules?: unknown; import_ref?: string | null }
  const readPriv = async (): Promise<Priv[] | null> => {
    for (const cols of ['trip_id, entry_rules, import_ref', 'trip_id, entry_rules', 'trip_id']) {
      const { data, error } = await db.from('trip_private').select(cols).eq('club_id', clubId)
      if (!error) return (data ?? []) as unknown as Priv[]
      if (!missing095(error) && !isMissingColumn(error)) throw error
    }
    return null
  }
  const priv = await readPriv()
  if (!priv) return []
  if (!priv.length) return []
  const ids = priv.map(p => p.trip_id)
  const [trips, rounds] = await Promise.all([
    db.from('trips').select('id, trip_code, name, leaderboards, competition, public_passcode_hash').in('id', ids).eq('competition', 'club'),
    db.from('rounds').select('trip_id, course_id, scheduled_date, tee_sheet, round_number').in('trip_id', ids).order('round_number'),
  ])
  if (trips.error) return []
  const roundOf = new Map<string, { course_id: string; scheduled_date: string | null; tee_sheet: unknown }>()
  for (const r of (rounds.data ?? []) as { trip_id: string; course_id: string; scheduled_date: string | null; tee_sheet: unknown }[]) if (!roundOf.has(r.trip_id)) roundOf.set(r.trip_id, r)
  const privOf = new Map(priv.map(p => [p.trip_id, p]))
  return ((trips.data ?? []) as { id: string; trip_code: string; name: string; leaderboards: unknown; public_passcode_hash: string | null }[]).flatMap(t => {
    const r = roundOf.get(t.id)
    if (!r?.scheduled_date) return []
    const board = (Array.isArray(t.leaderboards) ? t.leaderboards : []).find(b => (b as { clubCompetition?: boolean }).clubCompetition) as { scoring?: unknown; handicapAllowance?: unknown } | undefined
    const p = privOf.get(t.id)
    return [{
      code: t.trip_code, ref: p?.import_ref ?? null, name: t.name, date: r.scheduled_date,
      form: compFormFrom({ name: t.name, date: r.scheduled_date, courseId: r.course_id, board: board ?? null, teeSheet: r.tee_sheet, membersOnly: !!t.public_passcode_hash, entry: p?.entry_rules ?? null }),
    }]
  })
}
