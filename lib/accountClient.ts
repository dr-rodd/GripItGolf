// The browser's half of an account (stages (a) and (a2); the rules are
// lib/account.ts).
//
// **The only browser file that talks to Supabase's sign-in for accounts.**
// `updateUser`, `signInWithOtp`, `verifyOtp` and `setSession` appear here and
// nowhere else, and only the account page imports this file — `test:account`
// holds both, so no trip screen, layout, scoring path or join flow can come
// to need an account.
//
// A password sign-in (D132) is checked on the server — a username's email
// never reaches this phone — which hands back the session for `setSession`.
// A password is set here, on the signed-in session (`updateUser`).
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

import { ACCOUNT_WORDS, normaliseEmail, normaliseUsername } from './account'
import { phoneIdentity } from './entryClient'

export type Mode = 'upgrade' | 'existing'

/**
 * A code asked for and not yet typed — kept for the tab, so a trip to Mail
 * loses nothing. `purpose` says what the code is for: joining, or a
 * forgotten password (which owes a new one once the code is in).
 */
export interface Pending { email: string; mode: Mode; ticket: string | null; at: number; purpose?: 'join' | 'forgot' }

export type Answer = { ok: true } | { ok: false; error: string }

const PENDING_KEY = 'gd.account.pending.v1'
/** A forgotten password's code is in: a new password is owed before the phone is done. */
const OWED_KEY = 'gd.account.password-owed.v1'
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
      const pending: Pending = { email, mode: 'upgrade', ticket: null, at: Date.now(), purpose: 'join' }
      keepPending(pending)
      return { ok: true, pending }
    }
    if (rateLimited(upgrade.error)) return { ok: false, error: ACCOUNT_WORDS.tooMany }
    if (!alreadyExists(upgrade.error)) return { ok: false, error: ACCOUNT_WORDS.failed }

    // A second phone: take the proof of this one before anything changes.
    return await codeForExisting(email, phone.token, 'join', false)
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

/**
 * The account's own code (`signInWithOtp`, never making an account), after
 * taking the sealed proof of this phone's identity. `quiet`: an email with no
 * account behind it is answered exactly as one with — the forgotten-password
 * door must not say who is a Green Dot member.
 */
async function codeForExisting(
  email: string, phoneToken: string, purpose: 'join' | 'forgot', quiet: boolean,
): Promise<{ ok: true; pending: Pending } | { ok: false; error: string }> {
  const s = await client()
  const t = await askServer(phoneToken, { action: 'ticket' })
  const ticket = t?.status === 200 && typeof t.body.ticket === 'string' ? t.body.ticket : null
  if (!ticket && t?.status !== 409) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const otp = await s.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (otp.error && rateLimited(otp.error)) return { ok: false, error: ACCOUNT_WORDS.tooMany }
  if (otp.error && !quiet) return { ok: false, error: ACCOUNT_WORDS.failed }
  const pending: Pending = { email, mode: 'existing', ticket, at: Date.now(), purpose }
  keepPending(pending)
  return { ok: true, pending }
}

/** "Forgot password?": a code to the email, then a new password (D132). */
export async function sendForgotCode(raw: string): Promise<{ ok: true; pending: Pending } | { ok: false; error: string }> {
  const email = normaliseEmail(raw)
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const phone = await phoneIdentity()
  if (!phone) return { ok: false, error: ACCOUNT_WORDS.noReach }
  try {
    return await codeForExisting(email, phone.token, 'forgot', true)
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
    if (pending.purpose === 'forgot') {
      try { window.sessionStorage.setItem(OWED_KEY, '1') } catch { /* asked again from status */ }
    }
    forgetPending()
    return { ok: true }
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

/** A forgotten password's code went in and no new password has been saved yet. */
export function passwordOwed(): boolean {
  if (!inBrowser()) return false
  try { return window.sessionStorage.getItem(OWED_KEY) === '1' } catch { return false }
}

// ─── Username and password (D128–D132) ─────────────────────────

async function accountToken(): Promise<string | null> {
  try {
    const { data } = await (await client()).auth.getSession()
    return data.session && !data.session.user.is_anonymous ? data.session.access_token : null
  } catch {
    return null
  }
}

/** What the signed-in account still needs: its username, and whether it has a password. */
export async function accountStatus(): Promise<{ username: string | null; hasPassword: boolean } | null> {
  const token = await accountToken()
  if (!token) return null
  const r = await askServer(token, { action: 'status' })
  if (r?.status !== 200) return null
  return {
    username: typeof r.body.username === 'string' ? r.body.username : null,
    hasPassword: r.body.hasPassword === true,
  }
}

export type UsernameCheck = 'free' | 'taken' | { invalid: string } | 'failed'

/** Is this username free? Asked as it is typed; counted by the server. */
export async function checkUsername(raw: string): Promise<UsernameCheck> {
  const phone = await phoneIdentity()
  const token = (await accountToken()) ?? phone?.token
  if (!token) return 'failed'
  const r = await askServer(token, { action: 'username-check', username: normaliseUsername(raw) })
  if (r?.status !== 200) return 'failed'
  if (r.body.result === 'invalid') return { invalid: typeof r.body.error === 'string' ? r.body.error : 'That username won’t do.' }
  return r.body.result === 'taken' ? 'taken' : 'free'
}

/** Save the account's username — the first time, or a change. */
export async function saveUsername(raw: string): Promise<Answer> {
  const token = await accountToken()
  if (!token) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const r = await askServer(token, { action: 'set-username', username: normaliseUsername(raw) })
  if (r?.status === 200) return { ok: true }
  return { ok: false, error: typeof r?.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
}

/**
 * Set the account's password on its own signed-in session. A phone signed
 * in long ago may be asked by Supabase to prove it again first (`reauth`):
 * the screen sends it through Forgot password, which is a fresh code.
 */
export async function savePassword(password: string): Promise<Answer | { ok: false; error: string; reauth: true }> {
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  try {
    const { error } = await (await client()).auth.updateUser({ password })
    const e = error as AuthErr
    if (!e || e.code === 'same_password') {
      try { window.sessionStorage.removeItem(OWED_KEY) } catch { /* nothing owed */ }
      return { ok: true }
    }
    if (/reauth/.test(e.code ?? '')) return { ok: false, error: ACCOUNT_WORDS.reauth, reauth: true }
    if (e.code === 'weak_password') return { ok: false, error: 'Choose a longer password.' }
    return { ok: false, error: 'Could not save the password — try again.' }
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

/**
 * Sign in with a username or an email, and a password (D132). Checked on the
 * server, which hands back the session; this phone's own events come with
 * it. Every failure reads the same.
 */
export async function signIn(identifier: string, password: string): Promise<Answer> {
  if (!inBrowser()) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const phone = await phoneIdentity()
  try {
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(phone ? { Authorization: `Bearer ${phone.token}` } : {}) },
      body: JSON.stringify({ action: 'sign-in', identifier, password }),
      credentials: 'same-origin',
    })
    const body = await res.json().catch(() => ({})) as { session?: { access_token?: unknown; refresh_token?: unknown } }
    if (res.status === 429) return { ok: false, error: ACCOUNT_WORDS.tooMany }
    if (res.status === 401) return { ok: false, error: ACCOUNT_WORDS.signInFailed }
    const at = body.session?.access_token, rt = body.session?.refresh_token
    if (res.status !== 200 || typeof at !== 'string' || typeof rt !== 'string') return { ok: false, error: ACCOUNT_WORDS.noReach }
    const { error } = await (await client()).auth.setSession({ access_token: at, refresh_token: rt })
    if (error) return { ok: false, error: ACCOUNT_WORDS.noReach }
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
    try { window.sessionStorage.removeItem(OWED_KEY) } catch { /* nothing owed */ }
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
