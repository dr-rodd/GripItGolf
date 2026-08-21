/**
 * League setup tests. Run with: npm run test:league-setup
 *
 * Two halves. The rules in lib/leagueSetup.ts are checked directly — the
 * day ceiling, the starter board, what survives of a stored setup, and that
 * the two tournament formats can never misread each other's column. Then
 * the wiring: the tournament door asks league-or-match-play first, the
 * league wizard reuses the proven pieces rather than restating them, and a
 * league event's organiser area describes its format rather than offering
 * a form that would overwrite it.
 */

import fs from 'fs'
import {
  DAY_BOARDS, type LeagueSetup,
  leagueDaysIssue, starterBoards, parseLeagueSetup, describeLeagueSetup,
} from '../lib/leagueSetup'
import { parseBracketSetup } from '../lib/bracketSetup'
import { parseLeaderboards } from '../lib/leaderboards'
import { MAX_ROUNDS } from '../lib/tripLimits'

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

// ─── Days ──────────────────────────────────────────────────────

section('A league day is a round, so the day ceiling is the round ceiling')
{
  eq(leagueDaysIssue(1), null, 'one day is the single-day event')
  eq(leagueDaysIssue(MAX_ROUNDS), null, 'the ceiling itself is allowed')
  ok(leagueDaysIssue(MAX_ROUNDS + 1) !== null, 'one past it is not')
  ok(leagueDaysIssue(0) !== null, 'no days is not an event')
  ok(leagueDaysIssue(2.5) !== null, 'half days do not exist')
  ok(leagueDaysIssue(MAX_ROUNDS + 1)!.includes(String(MAX_ROUNDS)),
    'and the refusal names the ceiling — the same number, not a second copy')
}

// ─── The starter board ─────────────────────────────────────────

section('Every league starts on a board the platform parser accepts')
{
  const boards = parseLeaderboards(starterBoards())
  eq(boards.length, 1, 'one board, exactly')
  eq(boards[0].audience, 'individual', 'individuals')
  eq(boards[0].scoring, 'stableford', 'on Stableford')
  eq(boards[0].combine, 'total', 'added up')
  // Written at creation, this array is what parseLeaderboards will read for
  // the life of the trip. The parser stamps its defaults (discardWorst: 0)
  // on the way through, so the invariant is stability: what it reads once
  // it reads forever, unchanged.
  eq(parseLeaderboards(boards), boards, 'and re-reading it changes nothing')
}

// ─── The three day-board answers ───────────────────────────────

section('A multi-day league relates its days one of three ways')
{
  eq(DAY_BOARDS.map(d => d.key), ['separate', 'cumulative', 'hybrid'],
    'separate, cumulative, hybrid — in the order the brief gives them')
  ok(DAY_BOARDS.every(d => d.hint.length > 0), 'each says what it means')
}

// ─── Storage ───────────────────────────────────────────────────

section('Storage round-trips whole or not at all')
{
  const full: LeagueSetup = {
    format: 'league',
    entry: 'self_join',
    requireApproval: true,
    dayBoards: 'hybrid',
  }
  eq(parseLeagueSetup(JSON.parse(JSON.stringify(full))), full,
    'a full setup reads back byte-for-byte')

  const single: LeagueSetup = { format: 'league', entry: 'organiser' }
  eq(parseLeagueSetup(JSON.parse(JSON.stringify(single))), single,
    'a single-day organiser-entered setup is just two keys')

  eq(parseLeagueSetup(null), null, 'null is no setup — the un-migrated column')
  eq(parseLeagueSetup([]), null, 'an array is refused')
  eq(parseLeagueSetup({ format: 'league' }), null, 'no entry, no setup')
  eq(parseLeagueSetup({ format: 'league', entry: 'osmosis' }), null,
    'an unknown entry drops the lot')

  const noApproval = parseLeagueSetup({
    format: 'league', entry: 'organiser', requireApproval: true,
  })
  ok(noApproval !== null && !('requireApproval' in noApproval!),
    'approval only means anything on a self-join event — dropped otherwise')

  const softApproval = parseLeagueSetup({
    format: 'league', entry: 'self_join', requireApproval: 'yes',
  })
  ok(softApproval !== null && !('requireApproval' in softApproval!),
    'approval is exactly true or it is off')

  const badBoards = parseLeagueSetup({
    format: 'league', entry: 'self_join', dayBoards: 'quantum',
  })
  ok(badBoards !== null && !('dayBoards' in badBoards!),
    'an unknown day-boards answer is dropped, not guessed at')
}

// ─── The two formats cannot misread each other ─────────────────

section('One column, two formats, and neither parser trusts the other\'s object')
{
  const league = { format: 'league', entry: 'self_join' }
  const knockout = {
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'],
    finalized: false,
  }
  ok(parseLeagueSetup(league) !== null, 'the league parser reads a league')
  eq(parseBracketSetup(league), null, 'the bracket parser refuses it')
  ok(parseBracketSetup(knockout) !== null, 'the bracket parser reads a knockout')
  eq(parseLeagueSetup(knockout), null, 'the league parser refuses it')
}

// ─── Naming ────────────────────────────────────────────────────

section('The organiser card says the league in one line')
{
  const line = describeLeagueSetup(
    { format: 'league', entry: 'self_join', requireApproval: true, dayBoards: 'hybrid' },
    3,
  )
  ok(line.startsWith('League'), 'the format leads')
  ok(line.includes('3 days'), 'the days come from the rounds, passed in')
  ok(line.includes('approval on'), 'approval is worth saying when it is on')
  ok(line.toLowerCase().includes('days and overall'), 'and how the days relate')

  const short = describeLeagueSetup({ format: 'league', entry: 'organiser' }, 1)
  ok(short.includes('one day'), 'a single day says so in words')
  ok(!short.includes('approval'), 'and approval-off is not narrated')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The tournament door asks the format first')
{
  const page = read('app/dashboard/create/page.tsx')
  ok(page.includes('CreateFlow'), 'the create route renders the flow switch')

  const flow = read('app/dashboard/create/CreateFlow.tsx')
  ok(flow.includes('CreateLeagueForm') && flow.includes('CreateTripForm'),
    'which can reach both forms')
  ok(flow.includes("get('type') === 'tournament'"),
    'and only asks the question through the tournament door')
}

section('The league wizard reuses the proven pieces rather than restating them')
{
  const src = read('app/dashboard/create/CreateLeagueForm.tsx')

  // The row mapping stays one copy — the exact trap the trip wizard already
  // fell into and climbed out of (test-trip-form pins the same rule there).
  ok(src.includes('toItemRow(tripId, item)'),
    'itinerary rows go through the shared mapping')
  ok(!/stay_name: item\.kind === 'stay'/.test(src),
    '  …never a second copy of it')

  ok(src.includes('<CourseSelect'), 'venues come from the shared course picker')
  ok(src.includes('<HandicapField'), 'handicaps from the shared field')
  ok(src.includes('firstDuplicateIndex'), 'and the no-two-same-names rule is the roster\'s')
  ok(src.includes('starterBoards()'), 'the starter board comes from lib/leagueSetup.ts')
  ok(src.includes("kind: 'tournament'"), 'a league is an event')
  ok(src.includes('team_id: null'), 'everyone starts unassigned, as everywhere')
  ok(!src.includes("from('teams')"), 'and no teams are written')
  ok(src.includes('hashPasscode'), 'the organiser PIN is hashed on the device')
  ok(!src.includes('service_role') && !src.includes('SERVICE_ROLE'),
    'no service key anywhere near the browser')

  // A standalone day writes its one date to both ends, so everything
  // downstream sees a normal one-day event — the tournament wizard's rule.
  ok(src.includes('multiDay ? endDate : startDate'),
    'a single day is one date written to both ends')

  // Same-venue is a form convenience, never a stored fact: with the toggle
  // on, day one's venue is every day's at write time.
  ok(src.includes('sameVenue ? venues[0] : venues[i]'),
    'the same-venue toggle resolves to one venue per day at write time')
}

section('A league event\'s organiser area describes its format, never re-forms it')
{
  const page = read('app/trip/[tripCode]/organiser/bracket/page.tsx')
  ok(page.includes('parseLeagueSetup'), 'the format screen knows a league when it reads one')
  // The guard that matters: the league branch renders a summary, and the
  // match play form only renders when the column does not hold a league.
  ok(/if \(leagueSetup\)/.test(page), 'and branches on it before the form')

  const organiser = read('app/trip/[tripCode]/organiser/page.tsx')
  ok(organiser.includes('parseLeagueSetup'),
    'the organiser card reads both formats from the one column')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
