// A match play event's bracket setup — the only copy of the rules.
//
// One flow, at creation and in the organiser area alike (Ross, 5 Nov 2026:
// "the same as doing it at creation"): plan the draw (lib/bracketDraw.ts —
// the bracket itself decides how many rounds there are; the old field cap
// is gone), then, once a bracket exists, **"Do you want to set a deadline
// for each round to be completed?"** — a date for each of its rounds — and
// under **More settings** the rest: strict or relaxed, how the field gets
// in, a qualifying event, and whether the setup is locked in.
//
// Stored in `trips.bracket_setup` (migration 047), jsonb, one object. An
// answer nobody has given reads as its default — relaxed, players join
// themselves, no qualifier, no deadlines, open — so the event is a whole
// setup from the moment it is made, and every write merges into the column
// read fresh (lib/drawStore.ts `saveBracketSetup`), never from a stale copy.
//
// It is not the draw: generating matches stays with lib/matchplay.ts. Pure.
// No I/O.

import { parseDrawPlan, type DrawPlan } from './bracketDraw'
import { roundName } from './matchplay'
import type { Leaderboard } from './leaderboards'

// ─── A match play event ────────────────────────────────────────
//
// Match play is a shape of its own on the tournament door (docs/event-use-
// cases.md, story 2): one-off — a day or a run of days, its golf on the
// schedule — or ongoing over a period, paced by the deadlines. Creation
// seeds the column with `{ format, schedule? }`, a partial the parser below
// rightly refuses, so these read the raw value.

/** Is this event a knockout? True from the moment it is created. */
export function isKnockoutEvent(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && (raw as Record<string, unknown>).format === 'match_play'
}

/**
 * The seed a match play event is created with — one-off, or ongoing over a
 * period — and, when creation planned them, how the draw is to be made
 * (lib/bracketDraw.ts `DrawPlan`) and each round's deadline.
 */
export function knockoutSeed(
  schedule: 'standalone' | 'continuous', draw?: DrawPlan | null, deadlines?: readonly string[] | null,
): Record<string, unknown> {
  return {
    format: 'match_play',
    ...(schedule === 'continuous' ? { schedule: 'continuous' } : {}),
    ...(draw ? { draw } : {}),
    ...(deadlines && deadlines.length > 0 ? { deadlines: [...deadlines] } : {}),
  }
}

/** The draw plan off the raw column, whether or not the setup is complete yet. */
export function rawDrawPlan(raw: unknown): DrawPlan | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? parseDrawPlan((raw as Record<string, unknown>).draw) : null
}

/**
 * The date each drawn round must be played by. Deadlines are set against
 * the bracket as it was when they were set; a draw made again with a round
 * more or fewer lines them up from the Final backwards, so the last
 * deadline is always the Final's. A round with no deadline left is null.
 */
export function drawDeadlines(deadlines: readonly string[], drawRounds: number): (string | null)[] {
  const offset = deadlines.length - drawRounds
  return Array.from({ length: drawRounds }, (_, i) => deadlines[offset + i] ?? null)
}

/**
 * What a round's deadline says at the top of the bracket — "Play by Fri 14
 * Nov", or, once it has passed with a match still open, "Was due Fri 14
 * Nov". A finished round says nothing more than its date.
 */
export function deadlineNote(
  date: string, shortDate: string, args: { today: string; finished: boolean },
): string {
  if (args.finished) return `Played by ${shortDate}`
  return date < args.today ? `Was due ${shortDate}` : `Play by ${shortDate}`
}

/**
 * The board a match play event is made with, so the bracket is switched on
 * from the start rather than waiting for somebody to add one in Trip Setup.
 */
export function knockoutBoards(): Leaderboard[] {
  return [{ id: 'lb-matchplay', audience: 'individual', competition: 'matchplay' }]
}

// ─── Format ────────────────────────────────────────────────────

export type TournamentFormat = 'match_play' | 'league'

// ─── More settings ─────────────────────────────────────────────

// Who decides how a match comes about. Strict: the organiser pre-determines
// everything — who plays whom each round, and which course a round is played
// on — and the field's job is to turn up and enter the result. Relaxed: the
// players self-organise. Stored; the strict-mode fixture screens are built on
// top of it later. Relaxed unless the organiser says otherwise (Ross).
export type BracketMode = 'strict' | 'relaxed'

export const BRACKET_MODES: { key: BracketMode; label: string; hint: string }[] = [
  { key: 'relaxed', label: 'Relaxed', hint:
    'Players arrange their own matches and link their cards to the bracket.' },
  { key: 'strict', label: 'Strict', hint:
    'You set who plays whom each round, and where.' },
]

// How the field is assembled — never who plays whom.
export type PlayerEntry = 'organiser' | 'self_join'

export const PLAYER_ENTRIES: { key: PlayerEntry; label: string; hint: string }[] = [
  { key: 'self_join', label: 'Players join themselves', hint:
    'Share the event link or QR code and the field builds itself.' },
  { key: 'organiser', label: 'I add the field', hint:
    'You enter every player yourself, up front.' },
]

// A standalone event on the platform whose standings feed the seeding.
// Named by its own six-character code — a reference, never a copy.
export type Seeding = 'random' | 'seeded'

export const SEEDINGS: { key: Seeding; label: string; hint: string }[] = [
  { key: 'random', label: 'Randomised', hint:
    'The qualifiers are in; the draw between them is luck.' },
  { key: 'seeded', label: 'Fully seeded', hint:
    'First plays last, second plays second-last — standard seeding.' },
]

export type Qualifying = {
  /** The qualifying event's own trip code. */
  eventCode: string
  seeding: Seeding
}

/** A typed code, held to the shape every trip code has — six alphanumerics, upper-cased. */
export function normalizeEventCode(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, '').toUpperCase()
}

export function validEventCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code)
}

// ─── Deadlines ─────────────────────────────────────────────────
//
// Asked only once a bracket exists — "Do you want to set a deadline for
// each round to be completed?" (Ross, 5 Nov 2026) — one date for each of
// its rounds, first round first. Dates only; two rounds may share one, but
// they can never run backwards.

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

export function validDeadline(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_SHAPE.test(value)) return false
  const t = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(value)
}

/** The rounds of a bracket this many rounds deep, in playing order — "Round of 16" … "Final". */
export function deadlineRoundNames(rounds: number): string[] {
  return Array.from({ length: rounds }, (_, i) => roundName(2 ** (rounds - i)))
}

/**
 * The rounds a deadline is asked of — a bracket's by default; a league's
 * rounds carry their own names, and the date each is played on, which its
 * deadline cannot come before.
 */
export type DeadlineRounds = { names?: readonly string[]; floors?: readonly (string | null)[] }

/** What is wrong with a deadline for each of these rounds, or null — said in the round's own name. */
export function deadlinesIssue(
  deadlines: readonly (string | null | undefined)[], rounds: number, opts: DeadlineRounds = {},
): string | null {
  const names = opts.names ?? deadlineRoundNames(rounds)
  for (let i = 0; i < rounds; i++) {
    if (!validDeadline(deadlines[i])) return `Choose the ${names[i]}\'s deadline.`
    const floor = opts.floors?.[i]
    if (floor && (deadlines[i] as string) < floor) return `The ${names[i]} cannot be due before it is played.`
  }
  for (let i = 1; i < rounds; i++) {
    if ((deadlines[i] as string) < (deadlines[i - 1] as string)) {
      return `The ${names[i]} cannot close before the ${names[i - 1]}.`
    }
  }
  return null
}

/**
 * Where a round's calendar opens (Ross, 5 Nov 2026: "at the previous
 * round's deadline, in case it is being set up months or a year in
 * advance"): the last deadline set before it, else the event's start.
 */
export function deadlineOpensAt(
  deadlines: readonly string[], i: number, start: string | null, floor?: string | null,
): string | null {
  let prev: string | null = null
  for (let k = i - 1; k >= 0 && !prev; k--) if (validDeadline(deadlines[k])) prev = deadlines[k]
  // A league round is never due before it is played: the later of the two.
  if (floor && validDeadline(floor) && (!prev || floor > prev)) return floor
  return prev ?? (start && validDeadline(start) ? start : null)
}

/** The deadline question as the form holds it: not answered yet, no, or yes with a date a round. */
export type DeadlinesAnswer = { on: boolean | null; dates: string[] }

export const NO_DEADLINES_ANSWER: DeadlinesAnswer = { on: null, dates: [] }

/** The answer read back from what is stored — fitted to the bracket where it is used (`fitDeadlines`). */
export function deadlinesAnswerFrom(stored: readonly string[] | undefined): DeadlinesAnswer {
  return stored?.length ? { on: true, dates: [...stored] } : NO_DEADLINES_ANSWER
}

/**
 * Dates lined up with a bracket this many rounds deep — from the Final
 * backwards, as `drawDeadlines` reads them, so a round more or fewer keeps
 * the Final's date and a new first round starts empty.
 */
export function fitDeadlines(dates: readonly string[], rounds: number): string[] {
  const offset = dates.length - rounds
  return Array.from({ length: rounds }, (_, i) => dates[offset + i] ?? '')
}

/** Why the deadline question cannot be left yet, or null. */
export function deadlinesAnswerIssue(answer: DeadlinesAnswer, rounds: number, opts: DeadlineRounds = {}): string | null {
  if (answer.on === null) return 'Choose whether to set deadlines.'
  return answer.on ? deadlinesIssue(fitDeadlines(answer.dates, rounds), rounds, opts) : null
}

/** What the answer stores: a date a round, or nothing. */
export function storedDeadlines(answer: DeadlinesAnswer, rounds: number, opts: DeadlineRounds = {}): string[] | null {
  return answer.on && !deadlinesAnswerIssue(answer, rounds, opts) ? fitDeadlines(answer.dates, rounds) : null
}

// ─── The setup itself ──────────────────────────────────────────

export type BracketSetup = {
  format: 'match_play'
  /**
   * A continuous knockout — an ongoing event occupying a period, its rounds
   * paced by the deadlines rather than fixed days of golf. Absent means
   * standalone. Written at creation and carried through every save.
   */
  schedule?: 'continuous'
  mode: BracketMode
  entry: PlayerEntry
  /** Absent means no qualifying event. */
  qualifying?: Qualifying
  /** A date for each of the bracket's rounds, first round first — absent, none set. */
  deadlines?: string[]
  /** How and when the draw is made, when it was planned (lib/bracketDraw.ts). */
  draw?: DrawPlan
  /** Locked in: the More settings answers fixed for good. */
  finalized: boolean
}

/**
 * Read whatever `trips.bracket_setup` holds: a match play event's setup,
 * every unanswered question at its default, an answer that does not read
 * dropped to its default rather than the setup refused — or null for
 * anything that is not a match play event (a league's setup included).
 */
export function parseBracketSetup(raw: unknown): BracketSetup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.format !== 'match_play') return null

  const mode = BRACKET_MODES.find(m => m.key === r.mode)?.key ?? 'relaxed'
  const entry = PLAYER_ENTRIES.find(e => e.key === r.entry)?.key ?? 'self_join'

  let qualifying: Qualifying | undefined
  if (r.qualifying && typeof r.qualifying === 'object' && !Array.isArray(r.qualifying)) {
    const q = r.qualifying as Record<string, unknown>
    const eventCode = normalizeEventCode(typeof q.eventCode === 'string' ? q.eventCode : '')
    const seeding = SEEDINGS.find(s => s.key === q.seeding)?.key
    if (validEventCode(eventCode) && seeding) qualifying = { eventCode, seeding }
  }

  const deadlines = Array.isArray(r.deadlines) && r.deadlines.length > 0
    && !deadlinesIssue(r.deadlines, r.deadlines.length) ? r.deadlines as string[] : null
  const draw = parseDrawPlan(r.draw)

  return {
    format: 'match_play',
    ...(r.schedule === 'continuous' ? { schedule: 'continuous' as const } : {}),
    mode, entry,
    ...(qualifying ? { qualifying } : {}),
    ...(deadlines ? { deadlines } : {}),
    ...(draw ? { draw } : {}),
    finalized: r.finalized === true,
  }
}

// ─── Naming ────────────────────────────────────────────────────

/** The one line the organiser area says about a setup — "Relaxed · deadlines set · seeded off QX7K2P · open". */
export function describeSetup(setup: BracketSetup): string {
  const parts = [
    ...(setup.schedule === 'continuous' ? ['Ongoing'] : []),
    setup.mode === 'strict' ? 'Strict' : 'Relaxed',
    setup.deadlines?.length ? 'deadlines set' : 'no deadlines',
  ]
  if (setup.qualifying) {
    parts.push(setup.qualifying.seeding === 'seeded'
      ? `seeded off ${setup.qualifying.eventCode}`
      : `drawn from ${setup.qualifying.eventCode}`)
  }
  parts.push(setup.finalized ? 'locked in' : 'open')
  return parts.join(' · ')
}
