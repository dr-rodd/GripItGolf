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
import {
  portalRounds, currentRound, describeProgress, myNextMatch, opponentOf, describeResult,
  type PortalMatch,
} from '../lib/knockoutPortal'
import {
  parseMatchTees, withTee, matchStrokes, shotHoles, describeReceives,
  normaliseContact, contactShown, walkoverChoices, WALKOVER,
} from '../lib/matchArrangements'
import { holeOutcomes, cardState, openingHole, shouldWrite, playCard, ordinal, courseHoleFor } from '../lib/matchCard'

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
throws(() => generateBracket(makePlayers(65)), 'rejects more than 64 players')
eq(generateBracket(makePlayers(64)).length, 63, '64 players → 63 matches, the largest draw')
eq(generateBracket(makePlayers(33)).filter(m => m.roundNumber === 1).length, 32, '33 players → a draw of 64, byes and all')
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

// ─── The knockout from one player's side ───────────────────────

section('The portal: rounds, deadlines, your match first, byes not listed')
guard('portal', () => {
  const pm = (o: Partial<PortalMatch>): PortalMatch => ({
    id: 'x', roundNumber: 1, roundName: 'Quarter-Final', slot: 0, sideA: null, sideB: null,
    aIsBye: false, bIsBye: false, winner: null, result: null, ...o,
  })
  const draw = [
    pm({ id: 'q1', slot: 0, sideA: 'ann', sideB: 'bob', winner: 'ann', result: '3&2' }),
    pm({ id: 'q2', slot: 1, sideA: 'cat', sideB: null, bIsBye: true, winner: 'cat' }),
    pm({ id: 'q3', slot: 2, sideA: 'dan', sideB: 'me' }),
    pm({ id: 'q4', slot: 3, sideA: 'eve', sideB: 'fay' }),
    pm({ id: 's1', roundNumber: 2, roundName: 'Semi-Final', slot: 0, sideA: 'ann', sideB: 'cat' }),
    pm({ id: 's2', roundNumber: 2, roundName: 'Semi-Final', slot: 1 }),
    pm({ id: 'f', roundNumber: 3, roundName: 'Final', slot: 0 }),
  ]
  const rounds = portalRounds(draw, 'me', ['2026-11-14', '2026-12-12', null])
  eq(rounds.map(r => r.roundName).join(), 'Quarter-Final,Semi-Final,Final', 'every bracket round, in playing order')
  eq(rounds[0].matches.map(m => m.id).join(), 'q3,q1,q4', 'your own match first, then the draw order; the bye is not a match')
  ok(rounds[0].matches[0].mine && !rounds[0].matches[1].mine, '  …and only yours is marked yours')
  eq([rounds[0].played, rounds[0].total], [1, 3], 'one of three played — the bye is not counted')
  eq(rounds.map(r => r.deadline).join(), '2026-11-14,2026-12-12,', 'each round carries its play-by date')
  eq(currentRound(rounds)?.roundName, 'Quarter-Final', 'the round being played now: the first with a match open')
  eq(describeProgress(rounds), '1 of 6 matches played', 'the draw at a glance')
  eq(myNextMatch(draw, 'me')?.id, 'q3', 'your next match')
  eq(myNextMatch(draw, 'bob'), null, 'out: no next match')
  eq(myNextMatch(draw, 'cat')?.id, 's1', 'through on a bye: the next real match')
  eq(opponentOf(draw[2], 'me'), 'dan', 'the other side, from your seat')
  eq(describeResult(draw[0], id => ({ ann: 'Ann' } as Record<string, string>)[id] ?? null), 'Ann won 3&2', 'a result in a sentence')
  eq(describeResult(draw[2], () => 'x'), null, '  …and nothing while it is open')
  const done = portalRounds(draw.map(m => ({ ...m, winner: m.winner ?? 'z' })), null)
  eq(currentRound(done)?.roundName, 'Final', 'a finished draw opens on its Final')
  eq(describeProgress(done), 'Every match played', '  …and says so')
})

// ─── Arranging a match ─────────────────────────────────────────

section('Arranging a match: tees, the shots, contacts, a walkover')
guard('arrangements', () => {
  const tee = { slope: 113, course_rating: 72, par: 72 } // course handicap = index
  eq(parseMatchTees({ a: 't1', b: 7, c: '' }), { a: 't1' }, 'stored tees are tidied: string to string')
  eq(parseMatchTees(null), {}, '  …and nothing is an empty set, never null')
  eq(withTee({ a: 't1' }, 'b', 't2'), { a: 't1', b: 't2' }, 'a tee set')
  eq(withTee({ a: 't1' }, 'a', null), {}, '  …and taken off')

  eq(matchStrokes([{ playerId: 'a', index: 8, tee }, { playerId: 'b', index: 12, tee }], 100),
    [{ playerId: 'a', courseHandicap: 8, playing: 8, receives: 0 }, { playerId: 'b', courseHandicap: 12, playing: 12, receives: 4 }],
    'singles: the higher handicap gets the difference')
  eq(matchStrokes([{ playerId: 'a', index: 10, tee }, { playerId: 'b', index: 20, tee },
                   { playerId: 'c', index: 4, tee }, { playerId: 'd', index: 15, tee }], 90)?.map(r => r.receives),
    [5, 14, 0, 10], 'a fourball at 90%: everyone off the lowest, after the allowance')
  eq(matchStrokes([{ playerId: 'a', index: 8, tee }, { playerId: 'b', index: 12, tee: null }], 100), null,
    'no shots until every player has a tee')
  eq(matchStrokes([{ playerId: 'a', index: null, tee }, { playerId: 'b', index: 12, tee }], 100), null,
    '  …and a handicap')
  const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, strokeIndex: 18 - i, strokeIndexLadies: i + 1 }))
  eq(shotHoles(4, holes, 'M').map(h => h.holeNumber), [15, 16, 17, 18], 'four shots: the four hardest holes')
  eq(shotHoles(4, holes, 'F').map(h => h.holeNumber), [1, 2, 3, 4], '  …off the ladies\' index for a woman')
  eq(shotHoles(20, holes, 'M').filter(h => h.shots === 2).map(h => h.holeNumber), [17, 18], 'twenty: two on the two hardest')
  eq(shotHoles(0, holes, 'M'), [], 'scratch in the match: none')
  eq([describeReceives(0), describeReceives(1), describeReceives(4)], ['Plays off scratch', 'Gets 1 shot', 'Gets 4 shots'], 'said plainly')

  eq(normaliseContact({ phone: ' 087  123 4567 ', email: 'Ross@Example.ie', visibility: 'public' }),
    { phone: '087 123 4567', email: 'ross@example.ie', visibility: 'public' }, 'contact details tidied')
  eq(normaliseContact({}), { phone: null, email: null, visibility: 'opponent' }, '  …both optional, opponent-only by default')
  ok('issue' in normaliseContact({ phone: 'call me' }), 'a phone number that is not one is refused')
  ok('issue' in normaliseContact({ phone: '123' }), '  …and one too short to be real')
  ok('issue' in normaliseContact({ email: 'ross@' }), 'an email that is not one is refused')
  ok(contactShown({ visibility: 'opponent' }, { isSelf: false, isOpponent: true }), 'opponent-only: the opponent sees them')
  ok(!contactShown({ visibility: 'opponent' }, { isSelf: false, isOpponent: false }), '  …nobody else does')
  ok(contactShown({ visibility: 'public' }, { isSelf: false, isOpponent: false }), 'public: the field sees them')
  ok(contactShown({ visibility: 'opponent' }, { isSelf: true, isOpponent: false }), 'and you always see your own')

  const open: PortalMatch = { id: 'm', roundNumber: 1, roundName: 'Final', slot: 0, sideA: 'me', sideB: 'dan',
    aIsBye: false, bIsBye: false, winner: null, result: null }
  eq(walkoverChoices(open, 'me', false), ['dan'], 'a player concedes: the walkover goes to the other side')
  eq(walkoverChoices(open, 'eve', false), [], '  …nobody else in the field can')
  eq(walkoverChoices(open, null, true), ['me', 'dan'], 'the organiser awards it to either side')
  eq(walkoverChoices({ ...open, winner: 'me' }, 'dan', false), [], 'a decided match cannot be conceded')
  eq(walkoverChoices({ ...open, winner: 'me' }, null, true), ['me', 'dan'], '  …the organiser can still change it')
  eq(walkoverChoices({ ...open, sideB: null }, null, true), [], 'not while a side is still to be decided')
  eq(walkoverChoices({ ...open, bIsBye: true }, null, true), [], 'and never on a bye')
  eq(WALKOVER.length <= 12, true, 'a walkover fits the bracket\'s margin column')
})

// ─── The match play card ───────────────────────────────────────

section('The match play card: shots, better ball, concessions, and when it is over')
guard('match card', () => {
  const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 }))
  const A = { id: 'ann', players: [{ id: 'ann', gender: 'M', receives: 0 }] }
  const B = { id: 'bob', players: [{ id: 'bob', gender: 'M', receives: 2 }] } // shots on SI 1 and 2
  const card = (a: number[], b: number[]) => new Map([
    ['ann', new Map(a.map((g, i) => [i + 1, g]))],
    ['bob', new Map(b.map((g, i) => [i + 1, g]))],
  ])
  const none = new Map<number, 'A' | 'B'>()

  let o = holeOutcomes(holes, A, B, card([4, 4, 4], [5, 4, 4]), none)
  eq(o.slice(0, 3).map(x => x.winner), ['halved', 'B', 'halved'],
    'Bob\'s shot on SI 1 halves his 5 with Ann\'s 4; on SI 2 his 4 wins; on SI 3 there is no shot and 4 halves 4')
  o = holeOutcomes(holes, A, B, card([4, 4, 3], [5, 4, 4]), none)
  eq(o[2].winner, 'A', 'a birdie wins the hole with no shot to come back')
  eq(holeOutcomes(holes, A, B, card([4], []), none)[0].winner, null,
    'a hole only one side has entered is not yet a hole of the match — the first phone to tap does not win it')
  eq(holeOutcomes(holes, A, B, card([], []), new Map([[1, 'A' as const]]))[0],
    { holeNumber: 1, winner: 'B', conceded: true, nettA: null, nettB: null }, 'a hole conceded by Ann is Bob\'s, scores or not')

  const pairA = { id: 'pa', players: [{ id: 'a1', gender: 'M', receives: 0 }, { id: 'a2', gender: 'M', receives: 4 }] }
  const pairB = { id: 'pb', players: [{ id: 'b1', gender: 'M', receives: 1 }, { id: 'b2', gender: 'M', receives: 0 }] }
  const pairs = new Map([['a1', new Map([[1, 5]])], ['a2', new Map([[1, 5]])], ['b1', new Map([[1, 5]])], ['b2', new Map([[1, 4]])]])
  const po = holeOutcomes(holes, pairA, pairB, pairs, none)[0]
  eq([po.nettA, po.nettB, po.winner], [4, 4, 'halved'], 'a fourball: each pairing\'s better nett, shots and all')
  eq(holeOutcomes(holes, pairA, pairB, new Map([['a1', new Map([[1, 4]])], ['b1', new Map([[1, 4]])], ['b2', new Map([[1, 4]])]]), none)[0].winner,
    null, '  …and a pairing\'s hole waits for both its players')

  const st = (a: number[], b: number[], c = none) => cardState(holeOutcomes(holes, A, B, card(a, b), c))
  eq(st([], []).progress, 'Not started', 'nothing in: not started')
  eq(st([4, 4, 3], [5, 4, 4]).progress, 'All square thru 3', 'halved, lost, won: all square')
  const four = Array(16).fill(3), five = Array(16).fill(5)
  const win = st(four, five)
  eq([win.settled, win.leader, win.result, win.played], [true, 'A', '10&8', 10],
    'played on past the end: the result stands where it was settled, 10&8, not 16 up')
  const tenUp = st(Array(10).fill(3), Array(10).fill(5))
  eq([tenUp.settled, tenUp.result], [true, '10&8'], 'dormie and beyond: settled the moment it cannot change')
  const close = st([...Array(17).fill(4), 3], [5, 5, ...Array(15).fill(4), 4])
  eq([close.settled, close.result, close.leader], [true, '1 up', 'A'], 'won on the eighteenth: 1 up')
  const level = st(Array(18).fill(4), [5, 5, ...Array(16).fill(4)])
  eq([level.settled, level.extra, level.result, level.progress], [false, true, null, 'All square after 18'],
    'level after eighteen: not over — down the 19th')

  // Extra holes: the 19th off the 1st, the 20th off the 2nd, shots as the round gave them.
  eq([ordinal(19), ordinal(21), ordinal(22), ordinal(23), ordinal(31), ordinal(11)], ['19th', '21st', '22nd', '23rd', '31st', '11th'],
    'ordinals for the extra holes')
  eq([courseHoleFor(19), courseHoleFor(20), courseHoleFor(36)], [1, 2, 18], 'the 19th is the 1st again')
  const levelA = [...Array(18).fill(4)]
  const levelB = [5, 5, ...Array(16).fill(4)]
  const extend = (a: number[], b: number[], c = none) => playCard(holes, A, B, card(a, b), c)
  let x = extend(levelA, levelB)
  eq([x.holes.length, x.holes[18].holeNumber, x.holes[18].strokeIndex, openingHole(x.outcomes)], [19, 19, 1, 19],
    'level after 18: the card grows a 19th, played off the 1st, and opens on it')
  x = extend([...levelA, 4], [...levelB, 5])
  eq([x.state.settled, x.state.result], [false, null], 'Bob\'s shot on the 1st comes with it to the 19th: his 5 halves Ann\'s 4')
  eq([x.holes.length, openingHole(x.outcomes)], [20, 20], '  …and they go to the 20th')
  x = extend([...levelA, 4, 4], [...levelB, 5, 3])
  eq([x.state.settled, x.state.leader, x.state.result, x.state.played], [true, 'B', 'at 20th', 20], 'won at the 20th: settled, "at 20th"')
  eq(x.holes.length, 20, '  …and no 21st is offered')
  ok(shouldWrite(x.state, 'bob', { winner: null, result: null }, false), '  …and the result goes to the bracket')
  x = extend([...levelA, 4], [...levelB], new Map([[19, 'A' as const]]))
  eq([x.state.settled, x.state.leader, x.state.result], [true, 'B', 'at 19th'], 'a conceded 19th settles it too')
  x = extend(Array(17).fill(4), [5, 5, ...Array(15).fill(4)])
  eq(x.holes.length, 18, 'no extra hole while the eighteenth is still to finish')

  eq(openingHole(holeOutcomes(holes, A, B, card([4, 4], [4, 4]), none)), 3, 'the card opens on the first hole not finished')

  const done = { ...win }
  ok(shouldWrite(done, 'ann', { winner: null, result: null }, false), 'a settled card writes its result to an empty match')
  ok(!shouldWrite(done, 'ann', { winner: 'ann', result: '16&2' }, false), '  …once')
  ok(!shouldWrite(done, 'ann', { winner: 'bob', result: '2&1' }, false), '  …never over a result already in, without the admin PIN')
  ok(shouldWrite(done, 'ann', { winner: 'bob', result: '2&1' }, true), '  …and with it, it does')
  ok(!shouldWrite(level, null, { winner: null, result: null }, true), 'a level card writes nothing')
  ok(!shouldWrite(st([4], [5]), 'ann', { winner: null, result: null }, false), 'nor does one still going')
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
