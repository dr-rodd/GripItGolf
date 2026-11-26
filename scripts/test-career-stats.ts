/**
 * A golfer's career stats (Ross, 26 Nov 2026): strokes gained against a
 * handicap and scratch from the player's own card (lib/careerStats.ts), the
 * place in a round, what the card summary carries (migration 107), the
 * rolling average, the skill profile and the screens that draw them.
 *
 *   npx tsx scripts/test-career-stats.ts
 */
import fs from 'fs'
import type { HoleStat } from '../lib/holeStats'
import { drivingBets, longGameGained, holeAllocation } from '../lib/holeStats'
import {
  averageOf, cardGained, cardValue, filterRounds, formatSg, heatOf, per18, placeLabel,
  rollingAverage, roundPlaces, skillProfile, type CareerRow, type CardGained,
} from '../lib/careerStats'
import { CARD_SUMMARY_RULES, summariseRound } from '../lib/cardSummary'

let passed = 0, failed = 0
const failures: string[] = []
function ok(c: boolean, label: string) {
  if (c) { passed++; return }
  failed++; failures.push(label); console.log(`  ✗ ${label}`)
}
function eq<T>(a: T, b: T, label: string) {
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) console.log(`    got      ${JSON.stringify(a)}\n    expected ${JSON.stringify(b)}`)
  ok(same, label)
}
const near = (a: number | null | undefined, b: number, label: string, tol = 0.011) => {
  const good = a != null && Math.abs(a - b) <= tol
  if (!good) console.log(`    got ${a}, expected ${b}`)
  ok(good, label)
}
function section(s: string) { console.log(`\n${s}`) }
const read = (f: string) => fs.readFileSync(f, 'utf8')

/** A hole as lib/holeStats.ts hands it over. */
function hole(o: Partial<HoleStat> & { playerId: string; holeNumber: number; gross: number }): HoleStat {
  const par = o.par ?? 4
  const putts = o.putts === undefined ? 2 : o.putts
  const toGreen = putts == null ? null : o.gross - putts
  return {
    roundId: 'r1', holeId: `h${o.holeNumber}`, courseId: 'c1', par, strokeIndex: o.holeNumber,
    points: Math.max(0, par + 2 - o.gross), handicap: 18, live: false,
    putts, fairway: par >= 4 ? 'fairway' : null, strokesToGreen: toGreen,
    gir: toGreen == null ? null : toGreen <= par - 2, fairwayCounted: par >= 4, noReturn: false,
    ...o,
  } as HoleStat
}
const card = (playerId: string, gross: (i: number) => number, o: Partial<HoleStat> | ((i: number) => Partial<HoleStat>) = {}) =>
  Array.from({ length: 18 }, (_, i) => hole({ playerId, holeNumber: i + 1, gross: gross(i), ...(typeof o === 'function' ? o(i) : o) }))

function gainedTests() {
  section('Strokes gained against a benchmark golfer, from the card alone')
  // An 18-handicap making bogey on every hole, two putts each: exactly their handicap.
  const bogeys = card('ross', () => 5)
  const h = cardGained(bogeys, 'ross', 'handicap')!
  near(h.total, 0, 'bogey golf off 18 is level with the handicap')
  near(h.putting! + h.toGreen!, h.total, 'putting and tee to green add to the total')
  eq([h.holes, h.splitHoles], [18, 18], 'every hole counted, every hole split')
  const s = cardGained(bogeys, 'ross', 'scratch')!
  near(s.total, -18, 'the same card is eighteen behind scratch')
  near(s.putting, 0, 'two putts a hole is level putting against scratch')
  near(s.toGreen, -18, 'the eighteen shots are all in the long game against scratch')
  // The handicap's putting share: a fifth of each hole's allocation.
  near(h.putting, 18 * (2 + holeAllocation(18, 1) * 0) - 36 + 18 * 0.2, 'a fifth of the handicap is putting’s: 3.6 strokes over the round', 0.01)

  const plus = card('pro', () => 4, { handicap: -2 })
  near(cardGained(plus, 'pro', 'handicap')!.total, -2, 'a plus two shooting level par is two behind their handicap')
  near(cardGained(plus, 'pro', 'scratch')!.total, 0, 'and level with scratch')

  eq(cardGained(card('x', () => 5, { handicap: null }), 'x', 'handicap'), null, 'no handicap on the card: nothing to measure against it')
  ok(cardGained(card('x', () => 5, { handicap: null }), 'x', 'scratch') != null, '… but scratch still reads it')
  eq(cardGained(bogeys, 'nobody', 'handicap'), null, 'a player with no holes has no figure')

  section('No putt on a hole: a total, no split')
  const gap = card('dave', () => 5, i => (i === 4 ? { putts: null } : {}))
  const g = cardGained(gap, 'dave', 'handicap')!
  near(g.total, 0, 'the total needs only the gross')
  eq([g.putting, g.toGreen, g.splitHoles, g.driving], [null, null, 0, null], 'putting, tee to green and driving left unsplit')

  section('A no return: in the total at its maximum, out of the split')
  const nr = card('ann', i => (i === 0 ? 7 : 5), i => (i === 0 ? { noReturn: true, putts: null, points: 0 } : {}))
  const n = cardGained(nr, 'ann', 'handicap')!
  near(n.total, -2, 'the NR’s committed maximum counts against the total')
  eq(n.splitHoles, 17, 'the split is over the seventeen holes finished')

  section('Driving needs a field')
  // Four players, a mix of hits and misses, misses costing a shot to the green.
  const field = ['a', 'b', 'c', 'd'].flatMap((p, k) => card(p, i => {
    const miss = (i + k) % 3 === 0
    return miss ? 6 : 5
  }, i => {
    const miss = (i + k) % 3 === 0
    return { fairway: miss ? 'left' : 'fairway' }
  }))
  const alone = cardGained(field.filter(s => s.playerId === 'a'), 'a', 'handicap')!
  eq([alone.driving, alone.approach, alone.drivingHoles], [null, null, 0], 'alone in the round: no driving split')
  const withField = cardGained(field, 'a', 'handicap')!
  ok(withField.driving != null && withField.drivingHoles > 0, 'with three others who said where their drives went: driving split')
  near(withField.driving! + withField.approach!, withField.toGreen!, 'driving and approach add to tee to green')
  near(cardGained(field, 'a', 'scratch')!.driving!, withField.driving!, 'driving reads the same against either benchmark')

  section('drivingBets is the one copy longGameGained reads')
  const lg = longGameGained(field).get('a')!
  near(drivingBets(field).get('a')!.driving, lg.driving, 'the stats hub’s driving figure is the bets, unchanged', 1e-9)
  near(lg.driving + lg.approach, lg.toGreen, 'longGameGained still adds up', 1e-9)
}

function placeTests() {
  section('The place in the round')
  const p = roundPlaces([
    { playerId: 'a', holes: 18, points: 36 }, { playerId: 'b', holes: 18, points: 38 },
    { playerId: 'c', holes: 18, points: 36 }, { playerId: 'd', holes: 9, points: 20 },
  ])
  eq([p.get('b'), p.get('a'), p.get('c')], [{ place: 1, tied: false, field: 3 }, { place: 2, tied: true, field: 3 }, { place: 2, tied: true, field: 3 }], 'by points, level cards sharing a place')
  eq(p.get('d'), undefined, 'a nine beside eighteens finished nowhere')
  eq(roundPlaces([{ playerId: 'a', holes: 18, points: 30 }]).size, 0, 'a card on its own has no place')
  eq([placeLabel({ place: 2, tied: true }), placeLabel({ place: 1, tied: false }), placeLabel(null)], ['T2', '1', '–'], 'written as a board writes it')
}

function summaryTests() {
  section('The card summary carries it (migration 107)')
  ok(CARD_SUMMARY_RULES >= 2, 'the rules version moved on, so the backfill writes every row again')
  const rows = summariseRound([...card('ross', () => 5), ...card('dave', () => 4)], {
    tripId: 't1', roundId: 'r1', courseId: 'c1', playedOn: '2026-11-14', clubId: null, teeOf: new Map(), now: new Date('2026-11-26T12:00:00Z'),
  })
  const ross = rows.find(r => r.player_id === 'ross')!
  const dave = rows.find(r => r.player_id === 'dave')!
  eq([dave.sg.place, ross.sg.place, ross.sg.field], [1, 2, 2], 'each card placed in its round')
  near(ross.sg.handicap!.total, 0, 'against the handicap')
  near(ross.sg.scratch!.total, -18, 'against scratch')
  const store = read('app/api/stats/store.ts')
  ok(/rules_version: 1/.test(store) && /notThere\(error\)/.test(store), 'before 107 the summary is written without it, as the older rules, never in the way of a card')
  const mig = read('supabase/migrations/20260101000107_career_stats.sql')
  ok(/ADD COLUMN IF NOT EXISTS sg jsonb/.test(mig) && /UNDO/.test(mig), 'migration 107 adds one column, with its undo')
  ok(/'sg'|, sg\b|sg,/.test(read('app/api/stats/career.ts')), 'the career read asks for the column')
}

const g = (o: Partial<CardGained>): CardGained => ({ holes: 18, total: 0, splitHoles: 18, putting: 0, toGreen: 0, drivingHoles: 10, driving: 0, approach: 0, ...o })
const row = (day: string, o: Partial<CareerRow> & { total?: number; putting?: number | null } = {}): CareerRow => ({
  round_id: day, trip_id: 't', played_on: day, holes: o.holes ?? 18, gross: o.gross ?? 90, par: 72, points: o.points ?? 30,
  origin: 'self_claimed', club_id: null, course_id: 'c',
  sg: o.sg === undefined ? { place: null, tied: false, field: 0, handicap: g({ holes: o.holes ?? 18, splitHoles: o.putting === null ? 0 : (o.holes ?? 18), total: o.total ?? 0, putting: o.putting === undefined ? 0 : o.putting }), scratch: g({ total: -18 }) } : o.sg,
  competition: o.competition,
})

function careerTests() {
  section('The career: per eighteen, averages, rolling, the profile')
  const nine = row('2026-05-01', { holes: 9, total: 2 })
  near(per18(nine, 'total', 'handicap'), 4, 'a nine’s figure doubled to eighteen holes')
  eq(cardValue(nine, 'points', 'handicap'), null, 'a nine has no points beside eighteens')
  near(averageOf([nine, row('2026-05-02', { total: -1 })], 'total', 'handicap')!.value, (2 - 1) / 27 * 18, 'averaged over holes, so a nine weighs half')
  eq(cardValue(row('2026-05-03', { putting: null }), 'putting', 'handicap'), null, 'unsplit cards have no putting')
  eq(cardValue(row('2026-05-03', { sg: null }), 'total', 'handicap'), null, 'a card summed up before 107 has no strokes gained')
  near(averageOf([row('a', { points: 30 }), row('b', { points: 36 })], 'points', 'handicap')!.value, 33, 'points a plain average')

  const rs = [1, 2, 3, 4, 5, 6].map(i => row(`2026-06-0${i}`, { total: i }))
  const roll = rollingAverage([...rs].reverse(), 'total', 'handicap', 3)
  eq(roll.map(p => Math.round(p.value * 100) / 100), [1, 1.5, 2, 3, 4, 5], 'oldest first, the last three averaged, fewer at the start')
  eq(roll.map(p => p.n), [1, 2, 3, 3, 3, 3], 'how many each point is over')

  const profile = skillProfile(rs, 'handicap', 2)!
  eq(profile.map(a => a.key), ['total', 'toGreen', 'driving', 'approach', 'putting'], 'the stats hub’s five spokes, in its order')
  near(profile[0].value, 5.5, 'over the last cards only')
  eq(skillProfile([row('x', { putting: null })], 'handicap', null), null, 'no split anywhere: no pentagon')

  eq(filterRounds([row('a', { competition: true }), row('b')], 'comps').map(r => r.round_id), ['a'], 'Comps: club competitions only')
  eq([formatSg(1.234), formatSg(-0.5), formatSg(0), formatSg(null)], ['+1.23', '−0.50', '0.00', '–'], 'signed, two places, a true minus')
  eq([heatOf(1.5), heatOf(-6), heatOf(null)], [0.5, 1, 0], 'heat: three strokes either way is full')
}

function screenTests() {
  section('The screens')
  const view = read('app/components/stats/CareerStats.tsx')
  ok(/askCareer|\/api\/stats\/career/.test(view), 'the page asks once, after it paints')
  ok(/PentagonChart/.test(view) && /RollingChart/.test(view), 'the pentagon and the rolling line')
  ok(/DEFAULT_WINDOW/.test(view), 'the rolling average opens on its default window')
  ok(/RoundCardSheet/.test(view), 'a round opens its scorecard')
  ok(!/#[0-9a-fA-F]{6}/.test(view), 'no colour typed by hand')
  const home = read('app/home/HomeScreen.tsx')
  const club = read('app/club/[slug]/ClubView.tsx')
  ok(/CareerStats/.test(home) && /CareerStats/.test(club), 'Home and the club draw the one page')
  const trip = read('app/golf/[root]/[tripCode]/stats/charts.tsx')
  ok(!/export function PentagonChart/.test(trip), 'the trip hub draws the shared pentagon, never its own copy')
  const route = read('app/api/stats/career.ts')
  ok(/isAccount/.test(route) && /readCardDetail/.test(route), 'a member’s own cards, through the feed’s one scorecard read')
}

gainedTests()
placeTests()
summaryTests()
careerTests()
screenTests()

console.log('\n' + '─'.repeat(56))
if (failed) {
  console.log(`✗ ${failed} failed, ${passed} passed`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ all ${passed} checks passed`)
