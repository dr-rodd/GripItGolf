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
import { emptyFormatsReason } from '../lib/tripSetupFlow'
import { type Leaderboard } from '../lib/leaderboards'
import { finaliseBlockedReason } from '../lib/teamSets'
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

// What a trip plays for. The team rules are read off these now, not off the
// old flags — a pairs draw chosen in this model is what has to lock teams at
// two, and for a while nothing did.
const PAIRS_DRAW: Leaderboard[] = [
  { id: 'mp', audience: 'team', competition: 'matchplay' },
]
const SINGLES_DRAW: Leaderboard[] = [
  { id: 'mp', audience: 'individual', competition: 'matchplay' },
]
const TEAM_LEAGUE: Leaderboard[] = [
  { id: 'tl', audience: 'team', competition: 'league',
    scoring: 'stableford', teamFormat: 'better_ball', combine: 'total' },
]

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


// ─── The tree opens as it is answered ──────────────────────────

section('A pairs draw locks teams at two')
{
  const pairs  = PAIRS_DRAW
  const league = TEAM_LEAGUE

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

  // The regression this whole file now guards: the rules are read off the
  // boards. When they were read off `trips.formats` instead — which nothing
  // writes any anymore — a pairs draw chosen in settings capped nothing,
  // called nothing a pairing, and could not be drawn at all.
  eq(teamSizeLimit(SINGLES_DRAW), null, 'a singles draw is not between pairings')
  eq(teamNoun(SINGLES_DRAW).one, 'team', 'so its teams are teams')
  eq(teamSizeLimit([]), null, 'and a trip playing for nothing caps nothing')

  // Both at once: a team league as the primary board with a pairs draw
  // running beside it is still a pairs draw.
  const both = [...TEAM_LEAGUE, ...PAIRS_DRAW]
  eq(teamSizeLimit(both), 2, 'a draw alongside a league still caps the teams')
  eq(teamNoun(both).one, 'pairing', 'and still calls them pairings')
}

section('An over-full pairing is refused, not saved')
{
  const pairs = PAIRS_DRAW
  const teams = [team('t1'), team('t2')]

  const one  = [player('a', 't1')]
  ok(canJoinTeam(pairs, 't1', one), 'a second player can join a pairing of one')

  const full = [player('a', 't1'), player('b', 't1')]
  ok(!canJoinTeam(pairs, 't1', full), 'a third player cannot join a full pairing')
  ok(canJoinTeam(pairs, 't2', full), 'but can join an empty one')

  // Without a cap there is no such thing as full
  const league = TEAM_LEAGUE
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
  const pairs = PAIRS_DRAW
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
  const league = TEAM_LEAGUE
  eq(pairsBlockedReason(league, teams, short), null, 'and a team league is never blocked by size')
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

// ─── What stops a trip going live ──────────────────────────────

section('Finalise is gated on the boards, not the old flags')
{
  const team: Leaderboard = {
    id: 'a', audience: 'team', competition: 'league',
    scoring: 'stableford', teamFormat: 'hero', combine: 'total',
  }
  const solo: Leaderboard = {
    id: 'b', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total',
  }
  const pairs: Leaderboard = { id: 'c', audience: 'team', competition: 'matchplay' }

  const sheet = (n: number, set = 'main') =>
    Array.from({ length: n }, (_, i) => ({ id: `${set}-t${i}`, name: `T${i}`, team_set: set }))
  const none: { id: string; name: string; team_set: string }[] = []

  // The old gate read trips.formats, which a new trip carries as the
  // defaults — so it said yes to a trip with nothing to play for at all.
  ok(finaliseBlockedReason([], sheet(2)) !== null, 'a trip with no leaderboard cannot go live')
  ok(/playing for/i.test(finaliseBlockedReason([], sheet(2))!), 'and is told what is missing')

  eq(finaliseBlockedReason([solo], none), null,
    'an individual board needs no teams')

  ok(finaliseBlockedReason([team], none) !== null, 'a team board with no teams is blocked')
  eq(finaliseBlockedReason([team], sheet(2)), null, 'and clears once they exist')

  ok(/pairing/i.test(finaliseBlockedReason([pairs], none)!),
    'a pairs draw asks for pairings by name')

  // Per sheet: a league between fours and a draw between pairings need two
  // team sheets filled in, and the trip cannot go live on one of them.
  const league2: Leaderboard = { ...team, teamSet: 'main' }
  const draw2:   Leaderboard = { ...pairs, teamSet: 'set-2' }
  const both = [league2, draw2]

  ok(finaliseBlockedReason(both, sheet(4, 'main')) !== null,
    'the league\'s teams alone are not enough')
  ok(/pairing/i.test(finaliseBlockedReason(both, sheet(4, 'main'))!),
    'and it is the pairings that are named as missing')
  ok(finaliseBlockedReason(both, sheet(6, 'set-2')) !== null,
    'nor are the pairings alone')
  eq(finaliseBlockedReason(both, [...sheet(4, 'main'), ...sheet(6, 'set-2')]), null,
    'both sheets filled in, and it can go live')

  // Sharing one sheet is one sheet to fill
  const shared = [league2, { ...pairs, teamSet: 'main' }]
  eq(finaliseBlockedReason(shared, sheet(4, 'main')), null,
    'two boards on one sheet need that sheet and no other')
}


console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
