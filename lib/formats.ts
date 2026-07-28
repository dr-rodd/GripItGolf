// Competition formats a trip can run. Any combination can be enabled at
// once — each enabled format gets its own tab on the leaderboard.

export type FormatKey =
  | 'individual_stableford'
  | 'individual_strokes'
  | 'individual_matchplay'
  | 'teams'

export type TripFormats = Partial<Record<FormatKey, boolean>>

export const FORMATS: {
  key: FormatKey
  label: string
  tabLabel: string
  description: string
  needsTeams?: boolean
  /**
   * Formats with their own route are reached by a button on the leaderboard
   * rather than a tab, so their display code never loads with the board.
   */
  dedicatedPage?: boolean
}[] = [
  {
    key: 'individual_stableford',
    label: 'Individual Stableford',
    tabLabel: 'Stableford',
    description: 'Points per hole against your handicap. The classic society format.',
  },
  {
    key: 'individual_strokes',
    label: 'Individual Strokeplay',
    tabLabel: 'Strokes',
    description: 'Gross and nett totals. Lowest score wins.',
  },
  {
    key: 'individual_matchplay',
    label: 'Individual Matchplay',
    tabLabel: 'Matchplay',
    description: 'A knockout draw. Seeds are kept apart, byes handed out when the player count isn\'t a power of two.',
    dedicatedPage: true,
  },
  {
    key: 'teams',
    label: 'Team Play',
    tabLabel: 'Teams',
    description: 'Best 2 scores of each team count on every hole.',
    needsTeams: true,
  },
]

export const DEFAULT_FORMATS: TripFormats = { individual_stableford: true }

export function parseFormats(raw: unknown): TripFormats {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FORMATS }
  const parsed: TripFormats = {}
  for (const f of FORMATS) {
    if ((raw as Record<string, unknown>)[f.key] === true) parsed[f.key] = true
  }
  // A trip with nothing enabled has no leaderboard at all — fall back
  return Object.keys(parsed).length > 0 ? parsed : { ...DEFAULT_FORMATS }
}

export function enabledFormats(formats: TripFormats) {
  return FORMATS.filter(f => formats[f.key])
}

/** Enabled formats that render as a tab on the leaderboard itself. */
export function leaderboardTabs(formats: TripFormats) {
  return enabledFormats(formats).filter(f => !f.dedicatedPage)
}

export function isEnabled(formats: TripFormats, key: FormatKey) {
  return formats[key] === true
}
