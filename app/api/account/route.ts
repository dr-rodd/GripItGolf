import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { runAccount } from './account'
import { accountStore } from './store'
import { addressOf } from '../entry/store'

// POST /api/account — `{ action, … }` with the phone's Supabase token as
// `Authorization: Bearer …`: ticket, merge, delete (stage (a)); sign-in,
// status, username-check, set-username (stage (a2), D128–D133). The rules
// are ./account.ts; this file is the plumbing. Nothing anybody needs to
// join, play, score or watch ever comes through here.

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const out = await runAccount(
      {
        token, action: body?.action, ticket: body?.ticket,
        identifier: body?.identifier, password: body?.password, username: body?.username,
        code: body?.code, pin: body?.pin,
        index: body && 'index' in body ? body.index : undefined,
        address: addressOf(req),
      },
      accountStore(createAdminClient()),
      new Date(),
    )
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('account failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not reach Green Dot — try again.' }, { status: 503, headers: NO_STORE })
  }
}
