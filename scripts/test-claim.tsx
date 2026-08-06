/**
 * The claim flow and device linking. Run with: npm run test:claim
 *
 * What is pinned here is the handful of rules that decide whose phone shows
 * whose name, and they are the rules that were got wrong before:
 *
 *   · confirmed is `claimed === true`, and NULL is not confirmed
 *   · the join list offers everybody, unconfirmed first
 *   · two people on one trip cannot share a name, however it is capitalised
 *   · a stale or copied cookie recognises nobody
 *   · the two states look different, and the legend agrees with the rows
 */

import fs from 'fs'
import {
  isConfirmed, confirmedCount, sortForClaiming,
  nameKey, sameName, duplicateName, firstDuplicateIndex, duplicateNameError,
} from '../lib/roster'
import { playerFromRoster } from '../lib/currentPlayer'
import { handicapRows } from '../lib/roundHandicaps'
import { ROUND_TILE } from '../lib/roundState'

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

/** Source with comments removed, for assertions about behaviour not prose. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const UUID_B = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'

// ─── Confirmed ─────────────────────────────────────────────

section('Confirmed is claimed === true, and nothing else')
{
  ok(isConfirmed({ claimed: true }), 'a claimed slot is confirmed')
  ok(!isConfirmed({ claimed: false }), 'an unclaimed one is not')

  // The column is nullable — every row written before migration 006 has
  // NULL there. A NULL player is pending, not confirmed, and not an error.
  ok(!isConfirmed({ claimed: null }), 'and neither is a NULL from before the column existed')
  ok(!isConfirmed({}), 'nor a row that does not carry the field at all')

  eq(confirmedCount([
    { claimed: true }, { claimed: null }, { claimed: false }, { claimed: true },
  ]), 2, 'the count is of the true ones only')
}

// ─── The join list ─────────────────────────────────────────

section('The join list offers everybody, unconfirmed first')
{
  const roster = [
    { id: '1', name: 'Ross',  claimed: true },
    { id: '2', name: 'Alan',  claimed: true },
    { id: '3', name: 'Zoe',   claimed: false },
    { id: '4', name: 'Brian', claimed: null },
  ]
  const sorted = sortForClaiming(roster)

  // The unconfirmed are what the screen is for; the confirmed stay on it
  // because that list is also how a second device gets linked.
  eq(sorted.map(p => p.name), ['Brian', 'Zoe', 'Alan', 'Ross'],
    'still to confirm first, alphabetical within each group')
  eq(sorted.length, roster.length, 'and nobody is dropped')

  // The bug this whole phase exists to fix: a confirmed player used to
  // vanish, leaving a second device with nothing to do but make a duplicate.
  ok(sorted.some(p => isConfirmed(p)), 'a confirmed player is still offered')

  eq(roster.map(p => p.name), ['Ross', 'Alan', 'Zoe', 'Brian'],
    'and the caller\'s array is left alone')
}

section('The lead player is on the list too')
{
  // They were excluded outright, so the organiser could never link a second
  // device to their own trip. The query asks for the whole roster now.
  const page = read('app/trip/[tripCode]/players/page.tsx')
  ok(!page.includes("eq('is_lead', false)"), 'the join query no longer excludes the lead')
  ok(!page.includes("claimed.is.null,claimed.eq.false"),
    '  …and no longer excludes confirmed players')
  ok(page.includes("from('rounds')"),
    'and it fetches the rounds a late joiner needs handicaps for')
}

// ─── Names ─────────────────────────────────────────────────

section('Two people on one trip cannot share a name')
{
  eq(nameKey('  John Smith  '), 'john smith', 'compared trimmed and case-folded')
  ok(sameName('john smith', 'John Smith '), 'so capitals and stray spaces are the same person')
  ok(!sameName('John Smith', 'John Smyth'), 'a different name is a different person')
  ok(!sameName('', ''), 'and a blank is nobody, not everybody')

  const roster = [
    { id: UUID_A, name: 'John Smith' },
    { id: UUID_B, name: 'Ross Pogrady' },
  ]
  eq(duplicateName('  JOHN SMITH ', roster)?.id, UUID_A, 'a clash is found however it is typed')
  eq(duplicateName('Brian Ryan', roster), null, 'a free name is free')

  // Renaming somebody to the name they already have is not a clash with
  // themselves — without the exception, saving an untouched field fails.
  eq(duplicateName('John Smith', roster, UUID_A), null, 'a player is not their own duplicate')
  eq(duplicateName('John Smith', roster, UUID_B)?.id, UUID_A,
    '  …but taking someone else\'s name still is')

  eq(firstDuplicateIndex(['Ross', 'Alan', 'ross ']), 2, 'the creation form points at the second one')
  eq(firstDuplicateIndex(['Ross', '', '', 'Alan']), -1, 'blank rows are not names')

  ok(duplicateNameError('  Ross  ').includes('Ross'), 'and the message says which name')
}

section('Every name path checks it')
{
  // Three ways to create a player and one to rename one. All four go
  // through the same rule, from the same file.
  for (const f of [
    'app/dashboard/create/CreateTripForm.tsx',
    'app/trip/[tripCode]/players/PlayersClient.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
  ]) {
    ok(read(f).includes("from '@/lib/roster'"), `${f.split('/').pop()} reads the shared name rule`)
  }
  const setup = read('app/trip/[tripCode]/setup/TripSetupClient.tsx')
  eq((setup.match(/duplicateName\(/g) ?? []).length, 3,
    'settings checks on add, on rename, and once more as a backstop')
}

// ─── Recognition ───────────────────────────────────────────

section('A cookie recognises somebody on this trip, or nobody')
{
  const roster = [{ id: UUID_A, name: 'Ross' }]
  eq(playerFromRoster(UUID_A, roster)?.name, 'Ross', 'a good id finds its player')
  eq(playerFromRoster(UUID_B, roster), null, 'an id from another trip finds nobody')
  eq(playerFromRoster(null, roster), null, 'and so does no cookie at all')
  eq(playerFromRoster(UUID_A, []), null, 'a player since removed finds nobody, not an error')
}

section('Linking a device changes nothing about who is confirmed')
{
  const client = code('app/trip/[tripCode]/players/PlayersClient.tsx')

  // Tapping a confirmed name is how a second handset gets linked. It writes
  // a cookie and NOTHING else — claimed is already true and stays true.
  const link = client.slice(client.indexOf('function handleLink'), client.indexOf('function handleTap'))
  ok(link.includes('rememberPlayer') || link.includes('linkDevice'), 'it remembers them on this device')
  ok(!link.includes('supabase'), '  …and touches the database not at all')

  // "Not you?" reassigns a handset. The player it forgets stays confirmed.
  const welcome = code('app/trip/[tripCode]/WelcomeBack.tsx')
  ok(welcome.includes('forgetPlayer'), 'Not you? forgets this device')
  ok(!welcome.includes('claimed'), '  …without un-confirming anybody')
  ok(welcome.includes('/players'), '  …and lands on the list, where they can pick a name')
}

// ─── The two states look different ─────────────────────────

section('Confirmed and pending are visibly different')
{
  // They were identical: same dot, same border, same label colour, with the
  // ternaries still in place claiming otherwise. Both screens now carry the
  // round tile's own borders — finalised reads as finalised.
  ok(ROUND_TILE.played !== ROUND_TILE.empty, 'the two treatments are not the same string')

  for (const f of [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/players/PlayersClient.tsx',
  ]) {
    const src = read(f)
    ok(src.includes("from '@/lib/roundState'"), `${f.split('/').pop()} reads the shared treatment`)
    ok(src.includes('ROUND_TILE.played') && src.includes('ROUND_TILE.empty'),
      '  …and uses the played and empty states')
    // The live state carries the app's one pinned glow. It has no business
    // on a player, and importing the whole object is how it would arrive.
    ok(!src.includes('ROUND_TILE.live'), '  …and never the glowing one')
    ok(!src.includes('shadow-[0_0_'), '  …and adds no glow of its own')
  }

  // The hub's legend draws the same two things the rows draw.
  const hub = read('app/trip/[tripCode]/page.tsx')
  eq((hub.match(/ROUND_TILE\.played/g) ?? []).length, 2, 'the hub draws confirmed twice: legend and row')
  eq((hub.match(/ROUND_TILE\.empty/g) ?? []).length, 2, 'and pending twice, the same way')
}

// ─── Late joiners ──────────────────────────────────────────

section('A player who joins late gets their round handicaps')
{
  const rows = handicapRows(['r1', 'r2'], 'p1', 11.6)
  eq(rows.length, 2, 'one row per round')
  eq(rows[0], { round_id: 'r1', player_id: 'p1', playing_handicap: 12 },
    'holding the handicap index, rounded — there is no tee yet')

  // A plus handicap is stored negative and must stay negative here.
  eq(handicapRows(['r1'], 'p1', -1.4)[0].playing_handicap, -1,
    'and a plus handicap stays a plus handicap')

  eq(handicapRows([], 'p1', 12), [], 'a trip with no rounds yet needs no rows')

  // Settings has always written these on a handicap edit; the join screen
  // never did, so a straggler was scored off nothing. One call, both places.
  for (const f of [
    'app/trip/[tripCode]/players/PlayersClient.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
  ]) {
    ok(read(f).includes('syncRoundHandicaps'), `${f.split('/').pop()} writes them through the shared call`)
  }
  ok(!read('app/trip/[tripCode]/setup/TripSetupClient.tsx').includes("from('round_handicaps')"),
    'and settings no longer rolls its own upsert')
}

// ─── Result ────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
