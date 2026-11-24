import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { writeMatchResult } from '../write'

// POST /api/feed/match — `{ matchIds }` with the phone's own sign-in (D300,
// D302): a knockout result was just recorded on this phone. Only the matches
// are named; each result is read back from the bracket and written to the
// feed by the server (D305). A phone that is not a member of the match's
// event is refused. Asked and never waited for.

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { matchIds?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  const ids = Array.isArray(body?.matchIds) ? (body!.matchIds as unknown[]).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20) : []
  if (!token || ids.length === 0) return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE })
  try {
    const db = createAdminClient()
    const { data: u, error } = await db.auth.getUser(token)
    if (error || !u.user) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE })
    const { data: matches } = await db.from('matchplay_matches').select('id, trip_id').in('id', ids)
    const rows = (matches ?? []) as { id: string; trip_id: string }[]
    const trips = [...new Set(rows.map(r => r.trip_id))]
    const { data: member } = trips.length
      ? await db.from('trip_members').select('trip_id').eq('user_id', u.user.id).in('trip_id', trips)
      : { data: [] }
    const mine = new Set(((member ?? []) as { trip_id: string }[]).map(m => m.trip_id))
    for (const r of rows) if (mine.has(r.trip_id)) await writeMatchResult(db, r.id)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    console.error('feed match failed:', e)
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE })
  }
}
