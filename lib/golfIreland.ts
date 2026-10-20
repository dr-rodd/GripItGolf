// Golf Ireland — every decision, none of the network.
//
// A league can take its cards from Golf Ireland: players hand their scores
// in as they always do, link their Golf Ireland account to their name in
// the league, and Green Dot reads the cards that meet the league's rules.
// lib/golfIrelandClient.ts is the one file that talks to Golf Ireland; this
// file decides — what the league's rules are and how they are stored, what
// a card from Golf Ireland must look like before anything trusts it, which
// cards count and why the others do not, and what a sync should add and
// remove. Pure, so every rule is tested against a fake Golf Ireland
// (`npm run test:golf-ireland`) — the real API is not in our hands yet.
//
// ── What is assumed until Golf Ireland's documentation arrives ──
//
//   · Linking is a sign-in on Golf Ireland's own page, handing back an
//     access token, as Strava does. The trip and player travel through it
//     in a signed `state` (lib/signedState.ts).
//   · A card says when it was played, where, over 9 or 18 holes, and its
//     gross and Stableford totals with the handicap of the day. Hole-by-
//     hole scores are welcome and optional: nothing here needs them.
//   · Only cards Golf Ireland accepted are listed. A card that disappears
//     from the list was withdrawn, and goes from the league too.
//
// If any of that turns out wrong, the change belongs in the client and in
// `normaliseCard`, and nowhere else.
//
// ── What the organiser decides (in the league's creation form) ──
//
//   · Where the scores come from — scored live on Green Dot, from Golf
//     Ireland, or both (`ScoreSource`).
//   · Which Golf Ireland cards count (`GolfIrelandRules`) — every qualifying
//     card automatically, or only the ones each player puts forward; 18
//     holes, 9, or either; which days of the week; any course, or only the
//     league's own venues.
//
// ── What a player's link means ──────────────────────────────────
//
//   · Consent is ticked before linking and stored with the link.
//   · Unlinking deletes their imported cards at once (decided October
//     2026), and their standing re-tells without them.

import { WEEKDAY_NAMES, weekdayOf } from './weekdays'

// ─── Configuration ─────────────────────────────────────────────

export type GolfIrelandConfig = { clientId: string; clientSecret: string; apiBase: string }

/** The three keys from Vercel, or null when Golf Ireland is not set up. */
export function golfIrelandConfig(env: Record<string, string | undefined> = process.env): GolfIrelandConfig | null {
  const clientId = env.GOLF_IRELAND_CLIENT_ID?.trim()
  const clientSecret = env.GOLF_IRELAND_CLIENT_SECRET?.trim()
  const apiBase = env.GOLF_IRELAND_API_BASE?.trim().replace(/\/+$/, '')
  if (!clientId || !clientSecret || !apiBase) return null
  if (!/^https:\/\//.test(apiBase)) return null
  return { clientId, clientSecret, apiBase }
}

// ─── Where a league's scores come from ─────────────────────────

/**
 * `live` is every league before this question existed, and is the absent
 * default wherever it is stored. `both` lets a player score a league day
 * live and also have Golf Ireland cards count.
 */
export type ScoreSource = 'live' | 'golf_ireland' | 'both'

export const SCORE_SOURCES: { key: ScoreSource; label: string; hint: string }[] = [
  { key: 'live', label: 'Scored here', hint:
    'Players score each league day live on Green Dot.' },
  { key: 'golf_ireland', label: 'From Golf Ireland', hint:
    'Players hand in their cards to Golf Ireland as usual. Green Dot reads the ones that count.' },
  { key: 'both', label: 'Both', hint:
    'League days are scored live here, and Golf Ireland cards count as well.' },
]

/** Does this league score live on Green Dot? */
export const scoresLive = (s: ScoreSource | undefined) => s !== 'golf_ireland'
/** Does this league read cards from Golf Ireland? */
export const readsGolfIreland = (s: ScoreSource | undefined) => s === 'golf_ireland' || s === 'both'

// ─── Which cards count ─────────────────────────────────────────

/**
 * `automatic` — every card that meets the rules counts, as soon as it is
 * read. `player_picks` — a player puts forward the cards they want counted,
 * from those that meet the rules; nothing counts until they do.
 */
export type CardEntry = 'automatic' | 'player_picks'

export const CARD_ENTRIES: { key: CardEntry; label: string; hint: string }[] = [
  { key: 'automatic', label: 'Every round that qualifies', hint:
    'Any card that meets the rules below counts, as soon as it is read.' },
  { key: 'player_picks', label: 'Players choose', hint:
    'Each player picks which of their qualifying Golf Ireland rounds to put forward.' },
]

export type HoleRule = 18 | 9 | 'either'

export const HOLE_RULES: { key: HoleRule; label: string }[] = [
  { key: 18, label: '18 holes' },
  { key: 9, label: '9 holes' },
  { key: 'either', label: 'Either' },
]

export type CourseRule = 'any' | 'venues'

export const COURSE_RULES: { key: CourseRule; label: string; hint: string }[] = [
  { key: 'any', label: 'Any course', hint:
    'A card counts wherever it was played.' },
  { key: 'venues', label: 'League venues only', hint:
    'A card counts only if it was played at one of the league\'s own venues.' },
]

export type GolfIrelandRules = {
  entry: CardEntry
  holes: HoleRule
  /**
   * The days of the week a card may be played on (0 = Sunday … 6 =
   * Saturday), ascending. Absent means any day — and so does every day
   * ticked, which is stored as absent.
   */
  weekdays?: number[]
  courses: CourseRule
}

/** What the form starts on: every 18-hole card, any day, anywhere. */
export function defaultRules(): GolfIrelandRules {
  return { entry: 'automatic', holes: 18, courses: 'any' }
}

/**
 * Read stored rules. Complete rules come back whole and tidy; anything
 * missing a required answer comes back null — dropped, never repaired, the
 * same posture as every parser on the platform.
 */
export function parseGolfIrelandRules(raw: unknown): GolfIrelandRules | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const entry = CARD_ENTRIES.find(e => e.key === r.entry)?.key
  const holes = HOLE_RULES.find(h => h.key === r.holes)?.key
  const courses = COURSE_RULES.find(c => c.key === r.courses)?.key
  if (!entry || holes === undefined || !courses) return null

  const weekdays = tidyWeekdays(r.weekdays)
  return { entry, holes, ...(weekdays ? { weekdays } : {}), courses }
}

/**
 * Weekdays as stored: whole numbers 0–6, once each, ascending. Null when
 * that leaves none or all seven — both mean "any day", which is absent.
 */
export function tidyWeekdays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const days = [...new Set(raw.filter((d): d is number =>
    Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
  return days.length === 0 || days.length === 7 ? null : days
}

/** "Saturdays", "Saturdays and Sundays", "Tuesdays, Thursdays and Saturdays". */
export function describeWeekdays(days: readonly number[]): string {
  const names = days.map(d => `${WEEKDAY_NAMES[d]}s`)
  return names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The rules in the facts style a board uses — "18 holes · Saturdays · league venues · players choose". */
export function describeRules(rules: GolfIrelandRules): string {
  const parts = [
    rules.holes === 'either' ? '9 or 18 holes' : `${rules.holes} holes`,
    rules.weekdays ? describeWeekdays(rules.weekdays) : 'any day',
    rules.courses === 'venues' ? 'league venues' : 'any course',
  ]
  if (rules.entry === 'player_picks') parts.push('players choose')
  return parts.join(' · ')
}

// ─── A card from Golf Ireland ──────────────────────────────────

/** A Golf Ireland card as this app holds it — checked, never raw. */
export type GolfIrelandCard = {
  /** Golf Ireland's own id for the card. */
  cardId: string
  /** `YYYY-MM-DD`, the day it was played. */
  playedOn: string
  holesPlayed: 9 | 18
  /** Golf Ireland's id for the course, when it gave one. */
  courseId: string | null
  courseName: string
  grossTotal: number | null
  stablefordPoints: number | null
  /** The player's handicap index on the day — the official figure. */
  handicapIndex: number | null
  /** The course handicap Golf Ireland played them off, when it says. */
  courseHandicap: number | null
  /** Gross per hole, in hole order, when Golf Ireland gives it. Null = a pick-up. */
  holeScores: (number | null)[] | null
}

/** The highest gross a hole can sensibly carry; a misread past it is refused. */
export const MAX_HOLE_GROSS = 20

const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
const inRange = (v: number | null, lo: number, hi: number) =>
  v === null ? null : v >= lo && v <= hi ? v : null

/**
 * A card from the client, checked: the card if it can be trusted, null if
 * it cannot. A card with nothing to score — no gross and no points — is
 * refused; so is a date that is not one, or a hole count other than 9 or
 * 18. A figure outside sense costs that figure, not the card: an absurd
 * handicap index is dropped, and hole scores that disagree with the gross
 * are dropped in favour of Golf Ireland's own total, which is the official
 * one.
 */
export function normaliseCard(raw: unknown): GolfIrelandCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const cardId = typeof r.cardId === 'string' ? r.cardId.trim() : ''
  const playedOn = typeof r.playedOn === 'string' ? r.playedOn.slice(0, 10) : ''
  const holesPlayed = r.holesPlayed === 9 || r.holesPlayed === 18 ? r.holesPlayed : null
  if (!cardId || weekdayOf(playedOn) === null || !holesPlayed) return null

  const grossTotal = inRange(int(r.grossTotal), holesPlayed, holesPlayed * MAX_HOLE_GROSS)
  // Six a hole is a hole-in-one on a par 5 off a big handicap — past that
  // is a misread.
  const stablefordPoints = inRange(int(r.stablefordPoints), 0, holesPlayed * 6)
  if (grossTotal === null && stablefordPoints === null) return null

  let holeScores: (number | null)[] | null = null
  if (Array.isArray(r.holeScores) && r.holeScores.length === holesPlayed) {
    const holes = r.holeScores.map(h => h === null ? null : inRange(int(h), 1, MAX_HOLE_GROSS))
    const allRead = r.holeScores.every((h, i) => h === null || holes[i] !== null)
    const complete = holes.every(h => h !== null)
    const sum = holes.reduce<number>((a, h) => a + (h ?? 0), 0)
    // A full card must add up to the gross; a card with pick-ups has no
    // gross to agree with, so it is taken as read.
    if (allRead && (!complete || grossTotal === null || sum === grossTotal)) holeScores = holes
  }

  const courseId = typeof r.courseId === 'string' && r.courseId.trim() ? r.courseId.trim() : null
  const courseName = typeof r.courseName === 'string' ? r.courseName.trim() : ''

  return {
    cardId,
    playedOn,
    holesPlayed,
    courseId,
    courseName,
    grossTotal,
    stablefordPoints,
    // WHS runs from +10-ish to 54; a figure outside that is not a handicap.
    handicapIndex: inRange(num(r.handicapIndex), -10, 54),
    courseHandicap: inRange(int(r.courseHandicap), -15, 72),
    holeScores,
  }
}

// ─── Does a card count? ────────────────────────────────────────

/**
 * What the rules are read against. `from`/`to` are the league's dates,
 * inclusive; a series has no finish, and no start beyond the day it was
 * made (`leagueWindow`). `venueCourseIds` are the Golf Ireland ids of the
 * league's venues — only read when the rules say venues only. `liveDates`
 * are the days this player already has a Green Dot card for in this league
 * — only read when the league scores both ways.
 */
export type CardContext = {
  from: string | null
  to: string | null
  venueCourseIds: readonly string[]
  source: ScoreSource
  liveDates?: readonly string[]
}

/**
 * The window a league's cards must fall inside: its dates when it has
 * them, otherwise from the day it was made with no end — a series is still
 * a league that began somewhere, and a card from before it existed was
 * never played in it.
 */
export function leagueWindow(trip: {
  start_date: string | null; end_date: string | null; created_at: string
}): { from: string; to: string | null } {
  return {
    from: trip.start_date ?? trip.created_at.slice(0, 10),
    to: trip.start_date ? (trip.end_date ?? trip.start_date) : null,
  }
}

/**
 * Why this card does not count, in a sentence a player can read on their
 * own list — or null when it does. The first reason found is the one
 * given, in the order a player would think of them: when, how long, which
 * day, where.
 */
export function cardIssue(card: GolfIrelandCard, rules: GolfIrelandRules, ctx: CardContext): string | null {
  if (!readsGolfIreland(ctx.source)) return 'This league does not read Golf Ireland cards.'

  if (ctx.from && card.playedOn < ctx.from) return 'Played before the league started.'
  if (ctx.to && card.playedOn > ctx.to) return 'Played after the league finished.'

  if (rules.holes !== 'either' && card.holesPlayed !== rules.holes) {
    return `A ${card.holesPlayed}-hole round. This league counts ${rules.holes}-hole rounds.`
  }

  const day = weekdayOf(card.playedOn)!
  if (rules.weekdays && !rules.weekdays.includes(day)) {
    return `Played on a ${WEEKDAY_NAMES[day]}. This league counts ${describeWeekdays(rules.weekdays)}.`
  }

  if (rules.courses === 'venues' && !(card.courseId && ctx.venueCourseIds.includes(card.courseId))) {
    return 'Not played at one of the league\'s venues.'
  }

  // Scored both ways: a player who scored the day live here has that card
  // in the league already, and the same round must not count twice. The
  // Green Dot card is the league day's own, so it is the one kept.
  if (ctx.source === 'both' && ctx.liveDates?.includes(card.playedOn)) {
    return 'Already scored on Green Dot that day.'
  }

  return null
}

// ─── What a sync should do ─────────────────────────────────────

/** A card already imported for this player in this league. */
export type StoredCard = { cardId: string }

export type ImportPlan = {
  /** Cards to write — new ones, and fresh copies of ones already held. */
  upsert: GolfIrelandCard[]
  /** Card ids to delete from the league. */
  remove: string[]
}

/**
 * What one player's sync adds and removes, from what is stored and what
 * Golf Ireland just listed.
 *
 * · Automatic: every card that counts is written; a stored card that no
 *   longer counts — the rules changed, or Golf Ireland corrected it — goes.
 * · Players choose: only cards already put forward are refreshed or
 *   removed. A sync never puts a card forward for anybody (`pickIssue`
 *   is the door for that).
 * · Either way, a stored card missing from the list is removed **only when
 *   the list was complete**: a card missing from a list cut short may be on
 *   the page not read.
 */
export function planImport(args: {
  stored: readonly StoredCard[]
  fetched: readonly GolfIrelandCard[]
  rules: GolfIrelandRules
  ctx: CardContext
  complete: boolean
}): ImportPlan {
  const { stored, fetched, rules, ctx, complete } = args
  const held = new Set(stored.map(s => s.cardId))
  const listed = new Map(fetched.map(c => [c.cardId, c]))

  const upsert: GolfIrelandCard[] = []
  const remove: string[] = []

  for (const card of listed.values()) {
    const counts = cardIssue(card, rules, ctx) === null
    const isHeld = held.has(card.cardId)
    if (counts && (isHeld || rules.entry === 'automatic')) upsert.push(card)
    else if (!counts && isHeld) remove.push(card.cardId)
  }
  if (complete) {
    for (const id of held) if (!listed.has(id)) remove.push(id)
  }

  return { upsert, remove }
}

/**
 * Why this card cannot be put forward, or null when it can — the players-
 * choose door. The card's own rules first, so a refusal names the real
 * reason rather than the league's mode.
 */
export function pickIssue(
  card: GolfIrelandCard, rules: GolfIrelandRules, ctx: CardContext, stored: readonly StoredCard[],
): string | null {
  if (rules.entry !== 'player_picks') return 'Every qualifying round counts in this league already.'
  const issue = cardIssue(card, rules, ctx)
  if (issue) return issue
  if (stored.some(s => s.cardId === card.cardId)) return 'This round is already in the league.'
  return null
}
