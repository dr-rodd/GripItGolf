import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runCertify } from '../certify'
import { certifyStore } from '../certifyStore'

// POST /api/card/certify — `{ action, code, … }` with a club owner's or
// admin's token: a competition's `state` (who is accounted for, and the
// day's handicap changes), `no_return`, `undo_no_return`, `void`, `certify`
// and `reopen` (../certify.ts, stage (d4)).

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runCertify({ ...(body ?? {}), token, action: body?.action }, certifyStore(createAdminClient()), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('certify failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
