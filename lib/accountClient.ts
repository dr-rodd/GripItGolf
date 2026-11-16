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

import type { ClubEvent } from './clubs'
import type { SeasonRow } from './cardSummary'
import { ACCOUNT_WORDS, normaliseEmail, normaliseUsername, type MyEvent } from './account'
import { phoneIdentity } from './entryClient'
import { forgetOwnerUnlocks } from './passcode'
import { forgetTier, readTierHint, rememberTier } from './tierHint'

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
    const signedIn = !!(u && !u.is_anonymous && u.email)
    // Kept true on every read (D154): a phone signed in has a hint, one
    // signed out has none. A club's hint is the club page's to set or drop.
    if (!signedIn) forgetTier()
    else if (!readTierHint()) rememberTier({ kind: 'dot' })
    return signedIn ? { email: u!.email!.toLowerCase() } : null
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

async function askServer(token: string, body: Record<string, unknown>, url = '/api/account'): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const res = await fetch(url, {
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

/**
 * Send a code to confirm this email on this phone, joining Green Dot. An
 * email that already has an account is refused with `exists`, never sent a
 * sign-in code.
 */
export async function sendCode(raw: string): Promise<{ ok: true; pending: Pending } | { ok: false; error: string; exists?: true }> {
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

    // An email that already has an account is not joined again (Ross, 15 Nov
    // 2026): the screen says so and offers Forgot password, which is the one
    // way a second phone reaches an account it forgot the password of.
    return { ok: false, error: ACCOUNT_WORDS.emailTaken, exists: true }
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
    if (!readTierHint()) rememberTier({ kind: 'dot' })
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
    if (!readTierHint()) rememberTier({ kind: 'dot' })
    return { ok: true }
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

// ─── My events (stage (b1), D134) ──────────────────────────────

/**
 * Every event this account owns, has entered, or is linked to a player in —
 * asked after the page has painted. Asking also takes on any event made with
 * this account's email that nobody owns yet, and links the names this
 * account has claimed.
 */
export async function myEvents(): Promise<{ ok: true; events: MyEvent[] } | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const r = await askServer(token, { action: 'events' })
  if (r?.status !== 200 || !Array.isArray(r.body.events)) return { ok: false, error: 'Could not load your events — try again.' }
  return { ok: true, events: r.body.events as MyEvent[] }
}

/** What the personal page reads, in one ask after it paints (stage (g), Q5). */
export interface HomeData {
  username: string | null
  events: MyEvent[]
  /** The verified club this account is on the list of — the phone goes on to it (D148). */
  club: { slug: string; name: string } | null
  season: SeasonRow[]
  courses: Record<string, string>
  /** D179: the account's handicap index, shown and changed on Me. */
  handicapIndex: number | null
}

/**
 * The personal page's one ask. `signedOut` when this phone holds no account
 * — the page then clears its hint and shows the front page (D154).
 */
export async function homeData(): Promise<{ ok: true; home: HomeData } | { ok: false; signedOut?: true; error: string }> {
  if (!(await readAccount())) return { ok: false, signedOut: true, error: ACCOUNT_WORDS.noReach }
  const token = await accountToken()
  if (!token) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const r = await askServer(token, { action: 'home' })
  if (r?.status === 401 || r?.status === 403) return { ok: false, signedOut: true, error: ACCOUNT_WORDS.noReach }
  if (r?.status !== 200 || !Array.isArray(r.body.events)) return { ok: false, error: 'Could not load your page — try again.' }
  const b = r.body as Record<string, unknown>
  const club = b.club && typeof b.club === 'object' ? b.club as HomeData['club'] : null
  if (club) rememberTier({ kind: 'club', slug: club.slug })
  else if (readTierHint()?.kind !== 'dot') rememberTier({ kind: 'dot' })
  return {
    ok: true,
    home: {
      username: typeof b.username === 'string' ? b.username : null,
      events: b.events as MyEvent[],
      club,
      season: Array.isArray(b.season) ? b.season as SeasonRow[] : [],
      courses: b.courses && typeof b.courses === 'object' ? b.courses as Record<string, string> : {},
      handicapIndex: typeof b.handicapIndex === 'number' ? b.handicapIndex : null,
    },
  }
}

/**
 * D179: this account's handicap index — read (`undefined`) or set (a typed
 * index, or '' to take it off) through the server's one writer, which logs
 * it. Never throws.
 */
export async function accountIndex(index?: string): Promise<{ ok: true; index: number | null } | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const r = await askServer(token, index === undefined ? { action: 'handicap' } : { action: 'handicap', index })
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  return { ok: true, index: typeof r.body.handicapIndex === 'number' ? r.body.handicapIndex : null }
}

/** "Add an event you run": its code and organiser PIN make it this account's. */
export async function claimEvent(code: string, pin: string): Promise<Answer> {
  const token = await accountToken()
  if (!token) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const r = await askServer(token, { action: 'claim', code: code.trim().toUpperCase(), pin })
  if (r?.status === 200) return { ok: true }
  return { ok: false, error: typeof r?.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
}

/** This account's link to its player in one event, undone (D134). */
export async function unlinkPlayer(code: string): Promise<Answer> {
  const token = await accountToken()
  if (!token) return { ok: false, error: ACCOUNT_WORDS.noReach }
  const r = await askServer(token, { action: 'unlink', code })
  if (r?.status === 200) return { ok: true }
  return { ok: false, error: typeof r?.body.error === 'string' ? r.body.error : 'Could not unlink — try again.' }
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
    forgetOwnerUnlocks()
    forgetTier()
    forgetAllKept()
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
    forgetOwnerUnlocks()
    forgetTier()
    forgetAllKept()
    forgetPending()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not delete the account — try again.' }
  }
}

// ─── Clubs (stage (c)) ─────────────────────────────────────────

export type ClubRoleWord = 'owner' | 'admin' | 'member'
export interface ClubSummary {
  id: string; slug: string; name: string; status: 'pending' | 'verified' | 'refused'; role: ClubRoleWord
  colour: string | null; crestUrl: string | null; artUrl: string | null; artDarkUrl: string | null
  /** D161: the club's home course, or null. */
  homeCourseId?: string | null
}
export interface ClubListEntry {
  id: string; name: string; memberNumber: string | null; guiNumber: string | null; email: string | null
  role: ClubRoleWord; linked: boolean; removed: boolean; onBoards: boolean
  /** D179: the one index — a linked row's account's, an unlinked row's own. */
  handicapIndex?: number | null
}
export interface ClubAnswer {
  clubs?: ClubSummary[]
  club?: ClubSummary
  list?: ClubListEntry[]
  added?: number
  updated?: number
  skipped?: { name: string; why: string }[]
  sentTo?: string
  events?: ClubEvent[]
  entries?: string[]
  me?: { name: string }
  season?: SeasonRow[]
  courses?: Record<string, string>
  outside?: ClubEvent[]
  tops?: Record<string, { name: string; points: number }>
  /** Stage (d3): competitions with a card waiting on this member. */
  toSign?: { code: string; name: string; count: number }[]
  /** D179: said once on linking, when the club's index differed from the account's. */
  note?: string
}

/**
 * One ask of /api/club, as this signed-in Green Dot member: `mine`,
 * `create`, `club`, `members`, `add`, `update`, `remove`, `restore`,
 * `invite`, `link`. Never throws.
 */
export async function askClub(action: string, body: Record<string, unknown> = {}): Promise<({ ok: true } & ClubAnswer) | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const r = await askServer(token, { ...body, action }, '/api/club')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  return { ok: true, ...(r.body as ClubAnswer) }
}

/**
 * A club's crest, art or dark art, sent whole to the server, which checks,
 * resizes and keeps it (D156) — or, with `file: null`, takes it off.
 */
export async function uploadClubImage(clubId: string, kind: 'crest' | 'art' | 'art_dark', file: File | null): Promise<({ ok: true } & ClubAnswer) | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const form = new FormData()
  form.set('clubId', clubId)
  form.set('kind', kind)
  if (file) form.set('file', file)
  else form.set('remove', '1')
  try {
    const res = await fetch('/api/club/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, credentials: 'same-origin' })
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    if (res.status === 413) return { ok: false, error: 'Keep the image under 4 MB.' }
    if (res.status !== 200) return { ok: false, error: typeof body.error === 'string' ? body.error : ACCOUNT_WORDS.noReach }
    return { ok: true, ...(body as ClubAnswer) }
  } catch {
    return { ok: false, error: ACCOUNT_WORDS.noReach }
  }
}

// ─── Club competitions (stage (d2)) ────────────────────────────

/**
 * D162: a verified club's owner or admin makes a competition. The server
 * makes the event, its round and its tee sheet in one request, and sets
 * this phone's way through a members-only door. Never throws.
 */
export async function makeCompetition(clubId: string, form: Record<string, unknown>): Promise<{ ok: true; code: string; slug: string } | { ok: false; error: string }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.' }
  const r = await askServer(token, { clubId, form }, '/api/club/competition')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  return { ok: true, code: String(r.body.code), slug: String(r.body.slug) }
}

export interface BookingAnswer {
  myPlayerId?: string | null
  myRowId?: string
  admin?: boolean
  booked?: boolean
  names?: { id: string; name: string; booked: boolean; linked: boolean }[]
}

/**
 * A club competition's booking (D173): `state` (what this phone is in it,
 * and the members-only door's way through), `names` (partners from the
 * list), `book` and `withdraw`. Never throws.
 */
export async function askBooking(action: 'state' | 'names' | 'book' | 'withdraw', body: Record<string, unknown>): Promise<({ ok: true } & BookingAnswer) | { ok: false; error: string; status?: number }> {
  const code = typeof body.code === 'string' ? body.code : ''
  if (action === 'state') return kept(`booking:${code}`, () => askBookingNow(action, body))
  const r = await askBookingNow(action, body)
  if (r.ok) forgetKept(code)
  return r
}

async function askBookingNow(action: 'state' | 'names' | 'book' | 'withdraw', body: Record<string, unknown>): Promise<({ ok: true } & BookingAnswer) | { ok: false; error: string; status?: number }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.', status: 401 }
  const r = await askServer(token, { ...body, action }, '/api/club/booking')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, status: r.status, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  return { ok: true, ...(r.body as BookingAnswer) }
}

/** One card waiting to be signed, or signed (stage (d3), `/api/card/sign` `list`). */
export interface CardToSign {
  playerId: string
  name: string
  approved: boolean
  marked: boolean
  markerName: string | null
  markedAs: 'marker' | 'admin' | null
  mine: boolean
  canApprove: boolean
  canMark: boolean
  canSendBack: boolean
  canChangeMarker: boolean
  card: { number: number; par: number; gross: number | null; noReturn: boolean; points: number | null }[]
}

/**
 * A club competition's cards to sign (stage (d3)): `list`, `approve` (the
 * player's own), `mark` (the marker's, or an owner's or admin's), `marker`
 * (a new one) and `send_back`. Never throws.
 */
export async function askSign(
  action: 'list' | 'approve' | 'mark' | 'marker' | 'send_back',
  body: Record<string, unknown>,
): Promise<{ ok: true; items: CardToSign[] } | { ok: false; error: string; status?: number }> {
  const code = typeof body.code === 'string' ? body.code : ''
  if (action === 'list') return kept(`sign:${code}`, () => askSignNow(action, body))
  const r = await askSignNow(action, body)
  if (r.ok) forgetKept(code)
  return r
}

async function askSignNow(
  action: 'list' | 'approve' | 'mark' | 'marker' | 'send_back',
  body: Record<string, unknown>,
): Promise<{ ok: true; items: CardToSign[] } | { ok: false; error: string; status?: number }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.', status: 401 }
  const r = await askServer(token, { ...body, action }, '/api/card/sign')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, status: r.status, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  return { ok: true, items: Array.isArray(r.body.items) ? r.body.items as CardToSign[] : [] }
}

/** A booked player as the club's admins see them when certifying (stage (d4)). */
export interface CertifyPlayer {
  playerId: string
  name: string
  state: 'none' | 'on_course' | 'waiting' | 'final' | 'no_return'
  liveRoundId: string | null
  cardmates: string[]
}

export interface CertifyAnswer {
  ready?: boolean
  certifiedAt?: string | null
  mayCertify?: boolean
  players?: CertifyPlayer[]
  changes?: { name: string; oldIndex: number | null; newIndex: number | null; at: string; by: string; source: string }[]
}

/**
 * A club competition's results, its owners' and admins' (stage (d4)):
 * `state`, `no_return`, `undo_no_return`, `void`, `certify`, `reopen`.
 * Never throws.
 */
export async function askCertify(
  action: 'state' | 'no_return' | 'undo_no_return' | 'void' | 'certify' | 'reopen',
  body: Record<string, unknown>,
): Promise<({ ok: true } & CertifyAnswer) | { ok: false; error: string; status?: number }> {
  const code = typeof body.code === 'string' ? body.code : ''
  if (action === 'state') return kept(`certify:${code}`, () => askCertifyNow(action, body))
  const r = await askCertifyNow(action, body)
  if (r.ok) forgetKept(code)
  return r
}

async function askCertifyNow(
  action: 'state' | 'no_return' | 'undo_no_return' | 'void' | 'certify' | 'reopen',
  body: Record<string, unknown>,
): Promise<({ ok: true } & CertifyAnswer) | { ok: false; error: string; status?: number }> {
  const token = await accountToken()
  if (!token) return { ok: false, error: 'Sign in to your Green Dot account first.', status: 401 }
  const r = await askServer(token, { ...body, action }, '/api/card/certify')
  if (!r) return { ok: false, error: ACCOUNT_WORDS.noReach }
  if (r.status !== 200) return { ok: false, status: r.status, error: typeof r.body.error === 'string' ? r.body.error : ACCOUNT_WORDS.noReach }
  return { ok: true, ...(r.body as CertifyAnswer) }
}

// ─── A competition's own reads, shared and kept (D198) ─────────

/**
 * A competition page's reads of who this phone is in it (booked, an admin),
 * its cards to sign and its results card — asked once for every part of the
 * page that wants them (four parts asked the same `state` on every tab), and
 * the last answer kept in this tab's memory so a part drawn again starts
 * from it (`peekKept`) while the fresh one comes. Anything that changes a
 * competition forgets that competition's answers. Never stored on the phone.
 */
const keptAnswers = new Map<string, { at: number; value: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()
/** An answer this young is used as it is, not asked again — parts of one page mounting together. */
const SHARE_MS = 4_000

async function kept<T extends { ok: boolean }>(key: string, ask: () => Promise<T>): Promise<T> {
  const have = keptAnswers.get(key)
  if (have && Date.now() - have.at < SHARE_MS) return have.value as T
  const going = inFlight.get(key)
  if (going) return going as Promise<T>
  const p = ask().then(r => {
    if (r.ok) keptAnswers.set(key, { at: Date.now(), value: r })
    return r
  }).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/** The last answer kept for a competition's read, to draw from at once — or undefined. */
export function peekKept<T>(kind: 'booking' | 'sign' | 'certify', code: string): T | undefined {
  return keptAnswers.get(`${kind}:${code}`)?.value as T | undefined
}

/** A competition changed: its kept answers go, so the next read is fresh. */
export function forgetKept(code: string) {
  for (const k of ['booking', 'sign', 'certify']) keptAnswers.delete(`${k}:${code}`)
}

/** Every kept answer goes — signed out or deleted. */
function forgetAllKept() {
  keptAnswers.clear()
}
