// Settings passcode for a trip.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ WHAT THIS IS, AND WHAT IT IS NOT                                    │
// │                                                                     │
// │ This is a soft lock. It stops a player wandering into settings and  │
// │ changing the format mid-trip. It is not a security control.         │
// │                                                                     │
// │ There is no auth yet and the Supabase anon key ships to the browser │
// │ (see the security debt section in CLAUDE.md), so anyone determined  │
// │ can read the stored hash and brute-force a short numeric code in    │
// │ moments. Hashing keeps it out of plain sight, nothing more.         │
// │                                                                     │
// │ When auth lands, this should be replaced by real ownership rather   │
// │ than hardened.                                                      │
// └─────────────────────────────────────────────────────────────────────┘

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

const key = (tripCode: string) => `gig-settings-unlocked-${tripCode}`

export function rememberUnlock(tripCode: string) {
  try { sessionStorage.setItem(key(tripCode), '1') } catch { /* unavailable */ }
}

/** Cleared when the tab closes, so a shared phone does not stay unlocked. */
export function hasUnlocked(tripCode: string): boolean {
  try { return sessionStorage.getItem(key(tripCode)) === '1' } catch { return false }
}
