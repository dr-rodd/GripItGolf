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
    description: 'Every player against every other, hole by hole. Win 1pt, half 0.5.',
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
