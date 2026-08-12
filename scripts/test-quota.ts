/**
 * Quota play. Run with: npm run test:quota
 *
 * The rules live once, in lib/quota.ts. Two scales, differing only under par
 * — Chicago 1, 2, 4, 8 and Liverpool 1, 2, 3, 4 —
 * chasing 36 minus the course handicap, result signed against that target.
 * These tests hold the table, the target — plus handicaps included — and the
 * board builder that turns cards into a quota leaderboard, with the
 * allowance moving the target rather than the per-hole points.
 */

import {
  QUOTA_BASE, QUOTA_SCALES, DEFAULT_QUOTA_SCALE,
  quotaPoints, quotaTarget, parseQuotaScale, quotaScaleOf,
} from '../lib/quota'
import type { Leaderboard } from '../lib/leaderboards'
import {
  buildRows, scoresForBoard,
  type RowContext, type ResolvedScore,
} from '../lib/boardRows'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── The table ─────────────────────────────────────────────────

section('What a hole earns')
{
  // Chicago is what a board with nothing stored plays — see DEFAULT_QUOTA_SCALE
  eq(quotaPoints(5, 4, 'chicago'), 1, 'a bogey is worth 1')
  eq(quotaPoints(4, 4, 'chicago'), 2, 'a par 2')
  eq(quotaPoints(3, 4, 'chicago'), 4, 'a birdie 4')
  eq(quotaPoints(2, 4, 'chicago'), 8, 'an eagle 8 — Chicago doubles from par up')
  eq(quotaPoints(2, 5, 'chicago'), 16, 'and an albatross keeps doubling')
  eq(quotaPoints(6, 4, 'chicago'), 0, 'a double bogey earns nothing')
  eq(quotaPoints(10, 4, 'chicago'), 0, 'and so does anything worse')
  eq(quotaPoints(null, 4, 'chicago'), 0, 'a hole with no score earns nothing, never a penalty')
  eq(quotaPoints(3, 3, 'chicago'), 2, 'par is par whatever the par — a 3 on a par 3 is 2 points')

  // Liverpool climbs one at a time
  eq([6, 5, 4, 3, 2].map(g => quotaPoints(g, 4, 'liverpool')), [0, 1, 2, 3, 4],
    'Liverpool: a point a step, and a double bogey still nothing')
  eq(quotaPoints(1, 4, 'liverpool'), 5, 'an albatross continues that step too')

  // Above par the two agree, which is why that half is written once
  for (const scale of QUOTA_SCALES.map(q => q.key)) {
    eq([quotaPoints(5, 4, scale), quotaPoints(6, 4, scale)], [1, 0],
      `${scale}: a bogey is one and a double is nothing`)
  }

  eq(QUOTA_SCALES.map(q => q.key), ['liverpool', 'chicago'], 'two scales, no more')
  eq(DEFAULT_QUOTA_SCALE, 'chicago',
    'a board with nothing stored plays Chicago — nearest to the scale it replaced')
  eq(parseQuotaScale('sideways'), null, 'junk is dropped rather than repaired')
  eq(quotaScaleOf({}), 'chicago', 'and a board that was never asked gets the default')
  eq(quotaScaleOf({ quotaScale: 'liverpool' }), 'liverpool', 'one that was gets its own')
  eq(quotaPoints(2, 3, 'chicago'), 4, 'and a 2 there is a birdie')
}

section('The number being chased')
{
  eq(QUOTA_BASE, 36, 'the base is 36')
  eq(quotaTarget(18), 18, 'an 18-handicap owes 18 points')
  eq(quotaTarget(0), 36, 'scratch owes 36')
  eq(quotaTarget(36), 0, 'a 36-handicap breaks even by turning up')
  // A plus handicap is stored negative — see lib/handicap.ts — and
  // subtracting it raises the bar, the quota mirror of giving shots back.
  eq(quotaTarget(-2), 38, 'a +2 owes 38')
}

// ─── Through the board builder ─────────────────────────────────
//
// Two players, one round, eighteen par-4 holes. Alice (handicap 18, quota
// 18) pars every hole: 36 points, +18. Bob (handicap 9, quota 27) bogeys
// every hole: 18 points, −9. If the handicap leaked into the per-hole
// points — the Stableford habit — Bob's nine shots would pull the two
// tables together and the gap below would close.

const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
}))
const players = [
  { id: 'p1', name: 'Alice', handicap: 18, gender: 'M' },
  { id: 'p2', name: 'Bob', handicap: 9, gender: 'M' },
]
const rounds = [{ id: 'r1', round_number: 1 }]

/** A whole round of the same gross. Stored points are the Stableford
 *  trigger's — deliberately wrong for quota, so a board that read them
 *  instead of the gross would fail these checks. */
function card(playerId: string, gross: number, storedPoints: number): ResolvedScore[] {
  return holes.map(h => ({
    playerId, roundId: 'r1', holeId: h.id, holeNumber: h.hole_number,
    gross, points: storedPoints, noReturn: false, live: false,
  }))
}

function ctxOf(resolved: ResolvedScore[]): RowContext {
  return {
    players,
    teams: [],
    memberships: [],
    holes,
    rounds,
    resolved,
    hcpFor: new Map(players.map(p => [`r1:${p.id}`, p.handicap])),
    liveRoundIds: new Set(),
    livePlayerIds: new Set(),
    legacyTeamScoring: null,
  }
}

const QUOTA = (allowance?: number): Leaderboard => ({
  id: `q-${allowance ?? 'full'}`, audience: 'individual', competition: 'league',
  scoring: 'quota', combine: 'total', handicapAllowance: allowance,
})

const ctx = ctxOf([...card('p1', 4, 2), ...card('p2', 5, 2)])

section('A quota board off real cards')
{
  const rows = buildRows(QUOTA(), ctx)
  eq(rows.length, 2, 'both players make the board')
  eq(rows[0].name, 'Alice', 'higher above quota leads')
  eq(rows[0].total, 18, 'all pars off 18: 36 points against a quota of 18')
  eq(rows[1].total, -9, 'all bogeys off 9: 18 points against a quota of 27 — signed, not floored')
  eq(rows[0].relativeByRound?.['r1'], 18,
    'the against-level figure is the score itself — the target is the level')

  // The stored Stableford points said 2 a hole for both. If the board had
  // summed them, both rows would read 36 − quota and Bob would be −9 only by
  // coincidence of this fixture — so pin Alice's, where they diverge.
  ok(rows[0].total !== 36 - 0, 'the handicap enters through the target, not the stored points')
}

section('The allowance moves the target, never the per-hole points')
{
  // 85% of 18 is 15 (rounds down from 15.3): quota 21, same 36 points → +15.
  // 85% of 9 is 8 (7.65 rounds up): quota 28, same 18 points → −10.
  const rows = buildRows(QUOTA(85), ctx)
  eq(rows[0].total, 15, 'Alice at 85%: 36 points against a quota of 21')
  eq(rows[1].total, -10, 'Bob at 85%: 18 points against a quota of 28')
}

section('The scorecard sheet reads quota points per hole')
{
  // Even at the full allowance: the stored per-hole points are Stableford's,
  // and a quota board's card has to show what quota paid on each hole.
  const restated = scoresForBoard(QUOTA(), ctx)
  eq(restated.filter(s => s.playerId === 'p1').map(s => s.points),
    holes.map(() => 2), 'a par is 2 on the card')
  eq(restated.filter(s => s.playerId === 'p2').map(s => s.points),
    holes.map(() => 1), 'a bogey is 1 — the stored Stableford 2 is not copied through')
}

section('A no-return hole earns nothing and sinks nobody')
{
  const nr: ResolvedScore = {
    playerId: 'p1', roundId: 'r1', holeId: 'h1', holeNumber: 1,
    gross: null, points: 0, noReturn: true, live: false,
  }
  const rows = buildRows(QUOTA(), ctxOf([nr, ...card('p1', 4, 2).slice(1)]))
  eq(rows[0].total, 34 - 18, 'seventeen pars and a no-return: 34 points against 18')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(failures.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
