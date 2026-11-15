import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { writeRoundSummaries } from '../summaries'
import { summaryDeps } from '../store'

// POST /api/stats/card — `{ code, roundId }` with the phone's token: the
// round's card summaries written again from its signed scores (stage (f),
// migration 088). Asked, without waiting, by a phone that has just
// committed or voided a card in the event; any member of the event may ask,
// and the answer is only ever what the scores already say.

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { code?: unknown; roundId?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
  const roundId = typeof body?.roundId === 'string' ? body.roundId : ''
  if (!token || !/^[A-Z0-9]{4,12}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(roundId)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE })
  }
  try {
    const db = createAdminClient()
    const { data: u, error } = await db.auth.getUser(token)
    if (error || !u.user) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE })
    const { data: trip } = await db.from('trips').select('id').eq('trip_code', code).maybeSingle()
    const tripId = (trip as { id?: string } | null)?.id
    if (!tripId) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE })
    const { data: member } = await db.from('trip_members').select('trip_id').eq('user_id', u.user.id).eq('trip_id', tripId).maybeSingle()
    if (!member) return NextResponse.json({ ok: false }, { status: 403, headers: NO_STORE })
    const out = await writeRoundSummaries(code, roundId, summaryDeps(db), new Date())
    return NextResponse.json({ ok: true, ...out }, { headers: NO_STORE })
  } catch (e) {
    console.error('card summary failed:', e)
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE })
  }
}
