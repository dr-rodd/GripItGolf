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

export type LeagueSetup = {
  format: 'league'
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
 * Why a league cannot run this many days, or null when it can. One round a
 * day is what a league day is, so the ceiling is the platform's round
 * ceiling — the same number, not a second copy of it.
 */
export function leagueDaysIssue(days: number): string | null {
  if (!Number.isInteger(days) || days < 1) {
    return 'An event needs at least one day.'
  }
  if (days > MAX_ROUNDS) {
    return `An event can run at most ${MAX_ROUNDS} days — bring the dates in to continue.`
  }
  return null
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

  return {
    format: 'league',
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
export function describeLeagueSetup(setup: LeagueSetup, days: number): string {
  const parts = ['League', days === 1 ? 'one day' : `${days} days`]
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
