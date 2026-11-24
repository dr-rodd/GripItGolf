import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { failWords, runChangeCompetition, runCopyCompetition, runNewCompetition, runNewMatchPlay, runReadMatchPlay, runReadCompetition } from '../competition'
import { runCalendarImport } from '../calendarImport'
import { readMatchPlayComp } from '../matchPlayStore'
import { readClubDraw } from '../matchPlayDraw'
import { competitionRouteStore } from './routeStore'

// POST /api/club/competition — `{ clubId, form }` with a Green Dot member's
// token: a verified club's owner or admin makes a competition (D162). The
// rules are ../competition.ts. Sets the maker's way through a members-only
// door on the way out.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { action?: unknown; clubId?: unknown; form?: unknown; code?: unknown; dates?: unknown; from?: unknown; rows?: unknown; confirmed?: unknown; batch?: unknown; year?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const store = competitionRouteStore(db)
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
    return NextResponse.json({ ok: false, error: failWords(body?.action) }, { status: 503, headers: NO_STORE })
  }
}
