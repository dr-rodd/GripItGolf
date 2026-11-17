import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { createStore } from '../../trip/create/store'
import { clubStore } from '../store'
import { EntryNotReady, runCopyCompetition, runNewCompetition, type CompetitionStore } from '../competition'
import { isMissingColumn } from '../rows'
import { readEntryRulesOf } from '../entryRules'

// POST /api/club/competition — `{ clubId, form }` with a Green Dot member's
// token: a verified club's owner or admin makes a competition (D162). The
// rules are ../competition.ts. Sets the maker's way through a members-only
// door on the way out.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { action?: unknown; clubId?: unknown; form?: unknown; code?: unknown; dates?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const clubs = clubStore(db)
    const store: CompetitionStore = {
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
    }
    // Stage (k2): Copy to another date, and Repeat weekly.
    if (body?.action === 'copy') {
      const copied = await runCopyCompetition({ token, clubId: body.clubId, code: body.code, dates: body.dates }, store, new Date())
      return NextResponse.json(copied.body, { status: copied.status, headers: NO_STORE })
    }
    const out = await runNewCompetition({ token, clubId: body?.clubId, form: body?.form }, store, new Date())
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
