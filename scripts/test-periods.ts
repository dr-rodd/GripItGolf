/**
 * A continuous league's periods. Run with: npm run test:periods
 *
 * The rules (lib/leagueSetup.ts): the equal run, what a stored setup keeps,
 * which period a date is in, and when a card may be dated. Then the board
 * (lib/periodCards.ts + `withPeriods` in lib/boardRows.ts): each player's
 * cards in a period read as one round — the best card, or the best on each
 * hole — measured exactly as the board measures any round.
 */

import {
  equalPeriods, periodsIssue, tidyPeriods, parseLeagueSetup, periodOf, periodNow,
  periodCardIssue, asksRoundDeadlines, isPeriodLeague, describeLeagueSetup,
  periodRoundId, periodLabel, addMonths, starterBoards, type LeaguePeriod,
} from '../lib/leagueSetup'
import { pickPeriodCard, bestCard } from '../lib/periodCards'
import { buildRows, withOnlyRounds, type RowContext, type ResolvedScore, type RowHole } from '../lib/boardRows'
import type { Leaderboard } from '../lib/leaderboards'
import type { RoundCard } from '../lib/golfIreland'
import fs from 'fs'

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
const read = (p: string) => fs.readFileSync(p, 'utf-8')

// ─── The rules ─────────────────────────────────────────────────

section('The equal run')
{
  eq(equalPeriods('2026-11-01', 4, 'week', 3), [
    { key: 'p1', start: '2026-11-01', end: '2026-11-28' },
    { key: 'p2', start: '2026-11-29', end: '2026-12-26' },
    { key: 'p3', start: '2026-12-27', end: '2027-01-23' },
  ], 'three four-week periods, back to back, each ending the day before the next')
  eq(equalPeriods('2026-01-31', 1, 'month', 3).map(p => [p.start, p.end]), [
    ['2026-01-31', '2026-02-27'], ['2026-02-28', '2026-03-30'], ['2026-03-31', '2026-04-29'],
  ], 'a month on from the 31st is the last of a short month, never the 3rd of the next')
  eq(addMonths('2028-01-31', 1), '2028-02-29', 'and a leap year\'s February has its 29th')
  eq(equalPeriods('nonsense', 4, 'week', 3), [], 'a malformed start makes nothing')
  eq(equalPeriods('2026-11-01', 0, 'week', 3), [], 'nor does a zero length')
  eq(equalPeriods('2026-11-01', 1, 'week', 500).length, 30, 'and the run stops at the ceiling')
  eq(periodsIssue(equalPeriods('2026-11-01', 4, 'week', 3)), null, 'an equal run always stores')
}

section('Periods adjusted by hand')
{
  const run = equalPeriods('2026-11-01', 4, 'week', 3)
  eq(periodsIssue([run[0], { ...run[1], start: '2026-11-20' }]), 'Period 2 starts before period 1 has finished.',
    'an overlap is refused, and said')
  eq(periodsIssue([{ ...run[0], end: '2026-10-01' }]), 'Period 1 finishes before it starts.', 'so is a period backwards')
  eq(periodsIssue([]), 'A league needs at least one period.', 'and none at all')
  eq(periodsIssue([run[0], { ...run[1], key: 'p1' }]), 'Two periods share a key.', 'keys stay unique')
  eq(periodsIssue([run[0], { ...run[2] }]), null, 'a gap between periods is allowed — a break over Christmas')
  eq(tidyPeriods([run[1], run[0]]), [], 'stored out of order, the periods do not read')
}

section('What a stored league keeps')
{
  const periods = equalPeriods('2026-11-01', 4, 'week', 2)
  const base = { format: 'league', entry: 'organiser' }
  const cont = parseLeagueSetup({ ...base, schedule: 'continuous', periods, periodRule: 'composite', courseIds: ['c1', 'c1', 'c2'] })
  eq(cont?.periods, periods, 'a continuous league keeps its periods')
  eq(cont?.periodRule, 'composite', '  …its rule')
  eq(cont?.courseIds, ['c1', 'c2'], '  …and its courses, once each')
  ok(isPeriodLeague(cont), '  …and is a league of periods')
  const best = parseLeagueSetup({ ...base, schedule: 'continuous', periods, periodRule: 'best_card' })
  eq(best?.periodRule, undefined, 'the best card is the absent default')
  const series = parseLeagueSetup({ ...base, schedule: 'series', periods })
  eq(series?.periods, undefined, 'a series never carries periods')
  const bad = parseLeagueSetup({ ...base, schedule: 'continuous', periods: [{ key: 'p1', start: '2026-12-01', end: '2026-11-01' }], periodRule: 'composite' })
  ok(bad !== null && bad.periods === undefined && bad.periodRule === undefined,
    'periods that do not read are dropped — never the league')
  const old = parseLeagueSetup({ ...base, schedule: 'continuous', repeatWeekday: 3 })
  ok(old !== null && !isPeriodLeague(old) && old.repeatWeekday === 3,
    'a continuous league from before periods reads exactly as it did')
  eq(describeLeagueSetup(cont!, 0), 'League · continuous · 2 periods · best composite card · organiser-entered field',
    'the organiser card says the periods and the rule')
}

section('Which period, and when a card may be dated')
{
  const periods = equalPeriods('2026-11-01', 4, 'week', 2)
  eq(periodOf('2026-11-28', periods)?.key, 'p1', 'the last day is in its period')
  eq(periodOf('2026-11-29', periods)?.key, 'p2', 'the next day is in the next')
  eq(periodOf('2027-03-01', periods), null, 'after the last, none')
  eq(periodNow('2026-10-20', periods), { open: null, next: periods[0] }, 'before it starts, the first is next')
  eq(periodNow('2026-11-05', periods).open?.key, 'p1', 'inside one, it is open')
  eq(periodCardIssue('2026-11-10', '2026-11-05', periods), 'A card can’t be dated in the future.', 'no card from the future')
  eq(periodCardIssue('2026-10-10', '2026-11-05', periods), 'That day is outside every period of the league.', 'nor from before the league')
  eq(periodCardIssue('2026-11-03', '2026-11-05', periods), null, 'a day already played inside the period is fine')
  eq(periodLabel(periods, 'p2'), 'Period 2', 'a period is named by its place')
  eq(periodRoundId('p2'), 'period:p2', 'and goes by its own id on a board')
  eq(asksRoundDeadlines('continuous', true), false, 'a league of periods is asked no deadlines — the period\'s end is the rule')
  eq([asksRoundDeadlines('continuous'), asksRoundDeadlines('series')], [true, true], '  …the old continuous and a series still are')
}

// ─── The pick ──────────────────────────────────────────────────

section('The pick, on its own')
{
  const card = (roundId: string, date: string, vs: number[], courseId = 'c1') =>
    ({ roundId, date, courseId, holes: vs.map((v, i) => ({ n: i + 1, v })) })
  const a = card('a', '2026-11-02', [2, 2, 2]), b = card('b', '2026-11-09', [3, 1, 1])
  eq(pickPeriodCard([a, b], 'best_card', { lowerWins: false, compositeAllowed: true }), { kind: 'card', roundId: 'a' },
    'best card on points: 6 beats 5')
  const comp = pickPeriodCard([a, b], 'composite', { lowerWins: false, compositeAllowed: true })
  ok(comp?.kind === 'composite' && [...comp.byHole] .join() === [[1, 'b'], [2, 'a'], [3, 'a']].join(),
    'the composite takes each hole\'s best: the first from b, the rest from a')
  eq(pickPeriodCard([a, b], 'composite', { lowerWins: false, compositeAllowed: false }), { kind: 'card', roundId: 'a' },
    'a board that cannot take a composite takes the best card')
  eq(pickPeriodCard([a], 'composite', { lowerWins: false, compositeAllowed: true }), { kind: 'card', roundId: 'a' },
    'one card is its own composite, and says so as the card')
  const tie = card('c', '2026-11-01', [2, 2, 2])
  eq(pickPeriodCard([a, tie], 'best_card', { lowerWins: false, compositeAllowed: true }), { kind: 'card', roundId: 'c' },
    'level cards: the earlier wins, so the answer never flickers')
  // Strokes: lowest wins, but a card with fewer holes can never win on it.
  const full = card('full', '2026-11-02', [5, 5, 5]), short = card('short', '2026-11-03', [4, 4])
  eq(bestCard([full, short], true)?.roundId, 'full', 'on strokes an unfinished card does not beat a finished one')
  const elsewhere = card('x', '2026-11-04', [3, 3, 3], 'c2')
  eq(pickPeriodCard([full, elsewhere], 'composite', { lowerWins: true, compositeAllowed: true }), { kind: 'card', roundId: 'x' },
    'a strokes composite across two courses falls back to the best card')
  eq(pickPeriodCard([], 'composite', { lowerWins: false, compositeAllowed: true }), null, 'no cards, no pick')
}

// ─── The board ─────────────────────────────────────────────────

// Nine par 4s on c1, stroke index 1–9; nine par 3s on c2.
const holesC1: RowHole[] = Array.from({ length: 9 }, (_, i) => ({ id: `a${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1' }))
const holesC2: RowHole[] = Array.from({ length: 9 }, (_, i) => ({ id: `b${i + 1}`, hole_number: i + 1, par: 3, stroke_index: i + 1, course_id: 'c2' }))
const holes = [...holesC1, ...holesC2]
const players = [
  { id: 'p1', name: 'Alice', handicap: 9, gender: 'M' },
  { id: 'p2', name: 'Bob', handicap: 9, gender: 'M' },
]
const periods: LeaguePeriod[] = equalPeriods('2026-11-01', 4, 'week', 2)

/** A card: gross per hole; points worked out at the handicap given (shots on SI ≤ hcp). */
function card(roundId: string, playerId: string, gross: number[], opts: { hcp?: number; course?: 'c1' | 'c2'; live?: boolean } = {}): ResolvedScore[] {
  const hs = opts.course === 'c2' ? holesC2 : holesC1
  const hcp = opts.hcp ?? 9
  return gross.map((g, i) => {
    const h = hs[i]
    const shots = Math.floor(hcp / 18) + (h.stroke_index <= hcp % 18 ? 1 : 0)
    return { playerId, roundId, holeId: h.id, holeNumber: h.hole_number, gross: g,
      points: Math.max(0, h.par + 2 - (g - shots)), noReturn: false, live: !!opts.live }
  })
}
const fives = Array(9).fill(5), fours = Array(9).fill(4)

function ctx(rounds: { id: string; date: string }[], resolved: ResolvedScore[], extra: Partial<RowContext> = {}): RowContext {
  const hcpFor = new Map<string, number>()
  for (const s of resolved) hcpFor.set(`${s.roundId}:${s.playerId}`, 9)
  return {
    players, teams: [], memberships: [], holes,
    rounds: rounds.map((r, i) => ({ id: r.id, round_number: i + 1, scheduled_date: r.date })),
    resolved, hcpFor,
    liveRoundIds: new Set<string>(), livePlayerIds: new Set<string>(), legacyTeamScoring: null,
    periods, ...extra,
  }
}
const stableford: Leaderboard = starterBoards()[0]
const strokes: Leaderboard = { ...stableford, scoring: 'strokes' }
const row = (lb: Leaderboard, c: RowContext, id: string) => buildRows(lb, c).find(r => r.id === id)

section('A league of periods reads one round a period')
{
  // Alice: two cards in period 1 (fives = 18 pts, fours = 27), one in
  // period 2 (fives), and one dated outside both.
  const rounds = [
    { id: 'r1', date: '2026-11-02' }, { id: 'r2', date: '2026-11-15' },
    { id: 'r3', date: '2026-12-01' }, { id: 'r4', date: '2027-02-01' },
  ]
  const c = ctx(rounds, [...card('r1', 'p1', fives), ...card('r2', 'p1', fours), ...card('r3', 'p1', fives), ...card('r4', 'p1', fours)])
  const alice = row(stableford, c, 'p1')!
  eq(alice.perRound, { 'period:p1': 27, 'period:p2': 18 }, 'best card: 27 in period one, 18 in period two')
  eq(alice.total, 45, '  …and the card outside every period counts for nothing')
  eq(alice.playedRounds, ['period:p1', 'period:p2'], '  …the columns are the periods')

  // Without periods the same cards are four rounds — the old reading, untouched.
  const plain = { ...c, periods: undefined }
  eq(row(stableford, plain, 'p1')!.total, 18 + 27 + 18 + 27, 'the same cards without periods are four rounds, as ever')

  // Re-dating a period re-files its cards: stretch period one to the 1st of December.
  const moved: LeaguePeriod[] = [{ ...periods[0], end: '2026-12-01' }, { ...periods[1], start: '2026-12-02' }]
  const movedRow = row(stableford, { ...c, periods: moved }, 'p1')!
  eq([movedRow.perRound['period:p1'], movedRow.playedRounds], [27, ['period:p1']],
    'moving a period\'s dates moves its cards with it — nothing stored to migrate')
}

section('The best composite card')
{
  // Card one: 4s on the front four, 6s after. Card two: the reverse.
  const one = [4, 4, 4, 4, 6, 6, 6, 6, 6], two = [6, 6, 6, 6, 4, 4, 4, 4, 4]
  const c = ctx([{ id: 'r1', date: '2026-11-02' }, { id: 'r2', date: '2026-11-09' }],
    [...card('r1', 'p1', one), ...card('r2', 'p1', two)], { periodRule: 'composite' })
  eq(row(stableford, c, 'p1')!.total, 27, 'every hole\'s best: nine 3-pointers, 27')
  eq(row(stableford, { ...c, periodRule: undefined }, 'p1')!.total, 4 * 1 + 5 * 3,
    'the best card alone is card two: four 1s and five 3s')
  // On points the composite works across courses — the points carry the handicap.
  const across = ctx([{ id: 'r1', date: '2026-11-02' }, { id: 'r2', date: '2026-11-09' }],
    [...card('r1', 'p1', one), ...card('r2', 'p1', [5, 5, 5, 5, 3, 3, 3, 3, 3], { course: 'c2' })], { periodRule: 'composite' })
  eq(row(stableford, across, 'p1')!.total, 4 * 3 + 5 * 3, 'on points it takes holes from two courses')
  // On strokes, two courses fall back to the best card; one course composes.
  eq(row(strokes, across, 'p1')!.total,
    Math.min(one.reduce((a, b) => a + b) - 9, [5, 5, 5, 5, 3, 3, 3, 3, 3].reduce((a, b) => a + b) - 9),
    'on strokes, two courses: the best card')
  eq(row(strokes, c, 'p1')!.total, 36 - 9, 'on strokes, one course: nine 4s less nine shots')
}

section('A composite keeps each hole\'s nett from its own card')
{
  // Card one off scratch, card two off 18 (a shot on every hole). Card one
  // gross 4s on the first four (nett 4), card two 4s on the last five (nett 3).
  // The composite reads at card two's handicap — it gives the most holes —
  // so card one's holes are moved up a stroke to keep their nett of 4.
  const c = ctx([{ id: 'r1', date: '2026-11-02' }, { id: 'r2', date: '2026-11-09' }],
    [...card('r1', 'p1', [4, 4, 4, 4, 6, 6, 6, 6, 6], { hcp: 0 }), ...card('r2', 'p1', [6, 6, 6, 6, 4, 4, 4, 4, 4], { hcp: 18 })],
    { periodRule: 'composite' })
  c.hcpFor.set('r1:p1', 0)
  c.hcpFor.set('r2:p1', 18)
  eq(row(strokes, c, 'p1')!.total, 4 * 4 + 5 * 3, 'nett 4 on the first four from card one, nett 3 on the rest from card two')
}

section('A board on an allowance, a quota, and a live card')
{
  const c = ctx([{ id: 'r1', date: '2026-11-02' }, { id: 'r2', date: '2026-11-09' }],
    [...card('r1', 'p1', fives), ...card('r2', 'p1', fours)])
  const half: Leaderboard = { ...stableford, handicapAllowance: 50 }
  // Off 50% of 9 → 5 (allowedHandicap rounds), shots on SI 1–5.
  const alone = buildRows(half, { ...c, periods: undefined, rounds: [c.rounds[1]], resolved: c.resolved.filter(s => s.roundId === 'r2') })
  eq(row(half, c, 'p1')!.total, alone.find(r => r.id === 'p1')!.total,
    'on an allowance the period\'s card reads exactly as that card alone does — the allowance taken once')
  const quota: Leaderboard = { ...stableford, scoring: 'quota' }
  const q = row(quota, { ...c, periodRule: 'composite' }, 'p1')!
  const qAlone = buildRows(quota, { ...c, periods: undefined, rounds: [c.rounds[1]], resolved: c.resolved.filter(s => s.roundId === 'r2') })
  eq(q.total, qAlone.find(r => r.id === 'p1')!.total, 'a quota takes the best card, whatever the rule says')
  const live = ctx([{ id: 'r1', date: '2026-11-02' }], card('r1', 'p1', fives, { live: true }), { liveRoundIds: new Set(['r1']) })
  eq(row(stableford, live, 'p1')!.liveRounds, ['period:p1'], 'a card still in play keeps its period live')
}

section('Narrowed to one period')
{
  const c = ctx([{ id: 'r1', date: '2026-11-02' }, { id: 'r2', date: '2026-12-01' }],
    [...card('r1', 'p1', fours), ...card('r2', 'p1', fives), ...card('r2', 'p2', fours)])
  const one = withOnlyRounds(c, [periodRoundId('p2')])
  eq(one.periods?.map(p => p.key), ['p2'], 'narrowing by a period keeps that period')
  eq(one.rounds.map(r => r.id), ['r2'], '  …and the cards dated inside it')
  eq(buildRows(stableford, one).map(r => [r.id, r.total]), [['p2', 27], ['p1', 18]], '  …so its own board is that period\'s result')
  eq(buildRows({ ...stableford, roundIds: [periodRoundId('p1')] }, c).map(r => [r.id, r.total]), [['p1', 27]],
    'a board scoped to a period reads the same way')
}

section('A Golf Ireland card filed to a period competes as a whole card')
{
  const gi = (points: number): RoundCard => ({ roundId: periodRoundId('p1'), playerId: 'p1', cardId: 'g1', holes: 18, points, gross: 80, courseHandicap: 9 })
  const c = ctx([{ id: 'r1', date: '2026-11-02' }], card('r1', 'p1', fives))
  eq(row(stableford, { ...c, roundCards: [gi(30)] }, 'p1')!.total, 30, 'better than the card here, it is the period')
  eq(row(stableford, { ...c, roundCards: [gi(30)] }, 'p1')!.importedRounds, ['period:p1'], '  …and says it was read in')
  eq(row(stableford, { ...c, roundCards: [gi(10)] }, 'p1')!.total, 18, 'worse, the card here stands')
  eq(row(stableford, { ...ctx([], []), roundCards: [gi(30)] }, 'p1')!.total, 30, 'with no card here at all, it is the period')
}

section('Wired in one place')
{
  const src = read('lib/boardRows.ts')
  ok(src.includes('const [board, counted] = withPeriods(lb, narrowed)'), 'buildRows builds the periods, once, after every filter')
  ok((src.match(/withPeriods\(/g) ?? []).length === 2, '  …and nowhere else')
  ok(read('lib/rowContext.ts').includes('periods: input.periods'), 'the context carries the periods through')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
