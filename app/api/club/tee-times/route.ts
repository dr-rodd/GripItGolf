import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runTeeTimes } from '../teeTimes'
import { teeTimesStore } from '../teeTimesStore'

// POST /api/club/tee-times — `{ action, clubId, … }` with a Green Dot
// member's token: a club's casual tee sheet for its members (`day`, `names`,
// `book`, `cancel`) and its Clubhouse (`office.*`). The rules are
// lib/clubTeeSheet.ts, the logic ../teeTimes.ts.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runTeeTimes({ ...(body ?? {}), token, action: body?.action }, teeTimesStore(createAdminClient()), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('tee times failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
