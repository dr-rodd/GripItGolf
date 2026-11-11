// The plumbing the routes beside ./actions.ts share: the bearer token, the
// caller's address, the service-role store, and the door's cookie set by
// the server (httpOnly — no script on the phone ever reads it).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { ENTRY_COOKIE_DAYS, entryCookie } from '@/lib/publicPin'
import { actionStore, addressOf } from '../entry/store'
import type { ActionStore } from './actions'

const NO_STORE = { 'Cache-Control': 'no-store' }

export interface Asked {
  body: Record<string, unknown>
  token: string | null
  address: string
  store: ActionStore
}

export async function asked(req: NextRequest): Promise<Asked> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const auth = req.headers.get('authorization') ?? ''
  return {
    body: body && typeof body === 'object' ? body : {},
    token: /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? null,
    address: addressOf(req),
    store: actionStore(createAdminClient()),
  }
}

/** The outcome as JSON — with the door's cookie for `code` when one is handed (`''` clears it). */
export function respond(out: { status: number; body: unknown }, door?: { code: string; value: string | null }) {
  const res = NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  if (door && door.value !== null) {
    res.cookies.set(entryCookie(door.code), door.value, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: ENTRY_COOKIE_DAYS * 86_400,
    })
  }
  return res
}

export function failed(e: unknown) {
  console.error('event action failed:', e)
  return NextResponse.json({ ok: false, error: 'Could not save — try again.' }, { status: 503, headers: NO_STORE })
}
