import { logTiming, startTimer } from '@/lib/timing'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runClub } from './club'
import { clubStore } from './store'
import { addressOf } from '../entry/store'

// POST /api/club — `{ action, … }` with a Green Dot member's Supabase token
// as `Authorization: Bearer …`: a club's list, its codes, linking an account
// to it (stage (c)). The rules are ./club.ts; this file is the plumbing.
// Nothing anybody needs to join, play, score or watch comes through here.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  const took = startTimer()
  try {
    const out = await runClub({ ...(body ?? {}), token, action: body?.action, address: addressOf(req) }, clubStore(createAdminClient()), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: { ...NO_STORE, 'Server-Timing': logTiming('club', body?.whole === true ? 'home.whole' : body?.action, took(), out.status) } })
  } catch (e) {
    console.error('club failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
