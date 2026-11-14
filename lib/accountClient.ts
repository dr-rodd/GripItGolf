// The browser's half of an account (stage (a); the rules are lib/account.ts).
//
// **The only file that asks Supabase for an email code.** `updateUser`,
// `signInWithOtp` and `verifyOtp` appear here and nowhere else, and only the
// account page imports this file — `test:account` holds both, so no trip
// screen, layout, scoring path or join flow can come to need an account.
//
// Two ways in, one screen:
//
// * **This phone has never had an account** (its identity is anonymous):
//   the email is added to the phone's own identity (`updateUser`) and the
//   code confirms it (`verifyOtp`, type `email_change`). Same user id, so
//   every event it has entered stays entered.
// * **The email already has an account** (`updateUser` says so): the server
//   first seals a ticket naming this phone's identity — the session is about
//   to be replaced and could not be asked afterwards — then the account's
//   code is sent (`signInWithOtp`, never making an account) and confirmed
//   (type `email`), and the server moves this phone's events onto it.
//
// Never throws: every function resolves to an answer the screen can say.

import { ACCOUNT_WORDS, normaliseEmail } from './account'
import { phoneIdentity } from './entryClient'

export type Mode = 'upgrade' | 'existing'

/** A code asked for and not yet typed — kept for the tab, so a trip to Mail loses nothing. */
export interface Pending { email: string; mode: Mode; ticket: string | null; at: number }

export type Answer = { ok: true } | { ok: false; error: string }

const PENDING_KEY = 'gd.account.pending.v1'
/** A code runs out after ten minutes (Supabase's Email OTP Expiration, set to match). */
const PENDING_MS = 10 * 60 * 1000

const inBrowser = () => typeof window !== 'undefined'

async function client() {
  const { supabase } = await import('./supabase')
  return supabase
}

type AuthErr = { code?: string; status?: number; message?: string } | null | undefined

const rateLimited = (e: AuthErr) => e?.status === 429 || /rate_limit/.test(e?.code ?? '')
const alreadyExists = (e: AuthErr) =>
  e?.code === 'email_exists' || e?.code === 'user_already_exists' || /already (been )?registered|already exists/i.test(e?.message ?? '')

// ─── Who is signed in ──────────────────────────────────────────

/** The account this phone is signed in to — its email — or null for a phone with none. */
export async function readAccount(): Promise<{ email: string } | null> {
  if (!inBrowser()) return null
  try {
    const { data } = await (await client()).auth.getSession()
    const u = data.session?.user
    return u && !u.is_anonymous && u.email ? { email: u.email.toLowerCase() } : null
  } catch {
    return null
  }
}

/** Told whenever the sign-in changes, on this tab or another. Returns the way to stop. */
export function watchAccount(onChange: () => void): () => void {
  if (!inBrowser()) return () => {}
  let stop = () => {}
  let live = true
  client().then(s => {
    if (!live) return
    const { data } = s.auth.onAuthStateChange(() => onChange())
    stop = () => data.subscription.unsubscribe()
  }).catch(() => {})
  return () => { live = false; stop() }
}

// ─── The code ──────────────────────────────────────────────────

export function readPending(): Pending | null {
  if (!inBrowser()) return null
  try {
    const p = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null
    return p && typeof p.email === 'string' && Date.now() - p.at < PENDING_MS ? p : null
  } catch {
    return null
  }
}

export function forgetPending() {
  try { window.sessionStorage.removeItem(PENDING_KEY) } catch { /* unavailable */ }
}

function keepPending(p: Pending) {
  try { window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)) } catch { /* unavailable — the code still works this load */ }
}

async function askServer(token: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
    const json = await res.json().catch(() => ({})) as Record<string, unknown>
    return { status: res.status, body: json && typeof json === 'object' ? json : {} }
  } catch {
    return null
  }
}

/** Send a code to this email — by adding it to this phone, or to the account it already belongs to. */
export async function sendCode(raw: string): Promise<{ ok: true; pending: Pending } | { ok: false; error: string }> {
  const email = normaliseEmail(raw)
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const phone = await phoneIdentity()
  if (!phone) return { ok: false, error: ACCOUNT_WORDS.noReach }
  try {
    const s = await client()
    const { data } = await s.auth.getSession()
    if (data.session && !data.session.user.is_anonymous) return { ok: false, error: 'This phone is already signed in.' }

    const upgrade = await s.auth.updateUser({ email })
    if (!upgrade.error) {
      const pending: Pending = { email, mode: 'upgrade', ticket: null, at: Date.now() }
      keepPending(pending)
      return { ok: true, pending }
    }
    if (rateLimited(upgrade.error)) return { ok: false, error: ACCOUNT_WORDS.tooMany }
    if (!alreadyExists(upgrade.error)) return { ok: false, error: ACCOUNT_WORDS.failed }

    // A second phone: take the proof of this one before anything changes.
    const t = await askServer(phone.token, { action: 'ticket' })
    const ticket = t?.status === 200 && typeof t.body.ticket === 'string' ? t.body.ticket : null
    if (!ticket) return { ok: false, error: ACCOUNT_WORDS.noReach }
    const otp = await s.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    if (otp.error) return { ok: false, error: rateLimited(otp.error) ? ACCOUNT_WORDS.tooMany : ACCOUNT_WORDS.failed }
    const pending: Pending = { email, mode: 'existing', ticket, at: Date.now() }
    keepPending(pending)
    return { ok: true, pending }
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

/** The code, typed: this phone is signed in to the account, its events with it. */
export async function confirmCode(pending: Pending, code: string): Promise<Answer> {
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  try {
    const s = await client()
    const v = await s.auth.verifyOtp({
      email: pending.email,
      token: code,
      type: pending.mode === 'upgrade' ? 'email_change' : 'email',
    })
    if (v.error) return { ok: false, error: rateLimited(v.error) ? ACCOUNT_WORDS.tooMany : ACCOUNT_WORDS.wrongCode }
    // A fresh token, so everything after this reads the phone as an account.
    await s.auth.refreshSession().catch(() => null)

    if (pending.mode === 'existing' && pending.ticket) {
      const { data } = await s.auth.getSession()
      const token = data.session?.access_token
      // The events re-enter by their codes anyway (EnsureMember), so a merge
      // that cannot be reached costs an organiser's hours at most — tried
      // twice, then let go.
      if (token) {
        for (let i = 0; i < 2; i++) {
          const r = await askServer(token, { action: 'merge', ticket: pending.ticket })
          if (r?.status === 200) break
        }
      }
    }
    forgetPending()
    return { ok: true }
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

// ─── Leaving ───────────────────────────────────────────────────

/**
 * Sign this phone out of the account. It is a phone with no account again:
 * the next event page gives it a fresh identity, which enters by the code
 * and the claimed name exactly as any phone does.
 */
export async function signOutAccount(): Promise<Answer> {
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  try {
    await (await client()).auth.signOut({ scope: 'local' })
    forgetPending()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not sign out — try again.' }
  }
}

/** Delete the account, then sign this phone out of it. */
export async function deleteAccount(): Promise<Answer> {
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  try {
    const s = await client()
    const { data } = await s.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { ok: false, error: ACCOUNT_WORDS.noReach }
    const r = await askServer(token, { action: 'delete' })
    if (r?.status !== 200) {
      return { ok: false, error: typeof r?.body.error === 'string' ? r.body.error : 'Could not delete the account — try again.' }
    }
    await s.auth.signOut({ scope: 'local' }).catch(() => null)
    forgetPending()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not delete the account — try again.' }
  }
}
