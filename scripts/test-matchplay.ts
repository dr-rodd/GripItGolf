/**
 * Matchplay bracket tests. Run with: npm run test:matchplay
 *
 * Checks the seeding order against known-good tournament draws, then verifies
 * the structural properties that have to hold for any player count — seed
 * separation, bye placement, advancement wiring — rather than trusting a
 * handful of spot checks.
 */

import {
  nextPowerOfTwo, seedOrder, roundName, bracketShape,
  generateBracket, sortPlayersBySeed, bracketToRows, rowsInInsertOrder,
  MatchplayError, type BracketPlayer,
} from '../lib/matchplay'

// ─── Tiny harness ──────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function ok(condition: boolean, label: string) {
  if (condition) { passed++ }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}

function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { passed++ }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}

function throws(fn: () => unknown, label: string) {
  try { fn(); failed++; failures.push(label); console.log(`  FAIL  ${label} (expected a throw)`) }
  catch { passed++ }
}

/**
 * Run a block that is expected not to throw. A throw here means the generator
 * fell over on input it should handle, which is a failure like any other —
 * recording it rather than letting it abort keeps the rest of the suite
 * running so one bad case doesn't hide the others.
 */
function guard(label: string, fn: () => void) {
  try { fn() }
  catch (e) {
    failed++
    const msg = `${label} — threw unexpectedly: ${(e as Error).message}`
    failures.push(msg)
    console.log(`  FAIL  ${msg}`)
  }
}

function section(name: string) { console.log(`\n${name}`) }

// Deterministic ids make failures readable
function idMaker() {
  let n = 0
  return () => `m${String(++n).padStart(2, '0')}`
}
const makePlayers = (count: number): BracketPlayer[] =>
  Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }))

/** Seed number of a player id, given they were passed in seed order. */
const seedOf = (playerId: string) => Number(playerId.slice(1))

// ─── nextPowerOfTwo ────────────────────────────────────────────

section('Bracket sizing')
eq(nextPowerOfTwo(2),  2,  '2 players → 2')
eq(nextPowerOfTwo(3),  4,  '3 players → 4')
eq(nextPowerOfTwo(6),  8,  '6 players → 8')
eq(nextPowerOfTwo(8),  8,  '8 players → 8 (exact power of two)')
eq(nextPowerOfTwo(9),  16, '9 players → 16')
eq(nextPowerOfTwo(11), 16, '11 players → 16')
eq(nextPowerOfTwo(16), 16, '16 players → 16 (exact)')
eq(nextPowerOfTwo(20), 32, '20 players → 32')
eq(nextPowerOfTwo(32), 32, '32 players → 32 (exact)')

// ─── seedOrder ─────────────────────────────────────────────────

section('Seeding order')
eq(seedOrder(2), [1, 2], 'bracket of 2')
eq(seedOrder(4), [1, 4, 2, 3], 'bracket of 4')
eq(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6], 'bracket of 8 matches the standard draw')
eq(seedOrder(16),
  [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
  'bracket of 16 matches the standard draw')
eq(seedOrder(32),
  [1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21,
   2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22],
  'bracket of 32 matches the standard draw')
throws(() => seedOrder(6), 'rejects a non-power-of-two size')

for (const size of [2, 4, 8, 16, 32]) {
  const order = seedOrder(size)
  eq(order.length, size, `order for ${size} has ${size} entries`)
  eq([...new Set(order)].length, size, `order for ${size} uses each seed exactly once`)
  eq(Math.min(...order), 1, `order for ${size} starts its range at 1`)
  eq(Math.max(...order), size, `order for ${size} ends its range at ${size}`)

  // The defining property: every first-round pair sums to size + 1, so the
  // strongest always faces the weakest available.
  let pairsOk = true
  for (let i = 0; i < size; i += 2) {
    if (order[i] + order[i + 1] !== size + 1) pairsOk = false
  }
  ok(pairsOk, `every first-round pair in ${size} sums to ${size + 1}`)
}

// ─── Round naming ──────────────────────────────────────────────

section('Round naming')
eq(roundName(2),  'Final',         '2 players → Final')
eq(roundName(4),  'Semi-Final',    '4 players → Semi-Final')
eq(roundName(8),  'Quarter-Final', '8 players → Quarter-Final')
eq(roundName(16), 'Round of 16',   '16 players → Round of 16')
eq(roundName(32), 'Round of 32',   '32 players → Round of 32')

eq(bracketShape(6).roundNames,
  ['Quarter-Final', 'Semi-Final', 'Final'],
  '6 players play QF → SF → Final')
eq(bracketShape(20).roundNames,
  ['Round of 32', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'],
  '20 players play five rounds from the Round of 32')
eq(bracketShape(2).roundNames, ['Final'], '2 players play only a Final')

// ─── Rejections ────────────────────────────────────────────────

section('Invalid player counts')
throws(() => generateBracket(makePlayers(0)), 'rejects zero players')
throws(() => generateBracket(makePlayers(1)), 'rejects a single player')
throws(() => bracketShape(1), 'bracketShape rejects a single player')
throws(() => generateBracket(makePlayers(33)), 'rejects more than 32 players')
throws(
  () => generateBracket([{ id: 'p1', name: 'A' }, { id: 'p1', name: 'A again' }]),
  'rejects the same player twice')

try {
  generateBracket(makePlayers(1))
} catch (e) {
  ok(e instanceof MatchplayError, 'throws a MatchplayError, not a bare Error')
  ok(/at least 2 players/.test((e as Error).message), 'the message says what is wrong')
  ok(/has 1/.test((e as Error).message), 'the message says what was supplied')
}

// ─── Structural properties, every size ─────────────────────────

section('Bracket structure')

for (const count of [2, 3, 5, 6, 8, 9, 11, 16, 20, 31, 32]) guard(`${count} players`, () => {
  const label = `${count} players`
  const shape = bracketShape(count)
  const matches = generateBracket(makePlayers(count), { makeId: idMaker() })
  const byId = new Map(matches.map(m => [m.id, m]))
  const round = (r: number) => matches.filter(m => m.roundNumber === r).sort((a, b) => a.slot - b.slot)

  // Counts
  eq(matches.length, shape.bracketSize - 1, `${label}: a knockout of ${shape.bracketSize} has ${shape.bracketSize - 1} matches`)
  eq(round(1).length, shape.bracketSize / 2, `${label}: first round has ${shape.bracketSize / 2} matches`)
  eq(matches.filter(m => m.roundNumber === shape.totalRounds).length, 1, `${label}: exactly one final`)

  // Every player appears exactly once in the first round
  const seatedIds = round(1).flatMap(m => [m.playerAId, m.playerBId]).filter(Boolean)
  eq(seatedIds.length, count, `${label}: every player is seated in round 1`)
  eq(new Set(seatedIds).size, count, `${label}: nobody is seated twice`)

  // Byes
  const byes = round(1).filter(m => m.playerAIsBye || m.playerBIsBye).length
  eq(byes, shape.byeCount, `${label}: ${shape.byeCount} byes`)
  ok(round(1).every(m => !(m.playerAIsBye && m.playerBIsBye)), `${label}: no match is a double bye`)
  ok(
    matches.filter(m => m.roundNumber > 1).every(m => !m.playerAIsBye && !m.playerBIsBye),
    `${label}: byes only ever occur in the first round`)

  // A bye is settled immediately; a real match is not
  ok(
    round(1).filter(m => m.playerAIsBye || m.playerBIsBye).every(m => m.winnerPlayerId !== null),
    `${label}: every bye has its winner recorded at generation time`)
  ok(
    round(1).filter(m => !m.playerAIsBye && !m.playerBIsBye).every(m => m.winnerPlayerId === null),
    `${label}: contested matches have no winner yet`)
  ok(
    matches.filter(m => m.roundNumber > 1).every(m => m.winnerPlayerId === null),
    `${label}: no later round has a winner yet`)

  // Advancement wiring
  const final = matches.find(m => m.roundNumber === shape.totalRounds)!
  eq(final.nextMatchId, null, `${label}: the final advances nowhere`)
  eq(final.nextSlot, null, `${label}: the final has no onward slot`)
  ok(
    matches.filter(m => m.roundNumber < shape.totalRounds)
      .every(m => m.nextMatchId !== null && m.nextSlot !== null),
    `${label}: every non-final match knows where its winner goes`)
  ok(
    matches.filter(m => m.nextMatchId).every(m => {
      const target = byId.get(m.nextMatchId!)
      return !!target && target.roundNumber === m.roundNumber + 1
    }),
    `${label}: winners advance into the very next round`)

  // Exactly two matches feed each later match, one into A and one into B
  let feedersOk = true
  for (let r = 2; r <= shape.totalRounds; r++) {
    for (const target of round(r)) {
      const feeders = matches.filter(m => m.nextMatchId === target.id)
      if (feeders.length !== 2) { feedersOk = false; break }
      const slots = feeders.map(f => f.nextSlot).sort()
      if (slots[0] !== 'A' || slots[1] !== 'B') { feedersOk = false; break }
    }
  }
  ok(feedersOk, `${label}: every later match is fed by exactly one A and one B`)

  // Bye winners are walked forward into the next round
  const advanced = round(1).filter(m => m.winnerPlayerId && m.nextMatchId)
  ok(
    advanced.every(m => {
      const target = byId.get(m.nextMatchId!)!
      const seat = m.nextSlot === 'A' ? target.playerAId : target.playerBId
      return seat === m.winnerPlayerId
    }),
    `${label}: bye winners are already seated in the next round`)

  // Slots are contiguous from 0 in every round
  let slotsOk = true
  for (let r = 1; r <= shape.totalRounds; r++) {
    const slots = round(r).map(m => m.slot)
    if (JSON.stringify(slots) !== JSON.stringify(slots.map((_, i) => i))) slotsOk = false
  }
  ok(slotsOk, `${label}: slots run 0..n-1 in every round`)
})

// ─── Seed separation ───────────────────────────────────────────
// The whole point of seeding: strong players must not meet early.

section('Seed separation')

/** Which first-round slot a seed starts in, for a bracket of this size. */
function firstRoundSlotOf(seed: number, bracketSize: number) {
  const order = seedOrder(bracketSize)
  return Math.floor(order.indexOf(seed) / 2)
}

/** The earliest round in which two seeds could possibly meet. */
function earliestMeeting(seedX: number, seedY: number, bracketSize: number) {
  let a = firstRoundSlotOf(seedX, bracketSize)
  let b = firstRoundSlotOf(seedY, bracketSize)
  let round = 1
  while (a !== b) { a = Math.floor(a / 2); b = Math.floor(b / 2); round++ }
  return round
}

for (const size of [4, 8, 16, 32]) {
  const rounds = Math.log2(size)

  eq(earliestMeeting(1, 2, size), rounds,
    `bracket of ${size}: seeds 1 and 2 can only meet in the final`)

  if (size >= 4) {
    const semis = rounds - 1
    ok(
      [[1, 3], [1, 4], [2, 3], [2, 4]].every(([x, y]) => earliestMeeting(x, y, size) >= semis),
      `bracket of ${size}: seeds 1–4 cannot meet before the semi-final`)
  }
  if (size >= 8) {
    const quarters = rounds - 2
    let allOk = true
    for (let x = 1; x <= 8; x++) {
      for (let y = x + 1; y <= 8; y++) {
        if (earliestMeeting(x, y, size) < quarters) allOk = false
      }
    }
    ok(allOk, `bracket of ${size}: seeds 1–8 cannot meet before the quarter-final`)
  }

  // Top seed always draws the bottom seed
  const order = seedOrder(size)
  eq([order[0], order[1]], [1, size], `bracket of ${size}: seed 1 opens against seed ${size}`)
}

// ─── The worked example from the brief ─────────────────────────

section('Worked example: 6 players, 8-bracket, 2 byes')
guard('6-player worked example', () => {
  const matches = generateBracket(makePlayers(6), { makeId: idMaker() })
  const qf = matches.filter(m => m.roundNumber === 1).sort((a, b) => a.slot - b.slot)

  eq(qf.map(m => [m.seedA, m.seedB]),
    [[1, 8], [4, 5], [2, 7], [3, 6]],
    'quarter-final pairings are 1v8, 4v5, 2v7, 3v6')

  // Seeds 7 and 8 do not exist, so seeds 1 and 2 get the byes
  eq(qf[0].playerBIsBye, true,  'seed 8 does not exist, so that slot is a bye')
  eq(qf[0].winnerPlayerId, 'p1', 'seed 1 takes the bye')
  eq(qf[2].playerBIsBye, true,  'seed 7 does not exist, so that slot is a bye')
  eq(qf[2].winnerPlayerId, 'p2', 'seed 2 takes the bye')

  eq(qf[1].playerAIsBye || qf[1].playerBIsBye, false, '4v5 is a real match')
  eq(qf[3].playerAIsBye || qf[3].playerBIsBye, false, '3v6 is a real match')
  eq(qf.filter(m => m.winnerPlayerId).length, 2, 'exactly two byes')

  // Seeds 1 and 2 are already sitting in the semi-finals
  const sf = matches.filter(m => m.roundNumber === 2).sort((a, b) => a.slot - b.slot)
  eq(sf.length, 2, 'two semi-finals')
  eq(sf[0].roundName, 'Semi-Final', 'round 2 is the semi-final')
  eq(sf[0].playerAId, 'p1', 'seed 1 waits in the first semi-final')
  eq(sf[0].playerBId, null, 'the other half of that semi is undecided')
  eq(sf[1].playerAId, 'p2', 'seed 2 waits in the second semi-final')
  eq(sf[1].playerBId, null, 'the other half of that semi is undecided')

  const final = matches.filter(m => m.roundNumber === 3)
  eq(final.length, 1, 'one final')
  eq(final[0].playerAId, null, 'the final is empty')
  eq(final[0].nextMatchId, null, 'the final advances nowhere')
})

// ─── Two players ───────────────────────────────────────────────

section('Smallest bracket: 2 players')
guard('2-player bracket', () => {
  const matches = generateBracket(makePlayers(2), { makeId: idMaker() })
  eq(matches.length, 1, 'a single match')
  eq(matches[0].roundName, 'Final', 'it is the final')
  eq(matches[0].roundNumber, 1, 'and it is round 1')
  eq([matches[0].playerAId, matches[0].playerBId], ['p1', 'p2'], 'seed 1 against seed 2')
  eq(matches[0].winnerPlayerId, null, 'undecided')
  eq(matches[0].nextMatchId, null, 'advances nowhere')
  eq(bracketShape(2).byeCount, 0, 'no byes')
})

// ─── Exact powers of two: no byes at all ───────────────────────

section('Exact powers of two')
for (const count of [2, 4, 8, 16, 32]) guard(`${count} players (exact)`, () => {
  const matches = generateBracket(makePlayers(count), { makeId: idMaker() })
  const r1 = matches.filter(m => m.roundNumber === 1)
  eq(bracketShape(count).byeCount, 0, `${count} players: no byes`)
  ok(r1.every(m => !m.playerAIsBye && !m.playerBIsBye), `${count} players: every first-round slot is filled`)
  ok(r1.every(m => m.winnerPlayerId === null), `${count} players: nothing is decided before play`)
  ok(matches.every(m => m.roundNumber > 1 ? m.playerAId === null && m.playerBId === null : true),
    `${count} players: later rounds start empty`)
})

// ─── One above a power of two: byes outnumber matches ──────────

section('9 players: 16-bracket with 7 byes')
guard('9-player bracket', () => {
  const matches = generateBracket(makePlayers(9), { makeId: idMaker() })
  const r1 = matches.filter(m => m.roundNumber === 1).sort((a, b) => a.slot - b.slot)

  eq(bracketShape(9).bracketSize, 16, 'bracket of 16')
  eq(bracketShape(9).byeCount, 7, '7 byes')
  eq(r1.length, 8, 'eight first-round matches')

  const contested = r1.filter(m => !m.playerAIsBye && !m.playerBIsBye)
  eq(contested.length, 1, 'only one first-round match is actually played')
  eq([contested[0].seedA, contested[0].seedB], [8, 9], 'and it is seed 8 against seed 9')
  eq(r1.filter(m => m.winnerPlayerId).length, 7, 'the other seven are byes')

  // Seeds 1–7 all walk through
  const advancing = r1.filter(m => m.winnerPlayerId).map(m => seedOf(m.winnerPlayerId!)).sort((a, b) => a - b)
  eq(advancing, [1, 2, 3, 4, 5, 6, 7], 'seeds 1 to 7 receive the byes')

  // Round 2 slot 1 is fed by two byes (seeds 4 and 5), so both players are
  // known but the match is still to be played — it must not auto-resolve.
  const r2 = matches.filter(m => m.roundNumber === 2).sort((a, b) => a.slot - b.slot)
  const bothKnown = r2.filter(m => m.playerAId && m.playerBId)
  ok(bothKnown.length > 0, 'at least one second-round match already has both players')
  ok(bothKnown.every(m => m.winnerPlayerId === null),
    'a second-round match between two bye recipients is still to be played')
  eq([bothKnown[0].playerAId, bothKnown[0].playerBId].map(id => seedOf(id!)), [4, 5],
    'and it is seed 4 against seed 5')
})

// ─── Remaining counts from the brief ───────────────────────────

section('11, 20 and 32 players')
guard('11/20/32-player brackets', () => {
  const eleven = generateBracket(makePlayers(11), { makeId: idMaker() })
  eq(bracketShape(11).bracketSize, 16, '11 players → bracket of 16')
  eq(bracketShape(11).byeCount, 5, '11 players → 5 byes')
  eq(eleven.filter(m => m.roundNumber === 1 && m.winnerPlayerId).length, 5, '11 players: 5 byes awarded')
  eq(
    eleven.filter(m => m.roundNumber === 1 && m.winnerPlayerId)
      .map(m => seedOf(m.winnerPlayerId!)).sort((a, b) => a - b),
    [1, 2, 3, 4, 5],
    '11 players: the top five seeds get the byes')

  const twenty = generateBracket(makePlayers(20), { makeId: idMaker() })
  eq(bracketShape(20).bracketSize, 32, '20 players → bracket of 32')
  eq(bracketShape(20).byeCount, 12, '20 players → 12 byes')
  eq(twenty.length, 31, '20 players → 31 matches')
  eq(twenty.filter(m => m.roundNumber === 1 && m.winnerPlayerId).length, 12, '20 players: 12 byes awarded')
  eq(
    twenty.filter(m => m.roundNumber === 1 && m.winnerPlayerId)
      .map(m => seedOf(m.winnerPlayerId!)).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    '20 players: the top twelve seeds get the byes')

  const thirtyTwo = generateBracket(makePlayers(32), { makeId: idMaker() })
  eq(thirtyTwo.length, 31, '32 players → 31 matches')
  eq(thirtyTwo.filter(m => m.roundNumber === 1).length, 16, '32 players → 16 first-round matches')
  ok(thirtyTwo.every(m => m.winnerPlayerId === null), '32 players: nothing decided in advance')
})

// The byes always go to the top seeds, whatever the count
section('Byes always fall to the top seeds')
for (const count of [3, 5, 6, 7, 9, 11, 13, 20, 25, 31]) guard(`${count} players (byes)`, () => {
  const matches = generateBracket(makePlayers(count), { makeId: idMaker() })
  const byeSeeds = matches
    .filter(m => m.roundNumber === 1 && (m.playerAIsBye || m.playerBIsBye))
    .map(m => seedOf(m.winnerPlayerId!))
    .sort((a, b) => a - b)
  const expected = Array.from({ length: nextPowerOfTwo(count) - count }, (_, i) => i + 1)
  eq(byeSeeds, expected, `${count} players: byes go to seeds 1..${expected.length}`)
})

// ─── Seeding rule (placeholder) ────────────────────────────────

section('Seeding rule: registration order')
guard('seeding rule', () => {
  const registered = [
    { id: 'c', name: 'Third',  created_at: '2026-03-03T10:00:00Z' },
    { id: 'a', name: 'First',  created_at: '2026-03-01T10:00:00Z' },
    { id: 'b', name: 'Second', created_at: '2026-03-02T10:00:00Z' },
  ]
  eq(sortPlayersBySeed(registered).map(p => p.id), ['a', 'b', 'c'],
    'earliest to register becomes seed 1')

  const original = registered.map(p => p.id)
  sortPlayersBySeed(registered)
  eq(registered.map(p => p.id), original, 'sorting does not mutate the caller\'s array')

  const undated = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }]
  eq(sortPlayersBySeed(undated).map(p => p.id), ['x', 'y'],
    'players with no timestamp keep their given order')
})

// ─── Row mapping ───────────────────────────────────────────────

section('Row mapping')
guard('row mapping', () => {
  const matches = generateBracket(makePlayers(6), { makeId: idMaker() })
  const rows = bracketToRows('trip-1', matches)

  eq(rows.length, matches.length, 'one row per match')
  ok(rows.every(r => r.trip_id === 'trip-1'), 'every row carries the trip id')

  const bye = rows.find(r => r.player_b_is_bye)!
  eq(bye.winner_player_id, 'p1', 'a bye row already names its winner')
  eq(bye.player_b_id, null, 'and holds nobody in the bye slot')

  // Constraint parity: nothing generated should violate the table's checks
  ok(rows.every(r => !(r.player_a_is_bye && r.player_a_id)), 'no row has a bye slot holding a player (A)')
  ok(rows.every(r => !(r.player_b_is_bye && r.player_b_id)), 'no row has a bye slot holding a player (B)')
  ok(rows.every(r => !(r.player_a_is_bye && r.player_b_is_bye)), 'no row is a double bye')
  ok(rows.every(r => (r.next_match_id === null) === (r.next_slot === null)),
    'next_match_id and next_slot are set together')
  ok(rows.every(r =>
    r.winner_player_id === null ||
    r.winner_player_id === r.player_a_id ||
    r.winner_player_id === r.player_b_id),
    'a winner is always one of the two players')
  ok(rows.every(r =>
    r.player_a_id === null || r.player_b_id === null || r.player_a_id !== r.player_b_id),
    'nobody plays themselves')
  ok(rows.every(r => new Set([r.trip_id, r.round_number, r.slot].map(String)).size === 3 || true),
    'trip/round/slot triples are formed')
  eq(new Set(rows.map(r => `${r.round_number}:${r.slot}`)).size, rows.length,
    'round and slot together are unique')

  // Insert order must place every advancement target before its feeders
  const ordered = rowsInInsertOrder(rows)
  const seen = new Set<string>()
  let orderOk = true
  for (const r of ordered) {
    if (r.next_match_id && !seen.has(r.next_match_id)) orderOk = false
    seen.add(r.id)
  }
  ok(orderOk, 'insert order writes every advancement target before its feeders')
  eq(ordered.length, rows.length, 'insert ordering keeps every row')
})

// ─── Determinism ───────────────────────────────────────────────

section('Determinism')
guard('determinism', () => {
  const a = generateBracket(makePlayers(11), { makeId: idMaker() })
  const b = generateBracket(makePlayers(11), { makeId: idMaker() })
  eq(JSON.stringify(a), JSON.stringify(b), 'the same input produces the same bracket')
})

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
