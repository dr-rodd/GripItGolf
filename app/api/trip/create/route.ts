import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { writeLeadEmail } from '@/lib/leadEmail'
import { runCreate, type CreateStore } from './create'

// POST /api/trip/create — `{ row, adminPin?, publicPin? }` with the phone's Supabase token as
// `Authorization: Bearer …` (a Green Dot member's, D135 — a phone with no
// account is refused, 403): makes a new event's row and the phone's
// membership of it (row-level security, stage 3). Answers in supabase-js's own
// shape, `{ data: { id }, error }`, so the create forms read it as they read
// their insert. The rules are ./create.ts.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { row?: unknown; adminPin?: unknown; publicPin?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const db = createAdminClient()
    // The user the token names, kept for the member check — one read, not two.
    let user: { id: string; is_anonymous?: boolean; email?: string; email_confirmed_at?: string; confirmed_at?: string } | null = null
    const store: CreateStore = {
      async userFromToken(t) {
        const { data, error } = await db.auth.getUser(t)
        user = error ? null : data.user ?? null
        return user?.id ?? null
      },
      async isMember(userId) {
        const u = user
        if (!u || u.id !== userId) return false
        return !u.is_anonymous && !!u.email && !!(u.email_confirmed_at ?? u.confirmed_at)
      },
      async insertTrip(row) {
        const { data, error } = await db.from('trips').insert(row).select('id').single()
        if (error || !data) return { error: { message: error?.message ?? 'No row came back.', code: error?.code } }
        return { id: (data as { id: string }).id }
      },
      async writeMembership(userId, tripId, m) {
        const { error } = await db.from('trip_members').upsert({
          user_id: userId, trip_id: tripId, role: m.role, player_id: m.playerId,
          organiser_until: m.organiserUntil, updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,trip_id' })
        if (error) throw error
      },
      writeLeadEmail: (tripId, email) => writeLeadEmail(db, tripId, email),
      async deleteTrip(tripId) {
        await db.from('trips').delete().eq('id', tripId)
      },
      async recordOwner(userId, tripId) {
        const { data, error } = await db.auth.admin.getUserById(userId)
        const u = error ? null : data.user
        if (!u || u.is_anonymous || !u.email || !(u.email_confirmed_at ?? u.confirmed_at)) return
        const now = new Date().toISOString()
        const { error: e } = await db.from('trip_private')
          .upsert({ trip_id: tripId, owner_id: userId, owner_claimed_at: now, updated_at: now }, { onConflict: 'trip_id' })
        // Before migration 085 there is no owner column: the event is made all the same.
        if (e && e.code !== '42703' && e.code !== 'PGRST204') throw e
      },
    }
    const out = await runCreate({ token, row: body?.row, adminPin: body?.adminPin, publicPin: body?.publicPin }, store, new Date())
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
