import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { careerStore, runCareer } from '../career'

// POST /api/stats/career — `{ action: 'career' | 'card', roundId? }` with a
// Green Dot member's token as `Authorization: Bearer …`. A golfer's own
// rounds and their scorecards; the rules are ../career.ts and
// lib/careerStats.ts, this file the plumbing.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runCareer({ token, action: body?.action, roundId: body?.roundId }, await careerStore(createAdminClient()))
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('career stats failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
