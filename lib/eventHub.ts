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

// ─── The bar's fourth tab ──────────────────────────────────────
//
// An event's bar is Home · Scoring · Leaderboard (or Bracket) · [one more]
// · Settings — Home always bottom left, Settings always bottom right
// (Ross, 26 Oct 2026). The one more is Tee times while any round starts
// from a tee sheet, else Stats while the event records them, else nothing
// and the bar is four. Both on, Tee times takes the tab and Stats goes
// back to the home screen as a module.

export type FourthTab = 'teeTimes' | 'stats'

export function eventFourthTab({ teeTimes, stats }: {
  /** `teeSheetInUse` over the rounds. */
  teeTimes: boolean
  /** `trips.track_stats`. */
  stats: boolean
}): FourthTab | null {
  return teeTimes ? 'teeTimes' : stats ? 'stats' : null
}

// ─── The home screen's modules ─────────────────────────────────
//
// Four things on an event's home screen only exist some of the time: the
// organiser's notices, the tee times, the schedule and the stats. Each is a module,
// shown while it is active and simply absent while it is not — no heading
// with "nothing yet" under it, which is clutter a reader has to open to
// find empty (Ross, 26 Oct 2026).
//
// What switches each one on is a decision the organiser already makes:
//   notices    a notice is up
//   teeTimes   the round it speaks for has a live sheet — made in the
//              wizard, so a vacant one says nothing here. A tab as well
//              (Ross kept your time on the home screen too)
//   schedule   anything is on it — golf, a stay, travel or an activity —
//              and gone only while it is empty (Ross, 26 Oct 2026: a match
//              play event whose players pick the course on the day had a
//              Schedule heading with nothing under it). Self-evident, so
//              there is nothing for the organiser to switch
//   stats      the event records stats (`trips.track_stats`), a card has
//              recorded some, and the tee times hold the bar's fourth tab
//              (`eventFourthTab`) — otherwise stats are that tab instead
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

/** Whether any round starts from a tee sheet — what puts Tee times on the bar. */
export function teeSheetInUse(startFormats: readonly unknown[]): boolean {
  return startFormats.some(f => parseStartFormat(f) === 'tee_sheet')
}

/** The modules an event's home screen shows, in the order it shows them. */
export function activeHubModules({ noticeCount, teeSheet, schedule, stats }: {
  noticeCount: number
  /** `teeSheetInUse` over the rounds. */
  teeSheet: boolean
  /** Anything on the schedule at all — golf included. */
  schedule: boolean
  /** Stats switched on, something recorded to show, and no tab of their own. */
  stats: boolean
}): HubModule[] {
  const out: HubModule[] = []
  if (noticeCount > 0) out.push('notices')
  if (teeSheet) out.push('teeTimes')
  if (schedule) out.push('schedule')
  if (stats) out.push('stats')
  return out
}
