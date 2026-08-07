/**
 * Leaderboard model tests. Run with: npm run test:leaderboards
 *
 * A trip runs a list of complete competitions rather than one object full of
 * flags. Four things have to hold:
 *
 *   · a board is either fully answered or it does not exist — the scoring
 *     module is handed rules it can trust, never a half-filled object
 *   · the three questions are genuinely independent, so every combination of
 *     them is a board that exists and can be scored
 *   · a trip runs one knockout draw and one of each league, and the form
 *     shows what is already taken rather than letting it be chosen twice
 *   · anything stored that cannot be understood is dropped, not repaired.
 *     A half-understood board would quietly score a trip wrongly.
 */

import {
  type Leaderboard,
  SCORINGS, TEAM_FORMATS, COMBINES, MAX_DISCARD,
  slotKey, isSlotFree, formatKey, isFormatFree, hasMatchplay,
  freeScorings, freeTeamFormats, everyBoard,
  unanswered, isComplete, offersDiscard, needsTeams, needsPairings,
  boardTitle, boardRules, primary, parseLeaderboards,
} from '../lib/leaderboards'
import { DEFAULT_FORMATS, parseFormats, matchplayOn } from '../lib/formats'
import { DEFAULT_TEAM_SCORING } from '../lib/teamScoring'
import { boardsForTrip } from '../lib/leaderboardsCompat'

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

const sf: Leaderboard = { id: 'a', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total', discardWorst: 0 }
const strokes: Leaderboard = { id: 'b', audience: 'individual', competition: 'league', scoring: 'strokes', combine: 'total', discardWorst: 0 }
const prize: Leaderboard = { id: 'p', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'position', customPoints: [10, 5, 1] }
const draw: Leaderboard = { id: 'c', audience: 'individual', competition: 'matchplay' }
const pairsDraw: Leaderboard = { id: 'd', audience: 'team', competition: 'matchplay' }
const teamBB: Leaderboard = { id: 'e', audience: 'team', competition: 'league', scoring: 'stableford', teamFormat: 'better_ball', combine: 'total' }

// ─── A board is complete or it is nothing ──────────────────────

section('The form cannot be left half-answered')
{
  eq(unanswered({}), ['Who is being ranked'], 'nothing chosen asks who is playing')
  eq(unanswered({ audience: 'individual' }), ['League or matchplay'], 'then what they play')

  const solo = { audience: 'individual' as const, competition: 'league' as const }
  eq(unanswered(solo), ['How a round is scored', 'How the rounds add up'],
    'an individual league asks how a round is scored and how the rounds add up')
  eq(unanswered({ ...solo, scoring: 'stableford' as const }), ['How the rounds add up'],
    'the scoring alone is not a competition')
  eq(unanswered({ ...solo, scoring: 'stableford' as const, combine: 'total' as const }), [],
    'both of them is')

  // Paying by position needs to say what a position is worth
  ok(unanswered({ ...solo, scoring: 'stableford' as const, combine: 'position' as const })
    .includes('What each position is worth'), 'a prize table board needs its table')
  eq(unanswered({ ...solo, scoring: 'strokes' as const, combine: 'position' as const, customPoints: [10, 5] }), [],
    'and is finished once it has one — on either scoring')

  // A team league asks the same questions plus one
  const team = { audience: 'team' as const, competition: 'league' as const }
  eq(unanswered(team).length, 3, 'a team league asks one question more')
  eq(unanswered({ ...team, scoring: 'strokes' as const }),
    ['How a team\'s players combine', 'How the rounds add up'],
    'the extra one being how the players in a team combine')
  eq(unanswered({ ...team, scoring: 'strokes' as const, teamFormat: 'hero' as const, combine: 'total' as const }), [],
    'and all three finishes it')

  // A draw has nothing else to decide — it is generated at random
  eq(unanswered({ audience: 'individual', competition: 'matchplay' }), [],
    'a draw is complete as soon as it is chosen')
  eq(unanswered({ audience: 'team', competition: 'matchplay' }), [],
    'and so is a pairs draw')

  ok(isComplete(sf) && isComplete(teamBB) && isComplete(draw) && isComplete(prize),
    'complete boards report as complete')
  ok(!isComplete({ audience: 'team', competition: 'league' }), 'and half-filled ones do not')
}

// ─── The three questions are independent ───────────────────────

section('Every combination of the three answers is a real board')
{
  const grid = everyBoard()

  // 2 scorings × 2 combines for individuals; the same again per team format
  eq(grid.filter(b => b.audience === 'individual').length,
    SCORINGS.length * COMBINES.length, 'every individual cell exists')
  eq(grid.filter(b => b.audience === 'team').length,
    SCORINGS.length * TEAM_FORMATS.length * COMBINES.length, 'and every team cell')

  // The grid is the shape of every competition. A prize table is a value the
  // organiser fills in, not part of which competition this is — so a cell is
  // complete once it has one, and the ones that do not pay by position are
  // complete as they stand.
  ok(grid.every(b => isComplete(b.combine === 'position' ? { ...b, customPoints: [1] } : b)),
    'and every one of them is a complete, scoreable board')
  ok(grid.filter(b => b.combine !== 'position').every(isComplete),
    'with no outstanding question beyond what a position pays')
  eq(new Set(grid.map(slotKey)).size, grid.length, 'with no two cells the same competition')

  // The point of the grid: no answer silently rules another one out
  for (const scoring of SCORINGS.map(s => s.key)) {
    for (const combine of COMBINES.map(c => c.key)) {
      ok(grid.some(b => b.audience === 'individual' && b.scoring === scoring && b.combine === combine),
        `individual ${scoring} ${combine === 'position' ? 'paid by position' : 'added up'} is available`)
    }
  }
  for (const format of TEAM_FORMATS.map(f => f.key)) {
    ok(grid.some(b => b.teamFormat === format && b.scoring === 'strokes'),
      `${format} can be played on strokes, not only Stableford`)
  }
}

section('Dropping a round is asked of every league board')
{
  ok(offersDiscard({ audience: 'individual', competition: 'league', scoring: 'stableford' }),
    'stableford can drop a round')
  ok(offersDiscard({ audience: 'individual', competition: 'league', scoring: 'strokes' }),
    'so can strokes')
  ok(offersDiscard({ audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'position' }),
    'and so can a prize-table board — a bad day stops counting either way')
  ok(offersDiscard({ audience: 'team', competition: 'league', scoring: 'stableford', teamFormat: 'hero' }),
    'a team league too')
  ok(!offersDiscard({ audience: 'individual', competition: 'matchplay' }),
    'but not a draw, which has no rounds to drop')
  eq(MAX_DISCARD, 2, 'at most two rounds can be dropped')
}

// ─── What can still be added ───────────────────────────────────

section('One draw, and one of each league')
{
  eq(slotKey(draw), 'matchplay', 'a draw is a draw')
  eq(slotKey(pairsDraw), 'matchplay', 'whoever it is between — there is only one')
  ok(slotKey(sf) !== slotKey(strokes), 'stableford and strokes are two different boards')
  ok(slotKey(sf) !== slotKey(prize),
    'and so are the same scoring totalled and paid by position — an order of merit is not a daily prize')
  ok(slotKey(teamBB) !== slotKey(sf), 'a team league is different again')

  ok(hasMatchplay([draw]), 'a trip with a draw has one')
  ok(!isSlotFree([draw], pairsDraw), 'so a second draw is refused, even a pairs one')
  ok(isSlotFree([draw], sf), 'while a league is still free')
  ok(!isSlotFree([sf], sf), 'and a league already running is not')
  ok(isSlotFree([sf], prize), 'the same scoring paid differently is still free')
}

section('The cascade offers what is left')
{
  eq(freeScorings([], 'individual'), ['stableford', 'strokes'], 'a new trip can pick either scoring')
  ok(freeScorings([sf], 'individual').includes('stableford'),
    'a scoring stays on offer while any way of adding it up is still free')
  eq(freeScorings([sf, prize], 'individual'), ['strokes'],
    'and drops out only once every board using it is running')

  eq(freeTeamFormats([]).length, TEAM_FORMATS.length, 'every team format is available at first')
  ok(freeTeamFormats([teamBB], 'stableford').includes('better_ball'),
    'better ball on stableford is still free — the prize-table version is untouched')
  ok(freeTeamFormats([teamBB], 'strokes').includes('better_ball'),
    'and on strokes it is a different board entirely')

  // Every league board on the main sheet, plus the one draw. That is the
  // whole grid, and once it is running there is nothing left to add.
  const everything = [...everyBoard(), draw]
  ok(everything.every(b => !isSlotFree(everything, b)),
    'a full grid has no free cell left in it')
  ok(TEAM_FORMATS.every(f => !isFormatFree(everything, {
    audience: 'team', competition: 'league', scoring: 'stableford',
    teamFormat: f.key, combine: 'total', teamSet: 'set-2',
  })), 'and naming a different sheet does not reopen one — the tab would read the same')
}

section('The form asks about the format, not about which teams play it')
{
  // Which teams a board is played by is settled afterwards, on the team
  // screen, so the form cannot tell two boards apart by their sheet while
  // they are being made — and a second "Team better ball" would print the
  // same table under the same tab.
  const onMain = { ...teamBB, teamSet: 'main' }
  const onTwo  = { ...teamBB, teamSet: 'set-2' }

  ok(slotKey(onMain) !== slotKey(onTwo), 'two sheets are still two competitions to score')
  eq(formatKey(onMain), formatKey(onTwo), 'but one format to choose')
  ok(isSlotFree([onMain], onTwo), 'so the slot is free')
  ok(!isFormatFree([onMain], onTwo), 'while the format is not')

  ok(isFormatFree([sf], prize), 'the same scoring paid differently is a different format')
  ok(isFormatFree([sf], teamBB), 'and a team league is different again')
  ok(!isFormatFree([draw], { ...pairsDraw, teamSet: 'set-2' }),
    'one draw per trip, whichever teams it is between')
}

// ─── What a board implies for the rest of the trip ─────────────

section('What the trip has to have set up')
{
  ok(!needsTeams([sf, draw]), 'individual boards need no teams')
  ok(needsTeams([sf, teamBB]), 'a team league does')
  ok(needsTeams([pairsDraw]), 'and so does a pairs draw')

  ok(!needsPairings([teamBB]), 'a team league can have teams of any size')
  ok(needsPairings([pairsDraw]), 'but a pairs draw fixes them at two')
  ok(needsPairings([sf, teamBB, pairsDraw]), 'and one such board is enough to fix them')
}

// ─── How a board reads ─────────────────────────────────────────

section('Boards are titled the way people would say them')
{
  eq(boardTitle(sf), 'Stableford Points', 'an individual board is named by its scoring')
  eq(boardTitle(strokes), 'Strokes', 'either scoring')
  eq(boardTitle(teamBB), 'Team better ball', 'a team board says team and its format')
  eq(boardTitle(draw), 'Matchplay', 'a singles draw is just matchplay')
  eq(boardTitle(pairsDraw), 'Pairs matchplay', 'and a pairs draw says so')

  ok(boardRules(sf).length > 0, 'every board states how it is scored')
  ok(boardRules(sf).includes('running total'), 'and how the rounds add up')
  ok(boardRules(prize).includes('winning a round is worth'), 'a prize board says it pays by position')
  ok(boardRules({ ...sf, discardWorst: 1 }).includes('Worst round dropped'),
    'including its discard rule')
  ok(boardRules({ ...sf, discardWorst: 2 }).includes('2 rounds'), 'in the plural where it is plural')
  ok(boardRules(pairsDraw).includes('pairings'), 'a pairs draw says who it is between')
  ok(boardRules(teamBB).includes('best score on every hole'), 'a team board names its format')

  eq(primary([teamBB, sf])?.id, teamBB.id, 'the first board made is the primary')
  eq(primary([]), null, 'and an empty trip has none')
}

// ─── Reading what is stored ────────────────────────────────────

section('Stored boards read back, and nonsense does not')
{
  eq(parseLeaderboards([sf, teamBB]).length, 2, 'a good list reads back whole')
  eq(parseLeaderboards([sf])[0].scoring, 'stableford', 'with its settings')
  eq(parseLeaderboards([prize])[0].customPoints, [10, 5, 1], 'including its prize table')

  eq(parseLeaderboards(null), [], 'null is no boards')
  eq(parseLeaderboards({}), [], 'and neither is an object — this is a list')
  eq(parseLeaderboards([]), [], 'an empty list is empty')

  // A board that cannot be understood is dropped rather than guessed at
  eq(parseLeaderboards([{ audience: 'individual', competition: 'league' }]), [],
    'an individual league with no scoring is not a board')
  eq(parseLeaderboards([{ audience: 'team', competition: 'league', scoring: 'stableford' }]), [],
    'nor a team league with no format')
  eq(parseLeaderboards([{ audience: 'nobody', competition: 'league', scoring: 'stableford' }]), [],
    'nor one nobody is playing')
  eq(parseLeaderboards([{ audience: 'individual', competition: 'bingo' }]), [],
    'nor a competition that does not exist')
  eq(parseLeaderboards(['nonsense', 42, null]), [], 'and junk entries are skipped')

  // The uniqueness rules hold on read too, not only in the form
  eq(parseLeaderboards([draw, pairsDraw]).length, 1, 'a second draw is dropped on read')
  eq(parseLeaderboards([sf, { ...sf, id: 'dup' }]).length, 1, 'and so is a duplicated league')
  eq(parseLeaderboards([sf, prize]).length, 2,
    'but the same scoring paid by position is a second board, not a duplicate')

  // Stored values are clamped rather than trusted
  const junk = parseLeaderboards([
    { audience: 'individual', competition: 'league', scoring: 'stableford', discardWorst: 99 },
  ])
  eq(junk[0].discardWorst, MAX_DISCARD, 'a silly discard is clamped')
  const table = parseLeaderboards([
    { audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'position', customPoints: [999, -4, 'x'] },
  ])
  eq(table[0].customPoints, [100, 0, 0], 'and a silly prize table too')

  // Order is the trip's own: the first is the primary
  const ordered = parseLeaderboards([teamBB, sf])
  eq(ordered[0].audience, 'team', 'the stored order is kept, because the first one leads')

  eq(COMBINES.length, 2, 'rounds are put together one of two ways')
}

section('The first shape of this model still reads back')
{
  // "Custom points" was written as a third way of scoring a round. It never
  // was one — it is Stableford, paid out by position — so it reads back as
  // what it always described rather than being dropped.
  const old = parseLeaderboards([
    { id: 'x', audience: 'individual', competition: 'league', scoring: 'custom', customPoints: [10, 5] },
  ])
  eq(old.length, 1, 'a board stored as "custom" scoring is still a board')
  eq(old[0].scoring, 'stableford', 'scored on stableford, which is what it always was')
  eq(old[0].combine, 'position', 'and paid by position, which is what "custom" meant')
  eq(old[0].customPoints, [10, 5], 'keeping its table')

  // Teams asked the same question under a different name
  const oldTeam = parseLeaderboards([
    { id: 'y', audience: 'team', competition: 'league', teamFormat: 'hero', aggregation: 'custom_points', customPoints: [10, 3] },
  ])
  eq(oldTeam[0].combine, 'position', 'a team board stored with an aggregation reads as its combine')
  eq(oldTeam[0].scoring, 'stableford', 'on stableford, the only scoring that model had')

  const oldCumulative = parseLeaderboards([
    { id: 'z', audience: 'team', competition: 'league', teamFormat: 'hero', aggregation: 'cumulative' },
  ])
  eq(oldCumulative[0].combine, 'total', 'and a cumulative one reads as a total')
}

section('A trip row is read the same way by every page that asks')
{
  // The regression: /matchplay, /teams and the trip hub each asked
  // `trips.formats` whether the trip ran a knockout. Nothing writes that
  // column any more, so a trip whose primary leaderboard IS a knockout came
  // back as "matchplay isn't switched on" — with a button back to the settings
  // screen that had just switched it on. Around and around.
  const newTrip = {
    formats: DEFAULT_FORMATS,
    leaderboards: [
      { id: 'x', audience: 'team', competition: 'matchplay' },
    ],
    team_scoring: DEFAULT_TEAM_SCORING,
  }
  ok(!matchplayOn(parseFormats(newTrip.formats)),
    'the old flags say this trip runs no knockout')
  ok(hasMatchplay(boardsForTrip(newTrip)),
    'and the boards say it runs one — the boards are right')
  ok(needsPairings(boardsForTrip(newTrip)),
    'between pairings, so the teams screen has to lock them at two')

  // An old trip still reads as itself through the same door
  const oldTrip = {
    formats: parseFormats({ teams: true, matchplay: { on: true, format: 'pairs' } }),
    leaderboards: [],
    team_scoring: DEFAULT_TEAM_SCORING,
  }
  ok(hasMatchplay(boardsForTrip(oldTrip)), 'a pre-migration draw is still a draw')
  ok(needsPairings(boardsForTrip(oldTrip)), 'and still between pairings')

  // A trip playing for nothing at all claims no knockout
  ok(!hasMatchplay(boardsForTrip({
    formats: DEFAULT_FORMATS, leaderboards: [], team_scoring: DEFAULT_TEAM_SCORING,
  })), 'and a trip with nothing chosen runs nothing')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
