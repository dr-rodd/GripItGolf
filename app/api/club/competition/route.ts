import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { createStore } from '../../trip/create/store'
import { clubStore } from '../store'
import { runNewCompetition } from '../competition'

// POST /api/club/competition — `{ clubId, form }` with a Green Dot member's
// token: a verified club's owner or admin makes a competition (D162). The
// rules are ../competition.ts. Sets the maker's way through a members-only
// door on the way out.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { clubId?: unknown; form?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    const clubs = clubStore(db)
    const out = await runNewCompetition({ token, clubId: body?.clubId, form: body?.form }, {
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
    }, new Date())
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
