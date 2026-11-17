// The Clubhouse's browser half (stage (k0), D212): which clubs this account
// may open it at, and the one it last used here. Never imported by
// app/club or app/home — the members app stays as lean as it was.

import { ACCOUNT_WORDS } from '@/lib/account'
import { accountToken, askClub, askServer, readAccount, type ClubSummary } from '@/lib/accountClient'
import { clubMay } from '@/lib/clubMay'

/** The club this device last opened the Clubhouse at — a convenience, never authorising. */
const LAST_KEY = 'gd.clubhouse.v1'

export function lastClubhouse(): string | null {
  try { return window.localStorage.getItem(LAST_KEY) } catch { return null }
}

export function rememberClubhouse(slug: string) {
  try { window.localStorage.setItem(LAST_KEY, slug) } catch { /* refused — the first club opens next time */ }
}

export type Door =
  | { kind: 'signedOut' }
  | { kind: 'lost'; error: string }
  | { kind: 'none' }
  | { kind: 'open'; clubs: ClubSummary[] }

/** Who is at the door: signed out, a lost signal, no Clubhouse anywhere, or the verified clubs it opens at. */
export async function knock(): Promise<Door> {
  if (!(await readAccount())) return { kind: 'signedOut' }
  const r = await askClub('mine')
  if (!r.ok) return /sign in/i.test(r.error) ? { kind: 'signedOut' } : { kind: 'lost', error: r.error }
  const clubs = (r.clubs ?? []).filter(c => c.status === 'verified' && clubMay('open_clubhouse', { row: c.credentials }))
  return clubs.length ? { kind: 'open', clubs } : { kind: 'none' }
}

/** Where the door opens: the club last used here, if this account still has it, else the first. */
export function doorClub(clubs: ClubSummary[], last: string | null): ClubSummary {
  return clubs.find(c => c.slug === last) ?? clubs[0]
}

/**
 * Stage (k2), D214: a competition copied to other dates — Copy to another
 * date (one) or Repeat weekly (a run). Each made as New competition makes
 * one; a date that could not be made comes back with why. Never throws.
 */
export async function copyCompetition(clubId: string, code: string, dates: string[]): Promise<{ ok: true; made: { code: string; date: string }[]; refused: { date: string; why: string }[] } | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const r = await askServer(token, { action: 'copy', clubId, code, dates }, '/api/club/competition')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  const b = r.body as { made?: { code: string; date: string }[]; refused?: { date: string; why: string }[] }
  return { ok: true, made: b.made ?? [], refused: b.refused ?? [] }
}
