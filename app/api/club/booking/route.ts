import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { runBooking } from '../booking'
import { logTiming, startTimer } from '@/lib/timing'
import { bookingStore } from '../bookingStore'

// POST /api/club/booking — `{ action, code, … }` with a Green Dot member's
// token: a club competition's `state`, `names`, `book` and `withdraw`
// (../booking.ts). Every answer to a member on the club's list carries the
// members-only door's cookie (D164), so the competition opens for them.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const took = startTimer()
    const out = await runBooking({ ...(body ?? {}), token, action: body?.action }, bookingStore(createAdminClient()), new Date())
    const res = NextResponse.json(out.body, { status: out.status, headers: { ...NO_STORE, 'Server-Timing': logTiming('booking', body?.action, took(), out.status) } })
    if (out.status === 200 && out.door) {
      res.cookies.set(entryCookie(out.door.code), out.door.value, {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: ENTRY_COOKIE_DAYS * 86_400,
      })
    }
    return res
  } catch (e) {
    console.error('booking failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
