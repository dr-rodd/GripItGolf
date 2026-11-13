/**
 * Stroke foursomes, a team format (D88). Run with: npm run test:foursomes
 *
 * One ball a pair, alternate shot, off half the partners' combined course
 * handicaps — summed unrounded, the allowance taken once. One card a pair,
 * kept under one of them; totals on the board like any team format.
 */

import fs from 'fs'
import { buildRows } from '../lib/boardRows'
import { buildRowContext } from '../lib/rowContext'
import type { Leaderboard } from '../lib/leaderboards'
import { TEAM_FORMATS, boardTitle, boardFacts, parseLeaderboards } from '../lib/leaderboards'
import { suggestedAllowance } from '../lib/handicapAllowance'
import { teamHolePoints, DEFAULT_TEAM_SCORING } from '../lib/teamScoring'
import { foursomesPairs } from '../lib/partnerships'
import { eventShape, givesOwnCards, unreadRounds } from '../lib/eventShape'
import { describeFormat, type SessionFormat } from '../lib/sessions'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  ok(g === w, `${label} — got ${g}, want ${w}`)
}
const section = (n: string) => console.log(`\n${n}`)

const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
  par_ladies: null, stroke_index_ladies: null,
}))
const players = [
  { id: 'a', name: 'Ross Kelly', handicap: 10, gender: 'M' },
  { id: 'b', name: 'Dave Byrne', handicap: 21, gender: 'M' },
  { id: 'c', name: 'Cara Walsh', handicap: 4, gender: 'F' },
  { id: 'd', name: 'Dan Nolan', handicap: 6, gender: 'M' },
]
const teams = [{ id: 't1', name: 'Team A', color: '#000', team_set: 'set-2' }, { id: 't2', name: 'Team B', color: '#111', team_set: 'set-2' }]
const memberships = [
  { team_id: 't1', team_set: 'set-2', player_id: 'a' }, { team_id: 't1', team_set: 'set-2', player_id: 'b' },
  { team_id: 't2', team_set: 'set-2', player_id: 'c' }, { team_id: 't2', team_set: 'set-2', player_id: 'd' },
]
// The pair's one ball under its first member: a 5 on every hole; the other pair a 4.
const scores = [
  ...holes.map(h => ({ player_id: 'a', round_id: 'r1', hole_id: h.id, gross_score: 5, stableford_points: 1, no_return: false })),
  ...holes.map(h => ({ player_id: 'c', round_id: 'r1', hole_id: h.id, gross_score: 4, stableford_points: 2, no_return: false })),
]
const roundHandicaps = [
  { round_id: 'r1', player_id: 'a', playing_handicap: 10, tee_id: null },
  { round_id: 'r1', player_id: 'b', playing_handicap: 21, tee_id: null },
  { round_id: 'r1', player_id: 'c', playing_handicap: 4, tee_id: null },
  { round_id: 'r1', player_id: 'd', playing_handicap: 6, tee_id: null },
]
const ctx = buildRowContext({
  players, teams, memberships, holes,
  rounds: [{ id: 'r1', round_number: 1 }],
  courseByRound: new Map([['r1', 'c1']]),
  scores, liveScores: [], roundHandicaps, tees: [],
  activeRoundIds: [], livePlayerIds: [], legacyTeamScoring: null,
} as never)
const board = (scoring: 'stableford' | 'strokes', pct = 50): Leaderboard => ({
  id: 'f', audience: 'team', competition: 'league', scoring, combine: 'total', teamFormat: 'foursomes',
  teamSet: 'set-2', ...(pct !== 100 ? { handicapAllowance: pct } : {}),
})

section('The format')
{
  ok(TEAM_FORMATS.some(f => f.key === 'foursomes'), 'offered beside better ball, hero and the cut')
  eq(boardTitle(board('stableford')), 'Team foursomes', 'its tab')
  ok(boardFacts(board('stableford')).includes('Foursomes') && boardFacts(board('stableford')).includes('50% handicap'), 'its facts')
  eq(suggestedAllowance({ competition: 'league', audience: 'team', teamFormat: 'foursomes' }), 50, 'half, by default')
  eq(parseLeaderboards([board('stableford')]).length, 1, 'stored and read back')
  const f: SessionFormat = { kind: 'stroke', audience: 'team', scoring: 'stableford', teamFormat: 'foursomes' }
  eq(describeFormat(f), 'Team foursomes · Stableford', 'described')
  ok(!givesOwnCards(f), 'one ball a pair: no card of each player’s own')
  eq(eventShape({ formats: [f, f], tags: 0 }).main, 'league', 'foursomes every round: one total')
  eq(eventShape({ formats: [{ kind: 'stroke', audience: 'individual', scoring: 'stableford' }, f], tags: 0 }).main, 'overall',
    'beside an individual round: the Overall, since no one total reads both')
}

section('Off half the combined handicaps, from one ball')
{
  // Team A: 10 + 21 = 31, half 15.5 → 16. A 5 on every hole: shots on SI 1–16.
  // Sixteen holes nett 4 (2 points), two nett 5 (1 point): 34.
  const sf = buildRows(board('stableford'), ctx)
  const a = sf.find(r => r.id === 't1')!
  eq(a.total, 34, 'Team A: 34 points off 16 shots')
  // Team B: 4 + 6 = 10, half 5. A 4 on every hole: five nett 3 (3 points), thirteen nett 4 (2): 41.
  eq(sf.find(r => r.id === 't2')!.total, 41, 'Team B: 41 points off 5 shots')
  eq(sf[0].id, 't2', 'ranked like any team board')
  const st = buildRows(board('strokes'), ctx)
  eq(st.find(r => r.id === 't1')!.total, 90 - 16, 'strokes: the ball less the pair’s shots')
  // At 100% of the combined: 31 shots — one on every hole, two on SI 1–13.
  eq(buildRows(board('stableford', 100), ctx).find(r => r.id === 't1')!.total, 13 * 3 + 5 * 2,
    'the allowance comes off the sum, once')
}

section('One ball: the first member’s, never a best of two')
{
  const inputs = [
    { playerId: 'a', roundId: 'r1', holeNumber: 1, points: 2 },
    { playerId: 'b', roundId: 'r1', holeNumber: 1, points: 4 },
    { playerId: 'b', roundId: 'r1', holeNumber: 2, points: 3 },
  ]
  const holePts = teamHolePoints(['a', 'b'], 'r1', inputs, { ...DEFAULT_TEAM_SCORING, mode: 'foursomes' })
  eq([holePts.get(1), holePts.get(2)], [2, 3], 'a hole is its first member’s score — the partner’s only where the first has none')
}

section('The card and the pairs')
{
  const boards = [board('stableford')]
  eq(foursomesPairs(boards, 'r1', memberships), [['a', 'b'], ['c', 'd']], 'a foursomes round’s pairs')
  eq(foursomesPairs([{ ...board('stableford'), teamFormat: 'better_ball' }], 'r1', memberships), [], 'none on any other board')
  const sf: Leaderboard = { id: 's', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total' }
  const day: Leaderboard = { ...board('stableford'), id: 'lb-round-r2', roundIds: ['r2'] }
  eq(unreadRounds(sf, [sf, day], ['r1', 'r2']), ['r2'], 'an individual board names a foursomes round it cannot read (D87)')
  eq(unreadRounds(day, [sf, day], ['r1', 'r2']), [], '  …the foursomes board itself reads it')
  const flow = fs.readFileSync('app/scoring/LiveScoringFlow.tsx', 'utf-8')
  ok(flow.includes('playerSetups.flatMap(({ player }) => pairOf.get(player.id) ?? [player.id])'), 'the card locks the partner with the lead')
  ok(flow.includes('!partners.has(p.id)') && flow.includes('playerName={nameOf(player)}'), '  …picks the pair once, and names it "Ross & Dave"')
  ok(fs.readFileSync('app/golf/[root]/[tripCode]/scoring/[roundNumber]/page.tsx', 'utf-8').includes('foursomesPairs(boards, thisRound.id'),
    '  …handed the round’s pairs by the page')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(failures.map(f => `  - ${f}`).join('\n')); process.exit(1) }
