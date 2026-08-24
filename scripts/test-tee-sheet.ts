/**
 * Tee sheet tests. Run with: npm run test:tee-sheet
 *
 * Two halves. The rules in lib/teeSheet.ts are checked directly — the
 * bounds, the slot clock, how long a sheet is, how a slot groups its
 * teams, and that the interval's default is the same ten minutes the golf
 * span has always assumed. Then the wiring: the tab stands at the right
 * for events only, the sheet reads and writes scoped to its trip, the
 * organiser's tuning lives with the start-format choice, and the team
 * boards' tee-teams question is asked exactly where an event is asking.
 */

import fs from 'fs'
import {
  DEFAULT_TEE_INTERVAL_MINS, MIN_TEE_INTERVAL_MINS, MAX_TEE_INTERVAL_MINS,
  DEFAULT_GROUP_SIZE, MIN_GROUP_SIZE, MAX_GROUP_SIZE, MAX_SLOTS,
  parseInterval, parseGroupSize, slotClock, slotCount, groupSlot, bySlot,
  sheetStart, pickerUnits, unitMatches,
} from '../lib/teeSheet'
import { TEE_INTERVAL_MINS } from '../lib/itinerary'
import { parseLeaderboards, offersTeeTeams } from '../lib/leaderboards'

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

// ─── Settings and their bounds ─────────────────────────────────

section('The interval and the group size know their bounds')
{
  eq(DEFAULT_TEE_INTERVAL_MINS, TEE_INTERVAL_MINS,
    'the default interval IS the golf-span\'s ten minutes — one copy')
  eq(parseInterval(null), 10, 'absent reads as the default')
  eq(parseInterval(12), 12, 'a stored value is honoured')
  eq(parseInterval('8'), 8, 'even as a string')
  eq(parseInterval(3), MIN_TEE_INTERVAL_MINS, 'below the floor clamps up')
  eq(parseInterval(45), MAX_TEE_INTERVAL_MINS, 'above the ceiling clamps down')
  eq(parseInterval('soon'), 10, 'junk is the default, never a crash')

  eq(DEFAULT_GROUP_SIZE, 4, 'a fourball is the default group')
  eq(parseGroupSize(null), 4, 'absent reads as the default')
  eq(parseGroupSize(2), 2, 'twos are real')
  eq(parseGroupSize(1), MIN_GROUP_SIZE, 'a group of one is not a group')
  eq(parseGroupSize(5), MAX_GROUP_SIZE, 'a five-ball is not on this sheet')
}

// ─── The clock ─────────────────────────────────────────────────

section('Slot times run from the round\'s start, one interval apart')
{
  eq(slotClock('09:30', 0, 10), '9:30 am', 'the first group is the start itself')
  eq(slotClock('09:30', 3, 10), '10:00 am', 'the fourth is three intervals on')
  eq(slotClock('09:30', 3, 12), '10:06 am', 'and the interval is the round\'s own')
  eq(slotClock('23:50', 2, 10), '12:10 am', 'past midnight wraps rather than breaking')
  eq(slotClock(null, 0, 10), null, 'no start time, no invented clock')
  eq(slotClock('soon', 0, 10), null, 'junk is null, never a guess')
}

section('The sheet is long enough for the field and never loses a name')
{
  eq(slotCount(12, 4, -1), 4, 'twelve players in fours is three groups, plus a spare')
  eq(slotCount(13, 4, -1), 5, 'the thirteenth opens a fourth group')
  eq(slotCount(4, 4, 6), 8, 'an assignment out at slot six keeps the sheet that long')
  eq(slotCount(0, 4, -1), 2, 'an empty roster still shows a slot and a spare')
  eq(slotCount(500, 2, -1), MAX_SLOTS, 'and the backstop holds')
}

// ─── Grouping a slot ───────────────────────────────────────────

section('Teammates gather into one block; singles stand together at the end')
{
  const teamOf = new Map([
    ['a', { teamId: 't1', teamName: 'The Lads' }],
    ['b', { teamId: 't1', teamName: 'The Lads' }],
    ['d', { teamId: 't2', teamName: 'The Others' }],
  ])
  const groups = groupSlot(
    [{ id: 'c', name: 'Cara' }, { id: 'a', name: 'Aoife' }, { id: 'b', name: 'Brid' }],
    teamOf,
  )
  eq(groups.length, 2, 'a pair and a single make two blocks')
  eq(groups[0].teamName, 'The Lads', 'the team block leads, in arrival order')
  eq(groups[0].players.map(p => p.name), ['Aoife', 'Brid'], 'teammates in one block')
  eq(groups[1].teamId, null, 'the singles block carries no team')
  eq(groups[1].players.map(p => p.name), ['Cara'], 'and stands last')

  eq(groupSlot([], teamOf), [], 'an empty slot is no blocks at all')
}

section('Assignments parse defensively')
{
  const map = bySlot([
    { player_id: 'a', slot_index: 0 },
    { player_id: 'b', slot_index: 0 },
    { player_id: 'a', slot_index: 3 },        // the same player twice
    { player_id: 'c', slot_index: -1 },       // not a slot
    { player_id: 'd', slot_index: 2.5 },      // nor that
    { player_id: null, slot_index: 1 },       // nobody
    'junk',
  ])
  eq(map.get(0), ['a', 'b'], 'real rows land, in order')
  eq(map.get(3), undefined, 'a player appears once — the first row wins')
  eq(map.get(2), undefined, 'junk slots are dropped')
  eq(bySlot(null).size, 0, 'the un-migrated table is an empty sheet')

  eq(sheetStart({ teeTime: '09:30' }), '09:30', 'the start is the round\'s own clock')
  eq(sheetStart(null), null, 'no item, no start')
}

// ─── The picker's stuck-together units ─────────────────────────

section('On a share-a-tee board, a linked team is one card')
{
  const teamOf = new Map([
    ['a', { teamId: 't1', teamName: 'The Lads' }],
    ['b', { teamId: 't1', teamName: 'The Lads' }],
    ['d', { teamId: 't2', teamName: 'Late Show' }],
  ])
  const field = [
    { id: 'a', name: 'Aoife K' }, { id: 'b', name: 'Brid M' },
    { id: 'c', name: 'Cara D' }, { id: 'd', name: 'Dara O' },
  ]

  const together = pickerUnits(field, teamOf, true)
  eq(together.map(u => u.kind), ['team', 'team', 'solo'],
    'teamed players collapse into units; the solo stands alone')
  const lads = together[0]
  ok(lads.kind === 'team' && lads.players.map(p => p.id).join() === 'a,b',
    'the pair is one unit carrying both')
  ok(together[1].kind === 'team' && (together[1] as { players: unknown[] }).players.length === 1,
    'a team with one member left is still a unit — the link stays visible')

  const separate = pickerUnits(field, teamOf, false)
  eq(separate.map(u => u.kind), ['solo', 'solo', 'solo', 'solo'],
    'members-may-play-apart offers everyone individually')

  ok(unitMatches(lads, 'brid'), 'a unit matches any member\'s name')
  ok(unitMatches(lads, 'lads'), 'or the team\'s')
  ok(!unitMatches(lads, 'cara'), 'and not somebody else\'s')
  ok(unitMatches(lads, '  '), 'a blank filter matches everything')
}

// ─── The tee-teams answer on a board ───────────────────────────

section('A team board can say how it meets the sheet')
{
  const stored = [{
    id: 'lb-1', audience: 'team', competition: 'league',
    scoring: 'stableford', teamFormat: 'better_ball', combine: 'total',
    teeTeams: 'separate',
  }]
  const boards = parseLeaderboards(stored)
  eq(boards[0].teeTeams, 'separate', 'separate is stored and read back')

  const together = parseLeaderboards([{ ...stored[0], teeTeams: undefined }])
  ok(!('teeTeams' in together[0]),
    'absent means together — partners almost always play together')
  const junk = parseLeaderboards([{ ...stored[0], teeTeams: 'maybe' }])
  ok(!('teeTeams' in junk[0]), 'junk is dropped, not guessed at')

  const solo = parseLeaderboards([{
    id: 'lb-2', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total', teeTeams: 'separate',
  }])
  ok(!('teeTeams' in solo[0]), 'an individual board never carries the answer')

  ok(offersTeeTeams({ audience: 'team', competition: 'league' }), 'team league is asked')
  ok(offersTeeTeams({ audience: 'team', competition: 'matchplay' }), 'so is a pairs draw')
  ok(!offersTeeTeams({ audience: 'individual', competition: 'league' }),
    'an individual board is not')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The tab stands at the right, for events only')
{
  const bar = read('app/components/TabBar.tsx')
  ok(/teesheet[\s\S]{0,120}Tee Sheet/.test(bar), 'the tab exists')
  ok(bar.includes("i.key !== 'teesheet'"), 'a trip filters it out')
  ok(bar.includes("i.key !== 'settings'"), 'an event trades Trip Setup for it')
  const items = bar.slice(bar.indexOf('const ITEMS'), bar.indexOf('] as const'))
  ok(items.lastIndexOf('teesheet') > items.lastIndexOf('settings'),
    'and it is the rightmost item — where the brief put it')
}

section('The sheet reads fail-soft and writes scoped')
{
  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes('fetchTripKind'), 'the kind rides alongside, cached')
  ok(page.includes('isEvent(kind)'), 'and gates the page to events')
  const mainRounds = page.match(/select\('id, round_number[^']*'\)/)?.[0] ?? ''
  ok(!mainRounds.includes('tee_interval'),
    'the main rounds select never names a migration-050 column')
  ok(page.includes("select('id, tee_interval_mins, tee_group_size')"),
    'the settings ride in their own fail-soft query')
  ok(page.includes("'edit_tee_sheet'"), 'the field\'s right is the permission')

  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('hasUnlocked(tripCode)'),
    'the organiser\'s right is the PIN unlock this device already holds')
  ok(client.includes('useEffect(() => { setUnlocked(hasUnlocked(tripCode)) }'),
    '  …read after mount, because sessionStorage would tear hydration')
  // One batch insert — a single INSERT statement — so a race with another
  // phone books all of a linked team or none of it, never half.
  ok(/insert\(next\.map\(a => \(\{ trip_id: tripId, \.\.\.a \}\)\)\)/.test(client),
    'adds are one batch carrying the trip id')
  ok(/delete\(\)[\s\S]{0,80}\.eq\('trip_id', tripId\)/.test(client),
    'removes are scoped to the trip')
  ok(client.includes('groupSlot(') && client.includes('slotClock('),
    'the maths comes from lib/teeSheet.ts, never re-derived')
  ok(client.includes('Pick teams'), 'a team board offers the way to its pairings')
  ok(fs.existsSync('app/trip/[tripCode]/teesheet/loading.tsx'),
    'the tab answers instantly — the loading.tsx rule')

  // The linked team through the picker and out again — stuck together
  // cuts both ways.
  ok(client.includes('pickerUnits('), 'the picker offers units from the one copy')
  ok(client.includes('unitMatches(u, search)'), 'filtered by member or team name')
  ok(client.includes("u.players.length <= vacancy"),
    'a team only fits where the whole team fits')
  ok(client.includes('removePlayers(g.players.map(p => p.id))'),
    'and leaves as one block on a share-a-tee board')
}

section('The organiser is never locked out of their own sheet')
{
  // The reported bug: the creator's device had never passed a PasscodeGate,
  // so the sheet was read-only with nothing saying why. Two doors now: the
  // unlock is remembered the moment the PIN is set, and offered inline on
  // the sheet for any other device.
  for (const f of [
    'app/dashboard/create/CreateLeagueForm.tsx',
    'app/dashboard/create/CreateKnockoutForm.tsx',
    'app/dashboard/create/CreateTripForm.tsx',
  ]) {
    ok(read(f).includes('rememberUnlock('),
      `${f.split('/').pop()} remembers the unlock at creation`)
  }
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('<InlineUnlock'), 'the sheet offers the PIN inline')
  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes('settings_passcode_hash'), 'with the hash the page already has')
}

section('The organiser tunes the sheet where the start is chosen')
{
  const client = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(client.includes('saveTeeSetting'), 'interval and group size save as they move')
  ok(/update\(\{[\s\S]{0,200}tee_interval_mins[\s\S]{0,200}\.eq\('trip_id', tripId\)/.test(client),
    '  …scoped to the trip')
  ok(client.includes('Minutes between groups'), 'the interval is asked in words')
  ok(client.includes('Players per group'), 'so is the group size')
  ok(!client.includes('coming soon'), 'the tee sheet is no longer a promise')
}

section('The tee-teams question is asked exactly where an event is asking')
{
  const setup = read('app/components/LeaderboardSetup.tsx')
  ok(setup.includes('askTeeTeams && offersTeeTeams(draft)'),
    'the question needs both the event context and a team board')
  ok(read('app/dashboard/create/CreateLeagueForm.tsx').includes('askTeeTeams'),
    'the league wizard asks')
  ok(read('app/dashboard/create/CreateTripForm.tsx').includes('askTeeTeams={isTournament}'),
    'the trip wizard asks only through the tournament door')
  ok(read('app/trip/[tripCode]/setup/page.tsx').includes('askTeeTeams={isEvent(trip.kind)}'),
    'and settings asks only for an event')
}

section('Migration 050 is the columns and the table the model promised')
{
  const sql = read('supabase/migrations/20260101000050_tee_sheet.sql')
  ok(/ADD COLUMN IF NOT EXISTS tee_interval_mins/.test(sql), 'the interval column')
  ok(/ADD COLUMN IF NOT EXISTS tee_group_size/.test(sql), 'the group-size column')
  ok(/BETWEEN 2 AND 4/.test(sql), 'the database backstops the group bounds')
  ok(/CREATE TABLE IF NOT EXISTS tee_assignments/.test(sql), 'and the assignments table')
  ok(/UNIQUE \(round_id, player_id\)/.test(sql),
    'one slot per player per round, however the taps race')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
