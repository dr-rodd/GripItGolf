/**
 * Tee sheet tests. Run with: npm run test:tee-sheet
 *
 * Two halves. The rules in lib/teeSheet.ts are checked directly — the
 * bounds, the slot clock, how long a sheet is, how a slot groups its
 * teams, and that the interval's default is the same ten minutes the golf
 * span has always assumed. Then the wiring: the tee times are a home
 * screen module on an event, the sheet reads and writes scoped to its trip, the
 * organiser's tuning lives with the start-format choice, and the team
 * boards' tee-teams question is asked exactly where an event is asking.
 */

import fs from 'fs'
import {
  DEFAULT_TEE_INTERVAL_MINS, MIN_TEE_INTERVAL_MINS, MAX_TEE_INTERVAL_MINS,
  DEFAULT_GROUP_SIZE, MIN_GROUP_SIZE, MAX_GROUP_SIZE, MAX_SLOTS,
  parseInterval, parseGroupSize, slotClock, slotCount, groupSlot, bySlot,
  sheetStart, pickerUnits, unitMatches, hubTeeRound, myTee,
  type TeeRules, MAX_BATCHES, clockMins, minsClock, batchLast, countToLast, teeClocks,
  sheetLength, sheetCapacity, seatsShort, rulesIssue, parseTeeRules, describeRules,
  roundSheet, sheetClock, sheetSlots, sheetGroupSize, draftRules,
} from '../lib/teeSheet'
import { TEE_INTERVAL_MINS } from '../lib/itinerary'
import {
  type Leaderboard, parseLeaderboards, offersTeeTeams,
} from '../lib/leaderboards'
import {
  MAIN_SET, type Membership, daySheetId, isDaySheet, roundOfDaySheet,
  sheetForBoard, sheetsInUse, finaliseBlockedReason,
} from '../lib/teamSets'
import { tagGateReason, dayTeamTagIssue } from '../lib/tagBoards'

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

section('A sheet is batches of tee times (Ross, 26 Oct 2026)')
{
  eq([clockMins('08:05'), clockMins('8:05'), clockMins('24:00'), clockMins(null)], [485, null, null, null],
    'a clock is HH:MM, nothing else')
  eq(minsClock(485), '08:05', '  …and back')

  const morning = { start: '08:00', interval: 10, count: 6 }
  const afternoon = { start: '12:00', interval: 8, count: 3 }
  const rules: TeeRules = { batches: [morning, afternoon], groupSize: 4 }
  eq(batchLast(morning), '08:50', 'a batch\'s last tee time is its count of intervals on')
  eq(teeClocks(rules), ['08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '12:00', '12:08', '12:16'],
    'the batches run straight through — slot 6 is the afternoon\'s first')
  eq([sheetLength(rules), sheetCapacity(rules)], [9, 36], 'nine tee times in fours: room for 36')
  eq([seatsShort(rules, 40), seatsShort(rules, 30)], [4, 0], 'a field of 40 leaves four without a time; 30 fit')

  eq(countToLast('08:00', 10, '09:00'), 7, 'a last tee time on the interval is counted')
  eq(countToLast('08:00', 10, '09:05'), 7, '  …one between intervals stops at the one before')
  eq(countToLast('08:00', 10, '07:00'), null, '  …and one before the first is no answer')

  eq(rulesIssue(rules), null, 'a morning and an afternoon wave are a valid sheet')
  ok(/starts before/.test(rulesIssue({ batches: [morning, { ...afternoon, start: '08:30' }], groupSize: 4 }) ?? ''),
    'a batch may not start before the last tee time of the one before')
  ok(/midnight/.test(rulesIssue({ batches: [{ start: '23:00', interval: 10, count: 7 }], groupSize: 4 }) ?? ''),
    'nor run past midnight')
  ok(!!rulesIssue({ batches: [], groupSize: 4 }), 'no batches is no sheet')
  ok(!!rulesIssue({ batches: [morning], groupSize: 5 }), 'a five-ball is not on this sheet')
  ok(!!rulesIssue({ batches: [{ ...morning, interval: 3 }], groupSize: 4 }), 'three minutes apart is too tight')
  ok(!!rulesIssue({ batches: Array.from({ length: MAX_BATCHES + 1 }, (_, i) => ({ start: minsClock(420 + i * 60), interval: 10, count: 1 })), groupSize: 4 }),
    `at most ${MAX_BATCHES} batches`)
  ok(!!rulesIssue({ batches: [{ start: '06:00', interval: 5, count: MAX_SLOTS + 1 }], groupSize: 2 }),
    `at most ${MAX_SLOTS} tee times`)

  eq(parseTeeRules(JSON.parse(JSON.stringify(rules))), rules, 'stored rules read back whole')
  eq(parseTeeRules({ ...rules, groupSize: 9 }), null, 'invalid rules are no rules — the sheet reads vacant, never a guess')
  eq([parseTeeRules(null), parseTeeRules('x'), parseTeeRules({ batches: 'x' })], [null, null, null], 'junk is nothing')

  eq(describeRules(rules), '9 tee times, 8:00 am to 8:50 am and 12:00 pm to 12:16 pm, in fours',
    'the rules in a line')
  eq(describeRules({ batches: [morning], groupSize: 4, teamsPerTee: 2 }), '6 tee times, 8:00 am to 8:50 am, 2 teams a tee time',
    '  …or in teams, where it was asked that way')
}

section('A round\'s sheet is vacant until the wizard has been through')
{
  const rules: TeeRules = { batches: [{ start: '09:00', interval: 10, count: 3 }], groupSize: 3 }
  const base = { rules: null, startTime: '08:30', intervalMins: 12, groupSize: 2, hasAssignments: false }
  eq(roundSheet(base), { state: 'vacant' }, 'no rules and nobody on it: vacant, offering the wizard')
  eq(roundSheet({ ...base, rules }), { state: 'active', rules }, 'rules saved: live')
  eq(roundSheet({ ...base, hasAssignments: true }),
    { state: 'legacy', startTime: '08:30', intervalMins: 12, groupSize: 2 },
    'a sheet made before the wizard, with names on it, keeps working as it was')

  const active = roundSheet({ ...base, rules })
  eq([sheetClock(active, 0), sheetClock(active, 2), sheetClock(active, 3)], ['9:00 am', '9:20 am', null],
    'a live sheet\'s clock is its rules — and a slot past them has none')
  eq([sheetSlots(active, 20, -1), sheetSlots(active, 20, 4)], [3, 5],
    'its length is the rules, never fewer than the last slot somebody stands in')
  eq(sheetGroupSize(active as Exclude<typeof active, { state: 'vacant' }>), 3, 'and its group size is theirs')
  const legacy = roundSheet({ ...base, hasAssignments: true })
  eq([sheetClock(legacy, 1), sheetSlots(legacy, 7, 0)], [slotClock('08:30', 1, 12), slotCount(7, 2, 0)],
    'a legacy sheet reads exactly as it always did, spare slot and all')
  eq([sheetClock({ state: 'vacant' }, 0), sheetSlots({ state: 'vacant' }, 20, 3)], [null, 0], 'a vacant one draws nothing')

  eq(draftRules({ state: 'vacant' }, '07:45', 18),
    { batches: [{ start: '07:45', interval: DEFAULT_TEE_INTERVAL_MINS, count: 5, ends: 'count' }], groupSize: 4 },
    'the wizard opens on the round\'s start, ten minutes apart, long enough for the field in fours')
  eq(draftRules({ state: 'vacant' }, null, 0).batches[0].start, '08:00', '  …eight o\'clock with no start, never nothing')
  eq(draftRules(legacy, '08:30', 7),
    { batches: [{ start: '08:30', interval: 12, count: 4, ends: 'count' }], groupSize: 2 },
    'a legacy sheet opens as it stood')
  eq(draftRules(active, '06:00', 50), rules, 'and a live one as saved')
}

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

section('The home screen speaks for one round, from the reader\'s side')
{
  const r = (roundNumber: number, date: string | null) => ({ roundNumber, date })
  eq(hubTeeRound([r(2, '2026-06-14'), r(1, '2026-06-13')], '2026-06-13')?.roundNumber, 1,
    'today\'s round, in round order whatever order they came in')
  eq(hubTeeRound([r(1, '2026-06-13'), r(2, '2026-06-14')], '2026-06-14')?.roundNumber, 2,
    'yesterday\'s is passed over for today\'s')
  eq(hubTeeRound([r(1, '2026-06-13'), r(2, '2026-06-14')], '2026-06-20')?.roundNumber, 2,
    'after the last round, the last one — not nothing')
  eq(hubTeeRound([r(1, '2026-06-13'), r(2, null)], '2026-06-20')?.roundNumber, 2,
    'an undated round still counts as to come')
  eq(hubTeeRound([], '2026-06-13'), null, 'no tee-sheet round, no round')

  const names: Record<string, string> = { a: 'Ross', b: 'Dave', c: 'John' }
  const nameOf = (id: string) => names[id] ?? null
  const rows = [
    { player_id: 'a', slot_index: 2 }, { player_id: 'b', slot_index: 2 },
    { player_id: 'c', slot_index: 0 },
  ]
  const old = (start: string | null) => ({ state: 'legacy' as const, startTime: start, intervalMins: 10, groupSize: 4 })
  eq(myTee(rows, 'a', old('09:00'), nameOf),
    { slotIndex: 2, clock: slotClock('09:00', 2, 10), partners: ['Dave'] },
    'your slot, its clock off the sheet\'s own, and who else is in it')
  eq(myTee(rows, 'c', old('09:00'), nameOf)?.partners, [], 'alone in a slot is nobody else')
  eq(myTee(rows, 'z', old('09:00'), nameOf), null, 'not on the sheet is null')
  eq(myTee(rows, null, old('09:00'), nameOf), null, 'and so is a phone that is nobody')
  eq(myTee(rows, 'a', old(null), nameOf)?.clock, null,
    'no start time is no clock — never an invented nine o\'clock')
}

section('The tee times are a home screen module, not a tab')
{
  const bar = read('app/components/TabBar.tsx')
  ok(!bar.includes('teesheet') && !bar.includes('Tee Sheet'),
    'the bar no longer carries the tee sheet')

  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes("modules.includes('teeTimes')"),
    'the hub draws the tee times while they are active')
  ok(hub.includes('teeSheetInUse(rounds.map(r => r.start_format))'),
    '  …which is while a round starts from a tee sheet')
  ok(hub.includes('hubTeeRound(') && hub.includes('myTee('),
    'the round and the place come from lib/teeSheet.ts, never re-derived')
  ok(/from\('tee_assignments'\)[\s\S]{0,200}\.eq\('trip_id', trip\.id\)/.test(hub),
    'the assignments are read scoped to the trip')
  const mainRounds = hub.match(/select\(`id, round_number[^`]*`\)/)?.[0] ?? ''
  ok(!mainRounds.includes('tee_interval'),
    'the hub\'s rounds select never names a migration-050 column')

  const panel = read('app/trip/[tripCode]/TeeTimesPanel.tsx')
  ok(panel.includes('href={`/trip/${tripCode}/teesheet`}'),
    'and the module is the way to the whole sheet')
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
  ok(client.includes('removePlayers(i, g.players.map(p => p.id))'),
    'and leaves as one block on a share-a-tee board')
}

section('A write that does not land says so where it was asked for')
{
  // The reported glitch: a name appeared for a moment and went back to the
  // picker. The write was being refused and the reason rendered at the foot
  // of the sheet — a scroll away from the tap on any real field, so the
  // message may as well not have existed.
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(/error\?\.slot === i/.test(client), 'the message renders in the slot it belongs to')
  ok(!/\{error && \(\s*<p className="text-rust-deep text-sm mt-4/.test(client),
    '  …and no longer only at the foot of the list')
  ok(client.includes('console.error(`Tee sheet: could not'),
    'the raw error reaches the console for whoever is diagnosing')
  ok(/database update has not been applied yet/.test(client),
    'a missing table is named, never dressed as "try again"')
  ok(/permission denied\|row-level security/.test(client),
    'so is a refusal from the database')

  // Truth over a guess: a rejected batch changed nothing, but the same
  // rejection arrives when another phone got there first.
  ok(client.includes('async function resyncRound()'),
    'a failed write asks the database what it actually holds')
  ok(/playerIds\.every\(id => landed\.has\(id\)\)/.test(client),
    'a player already on the sheet is not a failure')
  ok(client.includes('if (!(await resyncRound())) setAssignments(prev)'),
    'and a read that fails too falls back to putting the row back')

  // Nowhere to save is knowable before the first tap.
  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes('storageReady={!assignmentsResult.error}'),
    'the page tells the sheet whether it has anywhere to save')
  ok(client.includes('!storageReady && ('), 'and the sheet says so up front')
  ok(client.includes('The sheet cannot save yet'), '  …in words, not a flicker')
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

// ─── The tag gate ──────────────────────────────────────────────

section('An untagged player cannot go on a sheet that is playing for tags')
{
  const ms: Membership[] = [
    { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'ross' },
    { team_id: 'tag-us', team_set: MAIN_SET, player_id: 'john' },
  ]
  const nameOf = (id: string) => ({ ross: 'Ross', john: 'John', mary: 'Mary', sean: 'Sean' } as Record<string, string>)[id]

  eq(tagGateReason(['ross', 'john'], ms, nameOf), null, 'tagged players go on')
  const one = tagGateReason(['mary'], ms, nameOf)
  ok(!!one?.includes('Mary') && one.includes('needs a side'),
    'an untagged one is refused by name')
  ok(!!one?.includes('organiser area'), '  …and told where a tag comes from')
  const two = tagGateReason(['mary', 'sean'], ms, nameOf)
  ok(!!two?.includes('Mary and Sean') && two.includes('need sides'),
    'two are refused together, and the sentence agrees with itself')
  ok(!/Failed|Please/.test(one ?? ''), 'and it is calm, like every other refusal')
}

section('A team card counts towards one tag, so a team is of one')
{
  const ms: Membership[] = [
    { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'ross' },
    { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'dave' },
    { team_id: 'tag-us', team_set: MAIN_SET, player_id: 'john' },
  ]
  eq(dayTeamTagIssue(['ross', 'dave'], ms), null, 'one tag between them is a team')
  ok(!!dayTeamTagIssue(['ross', 'john'], ms)?.includes('all one side'),
    'two tags is not — the card could only count towards one')
  ok(!!dayTeamTagIssue(['ross', 'mary'], ms)?.includes('needs a side'),
    'and an untagged member is refused here too, not left to the gate')
  eq(dayTeamTagIssue([], ms), null, 'an empty team has nothing wrong with it yet')
}

section('The gate refuses an add, and never evicts')
{
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(/if \(playingForTags\) \{[\s\S]{0,200}tagGateReason/.test(client),
    'the check runs inside addPlayers, before the write')
  ok(/tagGateReason[\s\S]{0,200}setError\(\{ slot: slotIndex/.test(client),
    'and the refusal reads in the slot it was refused in')
  ok(client.includes('One player still needs a side')
    || client.includes('still need a side'),
    'with a banner at the top, so the first tap does not discover the rule')
  ok(!/removePlayers[\s\S]{0,300}tagGateReason/.test(client),
    'removing is never gated — a name already on the sheet stays put')
}

// ─── A day's own teams ─────────────────────────────────────────

section('A sheet per round, and it cannot collide with any other')
{
  eq(daySheetId('r1'), 'day:r1', 'named for the round it belongs to')
  ok(isDaySheet(daySheetId('r1')), 'and knows itself')
  ok(!isDaySheet(MAIN_SET) && !isDaySheet('set-2'),
    'the week\'s sheets are not day sheets')
  eq(roundOfDaySheet(daySheetId('abc')), 'abc', 'the round reads back out')
  eq(roundOfDaySheet('set-3'), null, 'and any other sheet has no round')
  // The colon is what makes the namespaces disjoint: nextSheetId only ever
  // returns 'main' or 'set-N'.
  ok(daySheetId('r1').includes(':'), 'namespaced, so nextSheetId can never mint one')
}

section('A board scoped to one day plays that day\'s teams')
{
  const week: Leaderboard = {
    id: 'b-week', audience: 'team', competition: 'league',
    scoring: 'stableford', combine: 'total', teamFormat: 'better_ball',
    teamSet: 'set-2',
  }
  const day: Leaderboard = { ...week, id: 'b-day', roundIds: ['r1'] }

  eq(sheetForBoard(week), 'set-2', 'a board counting the week keeps its own sheet')
  eq(sheetForBoard(day), daySheetId('r1'),
    'and a board counting one day reads that day\'s fourballs')
  eq(sheetForBoard({ ...day, roundIds: ['r1', 'r2'] }), 'set-2',
    'two days is a competition spanning them, not either day\'s teams')

  const tagBoard: Leaderboard = {
    id: 'b-tag', audience: 'team', competition: 'league',
    scoring: 'stableford', combine: 'total', tagMode: 'best_cards',
    teamSet: 'main', roundIds: ['r1'],
  }
  eq(sheetForBoard(tagBoard), 'main',
    'a tags board is never a day\'s teams, whatever it counts')

  // The one that matters for going live: Tuesday's fourballs are not
  // something to demand on Sunday.
  eq(sheetsInUse([week, day]), ['set-2'],
    'a day sheet is not a sheet the teams screen apportions')
  eq(finaliseBlockedReason([day], []), null,
    'so an event whose only team board is a day board can still go live')
}

section('The day\'s teams are made at the sheet, through the one writer')
{
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('setTeam(tripId, id, sheet, team.id)'),
    'joining a formed team goes through setTeam, like every membership write')
  ok(client.includes("team_set: sheet"),
    'and the team row is made on the round\'s own sheet')
  ok(/dayTeamTagIssue\(ids, memberships\)/.test(client),
    'a mixed-tag group is refused before the team exists')
  ok(client.includes('joinNames('),
    'named from its members — a fourball made on the morning has no other name')
  ok(client.includes('unformTeam'), 'and it can be broken up again')

  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes('teamBoardForRound(boards, r.id)'),
    'whose teams a round groups by is asked per round, through the one copy')
  ok(!/boards\.find\(b => b\.audience === 'team'\)/.test(page),
    'the old take-the-first-team-board is gone — it silently picked one of two')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
