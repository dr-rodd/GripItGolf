/**
 * Decision-tree and team-limit tests. Run with: npm run test:setup-flow
 *
 * Trip settings are a form the organiser fills in top to bottom, and the tree
 * decides what appears as they go. Two things have to hold:
 *
 *   · a question never appears before the answer that opens it, and never
 *     lingers after that answer is taken away
 *   · a pairs draw really does lock teams at two, everywhere it matters
 *
 * The second one has teeth: a pairing of three is not something the bracket
 * can represent, so it has to be refused at the point of entry rather than
 * discovered when the draw is made.
 */

import { type TripFormats } from '../lib/formats'
import { DEFAULT_TEAM_SCORING, type TeamScoring } from '../lib/teamScoring'
import {
  setupSteps, nextUnanswered, flowComplete, flowWarnings, finaliseBlockedReason,
  emptyFormatsReason, type StepKey,
} from '../lib/tripSetupFlow'
import {
  PAIR_SIZE, teamNoun, teamSizeLimit, teamSizeBanner, teamCountOptions,
  oversizedTeams, canJoinTeam, pairsBlockedReason,
} from '../lib/teamLimits'

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

function fmt(patch: {
  individual?: boolean
  teams?: boolean
  league?: Partial<TripFormats['league']>
  matchplay?: Partial<TripFormats['matchplay']>
} = {}): TripFormats {
  return {
    individual: patch.individual ?? false,
    teams: patch.teams ?? false,
    league: { on: false, stableford: false, strokes: false, custom: false,
              customPoints: [], discardWorst: 0, ...patch.league },
    matchplay: { on: false, format: 'singles', ...patch.matchplay },
  }
}

const team = (id: string, name = id.toUpperCase()) => ({ id, name })
const player = (id: string, teamId: string | null = null) => ({ id, team_id: teamId })

function ctx(opts: {
  players?: { id: string; team_id: string | null }[]
  teams?: { id: string; name: string }[]
  teamScoring?: TeamScoring
  customTableLength?: number
} = {}) {
  return {
    players: opts.players ?? [],
    teams: opts.teams ?? [],
    teamScoring: opts.teamScoring ?? DEFAULT_TEAM_SCORING,
    customTableLength: opts.customTableLength ?? 0,
  }
}

const keys = (f: TripFormats, c = ctx()): StepKey[] => setupSteps(f, c).map(s => s.key)
const step = (f: TripFormats, key: StepKey, c = ctx()) =>
  setupSteps(f, c).find(s => s.key === key)

// ─── The tree opens as it is answered ──────────────────────────

section('Questions appear as they are opened')
{
  // Nothing answered: only the first question exists
  eq(keys(fmt()), ['competitors'],
    'an untouched trip asks who competes and nothing else')

  // Answering it opens the second, and no more
  eq(keys(fmt({ individual: true })), ['competitors', 'competition'],
    'picking competitors opens the competition question')

  // The tree stops at the first unanswered question rather than showing
  // everything greyed out — a question you cannot answer yet is not a question
  const halfway = setupSteps(fmt({ individual: true }), ctx())
  eq(halfway.length, 2, 'and stops there')
  eq(nextUnanswered(halfway)?.key, 'competition', 'with the competition question outstanding')
  ok(!flowComplete(halfway), 'so the tree is not complete')
}

section('League answers open league questions')
{
  const league = fmt({ individual: true, league: { on: true } })
  eq(keys(league), ['competitors', 'competition', 'boards'],
    'switching the league on asks how it is scored')
  ok(!step(league, 'boards')!.answered, 'and no board is picked yet')

  // Stableford and Strokes are stroke-based, so the discard question follows
  const sf = fmt({ individual: true, league: { on: true, stableford: true } })
  ok(keys(sf).includes('discard'), 'a stableford board opens the discard question')

  const st = fmt({ individual: true, league: { on: true, strokes: true } })
  ok(keys(st).includes('discard'), 'so does a strokes board')

  // Custom is a prize table, not a card, so dropping a round is not asked
  const custom = fmt({ individual: true, league: { on: true, custom: true } })
  ok(!keys(custom).includes('discard'), 'custom points alone does not open it')
  ok(keys(custom).includes('customPoints'), 'it opens the prize table instead')

  // Both together: both questions
  const both = fmt({ individual: true, league: { on: true, stableford: true, custom: true } })
  ok(keys(both).includes('discard') && keys(both).includes('customPoints'),
    'and both boards open both')

  // The table cannot be filled in before there is a field to build it from
  eq(step(custom, 'customPoints')!.answered, false, 'with no players the table is unanswered')
  ok(step(custom, 'customPoints')!.warning?.includes('Add players') === true, 'and says why')
  const withField = step(custom, 'customPoints', ctx({
    players: [player('a'), player('b')], customTableLength: 2,
  }))
  ok(withField!.answered, 'once there are players it is answered')
  ok(withField!.summary?.includes('2 positions') === true, 'and reads the table back')
}

section('Team answers open team questions')
{
  const teamLeague = fmt({ teams: true, league: { on: true, stableford: true } })
  ok(keys(teamLeague).includes('teamScoring'),
    'a team league asks how team points are worked out')
  ok(keys(teamLeague).includes('teams'), 'and asks who is in which team')

  // No league means no team-scoring question — there is nothing to score
  const teamDraw = fmt({ teams: true, matchplay: { on: true, format: 'pairs' } })
  ok(!keys(teamDraw).includes('teamScoring'),
    'a pairs draw with no league does not ask how team points are worked out')
  ok(keys(teamDraw).includes('teams'), 'but still asks for the pairings')

  // Individuals only: neither
  const solo = fmt({ individual: true, league: { on: true, stableford: true } })
  ok(!keys(solo).includes('teamScoring'), 'an individual trip is not asked about team scoring')
  ok(!keys(solo).includes('teams'), 'nor about teams')

  // Team scoring reads back whatever mode is set
  const hero = step(teamLeague, 'teamScoring', ctx({
    teamScoring: { ...DEFAULT_TEAM_SCORING, mode: 'hero' },
  }))
  ok(hero!.summary?.includes('Best single card') === true, 'the chosen mode is read back')
}

section('The matchplay format question')
{
  // Without teams there is nothing to pair, so the question is not asked
  const solo = fmt({ individual: true, matchplay: { on: true } })
  ok(keys(solo).includes('matchplayFormat'), 'the format step still appears')
  ok(step(solo, 'matchplayFormat')!.summary?.includes('Singles') === true,
    'and states it is singles')

  const paired = fmt({ teams: true, matchplay: { on: true, format: 'pairs' } })
  ok(step(paired, 'matchplayFormat')!.summary?.includes('Pairs') === true, 'pairs is read back as pairs')

  // Choosing pairs then removing teams leaves an answer that cannot be honoured
  const orphan = fmt({ individual: true, matchplay: { on: true, format: 'pairs' } })
  ok(step(orphan, 'matchplayFormat')!.warning?.includes('Pairs needs teams') === true,
    'a pairs answer without teams is flagged rather than silently ignored')
}

section('Taking an answer away closes what it opened')
{
  const full = fmt({
    individual: true, teams: true,
    league: { on: true, stableford: true, custom: true },
    matchplay: { on: true, format: 'pairs' },
  })
  const all = keys(full)
  ok(all.includes('discard') && all.includes('customPoints') &&
     all.includes('matchplayFormat') && all.includes('teamScoring') && all.includes('teams'),
    'everything is open when everything is on')

  // Switch the league off: its three questions go, the draw's stay
  const noLeague = { ...full, league: { ...full.league, on: false } }
  const after = keys(noLeague)
  ok(!after.includes('boards') && !after.includes('discard') && !after.includes('customPoints'),
    'switching the league off closes its questions')
  ok(!after.includes('teamScoring'), 'and there is no longer anything to score teams on')
  ok(after.includes('matchplayFormat'), 'the draw is untouched')
  ok(after.includes('teams'), 'and the pairings are still needed')

  // Switch competitors off entirely: everything below closes
  eq(keys({ ...full, individual: false, teams: false }), ['competitors'],
    'with nobody competing the tree is one question again')

  // Teams picked but no competition chosen yet: asking who is in which team
  // before knowing what they are playing puts the questions out of order
  eq(keys(fmt({ teams: true })), ['competitors', 'competition'],
    'teams alone does not jump ahead to picking them')
}

// ─── Team limits ───────────────────────────────────────────────

section('A pairs draw locks teams at two')
{
  const pairs  = fmt({ teams: true, matchplay: { on: true, format: 'pairs' } })
  const league = fmt({ teams: true, league: { on: true, stableford: true } })

  // Literal 2, not PAIR_SIZE: the constant moving is exactly the regression
  // this is here to catch. A pairing is two players, by definition.
  eq(PAIR_SIZE, 2, 'a pairing is two players')
  eq(teamSizeLimit(pairs), 2, 'a pairs draw caps a team at two')
  eq(teamSizeLimit(league), null, 'a team league caps nothing')
  ok(teamSizeBanner(pairs)?.includes('Max 2') === true, 'and the cap is announced')
  eq(teamSizeBanner(league), null, 'with no banner when there is no cap')

  // "Team matchplay should refer to teams as pairings"
  eq(teamNoun(pairs).one, 'pairing', 'teams are pairings in a pairs draw')
  eq(teamNoun(pairs).Many, 'Pairings', 'capitalised too')
  eq(teamNoun(league).one, 'team', 'and plain teams otherwise')

  // The number of pairings is not a choice — everybody pairs up
  eq(teamCountOptions(pairs, 8), [4], 'eight players make four pairings')
  eq(teamCountOptions(pairs, 7), [4], 'seven still make four — nobody is dropped')
  eq(teamCountOptions(league, 8), [2, 3, 4, 5, 6, 8], 'a league picks from the usual counts')
}

section('An over-full pairing is refused, not saved')
{
  const pairs = fmt({ teams: true, matchplay: { on: true, format: 'pairs' } })
  const teams = [team('t1'), team('t2')]

  const one  = [player('a', 't1')]
  ok(canJoinTeam(pairs, 't1', one), 'a second player can join a pairing of one')

  const full = [player('a', 't1'), player('b', 't1')]
  ok(!canJoinTeam(pairs, 't1', full), 'a third player cannot join a full pairing')
  ok(canJoinTeam(pairs, 't2', full), 'but can join an empty one')

  // Without a cap there is no such thing as full
  const league = fmt({ teams: true, league: { on: true, stableford: true } })
  ok(canJoinTeam(league, 't1', full), 'a team league takes as many as you like')

  // Existing over-full teams are reported rather than quietly tolerated
  const over = [player('a', 't1'), player('b', 't1'), player('c', 't1')]
  eq(oversizedTeams(pairs, teams, over).map(o => o.teamId), ['t1'],
    'a pairing of three is flagged')
  // Read defensively: if the limit ever stops being two, a pairing of three
  // is no longer oversized and this list is empty. That must read as a
  // failure, not crash the run on an undefined index.
  const flagged = oversizedTeams(pairs, teams, over)[0] ?? null
  eq(flagged?.size ?? null, 3, 'with its actual size')
  eq(flagged?.limit ?? null, 2, 'against a limit of two')
  eq(oversizedTeams(pairs, teams, full), [], 'and a pairing of exactly two is fine')
  eq(oversizedTeams(league, teams, over), [], 'and nothing is flagged without a cap')
}

section('A pairs draw will not be drawn from a broken sheet')
{
  const pairs = fmt({ teams: true, matchplay: { on: true, format: 'pairs' } })
  const teams = [team('t1', 'Alpha'), team('t2', 'Bravo')]

  ok(pairsBlockedReason(pairs, [], [])?.includes('Pick the pairings') === true,
    'no pairings at all is blocked')

  const short = [player('a', 't1'), player('b', 't1'), player('c', 't2')]
  ok(pairsBlockedReason(pairs, teams, short)?.includes('Bravo') === true,
    'a pairing short of a player is blocked, by name')

  const over = [player('a', 't1'), player('b', 't1'), player('c', 't1'),
                player('d', 't2'), player('e', 't2')]
  ok(pairsBlockedReason(pairs, teams, over)?.includes('Alpha') === true,
    'an over-full pairing is blocked, by name')

  const loose = [player('a', 't1'), player('b', 't1'),
                 player('c', 't2'), player('d', 't2'), player('e', null)]
  ok(pairsBlockedReason(pairs, teams, loose)?.includes('no pairing') === true,
    'a player left out is blocked')

  const good = [player('a', 't1'), player('b', 't1'), player('c', 't2'), player('d', 't2')]
  eq(pairsBlockedReason(pairs, teams, good), null, 'two full pairings is fine')

  // A team league has none of these constraints
  const league = fmt({ teams: true, league: { on: true, stableford: true } })
  eq(pairsBlockedReason(league, teams, short), null, 'and a team league is never blocked by size')
}

// ─── Going live ────────────────────────────────────────────────

section('What stops a trip going live')
{
  ok(finaliseBlockedReason(fmt(), ctx())?.includes('who is competing') === true,
    'nobody competing blocks it')
  ok(finaliseBlockedReason(fmt({ individual: true }), ctx())?.includes('a competition') === true,
    'no competition blocks it')
  ok(finaliseBlockedReason(fmt({ individual: true, league: { on: true } }), ctx())
     ?.includes('how the league is scored') === true,
    'a league with no board blocks it')

  const ready = fmt({ individual: true, league: { on: true, stableford: true } })
  eq(finaliseBlockedReason(ready, ctx()), null, 'a scored individual league is ready')

  // A half-filled team sheet is the organiser's business in a league…
  const teamLeague = fmt({ teams: true, league: { on: true, stableford: true } })
  eq(finaliseBlockedReason(teamLeague, ctx({
    teams: [team('t1')], players: [player('a', 't1'), player('b', null)],
  })), null, 'an unassigned player does not block a team league')

  // …but not in a pairs draw, where the bracket cannot be built from it
  const pairs = fmt({ teams: true, matchplay: { on: true, format: 'pairs' } })
  ok(finaliseBlockedReason(pairs, ctx({
    teams: [team('t1')], players: [player('a', 't1'), player('b', null)],
  })) !== null, 'but it does block a pairs draw')

  eq(finaliseBlockedReason(pairs, ctx({
    teams: [team('t1'), team('t2')],
    players: [player('a', 't1'), player('b', 't1'), player('c', 't2'), player('d', 't2')],
  })), null, 'a complete pairing sheet is ready')
}

section('Warnings are collected in the order they are asked')
{
  const messy = fmt({ individual: true, teams: true, league: { on: true } })
  const warned = flowWarnings(setupSteps(messy, ctx()))
  ok(warned.length > 0, 'a half-answered trip has warnings')
  eq(warned[0].step.key, 'boards', 'and the first one is the first unanswered question')

  const clean = fmt({ individual: true, league: { on: true, stableford: true } })
  eq(flowWarnings(setupSteps(clean, ctx())), [], 'a clean trip has none')
  ok(flowComplete(setupSteps(clean, ctx())), 'and its tree is complete')
}

section('Every visible step is numbered from one, in order')
{
  const full = fmt({
    individual: true, teams: true,
    league: { on: true, stableford: true, custom: true },
    matchplay: { on: true, format: 'pairs' },
  })
  const steps = setupSteps(full, ctx({ players: [player('a')], customTableLength: 1 }))
  eq(steps.map(s => s.number), steps.map((_, i) => i + 1),
    'numbers run 1..n with no gaps, however many questions are open')
  eq(steps[0].key, 'competitors', 'and who competes is always first')
  ok(steps.every(s => s.title.length > 0 && s.question.length > 0),
    'every question has a title and a question to ask')
}

section('A refusal points at the switch that does what was meant')
{
  // A trip with nothing to play for has no storable form, so these answers
  // are refused. The refusal has to say which switch to reach for — being
  // told "no" while looking at a tickbox that clearly untickable is useless.
  ok(emptyFormatsReason(fmt()).includes('someone competing'),
    'nobody competing says to pick who is')

  ok(emptyFormatsReason(fmt({ individual: true })).includes('league or a matchplay'),
    'no competition says to switch one on')

  // The important one: unticking the last board is not how you turn the
  // league off, and the message says where the switch actually is
  const noBoard = emptyFormatsReason(fmt({ individual: true, league: { on: true } }))
  ok(noBoard.includes('switch the league off'),
    'a league with no board points at the league switch')
  ok(noBoard.includes('pick one'), 'and offers the alternative')

  // Each reason is distinct — a single generic message would be no help
  const reasons = [
    emptyFormatsReason(fmt()),
    emptyFormatsReason(fmt({ individual: true })),
    emptyFormatsReason(fmt({ individual: true, league: { on: true } })),
  ]
  eq(new Set(reasons).size, 3, 'the three cases each say something different')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
