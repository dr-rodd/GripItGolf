/**
 * Partnership tests. Run with: npm run test:partnerships
 *
 * Ross, 27 Oct 2026: three things — the event's tags (the umbrella group),
 * the teams a leaderboard makes, and partnerships, the tight subset of
 * teams: the two to four who go out on one tee time and enter the sheet
 * and the board as one. The rules are in lib/partnerships.ts and are
 * checked directly: which board governs a round, when its teams are
 * partnerships, when the organiser is asked whether they play together,
 * how the answer is stored, and how a pair is named. Then the wiring: the
 * tee sheet and its wizard read the one copy, and the question has moved
 * out of the leaderboard form.
 */

import fs from 'fs'
import {
  governingBoard, roundPartnership, playTogetherQuestion, withPlayTogether, isPairs,
  isMadeName, partnershipName, carriedPartnerships, MAX_PARTNERSHIP, PAIR,
} from '../lib/partnerships'
import { type Leaderboard, parseLeaderboards } from '../lib/leaderboards'
import { daySheetId, MAIN_SET, nextSheetId, type Membership } from '../lib/teamSets'
import { boardNames } from '../lib/displayNames'

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
const pairsDraw: Leaderboard = { id: 'draw', audience: 'team', competition: 'matchplay', teamSet: 'set-3' }
const tags: Leaderboard = {
  id: 'tags', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total',
  tagMode: 'all_cards', teamSet: MAIN_SET,
}

// ─── Which board governs a round ───────────────────────────────

section('A round is played the way its governing board says')
{
  eq(governingBoard([fourball, solo], 'r1')?.id, 'fb', 'the first board made governs')
  eq(governingBoard([solo, fourball], 'r1')?.id, 'solo', '  …so a team board made second does not')
  const day1: Leaderboard = { ...fourball, id: 'd1', roundIds: ['r1'] }
  eq(governingBoard([solo, day1], 'r1')?.id, 'd1', 'a round\'s own board governs that round')
  eq(governingBoard([day1, solo], 'r2')?.id, 'solo', '  …and only that round — another round falls to the first board covering it')
  eq(governingBoard([], 'r1'), null, 'no boards, nothing governs')
}

// ─── When the teams are partnerships ───────────────────────────

section('Partnerships come from the governing board, and only that one')
{
  eq(roundPartnership([solo, fourball], 'r1'), null,
    'an individual event with a team board on the side has no partnerships — a secondary board ranks the golf, it does not shape it')
  const p = roundPartnership([fourball, solo], 'r1')
  ok(!!p && p.board.id === 'fb' && p.sheet === 'set-2' && !p.isDay,
    'a team league first is played in partnerships, kept on its own sheet for the whole event')
  eq(p?.size, null, '  …of no fixed size while the organiser assigns them')

  const draw = roundPartnership([pairsDraw], 'r1')
  eq(draw?.size, PAIR, 'a pairs knockout is always pairs')
  eq(roundPartnership([{ ...pairsDraw, teeTeams: 'separate' }], 'r1')?.size, PAIR,
    '  …whatever was ever stored: a pair always plays together')

  eq(roundPartnership([tags], 'r1'), null, 'the event\'s tags are never partnerships — twelve is not a fourball')
  eq(roundPartnership([{ ...fourball, teeTeams: 'separate' }], 'r1'), null,
    'a league whose players play apart has none')
  ok(!!roundPartnership([{ ...fourball, teeTeams: 'together' }], 'r1'), '  …and one that said yes has them')
  ok(!!roundPartnership([fourball], 'r1'), '  …as does one never asked, which is what every board did before')

  const self3: Leaderboard = { ...fourball, teamPick: 'self', teamSize: 3 }
  eq(roundPartnership([self3], 'r1')?.size, 3, 'self-picked threes are partnerships of three')
  eq(roundPartnership([{ ...fourball, teamPick: 'self', teamSize: 6, teeTeams: 'separate' }], 'r1'), null,
    'teams of six cannot share a tee time')
  eq(roundPartnership([fourball], 'r1', 6), null,
    '  …nor can an organiser\'s six, though the board was never asked')
  ok(!!roundPartnership([fourball], 'r1', MAX_PARTNERSHIP), '  …while four can')

  const day: Leaderboard = { ...fourball, id: 'day', roundIds: ['r2'] }
  const d = roundPartnership([solo, day], 'r2')
  ok(!!d && d.isDay && d.sheet === daySheetId('r2'),
    'a round\'s own team board makes that round\'s partnerships, on the round\'s own sheet — new ones each round')
  eq(roundPartnership([solo, day], 'r1'), null, '  …and the other rounds go out as they please')
}

section('Pairs always play together, and are never asked')
{
  // Ross, 27 Oct 2026: "any pairings (usually a better ball or foursomes)"
  // are partnerships — they play together, usually two pairs a tee time.
  const selfPairs: Leaderboard = { ...fourball, teamPick: 'self', teamSize: 2 }
  eq(roundPartnership([selfPairs], 'r1')?.size, PAIR, 'a league of self-picked twos plays in pairs')
  eq(roundPartnership([{ ...selfPairs, teeTeams: 'separate' }], 'r1')?.size, PAIR,
    '  …whatever was once answered: a pair always plays together')
  eq(playTogetherQuestion([selfPairs], 'r1'), null, '  …so it is never asked')
  ok(isPairs(selfPairs) && !isPairs({ ...fourball, teamPick: 'self', teamSize: 3 }, PAIR),
    '  …while a self-picked three is a three, however many have joined so far')

  eq(roundPartnership([fourball], 'r1', PAIR)?.size, PAIR,
    'an organiser filling a league in twos is playing in pairs')
  eq(roundPartnership([{ ...fourball, teeTeams: 'separate' }], 'r1', PAIR)?.size, PAIR,
    '  …together, whatever was answered before the teams were made')
  eq(playTogetherQuestion([fourball], 'r1', PAIR), null, '  …and not asked')
  eq(playTogetherQuestion([fourball], 'r1', 3)?.id, 'fb', 'threes are asked')
  eq(roundPartnership([{ ...fourball, teeTeams: 'separate' }], 'r1', 3), null,
    '  …and a three that plays apart is a team, not a partnership')
  ok(!isPairs(tags, PAIR) && !isPairs(solo, PAIR), 'the event\'s tags and individuals are never pairs')

  const wizard = read('app/trip/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wizard.includes('const pairsFirstTime = !live && unitSize === PAIR'),
    'a pairs round\'s first sheet is counted in pairs — two to a tee time, a group of four')
}

// ─── Asking whether they play together ─────────────────────────

section('"Do players play in their teams?" is asked where it can be answered')
{
  eq(playTogetherQuestion([fourball], 'r1')?.id, 'fb', 'asked of a team league of four or fewer')
  eq(playTogetherQuestion([{ ...fourball, teeTeams: 'separate' }], 'r1')?.id, 'fb',
    '  …even once answered no, so the answer can be changed where it was given')
  eq(playTogetherQuestion([pairsDraw], 'r1'), null, 'never of a pair — a pair always plays together')
  eq(playTogetherQuestion([solo, fourball], 'r1'), null, 'never of a board that does not govern the round')
  eq(playTogetherQuestion([tags], 'r1'), null, 'never of the event\'s tags')
  eq(playTogetherQuestion([fourball], 'r1', 5), null, 'never of teams of five or more')
}

section('The answer is stored on the one board it was asked of')
{
  const raw = [
    { id: 'solo', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total', extra: 1 },
    { id: 'fb', audience: 'team', competition: 'league', scoring: 'stableford', combine: 'total', teamFormat: 'better_ball' },
  ]
  const yes = withPlayTogether(raw, 'fb', true) as Record<string, unknown>[]
  eq(yes[1].teeTeams, 'together', 'yes is stored, so the question reads as answered')
  eq(yes[0], raw[0], '  …and every other board is untouched, unknown keys and all')
  eq((withPlayTogether(raw, 'fb', false) as Record<string, unknown>[])[1].teeTeams, 'separate', 'no is stored too')
  eq(withPlayTogether(null, 'fb', true), [], 'nothing stored is nothing to edit')

  const parsed = parseLeaderboards(yes)
  eq(parsed.find(b => b.id === 'fb')?.teeTeams, 'together', 'the board reads the yes back')
  eq(parseLeaderboards(raw).find(b => b.id === 'fb')?.teeTeams, undefined,
    '  …and a board never asked reads back as never asked')
  eq(parseLeaderboards(withPlayTogether(raw, 'fb', false)).find(b => b.id === 'fb')?.teeTeams, 'separate',
    '  …and no as no')
}

// ─── A pair is its players ─────────────────────────────────────

section('A pair reads "Ross & Dave"')
{
  ok(isMadeName('Team A', ['Ross O\'Grady', 'Dave Byrne']), 'a lettered default is nobody\'s name')
  ok(isMadeName('Pair B', []), '  …in any of the defaults')
  ok(isMadeName('Ross & Dave', ['Ross O\'Grady', 'Dave Byrne']), '  …nor is the members\' own names, as a self-made team is called')
  ok(isMadeName('', []), '  …nor nothing at all')
  ok(!isMadeName('The Bandits', ['Ross O\'Grady', 'Dave Byrne']), 'a name somebody chose is a name')

  const field = [
    { id: 'r1', name: 'Ross O\'Grady' }, { id: 'd', name: 'Dave Byrne' },
    { id: 'r2', name: 'Ross O\'Brien' }, { id: 's', name: 'Seán Walsh' },
  ]
  const shortOf = boardNames(field)
  eq(partnershipName({ name: 'Team A' }, [field[1], field[3]], shortOf), 'Dave & Seán', 'an unnamed pair is its players')
  const rosses = partnershipName({ name: 'Team B' }, [field[0], field[1]], shortOf)
  ok(rosses.endsWith('& Dave') && rosses !== 'Ross & Dave',
    '  …with the field\'s usual shortening, so two Rosses in different pairs are still two people')
  eq(partnershipName({ name: 'The Bandits' }, [field[1], field[3]], shortOf), 'The Bandits',
    'a pair somebody named keeps its name')
  eq(partnershipName({ name: 'Team C' }, field, shortOf).split('&').length, 2,
    'four read as their players too, "A, B, C & D"')
  const five = [...field, { id: 'x', name: 'Xavier Kelly' }]
  eq(partnershipName({ name: 'Team D' }, five, boardNames(five)), 'Team D',
    'five are not a partnership — the team keeps its name')
}

// ─── Kept apart from the event's teams ─────────────────────────

section('An event\'s main sheet is its tags\', never a board\'s teams')
{
  eq(nextSheetId([]), MAIN_SET, 'a trip\'s first team board takes the main sheet, as it always has')
  eq(nextSheetId([], { reserveMain: true }), 'set-2',
    'an event\'s goes on a sheet of its own — the main sheet is the event\'s tags')
  eq(nextSheetId([fourball], { reserveMain: true }), 'set-3', '  …and the next after it')

  const form = read('app/components/LeaderboardSetup.tsx')
  ok(form.includes('{ reserveMain: askTeeTeams || askTags }'),
    'the leaderboard form reserves it wherever it is an event\'s form')
}

// ─── Each round, carried over ──────────────────────────────────

section('A round that makes its own partnerships starts from the last round\'s')
{
  const rounds = [{ id: 'r1', roundNumber: 1 }, { id: 'r2', roundNumber: 2 }, { id: 'r3', roundNumber: 3 }]
  const teams = [
    { id: 't1', name: 'Ross & Dave', color: '#123456', team_set: daySheetId('r1') },
    { id: 't2', name: 'Seán & John', color: '#654321', team_set: daySheetId('r1') },
    { id: 't3', name: 'Mary', color: '#111111', team_set: daySheetId('r1') },
    { id: 'tag', name: 'Europe', color: '#0000ff', team_set: MAIN_SET },
  ]
  const ms: Membership[] = [
    { team_id: 't1', team_set: daySheetId('r1'), player_id: 'ross' },
    { team_id: 't1', team_set: daySheetId('r1'), player_id: 'dave' },
    { team_id: 't2', team_set: daySheetId('r1'), player_id: 'sean' },
    { team_id: 't2', team_set: daySheetId('r1'), player_id: 'john' },
    { team_id: 't3', team_set: daySheetId('r1'), player_id: 'mary' },
    { team_id: 'tag', team_set: MAIN_SET, player_id: 'ross' },
  ]
  const sheetOf = (id: string) => daySheetId(id)
  const carry = (roundId: string, memberships = ms) => carriedPartnerships({
    roundId, rounds, sheet: daySheetId(roundId), teams, memberships, sheetOf,
  })

  const two = carry('r2')
  eq(two.map(t => t.name), ['Ross & Dave', 'Seán & John'], 'round two starts from round one\'s pairs')
  eq(two[0].playerIds, ['ross', 'dave'], '  …the same players in each')
  eq(two[0].color, '#123456', '  …in the same colour')
  ok(!two.some(t => t.name === 'Mary'), '  …and a partner left on their own does not carry — one is not a partnership')
  ok(!two.some(t => t.name === 'Europe'), '  …nor do the event\'s tags')
  eq(carry('r3').map(t => t.name), ['Ross & Dave', 'Seán & John'],
    'round three reaches back past a round that made none')
  eq(carry('r1'), [], 'the first round has nothing to start from')

  const started = [...ms, { team_id: 'x', team_set: daySheetId('r2'), player_id: 'ross' }]
  eq(carry('r2', started), [], 'a round that has started making its own is never merged into')
  eq(carriedPartnerships({ roundId: 'r2', rounds, sheet: 'set-2', teams, memberships: ms, sheetOf }), [],
    'partnerships for the whole event are already the same every round — nothing to carry')

  const setup = read('app/trip/[tripCode]/teesheet/[roundId]/setup/page.tsx')
  ok(setup.includes("partnership?.isDay && sheet.state === 'vacant'"),
    'carried when a round\'s sheet is first opened, and only then')
  const wizard = read('app/trip/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wizard.includes('setTeam(tripId, id, carried.sheet'), '  …through the one membership writer')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The tee sheet and its wizard read the one copy')
{
  const page = read('app/trip/[tripCode]/teesheet/page.tsx')
  ok(page.includes('roundPartnership(boards, r.id') && page.includes('partnershipName('),
    'the sheet groups a round by its partnerships, each named as one')
  ok(!page.includes('teamBoardForRound'), '  …and the old take-the-first-team-board lookup is gone')

  const client = read('app/trip/[tripCode]/teesheet/TeeSheetClient.tsx')
  ok(client.includes('const together = !!roundTeamInfo && !roundTeamInfo.isDay'),
    'a partnership is offered as one stuck-together card wherever the round has them')

  const setup = read('app/trip/[tripCode]/teesheet/[roundId]/setup/page.tsx')
  ok(setup.includes('playTogetherQuestion(boards, round.id'), 'the wizard asks the one question')
  const wizard = read('app/trip/[tripCode]/teesheet/[roundId]/setup/TeeSheetWizard.tsx')
  ok(wizard.includes('Do players play in their teams?'), '  …in Ross\'s words')
  ok(wizard.includes('withPlayTogether('), '  …and stores the answer through the one writer')

  const form = read('app/components/LeaderboardSetup.tsx')
  ok(!form.includes('How do teams meet the tee sheet?'),
    'the leaderboard form no longer asks it — it is asked where tee times are set up')
  ok(form.includes("n > MAX_TEAM_SIZE_TOGETHER ? { teeTeams: 'separate' as const }"),
    '  …and a self-picked size over four answers it: five cannot share a tee time')

  const rows = read('lib/boardRows.ts')
  ok(rows.includes('isMadeName(team.name') && rows.includes('joinNames('),
    'the leaderboard names an unnamed partnership by its players, joined with "&"')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
