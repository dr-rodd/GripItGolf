/**
 * Changing an event's golf after it is made (D89, stage 6). Run with:
 * npm run test:shape-change
 *
 * A change that keeps the shape is made in place; one that crosses between
 * the Primary and the Overall is marked to be asked first, and deletes no
 * board; the Overall never governs a round; and the Formats page has no
 * on/off switch left.
 */

import fs from 'fs'
import { changeRoundFormat, mainStandings } from '../lib/shapeChange'
import { storedShape, roundFormatsOf, boardName, roundLabelOf } from '../lib/eventShape'
import { type SessionFormat, sessionBoard, overallBoard, overallOf } from '../lib/sessions'
import type { Leaderboard } from '../lib/leaderboards'
import { governingBoard } from '../lib/partnerships'
import { buildRowContext } from '../lib/rowContext'

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

const sf = (pct?: number): SessionFormat => ({ kind: 'stroke', audience: 'individual', scoring: 'stableford', ...(pct ? { handicapAllowance: pct } : {}) })
const strokes: SessionFormat = { kind: 'stroke', audience: 'individual', scoring: 'strokes' }
const bb: SessionFormat = { kind: 'stroke', audience: 'team', scoring: 'stableford', teamFormat: 'better_ball' }
const singles: SessionFormat = { kind: 'matches', match: 'singles' }
const fourball: SessionFormat = { kind: 'matches', match: 'fourball' }
const R = ['r1', 'r2', 'r3']
const SF: Leaderboard = { id: 'sf', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total' }
const ids = (bs: readonly Leaderboard[]) => bs.map(b => b.id)

section('A league keeps its shape')
{
  const a = changeRoundFormat([SF], R, 'r2', sf(85), 0)
  eq(a.crossing, null, 'round 2 off 85%: no crossing (D86)')
  eq(a.boards[0].roundAllowances, { r2: 85 }, '  …the round’s own allowance on the board')
  const back = changeRoundFormat(a.boards, R, 'r2', sf(), 0)
  eq(back.boards[0].roundAllowances, undefined, '  …and back to the board’s own')
  const d = changeRoundFormat([SF], R, 'r2', bb, 0)
  eq([d.crossing, ids(d.boards)], [null, ['sf', 'lb-round-r2']], 'round 2 better ball: one total, its own board beside it (D90)')
  eq(roundFormatsOf(d.boards, R).map(f => f && f.kind === 'stroke' ? f.audience : null), ['individual', 'team', 'individual'],
    '  …which is that round’s format')
  const undo = changeRoundFormat(d.boards, R, 'r2', sf(), 0)
  eq(ids(undo.boards), ['sf'], '  …and changed back, the board made for it goes')
  let all: Leaderboard[] = [SF]
  for (const id of R) all = changeRoundFormat(all, R, id, bb, 0).boards
  eq(ids(all), ['sf'], 'every round better ball, one by one: the main board plays it')
  eq([all[0].audience, all[0].teamFormat], ['team', 'better_ball'], '  …as a team board')
  ok(!!all[0].teamSet && all[0].teamSet !== 'main', '  …off the tags’ sheet')
}

section('A league crossing to the Overall asks first and deletes nothing')
{
  const m = changeRoundFormat([SF], R, 'r2', singles, 2)
  eq(m.crossing, 'to_overall', 'a round of Matches: the Overall (D80, D81)')
  eq(storedShape(m.boards).main, 'overall', '  …once said yes')
  ok(ids(m.boards).includes('sf'), '  …the league board kept beside it')
  eq(m.boards.filter(b => b.session).map(b => b.roundIds![0]), ['r1', 'r2', 'r3'], '  …a session a round')
  eq(roundFormatsOf(m.boards, R).map(f => f?.kind), ['stroke', 'matches', 'stroke'], '  …each in the format it plays')
  eq(overallOf(m.boards)?.overall?.ranks, 'tags', '  …ranking the two tags')
  eq(roundLabelOf(m.boards, 'r2', 2), 'Session 2', '  …Round 2 now Session 2')
  ok(R.every(id => governingBoard(m.boards, id)?.competition !== 'overall'), 'the Overall never governs a round')
  eq(changeRoundFormat([SF], R, 'r3', strokes, 0).crossing, 'to_overall',
    'Stableford beside strokes: the Overall too (Ross, 13 Nov 2026)')
}

section('An Overall')
{
  const ryder: Leaderboard[] = [
    overallBoard({ ranks: 'tags' }),
    sessionBoard(fourball, 'r1', 'day:r1'), sessionBoard(sf(), 'r2', 'day:r2'),
  ]
  const two = ['r1', 'r2']
  const tbc = changeRoundFormat(ryder, two, 'r2', null, 2)
  eq([tbc.crossing, tbc.boards.length], [null, 2], 'a session made TBC: no crossing, its board gone as built')
  const swap = changeRoundFormat(ryder, two, 'r2', singles, 2)
  eq(swap.crossing, null, 'Stableford to singles: still the Overall')
  const one = changeRoundFormat(ryder, two, 'r1', sf(), 2)
  eq(one.crossing, 'to_league', 'every session one stroke format: one total offered')
  eq(storedShape(one.boards).main, 'league', '  …said yes, a league')
  eq(boardName(one.boards[0], one.boards), 'Primary', '  …its main board the Primary beside the sessions’ own')
  ok(one.boards.filter(b => b.session).length === 2, '  …every session’s own board kept (as built)')
  eq(storedShape(one.staying!).main, 'overall', '  …or kept as an Overall, the change made')
  eq(roundFormatsOf(one.staying!, two).map(f => f?.kind), ['stroke', 'stroke'], '  …with the new format')
  const there = changeRoundFormat([SF], R, 'r2', singles, 0).boards
  const andBack = changeRoundFormat(there, R, 'r2', sf(), 0)
  eq(andBack.crossing, 'to_league', 'there and back: asked both ways')
  ok(['sf'].every(id => ids(andBack.boards).includes(id)), '  …nothing that was there is lost')
  eq(boardName(andBack.boards.find(b => b.id === 'sf')!, andBack.boards), 'Primary', '  …the old board leads again')
}

section('Standings before and after')
{
  const ctx = buildRowContext({
    players: [{ id: 'p1', name: 'Alice', handicap: 10, gender: 'M' }], teams: [], memberships: [], holes: [],
    rounds: [], courseByRound: new Map(), scores: [], liveScores: [], roundHandicaps: [], tees: [],
    activeRoundIds: [], livePlayerIds: [], legacyTeamScoring: null,
  } as never)
  eq(mainStandings([SF], ctx).title, 'Leaderboard', 'a league’s standings are its main board’s')
  eq(mainStandings([overallBoard({ ranks: 'individuals' })], ctx).title, 'Overall', 'an Overall’s are the Overall’s')
  eq(mainStandings([], ctx).rows, [], 'no board, no rows')
}

section('The Formats page')
{
  const client = fs.readFileSync('app/golf/[root]/[tripCode]/organiser/sessions/SessionsClient.tsx', 'utf-8')
  ok(!client.includes('withOverallOn') && !client.includes('Turn the Dynamic Overall Leaderboard'),
    'no Overall on/off switch — changing the formats is the switch')
  ok(client.includes('changeRoundFormat(boards, roundIds, roundId, format, tagCount)'), 'every change goes through the one rule')
  ok(client.includes("'/api/event/shape-preview'") && client.includes("table(asking.preview.before, 'Now')"),
    'a crossing shows the standings before and after')
  ok(client.includes('Keep the Overall'), '  …and an Overall may stay one')
  const org = fs.readFileSync('app/golf/[root]/[tripCode]/organiser/OrganiserClient.tsx', 'utf-8')
  ok(org.includes('label="Formats"') && !org.includes('Turn it on here'), 'the organiser area’s row is Formats')
  const route = fs.readFileSync('app/api/event/shape-preview/route.ts', 'utf-8')
  ok(route.includes('entryAllowed(publicHash') && !/\.(insert|update|upsert|delete)\(/.test(route),
    'the preview honours the public PIN and writes nothing')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(failures.map(f => `  - ${f}`).join('\n')); process.exit(1) }
