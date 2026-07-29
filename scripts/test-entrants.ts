/**
 * Matchplay entrant tests. Run with: npm run test:entrants
 *
 * A draw is between players or between pairings, and everything downstream
 * only ever sees "the entrant on side A". Two things have to hold:
 *
 *   · a pairing shows its two players, never its team name — "Team B" on a
 *     bracket tile tells nobody who is playing
 *   · a pairs row lives in the team columns and a singles row in the player
 *     columns, and a round trip through the database never swaps them
 *
 * The second one is why the mapping is a pure function rather than inline
 * query code: getting it backwards would silently record the wrong winner.
 */

import {
  firstName, joinNames, playerEntrant, pairEntrant, entrantsById,
} from '../lib/matchplayEntrants'

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

/** Same keys, same values — key order is a JSON artefact, not a difference. */
function eqSame(got: object, want: object, label: string) {
  const canon = (o: object) =>
    JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))))
  const g = canon(got), w = canon(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}

// ─── Names ─────────────────────────────────────────────────────

section('First names')
{
  eq(firstName('Ross Grady'), 'Ross', 'a full name gives its first part')
  eq(firstName('Ross'), 'Ross', 'a single name is already short')
  eq(firstName('  Ross  Grady  '), 'Ross', 'stray whitespace does not become the name')
  eq(firstName('Mary Jane Watson'), 'Mary', 'three names still give the first')
  eq(firstName(''), '', 'an empty name stays empty rather than throwing')
}

section('Names side by side')
{
  eq(joinNames([]), '', 'nobody reads as nothing')
  eq(joinNames(['Ross']), 'Ross', 'one name stands alone, with no stray ampersand')
  eq(joinNames(['Ross', 'Dave']), 'Ross & Dave', 'two names are joined by an ampersand')

  // Three would mean an over-filled pairing. Listing them all is a more
  // honest failure than quietly dropping one off the tile.
  eq(joinNames(['Ross', 'Dave', 'Sam']), 'Ross, Dave & Sam',
    'more than two are all listed rather than truncated')
}

// ─── Player entrants ───────────────────────────────────────────

section('A player stands for themselves')
{
  const e = playerEntrant({ id: 'p1', name: 'Ross Grady', handicap: 12 })
  eq(e.id, 'p1', 'the entrant is the player')
  eq(e.name, 'Ross Grady', 'the full name is kept')
  eq(e.shortName, 'Ross', 'and the tile gets the first name')
  eq(e.memberNames, ['Ross Grady'], 'with themselves as the only member')
  eq(e.handicap, 12, 'and their own handicap')

  eq(playerEntrant({ id: 'p2', name: 'Sam Lee' }).handicap, null,
    'a player with no handicap has none, rather than zero')
}

// ─── Pair entrants ─────────────────────────────────────────────

section('A pairing stands for its players')
{
  const pair = pairEntrant(
    { id: 't1', name: 'Team A' },
    [
      { id: 'p1', name: 'Ross Grady', handicap: 12 },
      { id: 'p2', name: 'Dave Smith', handicap: 8 },
    ],
  )

  eq(pair.id, 't1', 'the entrant is the team — that is what the bracket stores')
  // The headline rule: the tile shows who is playing, not what they are called
  eq(pair.shortName, 'Dave & Ross', 'the tile shows both first names, side by side')
  eq(pair.name, 'Dave Smith & Ross Grady', 'and both full names where there is room')
  ok(!pair.name.includes('Team A'), 'the team name is not used')
  ok(!pair.shortName.includes('Team A'), 'on either')

  // Lowest handicap first, so a pairing reads the same every time rather
  // than flipping with whatever order the query returned
  eq(pair.memberNames, ['Dave Smith', 'Ross Grady'], 'members are ordered by handicap')
  const flipped = pairEntrant({ id: 't1', name: 'Team A' }, [
    { id: 'p2', name: 'Dave Smith', handicap: 8 },
    { id: 'p1', name: 'Ross Grady', handicap: 12 },
  ])
  eq(flipped.shortName, pair.shortName, 'and the order they arrive in makes no difference')

  eq(pair.handicap, 20, 'the pairing plays off the combined handicap')
}

section('Awkward pairings')
{
  // Mid-setup a pairing can legitimately be short of a player
  const one = pairEntrant({ id: 't1', name: 'Team A' },
    [{ id: 'p1', name: 'Ross Grady', handicap: 12 }])
  eq(one.shortName, 'Ross', 'a pairing of one shows the one player')
  ok(!one.shortName.includes('&'), 'with nothing joined to them')
  eq(one.handicap, 12, 'and their handicap alone')

  // An empty pairing has nothing else to show, and a blank tile is worse
  const none = pairEntrant({ id: 't1', name: 'Team A' }, [])
  eq(none.name, 'Team A', 'an empty pairing falls back to the team name')
  eq(none.shortName, 'Team A', 'rather than rendering as a gap')
  eq(none.memberNames, [], 'with no members')
  eq(none.handicap, null, 'and no handicap')

  // A missing handicap must not read as scratch, and must not poison the sum
  const partial = pairEntrant({ id: 't1', name: 'Team A' }, [
    { id: 'p1', name: 'Ross Grady', handicap: 12 },
    { id: 'p2', name: 'Dave Smith', handicap: null },
  ])
  eq(partial.handicap, 12, 'a member with no handicap adds nothing to the total')
  eq(partial.memberNames, ['Ross Grady', 'Dave Smith'],
    'and sorts last, since an unknown handicap is not a low one')

  const neither = pairEntrant({ id: 't1', name: 'Team A' }, [
    { id: 'p1', name: 'Ross Grady' },
    { id: 'p2', name: 'Dave Smith' },
  ])
  eq(neither.handicap, null, 'nobody with a handicap means the pairing has none, not zero')
  eq(neither.shortName, 'Dave & Ross', 'and they still sort predictably, by name')
}

section('Looking an entrant up')
{
  const list = [
    playerEntrant({ id: 'p1', name: 'Ross Grady', handicap: 12 }),
    playerEntrant({ id: 'p2', name: 'Dave Smith', handicap: 8 }),
  ]
  const byId = entrantsById(list)
  eq(byId.get('p1')?.shortName, 'Ross', 'an entrant is found by the id the bracket stores')
  eq(byId.get('nobody'), undefined, 'and an unknown id finds nothing rather than throwing')
  eq(byId.size, 2, 'with one entry per entrant')
}

// ─── Column mapping ────────────────────────────────────────────
//
// A pairs row keeps its sides in the team columns and a singles row in the
// player columns. The real functions are exercised here rather than a
// restatement of the rule: getting the direction wrong would record a result
// against the wrong entrant, which is the worst thing this feature could do.

import { toStored, toRow, type MatchRow } from '../lib/matchplayStore'
import type { StoredMatch } from '../lib/matchplayStore'

const baseRow: MatchRow = {
  id: 'm1', trip_id: 'trip', round_number: 1, round_name: 'Final', slot: 0,
  player_a_id: null, player_b_id: null,
  player_a_is_bye: false, player_b_is_bye: false,
  seed_a: 1, seed_b: 2,
  winner_player_id: null, result: null,
  next_match_id: null, next_slot: null,
  entrant_type: null, team_a_id: null, team_b_id: null, winner_team_id: null,
}

section('A singles row is read from the player columns')
{
  const m = toStored({
    ...baseRow,
    entrant_type: 'player',
    player_a_id: 'p1', player_b_id: 'p2', winner_player_id: 'p1', result: '3&2',
  })
  eq(m.entrant_type, 'player', 'it is a singles match')
  eq(m.player_a_id, 'p1', 'side A is the player on side A')
  eq(m.player_b_id, 'p2', 'and side B is the player on side B')
  eq(m.winner_player_id, 'p1', 'with the player who won it')
  eq(m.result, '3&2', 'and the margin')
  ok(!('team_a_id' in m), 'the team columns are not carried through')
}

section('A pairs row is read from the team columns')
{
  const m = toStored({
    ...baseRow,
    entrant_type: 'pair',
    team_a_id: 't1', team_b_id: 't2', winner_team_id: 't2', result: '2 up',
  })
  eq(m.entrant_type, 'pair', 'it is a pairs match')
  eq(m.player_a_id, 't1', 'side A is the pairing on side A')
  eq(m.player_b_id, 't2', 'and side B is the pairing on side B')
  eq(m.winner_player_id, 't2', 'with the pairing that won it')
  eq(m.result, '2 up', 'and the margin')

  // The whole point: the player columns are empty on this row, so reading
  // them would produce a bracket of blanks
  ok(baseRow.player_a_id === null, 'the player columns really are empty')
}

section('A row from before pairs existed reads as singles')
{
  const m = toStored({
    ...baseRow,
    player_a_id: 'p1', player_b_id: 'p2', winner_player_id: 'p2',
  })
  eq(m.entrant_type, 'player', 'a missing entrant type means singles')
  eq(m.player_a_id, 'p1', 'and its sides come from the player columns')
  eq(m.winner_player_id, 'p2', 'along with its winner')
}

const storedSingles: StoredMatch = {
  id: 'm1', trip_id: 'trip', round_number: 1, round_name: 'Final', slot: 0,
  player_a_id: 'p1', player_b_id: 'p2',
  player_a_is_bye: false, player_b_is_bye: false,
  seed_a: 1, seed_b: 2,
  winner_player_id: 'p1', result: '3&2',
  next_match_id: null, next_slot: null,
  entrant_type: 'player',
}

section('Writing puts each side back where it came from')
{
  const singles = toRow(storedSingles)
  eq(singles.player_a_id, 'p1', 'a singles match writes its players')
  eq(singles.winner_player_id, 'p1', 'and its player winner')
  // Written as NULL rather than omitted: an update has to clear the other set,
  // and the database refuses a row that fills both.
  eq(singles.team_a_id, null, 'and explicitly clears the team columns')
  eq(singles.team_b_id, null, 'both of them')
  eq(singles.winner_team_id, null, 'and the team winner')
  eq(singles.entrant_type, 'player', 'recording what kind of row it is')

  const pairs = toRow({ ...storedSingles, entrant_type: 'pair',
    player_a_id: 't1', player_b_id: 't2', winner_player_id: 't1' })
  eq(pairs.team_a_id, 't1', 'a pairs match writes its pairings to the team columns')
  eq(pairs.team_b_id, 't2', 'both sides')
  eq(pairs.winner_team_id, 't1', 'and its pairing winner')
  eq(pairs.player_a_id, null, 'and explicitly clears the player columns')
  eq(pairs.player_b_id, null, 'both of them')
  eq(pairs.winner_player_id, null, 'and the player winner')
  eq(pairs.entrant_type, 'pair', 'recording what kind of row it is')
}

section('A round trip changes nothing')
{
  for (const kind of ['player', 'pair'] as const) {
    const before: StoredMatch = { ...storedSingles, entrant_type: kind }
    const after = toStored(toRow(before) as unknown as MatchRow)
    eqSame(after, before, `a ${kind} match survives a write and a read unchanged`)
  }

  // A bye: settled at generation, so it has a winner but no margin
  const bye: StoredMatch = {
    ...storedSingles, entrant_type: 'pair',
    player_a_id: 't1', player_b_id: null, player_b_is_bye: true,
    winner_player_id: 't1', result: null,
  }
  eqSame(toStored(toRow(bye) as unknown as MatchRow), bye, 'so does a pairs bye')

  // An undecided later round: both sides empty on purpose
  const empty: StoredMatch = {
    ...storedSingles, entrant_type: 'pair',
    player_a_id: null, player_b_id: null, winner_player_id: null,
    result: null, seed_a: null, seed_b: null,
  }
  eqSame(toStored(toRow(empty) as unknown as MatchRow), empty,
    'and an undecided pairs match stays undecided')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
