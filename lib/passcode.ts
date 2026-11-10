// Settings passcode for a trip.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ WHAT THIS IS, AND WHAT IT IS NOT                                    │
// │                                                                     │
// │ This is a soft lock. It stops a player wandering into settings and  │
// │ changing the format mid-trip. It is not a security control.         │
// │                                                                     │
// │ There is no auth yet and the Supabase anon key ships to the browser │
// │ (see docs/gotchas-and-debt.md), so anyone determined                │
// │ can read the stored hash and brute-force a short numeric code in    │
// │ moments. Hashing keeps it out of plain sight, nothing more.         │
// │                                                                     │
// │ When auth lands, this should be replaced by real ownership rather   │
// │ than hardened. It is landing: from row-level security stage 1 the   │
// │ PIN is also checked on the server (/api/entry), which records the   │
// │ phone as organiser for twelve hours; stage 2 stops sending the hash │
// │ to the browser at all.                                              │
// └─────────────────────────────────────────────────────────────────────┘

import { ORGANISER_MS } from './membership'

export const MIN_PASSCODE = 4
export const MAX_PASSCODE = 8

/** Why this passcode is not acceptable, or null if it is fine. */
export function passcodeError(code: string): string | null {
  if (!code) return 'Enter a passcode.'
  if (!/^\d+$/.test(code)) return 'Use numbers only, so it works with the keypad.'
  if (code.length < MIN_PASSCODE) return `At least ${MIN_PASSCODE} digits.`
  if (code.length > MAX_PASSCODE) return `At most ${MAX_PASSCODE} digits.`
  return null
}

export function isPasscodeValid(code: string): boolean {
  return passcodeError(code) === null
}

/**
 * SHA-256 of the passcode, hex encoded.
 *
 * Deliberately plain: a salt or a work factor would imply a level of
 * protection this cannot provide while the hash itself is readable by anyone
 * with the trip code.
 */
export async function hashPasscode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPasscode(code: string, hash: string | null): Promise<boolean> {
  if (!hash) return true            // no passcode set — settings are open
  if (!code) return false
  return (await hashPasscode(code)) === hash
}

/** Whether this trip's settings are locked at all. */
export function isLocked(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.length > 0
}

// ─── Remembering an unlock on this device ──────────────────────
//
// Twelve hours from the moment the PIN was entered, on this phone (Ross,
// 10 Nov 2026) — the same twelve hours the server's organiser grant lasts
// (lib/membership.ts, ORGANISER_HOURS), and what the confirmation email says.
// Closing the browser no longer ends it; tapping the header's lock shut does.
// It used to live in sessionStorage, ending when the browser closed; an
// unlock written there before this change is still honoured until it does.


const key = (tripCode: string) => `gig-settings-unlocked-${tripCode}`

/**
 * Said on the window whenever this device's unlock changes, so every
 * organiser control on the page — and the lock in the header — opens or
 * closes together (`useUnlocked`, `OrganiserLock`).
 */
export const UNLOCK_EVENT = 'gd-organiser-unlock'

function announce() {
  try { window.dispatchEvent(new Event(UNLOCK_EVENT)) } catch { /* no window */ }
}

/** When an unlock written at `now` runs out, as stored: milliseconds since 1970. */
export function unlockExpiry(now: number): string {
  return String(now + ORGANISER_MS)
}

/** Whether a stored unlock is still open at `now`. Anything unreadable is locked. */
export function unlockOpen(stored: string | null, now: number): boolean {
  const until = Number(stored)
  return Number.isFinite(until) && until > now
}

export function rememberUnlock(tripCode: string) {
  try { localStorage.setItem(key(tripCode), unlockExpiry(Date.now())) } catch { /* unavailable */ }
  announce()
}

/** Locked again by hand — the header's lock tapped shut. */
export function forgetUnlock(tripCode: string) {
  try { localStorage.removeItem(key(tripCode)) } catch { /* unavailable */ }
  try { sessionStorage.removeItem(key(tripCode)) } catch { /* unavailable */ }
  announce()
}

/** Open for twelve hours from the PIN, on this phone only. */
export function hasUnlocked(tripCode: string): boolean {
  try { if (unlockOpen(localStorage.getItem(key(tripCode)), Date.now())) return true } catch { /* unavailable */ }
  // Written before the twelve hours, while the browser that wrote it is open.
  try { return sessionStorage.getItem(key(tripCode)) === '1' } catch { return false }
}
