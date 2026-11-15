// A person's account — the only copy of its rules (D94–D104; Ross,
// 14 Nov 2026). Stage (a): signing in, signing out and deleting the account.
// Nobody ever needs one to join, play, score or watch; **making an event
// needs one** (D135, 15 Nov 2026 — `CREATE_NEEDS_ACCOUNT`). `docs/pending-concepts.md`, "Accounts and clubs", has the plan.
//
// One kind of account: a person, by email and a 6-digit code typed into the
// same screen. No passwords, no links, no Google or Apple.
//
// **Signing in upgrades this phone's own identity in place.** Every phone is
// already a Supabase anonymous user (row-level security stage 1); adding an
// email to it keeps its user id, so every event it has entered stays entered.
// **Where the email already has an account** — a second phone, or the
// home-screen app, which has its own storage — the phone signs in to that
// account instead and the server moves this phone's events across
// (`mergeMemberships`), then forgets the phone's old identity.
//
// Pure: no database, no browser, no crypto — the browser's half
// (lib/accountClient.ts) imports it too. The server's half is
// app/api/account/account.ts.

import type { AttemptLimit, FieldRole, Membership } from './membership'

/**
 * Whether the screens link to the account page. Switched on with
 * `CREATE_NEEDS_ACCOUNT` (Ross, 15 Nov 2026): Supabase sends its codes
 * through Resend and the page has been tried on a phone.
 */
export const ACCOUNTS_LINKED = true

/** The account page. */
export const ACCOUNT_PATH = '/account'

// ─── Making an event (D135) ────────────────────────────────────

/**
 * Only a Green Dot member makes an event (Ross, 15 Nov 2026, D135): every
 * create wizard asks the phone to sign in first, and `/api/trip/create`
 * refuses a phone without an account. **Joining, playing, scoring and
 * watching never need one** (D94) — this is the one door an account opens.
 * Every event made before keeps working exactly as it does.
 */
export const CREATE_NEEDS_ACCOUNT = true

/** The server's refusal of a phone with no account, said on the wizard if it is ever reached. */
export const CREATE_REFUSED = 'Making an event needs a Green Dot account. Sign in, then try again.'

/**
 * Where the account page sends a member once they are signed in: a path on
 * this site, never another site (`//evil`) and never the account page itself.
 * Null when there is nowhere to go back to.
 */
export function safeNext(raw: string | null | undefined): string | null {
  const s = String(raw ?? '')
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return null
  if (s === ACCOUNT_PATH || s.startsWith(`${ACCOUNT_PATH}?`) || s.startsWith(`${ACCOUNT_PATH}/`) || s.startsWith(`${ACCOUNT_PATH}#`)) return null
  if (s.length > 500 || /[\u0000-\u001f]/.test(s)) return null
  return s
}

/** The account page, opened to come back to `next` — on its Join face when `join`. */
export function accountLink(next: string | null, join = false): string {
  const q = new URLSearchParams()
  const back = safeNext(next)
  if (back) q.set('next', back)
  if (join) q.set('join', '1')
  const s = q.toString()
  return s ? `${ACCOUNT_PATH}?${s}` : ACCOUNT_PATH
}

/** Digits in a sign-in code — Supabase's Email OTP Length, set to match. */
export const CODE_LENGTH = 6

/** How long the proof of the phone's old identity lasts while the code is typed. */
export const MERGE_TICKET_MS = 15 * 60 * 1000

// ─── The email and the code ────────────────────────────────────

/** An email address as an account keeps it: trimmed, lower case. */
export function normaliseEmail(raw: string): string {
  return String(raw ?? '').trim().toLowerCase()
}

/** Why an email will not do, in a sentence — null when it will. */
export function emailIssue(raw: string): string | null {
  const e = normaliseEmail(raw)
  if (!e) return 'Type your email address.'
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'That doesn’t look like an email address.'
  return null
}

/** What may be typed into the code box: digits only, never more than a code. */
export function codeDigits(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH)
}

/** Why a code will not do — null when it is the right length. */
export function codeIssue(raw: string): string | null {
  return codeDigits(raw).length === CODE_LENGTH ? null : `The code is ${CODE_LENGTH} digits.`
}

// ─── The username (D130) ───────────────────────────────────────

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

/**
 * Names nobody may take: the site's own, its people's roles, and words a
 * screen might print beside a name and be misread with. Compared after
 * lower-casing; dots and underscores in a reserved word are refused too
 * ("green.dot", "green_dot").
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin', 'administrator', 'greendot', 'greendotlive', 'greendotgolf', 'support', 'root', 'help',
  'system', 'staff', 'official', 'moderator', 'mod', 'owner', 'organiser', 'organizer', 'api',
  'account', 'accounts', 'login', 'signin', 'signup', 'join', 'member', 'members', 'club', 'clubs',
  'golf', 'run', 'privacy', 'terms', 'security', 'info', 'contact', 'team', 'null', 'undefined',
  'everyone', 'anonymous', 'guest', 'player', 'spectator', 'me',
]

/** A username as it is kept: trimmed and lower case. */
export function normaliseUsername(raw: string): string {
  return String(raw ?? '').trim().toLowerCase()
}

/** Why a username will not do, in a sentence — null when it will. */
export function usernameIssue(raw: string): string | null {
  const u = normaliseUsername(raw)
  if (!u) return 'Choose a username.'
  if (u.includes('@')) return 'A username can’t have an @ in it.'
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) return `A username is ${USERNAME_MIN} to ${USERNAME_MAX} characters.`
  if (!/^[a-z0-9._]+$/.test(u)) return 'Use only letters, numbers, dots and underscores.'
  if (u.startsWith('.') || u.endsWith('.')) return 'A username can’t start or end with a dot.'
  if (RESERVED_USERNAMES.includes(u.replace(/[._]/g, ''))) return 'That username isn’t available.'
  return null
}

// ─── The password (D131) ───────────────────────────────────────

export const PASSWORD_MIN = 8
/** Supabase keeps passwords with bcrypt, which reads 72 bytes and no more. */
export const PASSWORD_MAX = 72

/** Why a password will not do — its length, and nothing else. */
export function passwordIssue(raw: string): string | null {
  const p = String(raw ?? '')
  if (p.length < PASSWORD_MIN) return `A password is at least ${PASSWORD_MIN} characters.`
  if (new TextEncoder().encode(p).length > PASSWORD_MAX) return `A password is at most ${PASSWORD_MAX} characters.`
  return null
}

/**
 * The second box when a password is chosen (Ross, 15 Nov 2026): typed twice
 * so a slip is caught here, not at the next sign-in. Only where a password
 * is *set* — signing in asks for it once.
 */
export function passwordConfirmIssue(password: string, again: string): string | null {
  return String(password ?? '') === String(again ?? '') ? null : 'The two passwords don’t match.'
}

// ─── Signing in (D132) ─────────────────────────────────────────

/** One field, two kinds: anything with an @ in it is an email, anything else a username. */
export function signInRoute(identifier: string): { kind: 'email'; email: string } | { kind: 'username'; username: string } {
  const raw = String(identifier ?? '').trim()
  return raw.includes('@') ? { kind: 'email', email: normaliseEmail(raw) } : { kind: 'username', username: normaliseUsername(raw) }
}

/**
 * The one answer to every failed sign-in — a wrong password, a name nobody
 * has, an email nobody has, a junior's profile. It never says which part was
 * wrong, or whether there is anybody by that name.
 */
export const SIGN_IN_FAILED = 'Wrong username, email or password'

/**
 * Wrong sign-ins counted (on the server, `account_attempts`): per network
 * address, which stops one phone guessing, and per name typed — counted
 * whether or not anybody has that name, so the count says nothing — which
 * stops a spread-out guess at one person's password. Username checks are
 * counted per address, every one, so the list of names cannot be read off.
 */
export const SIGN_IN_LIMITS = {
  address: { max: 10, windowMs: 15 * 60 * 1000 },
  name: { max: 20, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, AttemptLimit>
export const USERNAME_CHECK_LIMIT: AttemptLimit = { max: 60, windowMs: 10 * 60 * 1000 }
/** The nightly cleanup deletes a count whose window started this long ago. */
export const ACCOUNT_ATTEMPT_KEEP_HOURS = 24

// ─── Who a user is ─────────────────────────────────────────────

/** A Supabase user as these rules read one. */
export interface AuthUser {
  id: string
  isAnonymous: boolean
  email: string | null
  /** The email has been confirmed by a code. */
  emailConfirmed: boolean
  /**
   * A junior's profile (D108) — set only by the server, in Supabase's
   * `app_metadata`, which no phone can write. Never a username or password.
   */
  junior?: boolean
}

/** A junior's profile has neither a username nor a password (D108, D131). */
export function credentialsRefused(u: Pick<AuthUser, 'junior'> | null | undefined): boolean {
  return !!u?.junior
}

/**
 * An account, not a phone: an email that a code has confirmed. An anonymous
 * user with an email waiting on its code is still a phone.
 */
export function isAccount(u: AuthUser | null | undefined): u is AuthUser {
  return !!u && !u.isAnonymous && !!u.email && u.emailConfirmed
}

// ─── Moving a phone's events onto an account ───────────────────

const RANK: Record<FieldRole, number> = { spectator: 0, guest: 1, player: 2 }
const rankOf = (r: unknown) => (r === 'player' || r === 'guest' || r === 'spectator' ? RANK[r] : 0)

/**
 * One event's row on the account after this phone's is moved onto it — the
 * entry rule (`mergeGrant`) for two rows: **never lowers anything**. The
 * higher field role; the later organiser grant; a player claim kept — the
 * account's own where both claimed somebody, because the phone's cookie
 * writes its own the next time it enters anyway.
 */
export function mergeMemberships(account: Membership | null, phone: Membership): Membership {
  if (!account) return { ...phone }
  const role = rankOf(phone.role) > rankOf(account.role) ? phone.role : account.role
  const t = (iso: string | null) => (iso ? Date.parse(iso) : NaN)
  const a = t(account.organiserUntil)
  const p = t(phone.organiserUntil)
  const until = Math.max(Number.isFinite(a) ? a : -Infinity, Number.isFinite(p) ? p : -Infinity)
  return {
    role,
    playerId: account.playerId ?? phone.playerId ?? null,
    organiserUntil: Number.isFinite(until) ? new Date(until).toISOString() : null,
  }
}

// ─── My events (stage (b1), D134) ──────────────────────────────

/**
 * One event on a Green Dot member's list: one they own, one they have
 * entered on a phone signed in to their account, or one where they are linked
 * to a player. Reached through the short link, which knows where a code lives.
 */
export interface MyEvent {
  code: string
  name: string
  kind: 'trip' | 'tournament' | 'run'
  startDate: string | null
  endDate: string | null
  owned: boolean
  /** The player this account is linked to there (D134), if any. */
  player: { id: string; name: string } | null
}

/** Newest first by start date, events without a date last, then by name. */
export function sortMyEvents(events: MyEvent[]): MyEvent[] {
  return [...events].sort((a, b) => {
    const da = a.startDate ?? '', db = b.startDate ?? ''
    if (da !== db) return da && db ? (da < db ? 1 : -1) : da ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/** An event code as typed into "Add an event you run": six letters and digits. */
export function claimCodeIssue(raw: string): string | null {
  return /^[A-Z0-9]{6}$/.test(String(raw ?? '').trim().toUpperCase()) ? null : 'An event code is 6 letters and numbers.'
}

// ─── The words ─────────────────────────────────────────────────

/**
 * On screen (D133): anyone with an account is a "Green Dot member", a
 * club's people "<club name> members" — never a bare "member". The code
 * keeps the word account.
 */
export const ACCOUNT_WORDS = {
  never: 'You never need to be a Green Dot member to join, play, score or watch.',
  why: 'Green Dot members keep their events with them when they change phone.',
  signInFailed: SIGN_IN_FAILED,
  reauth: 'To set a password, sign in once more with a code — tap Forgot password.',
  emailTaken: 'That email is already linked to a Green Dot account. Sign in, or tap Forgot password if you can’t remember it.',
  sent: (email: string) => `We sent a ${CODE_LENGTH}-digit code to ${email}.`,
  wrongCode: 'That code isn’t right or has run out — check it, or send a new one.',
  tooMany: 'Too many codes asked for — wait a minute and try again.',
  noReach: 'Could not reach Green Dot — try again.',
  failed: 'Could not sign in — try again.',
  deleted: 'Your account is deleted. Your names and scores stay with the events they were played in.',
} as const
