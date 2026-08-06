/**
 * Custom points and discard tests. Run with: npm run test:custom-points
 *
 * The awarding rule has to hold up when players tie, when someone misses a
 * round, and when the table is shorter than the field. Dropping worst rounds
 * has to behave in both directions — worst is the lowest Stableford but the
 * highest nett strokes.
 *
 * The format model itself is tested in scripts/test-formats.ts.
 */

import {
  defaultCustomPoints, resolveCustomPoints, isDefaultCustomPoints, clampPoints, customPointsError,
  awardRound, totalAfterDiscard, discardedIndices, MAX_CUSTOM_POINTS,
} from '../lib/customPoints'

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

section('An untouched default follows the field; an edited table does not')
{
  // A board is nearly always made before the field is known — teams are
  // picked afterwards, and players go on joining — so a default is a shape
  // rather than a set of numbers, and it has to keep up.
  ok(isDefaultCustomPoints([2, 1]), 'the two-row table a fresh board starts with is a default')
  ok(isDefaultCustomPoints(defaultCustomPoints(6)), 'and so is one of any size')
  ok(!isDefaultCustomPoints([10, 5, 3]), 'a table somebody has decided on is not')
  ok(!isDefaultCustomPoints([2, 1, 0, 0]), 'nor is a default that was padded out')
  ok(!isDefaultCustomPoints([]), 'and an empty table is nothing at all')

  // The bug this exists for: a board made while the field was two, six
  // players on the trip, and third to sixth paid nothing.
  eq(resolveCustomPoints([2, 1], 6), [6, 5, 4, 3, 2, 1],
    'an untouched default grows to the field rather than padding with noughts')
  eq(resolveCustomPoints([6, 5, 4, 3, 2, 1], 3), [3, 2, 1],
    'and shrinks with it, rather than paying places nobody can come in')

  // A decision is a decision, whatever the field does afterwards
  eq(resolveCustomPoints([10, 5], 6), [10, 5, 0, 0, 0, 0],
    'an edited table is still padded — deciding the winner gets ten is not undone by a joiner')
  eq(resolveCustomPoints([0, 0], 4), [0, 0, 0, 0],
    'and a table edited to nothing stays nothing')

  // A team board makes it certain rather than merely likely: there are never
  // any teams at the moment the board is made.
  eq(resolveCustomPoints(defaultCustomPoints(2), 4), [4, 3, 2, 1],
    'a team prize board sized against no teams pays every team once they exist')
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

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
