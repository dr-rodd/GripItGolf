// A club match play competition (Ross, 17 Nov 2026; D264–D271) — the one
// copy of what one is made of. A verified club's knockout over weeks:
// Singles, Fourball (better ball) or Foursomes, made in the Clubhouse
// (`keep_calendar`), its field the club's members who enter by a closing
// date — or the top finishers of a qualifier from the club's schedule — and
// its rounds paced by deadlines set at creation.
//
// Underneath it is the platform's continuous knockout (lib/bracketSetup.ts,
// lib/bracketDraw.ts, `matchplay_matches`) plus `trips.competition = 'club'`.
// Everything the club adds rides in `trips.bracket_setup.club` — no
// migration — beside the knockout's own keys, which keep their meaning: the
// draw plan (`draw`), the deadlines lined up from the Final back
// (`deadlines`, `drawDeadlines`), the qualifier (`qualifying`).
//
// Pure: the form's checks, the board, the stored setup and its reading back,
// the dates the event spans, where it stands, and the rules as the members
// read them. `app/api/club/competition.ts` writes them.

import type { Leaderboard } from './leaderboards'
import { defaultPermissions, type EventPermissions } from './eventPermissions'
import { readEntryRules, type EntryRules } from './clubMembership'
import { deadlineRoundNames, normalizeEventCode, validDeadline, validEventCode } from './bracketSetup'
import { irishInstant } from './irishTime'
import { describeTime } from './itinerary'
import { clubEventDates } from './clubs'
import { COMP_NAME_MAX, type CompWatch } from './clubComp'
import type { DrawPlan } from './bracketDraw'
import type { CompPhase } from './compPhase'
import { FULL_ALLOWANCE, MIN_ALLOWANCE } from './handicapAllowance'

// ─── The answers ───────────────────────────────────────────────

export type MatchPlayFormat = 'singles' | 'fourball' | 'foursomes'

/** WHS's recommended allowances: singles 100%, fourball 90%, foursomes 50% of the pair's combined. */
export const MATCH_PLAY_FORMATS: { key: MatchPlayFormat; label: string; hint: string; allowance: number }[] = [
  { key: 'singles', label: 'Singles', hint: 'One against one.', allowance: 100 },
  { key: 'fourball', label: 'Fourball', hint: 'Pairs, better ball — each plays their own ball.', allowance: 90 },
  { key: 'foursomes', label: 'Foursomes', hint: 'Pairs, one ball a side, alternate shots.', allowance: 50 },
]

/** The biggest fields offered (D264) — or no limit, `null`. */
export const FIELD_CAPS = [8, 16, 32, 64] as const

/** With no limit, at most this many rounds of deadlines (a field of 64). */
export const MAX_MATCH_ROUNDS = 6

/** How the field is made: members enter by a closing date, or the top of a qualifier. */
export type MatchPlayField = 'entries' | 'qualifier'

/** When the draw is made (D265): automatically (entries closing, or the qualifier certified), on a date, or by hand. */
export type MatchPlayDrawWhen = 'auto' | 'date' | 'manual'

/** How an automatic draw is seeded: from a hat, by handicap index, or by the qualifier's finish. */
export type MatchPlaySeeding = 'random' | 'handicap' | 'qualifier'

export type MatchPlayVenue = 'home' | 'any'
/** Level after 18: down the 19th (the card does it already), or halved and replayed. */
export type MatchPlayTie = 'extra' | 'replay'
/** D269: the index on the day the match is played, or as it stood when the draw was made. */
export type MatchPlayHandicap = 'on_day' | 'at_draw'

export interface MatchPlayForm {
  name: string
  format: MatchPlayFormat
  /** The handicap allowance, percent. */
  allowance: number
  watch: CompWatch
  entry: EntryRules | null
  field: MatchPlayField
  /** Members enter until this day and time (Irish) — `field: 'entries'` only. */
  closes: { date: string; time: string } | null
  /** The qualifier from the club's schedule — `field: 'qualifier'` only. */
  qualifier: { code: string; qualify: number } | null
  /** The biggest field (D264), or null for no limit. */
  maxField: number | null
  draw: { when: MatchPlayDrawWhen; date: string | null; time: string | null; seeding: MatchPlaySeeding }
  /** A play-by date a round, first round first, the Final last. */
  deadlines: string[]
  venue: MatchPlayVenue
  tie: MatchPlayTie
  handicap: MatchPlayHandicap
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const pick = <T extends string>(v: unknown, keys: readonly T[], or: T): T => (keys as readonly unknown[]).includes(v) ? v as T : or
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The form a browser sent, read whole — anything unreadable at its default or empty, for the checks to name. */
export function readMatchPlayForm(raw: unknown): MatchPlayForm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const format = pick(r.format, ['singles', 'fourball', 'foursomes'] as const, 'singles')
  const field = pick(r.field, ['entries', 'qualifier'] as const, 'entries')
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
  const c = obj(r.closes)
  const q = obj(r.qualifier)
  const d = obj(r.draw) ?? {}
  const cap = Number(r.maxField)
  return {
    name: str(r.name).replace(/\s+/g, ' '),
    format,
    allowance: typeof r.allowance === 'number' && Number.isFinite(r.allowance) ? r.allowance : NaN,
    watch: r.watch === 'guests' ? 'guests' : 'members',
    entry: readEntryRules(r.entry),
    field,
    closes: field === 'entries' ? { date: str(c?.date), time: str(c?.time) } : null,
    qualifier: field === 'qualifier' ? { code: normalizeEventCode(str(q?.code)), qualify: Number(q?.qualify) } : null,
    maxField: r.maxField == null || r.maxField === '' ? null : Number.isInteger(cap) ? cap : NaN,
    draw: {
      when: pick(d.when, ['auto', 'date', 'manual'] as const, 'auto'),
      date: str(d.date) || null,
      time: str(d.time) || null,
      seeding: pick(d.seeding, ['random', 'handicap', 'qualifier'] as const, field === 'qualifier' ? 'qualifier' : 'random'),
    },
    deadlines: Array.isArray(r.deadlines) ? r.deadlines.map(x => str(x)) : [],
    venue: pick(r.venue, ['home', 'any'] as const, 'home'),
    tie: pick(r.tie, ['extra', 'replay'] as const, 'extra'),
    handicap: pick(r.handicap, ['on_day', 'at_draw'] as const, 'on_day'),
  }
}

/** How many rounds a field of `cap` plays — 8 is three, 64 six. */
export function roundsFor(cap: number): number {
  return Math.round(Math.log2(cap))
}

/** The rounds' names for `n` deadlines, first round first — "Round of 16", "Quarter-Final", "Semi-Final", "Final". */
export function matchRoundNames(n: number): string[] {
  return deadlineRoundNames(n)
}

/** The instant entries close, or null. */
export function closesAt(f: Pick<MatchPlayForm, 'closes'>): Date | null {
  return f.closes && DATE.test(f.closes.date) && TIME.test(f.closes.time) ? irishInstant(f.closes.date, f.closes.time) : null
}

/** The instant a dated draw is made, or null. */
export function drawAt(f: Pick<MatchPlayForm, 'draw'>): Date | null {
  return f.draw.when === 'date' && f.draw.date && DATE.test(f.draw.date) && f.draw.time && TIME.test(f.draw.time)
    ? irishInstant(f.draw.date, f.draw.time) : null
}

/** The first day a match may be due: the draw's day, else the day entries close, else today. */
function firstPlayDay(f: MatchPlayForm, today: string): string {
  if (f.draw.when === 'date' && f.draw.date) return f.draw.date
  if (f.field === 'entries' && f.closes?.date) return f.closes.date
  return today
}

/** Why the form cannot be saved, in a sentence — or null. `now` is the moment it is checked. */
export function matchPlayFormIssue(f: MatchPlayForm, now: Date, today: string): string | null {
  if (!f.name) return 'Name the competition.'
  if (f.name.length > COMP_NAME_MAX) return `Keep the name under ${COMP_NAME_MAX} characters.`
  if (!Number.isInteger(f.allowance) || f.allowance < MIN_ALLOWANCE || f.allowance > FULL_ALLOWANCE) return `The handicap allowance is a whole percentage, ${MIN_ALLOWANCE} to ${FULL_ALLOWANCE}.`
  if (f.maxField !== null && !(FIELD_CAPS as readonly number[]).includes(f.maxField)) return 'Choose the biggest field — 8, 16, 32, 64 or no limit.'

  if (f.field === 'entries') {
    const at = closesAt(f)
    if (!at) return 'Choose when entries close — a day and a time.'
    if (at.getTime() <= now.getTime()) return 'Entries must close in the future.'
  } else {
    if (!f.qualifier || !validEventCode(f.qualifier.code)) return 'Choose the qualifying competition.'
    const q = f.qualifier.qualify
    if (!Number.isInteger(q) || q < 2 || (q & (q - 1)) !== 0 || q > 64) return 'Choose how many qualify — 2, 4, 8, 16, 32 or 64.'
    if (f.maxField !== null && q > f.maxField) return `No more can qualify than the biggest field, ${f.maxField}.`
    if (f.draw.seeding === 'handicap') return 'A qualifier’s draw goes by its finish, or at random.'
  }
  if (f.field === 'entries' && f.draw.seeding === 'qualifier') return 'Only a qualifier’s draw goes by its finish.'

  if (f.draw.when === 'date') {
    const at = drawAt(f)
    if (!at) return 'Choose when the draw is made — a day and a time.'
    const closing = closesAt(f)
    if (closing && at.getTime() < closing.getTime()) return 'The draw cannot be made before entries close.'
    if (at.getTime() <= now.getTime()) return 'The draw must be in the future.'
  }

  // The deadlines: a field's own rounds, or with no limit as many as the club sets from the Final back (D264).
  const n = f.deadlines.length
  if (f.maxField !== null) {
    if (n !== roundsFor(f.maxField)) return `Set a play-by date for each of the ${roundsFor(f.maxField)} rounds.`
  } else if (n < 1 || n > MAX_MATCH_ROUNDS) {
    return `Set the Final’s play-by date, and up to ${MAX_MATCH_ROUNDS - 1} rounds before it.`
  }
  const names = matchRoundNames(n)
  const from = firstPlayDay(f, today)
  for (let i = 0; i < n; i++) {
    if (!validDeadline(f.deadlines[i])) return `Choose the ${names[i]}’s play-by date.`
    if (f.deadlines[i] < from) return `The ${names[i]} cannot be due before the draw.`
    if (i > 0 && f.deadlines[i] < f.deadlines[i - 1]) return `The ${names[i]} cannot be due before the ${names[i - 1]}.`
  }
  return null
}

// ─── What it is stored as ──────────────────────────────────────

/** The club's own answers, in `bracket_setup.club`. */
export interface ClubMatchPlaySetup {
  format: MatchPlayFormat
  field: MatchPlayField
  closes: { date: string; time: string } | null
  qualify: number | null
  maxField: number | null
  drawWhen: MatchPlayDrawWhen
  seeding: MatchPlaySeeding
  venue: MatchPlayVenue
  tie: MatchPlayTie
  handicap: MatchPlayHandicap
}

/** The draw's own board — a pairs draw on a sheet of its own, the allowance kept only when it is not the full one. */
export function matchPlayBoard(f: Pick<MatchPlayForm, 'format' | 'allowance'>): Leaderboard {
  const pairs = f.format !== 'singles'
  return {
    id: 'lb-matchplay',
    audience: pairs ? 'team' : 'individual',
    competition: 'matchplay',
    ...(pairs ? { teamSet: 'set-2' } : {}),
    ...(f.allowance !== 100 ? { handicapAllowance: f.allowance } : {}),
  }
}

/**
 * What the field may do for itself: the players of a match score its card
 * and the club's Officers anything (`score_matches` off — not anybody with
 * the code), nobody changes their own handicap (D179: the account's).
 */
export function matchPlayPermissions(): EventPermissions {
  return { ...defaultPermissions(), edit_handicaps: false, score_matches: false, add_players: false, edit_scores: false }
}

/**
 * The draw plan the platform's draw job reads (lib/bracketDraw.ts): made
 * when entries close or on its date, seeded at random or by handicap. A
 * qualifier's draw, and one made by hand, waits (`later`) — the first for
 * the qualifier's certified results (stage 5), the second for the Officers.
 */
export function matchPlayDrawPlan(f: MatchPlayForm): DrawPlan {
  const seeding = f.draw.seeding === 'handicap' ? 'handicap' as const : 'random' as const
  if (f.draw.when === 'date' && f.draw.date && f.draw.time) return { when: 'date', on: f.draw.date, at: f.draw.time, seeding }
  if (f.draw.when === 'auto' && f.field === 'entries' && f.closes) return { when: 'date', on: f.closes.date, at: f.closes.time, seeding }
  return { when: 'later' }
}

/** `trips.bracket_setup` for a new club match play: the knockout's own keys, and the club's answers. */
export function matchPlaySeed(f: MatchPlayForm): Record<string, unknown> {
  const club: ClubMatchPlaySetup = {
    format: f.format, field: f.field,
    closes: f.field === 'entries' ? f.closes : null,
    qualify: f.field === 'qualifier' ? f.qualifier?.qualify ?? null : null,
    maxField: f.maxField, drawWhen: f.draw.when, seeding: f.draw.seeding,
    venue: f.venue, tie: f.tie, handicap: f.handicap,
  }
  return {
    format: 'match_play',
    schedule: 'continuous',
    mode: 'relaxed',
    entry: f.field === 'entries' ? 'self_join' : 'organiser',
    ...(f.field === 'qualifier' && f.qualifier
      ? { qualifying: { eventCode: f.qualifier.code, seeding: f.draw.seeding === 'qualifier' ? 'seeded' : 'random' } } : {}),
    draw: matchPlayDrawPlan(f),
    deadlines: [...f.deadlines],
    club,
  }
}

/** The days the event spans: from the day it is made to the Final's play-by date. */
export function matchPlayDates(f: Pick<MatchPlayForm, 'deadlines'>, today: string): { start: string; end: string } {
  const last = f.deadlines[f.deadlines.length - 1] ?? today
  return { start: today, end: last < today ? today : last }
}

/** A club match play as stored, read back — null for anything else. */
export interface ClubMatchPlay extends ClubMatchPlaySetup {
  qualifierCode: string | null
  /** The draw's day and time, when it is set to one. */
  drawOn: { date: string; time: string | null } | null
  deadlines: string[]
}

export function readClubMatchPlay(raw: unknown): ClubMatchPlay | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.format !== 'match_play' || !r.club || typeof r.club !== 'object' || Array.isArray(r.club)) return null
  const c = r.club as Record<string, unknown>
  const closes = c.closes && typeof c.closes === 'object' ? c.closes as Record<string, unknown> : null
  const q = r.qualifying && typeof r.qualifying === 'object' ? r.qualifying as Record<string, unknown> : null
  const draw = r.draw && typeof r.draw === 'object' ? r.draw as Record<string, unknown> : null
  const cap = Number(c.maxField)
  const qualify = Number(c.qualify)
  return {
    format: pick(c.format, ['singles', 'fourball', 'foursomes'] as const, 'singles'),
    field: pick(c.field, ['entries', 'qualifier'] as const, 'entries'),
    closes: closes && typeof closes.date === 'string' && DATE.test(closes.date) && typeof closes.time === 'string' && TIME.test(closes.time)
      ? { date: closes.date, time: closes.time } : null,
    qualify: Number.isInteger(qualify) && qualify > 1 ? qualify : null,
    maxField: (FIELD_CAPS as readonly number[]).includes(cap) ? cap : null,
    drawWhen: pick(c.drawWhen, ['auto', 'date', 'manual'] as const, 'auto'),
    seeding: pick(c.seeding, ['random', 'handicap', 'qualifier'] as const, 'random'),
    venue: pick(c.venue, ['home', 'any'] as const, 'home'),
    tie: pick(c.tie, ['extra', 'replay'] as const, 'extra'),
    handicap: pick(c.handicap, ['on_day', 'at_draw'] as const, 'on_day'),
    qualifierCode: q && typeof q.eventCode === 'string' && validEventCode(q.eventCode) ? q.eventCode : null,
    drawOn: draw && draw.when === 'date' && typeof draw.on === 'string' && DATE.test(draw.on)
      ? { date: draw.on, time: typeof draw.at === 'string' && TIME.test(draw.at) ? draw.at : null } : null,
    deadlines: Array.isArray(r.deadlines) ? r.deadlines.filter((d): d is string => validDeadline(d)) : [],
  }
}

/** The days worth a mark on the club's calendar: entries closing, the draw, and each round's play-by date. */
export function matchPlayKeyDates(m: ClubMatchPlay): string[] {
  return [...new Set([m.closes?.date, m.drawOn?.date, ...m.deadlines].filter((d): d is string => !!d))].sort()
}

// ─── Where it stands ───────────────────────────────────────────

/** Where it stands — the platform's competition phases (lib/compPhase.ts), so every list says it one way. */
export type MatchPlayPhase = Extract<CompPhase, 'entries' | 'draw_pending' | 'qualifier' | 'in_play' | 'finished'>

/** The facts it is read from: the setup, whether a draw exists, and whether it has a winner. */
export function matchPlayPhase(m: ClubMatchPlay, facts: { drawn: boolean; won: boolean }, now: Date): MatchPlayPhase {
  if (facts.won) return 'finished'
  if (facts.drawn) return 'in_play'
  if (m.field === 'qualifier') return 'qualifier'
  const at = m.closes ? irishInstant(m.closes.date, m.closes.time) : null
  return at && now.getTime() < at.getTime() ? 'entries' : 'draw_pending'
}

/** "The top 16 from the Spring Medal". */
function qualifierLine(m: Pick<ClubMatchPlay, 'qualify'>, name: string | null | undefined): string {
  return `The top ${m.qualify ?? 'players'} from ${name ?? 'the qualifier'}`
}

const dayOf = (d: string) => clubEventDates(d, d)
const whenOf = (date: string, time: string | null) => `${dayOf(date)}${time ? `, ${describeTime(time)}` : ''}`

/** The phase's one line — "Entries close Fri 5 Jun, 8:00 pm". */
export function matchPlayLine(m: ClubMatchPlay, phase: MatchPlayPhase, opts: { qualifierName?: string | null } = {}): string {
  switch (phase) {
    case 'entries': return m.closes ? `Entries close ${whenOf(m.closes.date, m.closes.time)}` : 'Entries are open'
    case 'draw_pending':
      return m.drawWhen === 'manual' ? 'The club makes the draw'
        : m.drawOn ? `The draw is made ${whenOf(m.drawOn.date, m.drawOn.time)}` : 'The draw is to come'
    case 'qualifier': return qualifierLine(m, opts.qualifierName)
    case 'in_play': return 'The draw is made'
    case 'finished': return 'Finished'
  }
}

/** The rules as the members read them (P7): a label and a value a line, then the play-by dates. */
export function matchPlayRules(m: ClubMatchPlay, opts: { allowance: number; qualifierName?: string | null; entryLine?: string | null }): {
  lines: { label: string; value: string }[]
  deadlines: { round: string; date: string }[]
} {
  const fmt = MATCH_PLAY_FORMATS.find(f => f.key === m.format)!
  const allowance = m.format === 'foursomes' ? `${opts.allowance}% of the pair’s combined handicap` : `${opts.allowance}% handicap`
  const lines: { label: string; value: string }[] = [
    { label: 'Format', value: `${fmt.label} match play · ${allowance}` },
    {
      label: 'The field',
      value: m.field === 'qualifier'
        ? qualifierLine(m, opts.qualifierName)
        : `Members enter${m.maxField ? ` · up to ${m.maxField}${m.format === 'singles' ? '' : ' pairs'}` : ''}`,
    },
  ]
  if (opts.entryLine) lines.push({ label: 'Who may enter', value: opts.entryLine })
  if (m.field === 'entries' && m.closes) lines.push({ label: 'Entries close', value: whenOf(m.closes.date, m.closes.time) })
  const seeding = m.seeding === 'handicap' ? 'seeded by handicap index' : m.seeding === 'qualifier' ? 'seeded by the qualifier’s finish' : 'drawn at random'
  lines.push({
    label: 'The draw',
    value: m.drawWhen === 'manual' ? 'Made by the club'
      : m.drawOn ? `${whenOf(m.drawOn.date, m.drawOn.time)} · ${seeding}`
      : m.field === 'qualifier' ? `When the qualifier’s results are certified · ${seeding}` : `When entries close · ${seeding}`,
  })
  lines.push({ label: 'Where', value: m.venue === 'home' ? 'The home course' : 'Any course the players agree' })
  lines.push({ label: 'Level after 18', value: m.tie === 'extra' ? 'Down the 19th until a hole is won' : 'Halved — replayed' })
  lines.push({ label: 'Handicap', value: m.handicap === 'on_day' ? 'Your index on the day you play' : 'Your index when the draw is made' })
  const names = matchRoundNames(m.deadlines.length)
  return { lines, deadlines: m.deadlines.map((d, i) => ({ round: names[i], date: dayOf(d) })) }
}

// ─── Entering (stage 2; Ross, 17 Nov 2026) ─────────────────────

/** Entering opens for singles now; a pair enters together in stage 4. */
export const PAIRS_ENTRY_LATER = 'Entering with a partner opens soon — ask the club in the meantime.'

/** Whether entries are past their closing time. */
export function entriesClosed(m: Pick<ClubMatchPlay, 'closes'>, now: Date): boolean {
  const at = m.closes ? irishInstant(m.closes.date, m.closes.time) : null
  return !!at && now.getTime() >= at.getTime()
}

/** The day a member's entry is judged on (age, a membership's days): the day entries close. */
export function entryDay(m: Pick<ClubMatchPlay, 'closes'>, today: string): string {
  return m.closes?.date ?? today
}

/**
 * Why nobody more can enter now, or null. Officers (`admin`) may still put
 * somebody in after the close, until the draw — never past the field's cap.
 */
export function enterIssue(m: ClubMatchPlay, o: { now: Date; drawn: boolean; entered: number; admin: boolean }): string | null {
  if (m.field === 'qualifier') return 'The field comes from the qualifier — nobody enters.'
  if (o.drawn) return 'The draw is made, so entries are closed.'
  if (m.format !== 'singles') return PAIRS_ENTRY_LATER
  if (entriesClosed(m, o.now) && !o.admin) return 'Entries have closed.'
  if (m.maxField !== null && o.entered >= m.maxField) return `Entries are full — ${m.maxField} of ${m.maxField}.`
  return null
}

/** Why this entry cannot be taken out now, or null: your own until entries close, anybody's by an Officer until the draw. */
export function withdrawEntryIssue(m: ClubMatchPlay, o: { now: Date; drawn: boolean; mine: boolean; admin: boolean }): string | null {
  if (o.drawn) return 'The draw is made — a player who can’t play now gives a walkover.'
  if (!o.mine && !o.admin) return 'You can only take yourself out.'
  if (entriesClosed(m, o.now) && !o.admin) return 'Entries have closed — ask the club to take you out.'
  return null
}

/**
 * Who stays in when two members took the last place together: the field
 * in the order it entered, the first `cap` kept. An entry beyond them is
 * taken back.
 */
export function overCap(entrants: readonly { id: string }[], cap: number | null): string[] {
  return cap === null ? [] : entrants.slice(cap).map(e => e.id)
}

/**
 * Whether the draw is due to be made now: waiting for it, made
 * automatically, and its moment — the day and time set, else entries
 * closing — come. The platform's draw job makes it once (`makeDueDraw`).
 */
export function drawDueNow(m: ClubMatchPlay, phase: MatchPlayPhase, now: Date): boolean {
  if (phase !== 'draw_pending' || m.drawWhen === 'manual' || m.field !== 'entries') return false
  const at = m.drawOn ? irishInstant(m.drawOn.date, m.drawOn.time ?? '00:00') : m.closes ? irishInstant(m.closes.date, m.closes.time) : null
  return !!at && now.getTime() >= at.getTime()
}

// ─── The draw in play (stage 3; Ross, 17 Nov 2026) ─────────────

/** A drawn round as the club area reads it — its name, play-by date, and whether every match in it is decided. */
export interface DrawnRound { roundName: string; deadline: string | null; played: number; total: number }

/** "Quarter-Final · play by Wed 31 Mar" — the round in play, for the Summary's line; "Every match played" once done. */
export function roundInPlayLine(rounds: readonly DrawnRound[], today: string): string {
  const now = rounds.find(r => r.played < r.total)
  if (!now) return rounds.length ? 'Every match played' : 'The draw is made'
  if (!now.deadline) return now.roundName
  return `${now.roundName} · ${now.deadline < today ? 'was due' : 'play by'} ${clubEventDates(now.deadline, now.deadline)}`
}

/** One match past its round's play-by date with no result — the Officers' to decide (D271). */
export interface OverdueMatch {
  id: string
  roundNumber: number
  roundName: string
  deadline: string
  /** Whole days since the play-by date. */
  daysOver: number
  sideA: string
  sideB: string
}

const dayNumber = (d: string) => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000)

/**
 * The matches past their play-by date with no result: both sides known
 * (a match still waiting on the one before is not overdue — that one is),
 * no bye, the deadline before today. Most overdue first.
 */
export function overdueMatches(
  rounds: readonly { roundNumber: number; roundName: string; deadline: string | null; matches: readonly { id: string; sideA: string | null; sideB: string | null; aIsBye: boolean; bIsBye: boolean; winner: string | null }[] }[],
  names: Readonly<Record<string, string>>,
  today: string,
): OverdueMatch[] {
  const out: OverdueMatch[] = []
  for (const r of rounds) {
    if (!r.deadline || r.deadline >= today) continue
    for (const m of r.matches) {
      if (m.winner || m.aIsBye || m.bIsBye || !m.sideA || !m.sideB) continue
      out.push({
        id: m.id, roundNumber: r.roundNumber, roundName: r.roundName, deadline: r.deadline,
        daysOver: dayNumber(today) - dayNumber(r.deadline),
        sideA: names[m.sideA] ?? 'A player', sideB: names[m.sideB] ?? 'A player',
      })
    }
  }
  return out.sort((a, b) => b.daysOver - a.daysOver || a.roundNumber - b.roundNumber)
}

/** The filters on the office's overdue list (D271): a round, and how far past its date. */
export function filterOverdue(list: readonly OverdueMatch[], f: { round: number | null; minDays: number }): OverdueMatch[] {
  return list.filter(m => (f.round === null || m.roundNumber === f.round) && m.daysOver >= f.minDays)
}

/** A member's place in one club match play, for Comps' Matches and Home (stage 3; D266). */
export interface MyClubMatch {
  code: string
  name: string
  /** The match to open — the next one, else the last played. */
  matchId: string
  roundName: string
  /** The opponent's name, or null while the match before decides it. */
  opponent: string | null
  playBy: string | null
  state: 'next' | 'won' | 'out'
  result: string | null
}

/**
 * Where this player stands in one draw: their next match (the earliest with
 * no result), else the last one — the Final won, or the match that put them
 * out. Null when they are in no match of it.
 */
export function myClubMatch(
  comp: { code: string; name: string },
  matches: readonly { id: string; roundNumber: number; roundName: string; sideA: string | null; sideB: string | null; winner: string | null; result: string | null; deadline: string | null }[],
  me: string,
  names: Readonly<Record<string, string>>,
): MyClubMatch | null {
  const mine = matches.filter(m => m.sideA === me || m.sideB === me).sort((a, b) => a.roundNumber - b.roundNumber)
  if (!mine.length) return null
  const next = mine.find(m => !m.winner)
  const m = next ?? mine[mine.length - 1]
  const them = m.sideA === me ? m.sideB : m.sideA
  return {
    code: comp.code, name: comp.name, matchId: m.id, roundName: m.roundName,
    opponent: them ? names[them] ?? 'A player' : null, playBy: m.deadline,
    state: next ? 'next' : m.winner === me ? 'won' : 'out', result: next ? null : m.result,
  }
}
