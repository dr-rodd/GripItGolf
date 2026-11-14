import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runAccount } from './account'
import { accountStore } from './store'

// POST /api/account — `{ action: 'ticket' | 'merge' | 'delete', ticket? }`
// with the phone's Supabase token as `Authorization: Bearer …`. The rules
// are ./account.ts; this file is the plumbing. Nothing anybody needs to
// join, play, score or watch ever comes through here.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { action?: unknown; ticket?: unknown } | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runAccount(
      { token, action: body?.action, ticket: body?.ticket },
      accountStore(createAdminClient()),
      new Date(),
    )
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('account failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
