// A person's account — the only copy of its rules (D94–D104; Ross,
// 14 Nov 2026). Stage (a): signing in, signing out and deleting the account.
// **No new powers**: an account changes nothing anybody may do in any event
// yet — that is stage (b) — and nobody ever needs one to join, play, score
// or watch. `docs/pending-concepts.md`, "Accounts and clubs", has the plan.
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

import type { FieldRole, Membership } from './membership'

/**
 * Whether the screens link to the account page. Off until Supabase sends
 * its codes through Resend and the page has been tried on a phone
 * (`docs/pending-concepts.md`, question E) — until then /account works for
 * whoever types the address, and nothing points at it.
 */
export const ACCOUNTS_LINKED = false

/** The account page. */
export const ACCOUNT_PATH = '/account'

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

// ─── Who a user is ─────────────────────────────────────────────

/** A Supabase user as these rules read one. */
export interface AuthUser {
  id: string
  isAnonymous: boolean
  email: string | null
  /** The email has been confirmed by a code. */
  emailConfirmed: boolean
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

// ─── The words ─────────────────────────────────────────────────

export const ACCOUNT_WORDS = {
  never: 'You never need an account to join, play, score or watch.',
  why: 'An account keeps your events with you when you change phone.',
  sent: (email: string) => `We sent a ${CODE_LENGTH}-digit code to ${email}.`,
  wrongCode: 'That code isn’t right or has run out — check it, or send a new one.',
  tooMany: 'Too many codes asked for — wait a minute and try again.',
  noReach: 'Could not reach Green Dot — try again.',
  failed: 'Could not sign in — try again.',
  deleted: 'Your account is deleted. Your names and scores stay with the events they were played in.',
} as const
