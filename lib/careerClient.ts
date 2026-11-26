'use client'

// A golfer's career stats, the browser's half: one ask of /api/stats/career
// as this signed-in Green Dot member. Never throws. The rules are
// lib/careerStats.ts; the reading is app/api/stats/career.ts.

import { accountToken, askServer } from './accountClient'

export const CAREER_NO_REACH = 'Could not load your stats — try again.'

export type CareerAnswer<T> = ({ ok: true } & T) | { ok: false; error: string; status?: number }

export async function askCareer<T = Record<string, unknown>>(action: 'career' | 'card', body: Record<string, unknown> = {}): Promise<CareerAnswer<T>> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.', status: 401 }
  const r = await askServer(token, { ...body, action }, '/api/stats/career')
  if (!r) return { ok: false, error: CAREER_NO_REACH }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : CAREER_NO_REACH, status: r.status }
  return { ok: true, ...(r.body as T) }
}
