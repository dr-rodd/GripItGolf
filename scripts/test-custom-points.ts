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

import fs from 'fs'
import {
  defaultCustomPoints, resolveCustomPoints, isDefaultCustomPoints, clampPoints, customPointsError,
  awardRound, totalAfterDiscard, discardedIndices, MAX_CUSTOM_POINTS,
  pointsOutOfStep, anyPointsOutOfStep, TEAM_POINTS_MISMATCH, PLAYER_POINTS_MISMATCH,
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

section('When the table and the field disagree')
{
  // The board never breaks over this — `resolveCustomPoints` pads short and
  // trims long when the rows are read. What it cannot do is tell anybody, and
  // a place silently worth nothing is found out at the prizegiving.

  // An untouched default is a shape, not a set of figures: it follows the
  // field wherever the field goes, so it can never be out of step. Warning
  // about it would be warning that nothing happened — and since a default is
  // what every board starts with, getting this wrong would mean warning on
  // every trip, every time, which is the same as never warning at all.
  ok(!pointsOutOfStep(defaultCustomPoints(4), 6), 'an untouched default follows the field')
  ok(!pointsOutOfStep(defaultCustomPoints(6), 4), '  …in both directions')
  ok(!pointsOutOfStep([], 6), 'and so does no table at all')

  // An edited one is kept, so it can fall behind.
  ok(pointsOutOfStep([10, 5, 3], 4), 'an edited table one short of the field is out of step')
  ok(pointsOutOfStep([10, 5, 3, 2, 1], 4), '  …and one too long is too')
  ok(!pointsOutOfStep([10, 5, 3, 1], 4), 'while one that matches is not')

  // An empty trip is where every board starts. A warning there is noise on
  // the one screen it can safely be ignored on.
  ok(!pointsOutOfStep([10, 5, 3], 0), 'nobody in the field is not a mismatch')

  // A team board pays out to the teams and an individual board to the
  // players. Size a team table off the player count and it pays places
  // nobody can come in — which is the bug this split exists to prevent.
  const teamBoard = { combine: 'position', audience: 'team', customPoints: [10, 5, 3] }
  const soloBoard = { combine: 'position', audience: 'individual', customPoints: [10, 5, 3] }

  ok(anyPointsOutOfStep([teamBoard], { players: 3, teams: 4 }),
    'a team board is measured against the teams')
  ok(!anyPointsOutOfStep([teamBoard], { players: 8, teams: 3 }),
    '  …and not against the players, however many there are')
  ok(anyPointsOutOfStep([soloBoard], { players: 8, teams: 3 }),
    'an individual board is measured against the players')
  ok(!anyPointsOutOfStep([soloBoard], { players: 3, teams: 8 }), '  …and not the teams')

  // Only boards that actually pay by position are asked.
  ok(!anyPointsOutOfStep([{ combine: 'total', audience: 'individual', customPoints: [10, 5] }],
    { players: 8, teams: 0 }), 'a board that adds the rounds up carries no table to disagree')
  ok(!anyPointsOutOfStep([], { players: 8, teams: 4 }), 'and a trip with no boards has nothing to say')

  // One board out of step is enough, whichever it is.
  ok(anyPointsOutOfStep([soloBoard, teamBoard], { players: 3, teams: 4 }),
    'any one board out of step is a mismatch')

  // The two messages are the copy that was asked for, word for word. Pinned
  // because they are the only thing a reader ever sees of any of this.
  ok(TEAM_POINTS_MISMATCH.includes("The amount of teams doesn't match the Points by Position allocation"),
    'the team warning says what it was written to say')
  ok(TEAM_POINTS_MISMATCH.includes('Please return to leaderboards settings to confirm.'),
    '  …and where to go about it')
  ok(PLAYER_POINTS_MISMATCH.includes('Check the Points by Position leaderboard settings'),
    'and the player warning says what it was written to say')
  ok(PLAYER_POINTS_MISMATCH.includes("player addition hasn't resulted in disruption to points allocation"),
    '  …and what to look for')
}

// ─── The two moments that cause it ─────────────────────────────

section('The two steppers under the table')
{
  const setup = fs.readFileSync('app/components/LeaderboardSetup.tsx', 'utf-8')

  // They are a glyph each. That is the whole point of them being small, and
  // it is also the one way this goes quietly wrong: an icon with nothing but
  // a shape is "button, button" to a screen reader. `label` is the icon's
  // accessible name, so it is not optional here the way it is on an icon
  // sitting beside its own words.
  ok(setup.includes('label="Add a place"'), 'the plus says what it adds')
  ok(setup.includes('label="Remove the last place"'), 'and the minus what it takes')

  // A new place is worth nothing until somebody says otherwise — guessing a
  // figure would be inventing a decision nobody made.
  ok(/onChange\(\[\.\.\.rows, 0\]\)/.test(setup), 'a place arrives on nought')
  ok(/onChange\(rows\.slice\(0, -1\)\)/.test(setup), 'and leaves from the bottom')
  ok(/disabled=\{rows\.length <= 1\}/.test(setup),
    'the last row cannot be taken away — an empty table cannot be answered')

  const icons = fs.readFileSync('app/components/icons.tsx', 'utf-8')
  ok(icons.includes('export const IconMinus'), 'the minus is a Tabler icon like every other')
}

section('Both screens that change the field say so')
{
  const read = (f: string) => fs.readFileSync(f, 'utf-8')

  // The team sheet. Only this sheet's team boards are asked: a trip can run
  // a league between fours and a knockout between pairings, so the other
  // sheet's table is measured against its own teams. Individual boards are
  // not asked at all — their field is the players, and no player arrived or
  // left when a team was added.
  const teams = read('app/trip/[tripCode]/teams/TripTeamsClient.tsx')
  ok(teams.includes('TEAM_POINTS_MISMATCH'), 'the team sheet warns when the count stops matching')
  ok(/audience === 'team' && \(b\.teamSet \?\? MAIN_SET\) === sheet/.test(teams),
    '  …about this sheet\'s team boards and no others')
  ok(/anyPointsOutOfStep\(sheetBoards, \{ players: players\.length, teams: n \}\)/.test(teams),
    '  …measured against the count it is changing to, not the one it is leaving')

  // The roster. `players.length + 1` because `setPlayers` is queued and has
  // not settled on the line that reads it — counting the old roster would
  // mean the warning arrives one player late, every time.
  const setup = read('app/trip/[tripCode]/setup/TripSetupClient.tsx')
  ok(setup.includes('PLAYER_POINTS_MISMATCH'), 'the roster warns when a player is added')
  ok(/players: players\.length \+ 1/.test(setup),
    '  …counting the player being added, who is not in state yet')

  // Both are told, not asked. The row has already been padded or trimmed and
  // the write has already happened, so a question with one answer would be
  // worse than a statement — and refusing to add a player at the range
  // because a prize table is a row short is the wrong trade.
  ok(/window\.alert\(TEAM_POINTS_MISMATCH\)/.test(teams), 'the team warning is acknowledged, not obeyed')
  ok(/window\.alert\(PLAYER_POINTS_MISMATCH\)/.test(setup), 'and so is the player one')
  ok(!/confirm\(TEAM_POINTS_MISMATCH|confirm\(PLAYER_POINTS_MISMATCH/.test(teams + setup),
    'neither can refuse the thing it is warning about')

  // After the write on the roster, or a warning would be describing
  // something that then failed to happen.
  // Against the call rather than the name: the name also appears in the
  // import at the top of the file, which is before everything.
  ok(setup.indexOf('setPlayers(prev => [...prev, data])')
     < setup.indexOf('window.alert(PLAYER_POINTS_MISMATCH)'),
    'and the player warning comes after the player')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
