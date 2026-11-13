/**
 * Every shape of event the platform already holds, as stored boards — the
 * fixture set `test:event-shape` reads through the rule (lib/eventShape.ts).
 * Built from the same constructors the app uses, so a stored shape here is a
 * stored shape there. Add a case when a new shape of event appears.
 */

import type { Leaderboard } from '../../lib/leaderboards'
import { sessionBoard, overallBoard } from '../../lib/sessions'
import { matchTallyBoard, leagueTagBoard } from '../../lib/leaderboards'
import type { MainBoard, StoredShape } from '../../lib/eventShape'

const SF: Leaderboard = { id: 'sf', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total' }
const ST: Leaderboard = { id: 'st', audience: 'individual', competition: 'league', scoring: 'strokes', combine: 'total' }
const BB = (id: string, roundIds?: string[]): Leaderboard => ({
  id, audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total',
  teamFormat: 'better_ball', ...(roundIds ? { roundIds } : {}),
})
const KO: Leaderboard = { id: 'ko', audience: 'individual', competition: 'matchplay' }

export type ShapeCase = {
  name: string
  boards: Leaderboard[]
  roundIds: string[]
  tags: number
  /** What the stored boards say — what every screen reads. */
  stored: StoredShape['main']
  /** What the rule would choose for the same golf, were the event made today. */
  rule: MainBoard
  /** What each shown board is called, in list order. */
  names?: Record<string, string>
}

export const SHAPE_CASES: ShapeCase[] = [
  {
    name: 'a trip with one Stableford board',
    boards: [SF], roundIds: ['r1', 'r2', 'r3'], tags: 0,
    stored: 'league', rule: 'league', names: { sf: 'Leaderboard' },
  },
  {
    name: 'a one-round club Stableford at 95%',
    boards: [{ ...SF, handicapAllowance: 95 }], roundIds: ['r1'], tags: 0,
    stored: 'league', rule: 'league', names: { sf: 'Leaderboard' },
  },
  {
    name: 'two boards on every round, Stableford then strokes',
    boards: [SF, ST], roundIds: ['r1', 'r2'], tags: 0,
    stored: 'league', rule: 'league', names: { sf: 'Primary', st: 'Strokes' },
  },
  {
    name: 'a league with a better-ball day board on day 2',
    boards: [SF, BB('bb2', ['r2'])], roundIds: ['r1', 'r2'], tags: 0,
    stored: 'league', rule: 'ask', names: { sf: 'Primary', bb2: 'Team better ball' },
  },
  {
    name: 'a league whose round 2 plays off 85%',
    boards: [{ ...SF, roundAllowances: { r2: 85 } }], roundIds: ['r1', 'r2'], tags: 0,
    stored: 'league', rule: 'league', names: { sf: 'Leaderboard' },
  },
  {
    name: 'a league with a tags board beside it',
    boards: [SF, leagueTagBoard()], roundIds: ['r1', 'r2'], tags: 2,
    stored: 'league', rule: 'league', names: { sf: 'Primary' },
  },
  {
    name: 'a trip with a league and a knockout',
    boards: [SF, KO], roundIds: ['r1', 'r2'], tags: 0,
    stored: 'league', rule: 'league', names: { sf: 'Primary', ko: 'Knockout' },
  },
  {
    name: 'a knockout event',
    boards: [KO, matchTallyBoard()], roundIds: [], tags: 2,
    stored: 'knockout', rule: 'league', names: { ko: 'Knockout' },
  },
  {
    name: 'a Ryder Cup: fourball, foursomes, singles, two tags',
    boards: [
      overallBoard({ ranks: 'tags' }),
      sessionBoard({ kind: 'matches', match: 'fourball' }, 'r1', 'day:r1'),
      sessionBoard({ kind: 'matches', match: 'foursomes' }, 'r2', 'day:r2'),
      sessionBoard({ kind: 'matches', match: 'singles' }, 'r3', 'day:r3'),
    ],
    roundIds: ['r1', 'r2', 'r3'], tags: 2,
    stored: 'overall', rule: 'overall', names: { 'lb-overall': 'Overall' },
  },
  {
    name: 'an Overall with a Stableford day, a Matches day and a TBC session',
    boards: [
      overallBoard({ ranks: 'individuals' }),
      sessionBoard({ kind: 'stroke', audience: 'individual', scoring: 'stableford' }, 'r1', 'day:r1'),
      sessionBoard({ kind: 'matches', match: 'singles' }, 'r2', 'day:r2'),
      { ...ST, id: 'sec' },
    ],
    roundIds: ['r1', 'r2', 'r3'], tags: 0,
    stored: 'overall', rule: 'overall', names: { 'lb-overall': 'Overall', sec: 'Strokes' },
  },
  {
    // Made with Dynamic = Yes before the rule: stays an Overall (stored is the truth).
    name: 'an Overall made over identical Stableford sessions',
    boards: [
      overallBoard({ ranks: 'individuals' }),
      sessionBoard({ kind: 'stroke', audience: 'individual', scoring: 'stableford' }, 'r1', 'day:r1'),
      sessionBoard({ kind: 'stroke', audience: 'individual', scoring: 'stableford' }, 'r2', 'day:r2'),
    ],
    roundIds: ['r1', 'r2'], tags: 0,
    stored: 'overall', rule: 'league', names: { 'lb-overall': 'Overall' },
  },
  {
    name: 'an event with no boards yet',
    boards: [], roundIds: ['r1'], tags: 0,
    stored: 'league', rule: 'league',
  },
]
