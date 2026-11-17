// A club competition (D161–D184; Ross, 16 Nov 2026) — the one copy of what
// one is made of. A verified club's standalone, single-round stroke play
// competition — Stableford or strokes, singles — made from a short form in
// the club area (D162): no PIN, no entered field, no collaboration
// question, no tags. Pure: the form's checks, and the event row, tee sheet
// and board it becomes. `app/api/club/competition.ts` writes them.

import type { Leaderboard } from './leaderboards'
import { defaultPermissions, type EventPermissions } from './eventPermissions'
import { irishInstant } from './irishTime'
import { MAX_BATCHES, batchGroupSize, opensAt, parseTeeRules, rulesIssue, slotGroupSize, teeClocks, type TeeRules } from './teeSheet'
import { readEntryRules, type EntryRules } from './clubMembership'

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
  /**
   * The tee times: up to four runs (Ross, 17 Nov 2026 — threes at ten
   * minutes until one, then fours at fifteen), each its own players a time.
   */
  batches: CompBatch[]
  /** Booking opens this many days before, at this time — null: as soon as it is made. */
  opens: { daysBefore: number; time: string } | null
  /** Stage (m): who may enter — genders, memberships, an age band (lib/clubMembership.ts); null is everybody. */
  entry?: EntryRules | null
}

/** One run of tee times on a competition's sheet. */
export interface CompBatch {
  /** The first tee time, "HH:MM". */
  start: string
  /** Minutes between tee times. */
  interval: number
  /** Players per tee time. */
  perTime: number
  /** How many tee times. */
  times: number
}

export const COMP_NAME_MAX = 60
export const COMP_INTERVALS = [7, 8, 9, 10, 11, 12, 15] as const
/** The most tee times in one batch. */
export const COMP_MAX_TIMES = 100
/** A new batch after the last: an hour after its last tee time, at its interval and size. */
export function nextBatch(after: CompBatch): CompBatch {
  const [h, m] = after.start.split(':').map(Number)
  const last = (h || 0) * 60 + (m || 0) + Math.max(0, after.times - 1) * after.interval + 60
  const at = Math.min(last, 23 * 60)
  return { start: `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, interval: after.interval, perTime: after.perTime, times: 6 }
}

/** A form's answers as they arrive — anything, checked here. */
export function readCompForm(raw: unknown): CompForm | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
  const opens = r.opens && typeof r.opens === 'object'
    ? { daysBefore: num((r.opens as Record<string, unknown>).daysBefore), time: String((r.opens as Record<string, unknown>).time ?? '') }
    : null
  const batch = (b: Record<string, unknown>): CompBatch => ({
    start: typeof b.start === 'string' ? b.start : typeof b.first === 'string' ? b.first : '',
    interval: num(b.interval), perTime: num(b.perTime), times: num(b.times),
  })
  // A form from before batches (one run: first, interval, perTime, times) reads as one batch.
  const batches = Array.isArray(r.batches)
    ? r.batches.filter((b): b is Record<string, unknown> => !!b && typeof b === 'object').map(batch)
    : [batch(r)]
  return {
    name: typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : '',
    date: typeof r.date === 'string' ? r.date : '',
    courseId: typeof r.courseId === 'string' ? r.courseId : '',
    scoring: r.scoring === 'strokes' ? 'strokes' : 'stableford',
    allowance: num(r.allowance),
    watch: r.watch === 'guests' ? 'guests' : 'members',
    batches,
    opens,
    entry: readEntryRules(r.entry),
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
  if (!f.batches.length) return 'Add the first tee time.'
  if (f.batches.length > MAX_BATCHES) return `At most ${MAX_BATCHES} runs of tee times.`
  for (const [i, b] of f.batches.entries()) {
    const which = f.batches.length > 1 ? `Run ${i + 1}: ` : ''
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)) return `${which}pick the first tee time.`
    if (!Number.isInteger(b.perTime) || b.perTime < 2 || b.perTime > 4) return `${which}two, three or four players a tee time.`
    if (!Number.isInteger(b.times) || b.times < 1 || b.times > COMP_MAX_TIMES) return `${which}between 1 and ${COMP_MAX_TIMES} tee times.`
    if (!Number.isInteger(b.interval) || b.interval < 5 || b.interval > 20) return `${which}between 5 and 20 minutes between tee times.`
  }
  if (f.opens && (!Number.isInteger(f.opens.daysBefore) || f.opens.daysBefore < 0 || f.opens.daysBefore > 30)) {
    return 'Booking opens up to 30 days before.'
  }
  return rulesIssue(compTeeRules(f))
}

/**
 * The competition's tee sheet (rounds.tee_sheet): its runs of times, opening
 * when asked. The sheet's players a time is the first run's; a run with
 * another number says its own — so a one-size sheet is stored exactly as
 * before batches had sizes.
 */
export function compTeeRules(f: Pick<CompForm, 'batches' | 'opens'>): TeeRules {
  const size = f.batches[0]?.perTime ?? 4
  return {
    batches: f.batches.map(b => ({
      start: b.start, interval: b.interval, count: b.times, ends: 'count' as const,
      ...(b.perTime !== size ? { groupSize: b.perTime } : {}),
    })),
    groupSize: size,
    ...(f.opens ? { opens: { daysBefore: f.opens.daysBefore, time: f.opens.time } } : {}),
  }
}

/** A sheet's runs as the form holds them. */
export function compBatchesOf(rules: TeeRules): CompBatch[] {
  return rules.batches.map(b => ({ start: b.start, interval: b.interval, perTime: batchGroupSize(rules, b), times: b.count }))
}

/** The first tee time of a form, "HH:MM" — what the golf item carries. */
export function compFirstTee(f: Pick<CompForm, 'batches'>): string {
  return f.batches[0]?.start ?? ''
}

/**
 * A competition as it was made, read back into its form (stage (k2), D214):
 * what Copy to another date and Repeat weekly start from, a new date given.
 * Any sheet copies (Ross, 17 Nov 2026 — it used to be one run of times
 * only); null only when the stored sheet does not read at all.
 */
export function compFormFrom(s: {
  name: string
  date: string
  courseId: string
  board: { scoring?: unknown; handicapAllowance?: unknown } | null
  teeSheet: unknown
  membersOnly: boolean
  /** Stage (m): its entry rules as stored (trip_private.entry_rules). */
  entry?: unknown
}): CompForm | null {
  const rules = parseTeeRules(s.teeSheet)
  if (!rules || !rules.batches.length) return null
  const opens = rules.opens && 'daysBefore' in rules.opens && typeof rules.opens.daysBefore === 'number'
    ? { daysBefore: rules.opens.daysBefore, time: rules.opens.time } : null
  return {
    name: s.name,
    date: s.date,
    courseId: s.courseId,
    scoring: s.board?.scoring === 'strokes' ? 'strokes' : 'stableford',
    allowance: typeof s.board?.handicapAllowance === 'number' ? s.board.handicapAllowance : 100,
    watch: s.membersOnly ? 'members' : 'guests',
    batches: compBatchesOf(rules),
    opens,
    entry: readEntryRules(s.entry),
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
  const left = slotGroupSize(o.rules, o.slot) - o.taken
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
