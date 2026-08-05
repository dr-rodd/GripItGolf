/**
 * Handicap allowance tests. Run with: npm run test:handicap-allowance
 *
 * Competitive golf plays off a percentage of the course handicap — 85% for a
 * four-ball, 95% for a singles. The percentage belongs to the competition, so
 * one trip can run two boards on two different allowances off the same cards.
 *
 * Four things have to hold, and each of them is a way of getting a number
 * wrong that nobody would notice until prizes were being handed out:
 *
 *   · the reduction rounds to the nearest shot, the way WHS says, rather than
 *     truncating — the two disagree at exactly the handicaps most argued about
 *   · a board at the full handicap is byte-for-byte what it was before this
 *     existed, points included. Every trip on the platform predates it
 *   · a board under a reduction genuinely scores differently — on Stableford,
 *     on strokes, and through a team format
 *   · the card that opens off a board row agrees with the board's total. A
 *     board reading 33 whose scorecard adds to 36 is a bug report
 */

import {
  FULL_ALLOWANCE, MIN_ALLOWANCE, ALLOWANCE_PRESETS,
  clampAllowance, allowanceOf, allowedHandicap, suggestedAllowance,
  describeAllowance, allowanceCycle, hasReduction,
} from '../lib/handicapAllowance'
import {
  type Leaderboard, parseLeaderboards, boardRules, offersAllowance,
} from '../lib/leaderboards'
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

// ─── The reduction itself ──────────────────────────────────────

section('A course handicap reduced to an allowance')
{
  eq(allowedHandicap(18, 100), 18, 'the full allowance is the handicap untouched')
  eq(allowedHandicap(0, 85), 0, 'scratch stays scratch')

  // 18 × 0.85 = 15.3. Truncation and rounding agree here.
  eq(allowedHandicap(18, 85), 15, '18 off 85% is 15')
  // 17 × 0.85 = 14.45 — rounds down, and truncation would agree
  eq(allowedHandicap(17, 85), 14, '17 off 85% is 14')
  // 16 × 0.85 = 13.6 — rounds UP to 14, where truncation would say 13.
  // This is the check that pins rounding rather than truncation.
  eq(allowedHandicap(16, 85), 14, '16 off 85% is 14, not 13 — nearest shot, not truncated')
  // 10 × 0.95 = 9.5 — the exact half, which must go up
  eq(allowedHandicap(10, 95), 10, '10 off 95% is 10 — a half rounds up')
  eq(allowedHandicap(9, 95), 9, '9 off 95% is 9')
  eq(allowedHandicap(30, 90), 27, '30 off 90% is 27')

  // A plus handicap is a negative number and reduces the same way
  eq(allowedHandicap(-2, 90), -2, 'a plus handicap rounds by the same rule')
  eq(allowedHandicap(-4, 50), -2, 'and halves like any other')
}

section('What a board says it plays off')
{
  eq(allowanceOf({}), 100, 'a board with no allowance plays off all of it')
  eq(allowanceOf({ handicapAllowance: 85 }), 85, 'and one with an allowance plays off that')

  eq(clampAllowance(undefined), 100, 'nothing readable is no reduction')
  eq(clampAllowance('nonsense'), 100, 'and so is nonsense')
  eq(clampAllowance(85), 85, 'a whole percentage is itself')
  eq(clampAllowance(87.4), 87, 'a fraction of a percent is rounded away')
  eq(clampAllowance(140), FULL_ALLOWANCE, 'nobody plays off more than their handicap')
  eq(clampAllowance(0), MIN_ALLOWANCE, 'and there is a floor under the reduction')

  eq(describeAllowance(100), 'Full course handicap', 'the full figure is named, not printed as 100%')
  eq(describeAllowance(85), '85% of course handicap', 'a reduction is printed as what it is')
}

// ─── What the rules recommend ──────────────────────────────────

section('The recommended allowance')
{
  const league = { competition: 'league' as const }
  eq(suggestedAllowance({ ...league, audience: 'individual' }), 95,
    'a singles competition is 95%')
  eq(suggestedAllowance({ ...league, audience: 'team', teamFormat: 'better_ball' }), 85,
    'a four-ball is 85%')
  eq(suggestedAllowance({ ...league, audience: 'team', teamFormat: 'hero' }), 85,
    'and so is every other way of combining individual cards')
  eq(suggestedAllowance({ competition: 'matchplay', audience: 'individual' }), 100,
    'a draw is left at the full handicap — its rule is a different calculation')

  ok(ALLOWANCE_PRESETS.includes(95) && ALLOWANCE_PRESETS.includes(85),
    'both recommendations are one tap away')
  ok(ALLOWANCE_PRESETS[0] === FULL_ALLOWANCE, 'and turning it off is the first of them')
}

section('When the question is asked')
{
  ok(!offersAllowance({}), 'not before the board knows anything')
  ok(!offersAllowance({ audience: 'individual', competition: 'matchplay' }),
    'never of a draw')
  ok(!offersAllowance({ audience: 'team', competition: 'league', scoring: 'stableford' }),
    'and not of a team board until it says how the players combine — the ' +
    'recommendation depends on the answer')
  ok(offersAllowance({ audience: 'individual', competition: 'league', scoring: 'stableford' }),
    'asked of an individual league once it is scored')
  ok(offersAllowance({
    audience: 'team', competition: 'league', scoring: 'strokes', teamFormat: 'hero',
  }), 'and of a team league once it combines')
}

// ─── Storage ───────────────────────────────────────────────────

section('Reading it back')
{
  const stored = [{
    id: 'x', audience: 'team', competition: 'league',
    scoring: 'stableford', teamFormat: 'better_ball', combine: 'total',
    handicapAllowance: 85,
  }]
  eq(parseLeaderboards(stored)[0].handicapAllowance, 85, 'an allowance survives the round trip')

  const full = parseLeaderboards([{ ...stored[0], handicapAllowance: 100 }])[0]
  ok(!('handicapAllowance' in full),
    'no reduction is stored as no field — a trip that never asked reads back exactly as it did')

  const none = parseLeaderboards([{ ...stored[0], handicapAllowance: undefined }])[0]
  ok(!('handicapAllowance' in none), 'and so does one that has never heard of the question')

  eq(parseLeaderboards([{ ...stored[0], handicapAllowance: 900 }])[0].handicapAllowance, undefined,
    'a stored value above 100 is clamped back to no reduction and disappears')
  eq(parseLeaderboards([{ ...stored[0], handicapAllowance: 84.6 }])[0].handicapAllowance, 85,
    'and a fraction is rounded on the way in')

  const board = parseLeaderboards(stored)[0]
  ok(boardRules(board).includes('85% of course handicap'),
    'a board says what it is played off')
  ok(!boardRules(parseLeaderboards([{ ...stored[0], handicapAllowance: 100 }])[0])
    .includes('course handicap'),
    'and says nothing at all when there is nothing to say')
}

// ─── Cycling through them on a scorecard ───────────────────────

const SF = (allowance?: number): Leaderboard => ({
  id: `sf-${allowance ?? 'full'}`, audience: 'individual', competition: 'league',
  scoring: 'stableford', combine: 'total', handicapAllowance: allowance,
})
const TEAM = (allowance?: number): Leaderboard => ({
  id: `team-${allowance ?? 'full'}`, audience: 'team', competition: 'league',
  scoring: 'stableford', teamFormat: 'better_ball', combine: 'total',
  handicapAllowance: allowance,
})
const DRAW: Leaderboard = { id: 'draw', audience: 'individual', competition: 'matchplay' }

section('The handicaps one scorecard has to be able to show')
{
  const none = allowanceCycle([SF(), TEAM()])
  eq(none.steps, [100], 'a trip that reduces nothing has one handicap')
  ok(!hasReduction(none.steps), 'so the card needs no control at all')

  const two = allowanceCycle([TEAM(85), SF(95)])
  eq(two.steps, [100, 95, 85], 'every allowance in play, highest first, the full figure included')
  ok(hasReduction(two.steps), 'and a control to walk them')
  eq(two.steps[two.startIndex], 85, 'opening on the primary board — the first one made')

  const other = allowanceCycle([SF(95), TEAM(85)])
  eq(other.steps[other.startIndex], 95, 'whichever board that is')

  eq(allowanceCycle([SF(85), TEAM(85)]).steps, [100, 85],
    'two boards on the same allowance are one step')

  const led = allowanceCycle([DRAW, TEAM(85)])
  eq(led.steps, [100, 85], 'a draw contributes no allowance of its own')
  eq(led.steps[led.startIndex], 100, 'and a trip it leads opens on the full handicap')

  eq(allowanceCycle([]).steps, [100], 'a trip with no boards still knows one handicap')
}

// ─── The maths, driven through the real board builder ──────────
//
// Two players, one round, eighteen par-4 holes with stroke indexes 1..18, and
// a gross of 5 everywhere. Both play off 18.
//
//   At the full handicap: one shot a hole, nett 4, two points a hole  → 36
//   At 85%:  18 → 15 shots. SI 1-15 get a shot (2 points, 30) and SI 16, 17,
//            18 do not (nett 5, one point, 3)                        → 33
//
// The gap is what makes this a real check: a reduction that quietly did
// nothing would still produce 36.

const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
}))
const players = [
  { id: 'p1', name: 'Alice', handicap: 18, gender: 'M' },
  { id: 'p2', name: 'Bob', handicap: 18, gender: 'M' },
]
const rounds = [{ id: 'r1', round_number: 1 }]

/** A whole round of the same gross, with the points the trigger would store. */
function card(playerId: string, gross: number, storedPoints: number): ResolvedScore[] {
  return holes.map(h => ({
    playerId, roundId: 'r1', holeId: h.id, holeNumber: h.hole_number,
    gross, points: storedPoints, noReturn: false, live: false,
  }))
}

function ctxOf(resolved: ResolvedScore[]): RowContext {
  return {
    players,
    teams: [{ id: 't1', name: 'Reds', color: '#f00', team_set: 'main' }],
    memberships: players.map(p => ({ team_id: 't1', team_set: 'main', player_id: p.id })),
    holes,
    rounds,
    resolved,
    hcpFor: new Map(players.map(p => [`r1:${p.id}`, 18])),
    liveRoundIds: new Set<string>(),
    livePlayerIds: new Set<string>(),
    legacyTeamScoring: null,
  }
}

const bothCards = [...card('p1', 5, 2), ...card('p2', 5, 2)]
const ctx = ctxOf(bothCards)

section('Stableford under a reduction')
{
  const full = buildRows(SF(), ctx)
  eq(full[0].total, 36, 'off the full handicap a card of 5s is level — 36 points')

  const reduced = buildRows(SF(85), ctx)
  eq(reduced[0].total, 33,
    'off 85% the three highest stroke indexes lose their shot — 33 points')

  eq(buildRows(SF(100), ctx)[0].total, 36,
    'an allowance written down as 100 is the same board as one with none')
}

section('A hole nobody finished')
{
  const nr = ctxOf([
    ...card('p1', 5, 2).slice(0, 17),
    { playerId: 'p1', roundId: 'r1', holeId: 'h18', holeNumber: 18, gross: null, points: 0, noReturn: true, live: false },
    ...card('p2', 5, 2),
  ])
  // Hole 18 is SI 18, which scores 1 point at 85% and 2 at full — so the
  // no-return has to be worth zero either way, not the hole's value.
  eq(buildRows(SF(), nr).find(r => r.id === 'p1')!.total, 34,
    'a no return is worth nothing off the full handicap')
  eq(buildRows(SF(85), nr).find(r => r.id === 'p1')!.total, 32,
    'and still nothing under a reduction — 17 holes, three of them short a shot')
}

section('Strokes under a reduction')
{
  const ST = (allowance?: number): Leaderboard => ({
    id: 'st', audience: 'individual', competition: 'league',
    scoring: 'strokes', combine: 'total', handicapAllowance: allowance,
  })
  eq(buildRows(ST(), ctx)[0].total, 72, 'gross 90, eighteen shots back, nett 72')
  eq(buildRows(ST(85), ctx)[0].total, 75, 'off 85% only fifteen shots come back — nett 75')
}

section('A team format under a reduction')
{
  // Better ball, two scores counting, both players identical: the team's hole
  // is both of their scores added, so the round is twice the individual one.
  eq(buildRows(TEAM(), ctx)[0].total, 72, 'the pair off the full handicap')
  eq(buildRows(TEAM(85), ctx)[0].total, 66, 'and off 85%, six points worse between them')
}

section('The scorecard agrees with the board it opened from')
{
  ok(scoresForBoard(SF(), ctx) === ctx.resolved,
    'a board at the full handicap reads the stored points, untouched')

  const restated = scoresForBoard(SF(85), ctx)
  const mine = restated.filter(s => s.playerId === 'p1')
  eq(mine.reduce((sum, s) => sum + s.points, 0), 33,
    'and one under a reduction hands back a card that adds to the board total')
  eq(mine.find(s => s.holeNumber === 18)!.points, 1,
    'hole by hole, not just in the total')
  eq(mine.find(s => s.holeNumber === 1)!.points, 2,
    'and only where the shot was actually lost')
  eq(mine.map(s => s.gross).filter(g => g !== 5).length, 0,
    'gross is never touched by any of it')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} failed`)
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
