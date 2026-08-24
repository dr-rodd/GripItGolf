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

import {
  FULL_ALLOWANCE, allowanceOf, clampAllowance, describeAllowance,
} from './handicapAllowance'
import { type TieBreak, type OverallTie, TIE_BREAKS, describeTieBreak } from './tiebreak'
import { type RoundLink, parseRoundLinks, decisionLabel } from './matchDecision'
import {
  type QuotaScale, parseQuotaScale, quotaScaleOf, quotaScaleLabel,
} from './quota'
import { DEFAULT_TEAM_SCORING, MAX_COUNTING_SCORES, lastHoles } from './teamScoring'

export type Audience = 'individual' | 'team'
export type Competition = 'league' | 'matchplay'

/** How a round is scored. */
export type Scoring = 'stableford' | 'strokes' | 'quota'

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

  /**
   * Which team sheet this board is played on. Team boards only; absent means
   * the trip's first sheet. Two team boards on different sheets rank
   * different teams — a league of fours and a draw between pairings, from the
   * same roster. See lib/teamSets.ts.
   */
  teamSet?: string

  /** League only. */
  scoring?: Scoring
  combine?: Combine
  /** How many of a player's worst rounds to set aside. Any league board. */
  discardWorst?: number

  /** Team league only. */
  teamFormat?: TeamFormat

  /**
   * `teamFormat: 'better_ball'` only — how many of the team's scores make the
   * composite card on each hole.
   *
   * Absent reads as 2, which is what the maths has always counted for a board
   * that was never asked (`DEFAULT_TEAM_SCORING`), so a stored trip is scored
   * exactly as it was. Usually 1 or 2; anything up to `MAX_COUNTING_SCORES`
   * can be typed in for the rare board that wants more. A count above a
   * team's size simply caps out at everyone.
   */
  countingScores?: number

  /**
   * `teamFormat: 'better_ball'` only — the grandstand finish: closing holes
   * on which every score counts rather than the best few, so a trailing team
   * can still catch up. It can only raise a team's total, never lower it.
   *
   * Absent means off, which is what every board did before the question was
   * asked. 1 to 18 when on.
   */
  aggregateFinish?: number

  /**
   * Team league only — name the board's rows by the players rather than by
   * the team. A group that never christened its teams reads "Team A · Dave,
   * Ross" as noise; with this on, the row is simply the players.
   *
   * Absent means the team name shows, which is what every board did before
   * the question was asked. Presentation only — nothing about scoring.
   */
  hideTeamName?: boolean

  /**
   * What percentage of a player's course handicap this board plays off.
   *
   * Absent means all of it. A four-ball is normally 85% and a singles
   * competition 95%, and the reduction belongs to the competition rather than
   * to the player — two boards on one trip can be scored off two different
   * allowances from the same cards. See lib/handicapAllowance.ts, which is
   * also where the rule that nothing is ever *stored* reduced is written down.
   */
  handicapAllowance?: number

  /** `combine: 'position'` only — what each finishing place pays. */
  customPoints?: number[]

  /**
   * `scoring: 'quota'` only — which scale the quota is earned on.
   *
   * Absent reads as Chicago, which is what the retired in-between scale most
   * resembles, so a Quota board set up before the question was asked keeps
   * the nearest thing to what it had. See lib/quota.ts.
   */
  quotaScale?: QuotaScale

  /**
   * What this board does when two entrants finish level.
   *
   * Absent means `even_split`, which is what every board did before the
   * question existed. See lib/tiebreak.ts — the rule, and why the default for
   * a board being read back is not the default for one being made.
   */
  tieBreak?: TieBreak

  /**
   * Matchplay only — which round of golf each bracket round is played over,
   * and how a match on it is decided.
   *
   * Absent means every match is tapped in by hand, which is what a draw was
   * before it could be linked to anything. See lib/matchDecision.ts.
   */
  roundLinks?: RoundLink[]

  /**
   * And when they finish level on the whole trip.
   *
   * `tieBreak: 'countback'` only. Absent means the overall total is left
   * level: several rounds added up have no back nine to be better over. A
   * board counting a single round is the exception and is broken either way,
   * because there the total is that one card.
   */
  overallTie?: OverallTie

  /**
   * Team boards on an event only — whether teammates occupy one tee-sheet
   * slot together, or may go out in separate slots contributing to the same
   * board. Absent means together, because partners almost always play
   * together; only 'separate' is stored. The tee sheet reads it to decide
   * whether adding one member books the pair (lib/teeSheet.ts) — a trip,
   * having no tee sheet, never asks and never stores it.
   */
  teeTeams?: 'separate'

  /**
   * Team boards on an event only — teams formed by criteria, with the
   * players choosing their own. Absent means the organiser assigns them,
   * which is what every board did before the question. With 'self', teams
   * are made and joined from the teams screen without the PIN, sized by
   * `teamSize`, and named from their members.
   */
  teamPick?: 'self'

  /**
   * `teamPick: 'self'` only — how many players make a team. Clamped 2–4
   * when the board's teammates share a tee time (no `teeTeams:
   * 'separate'`), because a group is at most four; 2–8 when members may
   * play apart. `lib/teamLimits.ts` `teamSizeLimit` is what enforces it —
   * the one copy of every team-size cap.
   */
  teamSize?: number
}

/** The size bounds a self-picked team may take — see `teamSize`. */
export const MIN_TEAM_SIZE = 2
export const MAX_TEAM_SIZE_TOGETHER = 4
export const MAX_TEAM_SIZE_SEPARATE = 8

export const MAX_DISCARD = 2

export const SCORINGS: { key: Scoring; label: string; hint: string }[] = [
  // The hint is not only the hint: `boardRules` joins these into the line
  // under a saved board's title, so it has to name the scoring as well as
  // carry the joke. Ends with a stop like every other one, or it runs into
  // whatever `boardRules` appends next.
  { key: 'stableford', label: 'Stableford Points',
    hint: 'Stableford points. Man\'s greatest achievement.' },
  { key: 'strokes', label: 'Strokes',
    hint: 'Simple as.' },
  { key: 'quota', label: 'Quota',
    hint: 'Quota points against your own number — 36 minus course handicap.' },
]

/**
 * The scorings offered to this audience.
 *
 * Quota is individual-only: the quota is personal — 36 minus *your* course
 * handicap — and no team format says whose number a composite card would be
 * chasing. `everyBoard` skips the same cells and `parseLeaderboards` drops a
 * stored team quota board, so the three can never disagree about what exists.
 */
export function scoringsFor(audience: Audience): { key: Scoring; label: string; hint: string }[] {
  return SCORINGS.filter(s => s.key !== 'quota' || audience === 'individual')
}

export const TEAM_FORMATS: { key: TeamFormat; label: string; hint: string }[] = [
  { key: 'better_ball', label: 'Better ball',
    hint: 'A composite card from the team\'s best scores on every hole — you choose how many count.' },
  { key: 'hero', label: 'Hero',
    hint: 'The best single card in the team that day carries it.' },
  { key: 'cut_dead_weight', label: 'Cut the dead weight',
    hint: 'Everyone counts except the worst card of the day.' },
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
export function slotKey(lb: Pick<Leaderboard, 'audience' | 'competition' | 'scoring' | 'teamFormat' | 'combine' | 'teamSet'>): string {
  if (lb.competition === 'matchplay') return 'matchplay'
  return [
    lb.audience,
    'league',
    lb.scoring ?? '?',
    lb.audience === 'team' ? lb.teamFormat ?? '?' : '-',
    lb.combine ?? '?',
    // The same format played by different teams is a different competition —
    // better ball between the fours and better ball between the pairings are
    // two tables, not one shown twice.
    lb.audience === 'team' ? lb.teamSet || 'main' : '-',
  ].join(':')
}

/** Is this competition still free, given what the trip already runs? */
export function isSlotFree(
  existing: readonly Leaderboard[],
  candidate: Pick<Leaderboard, 'audience' | 'competition' | 'scoring' | 'teamFormat' | 'combine' | 'teamSet'>,
): boolean {
  const key = slotKey(candidate)
  return !existing.some(lb => slotKey(lb) === key)
}

/**
 * The competition ignoring which teams play it.
 *
 * Settings no longer asks a team board which sheet it is on — teams are
 * apportioned to boards on the team screen, after the boards exist. So the
 * form cannot tell two boards apart by their sheet while they are being made,
 * and a second "Team better ball" would be offered as though it were a new
 * competition when its tab would read exactly the same as the first.
 */
export function formatKey(lb: Parameters<typeof slotKey>[0]): string {
  return slotKey({ ...lb, teamSet: undefined })
}

/** Is this format still free, whoever ends up playing it? */
export function isFormatFree(
  existing: readonly Leaderboard[],
  candidate: Parameters<typeof slotKey>[0],
): boolean {
  const key = formatKey(candidate)
  return !existing.some(lb => formatKey(lb) === key)
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
    for (const scoring of scoringsFor(audience).map(s => s.key)) {
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

// `canAddMore` is gone. It answered whether the grid still had a free cell,
// and once a board can name its own team sheet the answer is always yes: a
// fresh sheet reopens every team format, because better ball between the
// fours and better ball between the pairings are two different tables. A
// function that cannot return false is worse than no function — it makes a
// button look conditional when it never is.

/**
 * Scorings that still lead somewhere, given what is already running.
 *
 * Asked of the format rather than the slot, because the form no longer knows
 * which teams a board will be played by — that is settled afterwards, on the
 * team screen.
 */
export function freeScorings(
  boards: readonly Leaderboard[], audience: Audience,
): Scoring[] {
  return SCORINGS.map(s => s.key).filter(scoring =>
    everyBoard().some(b =>
      b.audience === audience && b.scoring === scoring
      && isFormatFree(boards, b)))
}

/** Team formats that still lead somewhere. */
export function freeTeamFormats(
  boards: readonly Leaderboard[], scoring?: Scoring,
): TeamFormat[] {
  return TEAM_FORMATS.map(f => f.key).filter(teamFormat =>
    everyBoard().some(b =>
      b.audience === 'team'
      && b.teamFormat === teamFormat
      && (!scoring || b.scoring === scoring)
      && isFormatFree(boards, b)))
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

/**
 * Whether to ask how ties are broken.
 *
 * Only a board that pays by position. A tie only needs breaking where the
 * places are worth something different — on a board that just adds rounds up,
 * two players level simply share the place, and asking which back nine was
 * better decides nothing anybody is playing for. A draw is not asked either:
 * a match that finishes level is halved, and that is the format's own rule
 * rather than a setting.
 */
export function offersTieBreak(draft: Partial<Leaderboard>): boolean {
  return draft.competition === 'league' && !!draft.scoring && draft.combine === 'position'
}

/**
 * Whether to ask which scale the quota is earned on.
 *
 * Only a Quota board, because only a Quota board earns any. A knockout can be
 * decided on quota too and takes the same scale — but it takes it from *this*
 * board, and only overrides it where somebody says so, which is a question
 * asked beside the link rather than here. See lib/matchDecision.ts.
 */
export function offersQuotaScale(draft: Partial<Leaderboard>): boolean {
  return draft.competition === 'league' && draft.scoring === 'quota'
}

/**
 * Whether to ask how many scores count on each hole.
 *
 * Only a team better-ball board — the count is what "composite card" means
 * there. Hero and cut-the-dead-weight judge whole cards, and an individual
 * board has one score a hole whoever is asked.
 */
export function offersCountingScores(draft: Partial<Leaderboard>): boolean {
  return draft.competition === 'league'
    && draft.audience === 'team'
    && draft.teamFormat === 'better_ball'
}

/**
 * Whether to ask how the board's rows are named.
 *
 * Any team league board, whatever its format — the question is about the
 * table, not the maths. A draw is not asked: a bracket seats entrants, and a
 * pairing is already written as its players.
 */
export function offersTeamNames(draft: Partial<Leaderboard>): boolean {
  return draft.competition === 'league'
    && draft.audience === 'team'
    && !!draft.teamFormat
}

/**
 * How many of the team's scores this board counts on a hole.
 *
 * Absent reads as the default the maths has always used — 2 — so every board
 * stored before the question existed keeps scoring exactly as it did.
 */
export function countingScoresOf(lb: Pick<Partial<Leaderboard>, 'countingScores'>): number {
  return lb.countingScores ?? DEFAULT_TEAM_SCORING.countingScores
}

/**
 * The closing holes on which everyone counts. Absent reads as off — no board
 * had a grandstand finish before it could be asked for.
 */
export function aggregateFinishOf(lb: Pick<Partial<Leaderboard>, 'aggregateFinish'>): number {
  return lb.aggregateFinish ?? 0
}

/** The one line that says what a better-ball composite card is made of. */
export function describeBetterBall(countingScores: number, aggregateFinish = 0): string {
  const base = countingScores === 1
    ? 'A composite card: the team\'s best score on every hole'
    : `A composite card: the team's best ${countingScores} scores on every hole`
  return aggregateFinish > 0
    ? `${base}, and everyone counts on ${lastHoles(aggregateFinish)}.`
    : `${base}.`
}

/**
 * The scale this trip's quota is earned on.
 *
 * The Quota board's, if it runs one. A trip with no quota board still has a
 * knockout that can be decided on quota, and that falls to the default —
 * which is exactly why this is asked of the boards rather than of a board.
 */
export function tripQuotaScale(boards: readonly Leaderboard[]): QuotaScale {
  const quota = boards.find(b => b.competition === 'league' && b.scoring === 'quota')
  return quotaScaleOf(quota ?? {})
}

/**
 * Whether to ask about the handicap allowance yet.
 *
 * Last question of the cascade, and only once the board knows what it is: the
 * recommended figure depends on whether individuals or teams are being ranked,
 * so asking before that is answered would suggest the wrong number. Matchplay
 * is not asked at all — its allowance is a different calculation entirely, and
 * lib/handicapAllowance.ts says why.
 */
export function offersAllowance(draft: Partial<Leaderboard>): boolean {
  if (draft.competition !== 'league' || !draft.scoring) return false
  return draft.audience === 'individual' || !!draft.teamFormat
}

/**
 * Whether to ask how a team meets the tee sheet.
 *
 * Any team board — a league's pairs and a draw's pairings both stand on
 * tee times — but only where a tee sheet exists to meet, which is an
 * event: the form passes that context in, because this model deliberately
 * does not know what kind of trip is asking.
 */
export function offersTeeTeams(draft: Partial<Leaderboard>): boolean {
  return draft.audience === 'team' && !!draft.competition
}

/** Whether this board needs teams picked before the trip can go live. */
export function needsTeams(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.audience === 'team')
}

/** Whether teams must be exactly two — a pairing is what a pairs draw is between. */
export function needsPairings(boards: readonly Leaderboard[]): boolean {
  return boards.some(lb => lb.audience === 'team' && lb.competition === 'matchplay')
}

// The gate on going live lives in lib/teamSets.ts, because what it has left
// to check is per team sheet: a trip may need two of them filled in.

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
    const base = lb.audience === 'team'
      ? 'Knockout between pairings, drawn at random'
      : 'Knockout between players, drawn at random'
    return describeRoundLinks(lb.roundLinks ?? [], base)
  }

  const parts: string[] = []
  if (lb.audience === 'team') {
    // Better ball states its count and its finish rather than its hint — how
    // many scores make the composite card is the whole of what the format is.
    parts.push(lb.teamFormat === 'better_ball'
      ? describeBetterBall(countingScoresOf(lb), aggregateFinishOf(lb))
      : ALL_TEAM_FORMATS.find(f => f.key === lb.teamFormat)?.hint ?? '')
  }
  parts.push(SCORINGS.find(s => s.key === lb.scoring)?.hint ?? '')
  // The scale is the whole of what a Quota board's numbers mean, so it is
  // named rather than left to whoever remembers setting it.
  if (lb.scoring === 'quota') parts.push(`${quotaScaleLabel(quotaScaleOf(lb))}.`)
  parts.push(COMBINES.find(c => c.key === lb.combine)?.hint ?? '')
  if (lb.discardWorst) {
    parts.push(`Worst ${lb.discardWorst === 1 ? 'round' : `${lb.discardWorst} rounds`} dropped.`)
  }
  // Empty on a board that leaves ties standing and pays nothing for them,
  // which is every board that predates the question — see lib/tiebreak.ts.
  parts.push(describeTieBreak(lb))
  // Only when it is one — "Full course handicap" on every board that never
  // asked for a reduction is a sentence saying nothing.
  const allowance = allowanceOf(lb)
  if (allowance !== FULL_ALLOWANCE) parts.push(`Played off ${describeAllowance(allowance)}.`)
  return parts.filter(Boolean).join(' ')
}

/**
 * What a linked draw says under its title.
 *
 * Named only where every linked round agrees, because that is the case worth
 * a sentence — "decided on Stableford matchplay" is a rule somebody can hold
 * in their head. A draw running a different method each day cannot be
 * summarised in a line, so it says how many rounds are linked and leaves the
 * detail to the rounds themselves.
 */
export function describeRoundLinks(links: readonly RoundLink[], base: string): string {
  if (links.length === 0) return base
  const methods = new Set(links.map(l => l.decidedBy))
  if (methods.size === 1) {
    return `${base} · decided on ${decisionLabel(links[0].decidedBy).toLowerCase()}`
  }
  return `${base} · ${links.length} rounds linked`
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

    // Which golf a knockout is played over. Read for a draw and nothing else
    // — a league board has rounds already, in every column of its table.
    if (competition === 'matchplay') {
      const links = parseRoundLinks(r.roundLinks)
      if (links.length > 0) lb.roundLinks = links
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
        : r.scoring === 'quota' ? 'quota'
        : r.scoring === 'stableford' || r.scoring === 'custom' ? 'stableford'
        : audience === 'team' && r.scoring === undefined ? 'stableford'
        : null
      if (!scoring) continue
      // Quota is individual-only — see `scoringsFor`. A stored team quota
      // board has no maths behind it, so it is dropped rather than guessed at.
      if (scoring === 'quota' && audience === 'team') continue

      lb.scoring = scoring
      lb.combine = paidByPosition ? 'position' : 'total'
      lb.discardWorst = clamp(r.discardWorst, 0, MAX_DISCARD)
      // Kept off the object entirely when there is no reduction, so a board
      // that never asked for one reads back byte-for-byte as it always did.
      // Every trip on the platform predates this question.
      // Only a Quota board earns quota points, so only a Quota board is
      // asked. Kept off anything else rather than carried silently.
      if (scoring === 'quota') {
        const scale = parseQuotaScale(r.quotaScale)
        if (scale) lb.quotaScale = scale
      }

      const allowance = clampAllowance(r.handicapAllowance)
      if (allowance !== FULL_ALLOWANCE) lb.handicapAllowance = allowance
      if (lb.combine === 'position') lb.customPoints = points(r.customPoints)

      // Kept off the object when it is the no-op, the same way an allowance
      // of 100 is. Absent reads as `even_split` — what every board did before
      // the question was asked — so a trip that predates it is byte-for-byte
      // the object it has always been, and is scored the way it always was.
      //
      // And only read at all on a board that pays by position. A tie rule is
      // a prizes question — on a board that just adds rounds up, level
      // players share the place — so a countback stored on a totals board
      // (every one the form seeded before it learned this) is dropped here,
      // which is what retires it everywhere at once.
      if (lb.combine === 'position') {
        const tieBreak = TIE_BREAKS.find(t => t.key === r.tieBreak)?.key
        if (tieBreak && tieBreak !== 'even_split') lb.tieBreak = tieBreak
        // Only countback has an overall question, and only one of its answers
        // is worth storing. A board told to leave the total level is the board
        // that never answered.
        if (lb.tieBreak === 'countback' && r.overallTie === 'last_round') {
          lb.overallTie = 'last_round'
        }
      }

      if (audience === 'team') {
        const teamFormat = ALL_TEAM_FORMATS.find(f => f.key === r.teamFormat)?.key
        if (!teamFormat) continue
        lb.teamFormat = teamFormat

        // Only better ball counts scores on a hole, and kept off the object
        // when it is the default — absent reads as 2, so a board stored
        // before the question existed is byte-for-byte what it always was
        // and is scored the way it always was.
        if (teamFormat === 'better_ball' && Number.isFinite(Number(r.countingScores))) {
          const counting = clamp(r.countingScores, 1, MAX_COUNTING_SCORES)
          if (counting !== DEFAULT_TEAM_SCORING.countingScores) lb.countingScores = counting
        }

        // The grandstand finish is better ball's too, and kept off when it is
        // off — no board had one before the question existed.
        if (teamFormat === 'better_ball' && Number.isFinite(Number(r.aggregateFinish))) {
          const finish = clamp(r.aggregateFinish, 0, 18)
          if (finish > 0) lb.aggregateFinish = finish
        }

        // Rows named by the players rather than the team. Kept off when the
        // team name shows, which is what every board did before the question.
        if (r.hideTeamName === true) lb.hideTeamName = true
      }
    }

    // Which teams it is played by. A board stored before sheets existed has
    // none, and is on the trip's only sheet — which is what 'main' is.
    if (audience === 'team') {
      lb.teamSet = typeof r.teamSet === 'string' && r.teamSet ? r.teamSet : 'main'
      // Whether teammates share a tee-sheet slot. Only the non-default is
      // worth a key: absent means together, which is what every board did
      // before the sheet could ask.
      if (r.teeTeams === 'separate') lb.teeTeams = 'separate'

      // Self-picked teams, and their size. The size only means anything
      // with the pick, and is clamped to what the tee sheet can seat when
      // teammates share a slot — a group is at most four.
      if (r.teamPick === 'self') {
        lb.teamPick = 'self'
        const cap = lb.teeTeams === 'separate'
          ? MAX_TEAM_SIZE_SEPARATE : MAX_TEAM_SIZE_TOGETHER
        const size = Number(r.teamSize)
        if (Number.isInteger(size)) {
          lb.teamSize = Math.min(cap, Math.max(MIN_TEAM_SIZE, size))
        }
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
