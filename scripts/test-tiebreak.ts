/**
 * Breaking a tie. Run with: npm run test:tiebreak
 *
 * Three things have to hold, and each of them has already been got wrong once
 * somewhere in this codebase:
 *
 *   · there is **one** countback. The in-play panel inside the scoring card
 *     had a second, which is how two players level could be ordered one way
 *     there and the other way on the trip leaderboard
 *   · a board that predates the question is scored exactly as it always was.
 *     Every trip on the platform has boards stored without a tie rule, and
 *     they must read back as an even split
 *   · the badge on the leaderboard is a claim that the card decided it. A tie
 *     that stood, or one nobody looked at, must not wear one.
 *
 * The prize table itself — how it follows the field, when it is out of step —
 * is scripts/test-custom-points.ts.
 */

import fs from 'fs'
import {
  type Countback, type TieBreak,
  SEGMENTS, segmentFrom, countbackOf, splitBy, compareCountback, earlierSegment,
  placeRound, tieBreakOf, overallTieOf, describeTieBreak,
  TIE_BREAKS, OVERALL_TIES, DEFAULT_TIE_BREAK, LEVEL,
} from '../lib/tiebreak'
import { type Leaderboard, parseLeaderboards, boardRules, offersTieBreak } from '../lib/leaderboards'
import { buildRows } from '../lib/boardRows'
import { buildRowContext } from '../lib/rowContext'

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

/** A points map, sorted so the comparison does not depend on insertion order. */
const paid = (m: Map<string, { points: number }>) =>
  Object.fromEntries([...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, p]) => [id, p.points]))

const badges = (m: Map<string, { splitBy?: number }>) =>
  Object.fromEntries([...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, p]) => p.splitBy !== undefined)
    .map(([id, p]) => [id, p.splitBy]))

// ─── The setting ───────────────────────────────────────────────

section('What a board does with a tie')
{
  eq(tieBreakOf({}), 'even_split',
    'a board that never heard of the question splits evenly, as every board always did')
  eq(tieBreakOf({ tieBreak: 'countback' }), 'countback', 'and one that was asked says so')
  eq(tieBreakOf({ tieBreak: 'nonsense' as TieBreak }), 'even_split',
    'anything unrecognised falls back rather than being repaired')

  eq(overallTieOf({}), 'level', 'the overall total is left level unless told otherwise')
  eq(overallTieOf({ overallTie: 'last_round' }), 'last_round', 'and broken when it is')

  eq(DEFAULT_TIE_BREAK, 'countback',
    'a board being made now defaults to countback — which is not what a stored one reads as')
  eq(TIE_BREAKS.map(t => t.key), ['countback', 'everybody_wins', 'even_split'],
    'three answers, in the order the form offers them')
  eq(TIE_BREAKS.map(t => t.label), ['Tiebreak', 'Everybody Wins', 'Even Split'],
    'named the way the trip talks about them')
  ok(TIE_BREAKS.every(t => t.hint.endsWith('.')), 'every hint closes, so a joined line does not run on')
  ok(OVERALL_TIES.every(t => t.hint.endsWith('.')), 'and so does every overall hint')
}

section('Reading one back off a trip')
{
  const stored = [{
    id: 'b1', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total',
  }]
  const plain = parseLeaderboards(stored)[0]
  ok(!('tieBreak' in plain),
    'a board stored before the question existed comes back without it')
  ok(!('overallTie' in plain), 'and without an answer to a question it was never asked')

  const cb = parseLeaderboards([{ ...stored[0], tieBreak: 'countback' }])[0]
  eq(cb.tieBreak, 'countback', 'a countback board survives the round trip')
  ok(!('overallTie' in cb), 'and leaves the total level until somebody says otherwise')

  const both = parseLeaderboards([{
    ...stored[0], tieBreak: 'countback', overallTie: 'last_round',
  }])[0]
  eq(both.overallTie, 'last_round', 'the overall answer survives it too')

  // Kept off the object when it is the no-op, the same way an allowance of
  // 100 is — so an even-split board is byte-for-byte the board it always was
  const even = parseLeaderboards([{ ...stored[0], tieBreak: 'even_split' }])[0]
  ok(!('tieBreak' in even), 'an even split is not stored: it is what absent means')

  const orphan = parseLeaderboards([{ ...stored[0], overallTie: 'last_round' }])[0]
  ok(!('overallTie' in orphan),
    'an overall answer without a countback is dropped — only countback has that question')

  eq(parseLeaderboards([{ ...stored[0], tieBreak: 'sideways' }])[0].tieBreak, undefined,
    'and junk is dropped rather than repaired')
}

section('What the board says it is doing')
{
  const base: Leaderboard = {
    id: 'b', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total',
  }
  eq(describeTieBreak(base), '',
    'a board that leaves ties standing and pays nothing says nothing about them')
  eq(describeTieBreak({ ...base, combine: 'position' }),
    'Level players split the prizes between them.',
    'the same board with prizes on it says what happens to them')
  eq(describeTieBreak({ ...base, combine: 'position', tieBreak: 'everybody_wins' }),
    'Level players all take the better prize.',
    'and says the other thing when that is what happens')

  ok(describeTieBreak({ ...base, tieBreak: 'countback' }).startsWith('Round ties'),
    'a countback board that leaves the total level says so — it is round ties it breaks')
  ok(describeTieBreak({ ...base, tieBreak: 'countback', overallTie: 'last_round' })
    .startsWith('Ties broken'),
    'and one that breaks the total does not qualify it')

  ok(boardRules({ ...base, tieBreak: 'countback', overallTie: 'last_round' })
    .includes('back 9'), 'the rules line under the title carries it')
  ok(!boardRules(base).includes('back 9'), 'and an old board gains no new sentence')

  ok(offersTieBreak(base), 'every league board is asked')
  ok(!offersTieBreak({ ...base, competition: 'matchplay' }),
    'a draw is not — a level match is halved, which is the format rather than a setting')
}

// ─── The card's own answer ─────────────────────────────────────

section('Reading the closing stretches off a card')
{
  eq([...SEGMENTS], [9, 6, 3, 2], 'nine, six, three, two — in the order they are read')
  eq(SEGMENTS.map(segmentFrom), [10, 13, 16, 17],
    'the back 9 starts at the tenth and the last of them is the seventeenth')

  // Two points on every hole
  const flat = countbackOf(
    Array.from({ length: 18 }, (_, i) => i + 1), h => h, () => 2)
  eq(flat, { 9: 18, 6: 12, 3: 6, 2: 4 }, 'a level card reads 18, 12, 6, 4')

  // Only the front nine played
  const front = countbackOf(
    Array.from({ length: 9 }, (_, i) => i + 1), h => h, () => 2)
  eq(front, LEVEL, 'a card that stopped at the turn has no back nine at all')
}

section('Which stretch splits two cards')
{
  const a: Countback = { 9: 20, 6: 14, 3: 7, 2: 5 }
  const b: Countback = { 9: 18, 6: 14, 3: 7, 2: 5 }
  eq(splitBy(a, b)?.segment, 9, 'the back 9 is read first')
  ok((splitBy(a, b)?.favours ?? 0) > 0, 'and the better nine wins it')
  ok((splitBy(b, a)?.favours ?? 0) < 0, 'the other way round from the other side')

  const c: Countback = { 9: 20, 6: 12, 3: 7, 2: 5 }
  eq(splitBy(a, c)?.segment, 6, 'level on the nine, it falls to the six')
  eq(splitBy(a, { ...a, 3: 6 })?.segment, 3, 'then the three')
  eq(splitBy(a, { ...a, 2: 4 })?.segment, 2, 'then the last two')
  eq(splitBy(a, { ...a }), null, 'and then the card has nothing left to say')

  // Lower wins reverses every one of them at once
  ok((splitBy(a, b, true)?.favours ?? 0) < 0,
    'on strokes the better back nine is the lower one')

  eq(splitBy(a, undefined), null, 'a card against nothing is not a tie broken')
  eq(splitBy(undefined, undefined), null, 'and neither is nothing against nothing')

  ok(compareCountback(a, b) < 0, 'the comparator puts the better nine first')
  eq(compareCountback(a, { ...a }), 0, 'and says nothing where the card does not')
  eq(compareCountback(a, undefined), 0, 'nor where there is no card')

  eq(earlierSegment(9, 3), 9, 'of two stretches, the one read first is the one that placed you')
  eq(earlierSegment(undefined, 6), 6, 'and one stretch beats none')
}

// ─── Placing and paying a round ────────────────────────────────
//
// These were `awardRound` in lib/customPoints.ts, which knew one answer about
// two players level. They moved with the function.

section('Placing a round with no ties in it')
{
  const table = [10, 5, 3, 1]

  eq(paid(placeRound([
    { id: 'a', score: 38 }, { id: 'b', score: 35 }, { id: 'c', score: 41 },
  ], table)), { a: 5, b: 3, c: 10 }, 'highest Stableford takes the winner\'s points')

  eq(paid(placeRound([
    { id: 'a', score: 74 }, { id: 'b', score: 71 }, { id: 'c', score: 78 },
  ], table, { lowerWins: true })), { a: 5, b: 10, c: 3 },
    'lowest nett takes the winner\'s points when low wins')

  eq(paid(placeRound([], table)), {}, 'nobody played, nobody scores')

  eq(paid(placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 38 }, { id: 'c', score: 36 },
    { id: 'd', score: 34 }, { id: 'e', score: 32 },
  ], [10, 5])), { a: 10, b: 5, c: 0, d: 0, e: 0 },
    'positions past the end of the table are worth nothing')

  const places = placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 38 }, { id: 'c', score: 36 },
  ], table)
  eq([...places.values()].map(p => p.place).sort(), [1, 2, 3], 'and everyone has a place of their own')
}

section('Even Split — the places are pooled and shared')
{
  const table = [10, 6, 3, 1]

  eq(paid(placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 40 }, { id: 'c', score: 30 },
  ], table)), { a: 8, b: 8, c: 3 },
    'two tied for first split first and second: 8 each')

  eq(paid(placeRound([
    { id: 'w', score: 44 }, { id: 'x', score: 40 },
    { id: 'y', score: 40 }, { id: 'z', score: 40 },
  ], table)), { w: 10, x: (6 + 3 + 1) / 3, y: (6 + 3 + 1) / 3, z: (6 + 3 + 1) / 3 },
    'three tied for second share second, third and fourth')

  const level = placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 40 }, { id: 'c', score: 30 },
  ], table)
  eq([...level.values()].map(p => p.place).sort(), [1, 1, 3],
    'and they are both first, so the next player is third')

  const four = [
    { id: 'a', score: 40 }, { id: 'b', score: 40 },
    { id: 'c', score: 40 }, { id: 'd', score: 40 },
  ]
  eq([...placeRound(four, table).values()].reduce((s, p) => s + p.points, 0), 20,
    'a four-way tie still awards the whole table')

  const clear = [
    { id: 'a', score: 44 }, { id: 'b', score: 40 },
    { id: 'c', score: 36 }, { id: 'd', score: 30 },
  ]
  eq([...placeRound(clear, table).values()].reduce((s, p) => s + p.points, 0), 20,
    'and so does a round with no ties at all')

  eq(badges(placeRound(four, table)), {}, 'nothing was split, so nothing wears a badge')
}

section('Everybody Wins — level players all take the better prize')
{
  const table = [10, 6, 3, 1]
  const mode = { mode: 'everybody_wins' as TieBreak }

  eq(paid(placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 40 }, { id: 'c', score: 30 },
  ], table, mode)), { a: 10, b: 10, c: 3 },
    'two tied for first are both first, and both take ten')

  eq([...placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 40 },
  ], table, mode).values()].reduce((s, p) => s + p.points, 0), 20,
    'which pays out more than the table holds — deliberately, that is the setting')

  eq(paid(placeRound([
    { id: 'w', score: 44 }, { id: 'x', score: 40 },
    { id: 'y', score: 40 }, { id: 'z', score: 40 },
  ], table, mode)), { w: 10, x: 6, y: 6, z: 6 },
    'three tied for second all take second')

  eq(badges(placeRound([
    { id: 'a', score: 40 }, { id: 'b', score: 40 },
  ], table, mode)), {}, 'nobody was split, so nobody wears a badge')
}

section('Tiebreak — the cards split them, and say which stretch did it')
{
  const table = [10, 6, 3, 1]
  const mode = { mode: 'countback' as TieBreak }
  const back = (n: number): Countback => ({ 9: n, 6: n, 3: n, 2: n })

  const split = placeRound([
    { id: 'a', score: 40, countback: back(18) },
    { id: 'b', score: 40, countback: back(22) },
    { id: 'c', score: 30, countback: back(10) },
  ], table, mode)
  eq(paid(split), { a: 6, b: 10, c: 3 }, 'the better back nine takes the winner\'s prize')
  eq([...split.values()].map(p => p.place).sort(), [1, 2, 3], 'and they hold separate places')
  eq(badges(split), { a: 9, b: 9 },
    'both sides of the break wear the badge — being put second on countback is the card\'s doing too')

  // Level on the nine and the six, split on the three
  const deep = placeRound([
    { id: 'a', score: 40, countback: { 9: 20, 6: 14, 3: 6, 2: 4 } },
    { id: 'b', score: 40, countback: { 9: 20, 6: 14, 3: 8, 2: 5 } },
  ], table, mode)
  eq(paid(deep), { a: 6, b: 10 }, 'a tie that goes deeper is still split')
  eq(badges(deep), { a: 3, b: 3 }, 'and the badge names the stretch that did it')

  // Matched all the way down — "then accept a tie", and a tie is shared
  const stands = placeRound([
    { id: 'a', score: 40, countback: back(20) },
    { id: 'b', score: 40, countback: back(20) },
  ], table, mode)
  eq(paid(stands), { a: 8, b: 8 }, 'cards that match all the way down share, as a tie always did')
  eq(badges(stands), {}, 'and wear no badge, because nothing decided it')
  eq([...stands.values()].map(p => p.place), [1, 1], 'both first')

  // Three level: one clear of two who cannot be split
  const partial = placeRound([
    { id: 'a', score: 40, countback: back(30) },
    { id: 'b', score: 40, countback: back(20) },
    { id: 'c', score: 40, countback: back(20) },
  ], table, mode)
  eq(paid(partial), { a: 10, b: (6 + 3) / 2, c: (6 + 3) / 2 },
    'the one clear of them takes first, and the two left level share second and third')
  eq(badges(partial), { a: 9, b: 9, c: 9 }, 'all three were placed by the back nine')

  // On strokes the better back nine is the lower one
  const strokes = placeRound([
    { id: 'a', score: 72, countback: back(38) },
    { id: 'b', score: 72, countback: back(34) },
  ], table, { ...mode, lowerWins: true })
  eq(paid(strokes), { a: 6, b: 10 }, 'fewest nett shots over the back nine takes it')

  // A card the board could not read is not a tie broken
  const missing = placeRound([
    { id: 'a', score: 40, countback: back(30) },
    { id: 'b', score: 40 },
  ], table, mode)
  eq(paid(missing), { a: 8, b: 8 }, 'a countback against no card leaves the tie standing')
  eq(badges(missing), {}, 'and claims nothing')
}

// ─── On a real board ───────────────────────────────────────────

const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
}))

/** A card: eighteen point values, in hole order. */
function card(playerId: string, roundId: string, points: number[]) {
  return holes.map((h, i) => ({
    player_id: playerId, hole_id: h.id, round_id: roundId,
    gross_score: 6 - points[i], stableford_points: points[i], no_return: false,
  }))
}
const nine = (front: number, back: number) =>
  [...Array(9).fill(front), ...Array(9).fill(back)]

const people = [
  { id: 'p1', name: 'Alice', handicap: 0, gender: 'M', team_id: null },
  { id: 'p2', name: 'Bob', handicap: 0, gender: 'M', team_id: null },
]

function ctxFor(rounds: { id: string; round_number: number }[], scores: unknown[]) {
  return buildRowContext({
    players: people,
    teams: [] as never,
    memberships: [] as never,
    holes,
    rounds: rounds as never,
    courseByRound: new Map(rounds.map(r => [r.id, 'c1'])),
    scores: scores as never,
    liveScores: [] as never,
    roundHandicaps: people.flatMap(p =>
      rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: 0 }))) as never,
    tees: [],
    activeRoundIds: [],
    livePlayerIds: [],
    legacyTeamScoring: null,
  })
}

const R1 = [{ id: 'r1', round_number: 1 }]
const R12 = [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }]

/** Both on 36. Alice's points are all on the front, Bob's all on the back. */
const levelRound = [
  ...card('p1', 'r1', nine(3, 1)),
  ...card('p2', 'r1', nine(1, 3)),
]

const board = (patch: Partial<Leaderboard> = {}): Leaderboard => ({
  id: 'b', audience: 'individual', competition: 'league',
  scoring: 'stableford', combine: 'total', ...patch,
})

section('A one-round board — the total is that card, so it is read')
{
  const ctx = ctxFor(R1, levelRound)

  const even = buildRows(board(), ctx)
  eq(even.map(r => [r.name, r.total, r.place]), [['Alice', 36, 1], ['Bob', 36, 1]],
    'an old board leaves them level and both first, ordered by name')
  ok(even.every(r => r.tieBadge === undefined), 'and neither wears a badge')

  const cb = buildRows(board({ tieBreak: 'countback' }), ctx)
  eq(cb.map(r => [r.name, r.total, r.place]), [['Bob', 36, 1], ['Alice', 36, 2]],
    'countback puts the better back nine on top, even with the total left level — '
    + 'a board counting one round has no other card to defer to')
  eq(cb.map(r => r.tieBadge), [9, 9], 'and both rows say the back nine did it')
}

section('A two-round board — rounds added up have no back nine')
{
  // Level on 72 after two rounds, and Bob has the better back nine in both
  const scores = [
    ...card('p1', 'r1', nine(3, 1)), ...card('p2', 'r1', nine(1, 3)),
    ...card('p1', 'r2', nine(3, 1)), ...card('p2', 'r2', nine(1, 3)),
  ]
  const ctx = ctxFor(R12, scores)

  const left = buildRows(board({ tieBreak: 'countback' }), ctx)
  eq(left.map(r => [r.name, r.total, r.place]), [['Alice', 72, 1], ['Bob', 72, 1]],
    'told to leave the total level, it stays level however the cards read')
  ok(left.every(r => r.tieBadge === undefined), 'and no badge claims otherwise')
  ok(left.every(r => r.countbackByRound === undefined),
    'the cards do not even travel with the rows — so the Discard switch cannot break it either')

  const broken = buildRows(
    board({ tieBreak: 'countback', overallTie: 'last_round' }), ctx)
  eq(broken.map(r => [r.name, r.place]), [['Bob', 1], ['Alice', 2]],
    'told to break it on the last round, the better last back nine takes it')
  eq(broken.map(r => r.tieBadge), [9, 9], 'and both rows say so')
}

section('The last round, not the first')
{
  // Alice takes round 1's back nine, Bob takes round 2's. Level on 72 either
  // way — so which round is consulted is the whole answer.
  const scores = [
    ...card('p1', 'r1', nine(1, 3)), ...card('p2', 'r1', nine(3, 1)),
    ...card('p1', 'r2', nine(3, 1)), ...card('p2', 'r2', nine(1, 3)),
  ]
  const rows = buildRows(
    board({ tieBreak: 'countback', overallTie: 'last_round' }),
    ctxFor(R12, scores))
  eq(rows.map(r => r.name), ['Bob', 'Alice'],
    'round 2 decides it — a society goes back to the most recent card, not the first')
}

section('A prize board pays what the countback decided')
{
  const ctx = ctxFor(R1, levelRound)
  const prize = (patch: Partial<Leaderboard>): Leaderboard =>
    board({ combine: 'position', customPoints: [10, 6], ...patch })

  const even = buildRows(prize({}), ctx)
  eq(even.map(r => [r.name, r.total]), [['Alice', 8], ['Bob', 8]],
    'an even split pools first and second: eight each')
  ok(even.every(r => r.tieBadgeByRound === undefined), 'and no round wears a badge')

  const all = buildRows(prize({ tieBreak: 'everybody_wins' }), ctx)
  eq(all.map(r => [r.name, r.total]), [['Alice', 10], ['Bob', 10]],
    'everybody wins pays them both the winner\'s ten')

  const cb = buildRows(prize({ tieBreak: 'countback' }), ctx)
  eq(cb.map(r => [r.name, r.total]), [['Bob', 10], ['Alice', 6]],
    'a countback pays ten and six to the two it split')
  eq(cb.map(r => r.tieBadgeByRound?.r1), [9, 9],
    'and the round that paid them carries the badge')
}

section('A prize board over two rounds still splits each round')
{
  // Level in round 1, Bob ahead on its back nine; round 2 is a clear win for
  // Alice. The overall total is left level by default, but round 1's prize
  // money was still decided by a card.
  const scores = [
    ...card('p1', 'r1', nine(3, 1)), ...card('p2', 'r1', nine(1, 3)),
    ...card('p1', 'r2', nine(3, 3)), ...card('p2', 'r2', nine(1, 1)),
  ]
  const rows = buildRows(
    board({ combine: 'position', customPoints: [10, 6], tieBreak: 'countback' }),
    ctxFor(R12, scores))
  const bob = rows.find(r => r.name === 'Bob')!
  eq(bob.perRound.r1, 10, 'Bob takes round one on the back nine')
  eq(bob.tieBadgeByRound?.r1, 9, 'and that round says so')
  eq(bob.tieBadgeByRound?.r2, undefined, 'round two was never level, so it claims nothing')
  eq(rows.map(r => r.name), ['Alice', 'Bob'], 'and the season board is Alice\'s, on 16 to 16... ')
  eq(rows.map(r => r.total), [16, 16], '...level, and left level')
}

// ─── One countback ─────────────────────────────────────────────

section('There is one countback, and everything reads it')
{
  const panel = read('app/scoring/LiveLeaderboardPanel.tsx')
  ok(/from ["']@\/lib\/tiebreak["']/.test(panel),
    'the in-play panel inside the scoring card reads lib/tiebreak.ts')
  ok(!/\[10,\s*13,\s*16,\s*17\]/.test(panel),
    'and no longer carries its own list of closing stretches')

  const rows = read('lib/boardRows.ts')
  ok(!/\[10,\s*13,\s*16,\s*17\]/.test(rows), 'nor does the board')
  ok(/from ['"]\.\/tiebreak['"]/.test(rows), 'which reads the same file')

  ok(!/export function awardRound/.test(read('lib/customPoints.ts')),
    'and the prize table no longer has its own answer about two players level')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
