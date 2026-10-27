/**
 * Team picker tests. Run with: npm run test:team-picker
 *
 * Ross, 27 Oct 2026: teams and partnerships are made one way, through one
 * picker — the organiser picks anybody; a player, where the field picks its
 * own, starts a team, adds partners and takes out only themselves and the
 * people they added. The rules are lib/teamPicker.ts and are checked
 * directly; then the wiring: one writer, the added-by column named only
 * once it exists, and the drag editor kept behind its link.
 *
 * Stage 4: a team made from the tee sheet, for one tee time — whoever is
 * on the time in no team is in it and fixed, the rest of the choice is the
 * players on no time yet, and the sheet places the team when it is back.
 */

import fs from 'fs'
import {
  pickerSheets, mayPick, mayTakeOut, mayAddOthers, pickChoices, selectionIssue,
  pickPlan, madeTeamName, hasRoom, type PickerViewer, type PickerMember,
  roundPickerSheet, teeTimeChoices, matesLockedIn, roomOnTime, teeTimeIssue, toPlace, openTeamOnTime,
  withinMyTag, teamTagIssue, type TeeTimePick,
} from '../lib/teamPicker'
import { isMadeName } from '../lib/partnerships'
import { type Leaderboard } from '../lib/leaderboards'
import { MAIN_SET } from '../lib/teamSets'
import { teamNoun } from '../lib/teamLimits'

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
const read = (p: string) => fs.readFileSync(p, 'utf8')

const solo: Leaderboard = { id: 'solo', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total' }
const fourball: Leaderboard = {
  id: 'fb', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total',
  teamFormat: 'better_ball', teamSet: 'set-2',
}
const tags: Leaderboard = {
  id: 'tags', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total',
  tagMode: 'all_cards', teamSet: MAIN_SET,
}
const pairsDraw: Leaderboard = { id: 'draw', audience: 'team', competition: 'matchplay', teamSet: 'set-3' }

// ─── The lists ─────────────────────────────────────────────────

section('The picker lists each team leaderboard\'s teams — never the tags, never a round\'s own')
{
  const sheets = pickerSheets([fourball, tags, solo], ['r1'])
  eq(sheets.map(s => s.id), ['set-2'], 'the fourball\'s teams, and not the event\'s tags')
  ok(sheets[0].together, '  …a primary team board of fours plays together')
  eq(sheets[0].boardTitles, 'Team better ball', '  …named for the leaderboard it is played on')

  const secondary = pickerSheets([solo, fourball], ['r1'])
  ok(secondary.length === 1 && !secondary[0].together,
    'a team board made second is listed, but its teams do not go out together')

  const day: Leaderboard = { ...fourball, id: 'day', roundIds: ['r1'] }
  eq(pickerSheets([solo, day], ['r1']).map(s => s.id), [],
    'a round\'s own partnerships are made on its tee sheet, not here')

  const draw = pickerSheets([pairsDraw], [])
  ok(draw[0].together && draw[0].cap === 2 && draw[0].noun.one === 'pairing',
    'a pairs draw: pairings of two, together, with no rounds to ask')

  const self = pickerSheets([{ ...fourball, teamPick: 'self', teamSize: 3 }], ['r1'])
  ok(self[0].selfPick && self[0].cap === 3, 'a self-pick board lets the field pick, in threes')
  eq(pickerSheets([fourball], ['r1'], () => 6)[0].together, false,
    'an organiser\'s sixes are listed as teams that play apart')
}

// ─── Who may do what ───────────────────────────────────────────

const organiser: PickerViewer = { organiser: true, meId: null, selfPick: false, addedRecorded: true }
const ross: PickerViewer = { organiser: false, meId: 'ross', selfPick: true, addedRecorded: true }
const rossBefore066: PickerViewer = { ...ross, addedRecorded: false }
const looker: PickerViewer = { organiser: false, meId: 'ross', selfPick: false, addedRecorded: true }

section('Medium security, as the tee sheet keeps it')
{
  ok(mayPick(organiser) && mayPick(ross) && !mayPick(looker), 'the organiser and a self-picking player may pick; anybody else looks')
  ok(!mayPick({ ...ross, meId: null }), '  …a stranger, who has claimed nobody, may not')
  ok(mayTakeOut(organiser, { playerId: 'sean', addedBy: 'dave' }), 'the organiser takes anybody out')
  ok(mayTakeOut(ross, { playerId: 'ross' }), 'a player takes themselves out')
  ok(mayTakeOut(ross, { playerId: 'dave', addedBy: 'ross' }), '  …and the partner they added')
  ok(!mayTakeOut(ross, { playerId: 'sean', addedBy: 'dave' }), '  …and nobody somebody else added')
  ok(mayAddOthers(ross) && !mayAddOthers(rossBefore066),
    'a player adds partners once who added whom is recorded — before 066, themselves only')
}

section('Who the picker offers')
{
  const players = ['ross', 'dave', 'sean', 'john', 'mary'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }))
  const ms: PickerMember[] = [
    { team_id: 't1', team_set: 'set-2', player_id: 'ross', added_by: 'ross' },
    { team_id: 't1', team_set: 'set-2', player_id: 'dave', added_by: 'ross' },
    { team_id: 't1', team_set: 'set-2', player_id: 'mary', added_by: null },
    { team_id: 't2', team_set: 'set-2', player_id: 'sean', added_by: 'sean' },
  ]
  const choices = (viewer: PickerViewer, teamId: string | null) =>
    pickChoices({ players, memberships: ms, sheet: 'set-2', teamId, viewer })

  const org = choices(organiser, 't1')
  eq(org.length, 5, 'the organiser is offered everybody')
  eq(org.find(c => c.id === 'sean')?.otherTeamId, 't2', '  …a player in another team moves when ticked')
  ok(org.every(c => !c.locked), '  …and nothing is fixed for them')

  const mine = choices(ross, 't1')
  ok(!mine.some(c => c.id === 'sean'), 'a player is never offered somebody in another team')
  ok(mine.find(c => c.id === 'ross')!.picked && mine.find(c => c.id === 'ross')!.locked,
    '  …is in their own team, fixed — leaving is its own button')
  ok(!mine.find(c => c.id === 'dave')!.locked, '  …can take out the partner they added')
  ok(mine.find(c => c.id === 'mary')!.locked, '  …but not one the organiser placed')
  ok(mine.some(c => c.id === 'john' && !c.picked), '  …and is offered the players in no team yet')

  const fresh = choices({ ...ross, meId: 'john' }, null)
  ok(fresh.find(c => c.id === 'john')!.picked && fresh.find(c => c.id === 'john')!.locked,
    'starting a team, the player is in it')
  eq(fresh.map(c => c.id), ['john'],
    '  …and with every other player teamed, nobody else is offered')

  const early = pickChoices({ players, memberships: [], sheet: 'set-2', teamId: null, viewer: { ...rossBefore066 } })
  eq(early.map(c => c.id), ['ross'], 'before 066, a player starting a team is offered only themselves')
}

section('A selection, and what saving it changes')
{
  const noun = teamNoun([fourball])
  eq(selectionIssue([], 2, noun), 'Pick at least one player.', 'nobody is not a team')
  ok(!!selectionIssue(['a', 'b', 'c'], 2, noun)?.startsWith('Teams of 2'), 'over the cap says so')
  eq(selectionIssue(['a'], 2, noun), null, 'a partial team is a team (Ross: "a partial team can be selected")')
  eq(pickPlan(['a', 'b'], ['b', 'c']), { add: ['c'], remove: ['a'] }, 'who goes in and who comes out')
  ok(hasRoom(1, 2) && !hasRoom(2, 2) && hasRoom(9, null), 'room against the cap, none without one')

  const name = madeTeamName(['Ross O\'Grady', 'Dave Byrne'])
  eq(name, 'Ross & Dave', 'a picked team is named from its players')
  ok(isMadeName(name, ['Ross O\'Grady', 'Dave Byrne']), '  …which reads as a name nobody chose, so it follows them')
}

// ─── From the tee sheet ────────────────────────────────────────

section('A round\'s own list, from its tee sheet')
{
  const daily: Leaderboard = { ...fourball, id: 'd1', roundIds: ['r1'], teamSet: undefined }
  const own = roundPickerSheet([solo, daily], 'r1', () => 0, true)
  ok(!!own && own.id.startsWith('day:'), 'a round\'s own partnerships are picked on its own sheet — the teams page never lists them')
  ok(!!own?.selfPick, '  …by the field wherever it books its own time, as "Make this group a team" always let it')
  ok(!roundPickerSheet([solo, daily], 'r1', () => 0, false)?.selfPick, '  …and only the organiser where it does not')
  eq(roundPickerSheet([fourball], 'r1', () => 0, true)?.selfPick, false,
    'an event-long partnership is the field\'s only where the board says the field picks')
  eq(roundPickerSheet([{ ...fourball, teamPick: 'self', teamSize: 2 }], 'r1', () => 0, false)?.cap, 2,
    '  …and a self-picked pair is two')
  eq(roundPickerSheet([fourball], 'r1', () => 0, true)?.cap, 4, 'never more than a tee time')
  eq(roundPickerSheet([solo, fourball], 'r1', () => 0, true), null, 'a round without partnerships has nothing to pick')
}

section('Who the picker offers for a tee time')
{
  const players = ['ross', 'dave', 'sean', 'john', 'mary', 'kate'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }))
  const ms: PickerMember[] = [
    { team_id: 't1', team_set: 'set-2', player_id: 'mary', added_by: null },
    { team_id: 't1', team_set: 'set-2', player_id: 'kate', added_by: null },
  ]
  const at: TeeTimePick = {
    label: '8:10 am', onSlot: ['dave'], mates: ['dave'], free: ['sean', 'john'], vacancy: 3, bookerRecorded: true,
  }
  const john: PickerViewer = { organiser: false, meId: 'ross', selfPick: true, addedRecorded: true }
  const c = teeTimeChoices({ players, memberships: ms, sheet: 'set-2', teamId: null, viewer: john, at, cap: 2 })
  eq(c.map(x => x.id), ['ross', 'dave', 'sean', 'john'], 'you, whoever is on the time, then the players on no time — never another team')
  ok(c[1].picked && c[1].locked,
    'whoever is on the time in no team is in your team and cannot be taken out (Ross: "preselected … and not deletable")')
  ok(!c[2].picked && !c[2].locked, '  …the players on no time are yours to add')

  const crowd: TeeTimePick = { ...at, onSlot: ['dave', 'sean'], mates: ['dave', 'sean'], free: [], vacancy: 2 }
  ok(!matesLockedIn(crowd, john, 0, 2), 'two on a pairs round\'s time do not both fit with you')
  const offered = teeTimeChoices({ players, memberships: ms, sheet: 'set-2', teamId: null, viewer: john, at: crowd, cap: 2 })
  ok(offered.filter(x => x.id !== 'ross').every(x => !x.picked && !x.locked), '  …so they are offered, for you to choose between')

  const early = teeTimeChoices({ players, memberships: ms, sheet: 'set-2', teamId: null, viewer: john, at: { ...at, bookerRecorded: false }, cap: 2 })
  eq(early.map(x => x.id), ['ross', 'dave'], 'before 065 records who booked whom, nobody is brought along — those on the time still are')

  const organiserChoices = teeTimeChoices({ players, memberships: ms, sheet: 'set-2', teamId: null, viewer: organiser, at, cap: 2 })
  ok(organiserChoices.every(x => !x.locked) && organiserChoices[0].id === 'dave',
    'the organiser can untick anybody, and is not in the team themselves')
}

section('Room on the time, and who goes on')
{
  const at: TeeTimePick = {
    label: '8:10 am', onSlot: ['dave', 'sean'], mates: ['dave'], free: ['john', 'mary'], vacancy: 2, bookerRecorded: true,
  }
  ok(roomOnTime('john', ['ross'], at, 4), 'one place left on the time after you')
  ok(!roomOnTime('mary', ['ross', 'john'], at, 4), '  …and none after that')
  ok(roomOnTime('dave', ['ross', 'john'], at, 4), 'somebody already on the time takes no place')
  ok(!roomOnTime('dave', ['ross', 'john'], at, 2), 'nor more than the team holds')
  eq(teeTimeIssue(['ross', 'john'], at), null, 'two coming, two places')
  eq(teeTimeIssue(['ross', 'john', 'mary'], at), 'Only 2 more fit at 8:10 am.', 'three coming says so')
  eq(teeTimeIssue(['ross'], { ...at, vacancy: 0 }), '8:10 am is full now — go back and pick another time.', 'a time filled meanwhile says so')
  eq(toPlace(['ross', 'dave', 'john'], new Set(['dave', 'sean'])), ['ross', 'john'], 'the sheet books whoever is not on it yet')
}

section('Where tags are in play, a team made for a time is of one')
{
  const tagged = [
    { team_id: 'eu', team_set: MAIN_SET, player_id: 'ross' },
    { team_id: 'eu', team_set: MAIN_SET, player_id: 'dave' },
    { team_id: 'us', team_set: MAIN_SET, player_id: 'sean' },
    { team_id: 'us', team_set: MAIN_SET, player_id: 'john' },
  ]
  const at: TeeTimePick = {
    label: '8:10 am', onSlot: ['dave', 'sean'], mates: ['dave', 'sean'], free: ['john'], vacancy: 2, bookerRecorded: true,
  }
  const mine = withinMyTag(at, { organiser: false, meId: 'ross' }, tagged, true)
  eq([mine.mates, mine.free], [['dave'], []], 'a player is offered only their own tag\'s')
  eq(withinMyTag(at, { organiser: true, meId: null }, tagged, true), at, '  …the organiser everybody')
  eq(withinMyTag(at, { organiser: false, meId: 'ross' }, tagged, false), at, '  …and without tags nothing is narrowed — a trip is untouched')
  ok(!!teamTagIssue(['ross', 'sean'], tagged, true), 'two tags in one team are refused')
  eq(teamTagIssue(['ross', 'sean'], tagged, false), null, '  …only while tags are in play')
}

section('A part-filled team on the time is joined, not doubled')
{
  const ms = [
    { team_id: 'half', team_set: 'set-2', player_id: 'mary' },
    { team_id: 'half', team_set: 'set-2', player_id: 'kate' },
    { team_id: 'full', team_set: 'set-2', player_id: 'sean' },
    { team_id: 'full', team_set: 'set-2', player_id: 'john' },
  ]
  eq(openTeamOnTime(ms, 'set-2', ['mary', 'kate'], 4), 'half', 'two of a four on the time: whoever picks it next joins them')
  eq(openTeamOnTime(ms, 'set-2', ['sean', 'john'], 2), null, 'a full pair has no room')
  eq(openTeamOnTime(ms, 'set-2', ['mary', 'sean'], 4), null, 'two with room is a choice, and the picker makes it')
  eq(openTeamOnTime(ms, 'set-3', ['mary', 'kate'], 4), null, 'only this round\'s list counts')

  const joining = teeTimeChoices({
    players: ['ross', 'mary', 'kate'].map(id => ({ id, name: id })),
    memberships: ms.map(m => ({ ...m, added_by: 'mary' })), sheet: 'set-2', teamId: 'half',
    viewer: { organiser: false, meId: 'ross', selfPick: true, addedRecorded: true },
    at: { label: '8:10 am', onSlot: ['mary', 'kate'], mates: [], free: [], vacancy: 2, bookerRecorded: true }, cap: 4,
  })
  ok(joining.every(c => c.picked && c.locked), '  …in it with them, nobody taken out by the one joining')
}

// ─── Wiring ────────────────────────────────────────────────────

section('One writer, and the column named only once it is there')
{
  const members = read('lib/teamMembers.ts')
  ok(members.includes("...(addedBy !== undefined ? { added_by: addedBy } : {})"),
    'setTeam names added_by only when it is handed one — every other caller writes what it always did')
  const sql = read('supabase/migrations/20260101000066_team_added_by.sql')
  ok(sql.includes('ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES players(id) ON DELETE SET NULL'),
    'migration 066 adds who put each player in, safe to re-paste')

  for (const f of ['app/trip/[tripCode]/teams/page.tsx', 'app/trip/[tripCode]/teams/pick/page.tsx']) {
    const src = read(f)
    ok(src.includes("select('team_set, player_id, added_by'") && src.includes('addedRecorded={!addedRes.error}'),
      `${f.split('/').slice(-2).join('/')} reads it in its own query, failing soft`)
  }

  const wizard = read('app/trip/[tripCode]/teams/pick/TeamPickerWizard.tsx')
  ok(wizard.includes("addedBy: addedRecorded ? (organiser ? null : meId) : undefined"),
    'the organiser\'s placings carry nobody, a player\'s carry them')
  ok(wizard.includes("'Who’s in the team?', 'Check the team'"), 'two steps: who is in it, then the check')
  ok(wizard.includes('<WizardShell'), '  …in the one wizard shell')

  const page = read('app/trip/[tripCode]/teams/page.tsx')
  ok(page.includes("view === 'drag'") && page.includes('<TripTeamsClient'),
    'the drag-and-drop editor is kept, behind its own link (Ross: may yet be reinstituted)')
  const client = read('app/trip/[tripCode]/teams/TeamsClient.tsx')
  ok(client.includes('?view=drag') && client.includes('Drag and drop instead'), '  …offered to the organiser')

  const organiserArea = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiserArea.includes('href={`/trip/${tripCode}/teams`} label="Teams"'),
    'the organiser area has a door to the teams — they were hard to find')
}

section('The tee sheet and the picker, wired')
{
  const pick = read('app/trip/[tripCode]/teams/pick/page.tsx')
  ok(pick.includes('readTeeTime(trip.id, teeRoundId, slotIndex)') && pick.includes('roundPickerSheet(boards, teeRoundId'),
    'the picker reads the time as it stands — who is on it is never taken from the link')
  const wizard = read('app/trip/[tripCode]/teams/pick/TeamPickerWizard.tsx')
  ok(wizard.includes('`${backHref}&place=${teeTime.slot}&team=${target.id}`'), 'saved, it goes back to the sheet with the team to place')
  ok(wizard.includes('`${backHref}&place=${teeTime.slot}&player=${only}`'), '  …and one player goes on alone — one is not a team')
  ok(wizard.includes('addedBy: addedRecorded ? null : undefined'), '  …those on the time are in by rule, carrying nobody, so the maker cannot take them out')

  const sheet = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(sheet.includes('Pick your team') && sheet.includes('Just me'), 'Join on a partnership round asks: your team first, or just you')
  ok(sheet.includes('placed.current = true') && sheet.includes('router.replace(`/trip/${tripCode}/teesheet?round='),
    'the sheet places the team once, and drops the request so a refresh cannot book twice')
  ok(sheet.includes('void addPlayers(placing.slot, coming)'), '  …through its own booking, tag gate and in-slot refusals included')
  ok(sheet.includes('await leaveRoundTeams(slotIndex, playerIds)') && sheet.includes("if (!round || !info?.isDay) return"),
    'off the time is out of the round\'s own team — an event-long partnership leaves as one block and stays one')
  ok(sheet.includes('for (const teamId of teamIds) await deleteTeam('), 'a team broken up on the sheet goes, rather than staying as a blank row')
  ok(sheet.includes('slotPlayers.length > roundTeamInfo.cap') && sheet.includes('Pick a team from this time'),
    'a time holding more than a team — a pairs fourball — picks its team rather than making all four one')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
