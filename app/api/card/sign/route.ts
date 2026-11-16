import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runSign } from '../sign'
import { signStore } from '../store'

// POST /api/card/sign — `{ action, code, … }` with a Green Dot member's
// token: a club competition's cards, signed on the server (stage (d3)) —
// `finalise` (the group's card, its scores written and each player's
// signature started), `list` (cards to sign), `approve`, `mark`, `marker`
// and `send_back` (../sign.ts).

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runSign({ ...(body ?? {}), token, action: body?.action }, signStore(createAdminClient()), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('card sign failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
