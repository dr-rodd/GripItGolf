/**
 * Custom points and discard tests. Run with: npm run test:custom-points
 *
 * The awarding rule has to hold up when players tie, when someone misses a
 * round, and when the table is shorter than the field. Dropping worst rounds
 * has to behave in both directions — worst is the lowest Stableford but the
 * highest nett strokes.
 */

import {
  defaultCustomPoints, resolveCustomPoints, clampPoints, customPointsError,
  awardRound, totalAfterDiscard, discardedIndices, MAX_CUSTOM_POINTS,
} from '../lib/customPoints'
import { parseFormats, leaderboardTabs, individualOn, isEmpty, DEFAULT_FORMATS } from '../lib/formats'

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
const award = (m: Map<string, number>) =>
  Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)))

// ─── The default table ─────────────────────────────────────────

section('Default points table')
{
  eq(defaultCustomPoints(8), [8, 7, 6, 5, 4, 3, 2, 1],
    'eight players: the winner gets 8, descending by one')
  eq(defaultCustomPoints(3), [3, 2, 1], 'three players: 3, 2, 1')
  eq(defaultCustomPoints(1), [1], 'one player gets a single point')
  eq(defaultCustomPoints(0), [], 'no players, no table')

  // The winner is capped like every other position
  const huge = defaultCustomPoints(150)
  eq(huge[0], MAX_CUSTOM_POINTS, `a very large field caps the winner at ${MAX_CUSTOM_POINTS}`)
  ok(huge.every(p => p <= MAX_CUSTOM_POINTS), 'and no position exceeds the cap')
}

section('Resolving a stored table against the current field')
{
  eq(resolveCustomPoints([], 5), [5, 4, 3, 2, 1], 'nothing stored falls back to the default')

  // Someone joins after the table was set — the edits at the top survive
  eq(resolveCustomPoints([10, 5, 3], 5), [10, 5, 3, 0, 0],
    'a shorter stored table is padded with zeroes, not regenerated')
  eq(resolveCustomPoints([10, 5, 3, 2, 1], 3), [10, 5, 3],
    'a longer stored table is trimmed to the field')
  eq(resolveCustomPoints([10, 5, 3], 3), [10, 5, 3], 'an exact match is untouched')

  // Nonsense in storage is repaired rather than trusted
  eq(resolveCustomPoints([999, -4, 2.6] as number[], 3), [100, 0, 3],
    'out-of-range values are clamped on the way out')
}

section('Clamping and validation')
{
  eq(clampPoints(50), 50, 'a normal value passes through')
  eq(clampPoints(0), 0, 'zero is allowed — a position can be worth nothing')
  eq(clampPoints(-5), 0, 'negatives clamp to zero')
  eq(clampPoints(1000), MAX_CUSTOM_POINTS, `anything above ${MAX_CUSTOM_POINTS} clamps to it`)
  eq(clampPoints(7.6), 8, 'fractions round')
  eq(clampPoints('abc'), 0, 'nonsense becomes zero')
  eq(clampPoints(NaN), 0, 'so does NaN')

  eq(customPointsError([10, 5, 0]), null, 'a sane table passes, zero included')
  ok(customPointsError([10, -1]) !== null, 'a negative is rejected')
  ok(customPointsError([101]) !== null, 'over the cap is rejected')
  ok(customPointsError([101])!.includes(String(MAX_CUSTOM_POINTS)), 'and names the cap')
}

// ─── Awarding a round ──────────────────────────────────────────

section('Awarding points for a round')
{
  const table = [10, 5, 3, 1]

  // Stableford: the highest score wins
  eq(award(awardRound([
    { playerId: 'a', score: 38 },
    { playerId: 'b', score: 35 },
    { playerId: 'c', score: 41 },
  ], table)), { a: 5, b: 3, c: 10 }, 'highest Stableford takes the winner\'s points')

  // Strokeplay: the lowest score wins
  eq(award(awardRound([
    { playerId: 'a', score: 74 },
    { playerId: 'b', score: 71 },
    { playerId: 'c', score: 78 },
  ], table, { lowerWins: true })), { a: 5, b: 10, c: 3 },
    'lowest nett takes the winner\'s points when low wins')

  eq(award(awardRound([], table)), {}, 'nobody played, nobody scores')

  // A field larger than the table — the tail simply earns nothing
  eq(award(awardRound([
    { playerId: 'a', score: 40 },
    { playerId: 'b', score: 38 },
    { playerId: 'c', score: 36 },
    { playerId: 'd', score: 34 },
    { playerId: 'e', score: 32 },
  ], [10, 5])), { a: 10, b: 5, c: 0, d: 0, e: 0 },
    'positions past the end of the table are worth nothing')
}

section('Ties share the places they occupy')
{
  const table = [10, 6, 3, 1]

  // Two tied for first take first and second between them
  eq(award(awardRound([
    { playerId: 'a', score: 40 },
    { playerId: 'b', score: 40 },
    { playerId: 'c', score: 30 },
  ], table)), { a: 8, b: 8, c: 3 },
    'two tied for first split first and second: 8 each')

  // Three-way tie for second takes 2nd, 3rd and 4th
  eq(award(awardRound([
    { playerId: 'w', score: 44 },
    { playerId: 'x', score: 40 },
    { playerId: 'y', score: 40 },
    { playerId: 'z', score: 40 },
  ], table)), { w: 10, x: (6 + 3 + 1) / 3, y: (6 + 3 + 1) / 3, z: (6 + 3 + 1) / 3 },
    'three tied for second share second, third and fourth')

  // The pot is conserved however the round finishes
  const field = [
    { playerId: 'a', score: 40 }, { playerId: 'b', score: 40 },
    { playerId: 'c', score: 40 }, { playerId: 'd', score: 40 },
  ]
  const total = [...awardRound(field, table).values()].reduce((s, v) => s + v, 0)
  eq(total, 20, 'a four-way tie still awards the whole table')

  const clear = [
    { playerId: 'a', score: 44 }, { playerId: 'b', score: 40 },
    { playerId: 'c', score: 36 }, { playerId: 'd', score: 30 },
  ]
  eq([...awardRound(clear, table).values()].reduce((s, v) => s + v, 0), 20,
    'and so does a round with no ties at all')
}

// ─── Dropping worst rounds ─────────────────────────────────────

section('Dropping a player\'s worst rounds')
{
  // Stableford — worst is the lowest
  eq(totalAfterDiscard([38, 30, 41], 0), 109, 'dropping none keeps the lot')
  eq(totalAfterDiscard([38, 30, 41], 1), 79, 'dropping one loses the lowest round')
  eq(totalAfterDiscard([38, 30, 41], 2), 41, 'dropping two leaves only the best')

  // Strokeplay — worst is the highest
  eq(totalAfterDiscard([74, 82, 71], 1, { lowerWins: true }), 145,
    'when low wins, the highest round is the one dropped')
  eq(totalAfterDiscard([74, 82, 71], 2, { lowerWins: true }), 71,
    'dropping two leaves the lowest')

  // Someone who has barely played keeps what they have
  eq(totalAfterDiscard([38], 1), 38, 'a single round is never dropped')
  eq(totalAfterDiscard([38, 30], 2), 68, 'nor are all of them')
  eq(totalAfterDiscard([], 1), 0, 'no rounds totals nothing')

  eq(totalAfterDiscard([38, 30, 41], -1), 109, 'a negative discard is treated as none')
}

section('Which rounds were set aside')
{
  eq(discardedIndices([38, 30, 41], 1), [1], 'the lowest Stableford round is flagged')
  eq(discardedIndices([38, 30, 41], 2), [0, 1], 'the two lowest, in round order')
  eq(discardedIndices([74, 82, 71], 1, { lowerWins: true }), [1],
    'the highest nett round is flagged when low wins')
  eq(discardedIndices([38, 30, 41], 0), [], 'nothing is flagged when dropping none')
  eq(discardedIndices([38], 1), [], 'a lone round is never flagged')

  // Flagged rounds and the total always agree
  const scores = [38, 30, 41, 35]
  const kept = scores.filter((_, i) => !discardedIndices(scores, 2).includes(i))
  eq(kept.reduce((a, b) => a + b, 0), totalAfterDiscard(scores, 2),
    'the rounds not flagged are exactly the rounds counted')
}

// ─── The format model ──────────────────────────────────────────

section('Individual boards are settings, not separate formats')
{
  const f = parseFormats({
    individual: { stableford: true, strokes: true, custom: true, customPoints: [10, 5], discardWorst: 1 },
    teams: true,
  })
  eq(leaderboardTabs(f).map(b => b.key), ['stableford', 'strokes', 'custom', 'teams'],
    'each active board becomes a tab, teams last')
  eq(f.individual.customPoints, [10, 5], 'a stored table is read back')
  eq(f.individual.discardWorst, 1, 'so is the discard setting')
  ok(individualOn(f), 'individual is on when any of its boards is')

  const stablefordOnly = parseFormats({ individual: { stableford: true } })
  eq(leaderboardTabs(stablefordOnly).map(b => b.key), ['stableford'], 'one board, one tab')
  ok(individualOn(stablefordOnly), 'and individual counts as on')

  const noBoards = parseFormats({ individual: { stableford: false }, teams: true })
  ok(!individualOn(noBoards), 'individual is off when none of its boards is ticked')
  eq(leaderboardTabs(noBoards).map(b => b.key), ['teams'], 'leaving only the teams tab')

  // Matchplay has its own route, so it is never a tab
  const mp = parseFormats({ individual: { stableford: true }, matchplay: true })
  ok(mp.matchplay, 'matchplay is on')
  ok(!leaderboardTabs(mp).some(b => (b.key as string) === 'matchplay'),
    'but it does not appear as a tab')
}

section('Older trips are read without migrating')
{
  const legacy = parseFormats({
    individual_stableford: true, individual_strokes: true,
    individual_matchplay: true, teams: true,
  })
  ok(legacy.individual.stableford, 'the old stableford flag maps to the board')
  ok(legacy.individual.strokes, 'so does the old strokes flag')
  ok(legacy.matchplay, 'the old matchplay flag maps across')
  ok(legacy.teams, 'and teams')
  ok(!legacy.individual.custom, 'custom is off, since it did not exist')
  eq(legacy.individual.discardWorst, 0, 'and nothing is discarded')

  const legacyStableford = parseFormats({ individual_stableford: true })
  eq(leaderboardTabs(legacyStableford).map(b => b.key), ['stableford'],
    'a plain old trip still shows its one board')
}

section('Something is always on')
{
  eq(parseFormats({}), DEFAULT_FORMATS, 'an empty object falls back to the default')
  eq(parseFormats(null), DEFAULT_FORMATS, 'so does null')
  eq(parseFormats({ individual: { stableford: false }, matchplay: false, teams: false }),
    DEFAULT_FORMATS, 'and so does a trip with everything switched off')
  ok(!isEmpty(parseFormats({})), 'the fallback is never empty')
  ok(isEmpty({ individual: { stableford: false, strokes: false, custom: false, customPoints: [], discardWorst: 0 }, matchplay: false, teams: false }),
    'but an all-off object is recognised as empty')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
