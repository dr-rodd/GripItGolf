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
import { playerCookieName, readPlayerId } from './playerCookie'

export interface EntryExtras {
  /** The admin PIN, typed and already checked on this phone. */
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
 * by `EnsureMember` after the page has painted.
 */
export async function ensureMember(tripCode: string): Promise<void> {
  if (!inBrowser() || !tripCode) return
  const code = tripCode.trim().toUpperCase()
  if (!(await databaseReady())) return
  const session = await phoneSession()
  if (!session) return
  if (!needsEntry(readLocal(stampKey(code)), session.userId, cookiePlayer(code))) return
  await enterEvent(code)
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
      body: JSON.stringify({ row }),
      credentials: 'same-origin',
    })
    const out = await res.json().catch(() => null) as { data: { id: string } | null; error: { message: string; code?: string } | null } | null
    if (!out) return failed('Could not create the event — try again.')
    return out
  } catch {
    return failed('Could not create the event — try again.')
  }
}
