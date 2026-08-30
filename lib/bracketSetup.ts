// A tournament's bracket setup — the only copy of the rules.
//
// The organiser's seven answers, taken in order on the bracket setup form
// behind the organiser PIN: the format, how matches come about (strict or
// relaxed), the field's ceiling, how players get in, whether a qualifying
// event seeds the draw, when each bracket round must be finished, and
// whether the structure is locked now or left open to joiners.
//
// Stored whole in `trips.bracket_setup` (migration 047) — jsonb, one object,
// written only when every question is answered. The form holds half-finished
// drafts in its own state; the database never sees one, which is the same
// discipline lib/leaderboards.ts keeps: the code downstream is handed
// complete rules or nothing, never an object it has to guess at.
//
// Two things this file deliberately is not. It is not the draw: generating
// matches, pairing players and linking courses stay with lib/matchplay.ts
// and the matchplay board — this is the setup those will read. And league is
// not built: the format field anticipates it so the storage shape will not
// change when it arrives, but the parser refuses to return one, because a
// setup nothing can score is a setup nothing should trust.
//
// Pure. No I/O.

import { roundName } from './matchplay'

// ─── Format ────────────────────────────────────────────────────

export type TournamentFormat = 'match_play' | 'league'

export const TOURNAMENT_FORMATS: {
  key: TournamentFormat; label: string; hint: string; built: boolean
}[] = [
  { key: 'match_play', label: 'Match play', built: true,
    hint: 'A knockout bracket — win and go through, lose and go home.' },
  // `built` here means "buildable from the bracket form". A league exists
  // now, but it is created whole through its own door — Create an Event →
  // Golf Tournament → League (lib/leagueSetup.ts) — never assembled here,
  // where a save would turn an existing event into a knockout.
  { key: 'league', label: 'League', built: false,
    hint: 'A table over the days — created as its own event, not set up here.' },
]

// ─── Mode ──────────────────────────────────────────────────────
//
// Who decides how a match comes about. Strict: the organiser pre-determines
// everything — who plays whom each round, and which course a round is played
// on — and the field's job is to turn up and enter the result. Relaxed: the
// players self-organise — they arrange their own matches, pick their own
// course, enter their own scores and link the card to their bracket match
// themselves. The choice is stored now; the strict-mode pairing and
// course-linking screens are built on top of it, the way `tee_sheet` was
// stored before the sheet existed.

export type BracketMode = 'strict' | 'relaxed'

export const BRACKET_MODES: { key: BracketMode; label: string; hint: string }[] = [
  { key: 'strict', label: 'Strict', hint:
    'You set who plays whom each round, and where. Players just turn up and enter the result.' },
  { key: 'relaxed', label: 'Relaxed', hint:
    'Players arrange their own matches, pick their own course, and link their card to the bracket themselves.' },
]

// ─── Size ──────────────────────────────────────────────────────
//
// The ceiling, not a head count. A field that falls short of it is seated
// with byes when the draw is made, exactly as lib/matchplay.ts already
// seats one — the setup only fixes how tall the bracket is, which is what
// the deadlines below are counted against.

export const BRACKET_SIZES = [16, 32, 64, 128] as const
export type BracketSize = (typeof BRACKET_SIZES)[number]

export function parseBracketSize(value: unknown): BracketSize | null {
  return (BRACKET_SIZES as readonly number[]).includes(Number(value))
    ? Number(value) as BracketSize
    : null
}

/** How many bracket rounds a draw of this size runs. */
export function roundsFor(size: BracketSize): number {
  return Math.log2(size)
}

/** Round names in playing order — "Round of 32" … "Final". */
export function bracketRoundNames(size: BracketSize): string[] {
  return Array.from({ length: roundsFor(size) }, (_, i) => roundName(size / 2 ** i))
}

/** "Up to 32 players — 5 rounds to the Final." */
export function describeSize(size: BracketSize): string {
  return `Up to ${size} players — ${roundsFor(size)} rounds to the Final.`
}

// ─── Player entry ──────────────────────────────────────────────
//
// How the field is assembled — never who plays whom. In strict mode players
// can still join themselves off the link; the pairings stay the
// organiser's either way, because entry is a roster question and the draw
// is not.

export type PlayerEntry = 'organiser' | 'self_join'

export const PLAYER_ENTRIES: { key: PlayerEntry; label: string; hint: string }[] = [
  { key: 'organiser', label: 'I add the field', hint:
    'You enter every player yourself, up front.' },
  { key: 'self_join', label: 'Players join themselves', hint:
    'Share the event link or QR code and the field builds itself.' },
]

// ─── Qualifying ────────────────────────────────────────────────
//
// A standalone event on the platform whose standings feed the seeding.
// Named by its own six-character code — a reference, never a copy, so the
// qualifier's board stays the one source of who finished where. `seeding`
// says what the standings are then worth: the top finishers drawn at
// random, or fully seeded — first plays last, standard seeding, which is
// lib/matchplay.ts's `seedOrder`.

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

/**
 * A typed code, held to the shape every trip code has — six alphanumerics,
 * upper-cased the way `/join` upper-cases. Whether it names a real event is
 * a lookup, and lookups belong to the form, not here.
 */
export function normalizeEventCode(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, '').toUpperCase()
}

export function validEventCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code)
}

// ─── Deadlines ─────────────────────────────────────────────────
//
// One date per bracket round — the day that round's matches must be
// finished by. Both modes have them: strict fixes the fixtures and relaxed
// does not, but a knockout in either needs the field moving at the same
// pace or the Final waits on a straggler. Dates only, no times, and they
// may repeat — two rounds settled over one weekend share a day — but they
// can never run backwards.

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

export function validDeadline(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_SHAPE.test(value)) return false
  const t = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(value)
}

/**
 * What is wrong with these deadlines for a bracket this size, or null when
 * nothing is. Said in the round's own name, because "deadline 3" points at
 * nothing on the form.
 */
export function deadlinesIssue(
  deadlines: readonly (string | null | undefined)[], size: BracketSize,
): string | null {
  const names = bracketRoundNames(size)
  for (let i = 0; i < names.length; i++) {
    if (!validDeadline(deadlines[i])) {
      return `The ${names[i]} needs a deadline.`
    }
  }
  for (let i = 1; i < names.length; i++) {
    if ((deadlines[i] as string) < (deadlines[i - 1] as string)) {
      return `The ${names[i]} cannot close before the ${names[i - 1]}.`
    }
  }
  return null
}

// ─── The setup itself ──────────────────────────────────────────

export type BracketSetup = {
  format: TournamentFormat
  /**
   * A continuous knockout — an ongoing event occupying a period (the trip's
   * start and finish dates), its rounds paced by the deadlines rather than
   * fixed days of golf. Absent means standalone: the event happens at a
   * single point in time, with its golf on the schedule. Written at
   * creation by the continuous knockout's own door and carried through
   * every save of this form, the keep-the-no-op-off rule as ever.
   */
  schedule?: 'continuous'
  mode: BracketMode
  size: BracketSize
  entry: PlayerEntry
  /** Absent means no qualifying event — the draw is among whoever enters. */
  qualifying?: Qualifying
  /** One date per bracket round, first round first — `roundsFor(size)` long. */
  deadlines: string[]
  /**
   * Locked, or still open to joiners. Finalising fixes the format and the
   * bracket structure; until then the organiser can come back and change
   * any answer, and the field can keep growing.
   */
  finalized: boolean
}

/**
 * The questions still unanswered, in the order the form asks them.
 *
 * The setup cannot be saved until this is empty — same rule, same shape as
 * lib/leaderboards.ts `unanswered`. Finalisation is not in the list: it has
 * no unanswered state, because "leave it open" is itself the answer.
 */
export function unansweredSetup(draft: Partial<BracketSetup>): string[] {
  if (!draft.format) return ['League or match play']
  // League stops the form at step one — a league is created whole through
  // its own door, and everything below is match play's. Listing the
  // knockout's questions against a league would promise a way forward that
  // does not exist on this form.
  if (draft.format === 'league') return ['A league is created as its own event']

  const missing: string[] = []
  if (!draft.mode) missing.push('Strict or relaxed')
  if (!draft.size) missing.push('How big the bracket is')
  if (!draft.entry) missing.push('How players get in')
  if (draft.qualifying && !validEventCode(draft.qualifying.eventCode)) {
    missing.push('The qualifying event\'s code')
  }
  if (draft.size && deadlinesIssue(draft.deadlines ?? [], draft.size)) {
    missing.push('A deadline for every round')
  }
  return missing
}

export function isCompleteSetup(draft: Partial<BracketSetup>): draft is BracketSetup {
  return typeof draft.finalized === 'boolean' && unansweredSetup(draft).length === 0
}

// ─── Storage ───────────────────────────────────────────────────

/**
 * Read whatever `trips.bracket_setup` holds. A complete match-play setup
 * comes back whole; anything else — null, an un-migrated column, a stored
 * league setup, deadlines that no longer fit the size — comes back null,
 * and the form starts from the top rather than trusting half an answer.
 * Same posture as `parseLeaderboards`: dropped, never repaired.
 */
export function parseBracketSetup(raw: unknown): BracketSetup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  if (r.format !== 'match_play') return null
  const mode = BRACKET_MODES.find(m => m.key === r.mode)?.key
  const size = parseBracketSize(r.size)
  const entry = PLAYER_ENTRIES.find(e => e.key === r.entry)?.key
  if (!mode || !size || !entry) return null

  let qualifying: Qualifying | undefined
  if (r.qualifying && typeof r.qualifying === 'object' && !Array.isArray(r.qualifying)) {
    const q = r.qualifying as Record<string, unknown>
    const eventCode = normalizeEventCode(typeof q.eventCode === 'string' ? q.eventCode : '')
    const seeding = SEEDINGS.find(s => s.key === q.seeding)?.key
    if (!validEventCode(eventCode) || !seeding) return null
    qualifying = { eventCode, seeding }
  }

  const deadlines = Array.isArray(r.deadlines) ? r.deadlines : []
  if (deadlinesIssue(deadlines, size)) return null

  return {
    format: 'match_play',
    ...(r.schedule === 'continuous' ? { schedule: 'continuous' as const } : {}),
    mode, size, entry,
    // The key stays off the object entirely when there is no qualifier, the
    // way lib/leaderboards.ts keeps every no-op answer off — a setup saved
    // without one reads back byte-for-byte.
    ...(qualifying ? { qualifying } : {}),
    deadlines: deadlines.slice(0, roundsFor(size)) as string[],
    finalized: r.finalized === true,
  }
}

// ─── Naming ────────────────────────────────────────────────────

/**
 * The one line the organiser area says about a saved setup —
 * "Match play · relaxed · up to 32 · seeded off QX7K2P · open".
 */
export function describeSetup(setup: BracketSetup): string {
  const parts = [
    'Match play',
    ...(setup.schedule === 'continuous' ? ['continuous'] : []),
    setup.mode,
    `up to ${setup.size}`,
  ]
  if (setup.qualifying) {
    parts.push(setup.qualifying.seeding === 'seeded'
      ? `seeded off ${setup.qualifying.eventCode}`
      : `drawn from ${setup.qualifying.eventCode}`)
  }
  parts.push(setup.finalized ? 'finalised' : 'open')
  return parts.join(' · ')
}
