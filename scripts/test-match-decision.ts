/**
 * Deciding a knockout match from the cards. Run with: npm run test:match-decision
 *
 * Eight methods, and the two shapes they fall into behave differently enough
 * that most of what is checked here is the difference between them:
 *
 *   · a hole-by-hole match is over when somebody is more holes up than there
 *     are holes left — "3&2" is a real result and the last two holes were
 *     never played
 *   · a total is over when both cards are complete, and not a moment before,
 *     because the eighteenth can turn it over however big the gap looks
 *
 * And three rules that are easy to get wrong quietly:
 *
 *   · a matchplay handicap is a *difference* off the lowest player in the
 *     match, where a total is each player off their own
 *   · a halved match is left halved. A knockout needs somebody to go through
 *     and the cards did not say who
 *   · auto-applying only ever fills an empty match, so a correction sticks.
 */

import fs from 'fs'
import {
  type MatchDecision, type PlayerHole, type MatchSide,
  MATCH_DECISIONS, DEFAULT_MATCH_DECISION,
  readMatch, isHoleByHole, isQuota, decisionOf, decisionLabel,
  parseRoundLinks, linkFor,
} from '../lib/matchDecision'
import {
  type QuotaScale, QUOTA_SCALES, DEFAULT_QUOTA_SCALE, quotaPoints, quotaTarget,
} from '../lib/quota'
import { pendingResults, type MatchReading } from '../lib/matchResults'
import { parseLeaderboards, boardRules } from '../lib/leaderboards'
import { bestOnHole } from '../lib/teamScoring'

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

// ─── Fixtures ──────────────────────────────────────────────────

/** A par-4 course, stroke index running 1 to 18 with the holes. */
const PAR = 4
const si = (holeNumber: number) => holeNumber

/**
 * A card: one entry per hole, from a list of gross scores.
 *
 * `points` is Stableford at the player's own full handicap, which is what the
 * Postgres trigger writes — so it is worked out here the same way rather than
 * passed in, or the fixtures would be free to disagree with the app.
 */
function card(
  playerId: string, gross: (number | null)[], handicap = 0,
): PlayerHole[] {
  return gross.map((g, i) => {
    const holeNumber = i + 1
    const strokeIndex = si(holeNumber)
    const shots = Math.floor(handicap / 18)
      + (strokeIndex <= ((handicap % 18) + 18) % 18 ? 1 : 0)
    return {
      playerId,
      holeNumber,
      gross: g,
      points: g === null ? 0 : Math.max(0, PAR + 2 - (g - shots)),
      par: PAR,
      strokeIndex,
      noReturn: false,
    }
  }).filter(h => h.gross !== null || h.holeNumber <= gross.length)
}

/** Eighteen of the same score. */
const flat = (n: number) => Array(18).fill(n)
/** Eighteen scores, with `overrides` applied by hole number. */
function withHoles(base: number, overrides: Record<number, number | null>) {
  const out: (number | null)[] = flat(base)
  for (const [hole, v] of Object.entries(overrides)) out[Number(hole) - 1] = v
  return out
}

const solo = (id: string): MatchSide => ({ id, playerIds: [id] })

function match(
  method: MatchDecision,
  holes: PlayerHole[],
  handicaps: Record<string, number> = {},
  sides: [MatchSide, MatchSide] = [solo('a'), solo('b')],
  quotaScale?: QuotaScale,
) {
  return readMatch({
    method,
    a: sides[0],
    b: sides[1],
    holes,
    handicapOf: new Map(Object.entries(handicaps)),
    holeCount: 18,
    quotaScale,
  })
}

// ─── The list ──────────────────────────────────────────────────

section('The seven ways a match can be decided')
{
  eq(MATCH_DECISIONS.length, 7, 'seven of them')
  eq(MATCH_DECISIONS.map(m => m.key), [
    'stableford_match', 'stableford_total',
    'strokes_match_gross', 'strokes_match_nett',
    'strokes_total_gross', 'strokes_total_nett',
    'quota_total',
  ], 'in the order the form offers them')

  ok(MATCH_DECISIONS.every(m => m.hint.endsWith('.')), 'every hint closes')
  ok(MATCH_DECISIONS.every(m => m.label.length <= 34), 'and every label fits a dropdown')

  eq(MATCH_DECISIONS.filter(m => isHoleByHole(m.key)).map(m => m.key),
    ['stableford_match', 'strokes_match_gross', 'strokes_match_nett'],
    'three are settled hole by hole; the other four are totals')

  eq(MATCH_DECISIONS.filter(m => isQuota(m.key)).map(m => m.key), ['quota_total'],
    'and one earns quota points, so one takes a scale')

  eq(decisionOf('stableford_match'), 'stableford_match', 'a known key reads back')
  eq(decisionOf('sideways'), null, 'an unknown one is dropped rather than repaired')
  eq(decisionOf(undefined), null, 'and so is nothing at all')
  eq(decisionLabel('quota_total'), 'Total quota', 'each has a name')
  eq(DEFAULT_MATCH_DECISION, 'stableford_match', 'a fresh link starts on Stableford matchplay')

  // The scale is the trip's, not the method's, so the method names the quota
  // and leaves the points to whoever set the board
  const quota = MATCH_DECISIONS.find(m => m.key === 'quota_total')!
  ok(/36/.test(quota.hint), 'the quota method names the number being chased')
  ok(!/birdie/.test(quota.hint),
    'and not the scale — that is the trip\'s answer, given on its Quota board')
}

// ─── Hole by hole ──────────────────────────────────────────────

section('Stableford matchplay — more points on the hole wins the hole')
{
  // a pars every hole, b bogeys the first four then pars the rest
  const holes = [
    ...card('a', flat(4)),
    ...card('b', withHoles(4, { 1: 5, 2: 5, 3: 5, 4: 5 })),
  ]
  const m = match('stableford_match', holes)
  eq(m.leaderId, 'a', 'the player winning holes leads')
  eq(m.margin, 4, 'four holes up')
  eq(m.holesPlayed, 18, 'over a full round')
  ok(m.settled, 'and with no holes left it is settled')
  eq(m.result, '4 up', 'a match that went the distance is so many up, not 4&0')
  ok(!m.halved, 'somebody won it')
}

section('A match that ends before the eighteenth')
{
  // a wins holes 1-5, everything level after — but only 16 holes are entered
  const played = 16
  const holes = [
    ...card('a', [...flat(4).slice(0, played)]),
    ...card('b', [...withHoles(4, { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 }).slice(0, played)]),
  ]
  const m = match('stableford_match', holes)
  eq(m.margin, 5, 'five up')
  eq(m.holesPlayed, 16, 'with sixteen played')
  ok(m.settled, 'five up with two to play cannot be caught')
  eq(m.result, '5&2', 'which is a 5&2 — the ampersand names the holes never played')
}

section('A match still going on')
{
  const played = 14
  const holes = [
    ...card('a', flat(4).slice(0, played)),
    ...card('b', withHoles(4, { 1: 5, 2: 5 }).slice(0, played)),
  ]
  const m = match('stableford_match', holes)
  ok(!m.settled, 'two up with four to play is not over')
  eq(m.result, null, 'so it has no result yet')
  eq(m.progress, '2 up thru 14', 'and reads as it stands')
  eq(m.leaderId, 'a', 'with somebody ahead')
}

section('All square, and left that way')
{
  const holes = [...card('a', flat(4)), ...card('b', flat(4))]
  const m = match('stableford_match', holes)
  ok(m.settled, 'eighteen played and nothing left to play')
  ok(m.halved, 'the cards did not separate them')
  eq(m.leaderId, null, 'so nobody is through')
  eq(m.result, 'Halved', 'and it says so rather than naming a winner')
}

section('Strokes matchplay — gross, then nett')
{
  // a is a 0 handicap and plays to it; b is an 18 and shoots 5s
  const holes = [...card('a', flat(4), 0), ...card('b', flat(5), 18)]

  const gross = match('strokes_match_gross', holes, { a: 0, b: 18 })
  eq(gross.leaderId, 'a', 'gross ignores handicaps entirely')
  eq(gross.margin, 18, 'and a wins every hole')
  eq(gross.result, '18 up', 'eighteen up after eighteen')

  // Nett: b gets the difference — 18 shots, one a hole — so every hole halves
  const nett = match('strokes_match_nett', holes, { a: 0, b: 18 })
  ok(nett.halved, 'a shot a hole makes every hole a half')
  eq(nett.leaderId, null, 'so neither is through')
}

section('A matchplay handicap is a difference, not a handicap')
{
  // Both play to the same gross. Off their own handicaps b would be miles
  // clear; off the difference the shots are the same and it is all square.
  const holes = [...card('a', flat(4), 10), ...card('b', flat(4), 12)]

  const m = match('strokes_match_nett', holes, { a: 10, b: 12 })
  // b receives 2 — the difference — on stroke index 1 and 2
  eq(m.margin, 2, 'b wins the two holes they receive a shot on')
  eq(m.leaderId, 'b', 'and leads by them')

  // The same cards read as a total, each off their own full handicap
  const total = match('strokes_total_nett', holes, { a: 10, b: 12 })
  eq(total.leaderId, 'b', 'as a total, b is two shots better off their own 12')
  eq(total.margin, 2, 'by exactly the two extra shots')
}

// ─── Totals ────────────────────────────────────────────────────

section('A total is not settled until both cards are complete')
{
  const holes = [
    ...card('a', flat(4).slice(0, 17)),
    ...card('b', flat(5).slice(0, 17)),
  ]
  const m = match('strokes_total_gross', holes)
  ok(!m.settled, 'seventeen holes in, the eighteenth can still turn it over')
  eq(m.result, null, 'so there is no result')
  ok(/thru 17/.test(m.progress), 'it reads as where it stands')

  const done = match('strokes_total_gross', [...card('a', flat(4)), ...card('b', flat(5))])
  ok(done.settled, 'complete cards settle it')
  eq(done.leaderId, 'a', 'and the lower gross wins')
  eq(done.result, 'by 18 shots', 'counted in shots')
}

section('Total Stableford points')
{
  const holes = [
    ...card('a', withHoles(4, { 1: 3, 2: 3 })),   // two birdies
    ...card('b', flat(4)),
  ]
  const m = match('stableford_total', holes)
  eq(m.leaderId, 'a', 'the higher points total wins')
  eq(m.margin, 2, 'by the two extra points')
  eq(m.result, 'by 2 points', 'counted in points')
}

section('A total that finishes level is halved too')
{
  const m = match('stableford_total', [...card('a', flat(4)), ...card('b', flat(4))])
  ok(m.halved, 'level on complete cards is halved')
  eq(m.leaderId, null, 'and nobody goes through on it')
}

// ─── Quota ─────────────────────────────────────────────────────

section('The scale a knockout quota is read on')
{
  eq(QUOTA_SCALES.map(s => s.key), ['liverpool', 'chicago'], 'two scales, in one table')
  ok(QUOTA_SCALES.every(s => s.hint.endsWith('.')), 'each saying its own scale')

  eq(quotaTarget(12), 24, 'a 12 handicap is trying to beat 24')
  eq(quotaTarget(-1), 37, 'and a plus handicap has further to go')

  // Same cards, two scales — the eagle is the whole difference
  const holes = [
    ...card('a', withHoles(4, { 1: 2 }), 12),   // one eagle
    ...card('b', flat(4), 12),
  ]
  eq(match('quota_total', holes, { a: 12, b: 12 }, undefined, 'liverpool').margin, 2,
    'on Liverpool an eagle is two points clear of the par it replaced')
  eq(match('quota_total', holes, { a: 12, b: 12 }, undefined, 'chicago').margin, 6,
    'on Chicago it is six')

  // No scale given falls to the default rather than scoring nothing
  eq(match('quota_total', holes, { a: 12, b: 12 }).margin,
    match('quota_total', holes, { a: 12, b: 12 }, undefined, DEFAULT_QUOTA_SCALE).margin,
    'a link that names no scale reads on the default')

  // And the table itself is not restated here
  eq(quotaPoints(2, 4, 'chicago'), 8, 'the scale comes from lib/quota.ts')
}

section('Total quota — beating your own target by most')
{
  // a is a 12 (quota 24) and pars everything: 36 points, +12
  // b is a 20 (quota 16) and bogeys everything: 18 points, +2
  const holes = [...card('a', flat(4), 12), ...card('b', flat(5), 20)]

  const m = match('quota_total', holes, { a: 12, b: 20 }, undefined, 'liverpool')
  eq(m.leaderId, 'a', 'a beat their quota by more')
  eq(m.margin, 10, 'by ten points of it')
  eq(m.result, 'by 10 points', 'counted in points')
  ok(m.settled, 'both cards complete')

  // The steeper scale changes nothing here — nobody birdied — but it must
  // still read the same cards without falling over
  const chicago = match('quota_total', holes, { a: 12, b: 20 }, undefined, 'chicago')
  eq(chicago.margin, 10, 'Chicago agrees where nobody went under par')

  // One birdie each way, and the scales part company
  const birdies = [
    ...card('a', withHoles(4, { 1: 3, 2: 3 }), 12),
    ...card('b', flat(5), 20),
  ]
  eq(match('quota_total', birdies, { a: 12, b: 20 }, undefined, 'liverpool').margin, 12,
    'two birdies are worth a point each more on Liverpool')
  eq(match('quota_total', birdies, { a: 12, b: 20 }, undefined, 'chicago').margin, 14,
    'and two each more on Chicago')
}

// ─── Pairings ──────────────────────────────────────────────────

section('A pairing is a better ball, and reads as one card')
{
  const pair = (id: string, members: string[]): MatchSide => ({ id, playerIds: members })

  // p1 pars the front and blows up on the back; p2 the other way round. The
  // better ball is a par everywhere.
  const holes = [
    ...card('p1', [...flat(4).slice(0, 9), ...flat(7).slice(0, 9)]),
    ...card('p2', [...flat(7).slice(0, 9), ...flat(4).slice(0, 9)]),
    ...card('q1', flat(5)),
    ...card('q2', flat(5)),
  ]
  const m = readMatch({
    method: 'strokes_match_gross',
    a: pair('A', ['p1', 'p2']),
    b: pair('B', ['q1', 'q2']),
    holes,
    handicapOf: new Map(),
    holeCount: 18,
  })
  eq(m.leaderId, 'A', 'the better ball of the two carries the side')
  eq(m.margin, 18, 'a par against a bogey on every hole')

  // Better ball comes from lib/teamScoring.ts, so a team board and a
  // four-ball cannot disagree about which way strokes sort
  eq(bestOnHole([5, 4], 'strokes', 1), [4], 'lowest is best on strokes')
  eq(bestOnHole([5, 4], 'stableford', 1), [5], 'highest is best on points')
}

section('Quota for a pairing is the better card, not a better ball')
{
  // A quota is a target for a whole round, so there is no share of it
  // belonging to one hole. Best card counts.
  const holes = [
    ...card('p1', flat(4), 12),      // 36 pts against a quota of 24 → +12
    ...card('p2', flat(6), 24),      // 0 pts against a quota of 12 → -12
    ...card('q1', flat(5), 20),      // 18 pts against a quota of 16 → +2
    ...card('q2', flat(5), 20),
  ]
  const m = readMatch({
    method: 'quota_total',
    quotaScale: 'liverpool',
    a: { id: 'A', playerIds: ['p1', 'p2'] },
    b: { id: 'B', playerIds: ['q1', 'q2'] },
    holes,
    handicapOf: new Map([['p1', 12], ['p2', 24], ['q1', 20], ['q2', 20]]),
    holeCount: 18,
  })
  eq(m.leaderId, 'A', 'the better of the two cards carries the side')
  eq(m.margin, 10, 'by its own margin, not a composite of both')
}

// ─── Nothing to read ───────────────────────────────────────────

section('A match nobody has started')
{
  const m = match('stableford_match', [])
  ok(!m.settled, 'is not settled')
  eq(m.leaderId, null, 'has nobody ahead')
  eq(m.result, null, 'and no result')
  eq(m.progress, 'Not started', 'and says so')
}

section('A hole picked up')
{
  // A strokes total cannot be taken off a card with a hole missing
  const holes = [
    ...card('a', withHoles(4, { 7: null })),
    ...card('b', flat(5)),
  ]
  const m = match('strokes_total_gross', holes)
  ok(!m.settled, 'a card with a hole picked up is not a complete card')

  // Hole by hole, that hole is simply lost — which is what picking up means
  const hbh = match('strokes_match_gross', holes)
  eq(hbh.leaderId, 'a', 'a still leads on the seventeen they played')
  eq(hbh.margin, 16, 'seventeen won less the one they gave up')
}

// ─── The link ──────────────────────────────────────────────────

section('Linking a bracket round to a round of golf')
{
  const links = parseRoundLinks([
    { bracketRound: 2, roundId: 'r2', decidedBy: 'stableford_total' },
    { bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match' },
  ])
  eq(links.map(l => l.bracketRound), [1, 2], 'links come back in bracket order')
  eq(linkFor(links, 1)?.roundId, 'r1', 'and are found by their bracket round')
  eq(linkFor(links, 9), null, 'a round with no link has none')

  eq(parseRoundLinks([{ bracketRound: 1, roundId: 'r1', decidedBy: 'sideways' }]), [],
    'a method that cannot be understood drops the link rather than guessing one')
  eq(parseRoundLinks([{ bracketRound: 0, roundId: 'r1', decidedBy: 'stableford_match' }]), [],
    'a bracket round below the first is not a bracket round')
  eq(parseRoundLinks([{ bracketRound: 1, decidedBy: 'stableford_match' }]), [],
    'and a link to no round at all is not a link')
  eq(parseRoundLinks('nonsense'), [], 'junk reads as nothing linked')

  // The scale used to be part of the method — `quota_liverpool` beside
  // `quota_chicago` — which put the trip's choice of scale in two places with
  // nothing keeping them in step. A link stored that way is still a real link.
  const old = parseRoundLinks([
    { bracketRound: 1, roundId: 'r1', decidedBy: 'quota_liverpool' },
    { bracketRound: 2, roundId: 'r2', decidedBy: 'quota_chicago' },
  ])
  eq(old.map(l => l.decidedBy), ['quota_total', 'quota_total'],
    'both older quota methods read back as the one method')
  eq(old.map(l => l.quotaScale), ['liverpool', 'chicago'],
    'each carrying the scale it was naming')

  const plain = parseRoundLinks([
    { bracketRound: 1, roundId: 'r1', decidedBy: 'quota_total' },
  ])[0]
  ok(!('quotaScale' in plain),
    'a link that names no scale carries none — it takes the trip\'s')

  const overridden = parseRoundLinks([
    { bracketRound: 1, roundId: 'r1', decidedBy: 'quota_total', quotaScale: 'liverpool' },
  ])[0]
  eq(overridden.quotaScale, 'liverpool', 'and one that overrides keeps its override')

  const notQuota = parseRoundLinks([
    { bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match', quotaScale: 'liverpool' },
  ])[0]
  ok(!('quotaScale' in notQuota),
    'a scale on a method that earns no quota is dropped, not carried silently')

  const dupes = parseRoundLinks([
    { bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match' },
    { bracketRound: 1, roundId: 'r2', decidedBy: 'strokes_total_gross' },
  ])
  eq(dupes.length, 1, 'one link per bracket round — a second is a contradiction')
  eq(dupes[0].roundId, 'r1', 'and the first wins')
}

section('A draw carries its links through storage')
{
  const stored = [{ id: 'm', audience: 'individual', competition: 'matchplay' }]

  const plain = parseLeaderboards(stored)[0]
  ok(!('roundLinks' in plain), 'a draw that was never linked comes back without them')
  ok(!/decided on/.test(boardRules(plain)), 'and says nothing about how it is decided')

  const linked = parseLeaderboards([{
    ...stored[0],
    roundLinks: [{ bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match' }],
  }])[0]
  eq(linked.roundLinks?.length, 1, 'a linked one keeps its link')
  ok(/decided on stableford matchplay/.test(boardRules(linked)),
    'and the line under its title names the method')

  const mixed = parseLeaderboards([{
    ...stored[0],
    roundLinks: [
      { bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match' },
      { bracketRound: 2, roundId: 'r2', decidedBy: 'quota_total' },
    ],
  }])[0]
  ok(/2 rounds linked/.test(boardRules(mixed)),
    'a draw running a different method each day counts them instead — '
    + 'there is no one rule to name')

  // A league board has rounds in every column of its table already
  const league = parseLeaderboards([{
    id: 'l', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total',
    roundLinks: [{ bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match' }],
  }])[0]
  ok(!('roundLinks' in league), 'only a draw is asked what it is played over')
}

// ─── Writing it back ───────────────────────────────────────────

section('Auto-applying only ever fills an empty match')
{
  const bracket = (over: Partial<Record<string, unknown>> = {}) => [{
    id: 'm1', round_number: 1, slot: 0,
    player_a_id: 'a', player_b_id: 'b',
    player_a_is_bye: false, player_b_is_bye: false,
    winner_player_id: null, result: null,
    next_match_id: null, next_slot: null,
    ...over,
  }] as never[]

  const reading = (over: Partial<MatchReading['state']> = {}): Map<string, MatchReading> =>
    new Map([['m1', {
      matchId: 'm1',
      link: { bracketRound: 1, roundId: 'r1', decidedBy: 'stableford_match' as MatchDecision },
      state: {
        leaderId: 'a', margin: 3, holesPlayed: 16,
        settled: true, halved: false, result: '3&2', progress: '3 up thru 16',
        ...over,
      },
      disagrees: false,
    }]])

  eq(pendingResults(bracket(), reading()),
    [{ matchId: 'm1', winnerId: 'a', result: '3&2' }],
    'a settled match with nobody in it is written')

  eq(pendingResults(bracket({ winner_player_id: 'b' }), reading()), [],
    'a match somebody already decided is left exactly as it is — '
    + 'which is what makes a correction stick')

  eq(pendingResults(bracket(), reading({ settled: false })), [],
    'a match still being played is not written')

  eq(pendingResults(bracket(), reading({ halved: true, leaderId: null })), [],
    'and a halved match is left for a person, because somebody has to go through')

  eq(pendingResults(bracket(), new Map()), [],
    'a bracket round with no link is decided by hand, as every draw always was')
}

// ─── One copy ──────────────────────────────────────────────────

section('The rules live in one place each')
{
  const decision = read('lib/matchDecision.ts')
  ok(/from '\.\/teamScoring'/.test(decision),
    'better ball comes from the file that owns team formats')
  ok(!/sort\(\(a, b\) => basis/.test(decision),
    'and is not sorted a second time here')
  ok(/from '\.\/handicap'/.test(decision),
    'and shots received comes from the one copy of that')
  ok(/from '\.\/quota'/.test(decision),
    'and the quota scales from theirs — a Quota leaderboard was scoring on one '
    + 'of them before a knockout could be decided on any')
  ok(!/birdie 4, eagle 8/.test(decision), 'no scale is written out twice')

  const scoring = read('lib/teamScoring.ts')
  ok(/export function bestOnHole/.test(scoring), 'which exports it for both')

  // The arithmetic is pure — no database, no React, so it can be tested like
  // this at all
  ok(!/^import .*(supabase|react)/mi.test(decision),
    'lib/matchDecision.ts imports neither a database nor React')
  ok(!/^import .*supabase/mi.test(read('lib/matchResults.ts')),
    'nor does the assembly — the page fetches, these two decide')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
