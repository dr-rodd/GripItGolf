'use client'

// The feed's browser half (D293–D307): one ask of /api/feed as this signed-in
// Green Dot member. Never throws. Everything it shows was decided on the
// server (D305); nothing here decides who sees what.

import { accountToken, askServer } from './accountClient'

export const FEED_NO_REACH = 'Could not reach Green Dot — try again.'

export type FeedAnswer<T> = ({ ok: true } & T) | { ok: false; error: string; status?: number }

export async function askFeed<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<FeedAnswer<T>> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.', status: 401 }
  const r = await askServer(token, { ...body, action }, '/api/feed')
  if (!r) return { ok: false, error: FEED_NO_REACH }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : FEED_NO_REACH, status: r.status }
  return { ok: true, ...(r.body as T) }
}
