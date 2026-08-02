/**
 * Team sheet tests. Run with: npm run test:team-sets
 *
 * A trip can run a team league and a pairings knockout at the same time, and
 * they are not played by the same teams: four teams of three in the league,
 * six pairings in the draw. The same players, arranged twice.
 *
 * Three things have to hold, and each of them was a real bug before sheets:
 *
 *   · a player holds one place per sheet, not one place per trip — a single
 *     `players.team_id` cannot say that, and picking the pairings tore up
 *     the league
 *   · a board ranks ITS sheet's teams, so two team boards on one trip are
 *     two tables rather than the same one twice
 *   · a pairs draw caps ITS sheet at two. It has no business resizing the
 *     league's teams, and a trip-wide rule did exactly that
 */

import {
  MAIN_SET, setOf, boardsOnSheet, sheetsInUse, nextSheetId, canShareSheet,
  sheetName, sheetSubtitle, teamSheet, teamsOnSheet, membersOf, teamFor,
  asMembers, finaliseBlockedReason, type Membership,
} from '../lib/teamSets'
import {
  slotKey, isSlotFree, boardTitle, freeTeamFormats, parseLeaderboards,
  TEAM_FORMATS, type Leaderboard,
} from '../lib/leaderboards'
import { teamSizeLimit, teamNoun, canJoinTeam, oversizedTeams } from '../lib/teamLimits'

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

// ─── Fixtures ──────────────────────────────────────────────────

const league = (teamSet?: string): Leaderboard => ({
  id: 'lg', audience: 'team', competition: 'league',
  scoring: 'stableford', teamFormat: 'better_ball', combine: 'total', teamSet,
})
const draw = (teamSet?: string): Leaderboard => ({
  id: 'mp', audience: 'team', competition: 'matchplay', teamSet,
})
const solo: Leaderboard = {
  id: 'so', audience: 'individual', competition: 'league',
  scoring: 'stableford', combine: 'total',
}

const team = (id: string, set = MAIN_SET, name = id.toUpperCase()) =>
  ({ id, name, team_set: set })
const member = (playerId: string, teamId: string, set = MAIN_SET): Membership =>
  ({ player_id: playerId, team_id: teamId, team_set: set })

// ─── A board names the sheet it is played on ───────────────────

section('A board names the sheet it is played on')
{
  eq(setOf(league()), MAIN_SET, 'a board with no sheet is on the trip\'s first')
  eq(setOf(league('set-2')), 'set-2', 'and one with a sheet is on that')
  eq(setOf({ teamSet: '' }), MAIN_SET, 'an empty string is not a sheet')

  eq(sheetsInUse([]), [], 'a trip playing for nothing needs no sheet')
  eq(sheetsInUse([solo]), [], 'nor does one ranking only individuals')
  eq(sheetsInUse([league()]), [MAIN_SET], 'one team board needs one')
  eq(sheetsInUse([league(), draw()]), [MAIN_SET],
    'two boards sharing a sheet still need one')
  eq(sheetsInUse([league('main'), draw('set-2')]), ['main', 'set-2'],
    'and two boards on their own sheets need two, in board order')

  eq(boardsOnSheet([league('main'), draw('set-2'), solo], 'set-2').map(b => b.id), ['mp'],
    'a sheet knows which boards are played on it')
  eq(boardsOnSheet([league('main'), solo], 'main').map(b => b.id), ['lg'],
    'and an individual board is on none of them')
}

section('A fresh sheet is offered once there is one to share')
{
  ok(!canShareSheet([]), 'nothing to share on an empty trip')
  ok(!canShareSheet([solo]), 'nor with only an individual board')
  ok(canShareSheet([league()]), 'but the second team board can share the first\'s')

  eq(nextSheetId([]), MAIN_SET, 'the first sheet is the main one')
  eq(nextSheetId([solo]), MAIN_SET, 'still, with no team board')
  eq(nextSheetId([league()]), 'set-2', 'the second is numbered from two')
  eq(nextSheetId([league('main'), draw('set-2')]), 'set-3', 'and the third from three')
  // Numbering off the count rather than off what is taken would collide here
  eq(nextSheetId([league('set-2')]), MAIN_SET,
    'and main is offered again when nothing is on it')
}

// ─── Two boards on two sheets are two competitions ─────────────

section('The sheet is part of what makes a board itself')
{
  const a = league('main')
  const b = league('set-2')

  ok(slotKey(a) !== slotKey(b),
    'the same format on two sheets is two different competitions')
  ok(isSlotFree([a], b), 'so running one leaves the other free')
  ok(!isSlotFree([a], league('main')), 'while the same sheet does not')

  // The whole grid reopens on a fresh sheet — that is the point of one
  // Every format AND every way of adding the rounds up — a format stays on
  // offer while any board using it is still free.
  const everyFormat = TEAM_FORMATS.flatMap(f =>
    (['total', 'position'] as const).map(combine =>
      ({ ...league('main'), teamFormat: f.key, combine })))
  eq(freeTeamFormats(everyFormat, 'stableford', 'main'), [],
    'a sheet with every format on it has none left')
  eq(freeTeamFormats(everyFormat, 'stableford', 'set-2').length, TEAM_FORMATS.length,
    'and a second sheet has all of them again')

  // An individual board has no sheet, so the sheet must not enter its key
  eq(slotKey({ ...solo, teamSet: 'set-9' }), slotKey(solo),
    'a sheet on an individual board changes nothing — it has no teams')

  // One draw per trip, whichever sheet it is on. A second is a different
  // tournament, not a second view of this one.
  eq(slotKey(draw('main')), slotKey(draw('set-2')),
    'and a draw is a draw wherever its pairings come from')
  ok(!isSlotFree([draw('main')], draw('set-2')), 'so a trip runs only one')
}

section('A stored board reads back onto a sheet')
{
  const read = parseLeaderboards([
    { id: 'x', audience: 'team', competition: 'league', scoring: 'stableford',
      teamFormat: 'hero', combine: 'total' },
  ])
  eq(read[0].teamSet, MAIN_SET, 'a board stored before sheets existed is on the main one')

  const read2 = parseLeaderboards([
    { id: 'y', audience: 'team', competition: 'matchplay', teamSet: 'set-2' },
  ])
  eq(read2[0].teamSet, 'set-2', 'and a stored sheet comes back as itself')

  const junk = parseLeaderboards([
    { id: 'z', audience: 'team', competition: 'matchplay', teamSet: 42 },
  ])
  eq(junk[0].teamSet, MAIN_SET, 'while nonsense reads as the main sheet, not as nonsense')

  const ind = parseLeaderboards([
    { id: 'w', audience: 'individual', competition: 'league', scoring: 'strokes', teamSet: 'set-2' },
  ])
  eq(ind[0].teamSet, undefined, 'an individual board is given no sheet at all')
}

// ─── Membership ────────────────────────────────────────────────

section('A player holds one place on each sheet')
{
  // Alice and Bob play the league together in Reds, and against each other
  // in the draw. That is the arrangement a single team_id could not hold.
  const ms = [
    member('alice', 'reds'), member('bob', 'reds'), member('cara', 'blues'),
    member('alice', 'pair1', 'set-2'), member('bob', 'pair2', 'set-2'),
  ]

  eq(teamFor(ms, 'alice', 'main'), 'reds', 'her league team')
  eq(teamFor(ms, 'alice', 'set-2'), 'pair1', 'and her pairing, at the same time')
  eq(teamFor(ms, 'cara', 'set-2'), null, 'somebody unplaced on a sheet holds nothing there')
  eq(teamFor(ms, 'nobody', 'main'), null, 'and a stranger holds nothing anywhere')

  eq(membersOf(ms, 'reds'), ['alice', 'bob'], 'a team knows who is in it')
  eq(membersOf(ms, 'pair1'), ['alice'], 'on its own sheet')
  eq(membersOf(ms, 'empty'), [], 'and an empty team has nobody')

  // Projected into the shape the size rules expect, one sheet at a time
  eq(asMembers(['alice', 'bob', 'cara'], ms, 'main'),
    [{ id: 'alice', team_id: 'reds' }, { id: 'bob', team_id: 'reds' },
     { id: 'cara', team_id: 'blues' }],
    'the league sheet reads as who is in which team')
  eq(asMembers(['alice', 'bob', 'cara'], ms, 'set-2'),
    [{ id: 'alice', team_id: 'pair1' }, { id: 'bob', team_id: 'pair2' },
     { id: 'cara', team_id: null }],
    'and the draw sheet reads entirely differently for the same people')
}

section('Teams belong to a sheet')
{
  const teams = [team('reds'), team('blues'), team('pair1', 'set-2'), team('pair2', 'set-2')]

  eq(teamSheet(team('reds')), MAIN_SET, 'a team carries its sheet')
  eq(teamSheet({ id: 'x', name: 'X' }), MAIN_SET,
    'and one stored before sheets existed is on the main one')
  eq(teamSheet({ id: 'x', name: 'X', team_set: null }), MAIN_SET, 'null too')

  eq(teamsOnSheet(teams, 'main').map(t => t.id), ['reds', 'blues'], 'the league sheet')
  eq(teamsOnSheet(teams, 'set-2').map(t => t.id), ['pair1', 'pair2'], 'and the draw sheet')
  eq(teamsOnSheet(teams, 'set-9'), [], 'a sheet nobody is on is empty')
}

// ─── The size rules are the sheet's, not the trip's ────────────

section('A pairs draw caps its own sheet and nobody else\'s')
{
  const boards = [league('main'), draw('set-2')]
  const leagueSheet = boardsOnSheet(boards, 'main')
  const drawSheet   = boardsOnSheet(boards, 'set-2')

  // The regression this exists for: with one trip-wide rule, adding a pairs
  // draw capped the LEAGUE's teams at two as well.
  eq(teamSizeLimit(drawSheet), 2, 'the pairings are fixed at two')
  eq(teamSizeLimit(leagueSheet), null, 'and the league teams are not capped at all')
  eq(teamNoun(drawSheet).one, 'pairing', 'the draw\'s teams are pairings')
  eq(teamNoun(leagueSheet).one, 'team', 'and the league\'s are teams')

  // Four in a league team is fine; three in a pairing is not
  const four = ['a', 'b', 'c', 'd'].map(id => ({ id, team_id: 'reds' }))
  ok(canJoinTeam(leagueSheet, 'reds', four), 'a fifth may join a league team')
  eq(oversizedTeams(leagueSheet, [team('reds')], four), [], 'and four is not oversized')

  const three = ['a', 'b', 'c'].map(id => ({ id, team_id: 'pair1' }))
  ok(!canJoinTeam(drawSheet, 'pair1', three), 'a fourth may not join a pairing')
  eq(oversizedTeams(drawSheet, [team('pair1', 'set-2')], three).map(o => o.teamId), ['pair1'],
    'and a pairing of three is flagged')

  // Sharing one sheet means sharing the cap, which is what it should mean
  const shared = boardsOnSheet([league('main'), draw('main')], 'main')
  eq(teamSizeLimit(shared), 2,
    'a draw sharing the league\'s sheet does fix those teams at two')
}

// ─── Naming ────────────────────────────────────────────────────

section('A sheet is named after what is played on it')
{
  const boards = [league('main'), draw('set-2')]
  eq(sheetName(boards, 'set-2'), 'Pairings', 'a sheet that is only a draw is the pairings')
  eq(sheetName(boards, 'main'), 'Teams', 'a league sheet is the teams')
  eq(sheetName([league('main'), draw('main')], 'main'), 'Teams',
    'and a sheet carrying both is the trip\'s team sheet, not its pairings')
  eq(sheetName([], 'main'), 'Teams', 'with nothing on it, teams')

  eq(sheetSubtitle(boards, 'main', boardTitle), 'Team better ball',
    'the subtitle names the board played on it')
  eq(sheetSubtitle([league('main'), { ...draw('main') }], 'main', boardTitle),
    'Team better ball · Pairs matchplay',
    'and every board when a sheet carries more than one')
}

// ─── Going live ────────────────────────────────────────────────

section('Both sheets have to be picked before a trip goes live')
{
  const boards = [league('main'), draw('set-2')]
  const mainOnly = [team('reds'), team('blues')]
  const drawOnly = [team('pair1', 'set-2'), team('pair2', 'set-2')]

  ok(finaliseBlockedReason(boards, mainOnly) !== null, 'the league teams alone are not enough')
  ok(finaliseBlockedReason(boards, drawOnly) !== null, 'nor are the pairings alone')
  eq(finaliseBlockedReason(boards, [...mainOnly, ...drawOnly]), null, 'both, and it can go')

  // The message has to say which sheet, or "pick teams" means nothing when
  // the organiser has already picked some
  ok(/pairing/i.test(finaliseBlockedReason(boards, mainOnly)!),
    'and the missing sheet is the one named')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
