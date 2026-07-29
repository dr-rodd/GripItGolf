// What a trip runs, and how each leaderboard is configured.
//
// Three top-level competitions, each with its own settings that only appear
// once it is switched on:
//
//   individual — one competition with up to three boards: Stableford,
//                Strokeplay and Custom points. Ticking none of them is the
//                same as switching Individual off.
//   matchplay  — a knockout draw, on its own route rather than a tab
//   teams      — team scoring, configured in lib/teamScoring.ts
//
// Stableford and Strokeplay used to be separate top-level formats. They are
// two views of the same individual competition, so they are now boards within
// it — which is also what makes room for Custom.

export type IndividualSettings = {
  stableford: boolean
  strokes: boolean
  custom: boolean
  /**
   * Points by finishing position each round, index 0 being the winner.
   * Empty means "work it out from the player count" — see lib/customPoints.ts.
   */
  customPoints: number[]
  /** How many of a player's worst rounds to drop. 0 keeps every card. */
  discardWorst: number
}

export type TripFormats = {
  individual: IndividualSettings
  matchplay: boolean
  teams: boolean
}

/** A board that appears as a tab on the leaderboard. */
export type BoardKey = 'stableford' | 'strokes' | 'custom' | 'teams'

export const BOARDS: { key: BoardKey; label: string; tabLabel: string }[] = [
  { key: 'stableford', label: 'Stableford',  tabLabel: 'Stableford' },
  { key: 'strokes',    label: 'Strokeplay',  tabLabel: 'Strokes' },
  { key: 'custom',     label: 'Custom points', tabLabel: 'Custom' },
  { key: 'teams',      label: 'Team Play',   tabLabel: 'Teams' },
]

export const DEFAULT_INDIVIDUAL: IndividualSettings = {
  stableford: true,
  strokes: false,
  custom: false,
  customPoints: [],
  discardWorst: 0,
}

export const DEFAULT_FORMATS: TripFormats = {
  individual: { ...DEFAULT_INDIVIDUAL },
  matchplay: false,
  teams: false,
}

const asBool = (v: unknown) => v === true
const asCount = (v: unknown, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0
}

/**
 * Read whatever is stored, including the older flat shape.
 *
 * Trips created before individual boards were grouped stored
 * `{ individual_stableford: true, teams: true }`. Those are still read
 * correctly here, so nothing has to be migrated before the app works.
 */
export function parseFormats(raw: unknown): TripFormats {
  if (!raw || typeof raw !== 'object') return structuredCloneFormats(DEFAULT_FORMATS)
  const r = raw as Record<string, unknown>

  // Older flat shape
  const legacy =
    'individual_stableford' in r || 'individual_strokes' in r || 'individual_matchplay' in r
  if (legacy) {
    return {
      individual: {
        ...DEFAULT_INDIVIDUAL,
        stableford: asBool(r.individual_stableford),
        strokes: asBool(r.individual_strokes),
      },
      matchplay: asBool(r.individual_matchplay),
      teams: asBool(r.teams),
    }
  }

  const ind = (r.individual ?? {}) as Record<string, unknown>
  const parsed: TripFormats = {
    individual: {
      stableford: asBool(ind.stableford),
      strokes: asBool(ind.strokes),
      custom: asBool(ind.custom),
      customPoints: Array.isArray(ind.customPoints)
        ? ind.customPoints.map(v => asCount(v, MAX_CUSTOM_POINTS))
        : [],
      discardWorst: asCount(ind.discardWorst, MAX_DISCARD),
    },
    matchplay: asBool(r.matchplay),
    teams: asBool(r.teams),
  }

  // A trip with nothing switched on has no leaderboard at all
  return hasAnything(parsed) ? parsed : structuredCloneFormats(DEFAULT_FORMATS)
}

export const MAX_CUSTOM_POINTS = 100
export const MAX_DISCARD = 2

function structuredCloneFormats(f: TripFormats): TripFormats {
  return { ...f, individual: { ...f.individual, customPoints: [...f.individual.customPoints] } }
}

function hasAnything(f: TripFormats): boolean {
  return individualOn(f) || f.matchplay || f.teams
}

/** Individual is on when at least one of its boards is. */
export function individualOn(f: TripFormats): boolean {
  // Defensive: every route parses before passing, but a missing `individual`
  // should read as "off" rather than take the settings page down.
  const i = f?.individual
  if (!i) return false
  return i.stableford || i.strokes || i.custom
}

/** Boards that render as a tab, in display order. */
export function leaderboardTabs(f: TripFormats) {
  return BOARDS.filter(b => {
    if (b.key === 'teams') return f?.teams === true
    return f?.individual?.[b.key] === true
  })
}

/** Everything switched on, including matchplay — used for the trip hub line. */
export function enabledSummary(f: TripFormats): string[] {
  const parts: string[] = []
  if (f.individual.stableford) parts.push('Stableford')
  if (f.individual.strokes)    parts.push('Strokes')
  if (f.individual.custom)     parts.push('Custom')
  if (f.matchplay)             parts.push('Matchplay')
  if (f.teams)                 parts.push('Teams')
  return parts
}

/** Nothing at all is switched on — the setup screen refuses to save this. */
export function isEmpty(f: TripFormats): boolean {
  return !hasAnything(f)
}
