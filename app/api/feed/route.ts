import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runFeed } from './feed'
import { feedStore } from './store'

// POST /api/feed — `{ action, … }` with a Green Dot member's token as
// `Authorization: Bearer …`. The feed and its streams (D293–D307): the rules
// are lib/feed.ts and ./feed.ts; this file is the plumbing. Nothing anybody
// needs to join, play, score or watch comes through here (D94).

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runFeed({ ...(body ?? {}), token, action: body?.action }, feedStore(createAdminClient()), new Date())
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('feed failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
