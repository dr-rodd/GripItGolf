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
  opensAt, sheetIsOpen, describeOpening, teeSheetSummary, mayRemoveBooking,
} from '../lib/teeSheet'
import { irishInstant, daysBefore } from '../lib/irishTime'
import { teeSheetAccess } from '../lib/eventPermissions'
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
  eq(draftRules({ state: 'vacant' }, '07:45', 18, 9).batches[0].count, 9,
    '  …and as many tee times as the event planned for the round, where it said')
  eq(draftRules({ state: 'vacant' }, '07:45', 18, 1).batches[0].count, 5,
    '  …a plan of one being the form\'s default, not an answer')
  eq(draftRules(legacy, '08:30', 7),
    { batches: [{ start: '08:30', interval: 12, count: 4, ends: 'count' }], groupSize: 2 },
    'a legacy sheet opens as it stood')
  eq(draftRules(active, '06:00', 50), rules, 'and a live one as saved')
}

section('Medium security: a player changes only themselves and those they booked')
{
  const player = { organiser: false, meId: 'me', playersBook: true }
  eq([
    mayRemoveBooking(player, { playerId: 'me' }),
    mayRemoveBooking(player, { playerId: 'mate', bookedBy: 'me' }),
    mayRemoveBooking(player, { playerId: 'stranger', bookedBy: 'someone' }),
    mayRemoveBooking(player, { playerId: 'stranger', bookedBy: null }),
  ], [true, true, false, false],
    'yourself and anyone you booked; never a name somebody else put there, or the organiser placed')
  ok(mayRemoveBooking({ organiser: true, meId: null, playersBook: false }, { playerId: 'stranger', bookedBy: 'someone' }),
    'a phone with organiser access removes anybody')
  ok(!mayRemoveBooking({ organiser: false, meId: 'me', playersBook: false }, { playerId: 'me' }),
    'where the organiser places everyone, the sheet is read-only to the rest')
  ok(!mayRemoveBooking({ organiser: false, meId: null, playersBook: true }, { playerId: 'x', bookedBy: null }),
    'and a phone that is nobody changes nothing')

  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('const mayBookOthers = organiser || (selfPick && bookerRecorded)'),
    'a player brings others only once who booked them can be recorded (migration 065)')
  ok(client.includes('...(bookerRecorded ? { booked_by: meId ?? null } : {})'),
    '  …and every booking records who made it, named only once the column exists')
  ok(client.includes('{mayRemove(p.id) && (') && client.includes('together && g.players.every(p => mayRemove(p.id))'),
    'each ✕ asks the one rule — a linked team only when every member is yours to move')
  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes("select('round_id, player_id, booked_by', { count: 'exact' })") && page.includes('bookerRecorded={!bookersResult.error}'),
    'who booked whom is read on its own, fail-soft — before 065 the sheet stands, players booking themselves')
  ok(fs.readFileSync('supabase/migrations/20260101000065_tee_booked_by.sql', 'utf-8').includes('ADD COLUMN IF NOT EXISTS booked_by uuid REFERENCES players(id) ON DELETE SET NULL'),
    'migration 065 adds the column, cleared rather than cascading if the booker leaves')
}

section('Trips have tee times too, under the same rules (Ross, 26 Oct 2026)')
{
  eq(teeSheetAccess(null), { anyoneOpens: false, playersPick: true },
    'nothing stored: the lead player or organiser opens the sheets, and players book their own times — the medium default')
  eq(teeSheetAccess({ set_tee_sheets: true, edit_tee_sheet: true }), { anyoneOpens: true, playersPick: true },
    '  …and the stored answers are read as given — on a trip as on an event, never opened wholesale for a trip')

  const sheetPage = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(!sheetPage.includes('This is a trip'), 'the Tee times tab no longer turns a trip away')
  ok(sheetPage.includes('isTrip={!isEvent(kind)}'), '  …and speaks of a trip\'s lead player and passcode')
  const wizPage = read('app/trip/[tripCode]/teesheet/[roundId]/setup/page.tsx')
  ok(!wizPage.includes('This is a trip') && wizPage.includes("from === 'setup' ? `/trip/${tripCode}/setup`"),
    'nor does the wizard, which sends a trip back to Trip Setup')

  const setup = read('app/trip/[tripCode]/setup/page.tsx')
  ok(setup.includes('if (!isEvent(trip.kind) && rounds.length > 0)') && setup.includes('<TripTeeTimes'),
    'Trip Setup carries a trip\'s Tee times section — an event keeps its own in the organiser area')
  const section = read('app/trip/[tripCode]/setup/TripTeeTimes.tsx')
  ok(section.includes("update({ start_format: next ? 'tee_sheet' : null }).eq('trip_id', tripId)")
     && section.includes(".eq('start_format', 'tee_sheet')"),
    '  …on puts every round on a tee sheet; off takes them off and deletes nothing')
  ok(section.includes('<TeeSheetRoundControls') && section.includes('from="setup"'),
    '  …each round with the same controls the organiser area draws')
  ok(/update\(\{ event_permissions: merged \}\)\.eq\('id', tripId\)/.test(section),
    '  …and the two answers stored where an event keeps them, merged')

  const access = read('app/components/TeeTimesAccess.tsx')
  ok(access.includes("const boss = trip ? 'The lead player' : 'The organiser'"),
    'a trip is asked in its lead player\'s words, never an organiser\'s')

  const form = read('app/dashboard/create/CreateTripForm.tsx')
  ok(form.includes('trip={!isTournament}') && /teeTimes \? \{ start_format: 'tee_sheet' \} : \{\}/.test(form),
    'trip creation asks the question and puts every round on a tee sheet when it is on')
  const store = read('lib/itineraryStore.ts')
  ok(/\.\.\.\(teeSheet \? \{ start_format: 'tee_sheet' \} : \{\}\)/.test(store),
    'a round added to a trip later follows it onto a tee sheet')

  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(/\/\/ them whole \(lib\/allRows\.ts\)\.\s*readSheetSettings\(trip\.id\),/.test(hub),
    'a trip\'s home screen reads its tee sheets as an event\'s does')
}

section('A sheet may open later: days before the round, or on a date, Irish time')
{
  eq([irishInstant('2026-12-01', '20:00')?.toISOString(), irishInstant('2026-07-01', '20:00')?.toISOString()],
    ['2026-12-01T20:00:00.000Z', '2026-07-01T19:00:00.000Z'],
    'eight o\'clock is eight o\'clock in Ireland, winter and summer, whatever clock the server keeps')
  eq(irishInstant('2026-12-01', '25:00'), null, '  …and a time that is not one is no instant')
  eq(daysBefore('2026-03-02', 3), '2026-02-27', 'days before count back over a month end')

  const base: TeeRules = { batches: [{ start: '08:00', interval: 10, count: 6 }], groupSize: 4 }
  const before: TeeRules = { ...base, opens: { daysBefore: 3, time: '20:00' } }
  const onDate: TeeRules = { ...base, opens: { date: '2026-11-20', time: '09:30' } }
  eq(opensAt(base, '2026-12-05'), null, 'no opening given: open the moment it is saved')
  eq(opensAt(before, '2026-12-05')?.toISOString(), '2026-12-02T20:00:00.000Z', '3 days before at 8 pm')
  eq(opensAt(before, null), null, '  …a round with no date has nothing to count back from, so it is open')
  eq(opensAt(onDate, '2026-12-05')?.toISOString(), '2026-11-20T09:30:00.000Z', 'or a date and a time of its own')
  eq([sheetIsOpen(before, '2026-12-05', new Date('2026-12-02T19:59:00Z')), sheetIsOpen(before, '2026-12-05', new Date('2026-12-02T20:00:00Z'))],
    [false, true], 'closed until the minute it opens, and open from it')
  eq(describeOpening(before, '2026-12-05'), 'Wed 2 Dec at 8:00 pm', 'said as the day it lands on')
  eq(describeOpening(base, '2026-12-05'), null, '  …and nothing for a sheet that is open already')

  eq(parseTeeRules(JSON.parse(JSON.stringify(before))), before, 'the opening is stored with the rules and read back')
  eq(parseTeeRules({ ...base, opens: { daysBefore: 999, time: '20:00' } }), base,
    'an opening that does not hold is dropped — the sheet opens now — never the sheet with it')
  ok(!!rulesIssue({ ...base, opens: { date: '', time: '20:00' } }), 'an opening date must be given to be saved')

  const legacy = { state: 'legacy' as const, startTime: '08:00', intervalMins: 10, groupSize: 4 }
  eq(teeSheetSummary(roundSheet({ rules: before, startTime: null, intervalMins: null, groupSize: null, hasAssignments: false }), '2026-12-05', new Date('2026-12-01T00:00:00Z')),
    '6 tee times, 8:00 am to 8:50 am, in fours · opens Wed 2 Dec at 8:00 pm',
    'the organiser\'s line says when it opens while that is still to come')
  eq(teeSheetSummary(legacy, null, new Date()), '10 minutes between groups, groups of up to 4', '  …and a legacy sheet as it always read')
  eq(teeSheetSummary({ state: 'vacant' }, null, new Date()), null, '  …and a vacant one not at all')

  const wiz = read('app/trip/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wiz.includes("'When does it open?'") && wiz.includes('Some days before the round') && wiz.includes('On a date'),
    'the wizard asks when it opens: now, days before the round, or a date')
  ok(/\{roundDate && \(\s*<div className=\{optionClass\(openMode === 'before'\)\}/.test(wiz),
    '  …days before only for a round with a date')
  ok(wiz.includes("live ? 'Save changes' : 'Open tee sheet'"), 'making a sheet is opening it (Ross, 26 Oct 2026)')

  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes('!sheetIsOpen(sheet.rules, r.scheduled_date, now)'), 'the tab works out, per round, whether it has opened')
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('const fieldBarred = notYetOpen && !organiser') && client.includes('tee sheet opens {round.opensLabel}'),
    '  …the field told when, and nothing more')
  ok(client.includes('const selfPick = selfPickAllowed && !notYetOpen'), '  …nobody picking a time before it opens')
  ok(client.includes('Until then only you can see it.'), '  …while the organiser sees it and may place players early')
  ok(read('app/trip/[tripCode]/page.tsx').includes("sheetIsOpen(teeRoundSheet.rules, teeRound?.date ?? null, new Date())"),
    'and the home screen says nothing of it until it opens')
}

section('A sheet can be deleted, or cleared of its players')
{
  const wiz = read('app/trip/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wiz.includes('Delete this tee sheet') && /\{live && \(/.test(wiz), 'an open sheet can be deleted from its wizard')
  ok(/from\('tee_assignments'\)\s*\.delete\(\)\s*\.eq\('trip_id', tripId\)\s*\.eq\('round_id', roundId\)/.test(wiz)
     && wiz.includes('.update({ tee_sheet: null })'),
    '  …taking its bookings and its rules, scoped — as if it was never opened')
  const controls = read('app/trip/[tripCode]/teesheet/TeeSheetRoundControls.tsx')
  ok(controls.includes('Clear the tee sheet') && /from\('tee_assignments'\)\s*\.delete\(\)\s*\.eq\('trip_id', tripId\)\s*\.eq\('round_id', roundId\)/.test(controls),
    'the organiser can clear a sheet: everybody off it, scoped to the round')
  ok(!controls.includes('tee_sheet:'), '  …and the times stay')
  ok(controls.includes('Keep them'), '  …asked once before it goes')
}

section('A sheet is made in its own wizard, behind the PIN unless the event is open')
{
  const page = read('app/trip/[tripCode]/teesheet/[roundId]/setup/page.tsx')
  ok(/teeSheetAccess\([\s\S]{0,120}\.anyoneOpens/.test(page) && /!openToAll && isLocked\(/.test(page),
    'the wizard asks for the PIN unless anyone may open the sheets — on a trip, its passcode')
  ok(page.includes(".from('rounds')") && page.includes(".eq('id', roundId)") && page.includes(".eq('trip_id', trip.id)"),
    'a sheet is for a round in Scoring, read scoped to the event')
  ok(page.includes('No such round'), '  …and a round that is not there says so, never a blank form')
  ok(page.includes('draftRules(sheet, startTime, fieldSize, item?.tee_count)'),
    'it opens on the draft lib/teeSheet.ts makes')

  const wiz = read('app/trip/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wiz.includes('<WizardShell') && wiz.includes('aboveTabBar'),
    'it wears the wizard frame, its Continue bar above the tab bar')
  ok(/tee_sheet: rules,\s*start_format: 'tee_sheet'/.test(wiz),
    'saving stores the rules whole and makes the round a tee-sheet round')
  ok(/update\(\{ tee_time: first\.start, tee_count: length \}\)/.test(wiz),
    '  …and moves the round\'s start to the first tee time, where the countdown reads it')
  ok(/if \(short > 0\) \{ setAskShort\(true\); return \}/.test(wiz) && wiz.includes('Save anyway') && wiz.includes('Add tee times'),
    'a sheet too short for the field asks once, and saves anyway if told to')
  ok(wiz.includes('disabled={!!stepIssue || saving}'), 'rules that do not hold cannot be saved')
}

section('An event made with tee times has a tee sheet for every round')
{
  for (const f of ['app/dashboard/create/CreateLeagueForm.tsx', 'app/dashboard/create/CreateTripForm.tsx']) {
    const src = read(f)
    const name = f.split('/').pop()
    ok(src.includes('<TeeTimesQuestion'), `${name} asks the tee times question, the shared one`)
    ok(/teeTimes \? \{ start_format: 'tee_sheet' \} : \{\}/.test(src),
      '  …and on, every round it makes starts from a tee sheet — named only then')
    ok(/const finalPerms = teeTimes \? perms\s*: \{ \.\.\.perms, set_tee_sheets: defaultPermissions\(\)\.set_tee_sheets, edit_tee_sheet: defaultPermissions\(\)\.edit_tee_sheet \}/.test(src),
      '  …off, its two answers stay at their defaults whatever was tapped')
  }
  const store = read('lib/leagueRoundStore.ts')
  ok(store.includes('teeSheetInUse(') && /\.\.\.\(teeSheet \? \{ start_format: 'tee_sheet' \} : \{\}\)/.test(store),
    'a league round added later, or made when its venue is chosen, follows the event onto a tee sheet')
  const access = read('app/components/TeeTimesAccess.tsx')
  ok(access.includes('Who opens the tee sheets') && access.includes('Who puts players on a tee time'),
    'the question\'s two answers, said from the organiser\'s side')
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

section('The tee times are a tab, and your time is on the home screen too')
{
  // Ross, 26 Oct 2026: Tee times is the bar's fourth tab while a round
  // starts from a tee sheet, and the home screen keeps your time as well.
  const bar = read('app/components/TabBar.tsx')
  ok(bar.includes("label: 'Tee times'") && bar.includes('/teesheet`'),
    'the bar carries Tee times, straight to the sheet')
  ok(bar.includes("fourth === 'teeTimes' ? [TEE_TIMES_ITEM]"), '  …as the fourth tab, when it is the fourth tab')

  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes("modules.includes('teeTimes')"),
    'the hub draws the tee times while they are active')
  ok(hub.includes("teeSheet: !!teeRoundSheet && teeRoundSheet.state !== 'vacant'"),
    '  …which is while the round it speaks for has a live sheet — a vacant one says nothing there')
  ok(hub.includes('teeSheetInUse(rounds.map(startFormatOf))'),
    '  …which is while a round starts from a tee sheet — an event\'s or a trip\'s')
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
  ok(page.includes('readSheetSettings(trip.id)'),
    'the settings ride in their own fail-soft queries')
  const sheets = read('app/trip/[tripCode]/teesheet/sheets.ts')
  ok(sheets.includes("select('id, tee_sheet')") && sheets.includes("select('id, tee_interval_mins, tee_group_size, start_format')"),
    '  …the wizard\'s rules and the older two apart, so one missing migration costs only its own')
  ok(page.includes('teeSheetAccess(') && page.includes('fieldMayEdit={access.playersPick}') && page.includes('fieldMaySet={access.anyoneOpens}'),
    'the field\'s rights are the two stored answers — read alike on a trip and an event')
  ok(/\.filter\(r => parseStartFormat\(r\.start_format\) === 'tee_sheet'\)/.test(page),
    'only rounds that start from a tee sheet are on the tab')
  ok(page.includes('roundSheet({') && page.includes('hasAssignments: assignedRounds.has(r.id)'),
    '  …each vacant, live or legacy by lib/teeSheet.ts')

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
  ok(client.includes('groupSlot(') && client.includes('sheetClock(sheet, i)') && client.includes('sheetSlots('),
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

section('A vacant round offers the wizard; players pick their own time when allowed')
{
  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes("isn&apos;t open yet") && client.includes('Open the tee sheet'),
    'a round with no sheet yet says so and offers the wizard — never an empty heading')
  ok(/!fieldMaySet && isLocked\(passcodeHash\) && !unlocked/.test(client) && client.includes('Asks for the organiser PIN.'),
    '  …saying the PIN is asked, unless anyone may make the sheets')
  ok(/\{fieldMaySet && \([\s\S]{0,200}Edit the tee sheet/.test(client),
    'an open event\'s live sheet carries an Edit button into the wizard; a closed one does not')
  ok(client.includes('const organiser = unlocked || !isLocked(passcodeHash)'),
    'the organiser places anybody — the PIN unlocked, or an event without one')
  ok(client.includes('const selfPickAllowed = !organiser && fieldMayEdit && !!meId'),
    'a claimed player picks their own time only when the event says players pick')
  ok(/selfPick && storageReady && myUnitIds\.length > 0 && vacancy >= myUnitIds\.length/.test(client),
    '  …joining a time with room for them, and on a share-a-tee board their whole team')
  ok(client.includes('removePlayers(i, myLeavers(slotPlayers))'), '  …and leaving only their own')
  ok(!/\{canEdit/.test(client) && /\{mayBookOthers && storageReady && vacancy > 0 && !open/.test(client),
    'only the organiser, or a player booking their own times, places anybody else')
  ok(client.includes('myTee(roundAssignments, meId, live'), 'your own time sits at the top, from the one copy')
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

section('The organiser reaches the wizard where the start is chosen')
{
  const client = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  const controls = read('app/trip/[tripCode]/teesheet/TeeSheetRoundControls.tsx')
  ok(client.includes('<TeeSheetRoundControls') && client.includes('from="organiser"')
     && controls.includes('/teesheet/${roundId}/setup?from=${from}'),
    'a tee-sheet round\'s card is the way into its wizard, and back')
  ok(controls.includes("state === 'vacant' ? 'Open the tee sheet' : 'Change the tee sheet'"),
    '  …opened while not open yet, changed once it is')
  ok(!client.includes('saveTeeSetting') && !client.includes('Minutes between groups'),
    'the times are the wizard\'s alone — no second set of controls here')
  ok(client.includes('<TeeTimesAccess') && /set_tee_sheets: next\.anyoneMakes, edit_tee_sheet: next\.playersPick/.test(client),
    'the tee times question is asked here, saved as its two permissions')
  ok(/setStartError\('Could not save the start format — try again'\)\s*return\s*\}\s*router\.refresh\(\)/.test(client),
    'a start format that lands refreshes the router, so the bar\'s fourth tab follows')
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
