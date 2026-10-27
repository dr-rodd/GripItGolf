/**
 * Team picker tests. Run with: npm run test:team-picker
 *
 * Ross, 27 Oct 2026: teams and partnerships are made one way, through one
 * picker — the organiser picks anybody; a player, where the field picks its
 * own, starts a team, adds partners and takes out only themselves and the
 * people they added. The rules are lib/teamPicker.ts and are checked
 * directly; then the wiring: one writer, the added-by column named only
 * once it exists, and the drag editor kept behind its link.
 */

import fs from 'fs'
import {
  pickerSheets, mayPick, mayTakeOut, mayAddOthers, pickChoices, selectionIssue,
  pickPlan, madeTeamName, hasRoom, type PickerViewer, type PickerMember,
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
