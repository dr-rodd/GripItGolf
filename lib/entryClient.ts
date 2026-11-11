// The browser's half of entering an event (row-level security, stage 1).
//
// Every phone gets an identity — a Supabase anonymous sign-in, no screen,
// no email — and tells `/api/entry` which events it has entered and how:
// with the code (`EnsureMember`, in the trip and run layouts), with the admin
// PIN, with the public PIN, or by claiming a name. The route writes the
// `trip_members` row; the rules are lib/membership.ts.
//
// **Silent, and never in anybody's way.** Nothing here is awaited by a page
// or shown on one. Every function resolves — to null on any failure — and
// never throws. Stage 1 enforces nothing, so a failed sign-in or a failed
// entry costs nothing; the next page load simply tries again.
//
// **Nobody is signed in until migration 068 is in** (`GET /api/entry`). A
// signed-in phone is the `authenticated` role, which the match play card
// tables only answer once 068 has granted it — signing in first would make
// every match card refuse its scores. Once the server says ready, the phone
// remembers it and never asks again.
//
// Browser only: on the server every function returns null at once.

import { entryStamp, needsEntry, type Role } from './membership'
import { forgetUnlock, hasUnlocked, rememberUnlock } from './passcode'
import { playerCookieName, readPlayerId } from './playerCookie'

export interface EntryExtras {
  /** The admin PIN, as typed — the server checks it (stage 4). */
  adminPin?: string | null
  /** The public PIN, from the event's door. */
  publicPin?: string | null
  /** The player this phone just claimed. Absent: whatever the cookie says. */
  playerId?: string | null
}

export interface EntryResult {
  tripId: string
  role: Role | null
  organiserUntil: string | null
  readOnly: boolean
}

const READY_KEY = 'gd.entry.ready.v1'
const stampKey = (code: string) => `gd.entry.${code}.v1`

const inBrowser = () => typeof window !== 'undefined'

function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeLocal(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* private mode — asks again next time */ }
}

// ─── Is the database ready for signed-in phones? ───────────────

let readyAsk: Promise<boolean> | null = null

async function databaseReady(): Promise<boolean> {
  if (readLocal(READY_KEY) === '1') return true
  readyAsk ??= fetch('/api/entry', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((j: { ready?: boolean } | null) => {
      const ready = j?.ready === true
      if (ready) writeLocal(READY_KEY, '1')
      else readyAsk = null // ask again on the next page, not on every call of this one
      return ready
    })
    .catch(() => { readyAsk = null; return false })
  return readyAsk
}

// ─── This phone's identity ─────────────────────────────────────

let signingIn: Promise<{ userId: string; token: string } | null> | null = null

/**
 * The phone's session, signing it in anonymously the first time. One sign-in
 * at a time: two calls racing would otherwise make two identities and
 * remember whichever finished last.
 */
async function phoneSession(): Promise<{ userId: string; token: string } | null> {
  // Loaded here, not at the top: the unlock and claim components import this
  // file, and some render on the server and in tests, where the client must
  // never be built. Importing this file does nothing until a phone signs in.
  let supabase: typeof import('./supabase')['supabase']
  try {
    ({ supabase } = await import('./supabase'))
  } catch {
    return null
  }
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) return { userId: data.session.user.id, token: data.session.access_token }
  } catch {
    return null
  }
  signingIn ??= supabase.auth.signInAnonymously()
    .then(({ data, error }) => (error || !data.session
      ? null
      : { userId: data.session.user.id, token: data.session.access_token }))
    .catch(() => null)
    .finally(() => { signingIn = null })
  return signingIn
}

// ─── Entering ──────────────────────────────────────────────────

/** The player this phone's cookie claims in this event, if any. */
function cookiePlayer(code: string): string | null {
  try {
    const name = playerCookieName(code)
    const hit = document.cookie.split('; ').find(c => c.startsWith(`${name}=`))
    return hit ? readPlayerId(decodeURIComponent(hit.slice(name.length + 1))) : null
  } catch {
    return null
  }
}

/** One entry at a time per event, so two never read the same row and the second overwrite the first. */
const queues = new Map<string, Promise<unknown>>()

/** A route that answers this phone, signed in — `null` when it could not be asked. */
async function ask(
  url: string,
  body: Record<string, unknown>,
  opts: { signIn?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (opts.signIn !== false && !(await databaseReady())) return null
  const session = opts.signIn === false ? null : await phoneSession()
  if (opts.signIn !== false && !session) return null
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
    const json = await res.json().catch(() => ({})) as Record<string, unknown>
    return { status: res.status, body: json && typeof json === 'object' ? json : {} }
  } catch {
    return null
  }
}

const isoOrNull = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)

async function post(code: string, extras: EntryExtras): Promise<EntryResult | null> {
  if (!(await databaseReady())) return null
  const session = await phoneSession()
  if (!session) return null
  const playerId = extras.playerId ?? cookiePlayer(code)
  try {
    const res = await fetch('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ code, playerId, adminPin: extras.adminPin ?? null, publicPin: extras.publicPin ?? null }),
      credentials: 'same-origin',
      // A create form navigates on straight after; let the request finish.
      keepalive: true,
    })
    if (!res.ok) return null
    const body = await res.json() as EntryResult & { ok?: boolean }
    writeLocal(stampKey(code), entryStamp(session.userId, playerId))
    // A PIN entry's twelve hours, as the server counts them.
    if (extras.adminPin) rememberUnlock(code, body.organiserUntil)
    return { tripId: body.tripId, role: body.role, organiserUntil: body.organiserUntil, readOnly: body.readOnly }
  } catch {
    return null
  }
}

/**
 * Tell the server this phone has entered this event — with the PIN, a
 * claimed player, or just the code. Fire and forget: resolves to null on any
 * failure and never throws.
 */
export function enterEvent(tripCode: string, extras: EntryExtras = {}): Promise<EntryResult | null> {
  if (!inBrowser() || !tripCode) return Promise.resolve(null)
  const code = tripCode.trim().toUpperCase()
  const run = (queues.get(code) ?? Promise.resolve())
    .catch(() => null)
    .then(() => post(code, extras))
    .catch(() => null)
  queues.set(code, run)
  return run
}

/**
 * Once per phone per event: enter with the code (and the cookie's player)
 * unless this phone has already, as this identity and this player. Called
 * by `EnsureMember` after the page has painted. Also, once a page load: a
 * padlock shut while the server could not be told is told now, and an
 * unlock this phone remembers is checked against the server's own (D64).
 */
export async function ensureMember(tripCode: string): Promise<void> {
  if (!inBrowser() || !tripCode) return
  const code = tripCode.trim().toUpperCase()
  if (!(await databaseReady())) return
  const session = await phoneSession()
  if (!session) return
  if (needsEntry(readLocal(stampKey(code)), session.userId, cookiePlayer(code))) await enterEvent(code)
  await settleOrganiser(code)
}

/**
 * A score the server refused (stage 6): the phone's sign-in may have lapsed
 * or been lost, or its membership never written. Refresh the session — or,
 * where the server no longer knows it, sign in afresh — and enter each event
 * again with the code and the cookie's player. Resolves true when at least
 * one event was entered, so the outbox tries again at once. Never throws.
 */
export async function recoverEvents(tripCodes: string[]): Promise<boolean> {
  if (!inBrowser() || tripCodes.length === 0) return false
  if (!(await databaseReady())) return false
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      const { error } = await supabase.auth.refreshSession()
      // The server answered and does not know this sign-in: start a new one.
      // A network failure (no status, or a 5xx) keeps the one we have.
      if (error && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
        await supabase.auth.signOut({ scope: 'local' })
      }
    }
  } catch {
    return false
  }
  const results = await Promise.all(tripCodes.map(code => enterEvent(code)))
  return results.some(r => r !== null)
}

// ─── The organiser's padlock (stage 4: D61, D64) ───────────────

export type UnlockResult = 'ok' | 'wrong' | 'blocked' | 'failed'

/**
 * The organiser PIN, typed into the padlock or an in-place prompt, checked
 * by the server — which records this phone as organiser for twelve hours
 * and says until when. Nothing about the PIN is known on the phone.
 */
export async function unlockWithPin(tripCode: string, pin: string): Promise<UnlockResult> {
  if (!inBrowser() || !tripCode || !pin) return 'failed'
  const code = tripCode.trim().toUpperCase()
  const run = (queues.get(code) ?? Promise.resolve()).catch(() => null).then(async (): Promise<UnlockResult> => {
    const r = await ask('/api/entry', { code, adminPin: pin, playerId: cookiePlayer(code) })
    if (!r) return 'failed'
    if (r.status === 403) return 'wrong'
    if (r.status === 429) return 'blocked'
    if (r.status !== 200) return 'failed'
    const until = isoOrNull(r.body.organiserUntil)
    rememberUnlock(code, until)
    return until ? 'ok' : 'failed'
  }).catch((): UnlockResult => 'failed')
  queues.set(code, run)
  return run
}

const closeKey = (code: string) => `gd.close.${code}.v1`

/**
 * The padlock tapped shut (D61): shut on this phone at once, and the
 * server's grant ended — at once if it can be reached, else on the next
 * page load (`ensureMember`), and at most when its twelve hours run out.
 */
export function lockShut(tripCode: string): void {
  if (!inBrowser() || !tripCode) return
  const code = tripCode.trim().toUpperCase()
  forgetUnlock(code)
  writeLocal(closeKey(code), '1')
  void tellShut(code)
}

async function tellShut(code: string): Promise<boolean> {
  const r = await ask('/api/entry', { code, close: true })
  if (r?.status === 200) {
    try { window.localStorage.removeItem(closeKey(code)) } catch { /* unavailable */ }
    return true
  }
  return false
}

const settled = new Set<string>()

/** Once a page load per event: a shut padlock told, a remembered unlock checked. */
async function settleOrganiser(code: string): Promise<void> {
  if (settled.has(code)) return
  settled.add(code)
  if (readLocal(closeKey(code)) === '1' && !(await tellShut(code))) return
  if (!hasUnlocked(code)) return
  const r = await ask('/api/entry', { code, peek: true })
  if (r?.status !== 200) return
  const until = isoOrNull(r.body.organiserUntil)
  // The server's word: its time if it has one running, else shut.
  rememberUnlock(code, until)
}

// ─── The public PIN's door ─────────────────────────────────────

/**
 * The public PIN, typed at the event's door: checked by the server, which
 * sets this phone's entry cookie. The admin PIN opens the door too, and
 * unlocks the organiser's side with it. Needs no sign-in for the door
 * itself — the phone enters the event afterwards, silently.
 */
export async function openDoor(tripCode: string, pin: string): Promise<UnlockResult> {
  if (!inBrowser() || !tripCode || !pin) return 'failed'
  const code = tripCode.trim().toUpperCase()
  const r = await ask('/api/event/door', { code, pin }, { signIn: false })
  if (!r) return 'failed'
  if (r.status === 403) return 'wrong'
  if (r.status === 429) return 'blocked'
  if (r.status !== 200) return 'failed'
  if (r.body.organiser === true) void unlockWithPin(code, pin)
  else void enterEvent(code, { publicPin: pin })
  return 'ok'
}

// ─── Writes to the event's own row (stage 4, D65) ──────────────

/** What a server write answered: done, or the calm sentence to show. */
export type Saved = { ok: true } | { ok: false; error: string }

async function save(url: string, body: Record<string, unknown>): Promise<Saved> {
  if (!inBrowser()) return { ok: false, error: 'Could not save — try again.' }
  const r = await ask(url, body)
  if (!r) return { ok: false, error: 'Could not reach Green Dot — try again.' }
  if (r.status === 200) return { ok: true }
  const error = typeof r.body.error === 'string' ? r.body.error : 'Could not save — try again.'
  return { ok: false, error }
}

/** The public PIN set (`pin`), changed, or taken off (`null`) — the admin PIN asked when the event has one. */
export function setPublicPin(tripCode: string, adminPin: string | null, pin: string | null): Promise<Saved> {
  return save('/api/event/pin', { code: tripCode.trim().toUpperCase(), adminPin, pin })
}

/** An ad hoc series' end date moved on to a round added past it. */
export function extendEventEnd(tripCode: string, date: string): Promise<Saved> {
  return save('/api/event/extend', { code: tripCode.trim().toUpperCase(), date })
}

/** The tee sheet wizard's "Do players play in their teams?", onto its board. */
export function answerPlayTogether(tripCode: string, boardId: string, together: boolean): Promise<Saved> {
  return save('/api/event/play-together', { code: tripCode.trim().toUpperCase(), boardId, together })
}

/**
 * Make a new event's row (row-level security, stage 3): through
 * /api/trip/create, which makes the row and this phone's membership of it
 * together — a phone cannot insert the row of an event it is not yet a
 * member of, or read it back. Answers in supabase-js's own shape, so a create
 * form reads it exactly as it read its insert. Unlike the rest of this file
 * a failure is said, because the form says it: never thrown.
 */
export async function createTripRow(
  row: Record<string, unknown>,
  pins: { adminPin?: string | null; publicPin?: string | null } = {},
): Promise<{ data: { id: string } | null; error: { message: string; code?: string } | null }> {
  const failed = (message: string) => ({ data: null, error: { message } })
  if (!inBrowser()) return failed('Could not create the event — try again.')
  if (!(await databaseReady())) return failed('Could not reach Green Dot — try again.')
  const session = await phoneSession()
  if (!session) return failed('Could not sign this phone in — try again.')
  try {
    const res = await fetch('/api/trip/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      // The PINs as typed, beside the row: hashed on the server (D64).
      body: JSON.stringify({ row, adminPin: pins.adminPin ?? null, publicPin: pins.publicPin ?? null }),
      credentials: 'same-origin',
    })
    const out = await res.json().catch(() => null) as {
      data: { id: string } | null; organiserUntil?: string | null; error: { message: string; code?: string } | null
    } | null
    if (!out) return failed('Could not create the event — try again.')
    // The phone that set the PIN is the organiser from the first moment,
    // for as long as the server says; the public PIN's cookie came back set.
    const code = typeof row.trip_code === 'string' ? row.trip_code : ''
    if (out.data && code && pins.adminPin) rememberUnlock(code, out.organiserUntil ?? null)
    return { data: out.data, error: out.error }
  } catch {
    return failed('Could not create the event — try again.')
  }
}

// ─── Forgot PIN (D67) ──────────────────────────────────────────

/**
 * "Email me a link": the server emails a reset link to the address the
 * event was made with, which never comes back here. `none` means the event
 * has no address, and `support` is who to write to instead.
 */
export async function askPinReset(tripCode: string): Promise<{ result: 'sent' | 'failed' } | { result: 'none'; support: string }> {
  if (!inBrowser() || !tripCode) return { result: 'failed' }
  const r = await ask('/api/event/forgot', { code: tripCode.trim().toUpperCase() }, { signIn: false })
  if (r?.status !== 200) return { result: 'failed' }
  if (r.body.result === 'none') return { result: 'none', support: typeof r.body.support === 'string' ? r.body.support : '' }
  return { result: r.body.result === 'sent' ? 'sent' : 'failed' }
}

export type ResetLink =
  | { ok: true; eventName: string; code: string; isTrip: boolean; hasPublicPin: boolean }
  | { ok: false; error: string }

/** Is this reset link still good, and for which event? Uses nothing up. */
export async function checkResetLink(resetToken: string): Promise<ResetLink> {
  const r = inBrowser() ? await ask('/api/event/reset', { resetToken, check: true }, { signIn: false }) : null
  if (!r) return { ok: false, error: 'Could not reach Green Dot — try again.' }
  if (r.status === 200 && typeof r.body.code === 'string') {
    return {
      ok: true, eventName: String(r.body.eventName ?? ''), code: r.body.code,
      isTrip: r.body.isTrip === true, hasPublicPin: r.body.hasPublicPin === true,
    }
  }
  return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : 'Could not reach Green Dot — try again.' }
}

/**
 * The new PIN, saved through the link: this phone is the organiser from
 * then, for as long as the server says, and every other phone is not.
 */
export async function saveResetPin(
  resetToken: string, pin: string, again: string,
): Promise<{ ok: true; home: string } | { ok: false; expired: boolean; error: string }> {
  const r = inBrowser() ? await ask('/api/event/reset', { resetToken, pin, again }) : null
  if (!r) return { ok: false, expired: false, error: 'Could not reach Green Dot — try again.' }
  if (r.status === 200 && typeof r.body.code === 'string' && typeof r.body.home === 'string') {
    rememberUnlock(r.body.code, isoOrNull(r.body.organiserUntil))
    return { ok: true, home: r.body.home }
  }
  return {
    ok: false,
    expired: r.status === 410,
    error: typeof r.body.error === 'string' ? r.body.error : 'Could not save — try again.',
  }
}

// ─── The organiser PIN (a trip's passcode), set or changed ─────

/**
 * The organiser PIN — on a trip, its passcode — set (`pin`), changed, or
 * taken off a trip (`null`), the current one asked when there is one. A new
 * PIN makes this phone the organiser for twelve hours and every other phone
 * not; taken off, everybody is.
 */
export async function setAdminPin(tripCode: string, currentPin: string | null, pin: string | null): Promise<Saved> {
  if (!inBrowser()) return { ok: false, error: 'Could not save — try again.' }
  const code = tripCode.trim().toUpperCase()
  const r = await ask('/api/event/admin-pin', { code, currentPin, pin })
  if (!r) return { ok: false, error: 'Could not reach Green Dot — try again.' }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : 'Could not save — try again.' }
  rememberUnlock(code, isoOrNull(r.body.organiserUntil))
  return { ok: true }
}
