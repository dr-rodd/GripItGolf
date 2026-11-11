// An event's PINs as a phone sees them: what makes one acceptable, whether
// one is set, and this phone's memory of the organiser's unlock.
//
// **No hash is ever here** (row-level security stage 4, D64; Ross, 11 Nov
// 2026). Every PIN prompt and the padlock ask the server (/api/entry,
// through lib/entryClient.ts `unlockWithPin`), which keeps the hash and
// records this phone as organiser for twelve hours. What the phone keeps is
// only *when that runs out*, as the server said — so every control on the
// page can open and close together without asking again. Pages are handed
// `pinSet`, a yes or no, never a hash; `test:client-boundary` fails a client
// file or prop that names one. The server's half is lib/pinHash.ts.

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
 * Whether this trip's settings are locked at all. On the server, from the
 * stored hash — handed to a page as `pinSet`, the answer and nothing more.
 */
export function isLocked(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.length > 0
}

// ─── Remembering an unlock on this device ──────────────────────
//
// Twelve hours from the moment the PIN was entered, on this phone (Ross,
// 10 Nov 2026) — the server's own twelve hours (`trip_members.
// organiser_until`), the time it answered with, never a clock of the phone's
// own. Tapping the header's lock shut ends both (lib/entryClient.ts
// `lockShut`). An unlock remembered before stage 4 — in sessionStorage, or
// without the server's answer — is no longer honoured: the server never
// recorded it, so its writes would be refused; the PIN is asked once more.

const key = (tripCode: string) => `gd-organiser-until-${tripCode.toUpperCase()}`

/**
 * Said on the window whenever this device's unlock changes, so every
 * organiser control on the page — and the lock in the header — opens or
 * closes together (`useUnlocked`, `OrganiserLock`).
 */
export const UNLOCK_EVENT = 'gd-organiser-unlock'

function announce() {
  try { window.dispatchEvent(new Event(UNLOCK_EVENT)) } catch { /* no window */ }
}

/** Whether a stored unlock is still open at `now`. Anything unreadable is locked. */
export function unlockOpen(stored: string | null, now: number): boolean {
  const until = Date.parse(stored ?? '')
  return Number.isFinite(until) && until > now
}

/**
 * The server's answer, remembered: open until `until` (ISO), or shut when
 * there is none. Only lib/entryClient.ts calls it, with what the server said.
 */
export function rememberUnlock(tripCode: string, until: string | null) {
  try {
    if (until && unlockOpen(until, Date.now())) localStorage.setItem(key(tripCode), until)
    else localStorage.removeItem(key(tripCode))
  } catch { /* unavailable */ }
  announce()
}

/** Shut on this phone — the server told separately (lib/entryClient.ts `lockShut`). */
export function forgetUnlock(tripCode: string) {
  rememberUnlock(tripCode, null)
}

/** Open until the twelve hours the server granted run out, on this phone only. */
export function hasUnlocked(tripCode: string): boolean {
  try { return unlockOpen(localStorage.getItem(key(tripCode)), Date.now()) } catch { return false }
}
