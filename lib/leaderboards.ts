// What a trip is playing for.
//
// A trip runs one or more leaderboards. Each is a complete, self-contained
// competition: who is being ranked, what they are playing, and every rule
// needed to turn a scorecard into a position on that board.
//
// This replaces a model where everything was a flag on one object and any
// combination was expressible — including ones with no meaning, like a team
// format applied to an individual board. A leaderboard here is either fully
// answered or it does not exist, which is what lets the scoring module trust
// what it is handed.
//
// Pure. No I/O.

export type Audience = 'individual' | 'team'
export type Competition = 'league' | 'matchplay'

/** How an individual league turns a card into points. */
export type Scoring = 'stableford' | 'strokes' | 'custom'

/**
 * How a team's members combine into one score for a round.
 *
 * `aggregate` is not offered any more — better ball with every score counting
 * says the same thing — but trips already running it have to keep scoring the
 * way they always have, so it stays a format this model knows about.
 */
export type TeamFormat = 'better_ball' | 'hero' | 'cut_dead_weight' | 'aggregate'

/** How a team league adds its rounds together. */
export type Aggregation = 'cumulative' | 'custom_points'

export type Leaderboard = {
  id: string
  audience: Audience
  competition: Competition

  /** Individual league only. */
  scoring?: Scoring
  /** Stableford and Strokes only — Custom is a prize table by position. */
  discardWorst?: number

  /** Team league only. */
  teamFormat?: TeamFormat
  aggregation?: Aggregation

  /** Whichever of the two above asked for a prize table. */
  customPoints?: number[]
}

export const MAX_DISCARD = 2

export const SCORINGS: { key: Scoring; label: string; hint: string }[] = [
  { key: 'stableford', label: 'Stableford',
    hint: 'Points per hole against your handicap. Highest wins.' },
  { key: 'strokes', label: 'Strokes',
    hint: 'Gross and nett totals. Lowest wins.' },
  { key: 'custom', label: 'Custom points',
    hint: 'You decide what each finishing position is worth each round.' },
]

export const TEAM_FORMATS: { key: TeamFormat; label: string; hint: string }[] = [
  { key: 'better_ball', label: 'Better ball',
    hint: 'A composite card: the team\'s best Stableford score on every hole.' },
  { key: 'hero', label: 'Hero',
    hint: 'The best single card in the team that day carries it.' },
  { key: 'cut_dead_weight', label: 'Cut the dead weight',
    hint: 'Everyone counts except the worst card of the day. They are back in next round.' },
]

/**
 * Every format that can be read back, including the one no longer offered.
 *
 * Naming and parsing look here; the form offers `TEAM_FORMATS`. Keeping the
 * two lists apart is what lets a format be retired without the trips already
 * running it losing their board.
 */
export const ALL_TEAM_FORMATS: { key: TeamFormat; label: string; hint: string }[] = [
  ...TEAM_FORMATS,
  { key: 'aggregate', label: 'Aggregate',
    hint: 'Every score in the team counts.' },
]

export const AGGREGATIONS: { key: Aggregation; label: string; hint: string }[] = [
  { key: 'cumulative', label: 'Add every round up',
    hint: 'One running total across the trip.' },
  { key: 'custom_points', label: 'Points by position each round',
    hint: 'You decide what winning a round is worth.' },
]

// ─── Which boards can exist ────────────────────────────────────

/**
 * What makes two leaderboards the same competition.
 *
 * Leagues are told apart by how they are scored — a trip can rank the same
 * players on Stableford and on Strokes and they are genuinely two boards.
 * Matchplay is not: one draw is a draw, and a second would be a different
 * tournament rather than a second view of this one.
 */
export function slotKey(lb: Pick<Leaderboard, 'audience' | 'competition' | 'scoring' | 'teamFormat'>): string {
  if (lb.competition === 'matchplay') return 'matchplay'
  if (lb.audience === 'individual') return `individual:league:${lb.scoring ?? '?'}`
  return `team:league:${lb.teamFormat ?? '?'}`
}

/** Is this competition still free, given what the trip already runs? */
export function isSlotFree(
  existing: readonly Leaderboard[],
  candidate: Pick<Leaderboard, 'audience' | 'competition' | 'scoring' | 'teamFormat'>,
): boolean {
  const key = slotKey(candidate)
  return !existing.some(lb => slotKey(lb) === key)
}

/** A trip may run exactly one knockout draw, whoever it is between. */
export function hasMatchplay(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.competition === 'matchplay')
}

/** Scorings not yet taken by an individual league. */
export function freeScorings(boards: readonly Leaderboard[]): Scoring[] {
  return SCORINGS.map(s => s.key).filter(scoring =>
    isSlotFree(boards, { audience: 'individual', competition: 'league', scoring }))
}

/** Team formats not yet taken by a team league. */
export function freeTeamFormats(boards: readonly Leaderboard[]): TeamFormat[] {
  return TEAM_FORMATS.map(f => f.key).filter(teamFormat =>
    isSlotFree(boards, { audience: 'team', competition: 'league', teamFormat }))
}

/**
 * Whether there is anything left to add.
 *
 * The "add another" button is offered only when it would lead somewhere —
 * a disabled button with no explanation is worse than no button.
 */
export function canAddMore(boards: readonly Leaderboard[]): boolean {
  return freeScorings(boards).length > 0
    || freeTeamFormats(boards).length > 0
    || !hasMatchplay(boards)
}

// ─── Is one finished? ──────────────────────────────────────────

/**
 * The questions this leaderboard still has unanswered, in the order they
 * are asked.
 *
 * A board cannot be saved until this is empty. That is the whole point of
 * the restructure: the scoring module is handed complete rules or nothing,
 * never a half-filled object it has to guess at.
 */
export function unanswered(draft: Partial<Leaderboard>): string[] {
  const missing: string[] = []
  if (!draft.audience) return ['Who is being ranked']
  if (!draft.competition) return ['League or matchplay']

  // A draw has nothing else to decide: the bracket is drawn at random and
  // the entrants come from the roster or the pairings.
  if (draft.competition === 'matchplay') return missing

  if (draft.audience === 'individual') {
    if (!draft.scoring) missing.push('How it is scored')
    else if (draft.scoring === 'custom' && !hasTable(draft.customPoints)) {
      missing.push('What each position is worth')
    }
    return missing
  }

  if (!draft.teamFormat) missing.push('How a team\'s score is worked out')
  if (!draft.aggregation) missing.push('How rounds are added up')
  else if (draft.aggregation === 'custom_points' && !hasTable(draft.customPoints)) {
    missing.push('What each position is worth')
  }
  return missing
}

const hasTable = (t: number[] | undefined) => Array.isArray(t) && t.length > 0

export function isComplete(draft: Partial<Leaderboard>): draft is Leaderboard {
  return unanswered(draft).length === 0
}

/** Whether the discard question applies — Custom pays by position, so it does not. */
export function offersDiscard(draft: Partial<Leaderboard>): boolean {
  return draft.audience === 'individual'
    && draft.competition === 'league'
    && (draft.scoring === 'stableford' || draft.scoring === 'strokes')
}

/** Whether this board needs teams picked before the trip can go live. */
export function needsTeams(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.audience === 'team')
}

/** Whether teams must be exactly two — a pairing is what a pairs draw is between. */
export function needsPairings(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.audience === 'team' && lb.competition === 'matchplay')
}

// ─── Naming ────────────────────────────────────────────────────

/** "Team Stableford", "Pairs matchplay" — how a board is titled on its tab. */
export function boardTitle(lb: Leaderboard): string {
  if (lb.competition === 'matchplay') {
    return lb.audience === 'team' ? 'Pairs matchplay' : 'Matchplay'
  }
  if (lb.audience === 'individual') {
    return SCORINGS.find(s => s.key === lb.scoring)?.label ?? 'League'
  }
  const format = ALL_TEAM_FORMATS.find(f => f.key === lb.teamFormat)?.label ?? 'Team'
  return `Team ${format.toLowerCase()}`
}

/** The line under the title saying how it is being scored. */
export function boardRules(lb: Leaderboard): string {
  if (lb.competition === 'matchplay') {
    return lb.audience === 'team'
      ? 'Knockout between pairings, drawn at random'
      : 'Knockout between players, drawn at random'
  }

  const parts: string[] = []
  if (lb.audience === 'individual') {
    parts.push(SCORINGS.find(s => s.key === lb.scoring)?.hint ?? '')
    if (lb.discardWorst) {
      parts.push(`Worst ${lb.discardWorst === 1 ? 'round' : `${lb.discardWorst} rounds`} dropped`)
    }
  } else {
    parts.push(ALL_TEAM_FORMATS.find(f => f.key === lb.teamFormat)?.hint ?? '')
    parts.push(AGGREGATIONS.find(a => a.key === lb.aggregation)?.hint ?? '')
  }
  return parts.filter(Boolean).join(' ')
}

/** The board that leads. The first one made is the one the trip is about. */
export function primary(boards: readonly Leaderboard[]): Leaderboard | null {
  return boards[0] ?? null
}

// ─── Storage ───────────────────────────────────────────────────

/**
 * Read whatever is stored.
 *
 * Anything unrecognised is dropped rather than repaired: a half-understood
 * leaderboard would quietly score a trip wrongly, and no board at all sends
 * the organiser back to a form that says so.
 */
export function parseLeaderboards(raw: unknown): Leaderboard[] {
  if (!Array.isArray(raw)) return []
  const out: Leaderboard[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>

    const audience = r.audience === 'team' ? 'team' : r.audience === 'individual' ? 'individual' : null
    const competition = r.competition === 'matchplay' ? 'matchplay'
      : r.competition === 'league' ? 'league' : null
    if (!audience || !competition) continue

    const lb: Leaderboard = {
      id: typeof r.id === 'string' && r.id ? r.id : `lb-${out.length}`,
      audience,
      competition,
    }

    if (competition === 'league' && audience === 'individual') {
      const scoring = SCORINGS.find(s => s.key === r.scoring)?.key
      if (!scoring) continue
      lb.scoring = scoring
      lb.discardWorst = clamp(r.discardWorst, 0, MAX_DISCARD)
      if (scoring === 'custom') lb.customPoints = points(r.customPoints)
    }

    if (competition === 'league' && audience === 'team') {
      const teamFormat = ALL_TEAM_FORMATS.find(f => f.key === r.teamFormat)?.key
      const aggregation = AGGREGATIONS.find(a => a.key === r.aggregation)?.key
      if (!teamFormat || !aggregation) continue
      lb.teamFormat = teamFormat
      lb.aggregation = aggregation
      if (aggregation === 'custom_points') lb.customPoints = points(r.customPoints)
    }

    // One draw only, whichever arrives first
    if (competition === 'matchplay' && hasMatchplay(out)) continue
    // And one of each league
    if (!isSlotFree(out, lb)) continue

    out.push(lb)
  }
  return out
}

const clamp = (v: unknown, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo
}

const points = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(n => clamp(n, 0, 100)) : []
