// Forgot PIN (D67; Ross, 11 Nov 2026) — the rules and the words, the only
// copy. Pure, and safe in a browser: the server's half (tokens, the store,
// the email sent) is app/api/event/pinReset.ts.
//
// The organiser (admin) PIN only. "Forgot PIN?" under every organiser PIN
// box emails a one-use link, good for 30 minutes, to the address the event
// was made with — an address that never reaches a browser. The link's page
// sets a new PIN, ends organiser access on every other phone, and makes
// this phone the organiser for twelve hours. The PIN is never emailed, and
// the server never keeps it.

import { MAX_PASSCODE, MIN_PASSCODE } from './passcode'

/** How long a reset link works. */
export const RESET_LINK_MINUTES = 30
/** The nightly cleanup deletes a link this long after it was made. */
export const RESET_KEEP_HOURS = 24

/** What the ask answered: sent (or said to be), no address on file, or the route failed. */
export type AskResult = 'sent' | 'none' | 'failed'

/** What a trip calls things, and what an event does (CLAUDE.md, "What things are called on screen"). */
export function resetWords(isTrip: boolean) {
  return isTrip
    ? { thing: 'trip', pin: 'passcode', Pin: 'Passcode' }
    : { thing: 'event', pin: 'PIN', Pin: 'PIN' }
}

export const RESET_EXPIRED =
  'This link has expired or has already been used. Ask for a new one from the padlock on the event.'

/** Why this new PIN cannot be saved — the reset page's words, said under the field. Null when fine. */
export function newPinIssue(pin: string, again: string): string | null {
  if (!/^\d*$/.test(pin) || pin.length < MIN_PASSCODE || pin.length > MAX_PASSCODE) {
    return `Use ${MIN_PASSCODE} to ${MAX_PASSCODE} digits.`
  }
  if (pin !== again) return 'The two PINs don’t match.'
  return null
}

export const SAME_AS_PUBLIC = 'Use a different PIN from the event’s public PIN.'

// ─── The email ─────────────────────────────────────────────────

export interface ResetEmail {
  eventName: string
  code: string
  link: string
  isTrip: boolean
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function resetSubject(d: ResetEmail): string {
  return `Choose a new ${resetWords(d.isTrip).pin} for ${d.eventName}`
}

function lines(d: ResetEmail) {
  const w = resetWords(d.isTrip)
  return {
    asked: `Someone asked to reset the ${d.isTrip ? 'Trip Setup passcode' : 'organiser PIN'} for ${d.eventName} (code ${d.code}).`,
    tap: `Tap below to choose a new one. The link works once, for ${RESET_LINK_MINUTES} minutes.`,
    button: `Choose a new ${w.pin}`,
    ignore: `Didn’t ask? Ignore this email. Your ${w.pin} hasn’t changed and nobody can change it without this link.`,
  }
}

export function resetText(d: ResetEmail): string {
  const l = lines(d)
  return [l.asked, '', l.tap, '', `${l.button}: ${d.link}`, '', l.ignore, '', 'Green Dot'].join('\n')
}

export function resetHtml(d: ResetEmail): string {
  const l = lines(d)
  const p = 'margin:0 0 16px;font:16px/1.5 Arial,Helvetica,sans-serif;color:#1d2b22;'
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f3ea;">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;">
<p style="${p}">${escapeHtml(l.asked)}</p>
<p style="${p}">${escapeHtml(l.tap)}</p>
<p style="margin:24px 0;"><a href="${escapeHtml(d.link)}" style="display:inline-block;background:#0A9D56;color:#ffffff;font:600 16px Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 22px;border-radius:16px;">${escapeHtml(l.button)}</a></p>
<p style="${p}color:#5b6660;font-size:14px;">${escapeHtml(l.ignore)}</p>
</div></body></html>`
}
