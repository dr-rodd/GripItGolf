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
  DAY_BOARDS, LEAGUE_SCHEDULES, type LeagueSetup,
  MAX_LEAGUE_DAYS, WEEKDAY_NAMES,
  leagueDaysIssue, starterBoards, parseLeagueSetup, describeLeagueSetup,
  weeklyDates, boardGrouping, describeScope,
} from '../lib/leagueSetup'
import type { Leaderboard } from '../lib/leaderboards'
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

// ─── The three shapes in time ──────────────────────────────────

section('Standalone, continuous, series — and each knows its ceiling')
{
  eq(LEAGUE_SCHEDULES.map(s => s.key), ['standalone', 'continuous', 'series'],
    'the three shapes, standalone first')

  eq(leagueDaysIssue(6, 'standalone'), null, 'standalone keeps the trip ceiling')
  ok(leagueDaysIssue(7, 'standalone') !== null, '  …and refuses past it')
  eq(leagueDaysIssue(14, 'continuous'), null,
    'a summer of Wednesdays fits a continuous league')
  eq(leagueDaysIssue(MAX_LEAGUE_DAYS, 'series'), null, 'a series fits the same ceiling')
  ok(leagueDaysIssue(MAX_LEAGUE_DAYS + 1, 'continuous') !== null,
    'which is still a ceiling')
}

section('Every Wednesday for the summer, as dates')
{
  // June–August 2027: the first Wednesday is the 2nd, the last September's
  // eve — 2026-06 arithmetic is easy to check by hand off a calendar.
  const dates = weeklyDates('2027-06-01', '2027-08-31', 3)
  eq(dates[0], '2027-06-02', 'starts at the first Wednesday inside the period')
  eq(dates.at(-1), '2027-08-25', 'ends at the last one')
  eq(dates.length, 13, 'a summer holds thirteen of them')
  ok(dates.every(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 3),
    'and every one is a Wednesday')

  eq(weeklyDates('2027-06-02', '2027-06-02', 3), ['2027-06-02'],
    'a one-day period on the right day is one date')
  eq(weeklyDates('2027-06-03', '2027-06-08', 3), [],
    'a period skipping the day entirely is empty, not an error')
  eq(weeklyDates('2027-08-31', '2027-06-01', 3), [], 'backwards dates are empty')
  eq(weeklyDates('2027-06-01', '2027-08-31', 9), [], 'so is a day that does not exist')
  eq(WEEKDAY_NAMES[3], 'Wednesday', 'and 3 is Wednesday, Sunday-first — the JS convention')
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

  // The shape in time. Standalone is the absent default — every league
  // stored before the question existed was one.
  const continuous: LeagueSetup = {
    format: 'league', schedule: 'continuous', repeatWeekday: 3, entry: 'self_join',
  }
  eq(parseLeagueSetup(JSON.parse(JSON.stringify(continuous))), continuous,
    'a continuous weekly league reads back byte-for-byte')
  const series = parseLeagueSetup({ format: 'league', schedule: 'series', entry: 'organiser' })
  eq(series?.schedule, 'series', 'a series knows it is one')
  const plain = parseLeagueSetup({ format: 'league', entry: 'organiser' })
  ok(plain !== null && !('schedule' in plain!),
    'standalone is the absent default, kept off the object')
  const badShape = parseLeagueSetup({ format: 'league', schedule: 'quantum', entry: 'organiser' })
  ok(badShape !== null && !('schedule' in badShape!),
    'an unknown shape is dropped, not guessed at')

  // The repeat is continuous's alone, and a real weekday or nothing.
  const strayRepeat = parseLeagueSetup({
    format: 'league', schedule: 'series', repeatWeekday: 3, entry: 'organiser',
  })
  ok(strayRepeat !== null && !('repeatWeekday' in strayRepeat!),
    'a repeat on a series is dropped — there is no period to repeat inside')
  const badRepeat = parseLeagueSetup({
    format: 'league', schedule: 'continuous', repeatWeekday: 9, entry: 'organiser',
  })
  ok(badRepeat !== null && !('repeatWeekday' in badRepeat!),
    'a day that does not exist is dropped')
}

section('The organiser card says the shape')
{
  eq(describeLeagueSetup(
    { format: 'league', schedule: 'continuous', repeatWeekday: 3, entry: 'self_join' }, 13,
  ).includes('every Wednesday'), true, 'a weekly league says its day')
  ok(describeLeagueSetup(
    { format: 'league', schedule: 'continuous', entry: 'organiser' }, 5,
  ).includes('continuous'), 'a hand-picked continuous league says continuous')
  ok(describeLeagueSetup(
    { format: 'league', schedule: 'series', entry: 'organiser' }, 4,
  ).includes('series'), 'a series says series')
  ok(!describeLeagueSetup(
    { format: 'league', entry: 'organiser' }, 3,
  ).includes('standalone'), 'standalone goes unsaid — it is the plain case')
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

section('The tournament door asks the shape, then the format')
{
  const page = read('app/dashboard/create/page.tsx')
  ok(page.includes('CreateFlow'), 'the create route renders the flow switch')

  const flow = read('app/dashboard/create/CreateFlow.tsx')
  ok(flow.includes('CreateLeagueForm') && flow.includes('CreateTripForm')
    && flow.includes('CreateKnockoutForm'),
    'which can reach all three forms')
  ok(flow.includes("get('type') === 'tournament'"),
    'and only asks the questions through the tournament door')
  for (const shape of ['Standalone', 'Continuous', 'Series']) {
    ok(flow.includes(`>${'\n'}            ${shape}`) || flow.includes(shape),
      `the shape question offers ${shape}`)
  }
  ok(flow.includes('<CreateLeagueForm schedule="series" />'),
    'a series is a league by nature — the format question is skipped')
  ok(flow.includes("schedule === 'continuous' && format === 'match_play'"),
    'a continuous knockout gets its own lean door')
}

section('The continuous knockout door is lean on purpose')
{
  const src = read('app/dashboard/create/CreateKnockoutForm.tsx')
  ok(src.includes("kind: 'tournament'"), 'a knockout is an event')
  ok(src.includes("{ format: 'match_play', schedule: 'continuous' }"),
    'creation seeds the format and shape for the bracket form to finish')
  ok(!src.includes("from('itinerary_items')") && !src.includes("from('rounds')"),
    'no itinerary and no rounds — matches happen when players make them happen')
  ok(src.includes('hashPasscode'), 'the organiser PIN is hashed on the device')
  ok(src.includes('team_id: null'), 'everyone starts unassigned, as everywhere')
  ok(!src.includes('service_role') && !src.includes('SERVICE_ROLE'),
    'no service key anywhere near the browser')
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

  // Leaderboard selection is built into creation — as Trip Setup's own
  // picker, seeded with the starter, never a second copy of the grid. What
  // the organiser builds is what creation writes, and no board means no
  // event.
  ok(src.includes('<LeaderboardSetup'),
    'the leaderboard picker is the platform\'s own, embedded whole')
  ok(src.includes('leaderboards: boards'),
    'creation writes the boards the organiser built')
  ok(src.includes('boards.length > 0 && (slots.length'),
    'and an event cannot be created without at least one board')
  ok(src.includes("kind: 'tournament'"), 'a league is an event')
  ok(src.includes('team_id: null'), 'everyone starts unassigned, as everywhere')
  ok(!src.includes("from('teams')"), 'and no teams are written')
  ok(src.includes('hashPasscode'), 'the organiser PIN is hashed on the device')
  ok(!src.includes('service_role') && !src.includes('SERVICE_ROLE'),
    'no service key anywhere near the browser')

  // A standalone day writes its one date to both ends, so everything
  // downstream sees a normal one-day event; a series stores no dates at
  // all — its days are numbered, not dated.
  ok(src.includes("schedule === 'standalone' && !multiDay ? startDate"),
    'a standalone single day is one date written to both ends')
  ok(src.includes("schedule === 'series' ? ''"),
    'a series carries no trip dates')

  // Same-venue is a form convenience, never a stored fact: with the toggle
  // on, the first pick is every slot's at write time. A continuous league
  // keys venues by date, so a date added or removed cannot shuffle courses.
  ok(src.includes('sameVenue\n      ? venues[0]') || src.includes('sameVenue ? venues[0]'),
    'the same-venue toggle resolves to one venue per slot at write time')
  ok(src.includes('dateVenues[slot.date]'),
    'a continuous league keys its venues by date, not by index')
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

// ─── The days answer finally means something ───────────────────

section('How the days relate decides how the boards are arranged')
{
  const overall: Leaderboard = {
    id: 'lb-all', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total',
  }
  const day1: Leaderboard = { ...overall, id: 'lb-d1', roundIds: ['r1'] }
  const day2: Leaderboard = { ...overall, id: 'lb-d2', roundIds: ['r2'] }
  const all = [overall, day1, day2]

  eq(boardGrouping(all, 'cumulative').overall.map(b => b.id), ['lb-all'],
    'a running total leads with the whole event')
  eq(boardGrouping(all, 'cumulative').byDay.map(b => b.id), ['lb-d1', 'lb-d2'],
    '  …and still shows a day board somebody went to the trouble of making')
  eq(boardGrouping(all, 'hybrid').overall.map(b => b.id), ['lb-all'],
    'days-and-overall says the same, explicitly')
  eq(boardGrouping(all, 'hybrid').byDay.length, 2, '  …with the days after it')

  eq(boardGrouping(all, 'separate').overall, [],
    'separate days set the overall board aside')
  eq(boardGrouping(all, 'separate').byDay.map(b => b.id), ['lb-d1', 'lb-d2'],
    '  …leaving each day its own competition')
  ok(boardGrouping(all, 'separate').byDay.length
    + boardGrouping(all, 'separate').overall.length < all.length,
    '  …set aside, never deleted — the boards are all still in the list passed in')

  eq(boardGrouping([overall], 'separate').overall.map(b => b.id), ['lb-all'],
    'nothing scoped means nothing to separate from — one board however it answered')
  eq(boardGrouping(all, undefined).overall.map(b => b.id), ['lb-all'],
    'and an event that never answered reads as the running total it always was')
}

section('A day board says which golf it counts')
{
  const rounds = [
    { id: 'r1', roundNumber: 1, courseName: 'Ballyliffin' },
    { id: 'r2', roundNumber: 2, courseName: 'Portsalon' },
    { id: 'r3', roundNumber: 3, courseName: 'Ballyliffin' },
  ]
  const lb = (roundIds?: string[]): Leaderboard => ({
    id: 'b', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total',
    ...(roundIds ? { roundIds } : {}),
  })

  eq(describeScope(lb(), rounds), null,
    'a board counting the whole event says nothing extra — its title is the truth')
  eq(describeScope(lb(['r2']), rounds), 'Portsalon', 'one day names its course')
  eq(describeScope(lb(['r1', 'r2']), rounds), 'Ballyliffin & Portsalon', 'two name both')
  eq(describeScope(lb(['r1', 'r3']), rounds), 'Days 1, 3',
    'a venue played twice is said in days — the name alone could not tell them apart')
  eq(describeScope(lb(['gone']), rounds), null,
    'and a scope pointing at nothing says nothing rather than inventing a day')
}

section('The day editor is a door on the organiser page, events only')
{
  const page = read('app/trip/[tripCode]/organiser/days/page.tsx')
  ok(page.includes('isEvent(trip.kind)'), 'a trip is pointed at Trip Setup')
  ok(page.includes('PasscodeGate'), 'behind the organiser PIN like the rest of the area')

  const client = read('app/trip/[tripCode]/organiser/days/DayBoardsClient.tsx')
  ok(client.includes('scope={[round.id]}'),
    'the cascade is told which day it is making a board for')
  ok(client.includes('<LeaderboardSetup'),
    'and it is the same cascade, never a second smaller copy')

  const form = read('app/components/LeaderboardSetup.tsx')
  ok(form.includes('const fresh = scope?.length ? { ...FRESH, roundIds: scope } : FRESH'),
    'the scope is seeded onto the draft, not stamped on after')
  ok(form.includes('setDraft({ ...fresh, audience: a.key })'),
    '  …and survives the cascade being restarted, or a day board would lose its day')

  const organiser = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiser.includes('/organiser/days'), 'the organiser page carries the door')
  ok(organiser.includes('rounds.length > 1'),
    'and only when there is more than one day to tell apart')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
