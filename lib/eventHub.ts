// The Event Hub's own rules — the only copy.
//
// A tournament's hub is the Event Hub: the same screen as a trip's, wearing
// event details. This file holds the small set of rules that make it one —
// what counts as an event, what a notice may be, and how a round's start is
// described — so the hub, the organiser screen and the tests all read the
// same answers.
//
// Everything here is pure. The reads and writes live with the screens.

import { normalizeDescription } from './tripLimits'
import { describeTime } from './itinerary'

/**
 * Whether a trip row is an event.
 *
 * Read off `trips.kind`, added in migration 046 — and read fail-soft on
 * purpose: a database that has not run the migration has no column, the
 * value comes back undefined, and undefined is simply not 'tournament'. The
 * hub then renders the trip it always rendered.
 */
export function isEvent(kind: unknown): boolean {
  return kind === 'tournament'
}

// ─── Notices ───────────────────────────────────────────────────
//
// An organiser's line to the field — "Carts on the path today", "Prizegiving
// at six". Short on purpose: a notice is read standing on a tee, and
// anything longer belongs in the event description.

export const MAX_NOTICE = 280

/**
 * A notice, cleaned the way the trip description is cleaned — trimmed,
 * Windows newlines folded, runs of blank lines collapsed — then held to the
 * notice's own, shorter cap. The folding rules stay one copy, in
 * lib/tripLimits.ts; only the cap is this file's.
 */
export function normalizeNotice(text: string | null | undefined): string | null {
  const folded = normalizeDescription(text)
  if (!folded) return null
  return folded.length > MAX_NOTICE ? folded.slice(0, MAX_NOTICE) : folded
}

// ─── Start formats ─────────────────────────────────────────────
//
// How the field gets going. A shotgun start is one moment for everybody —
// the time itself lives on the round's itinerary item, which is where the
// countdown and the weather already read it, so choosing shotgun adds no
// second copy of the time. A tee sheet is groups and times, and the sheet
// itself is functionality still to come; the choice is stored now so the
// schedule can say which kind of morning it is.

export type StartFormat = 'shotgun' | 'tee_sheet'

export const START_FORMATS: StartFormat[] = ['shotgun', 'tee_sheet']

export const START_FORMAT_LABEL: Record<StartFormat, string> = {
  shotgun: 'Shotgun start',
  tee_sheet: 'Tee sheet',
}

/** The stored value, or null for anything that is not one. */
export function parseStartFormat(value: unknown): StartFormat | null {
  return value === 'shotgun' || value === 'tee_sheet' ? value : null
}

/**
 * The schedule line for a round whose start format is chosen —
 * "Shotgun start 9:30 am", or "Tee sheet" until the sheet exists. Null when
 * no format is chosen, so the golf tile keeps its ordinary tee-time wording
 * and nothing on a plain trip changes. The clock goes through
 * `describeTime`, the same formatter every other time on the schedule uses.
 */
export function describeStart(
  format: StartFormat | null | undefined,
  teeTime: string | null | undefined,
): string | null {
  if (!format) return null
  if (format === 'shotgun') {
    const time = describeTime(teeTime)
    return time ? `Shotgun start ${time}` : 'Shotgun start'
  }
  return 'Tee sheet'
}

// ─── The home screen's modules ─────────────────────────────────
//
// Four things on an event's home screen only exist some of the time: the
// organiser's notices, the tee times, the schedule and the stats. Each is a module,
// shown while it is active and simply absent while it is not — no heading
// with "nothing yet" under it, which is clutter a reader has to open to
// find empty (Ross, 26 Oct 2026). They used to be tabs, or a section that
// was always there; the bar is Home, Scoring, Leaderboard and Settings now.
//
// What switches each one on is a decision the organiser already makes:
//   notices    a notice is up
//   teeTimes   a round starts from a tee sheet (the Starts card)
//   schedule   the organiser has put something on it beyond the golf — an
//              activity, travel or a stay (Ross, 26 Oct 2026). The rounds
//              alone are no schedule anybody wrote: creation makes them,
//              and the Scoring tab and the Up next card already carry them
//   stats      the event records stats (`trips.track_stats`) and a card
//              has recorded some — the organiser area's Home screen card
//              is where the event adds it
//
// The order is the screen's: notices first, they are the news; then the
// tee times and the schedule; stats at the foot, after the field.
//
// A trip is none of this: its itinerary is the lead player's own and always
// shows, and it has no notices or tee sheet. Only stats reach a trip's hub
// through here, on the gate they always had.

export type HubModule = 'notices' | 'teeTimes' | 'schedule' | 'stats'

export const HUB_MODULE_LABEL: Record<HubModule, string> = {
  notices: 'Notices',
  teeTimes: 'Tee times',
  schedule: 'Schedule',
  stats: 'Stats',
}

/**
 * Whether the organiser has written a schedule: anything on the itinerary
 * that is not golf. Golf items are the rounds, which creation makes.
 */
export function organiserSchedule(kinds: readonly unknown[]): boolean {
  return kinds.some(k => k === 'activity' || k === 'travel' || k === 'stay')
}

/** Whether any round starts from a tee sheet — what puts Tee times on the home screen. */
export function teeSheetInUse(startFormats: readonly unknown[]): boolean {
  return startFormats.some(f => parseStartFormat(f) === 'tee_sheet')
}

/** The modules an event's home screen shows, in the order it shows them. */
export function activeHubModules({ noticeCount, teeSheet, schedule, stats }: {
  noticeCount: number
  /** `teeSheetInUse` over the rounds. */
  teeSheet: boolean
  /** `organiserSchedule` over the itinerary's kinds. */
  schedule: boolean
  /** Stats switched on, and something recorded to show. */
  stats: boolean
}): HubModule[] {
  const out: HubModule[] = []
  if (noticeCount > 0) out.push('notices')
  if (teeSheet) out.push('teeTimes')
  if (schedule) out.push('schedule')
  if (stats) out.push('stats')
  return out
}
