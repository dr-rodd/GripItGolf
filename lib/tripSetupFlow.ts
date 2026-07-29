// Trip settings as a decision tree.
//
// The organiser answers a series of questions, in order, scrolling down. Each
// answer decides what appears next: pick teams and a team-scoring question
// opens; pick matchplay alongside teams and a singles-or-pairs question opens;
// pick Custom points and the prize table opens.
//
// This module is the tree itself — which questions exist, which are showing,
// which have been answered and what the answer reads back as. It is pure, so
// the setup screen renders it rather than reimplementing it, and the tests
// walk it without a browser.

import {
  anyLeagueBoard, hasCompetitors, isPairsMatchplay, leagueOn, matchplayOn,
  matchplayFormatIsOpen, LEAGUE_BOARDS, type TripFormats,
} from './formats'
import { describeTeamScoring, type TeamScoring } from './teamScoring'
import { pairsBlockedReason, teamNoun, teamSizeLimit, type MemberLike, type TeamLike } from './teamLimits'

export type StepKey =
  | 'competitors'
  | 'competition'
  | 'boards'
  | 'discard'
  | 'customPoints'
  | 'matchplayFormat'
  | 'teamScoring'
  | 'teams'

export type Step = {
  key: StepKey
  /** Position among the visible steps, 1-based. */
  number: number
  title: string
  question: string
  /** Answered means the question has a usable answer, not merely a value. */
  answered: boolean
  /** Reads the answer back in a line. Null until answered. */
  summary: string | null
  /** Something is wrong with the answer, or missing behind it. */
  warning: string | null
}

export type FlowContext = {
  players: readonly MemberLike[]
  teams: readonly TeamLike[]
  teamScoring: TeamScoring
  customTableLength: number
}

/**
 * The visible steps, in the order they are asked.
 *
 * A step that is not visible is absent rather than flagged: an unanswered
 * question the organiser can't see isn't a question.
 */
export function setupSteps(f: TripFormats, ctx: FlowContext): Step[] {
  const noun = teamNoun(f)
  const playerCount = ctx.players.length
  const out: Omit<Step, 'number'>[] = []

  // ── 1. Who competes ──
  out.push({
    key: 'competitors',
    title: 'Who competes',
    question: 'Is this a team competition or an individual one?',
    answered: hasCompetitors(f),
    summary: !hasCompetitors(f) ? null
      : f.individual && f.teams ? 'Teams and individuals — the team board leads'
      : f.teams ? 'Teams' : 'Individuals',
    warning: hasCompetitors(f) ? null : 'Pick at least one.',
  })

  if (!hasCompetitors(f)) return numbered(out)

  // ── 2. What they play ──
  const anyCompetition = f.league.on || f.matchplay.on
  out.push({
    key: 'competition',
    title: 'The competition',
    question: 'League, matchplay, or both?',
    answered: anyCompetition,
    summary: !anyCompetition ? null
      : f.league.on && f.matchplay.on ? 'League and matchplay'
      : f.league.on ? 'League' : 'Matchplay',
    warning: anyCompetition ? null : 'Pick at least one.',
  })

  if (!anyCompetition) return numbered(out)

  // ── 3. League boards ──
  if (f.league.on) {
    const picked = LEAGUE_BOARDS.filter(b => f.league[b.key])
    out.push({
      key: 'boards',
      title: 'League scoring',
      question: 'How is the league scored?',
      answered: picked.length > 0,
      summary: picked.length > 0 ? picked.map(b => b.label).join(' · ') : null,
      warning: picked.length > 0 ? null : 'Pick a board, or switch the league off.',
    })

    // Drop-worst applies to the two stroke-based boards, not to Custom
    if (f.league.stableford || f.league.strokes) {
      out.push({
        key: 'discard',
        title: 'Discard worst round',
        question: 'Should anyone\'s worst round be dropped?',
        answered: true,   // "keep them all" is a real answer
        summary: f.league.discardWorst === 0
          ? 'Every round counts'
          : `Worst ${f.league.discardWorst === 1 ? 'round' : `${f.league.discardWorst} rounds`} dropped`,
        warning: null,
      })
    }

    if (f.league.custom) {
      const ready = playerCount > 0
      out.push({
        key: 'customPoints',
        title: 'Points by position',
        question: 'What is each finishing position worth?',
        answered: ready,
        summary: ready ? `${ctx.customTableLength} positions paid each round` : null,
        warning: ready ? null : 'Add players first — the table is built from the field.',
      })
    }
  }

  // ── 4. Matchplay format ──
  if (f.matchplay.on) {
    const open = matchplayFormatIsOpen(f)
    out.push({
      key: 'matchplayFormat',
      title: 'Matchplay format',
      question: open ? 'Singles or pairs?' : 'Matchplay is played in singles',
      answered: true,
      summary: isPairsMatchplay(f)
        ? 'Pairs — the draw is between pairings of two'
        : 'Singles — the draw is between players',
      warning: !open && f.matchplay.format === 'pairs'
        ? 'Pairs needs teams. Switch teams on above, or play singles.'
        : null,
    })
  }

  // ── 5. Team scoring, when teams run a league ──
  if (f.teams && leagueOn(f)) {
    out.push({
      key: 'teamScoring',
      title: 'Team scoring',
      question: `How are ${noun.one} points worked out each round?`,
      answered: true,   // there is always a mode; the default is a real answer
      summary: describeTeamScoring(ctx.teamScoring),
      warning: null,
    })
  }

  // ── 6. Team selection ──
  if (f.teams) {
    const picked = ctx.teams.length > 0
    const assigned = ctx.players.filter(p => p.team_id).length
    const blocked = pairsBlockedReason(f, ctx.teams, ctx.players)
    const limit = teamSizeLimit(f)
    out.push({
      key: 'teams',
      title: `Pick ${noun.many}`,
      question: `Who is in which ${noun.one}?`,
      answered: picked && assigned > 0 && blocked === null,
      summary: picked
        ? `${ctx.teams.length} ${ctx.teams.length === 1 ? noun.one : noun.many} · ${assigned} of ${playerCount} placed`
        : null,
      warning: blocked ?? (
        !picked ? `No ${noun.many} yet.`
          : assigned === 0 ? `Nobody is in a ${noun.one} yet.`
          : limit !== null && assigned < playerCount
            ? `${playerCount - assigned} player${playerCount - assigned === 1 ? '' : 's'} still to place.`
            : null
      ),
    })
  }

  return numbered(out)
}

function numbered(steps: Omit<Step, 'number'>[]): Step[] {
  return steps.map((s, i) => ({ ...s, number: i + 1 }))
}

/** The first question still wanting an answer, or null when the tree is done. */
export function nextUnanswered(steps: readonly Step[]): Step | null {
  return steps.find(s => !s.answered) ?? null
}

/** Every visible question answered. */
export function flowComplete(steps: readonly Step[]): boolean {
  return steps.every(s => s.answered)
}

/** Everything still wrong or missing, in the order it is asked. */
export function flowWarnings(steps: readonly Step[]): { step: Step; warning: string }[] {
  return steps
    .filter(s => s.warning !== null)
    .map(s => ({ step: s, warning: s.warning as string }))
}

/**
 * Why an answer cannot be saved, when it would leave nothing to play for.
 *
 * A trip with no competition has no storable form — parseFormats replaces one
 * with the default — so the answer is refused. Which is fine, as long as the
 * refusal points at the switch that does what the organiser meant: unticking
 * the last board is not how you switch the league off.
 */
export function emptyFormatsReason(f: TripFormats): string {
  if (!hasCompetitors(f)) {
    return 'A trip needs someone competing — pick teams or individuals'
  }
  if (!f.league.on && !f.matchplay.on) {
    return 'Switch on a league or a matchplay draw'
  }
  if (f.league.on && !anyLeagueBoard(f)) {
    return 'A league needs a board — pick one, or switch the league off above'
  }
  return 'Keep at least one competition switched on'
}

/**
 * Why the trip cannot go live yet, or null if it can.
 *
 * Deliberately narrower than "every question answered": a trip can be
 * finalised with a half-filled pairing sheet if the organiser insists, but not
 * with no competition at all, and not with a pairs draw that cannot be drawn.
 */
export function finaliseBlockedReason(f: TripFormats, ctx: FlowContext): string | null {
  if (!hasCompetitors(f)) return 'Pick who is competing first.'
  if (!f.league.on && !f.matchplay.on) return 'Pick a competition first.'
  if (f.league.on && !anyLeagueBoard(f)) return 'Pick how the league is scored.'
  if (!leagueOn(f) && !matchplayOn(f)) return 'Nothing is switched on to play for.'
  if (isPairsMatchplay(f)) return pairsBlockedReason(f, ctx.teams, ctx.players)
  return null
}
