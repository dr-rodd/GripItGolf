// The Clubhouse's browser half (stage (k0), D212): which clubs this account
// may open it at, and the one it last used here. Never imported by
// app/club or app/home — the members app stays as lean as it was.

import { askClub, readAccount, type ClubSummary } from '@/lib/accountClient'
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
