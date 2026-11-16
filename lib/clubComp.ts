// A club competition (D161–D184; Ross, 16 Nov 2026) — the one copy of what
// one is made of. A verified club's standalone, single-round stroke play
// competition — Stableford or strokes, singles — made from a short form in
// the club area (D162): no PIN, no entered field, no collaboration
// question, no tags. Pure: the form's checks, and the event row, tee sheet
// and board it becomes. `app/api/club/competition.ts` writes them.

import type { Leaderboard } from './leaderboards'
import { defaultPermissions, type EventPermissions } from './eventPermissions'
import { irishInstant } from './irishTime'
import { opensAt, rulesIssue, teeClocks, type TeeRules } from './teeSheet'

export type CompScoring = 'stableford' | 'strokes'
/** D184: members only by default; guests may watch, read-only, with the code. */
export type CompWatch = 'members' | 'guests'

export interface CompForm {
  name: string
  /** The day, YYYY-MM-DD (Irish). */
  date: string
  courseId: string
  scoring: CompScoring
  /** The handicap allowance, percent. */
  allowance: number
  watch: CompWatch
  /** The first tee time, "HH:MM". */
  first: string
  /** Minutes between tee times. */
  interval: number
  /** Players per tee time. */
  perTime: number
  /** How many tee times. */
  times: number
  /** Booking opens this many days before, at this time — null: as soon as it is made. */
  opens: { daysBefore: number; time: string } | null
}

export const COMP_NAME_MAX = 60
export const COMP_INTERVALS = [7, 8, 9, 10, 11, 12, 15] as const
export const COMP_MAX_TIMES = 40

/** A form's answers as they arrive — anything, checked here. */
export function readCompForm(raw: unknown): CompForm | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
  const opens = r.opens && typeof r.opens === 'object'
    ? { daysBefore: num((r.opens as Record<string, unknown>).daysBefore), time: String((r.opens as Record<string, unknown>).time ?? '') }
    : null
  return {
    name: typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : '',
    date: typeof r.date === 'string' ? r.date : '',
    courseId: typeof r.courseId === 'string' ? r.courseId : '',
    scoring: r.scoring === 'strokes' ? 'strokes' : 'stableford',
    allowance: num(r.allowance),
    watch: r.watch === 'guests' ? 'guests' : 'members',
    first: typeof r.first === 'string' ? r.first : '',
    interval: num(r.interval),
    perTime: num(r.perTime),
    times: num(r.times),
    opens,
  }
}

/** Why the form cannot be saved, in a sentence — or null. `today` is the Irish date. */
export function compFormIssue(f: CompForm, today: string): string | null {
  if (!f.name) return 'Name the competition.'
  if (f.name.length > COMP_NAME_MAX) return `Keep the name under ${COMP_NAME_MAX} characters.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return 'Pick the day.'
  if (f.date < today) return 'Pick a day from today on.'
  if (!f.courseId) return 'Choose the course.'
  if (!Number.isInteger(f.allowance) || f.allowance < 50 || f.allowance > 100) return 'The handicap allowance runs from 50% to 100%.'
  if (!Number.isInteger(f.perTime) || f.perTime < 2 || f.perTime > 4) return 'Two, three or four players a tee time.'
  if (!Number.isInteger(f.times) || f.times < 1 || f.times > COMP_MAX_TIMES) return `Between 1 and ${COMP_MAX_TIMES} tee times.`
  if (!Number.isInteger(f.interval) || f.interval < 5 || f.interval > 20) return 'Between 5 and 20 minutes between tee times.'
  if (f.opens && (!Number.isInteger(f.opens.daysBefore) || f.opens.daysBefore < 0 || f.opens.daysBefore > 30)) {
    return 'Booking opens up to 30 days before.'
  }
  return rulesIssue(compTeeRules(f))
}

/** The competition's tee sheet (rounds.tee_sheet): one run of times, opening when asked. */
export function compTeeRules(f: CompForm): TeeRules {
  return {
    batches: [{ start: f.first, interval: f.interval, count: f.times, ends: 'count' }],
    groupSize: f.perTime,
    ...(f.opens ? { opens: { daysBefore: f.opens.daysBefore, time: f.opens.time } } : {}),
  }
}

/**
 * The competition's one board (D182): individual, its scoring, its
 * allowance, its one round — ties broken on the cards (back 9, 6, 3, 2),
 * then shared.
 */
export function compBoard(roundId: string, f: Pick<CompForm, 'scoring' | 'allowance'>): Leaderboard {
  return {
    id: 'lb-primary',
    audience: 'individual',
    competition: 'league',
    scoring: f.scoring,
    combine: 'total',
    roundIds: [roundId],
    tieBreak: 'countback',
    clubCompetition: true,
    ...(f.allowance !== 100 ? { handicapAllowance: f.allowance } : {}),
  }
}

/**
 * What the field may do (D166/D179, D173): the handicap is the account's,
 * never the event's to change; players book their own times — through the
 * server, the club's list being the field; nothing else.
 */
export function compPermissions(): EventPermissions {
  return { ...defaultPermissions(), edit_handicaps: false, edit_tee_sheet: true, set_tee_sheets: false, add_players: false, edit_scores: false }
}

// ─── Booking (D173) ────────────────────────────────────────────

/** The instant a tee time starts, Irish time, or null. */
export function teeInstant(date: string, clock: string): number | null {
  return irishInstant(date, clock)?.getTime() ?? null
}

/**
 * Why a booking cannot be made now, or null. The field books from the
 * sheet's opening until the time itself; the club's owners and admins may
 * place people before it opens (a tee sheet's organiser may, too), never
 * after the time has gone.
 */
export function bookingIssue(o: {
  rules: Pick<TeeRules, 'opens' | 'batches' | 'groupSize'>
  date: string
  slot: number
  /** How many are on that time already. */
  taken: number
  /** How many this booking puts on it. */
  adding: number
  admin: boolean
  now: number
}): string | null {
  const clocks = teeClocks(o.rules)
  if (!Number.isInteger(o.slot) || o.slot < 0 || o.slot >= clocks.length) return 'That tee time is not on the sheet.'
  const at = teeInstant(o.date, clocks[o.slot])
  if (at !== null && o.now >= at) return 'That tee time has gone.'
  const opens = opensAt(o.rules, o.date)?.getTime() ?? null
  if (!o.admin && opens !== null && o.now < opens) return 'Booking is not open yet.'
  if (o.adding < 1) return 'Choose who to book.'
  const left = o.rules.groupSize - o.taken
  if (o.adding > left) return left <= 0 ? 'That tee time is full.' : `That tee time has ${left === 1 ? 'one place' : `${left} places`} left.`
  return null
}

/**
 * Whether this booking may be withdrawn (D173): your own, or one you made,
 * or anybody's by the club's owners and admins — until the time has gone.
 */
export function withdrawIssue(o: {
  date: string
  clock: string | null
  mine: boolean
  bookedByMe: boolean
  admin: boolean
  now: number
}): string | null {
  if (!o.admin && !o.mine && !o.bookedByMe) return 'Only the player, whoever booked them, or the club’s admins take a booking off.'
  const at = o.clock ? teeInstant(o.date, o.clock) : null
  if (at !== null && o.now >= at) return 'That tee time has gone.'
  return null
}
