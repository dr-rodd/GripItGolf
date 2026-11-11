// Who a phone is in an event — the only copy of the rules (row-level
// security, stage 1; docs/gotchas-and-debt.md, "Row-level security").
//
// Every phone signs in silently as a Supabase anonymous user, and entering an
// event writes one `trip_members` row (migration 068) through `/api/entry` —
// the only writer. This file decides what that row says and what it allows.
// Pure: no database, no browser. `app/api/entry/entry.ts` applies it, and in
// stage 3 onwards the database policies say the same thing in SQL.
//
// **Stage 1 enforces nothing.** The rows are recorded and these rules are
// tested, but no policy reads them yet. A sign-in or entry that fails blocks
// nothing and shows nothing.
//
// The four roles (Ross, 10 Nov 2026):
//
// * **organiser** — entered the admin PIN on this phone in the last
//   `ORGANISER_HOURS`. Not stored as the row's `role`: it is `organiser_until`,
//   so when it runs out the phone is simply what it was in the field again.
//   On a trip or event with no admin PIN at all, every member is the
//   organiser, as Trip Setup has always worked ("anybody on a trip without
//   one", CLAUDE.md).
// * **player** — this phone claimed a name; `player_id` says which.
// * **guest** — entered with the code and claimed nothing. May score, because
//   the phone holding a group's card need never have claimed a name.
// * **spectator** — reads only. Reserved for a future watch link; nothing
//   grants it yet.
//
// "Member" means organiser, player or guest — a spectator is not one.

import { irishInstant } from './irishTime'

export const ROLES = ['organiser', 'player', 'guest', 'spectator'] as const
export type Role = typeof ROLES[number]

/** What a row's `role` column may hold: where the phone stands in the field. */
export type FieldRole = Exclude<Role, 'organiser'>

/** Higher outranks lower; an entry never lowers a phone's field role. */
const FIELD_RANK: Record<FieldRole, number> = { spectator: 0, guest: 1, player: 2 }

/** A fixed twelve hours per phone from the last time the admin PIN was entered there (Ross, 10 Nov 2026). */
export const ORGANISER_HOURS = 12
export const ORGANISER_MS = ORGANISER_HOURS * 60 * 60 * 1000

/**
 * The field can still write on the thirtieth day after the event's end date;
 * from the next midnight, Irish time, it reads only. The organiser holding
 * the PIN is never capped.
 */
export const FIELD_WRITE_DAYS_AFTER_END = 30

/** One `trip_members` row, as this file reads it. */
export interface Membership {
  role: FieldRole
  playerId: string | null
  /** ISO instant; the organiser grant lasts until then. */
  organiserUntil: string | null
}

/** What the rules need to know about the event. */
export interface EventFacts {
  /** Whether the trip or event has an admin PIN (Trip Setup passcode) at all. */
  adminPinSet: boolean
  /** `trips.end_date`, 'YYYY-MM-DD', or null for an event with no end. */
  endDate: string | null
  /**
   * The field may still add rounds to an ad hoc series (`fieldOpenEnded`),
   * so its end date is only ever the last round so far: the 30-day cap
   * waits until the organiser turns `add_rounds` off (D59, 11 Nov 2026).
   */
  openEnded?: boolean
}

/** What one entry asks for. The route has already checked every part of it. */
export interface Grant {
  /** The PIN was right: organiser for the next twelve hours. */
  organiser?: boolean
  /** This phone's claimed player in this event, checked to belong to it. */
  playerId?: string | null
}

// ─── Merging an entry into what the phone already had ──────────

const isFieldRole = (r: unknown): r is FieldRole =>
  r === 'player' || r === 'guest' || r === 'spectator'

/**
 * The row after an entry. Entering with the code makes a phone a guest;
 * a claimed player makes it a player and says which; the PIN makes it the
 * organiser for twelve hours from now. **Never lowers anything**: a player
 * entering again without the cookie stays a player, and an organiser grant
 * is only ever pushed later, never brought forward.
 */
export function mergeGrant(existing: Membership | null, grant: Grant, now: Date): Membership {
  const before: FieldRole = existing && isFieldRole(existing.role) ? existing.role : 'spectator'
  const asked: FieldRole = grant.playerId ? 'player' : 'guest'
  const role = FIELD_RANK[asked] > FIELD_RANK[before] ? asked : before

  const playerId = grant.playerId ?? existing?.playerId ?? null

  const was = existing?.organiserUntil ? Date.parse(existing.organiserUntil) : NaN
  const fresh = grant.organiser ? now.getTime() + ORGANISER_MS : NaN
  const until = Math.max(Number.isFinite(was) ? was : -Infinity, Number.isFinite(fresh) ? fresh : -Infinity)

  return {
    role,
    playerId,
    organiserUntil: Number.isFinite(until) ? new Date(until).toISOString() : null,
  }
}

// ─── What a row means now ──────────────────────────────────────

/** Whether the twelve hours from the PIN are still running. */
export function organiserByPin(m: Membership | null, now: Date): boolean {
  if (!m?.organiserUntil) return false
  const until = Date.parse(m.organiserUntil)
  return Number.isFinite(until) && until > now.getTime()
}

/**
 * The phone's role in this event now — null for no row at all. The
 * organiser while the PIN's twelve hours run, or on an event nobody locked;
 * otherwise what it is in the field.
 */
export function roleOf(m: Membership | null, event: EventFacts, now: Date): Role | null {
  if (!m) return null
  if (organiserByPin(m, now)) return 'organiser'
  const field: FieldRole = isFieldRole(m.role) ? m.role : 'spectator'
  if (!event.adminPinSet && field !== 'spectator') return 'organiser'
  return field
}

/** Organiser, player or guest. A spectator watches; nobody else is in at all. */
export function isMember(role: Role | null): boolean {
  return role === 'organiser' || role === 'player' || role === 'guest'
}

/**
 * The instant the field goes read-only: midnight, Irish time, at the end of
 * the thirtieth day after the end date. Null for an event with no end date —
 * an ongoing league or a series stays open.
 */
export function fieldReadOnlyFrom(endDate: string | null): Date | null {
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null
  const ms = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  const day = new Date(ms + (FIELD_WRITE_DAYS_AFTER_END + 1) * 86_400_000).toISOString().slice(0, 10)
  return irishInstant(day, '00:00')
}

/**
 * May this phone change anything in this event? The organiser holding the
 * PIN always may. A spectator never. Anybody else — the field, and on an
 * event with no PIN that is everybody — may until the field goes read-only.
 */
export function mayWrite(m: Membership | null, event: EventFacts, now: Date): boolean {
  if (organiserByPin(m, now)) return true
  const role = roleOf(m, event, now)
  if (!isMember(role)) return false
  if (event.openEnded) return true
  const cap = fieldReadOnlyFrom(event.endDate)
  return !cap || now.getTime() < cap.getTime()
}

/**
 * May this phone change the event itself — the trips row, and deleting a
 * player, a round, a team or a notice (stage 4, D65/D66)? The organiser
 * holding the PIN; on an event with no PIN, any member who may write. The
 * database's `organiser_trips()` (migration 071) says the same in SQL.
 */
export function mayChangeEvent(m: Membership | null, event: EventFacts, now: Date): boolean {
  if (organiserByPin(m, now)) return true
  return !event.adminPinSet && mayWrite(m, event, now)
}

/**
 * Whether an event's field may still add rounds to it: an ad hoc series
 * (a league, `schedule: 'series'`, no `repeat`) with `add_rounds` on. Read
 * off the raw columns exactly as migration 071's `writable_trips()` reads
 * them, so the two can never disagree about a half-readable setup.
 */
export function fieldOpenEnded(trip: { kind: unknown; bracketSetup: unknown; eventPermissions: unknown }): boolean {
  if (trip.kind !== 'tournament') return false
  const b = trip.bracketSetup
  const p = trip.eventPermissions
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  const setup = b as Record<string, unknown>
  return setup.format === 'league' && setup.schedule === 'series'
    && (setup.repeat === undefined || setup.repeat === null)
    && (p as Record<string, unknown>).add_rounds === true
}

/**
 * The padlock tapped shut (D61): the phone's PIN grant ends now, and it is
 * what it was in the field again. Nothing else on the row changes.
 */
export function closeOrganiser(m: Membership): Membership {
  return { ...m, organiserUntil: null }
}

// ─── The retry limit on a PIN ──────────────────────────────────
//
// Two windows, both counted on the server (`entry_attempts`): per network
// address for one event, which stops one phone hammering a code, and per
// event across every address, which stops a spread-out guess at a four-digit
// PIN. A wrong PIN counts; a right one does not reset the count — the window
// running out does.

export type AttemptKind = 'admin' | 'public'

export interface AttemptLimit { max: number; windowMs: number }

export const ATTEMPT_LIMITS = {
  /** One address, one event, one kind of PIN. */
  address: { max: 10, windowMs: 15 * 60 * 1000 },
  /** Everybody, one event, one kind of PIN. */
  event: { max: 100, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, AttemptLimit>

/**
 * The nightly cleanup deletes a count once its window started more than this
 * long ago (`/api/cleanup`, step 4). It runs once a night, so a count can be
 * nearly twice this old before it goes: the privacy notice says two days.
 */
export const ATTEMPT_KEEP_HOURS = 24

/** One window as stored. */
export interface AttemptWindow { failures: number; windowStarted: string }

function current(w: AttemptWindow | null, limit: AttemptLimit, now: Date): AttemptWindow | null {
  if (!w) return null
  const started = Date.parse(w.windowStarted)
  if (!Number.isFinite(started) || now.getTime() - started >= limit.windowMs) return null
  return w
}

/** Whether this window refuses another try now. */
export function attemptBlocked(w: AttemptWindow | null, limit: AttemptLimit, now: Date): boolean {
  const live = current(w, limit, now)
  return !!live && live.failures >= limit.max
}

/** The window after one more wrong PIN: counted in the running window, or a new one started. */
export function afterFailure(w: AttemptWindow | null, limit: AttemptLimit, now: Date): AttemptWindow {
  const live = current(w, limit, now)
  return live
    ? { failures: live.failures + 1, windowStarted: live.windowStarted }
    : { failures: 1, windowStarted: now.toISOString() }
}

// ─── Remembering an entry on the phone ─────────────────────────

/**
 * What a phone remembers once an entry has landed: who it was signed in as
 * and which player it claimed. `EnsureMember` enters again only when either
 * changes — a new anonymous identity (storage cleared, the home-screen app's
 * own jar) or a name claimed since.
 */
export function entryStamp(userId: string, playerId: string | null): string {
  return `${userId}|${playerId ?? ''}`
}

export function needsEntry(stamp: string | null | undefined, userId: string, playerId: string | null): boolean {
  return stamp !== entryStamp(userId, playerId)
}

// ─── Forgetting anonymous phones ───────────────────────────────
//
// Supabase never expires an anonymous user by itself. The rule (Ross,
// 10 Nov 2026) is SQL, in one place — migration 069's
// `anonymous_phones_to_forget()`: no event and made more than 7 days ago, or
// unseen for 90 days with every one of its events ended more than 30 days
// ago. The nightly cleanup (/api/cleanup) always counts it; it deletes only
// while this is on — switched on once the dry-run count in
// scripts/rls-check.sql has been looked at.

export const FORGET_ANONYMOUS_PHONES = false

/**
 * The rule's three numbers, as migration 069 writes them in SQL — here so
 * the privacy notice imports them rather than typing them, and
 * `test:membership` fails if the two copies part.
 */
export const FORGET_RULE = {
  /** Made this long ago and entered no event. */
  noEventDays: 7,
  /** Unseen this long… */
  unseenDays: 90,
  /** …and every event it entered ended more than this long ago. */
  afterEventDays: 30,
} as const

/** At most this many phones forgotten a night, so a backlog drains rather than lands at once. */
export const FORGET_PER_NIGHT = 5000

