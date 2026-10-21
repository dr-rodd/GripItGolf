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
import { WEEKDAY_NAMES } from './weekdays'
import { dateForDay, describeDay } from './itinerary'
import {
  type GolfIrelandRules, type ScoreSource, SCORE_SOURCES,
  parseGolfIrelandRules, readsGolfIreland,
} from './golfIreland'

// ─── How a multi-day event's days relate ───────────────────────
//
// Asked of a multi-day league only — one day has one board and no question.
//
// It was stored and not read for a while: the answer was recorded
// faithfully while the leaderboard screen had no way to show a day on its
// own. `Leaderboard.roundIds` is that way — a board scoped to one round is
// that day's competition — so the answer is now read, by `boardGrouping`
// below, which is the only copy of what each of the three means on screen.

export type DayBoards = 'separate' | 'cumulative' | 'hybrid'

export const DAY_BOARDS: { key: DayBoards; label: string; hint: string }[] = [
  { key: 'separate', label: 'Separate days', hint:
    'Each day has its own leaderboard, with no overall.' },
  { key: 'cumulative', label: 'One running total', hint:
    'Every day\'s results feed a single leaderboard for the whole event.' },
  { key: 'hybrid', label: 'Days and overall', hint:
    'Each day has its own leaderboard, plus one overall.' },
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
    'Rounds on separate days feeding one overall league — planned ahead, or ad hoc.' },
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
  /**
   * Series only — the rounds recur, so many weeks or months apart, and
   * were all made at creation. Absent on a series is "ad hoc": each round
   * is added on the Scoring tab when it is played.
   */
  repeat?: SeriesRepeat
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
  /**
   * Where the cards come from — lib/golfIreland.ts holds the answers.
   * Absent is scored live here, which every league stored before the
   * question existed was; only the other two are ever stored.
   */
  scoreSource?: Exclude<ScoreSource, 'live'>
  /**
   * Which Golf Ireland cards count. Present exactly when `scoreSource`
   * reads Golf Ireland — the two are written together and read together.
   */
  golfIreland?: GolfIrelandRules
  /**
   * Cards that do not count — one player's card in one round, keyed
   * `${roundId}:${playerId}` (`cardKey`), switched off from the round's gear
   * on the Scoring tab. A toggle, never permanent: the scores stay, and
   * taking the key out counts them again. The case it was asked for is a
   * Golf Ireland card swept in from a different competition on the same
   * course; any card of the round can be switched off the same way.
   * Absent, or empty, is every card counting.
   */
  cardsOff?: string[]
}

/** The key a card is switched off by — the one shape `RowContext` keys a player's round by. */
export const cardKey = (roundId: string, playerId: string) => `${roundId}:${playerId}`

/** The most cards a league keeps switched off — far past any real league. */
export const MAX_CARDS_OFF = 2000

/**
 * The switched-off cards a stored setup holds, tidied: well-formed keys,
 * each once, in order. Never throws and never refuses the league over them.
 */
export function tidyCardsOff(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const keys = raw.filter((k): k is string =>
    typeof k === 'string' && /^[^:\s]+:[^:\s]+$/.test(k))
  return [...new Set(keys)].sort().slice(0, MAX_CARDS_OFF)
}

/** The list with one card switched off (or back on) — tidy, whatever it was handed. */
export function cardsOffWith(list: readonly string[], key: string, off: boolean): string[] {
  const rest = tidyCardsOff(list).filter(k => k !== key)
  return off ? tidyCardsOff([...rest, key]) : rest
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
 * Why a league cannot play this many days, or null when it can.
 *
 * `days` is the PLAYING days — the days that carry a round — never the
 * span the event sits across: a standalone run may hold a rest day, and a
 * continuous league is nothing but a period with a few days picked inside
 * it. The standalone ceiling is the platform's round ceiling, the same
 * number and not a second copy of it.
 */
export function leagueDaysIssue(days: number, schedule: LeagueSchedule = 'standalone'): string | null {
  if (!Number.isInteger(days) || days < 1) {
    return 'An event needs at least one playing day.'
  }
  const cap = schedule === 'standalone' ? MAX_ROUNDS : MAX_LEAGUE_DAYS
  if (days > cap) {
    return schedule === 'standalone'
      ? `An event can play at most ${cap} rounds — turn a day off to continue.`
      : `An event can run at most ${cap} days — bring it in to continue.`
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

// ─── A series in time ──────────────────────────────────────────
//
// A series is a **league** of distinct **rounds**, each with its own result,
// feeding one overall leaderboard (docs/event-use-cases.md, decided October
// 2026 — "rounds within the league" is Ross's wording, and the screens say
// it). Each round carries a date — its golf item's day, at its calendar
// offset from the first round, which is the trip's start date — and the
// rounds arrive one of two ways:
//
// · **Ad hoc** — somebody adds the next round on the Scoring tab when the
//   group turns up to play. Nothing is stored for it: no `repeat` is the
//   answer.
// · **Recurring** — so many rounds, every so many weeks or months, all made
//   at creation. The repeat is stored (`LeagueSetup.repeat`) so the league
//   can say it back; how many there are is the rounds' to say, the one-copy
//   rule again.
//
// **A round's venue may be TBC.** Then it is a dated golf item with no
// course and **no `rounds` row**: `rounds.course_id` is NOT NULL, and a
// round nobody can score is better not existing than existing with a
// course it is not at. Choosing the venue makes the round. So a TBC round
// cannot go live by construction — there is nothing to open a card on —
// and every screen that reads rounds is untouched by the idea. Its number
// is held for it by its place in date order (`leagueRounds`).
//
// A series made before it carried dates is a numbered list with neither
// trip dates nor a repeat, and still reads as one.

export type RepeatUnit = 'week' | 'month'

export type SeriesRepeat = {
  /** Every this many units — 1 is every week, or every month. */
  every: number
  unit: RepeatUnit
}

/** The longest gap a repeat is offered — a quarterly event is every 3 months. */
export const MAX_REPEAT_EVERY = 12

export const REPEAT_UNITS: { key: RepeatUnit; label: string }[] = [
  { key: 'week', label: 'Weeks' },
  { key: 'month', label: 'Months' },
]

const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'] as const

/** A repeat that can be stored, or null. */
export function tidyRepeat(raw: unknown): SeriesRepeat | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const every = Number(r.every)
  const unit = REPEAT_UNITS.find(u => u.key === r.unit)?.key
  if (!unit || !Number.isInteger(every) || every < 1 || every > MAX_REPEAT_EVERY) return null
  return { every, unit }
}

/**
 * Which of its weekday a date is in its month — 1 to 4, or 5 for the last.
 * A fifth Wednesday is not in every month, so a series begun on one carries
 * on as "the last Wednesday", which every month has.
 */
function weekOfMonth(day: number): number {
  return Math.min(5, Math.ceil(day / 7))
}

/**
 * The dates of a recurring series, first event first. Weekly is the first
 * date plus a whole number of weeks. **Monthly keeps the weekday**, the way
 * a club says it — "the second Wednesday of the month" — not the date: the
 * 14th falls on a different day every month, and a golf society meets on a
 * day of the week.
 *
 * Empty when the first date or the repeat is malformed. Capped well past
 * MAX_LEAGUE_DAYS so a typo cannot spin; `leagueDaysIssue` is what refuses
 * an over-long series.
 */
export function seriesDates(first: string, repeat: SeriesRepeat, count: number): string[] {
  const start = Date.parse(`${first}T00:00:00Z`)
  if (!Number.isFinite(start) || !tidyRepeat(repeat)) return []
  if (!Number.isInteger(count) || count < 1) return []

  const DAY = 86_400_000
  const n = Math.min(count, MAX_LEAGUE_DAYS * 2)
  const out: string[] = []

  if (repeat.unit === 'week') {
    for (let k = 0; k < n; k++) {
      out.push(new Date(start + k * repeat.every * 7 * DAY).toISOString().slice(0, 10))
    }
    return out
  }

  const d0 = new Date(start)
  const weekday = d0.getUTCDay()
  const nth = weekOfMonth(d0.getUTCDate())
  for (let k = 0; k < n; k++) {
    const y = d0.getUTCFullYear()
    const m = d0.getUTCMonth() + k * repeat.every
    const firstOfMonth = new Date(Date.UTC(y, m, 1))
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    let day = 1 + ((weekday - firstOfMonth.getUTCDay() + 7) % 7) + (nth - 1) * 7
    while (day > daysInMonth) day -= 7
    out.push(new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10))
  }
  return out
}

/**
 * The repeat in words — "every Wednesday", "every 2 weeks on a Wednesday",
 * "every month on the second Wednesday". Lower case, because it is read
 * inside a sentence or a summary line. Without a first date there is no
 * weekday to name, and the gap alone is said.
 */
export function describeRepeat(repeat: SeriesRepeat, first?: string | null): string {
  const t = first ? Date.parse(`${first}T00:00:00Z`) : NaN
  const date = Number.isFinite(t) ? new Date(t) : null
  const day = date ? WEEKDAY_NAMES[date.getUTCDay()] : null

  if (repeat.unit === 'week') {
    if (repeat.every === 1) return day ? `every ${day}` : 'every week'
    return `every ${repeat.every} weeks${day ? ` on a ${day}` : ''}`
  }
  const gap = repeat.every === 1 ? 'every month' : `every ${repeat.every} months`
  if (!date || !day) return gap
  return `${gap} on the ${ORDINALS[weekOfMonth(date.getUTCDate()) - 1]} ${day}`
}

/**
 * Why this date cannot be a league's next round, or null when it can.
 *
 * **The next round goes after the last one.** Rounds are numbered in date
 * order, and every screen calls a round by its number, so a date slipped in
 * between two others would make Round 6 come before Round 5. A league with
 * no rounds yet takes anything from its first date on.
 */
export function nextRoundIssue(date: string, ctx: {
  /** The first round's date — the trip's start date. */
  startDate: string
  /** Every date the league already has a round on, TBC ones included. */
  roundDates: readonly string[]
}): string | null {
  if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
    return 'Pick a date for the round.'
  }
  if (ctx.roundDates.length >= MAX_LEAGUE_DAYS) {
    return `A league can hold at most ${MAX_LEAGUE_DAYS} rounds.`
  }
  const last = [...ctx.roundDates].sort().at(-1) ?? null
  if (last && date <= last) {
    return `The last round is on ${describeDay(last, 0)} — the next one goes after it.`
  }
  if (date < ctx.startDate) {
    return `The league starts on ${describeDay(ctx.startDate, 0)} — the next round goes on or after it.`
  }
  return null
}

// ─── A league's rounds, venue or not ───────────────────────────

/** One round of a dated league, whether or not its venue is known yet. */
export type LeagueRound = {
  /** The golf item holding the round's date — '' for a round with none. */
  itemId: string
  date: string | null
  /** The stored round number, or the one a TBC round will take. */
  number: number
  /** Null while the venue is TBC: the round is made when one is chosen. */
  roundId: string | null
  courseId: string | null
}

/**
 * Every round of a dated league in date order — the ones with a venue and
 * the ones still to be confirmed — numbered.
 *
 * A round that exists keeps its own number. A TBC round has no number
 * stored anywhere, so it is given the one its place in date order says
 * (the third golf day is Round 3), unless that is somehow taken — a round
 * removed from the running order leaves gaps — in which case it goes past
 * the highest. Deterministic, so the Scoring tab, the hub and the write
 * that finally makes the round all agree on what it is called; the
 * database's UNIQUE (trip, round number) catches two phones racing to it.
 *
 * A round with no golf item (made before the itinerary existed) is kept,
 * at the end, rather than silently dropped.
 */
export function leagueRounds(
  items: readonly { id: string; dayIndex: number; kind: string; courseId?: string | null }[],
  rounds: readonly {
    id: string; roundNumber: number; itineraryItemId: string | null; courseId: string | null
    scheduledDate?: string | null
  }[],
  startDate: string | null,
): LeagueRound[] {
  const golf = items.filter(i => i.kind === 'golf').sort((a, b) => a.dayIndex - b.dayIndex)
  const used = new Set(rounds.map(r => r.roundNumber))
  const out: LeagueRound[] = golf.map((item, index) => {
    const round = rounds.find(r => r.itineraryItemId === item.id) ?? null
    let number = round?.roundNumber ?? index + 1
    if (!round && used.has(number)) number = Math.max(0, ...used) + 1
    used.add(number)
    return {
      itemId: item.id,
      date: dateForDay(startDate, item.dayIndex),
      number,
      roundId: round?.id ?? null,
      courseId: round?.courseId ?? item.courseId ?? null,
    }
  })
  for (const r of rounds) {
    if (golf.some(i => i.id === r.itineraryItemId)) continue
    out.push({
      itemId: '', date: r.scheduledDate ?? null, number: r.roundNumber,
      roundId: r.id, courseId: r.courseId,
    })
  }
  return out
}

/**
 * Which of a league's rounds the field sees today, newest first — the
 * Scoring tab and the hub read the league as its history, with what comes
 * next on top.
 *
 * **The next round appears the day after the previous one** (Ross's story:
 * it builds a bit of anticipation, rather than the whole winter on show
 * from the start). So: every round dated today or earlier, and the first
 * round after today — unless a round is being played today, in which case
 * the next one waits until tomorrow. A league whose first round has not
 * come yet shows that first round. A round with no date is always shown.
 *
 * `hidden` is how many planned rounds are held back, so a screen can say
 * that more are to come without saying when. The organiser area still
 * lists the whole plan. Pure.
 */
export function revealedLeagueRounds<T extends Pick<LeagueRound, 'date' | 'number'>>(
  rounds: readonly T[], today: string,
): { shown: T[]; hidden: number } {
  const playingToday = rounds.some(r => r.date === today)
  const future = rounds
    .filter(r => r.date != null && r.date > today)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.number - b.number))
  const next = playingToday ? null : future[0] ?? null
  const shown = rounds.filter(r => r.date == null || r.date <= today || r === next)
  const newestFirst = [...shown].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1
    return b.number - a.number
  })
  return { shown: newestFirst, hidden: rounds.length - shown.length }
}

/** The number the next round added to this league takes — the same rule. */
export function nextRoundNumber(rounds: readonly Pick<LeagueRound, 'number'>[]): number {
  const used = new Set(rounds.map(r => r.number))
  const candidate = rounds.length + 1
  return used.has(candidate) ? Math.max(...used) + 1 : candidate
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

// ─── How the boards are arranged on screen ─────────────────────

/**
 * Which boards lead, and which belong to a day.
 *
 * The one copy of what `dayBoards` means once there is something to mean:
 * a board carrying `roundIds` is scoped to particular golf, and on a
 * multi-day event that is a day's own competition. Everything else counts
 * the whole event and leads.
 *
 * · `cumulative` — the running total is the event, and a day board, if
 *   somebody made one, still shows. Nothing is hidden: an organiser who
 *   went to the trouble of scoping a board meant it.
 * · `hybrid` — the same, said explicitly: overall first, days after.
 * · `separate` — each day is its own competition, so the overall boards
 *   are set aside. **Set aside, never deleted**: the answer is a way of
 *   reading the event and can be changed back, and a board removed on a
 *   presentation setting would take its prize table with it.
 *
 * Pure, and deliberately says nothing about tabs or order on the page
 * beyond which list a board is in — the screen decides how to draw them.
 */
export function boardGrouping(
  boards: readonly Leaderboard[],
  dayBoards: DayBoards | undefined,
): { overall: Leaderboard[]; byDay: Leaderboard[] } {
  const scoped = boards.filter(b => (b.roundIds?.length ?? 0) > 0)
  const whole = boards.filter(b => (b.roundIds?.length ?? 0) === 0)
  // Nothing scoped means nothing to separate from: an event whose days
  // carry no board of their own has one leaderboard however it answered.
  if (scoped.length === 0) return { overall: whole, byDay: [] }
  if (dayBoards === 'separate') return { overall: [], byDay: scoped }
  return { overall: whole, byDay: scoped }
}

/**
 * What a day board is called on screen: its own title, then the golf it
 * counts. A board counting everything says nothing extra — the title is
 * already the whole truth about it.
 *
 * The course, or the day number when several days share a venue: a
 * two-round trip to one links needs "Day 1" and "Day 2", and a tour needs
 * the names. Both are what somebody would say out loud.
 */
export function describeScope(
  lb: Pick<Leaderboard, 'roundIds'>,
  rounds: readonly { id: string; roundNumber?: number | null; courseName?: string | null }[],
): string | null {
  const ids = lb.roundIds ?? []
  if (ids.length === 0) return null
  const mine = rounds.filter(r => ids.includes(r.id))
  if (mine.length === 0) return null

  const names = [...new Set(mine.map(r => r.courseName).filter(Boolean))] as string[]
  const venuesRepeat = names.length < mine.length
  if (names.length > 0 && !venuesRepeat) return names.join(' & ')

  const days = mine.map(r => r.roundNumber).filter((n): n is number => !!n)
  if (days.length === 0) return names[0] ?? null
  return days.length === 1 ? `Day ${days[0]}` : `Days ${days.join(', ')}`
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
  const repeat = schedule === 'series' ? tidyRepeat(r.repeat) : null

  // A source that reads Golf Ireland is only kept with rules that parse.
  // Without them both keys go, and the league reads as scored live — the
  // whole setup is never refused over them, because a league that parsed
  // as nothing would be offered the knockout form on its organiser page,
  // and a save there would overwrite it.
  const source = SCORE_SOURCES.find(s => s.key === r.scoreSource)?.key
  const giRules = readsGolfIreland(source) ? parseGolfIrelandRules(r.golfIreland) : null

  return {
    format: 'league',
    ...(schedule ? { schedule } : {}),
    // The repeat is continuous's alone — a series has no period to repeat
    // inside, and a standalone run names its playing days outright.
    ...(schedule === 'continuous' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? { repeatWeekday: weekday } : {}),
    // And a series' repeat is a series' alone — read off nothing else.
    ...(repeat ? { repeat } : {}),
    entry,
    // Approval only means anything on a self-join event, and only true is
    // worth a key — the same keep-the-no-op-off rule as everywhere else.
    ...(entry === 'self_join' && r.requireApproval === true
      ? { requireApproval: true } : {}),
    ...(DAY_BOARDS.some(d => d.key === r.dayBoards)
      ? { dayBoards: r.dayBoards as DayBoards } : {}),
    ...(giRules && source && source !== 'live'
      ? { scoreSource: source, golfIreland: giRules } : {}),
    ...(tidyCardsOff(r.cardsOff).length > 0 ? { cardsOff: tidyCardsOff(r.cardsOff) } : {}),
  }
}

// ─── Naming ────────────────────────────────────────────────────

/**
 * The organiser card's one line — "League · 3 days · players join
 * themselves (approval on) · days and overall". Days come from the caller's
 * rounds, because the rounds are the one copy of how many there are.
 */
/** Sunday-first, the same 0–6 the repeat stores — lib/weekdays.ts holds them. */
export { WEEKDAY_NAMES }

export function describeLeagueSetup(
  setup: LeagueSetup,
  days: number,
  /** The first event's date, so a series' repeat can name its weekday. */
  firstDate?: string | null,
): string {
  const parts = ['League']
  // The shape is worth a word when it is not the plain one — and a weekly
  // repeat is the better word for a continuous league that has one.
  if (setup.schedule === 'continuous') {
    parts.push(setup.repeatWeekday != null
      ? `every ${WEEKDAY_NAMES[setup.repeatWeekday]}`
      : 'continuous')
  } else if (setup.schedule === 'series') {
    parts.push('series')
    // A dated series says how its rounds arrive; a numbered one made
    // before series carried dates says nothing it cannot back up.
    if (setup.repeat) parts.push(describeRepeat(setup.repeat, firstDate))
    else if (firstDate) parts.push('rounds added ad hoc')
  }
  parts.push(setup.schedule === 'series'
    ? (days === 1 ? 'one round' : `${days} rounds`)
    : (days === 1 ? 'one day' : `${days} days`))
  // Said in the card's own words rather than the form buttons' — "I add the
  // field" is a thing an organiser taps, not a fact a summary states.
  const entry = setup.entry === 'organiser'
    ? 'organiser-entered field'
    : 'players join themselves'
  parts.push(setup.requireApproval ? `${entry} (approval on)` : entry)
  if (setup.dayBoards) {
    parts.push(DAY_BOARDS.find(d => d.key === setup.dayBoards)!.label.toLowerCase())
  }
  if (setup.scoreSource === 'golf_ireland') parts.push('scores from Golf Ireland')
  else if (setup.scoreSource === 'both') parts.push('scored here and from Golf Ireland')
  return parts.join(' · ')
}
