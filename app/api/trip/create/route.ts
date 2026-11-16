import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { runCreate } from './create'
import { createStore } from './store'

// POST /api/trip/create — `{ row, adminPin?, publicPin?, clubId? }` with the phone's Supabase token as
// `Authorization: Bearer …` (a Green Dot member's, D135 — a phone with no
// account is refused, 403): makes a new event's row and the phone's
// membership of it (row-level security, stage 3). Answers in supabase-js's own
// shape, `{ data: { id }, error }`, so the create forms read it as they read
// their insert. The rules are ./create.ts.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { row?: unknown; adminPin?: unknown; publicPin?: unknown; clubId?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const store = createStore(db)
    const out = await runCreate({ token, row: body?.row, adminPin: body?.adminPin, publicPin: body?.publicPin, clubId: body?.clubId }, store, new Date())
    const res = NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
    if (out.status === 200 && out.doorCookie) {
      const code = String((body?.row as { trip_code?: unknown } | undefined)?.trip_code ?? '')
      res.cookies.set(entryCookie(code), out.doorCookie, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: ENTRY_COOKIE_DAYS * 86_400,
      })
    }
    return res
  } catch (e) {
    console.error('create failed:', e)
    return NextResponse.json({ data: null, error: { message: 'Could not create the event — try again.' } }, { status: 503, headers: NO_STORE })
  }
}
