import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { runCreate, type CreateStore } from './create'

// POST /api/trip/create — `{ row, adminPin?, publicPin? }` with the phone's Supabase token as
// `Authorization: Bearer …`: makes a new event's row and the phone's
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
    const store: CreateStore = {
      async userFromToken(t) {
        const { data, error } = await db.auth.getUser(t)
        return error ? null : data.user?.id ?? null
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
      async deleteTrip(tripId) {
        await db.from('trips').delete().eq('id', tripId)
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
