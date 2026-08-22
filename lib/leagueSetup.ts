// A league event's rules — the only copy.
//
// The second tournament format, and a different animal from the knockout:
// a league is created whole through its own door — Create an Event → Golf
// Tournament → League — rather than set up afterwards in the organiser
// area, because a league has nothing to wait for: no field to close, no
// draw to make. The day it is created it has its venues, its dates, its
// board and its live scoring.
//
// What is stored here is the small set of answers the rounds cannot carry
// for themselves: how players get in, whether a joiner waits for the
// organiser's nod, and how a multi-day event's days relate on the
// leaderboard. Deliberately *not* stored: whether the event is single or
// multi day, how many days, or where — the rounds and the trip's dates are
// already the one copy of all of that, and a second would drift.
//
// It shares `trips.bracket_setup` (migration 047) with the knockout,
// discriminated on `format` — the shape that column's comment promised
// would survive league's arrival. `parseBracketSetup` refuses a league
// object and `parseLeagueSetup` refuses a match-play one, so neither form
// can ever misread — or overwrite — the other's setup.
//
// Pure. No I/O.

import { type PlayerEntry, PLAYER_ENTRIES } from './bracketSetup'
import type { Leaderboard } from './leaderboards'
import { MAX_ROUNDS } from './tripLimits'

// ─── How a multi-day event's days relate ───────────────────────
//
// Asked of a multi-day league only — one day has one board and no question.
// The choice is presentation the leaderboard screen grows into as league
// scoring fills out; every league starts on the same board either way (see
// `starterBoards`), so the answer is stored faithfully now and read more
// fully later — the same posture as `tee_sheet` and strict mode.

export type DayBoards = 'separate' | 'cumulative' | 'hybrid'

export const DAY_BOARDS: { key: DayBoards; label: string; hint: string }[] = [
  { key: 'separate', label: 'Separate days', hint:
    'Each day is its own competition — its own leaderboard, no connection between them.' },
  { key: 'cumulative', label: 'One running total', hint:
    'Every day\'s results feed a single leaderboard for the whole event.' },
  { key: 'hybrid', label: 'Days and overall', hint:
    'Each day keeps its own leaderboard, and the days also roll up into one overall board.' },
]

// ─── The setup itself ──────────────────────────────────────────

// ─── The shape of the event in time ────────────────────────────
//
// Three ways a league sits on the calendar. **Standalone** happens at a
// single point — one day, or a consecutive run of days. **Continuous** is
// an ongoing event occupying a period, like a summer: a start and finish
// date, with the playing days picked inside it — by hand, or every week on
// the same day ("every Wednesday for the summer"). **Series** is a list of
// events with no dates at all: the days don't have to be in a row, and more
// can be added as time goes on — continuous without the time period.
//
// The dates themselves still live on the trip and the rounds (the one copy
// rule): standalone and continuous carry trip start/end dates and dated
// rounds, a series carries neither. What is stored here is only the shape,
// because "no dates" alone cannot say whether dates were declined or the
// event is a series.

export type LeagueSchedule = 'standalone' | 'continuous' | 'series'

export const LEAGUE_SCHEDULES: { key: LeagueSchedule; label: string; hint: string }[] = [
  { key: 'standalone', label: 'Standalone', hint:
    'A single point in time — one day, or a run of days.' },
  { key: 'continuous', label: 'Continuous', hint:
    'An ongoing event over a period, like a summer — pick the playing days inside it.' },
  { key: 'series', label: 'Series', hint:
    'A list of events with no dates — days need not be in a row, and more can be added as you go.' },
]

export type LeagueSetup = {
  format: 'league'
  /**
   * How the event sits in time. Absent reads as standalone — what every
   * league stored before the question existed was.
   */
  schedule?: LeagueSchedule
  /**
   * Continuous only — the event repeats weekly on this day (0 = Sunday …
   * 6 = Saturday, JS/UTC convention). Present only when the repeat was
   * chosen; the generated dates live on the rounds, this is the intent the
   * hub can say back ("Every Wednesday").
   */
  repeatWeekday?: number
  /** How the field is assembled — the same two answers the knockout offers. */
  entry: PlayerEntry
  /**
   * `entry: 'self_join'` only — a joined player waits for the organiser's
   * approval before they are confirmed. Stored now and said on screen; the
   * join-flow gate itself is built on top of this answer. Kept off the
   * object when off, and off entirely when the organiser adds the field.
   */
  requireApproval?: boolean
  /**
   * Multi-day only — how the days relate on the leaderboard. Kept off a
   * single-day event, which has one board and was never asked.
   */
  dayBoards?: DayBoards
}

// ─── Days ──────────────────────────────────────────────────────

/**
 * The most playing days a continuous or series league can carry. A summer
 * of Wednesdays is about fourteen; half a year weekly is twenty-six. The
 * standalone ceiling stays the platform's round ceiling — a standalone
 * event is a trip-shaped thing, and six rounds is already a big week.
 */
export const MAX_LEAGUE_DAYS = 30

/**
 * Why a league cannot run this many days, or null when it can. One round a
 * day is what a league day is; the standalone ceiling is the platform's
 * round ceiling — the same number, not a second copy of it.
 */
export function leagueDaysIssue(days: number, schedule: LeagueSchedule = 'standalone'): string | null {
  if (!Number.isInteger(days) || days < 1) {
    return 'An event needs at least one day.'
  }
  const cap = schedule === 'standalone' ? MAX_ROUNDS : MAX_LEAGUE_DAYS
  if (days > cap) {
    return `An event can run at most ${cap} days — bring it in to continue.`
  }
  return null
}

/**
 * Every date in the period falling on the given weekday (0 = Sunday …
 * 6 = Saturday), in order — "every Wednesday for the summer" as a list the
 * rounds are then made from. Empty when the period is malformed or holds no
 * such day. Capped well past MAX_LEAGUE_DAYS so a typo'd year cannot spin;
 * the day-count gate is what actually refuses an over-long league.
 */
export function weeklyDates(startDate: string, endDate: string, weekday: number): string[] {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return []

  const DAY = 86_400_000
  const first = start + ((weekday - new Date(start).getUTCDay() + 7) % 7) * DAY
  const out: string[] = []
  for (let t = first; t <= end && out.length <= MAX_LEAGUE_DAYS * 2; t += 7 * DAY) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

// ─── The board a league starts on ──────────────────────────────

/**
 * Every league event begins with the same board: individual Stableford,
 * every day added up — one leaderboard and live scoring from the first
 * tee, which is the whole promise of the single-day event and the spine of
 * the multi-day one. Scoring formats within league play are still to come;
 * when they arrive they are asked here, and this stays the only copy of
 * what a league plays until somebody answers.
 */
export function starterBoards(): Leaderboard[] {
  return [{
    id: 'lb-league-stableford',
    audience: 'individual',
    competition: 'league',
    scoring: 'stableford',
    combine: 'total',
  }]
}

// ─── Storage ───────────────────────────────────────────────────

/**
 * Read whatever `trips.bracket_setup` holds, as a league. A complete league
 * setup comes back whole; anything else — null, a match-play setup, an
 * unknown entry — comes back null. Same posture as every parser on the
 * platform: dropped, never repaired.
 */
export function parseLeagueSetup(raw: unknown): LeagueSetup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  if (r.format !== 'league') return null
  const entry = PLAYER_ENTRIES.find(e => e.key === r.entry)?.key
  if (!entry) return null

  // Standalone is the absent default, so it is kept off the object — every
  // league stored before the question existed reads back byte-for-byte.
  const schedule = r.schedule === 'continuous' || r.schedule === 'series'
    ? r.schedule : null
  const weekday = Number(r.repeatWeekday)

  return {
    format: 'league',
    ...(schedule ? { schedule } : {}),
    // The repeat is continuous's alone — a series has no period to repeat
    // inside, and a standalone run is already every day.
    ...(schedule === 'continuous' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? { repeatWeekday: weekday } : {}),
    entry,
    // Approval only means anything on a self-join event, and only true is
    // worth a key — the same keep-the-no-op-off rule as everywhere else.
    ...(entry === 'self_join' && r.requireApproval === true
      ? { requireApproval: true } : {}),
    ...(DAY_BOARDS.some(d => d.key === r.dayBoards)
      ? { dayBoards: r.dayBoards as DayBoards } : {}),
  }
}

// ─── Naming ────────────────────────────────────────────────────

/**
 * The organiser card's one line — "League · 3 days · players join
 * themselves (approval on) · days and overall". Days come from the caller's
 * rounds, because the rounds are the one copy of how many there are.
 */
/** Sunday-first, the same 0–6 the repeat stores. */
export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

export function describeLeagueSetup(setup: LeagueSetup, days: number): string {
  const parts = ['League']
  // The shape is worth a word when it is not the plain one — and a weekly
  // repeat is the better word for a continuous league that has one.
  if (setup.schedule === 'continuous') {
    parts.push(setup.repeatWeekday != null
      ? `every ${WEEKDAY_NAMES[setup.repeatWeekday]}`
      : 'continuous')
  } else if (setup.schedule === 'series') {
    parts.push('series')
  }
  parts.push(days === 1 ? 'one day' : `${days} days`)
  // Said in the card's own words rather than the form buttons' — "I add the
  // field" is a thing an organiser taps, not a fact a summary states.
  const entry = setup.entry === 'organiser'
    ? 'organiser-entered field'
    : 'players join themselves'
  parts.push(setup.requireApproval ? `${entry} (approval on)` : entry)
  if (setup.dayBoards) {
    parts.push(DAY_BOARDS.find(d => d.key === setup.dayBoards)!.label.toLowerCase())
  }
  return parts.join(' · ')
}
