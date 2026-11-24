import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { runMatchPlayEntry } from '../matchPlayEntry'


import { matchPlayEntryStore } from './routeStore'

// POST /api/club/matchplay — `{ action, code, … }` with a Green Dot member's
// token: a club match play's `state`, `enter`, `withdraw`, a pair's
// `names`, `join` and `partner` (stage 4), and the
// Clubhouse's `office.withdraw` (../matchPlayEntry.ts). Every answer to a
// member on the club's list carries the members-only door's cookie (D164).

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const store = matchPlayEntryStore(db)
    const out = await runMatchPlayEntry({ ...(body ?? {}), token, action: body?.action }, store, new Date())
    const res = NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
    if (out.status === 200 && out.door) {
      res.cookies.set(entryCookie(out.door.code), out.door.value, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: ENTRY_COOKIE_DAYS * 86_400,
      })
    }
    return res
  } catch (e) {
    console.error('match play entry failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
