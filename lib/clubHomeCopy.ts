// The club home, kept on the phone (D193, Ross, 16 Nov 2026): the last
// answer the club gave this account, so the members home is drawn at once
// on the next open and the fresh answer replaces it in place.
//
// Kept in localStorage, one copy per account and club, versioned. Never the
// live parts (D194): Cards to sign is taken out before it is kept, and Live
// now is not drawn from a copy (`fromCopy`) — both wait for the fresh answer.
// Cleared on sign-out and delete (lib/accountClient.ts) and when the club
// says this account is not on its list (the club page).
//
// Only ever this phone's own: it holds what the members home already showed
// on this phone, under this phone's own sign-in, and a copy is drawn only
// for the account it was kept for.

import type { ClubMembers } from '@/app/club/[slug]/ClubBarContext'

const PREFIX = 'gd.clubhome.v1:'

const inBrowser = () => typeof window !== 'undefined'

/** The account whose sign-in this phone keeps, read off supabase-js's stored session without loading it — or null. */
export function storedAccountId(): string | null {
  if (!inBrowser()) return null
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) ?? ''
      if (!/^sb-.+-auth-token$/.test(key)) continue
      const s = JSON.parse(window.localStorage.getItem(key) ?? 'null') as { user?: { id?: string; is_anonymous?: boolean; email?: string } } | null
      if (s?.user?.id && s.user.is_anonymous === false && s.user.email) return s.user.id
    }
  } catch { /* unreadable — no copy */ }
  return null
}

const keyOf = (userId: string, slug: string) => `${PREFIX}${userId}:${slug}`

/** The last club home kept for this account and club, marked as a copy — or null. */
export function readClubHome(slug: string): ClubMembers | null {
  const userId = storedAccountId()
  if (!userId) return null
  try {
    const m = JSON.parse(window.localStorage.getItem(keyOf(userId, slug)) ?? 'null') as ClubMembers | null
    if (!m || typeof m !== 'object' || typeof m.clubId !== 'string' || !Array.isArray(m.events)) return null
    return { ...m, toSign: [], fromCopy: true }
  } catch {
    return null
  }
}

/** The fresh club home, kept for next time — less what is never drawn from a copy. */
export function keepClubHome(slug: string, m: ClubMembers) {
  const userId = storedAccountId()
  if (!userId) return
  try {
    const { toSign: _live, fromCopy: _flag, ...rest } = m
    window.localStorage.setItem(keyOf(userId, slug), JSON.stringify(rest))
  } catch { /* storage full or refused — the next open asks, as before */ }
}

/** This club's copy gone — the account is not on its list. */
export function forgetClubHome(slug: string) {
  const userId = storedAccountId()
  try { if (userId) window.localStorage.removeItem(keyOf(userId, slug)) } catch { /* nothing kept */ }
}

/** Every club home kept on this phone gone — signed out, or the account deleted. */
export function forgetAllClubHomes() {
  if (!inBrowser()) return
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) ?? ''
      if (k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach(k => window.localStorage.removeItem(k))
  } catch { /* nothing kept */ }
}

/**
 * Whether the head script judged this phone a member of the club at this
 * address (D197): set on `<html>` before the first paint, it hides the
 * public face and shows the members home's stand-in instead.
 */
export const CLUB_MEMBER_ATTR = 'data-club-member'

/** The phone is not a member here after all: the public face shows. */
export function notClubMember() {
  try { document.documentElement.removeAttribute(CLUB_MEMBER_ATTR) } catch { /* no document */ }
}
