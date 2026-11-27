import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runInterclub } from './interclub'
import { interclubStore } from './store'

// POST /api/interclub — `{ action, … }`: the ties set up in a competition
// (`ties`, anybody), and with a Green Dot member's token a team captain's
// clubs and their name in the draws (`mine`, `name.get`, `name.set`), setting
// a match up (`setup`), and running one (`tie`, `take`, `members`,
// `player.*`, `match.side`, `match.settle`, `settle`, `playoff`). The rules
// are lib/interclubTie.ts, the logic ./interclub.ts.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runInterclub({ token, body: body ?? {} }, interclubStore(createAdminClient()), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('interclub failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
