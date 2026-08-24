/**
 * Team-pick tests. Run with: npm run test:team-pick
 *
 * Two halves. The rules first — the board's teamPick/teamSize answers, the
 * size cap folding into `teamSizeLimit` (the one copy every enforcement
 * reads), and the parse round-trip. Then the wiring: the join screen stands
 * where the PIN gate stood only when the board says players pick, its
 * writes go through the same `setTeam` the editor's drag uses, and the trip
 * editor's add-search assigns through the drag's own path.
 */

import fs from 'fs'
import {
  parseLeaderboards, offersTeeTeams,
  MIN_TEAM_SIZE, MAX_TEAM_SIZE_TOGETHER, MAX_TEAM_SIZE_SEPARATE,
  type Leaderboard,
} from '../lib/leaderboards'
import { teamSizeLimit, teamSizeBanner, canJoinTeam, PAIR_SIZE } from '../lib/teamLimits'

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

const teamBoard = {
  id: 'lb-1', audience: 'team', competition: 'league',
  scoring: 'stableford', teamFormat: 'better_ball', combine: 'total',
}

// ─── The board's answers ───────────────────────────────────────

section('Self-picked teams round-trip whole, sized to what a tee time seats')
{
  const stored = parseLeaderboards([{ ...teamBoard, teamPick: 'self', teamSize: 4 }])
  eq(stored[0].teamPick, 'self', 'the pick is stored')
  eq(stored[0].teamSize, 4, 'and the size with it')

  const organiser = parseLeaderboards([teamBoard])
  ok(!('teamPick' in organiser[0]) && !('teamSize' in organiser[0]),
    'absent means the organiser assigns — every board stored before the question')

  const together = parseLeaderboards([{ ...teamBoard, teamPick: 'self', teamSize: 6 }])
  eq(together[0].teamSize, MAX_TEAM_SIZE_TOGETHER,
    'a share-a-tee board clamps to what a group can seat — four')
  const separate = parseLeaderboards([
    { ...teamBoard, teeTeams: 'separate', teamPick: 'self', teamSize: 6 },
  ])
  eq(separate[0].teamSize, 6, 'members-play-apart may go bigger')
  eq(parseLeaderboards([
    { ...teamBoard, teeTeams: 'separate', teamPick: 'self', teamSize: 20 },
  ])[0].teamSize, MAX_TEAM_SIZE_SEPARATE, 'but not without limit')
  eq(parseLeaderboards([
    { ...teamBoard, teamPick: 'self', teamSize: 1 },
  ])[0].teamSize, MIN_TEAM_SIZE, 'and a team of one is not a team')

  const sizeWithoutPick = parseLeaderboards([{ ...teamBoard, teamSize: 4 }])
  ok(!('teamSize' in sizeWithoutPick[0]),
    'a size without the pick is dropped — it only means anything with it')
  const soloBoard = parseLeaderboards([{
    id: 'lb-2', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total', teamPick: 'self', teamSize: 2,
  }])
  ok(!('teamPick' in soloBoard[0]), 'an individual board never carries the answers')

  ok(offersTeeTeams({ audience: 'team', competition: 'league' }),
    'the questions live in the same event-gated block as tee-teams')
}

section('teamSizeLimit is the one copy of every cap')
{
  const boards = parseLeaderboards([{ ...teamBoard, teamPick: 'self', teamSize: 2 }])
  eq(teamSizeLimit(boards), 2, 'a criteria board sets the cap')
  ok(teamSizeBanner(boards)!.includes('Teams of 2'), 'and the banner says so')

  const uncapped = parseLeaderboards([teamBoard])
  eq(teamSizeLimit(uncapped), null, 'an organiser-assigned league stays uncapped')

  const pairs = parseLeaderboards([
    { id: 'lb-3', audience: 'team', competition: 'matchplay' },
  ])
  eq(teamSizeLimit(pairs), PAIR_SIZE, 'a pairs draw still caps at two')

  // canJoinTeam reads the same copy, so the join screen, the drag and the
  // add-search can never disagree about a full team.
  const members = [
    { id: 'p1', team_id: 't1' }, { id: 'p2', team_id: 't1' }, { id: 'p3', team_id: null },
  ]
  ok(!canJoinTeam(boards, 't1', members), 'a full criteria team refuses one more')
  ok(canJoinTeam(uncapped, 't1', members), 'an uncapped one does not')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The join screen stands only where the board says players pick')
{
  const page = read('app/trip/[tripCode]/teams/page.tsx')
  ok(page.includes("b.teamPick === 'self'"), 'the page reads the answer')
  ok(page.includes('<TeamsModeSwitch'), 'and switches faces on it')
  ok(page.includes('linkedPlayerId(tripCode)'),
    'the viewer is the claim cookie — personalises, never authorises')
  ok(page.includes('<PasscodeGate'),
    'an event without self-pick keeps the gate exactly as it was')

  const join = read('app/trip/[tripCode]/teams/TeamJoinClient.tsx')
  ok(join.includes('setTeam(tripId, viewer.id, sheet'),
    'joins and leaves go through the one membership writer')
  ok(join.includes('teamSizeLimit(boards)'), 'room is the one copy of the cap')
  ok(join.includes('joinNames('),
    'a team is named from its members — Ross & Dave')
  ok(join.includes('Claim your name'),
    'a stranger is pointed at the players screen, calmly')
  ok(join.includes('PRESET_COLORS'),
    'self-made teams colour from the same twelve as everyone else')

  const modeSwitch = read('app/trip/[tripCode]/teams/TeamsModeSwitch.tsx')
  ok(modeSwitch.includes('hasUnlocked(tripCode)'),
    'the organiser is recognised by the same session unlock as every gate')
  ok(modeSwitch.includes('<InlineUnlock'),
    'and is one inline PIN away from the full editor')
}

section('The trip editor scales without losing its drag')
{
  const client = read('app/trip/[tripCode]/teams/TripTeamsClient.tsx')
  ok(client.includes('async function assignPlayer('),
    'one assign path — the drag and the search share it')
  ok(client.includes('await assignPlayer(active.id as string'),
    'the drop goes through it')
  ok(client.includes('onAssign={assignPlayer}'), 'and so does the add-search')
  ok(client.includes('+ Add players'), 'each team column offers the search')
  ok(client.includes('DndContext'), 'while the drag stays exactly where it was')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
