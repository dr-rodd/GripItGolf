// The public PIN — the only copy of its rules (docs/event-use-cases.md,
// story 2, stage 5). An event may carry two PINs:
//
// * the **admin PIN** (`trips.settings_passcode_hash`, lib/passcode.ts) —
//   destructive actions, the organiser area, overriding a result;
// * the **public PIN** (`trips.public_passcode_hash`, migration 060) —
//   getting into the event at all: its pages, its boards, its draw.
//
// Optional, and only ever an event's. With none set the event is open to
// anybody with its code, exactly as before. With one set, every page under
// `/trip/[code]` sends a phone that has not entered it to `/enter/[code]`
// first (the trip layout decides, `entryAllowed`); the admin PIN opens that
// door too, so the organiser is never locked out of their own event.
//
// **Checked on the server only** (row-level security stage 4, D64): the
// door asks /api/event/door, which sets this phone's cookie; the hash never
// reaches a browser (lib/pinHash.ts). Pure.

import { passcodeError } from './passcode'

/** Long enough to outlast any event; the PIN changing ends it anyway. */
export const ENTRY_COOKIE_DAYS = 400

/** The cookie a phone that has entered this event carries. */
export const entryCookie = (tripCode: string) => `gd_entry_${tripCode.toUpperCase()}`

// Whether a phone may see the event is the server's question —
// `entryAllowed` in lib/pinHash.ts, which keeps the hash and the door's
// cookie away from every browser (row-level security stage 4, D64).

export type PublicPinDraft = { on: boolean; pin: string; confirm: string }

export const NO_PUBLIC_PIN: PublicPinDraft = { on: false, pin: '', confirm: '' }

/**
 * Why this public PIN will not do, or null when it will — or when there is
 * none. It must differ from the admin PIN: the field is handed one, and
 * handing them the other would be handing them the event.
 */
export function publicPinIssue(draft: PublicPinDraft, adminPin: string | null): string | null {
  if (!draft.on) return null
  return passcodeError(draft.pin)
    ?? (draft.pin !== draft.confirm ? 'The two PINs do not match.' : null)
    ?? (adminPin && draft.pin === adminPin ? 'Use a different PIN from the admin PIN.' : null)
}
