// Acting as a fictional member (D310, D312): the server signs in with the
// character's email and the shared TEST_CLUB_PASSWORD, exactly as a phone
// would, and calls the site's own routes with that token. Every rule a real
// member meets — who may book, who signs, who certifies — is met the same
// way; nothing here restates one. Server only.

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { accountStore } from '@/app/api/account/store'

/** The shared password (D310) — null when Ross has not set it. */
export const testPassword = () => (process.env.TEST_CLUB_PASSWORD ?? '').trim() || null

const tokens = new Map<string, { token: string; until: number }>()

/** A character's access token — signed in with their password, kept for most of its hour. */
export async function characterToken(email: string): Promise<string> {
  const held = tokens.get(email)
  if (held && held.until > Date.now()) return held.token
  const password = testPassword()
  if (!password) throw new Error('TEST_CLUB_PASSWORD is not set.')
  // The account store's own password sign-in — the one place a password is
  // checked (test:account) — exactly as /api/account signs a member in.
  const session = await accountStore(createAdminClient()).passwordSignIn(email, password)
  if (!session) throw new Error(`Could not sign in as ${email} — is TEST_CLUB_PASSWORD the one the reseed used?`)
  tokens.set(email, { token: session.accessToken, until: Date.now() + 45 * 60_000 })
  return session.accessToken
}

type Route = (req: NextRequest) => Promise<Response>

/** One of the site's own routes, called with a character's token — the answer's status and body. */
export async function callAs(route: Route, path: string, token: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new NextRequest(`https://greendot.live${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await route(req)
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  return { status: res.status, body: json }
}
