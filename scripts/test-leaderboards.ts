/**
 * Leaderboard model tests. Run with: npm run test:leaderboards
 *
 * A trip runs a list of complete competitions rather than one object full of
 * flags. Three things have to hold:
 *
 *   · a board is either fully answered or it does not exist — the scoring
 *     module is handed rules it can trust, never a half-filled object
 *   · a trip runs one knockout draw and one of each league, and the form
 *     shows what is already taken rather than letting it be chosen twice
 *   · anything stored that cannot be understood is dropped, not repaired.
 *     A half-understood board would quietly score a trip wrongly.
 */

import {
  type Leaderboard,
  SCORINGS, TEAM_FORMATS, AGGREGATIONS, MAX_DISCARD,
  slotKey, isSlotFree, hasMatchplay, freeScorings, freeTeamFormats, canAddMore,
  unanswered, isComplete, offersDiscard, needsTeams, needsPairings,
  boardTitle, boardRules, primary, parseLeaderboards,
} from '../lib/leaderboards'

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

const sf: Leaderboard = { id: 'a', audience: 'individual', competition: 'league', scoring: 'stableford', discardWorst: 0 }
const strokes: Leaderboard = { id: 'b', audience: 'individual', competition: 'league', scoring: 'strokes', discardWorst: 0 }
const draw: Leaderboard = { id: 'c', audience: 'individual', competition: 'matchplay' }
const pairsDraw: Leaderboard = { id: 'd', audience: 'team', competition: 'matchplay' }
const teamBB: Leaderboard = { id: 'e', audience: 'team', competition: 'league', teamFormat: 'better_ball', aggregation: 'cumulative' }

// ─── A board is complete or it is nothing ──────────────────────

section('The form cannot be left half-answered')
{
  eq(unanswered({}), ['Who is being ranked'], 'nothing chosen asks who is playing')
  eq(unanswered({ audience: 'individual' }), ['League or matchplay'], 'then what they play')

  ok(unanswered({ audience: 'individual', competition: 'league' }).includes('How it is scored'),
    'an individual league needs a scoring')
  eq(unanswered({ audience: 'individual', competition: 'league', scoring: 'stableford' }), [],
    'and with one it is finished')

  // Custom pays by position, so the table is part of the answer
  ok(unanswered({ audience: 'individual', competition: 'league', scoring: 'custom' })
    .includes('What each position is worth'), 'custom points needs its table')
  eq(unanswered({ audience: 'individual', competition: 'league', scoring: 'custom', customPoints: [10, 5] }), [],
    'and is finished once it has one')

  // A team league has two more questions
  const teamPartial = { audience: 'team' as const, competition: 'league' as const }
  eq(unanswered(teamPartial).length, 2, 'a team league asks about format and aggregation')
  eq(unanswered({ ...teamPartial, teamFormat: 'hero' as const }), ['How rounds are added up'],
    'the format alone is not enough')
  eq(unanswered({ ...teamPartial, teamFormat: 'hero' as const, aggregation: 'cumulative' as const }), [],
    'both of them is')
  ok(unanswered({ ...teamPartial, teamFormat: 'hero' as const, aggregation: 'custom_points' as const })
    .includes('What each position is worth'), 'unless it pays by position, which needs a table')

  // A draw has nothing else to decide — it is generated at random
  eq(unanswered({ audience: 'individual', competition: 'matchplay' }), [],
    'a draw is complete as soon as it is chosen')
  eq(unanswered({ audience: 'team', competition: 'matchplay' }), [],
    'and so is a pairs draw')

  ok(isComplete(sf) && isComplete(teamBB) && isComplete(draw), 'complete boards report as complete')
  ok(!isComplete({ audience: 'team', competition: 'league' }), 'and half-filled ones do not')
}

section('The discard question is only asked where it means something')
{
  ok(offersDiscard({ audience: 'individual', competition: 'league', scoring: 'stableford' }),
    'stableford can drop a round')
  ok(offersDiscard({ audience: 'individual', competition: 'league', scoring: 'strokes' }),
    'so can strokes')
  ok(!offersDiscard({ audience: 'individual', competition: 'league', scoring: 'custom' }),
    'but custom pays by position — dropping a round there is a different idea')
  ok(!offersDiscard({ audience: 'team', competition: 'league', teamFormat: 'hero' }),
    'and it is not asked of a team league at all')
  ok(!offersDiscard({ audience: 'individual', competition: 'matchplay' }),
    'nor of a draw')
  eq(MAX_DISCARD, 2, 'at most two rounds can be dropped')
}

// ─── What can still be added ───────────────────────────────────

section('One draw, and one of each league')
{
  eq(slotKey(draw), 'matchplay', 'a draw is a draw')
  eq(slotKey(pairsDraw), 'matchplay', 'whoever it is between — there is only one')
  ok(slotKey(sf) !== slotKey(strokes), 'but stableford and strokes are two different boards')
  ok(slotKey(teamBB) !== slotKey(sf), 'and a team league is different again')

  ok(hasMatchplay([draw]), 'a trip with a draw has one')
  ok(!isSlotFree([draw], pairsDraw), 'so a second draw is refused, even a pairs one')
  ok(isSlotFree([draw], sf), 'while a league is still free')
  ok(!isSlotFree([sf], sf), 'and a league already running is not')
}

section('The cascade offers what is left')
{
  eq(freeScorings([]), ['stableford', 'strokes', 'custom'], 'a new trip can pick any scoring')
  eq(freeScorings([sf]), ['strokes', 'custom'], 'and one already running drops out')
  eq(freeScorings([sf, strokes]), ['custom'], 'and another')

  eq(freeTeamFormats([]).length, TEAM_FORMATS.length, 'every team format is available at first')
  eq(freeTeamFormats([teamBB]), ['hero', 'cut_dead_weight'], 'minus the one in use')

  ok(canAddMore([]), 'there is always something to add to an empty trip')
  ok(canAddMore([sf]), 'and plenty after one board')

  // Everything running at once: three scorings, three team formats, one draw
  const everything: Leaderboard[] = [
    ...SCORINGS.map((s, i) => ({ id: `s${i}`, audience: 'individual' as const, competition: 'league' as const, scoring: s.key })),
    ...TEAM_FORMATS.map((f, i) => ({ id: `t${i}`, audience: 'team' as const, competition: 'league' as const, teamFormat: f.key, aggregation: 'cumulative' as const })),
    draw,
  ]
  ok(!canAddMore(everything), 'until there is genuinely nothing left')
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
  eq(boardTitle(sf), 'Stableford', 'an individual board is named by its scoring')
  eq(boardTitle(teamBB), 'Team better ball', 'a team board says team and its format')
  eq(boardTitle(draw), 'Matchplay', 'a singles draw is just matchplay')
  eq(boardTitle(pairsDraw), 'Pairs matchplay', 'and a pairs draw says so')

  ok(boardRules(sf).length > 0, 'every board states how it is scored')
  ok(boardRules({ ...sf, discardWorst: 1 }).includes('Worst round dropped'),
    'including its discard rule')
  ok(boardRules({ ...sf, discardWorst: 2 }).includes('2 rounds'), 'in the plural where it is plural')
  ok(boardRules(pairsDraw).includes('pairings'), 'a pairs draw says who it is between')
  ok(boardRules(teamBB).includes('running total'), 'and a cumulative team board says so')

  eq(primary([teamBB, sf])?.id, teamBB.id, 'the first board made is the primary')
  eq(primary([]), null, 'and an empty trip has none')
}

// ─── Reading what is stored ────────────────────────────────────

section('Stored boards read back, and nonsense does not')
{
  eq(parseLeaderboards([sf, teamBB]).length, 2, 'a good list reads back whole')
  eq(parseLeaderboards([sf])[0].scoring, 'stableford', 'with its settings')

  eq(parseLeaderboards(null), [], 'null is no boards')
  eq(parseLeaderboards({}), [], 'and neither is an object — this is a list')
  eq(parseLeaderboards([]), [], 'an empty list is empty')

  // A board that cannot be understood is dropped rather than guessed at
  eq(parseLeaderboards([{ audience: 'individual', competition: 'league' }]), [],
    'an individual league with no scoring is not a board')
  eq(parseLeaderboards([{ audience: 'team', competition: 'league', teamFormat: 'better_ball' }]), [],
    'nor a team league with no aggregation')
  eq(parseLeaderboards([{ audience: 'nobody', competition: 'league', scoring: 'stableford' }]), [],
    'nor one nobody is playing')
  eq(parseLeaderboards([{ audience: 'individual', competition: 'bingo' }]), [],
    'nor a competition that does not exist')
  eq(parseLeaderboards(['nonsense', 42, null]), [], 'and junk entries are skipped')

  // The uniqueness rules hold on read too, not only in the form
  eq(parseLeaderboards([draw, pairsDraw]).length, 1, 'a second draw is dropped on read')
  eq(parseLeaderboards([sf, { ...sf, id: 'dup' }]).length, 1, 'and so is a duplicated league')

  // Stored values are clamped rather than trusted
  const junk = parseLeaderboards([
    { audience: 'individual', competition: 'league', scoring: 'stableford', discardWorst: 99 },
  ])
  eq(junk[0].discardWorst, MAX_DISCARD, 'a silly discard is clamped')
  const table = parseLeaderboards([
    { audience: 'individual', competition: 'league', scoring: 'custom', customPoints: [999, -4, 'x'] },
  ])
  eq(table[0].customPoints, [100, 0, 0], 'and a silly prize table too')

  // Order is the trip's own: the first is the primary
  const ordered = parseLeaderboards([teamBB, sf])
  eq(ordered[0].audience, 'team', 'the stored order is kept, because the first one leads')

  eq(AGGREGATIONS.length, 2, 'a team league is added up one of two ways')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
