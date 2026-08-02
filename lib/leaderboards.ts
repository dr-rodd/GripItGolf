// What a trip is playing for.
//
// A trip runs one or more leaderboards. Each is a complete, self-contained
// competition: who is being ranked, what they are playing, and every rule
// needed to turn a scorecard into a position on that board.
//
// Three questions, and they are genuinely independent:
//
//   who is ranked        individuals, or teams
//   how a round is scored   Stableford, or strokes
//   how rounds add up    total them, or pay by finishing position
//
// Teams answer one more — how the players in a team make one score for the
// round — and that sits on top of the scoring, not beside it.
//
// Splitting them this way is what makes the maths finite. Every combination
// is a real competition and every one is implemented, so settings is only
// ever selecting a cell that already exists rather than asking for one that
// has to be written. "Custom points" used to sit alongside Stableford and
// Strokes as though it were a third way of scoring a round; it is not, it is
// a way of adding rounds up, and having it in the wrong slot is what forced
// discard to be switched off for it and made the prize table hang off two
// unrelated fields.
//
// Pure. No I/O.

export type Audience = 'individual' | 'team'
export type Competition = 'league' | 'matchplay'

/** How a round is scored. */
export type Scoring = 'stableford' | 'strokes'

/**
 * How a team's members combine into one score for a round.
 *
 * `aggregate` is not offered any more — better ball with every score counting
 * says the same thing — but trips already running it have to keep scoring the
 * way they always have, so it stays a format this model knows about.
 */
export type TeamFormat = 'better_ball' | 'hero' | 'cut_dead_weight' | 'aggregate'

/** How the rounds are put together into a position on the board. */
export type Combine = 'total' | 'position'

export type Leaderboard = {
  id: string
  audience: Audience
  competition: Competition

  /** League only. */
  scoring?: Scoring
  combine?: Combine
  /** How many of a player's worst rounds to set aside. Any league board. */
  discardWorst?: number

  /** Team league only. */
  teamFormat?: TeamFormat

  /** `combine: 'position'` only — what each finishing place pays. */
  customPoints?: number[]
}

export const MAX_DISCARD = 2

export const SCORINGS: { key: Scoring; label: string; hint: string }[] = [
  { key: 'stableford', label: 'Stableford',
    hint: 'Points per hole against your handicap. Highest wins.' },
  { key: 'strokes', label: 'Strokes',
    hint: 'Nett strokes. Lowest wins.' },
]

export const TEAM_FORMATS: { key: TeamFormat; label: string; hint: string }[] = [
  { key: 'better_ball', label: 'Better ball',
    hint: 'A composite card: the team\'s best score on every hole.' },
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

export const COMBINES: { key: Combine; label: string; hint: string }[] = [
  { key: 'total', label: 'Add every round up',
    hint: 'One running total across the trip.' },
  { key: 'position', label: 'Points by position each round',
    hint: 'You decide what winning a round is worth.' },
]

// ─── Which boards can exist ────────────────────────────────────

/**
 * What makes two leaderboards the same competition.
 *
 * Every answer that changes the maths is in the key, so two boards are the
 * same only when they would produce the same table. Stableford totalled and
 * Stableford paid by position are genuinely two boards — an order of merit
 * and a daily prize are a normal pair to run side by side.
 *
 * Matchplay is not keyed on anything: one draw is a draw, and a second would
 * be a different tournament rather than a second view of this one.
 */
export function slotKey(lb: Pick<Leaderboard, 'audience' | 'competition' | 'scoring' | 'teamFormat' | 'combine'>): string {
  if (lb.competition === 'matchplay') return 'matchplay'
  return [
    lb.audience,
    'league',
    lb.scoring ?? '?',
    lb.audience === 'team' ? lb.teamFormat ?? '?' : '-',
    lb.combine ?? '?',
  ].join(':')
}

/** Is this competition still free, given what the trip already runs? */
export function isSlotFree(
  existing: readonly Leaderboard[],
  candidate: Pick<Leaderboard, 'audience' | 'competition' | 'scoring' | 'teamFormat' | 'combine'>,
): boolean {
  const key = slotKey(candidate)
  return !existing.some(lb => slotKey(lb) === key)
}

/** A trip may run exactly one knockout draw, whoever it is between. */
export function hasMatchplay(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.competition === 'matchplay')
}

/**
 * Every league board this trip could possibly run — the whole grid.
 *
 * Small and finite on purpose. The form offers cells from here and nothing
 * else, so it can never ask for a competition the scoring module cannot
 * work out.
 */
export function everyBoard(): Leaderboard[] {
  const out: Leaderboard[] = []
  for (const audience of ['individual', 'team'] as Audience[]) {
    for (const scoring of SCORINGS.map(s => s.key)) {
      for (const teamFormat of audience === 'team' ? TEAM_FORMATS.map(f => f.key) : [undefined]) {
        for (const combine of COMBINES.map(c => c.key)) {
          out.push({
            id: slotKey({ audience, competition: 'league', scoring, teamFormat, combine }),
            audience, competition: 'league', scoring, teamFormat, combine,
          })
        }
      }
    }
  }
  return out
}

/**
 * Whether there is anything left to add.
 *
 * The "add another" button is offered only when it would lead somewhere — a
 * disabled button with no explanation is worse than no button.
 */
export function canAddMore(boards: readonly Leaderboard[]): boolean {
  return everyBoard().some(b => isSlotFree(boards, b)) || !hasMatchplay(boards)
}

/** Scorings that still lead somewhere, given what is already running. */
export function freeScorings(boards: readonly Leaderboard[], audience: Audience): Scoring[] {
  return SCORINGS.map(s => s.key).filter(scoring =>
    everyBoard().some(b => b.audience === audience && b.scoring === scoring && isSlotFree(boards, b)))
}

/** Team formats that still lead somewhere. */
export function freeTeamFormats(boards: readonly Leaderboard[], scoring?: Scoring): TeamFormat[] {
  return TEAM_FORMATS.map(f => f.key).filter(teamFormat =>
    everyBoard().some(b =>
      b.audience === 'team'
      && b.teamFormat === teamFormat
      && (!scoring || b.scoring === scoring)
      && isSlotFree(boards, b)))
}

// ─── Is one finished? ──────────────────────────────────────────

/**
 * The questions this leaderboard still has unanswered, in the order they are
 * asked.
 *
 * A board cannot be saved until this is empty. That is the whole point of the
 * model: the scoring module is handed complete rules or nothing, never a
 * half-filled object it has to guess at.
 */
export function unanswered(draft: Partial<Leaderboard>): string[] {
  if (!draft.audience) return ['Who is being ranked']
  if (!draft.competition) return ['League or matchplay']

  // A draw has nothing else to decide: the bracket is drawn at random and the
  // entrants come from the roster or the pairings.
  if (draft.competition === 'matchplay') return []

  const missing: string[] = []
  if (!draft.scoring) missing.push('How a round is scored')
  if (draft.audience === 'team' && !draft.teamFormat) {
    missing.push('How a team\'s players combine')
  }
  if (!draft.combine) missing.push('How the rounds add up')
  else if (draft.combine === 'position' && !hasTable(draft.customPoints)) {
    missing.push('What each position is worth')
  }
  return missing
}

const hasTable = (t: number[] | undefined) => Array.isArray(t) && t.length > 0

export function isComplete(draft: Partial<Leaderboard>): draft is Leaderboard {
  return unanswered(draft).length === 0
}

/**
 * Whether the discard question applies.
 *
 * Every league board. Dropping your worst round means the same thing whether
 * the round was worth points or worth a place — a bad day stops defining the
 * week either way.
 */
export function offersDiscard(draft: Partial<Leaderboard>): boolean {
  return draft.competition === 'league' && !!draft.scoring
}

/** Whether this board needs teams picked before the trip can go live. */
export function needsTeams(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.audience === 'team')
}

/** Whether teams must be exactly two — a pairing is what a pairs draw is between. */
export function needsPairings(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.audience === 'team' && lb.competition === 'matchplay')
}

/**
 * Why this trip cannot go live yet, or null if it can.
 *
 * Read off the boards, because the boards are what a trip plays for. This
 * used to be answered from `trips.formats`, which a new trip carries as the
 * defaults — so it said yes to a trip with nothing to play for at all, and
 * never noticed a pairs draw chosen in this model.
 */
export function finaliseBlockedReason(
  boards: readonly Leaderboard[],
  teamCount: number,
): string | null {
  if (boards.length === 0) return 'Choose what this trip is playing for first.'
  if (needsTeams(boards) && teamCount === 0) {
    return needsPairings(boards)
      ? 'Your draw is between pairings — pick them first.'
      : 'A team leaderboard needs teams — pick them first.'
  }
  return null
}

// ─── Naming ────────────────────────────────────────────────────

/** "Team better ball", "Strokes", "Pairs matchplay" — a board's tab. */
export function boardTitle(lb: Leaderboard): string {
  if (lb.competition === 'matchplay') {
    return lb.audience === 'team' ? 'Pairs matchplay' : 'Matchplay'
  }
  const scoring = SCORINGS.find(s => s.key === lb.scoring)?.label ?? 'League'
  const format = ALL_TEAM_FORMATS.find(f => f.key === lb.teamFormat)?.label ?? 'Team'
  const base = lb.audience === 'individual' ? scoring : `Team ${format.toLowerCase()}`
  // The same scoring totalled and paid by position are two boards, so the tab
  // has to tell them apart — an order of merit and a daily prize would
  // otherwise sit side by side under one name.
  return lb.combine === 'position' ? `${base} prizes` : base
}

/** The line under the title saying how it is being scored. */
export function boardRules(lb: Leaderboard): string {
  if (lb.competition === 'matchplay') {
    return lb.audience === 'team'
      ? 'Knockout between pairings, drawn at random'
      : 'Knockout between players, drawn at random'
  }

  const parts: string[] = []
  if (lb.audience === 'team') {
    parts.push(ALL_TEAM_FORMATS.find(f => f.key === lb.teamFormat)?.hint ?? '')
  }
  parts.push(SCORINGS.find(s => s.key === lb.scoring)?.hint ?? '')
  parts.push(COMBINES.find(c => c.key === lb.combine)?.hint ?? '')
  if (lb.discardWorst) {
    parts.push(`Worst ${lb.discardWorst === 1 ? 'round' : `${lb.discardWorst} rounds`} dropped.`)
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
 *
 * The first shape of this model put "custom points" alongside Stableford and
 * Strokes as a way of scoring, and asked teams a separate `aggregation`
 * question that meant the same thing. Both read back as what they always
 * described — a board scored on Stableford and paid by position.
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

    if (competition === 'league') {
      // `scoring: 'custom'` is the older spelling of "Stableford, paid by
      // position"; so is `aggregation: 'custom_points'` on a team board.
      const paidByPosition =
        r.scoring === 'custom' || r.aggregation === 'custom_points' || r.combine === 'position'
      // A team board with no scoring at all comes from the first shape of
      // this model, which only ever scored teams on Stableford. An individual
      // board with none is genuinely unreadable — there is nothing to infer
      // from — so it is dropped.
      const scoring = r.scoring === 'strokes' ? 'strokes'
        : r.scoring === 'stableford' || r.scoring === 'custom' ? 'stableford'
        : audience === 'team' && r.scoring === undefined ? 'stableford'
        : null
      if (!scoring) continue

      lb.scoring = scoring
      lb.combine = paidByPosition ? 'position' : 'total'
      lb.discardWorst = clamp(r.discardWorst, 0, MAX_DISCARD)
      if (lb.combine === 'position') lb.customPoints = points(r.customPoints)

      if (audience === 'team') {
        const teamFormat = ALL_TEAM_FORMATS.find(f => f.key === r.teamFormat)?.key
        if (!teamFormat) continue
        lb.teamFormat = teamFormat
      }
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
