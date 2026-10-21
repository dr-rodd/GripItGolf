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
  seriesDates, describeRepeat, nextRoundIssue, tidyRepeat, MAX_REPEAT_EVERY,
  leagueRounds, nextRoundNumber,
  cardKey, tidyCardsOff, cardsOffWith, MAX_CARDS_OFF, revealedLeagueRounds,
} from '../lib/leagueSetup'
import { buildRows, type RowContext, type ResolvedScore } from '../lib/boardRows'
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

section('A recurring series, as dates')
{
  // Wednesday 4 November 2026 — the first Wednesday of the month.
  eq(seriesDates('2026-11-04', { every: 1, unit: 'week' }, 3),
    ['2026-11-04', '2026-11-11', '2026-11-18'], 'weekly is a week apart, first event first')
  eq(seriesDates('2026-11-04', { every: 2, unit: 'week' }, 3),
    ['2026-11-04', '2026-11-18', '2026-12-02'], 'fortnightly is two')
  eq(seriesDates('2026-12-30', { every: 1, unit: 'week' }, 2),
    ['2026-12-30', '2027-01-06'], 'and crosses the year as a calendar does')

  // Monthly keeps the weekday, not the date: the first Wednesday each time.
  eq(seriesDates('2026-11-04', { every: 1, unit: 'month' }, 4),
    ['2026-11-04', '2026-12-02', '2027-01-06', '2027-02-03'],
    'monthly is the same weekday of the month — the first Wednesday, every month')
  eq(seriesDates('2026-11-11', { every: 1, unit: 'month' }, 3),
    ['2026-11-11', '2026-12-09', '2027-01-13'], 'the second Wednesday stays the second')
  ok(seriesDates('2026-11-11', { every: 1, unit: 'month' }, 12)
    .every(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 3),
    'every one of a year of them is a Wednesday')
  eq(seriesDates('2026-11-04', { every: 3, unit: 'month' }, 3),
    ['2026-11-04', '2027-02-03', '2027-05-05'], 'quarterly is three months apart')

  // 30 December 2026 is the fifth Wednesday; most months have no fifth, so
  // the series carries on as the last Wednesday, which every month has.
  eq(seriesDates('2026-12-30', { every: 1, unit: 'month' }, 3),
    ['2026-12-30', '2027-01-27', '2027-02-24'], 'a fifth weekday carries on as the last')

  eq(seriesDates('not a date', { every: 1, unit: 'week' }, 3), [], 'a bad first date is empty')
  eq(seriesDates('2026-11-04', { every: 0, unit: 'week' }, 3), [], 'so is no gap at all')
  eq(seriesDates('2026-11-04', { every: 1, unit: 'week' }, 0), [], 'and no events')
  eq(seriesDates('2026-11-04', { every: 1, unit: 'week' }, 1000).length, MAX_LEAGUE_DAYS * 2,
    'a typo cannot spin — the day ceiling is what refuses a long one')
  ok(leagueDaysIssue(seriesDates('2026-11-04', { every: 1, unit: 'week' }, MAX_LEAGUE_DAYS + 1).length, 'series') !== null,
    '  …and it does')
}

section('A repeat says itself the way a club does')
{
  eq(describeRepeat({ every: 1, unit: 'week' }, '2026-11-04'), 'every Wednesday', 'weekly names the day')
  eq(describeRepeat({ every: 2, unit: 'week' }, '2026-11-04'), 'every 2 weeks on a Wednesday', 'fortnightly too')
  eq(describeRepeat({ every: 1, unit: 'month' }, '2026-11-11'), 'every month on the second Wednesday',
    'monthly names which of the weekday it is')
  eq(describeRepeat({ every: 2, unit: 'month' }, '2026-12-30'), 'every 2 months on the last Wednesday',
    'a fifth reads as the last, which is what it becomes')
  eq(describeRepeat({ every: 1, unit: 'week' }), 'every week', 'with no date there is no day to name')
}

section('The next round goes after the last one')
{
  const ctx = { startDate: '2026-11-04', roundDates: ['2026-11-04', '2026-11-11'] }
  eq(nextRoundIssue('2026-11-18', ctx), null, 'a week on is the next round')
  ok(!!nextRoundIssue('2026-11-11', ctx)?.includes('after'), 'the last round\'s own day is refused')
  ok(!!nextRoundIssue('2026-11-08', ctx)?.includes('11 November'),
    'an earlier day is refused, naming the last round')
  ok(nextRoundIssue('', ctx) !== null, 'no date is refused')
  eq(nextRoundIssue('2026-11-04', { startDate: '2026-11-04', roundDates: [] }), null,
    'an empty league takes its first date')
  ok(nextRoundIssue('2026-11-01', { startDate: '2026-11-04', roundDates: [] }) !== null,
    '  …but nothing before it')
  const full = { startDate: '2026-01-07', roundDates: seriesDates('2026-01-07', { every: 1, unit: 'week' }, MAX_LEAGUE_DAYS) }
  ok(!!nextRoundIssue('2027-06-02', full)?.includes(`${MAX_LEAGUE_DAYS}`),
    'and a full league says the ceiling')
}

section('A league\'s rounds, venue or not, in date order and numbered')
{
  // Four Wednesdays; the second's venue is TBC — a golf item with no
  // course and no round row.
  const items = [
    { id: 'i1', dayIndex: 0, kind: 'golf', courseId: 'c1' },
    { id: 'i2', dayIndex: 7, kind: 'golf', courseId: null },
    { id: 'i3', dayIndex: 14, kind: 'golf', courseId: 'c1' },
    { id: 'dinner', dayIndex: 14, kind: 'stay', courseId: null },
    { id: 'i4', dayIndex: 21, kind: 'golf', courseId: 'c2' },
  ]
  const rounds = [
    { id: 'r1', roundNumber: 1, itineraryItemId: 'i1', courseId: 'c1' },
    { id: 'r3', roundNumber: 3, itineraryItemId: 'i3', courseId: 'c1' },
    { id: 'r4', roundNumber: 4, itineraryItemId: 'i4', courseId: 'c2' },
  ]
  const list = leagueRounds(items, rounds, '2026-11-04')
  eq(list.map(r => r.number), [1, 2, 3, 4], 'a TBC round holds its place in the numbering')
  eq(list.map(r => r.roundId), ['r1', null, 'r3', 'r4'], 'and has no round until a venue is chosen')
  eq(list.map(r => r.date), ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'],
    'each round is dated by its offset from the first')
  ok(!list.some(r => r.itemId === 'dinner'), 'only golf is a round')
  eq(nextRoundNumber(list), 5, 'the next round added is the fifth')

  // A round removed from the running order leaves a gap; a TBC round never
  // takes a number somebody already has.
  const gappy = leagueRounds(
    [{ id: 'a', dayIndex: 0, kind: 'golf' }, { id: 'b', dayIndex: 7, kind: 'golf' }],
    [{ id: 'r2', roundNumber: 2, itineraryItemId: 'a', courseId: 'c' }],
    '2026-11-04',
  )
  eq(gappy.map(r => r.number), [2, 3], 'a TBC round whose place is taken goes past the highest')
  eq(nextRoundNumber([{ number: 1 }, { number: 3 }]), 4, 'and the next round never collides')

  const orphan = leagueRounds([], [{ id: 'old', roundNumber: 1, itineraryItemId: null, courseId: 'c', scheduledDate: '2026-01-01' }], '2026-01-01')
  eq(orphan.map(r => r.roundId), ['old'], 'a round with no golf item is kept, never dropped')
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

  // A series' repeat survives only on a series, and only whole.
  const recurring: LeagueSetup = {
    format: 'league', schedule: 'series', repeat: { every: 2, unit: 'week' }, entry: 'self_join',
  }
  eq(parseLeagueSetup(JSON.parse(JSON.stringify(recurring))), recurring,
    'a recurring series reads back byte-for-byte')
  const asYouGo = parseLeagueSetup({ format: 'league', schedule: 'series', entry: 'organiser' })
  ok(asYouGo !== null && !('repeat' in asYouGo!), 'as you go is the absent repeat')
  const strayOnContinuous = parseLeagueSetup({
    format: 'league', schedule: 'continuous', repeat: { every: 1, unit: 'week' }, entry: 'organiser',
  })
  ok(strayOnContinuous !== null && !('repeat' in strayOnContinuous!),
    'a series repeat on a continuous league is dropped')
  eq(tidyRepeat({ every: MAX_REPEAT_EVERY + 1, unit: 'week' }), null, 'a gap past the ceiling is refused')
  eq(tidyRepeat({ every: 1.5, unit: 'week' }), null, 'so is half a week')
  eq(tidyRepeat({ every: 1, unit: 'fortnight' }), null, 'and a unit nobody offered')

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
  const recurringLine = describeLeagueSetup(
    { format: 'league', schedule: 'series', repeat: { every: 1, unit: 'week' }, entry: 'organiser' },
    10, '2026-11-04',
  )
  ok(recurringLine.includes('every Wednesday') && recurringLine.includes('10 rounds'),
    'a recurring league says how often, and counts rounds rather than days')
  ok(describeLeagueSetup(
    { format: 'league', schedule: 'series', entry: 'organiser' }, 1, '2026-11-04',
  ).includes('added ad hoc'), 'a dated series with no repeat is ad hoc')
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
  // The ?type read names three doors now — trip, tournament, run — and only
  // the tournament door falls through to the shape and format questions.
  ok(flow.includes("t === 'tournament' || t === 'run'") &&
     flow.includes("if (type !== 'tournament') return <CreateTripForm />"),
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
  ok(src.includes('boards.length > 0 && (!asksDayBoards'),
    'and an event cannot be created without at least one board')
  ok(src.includes("kind: 'tournament'"), 'a league is an event')
  ok(src.includes('team_id: null'), 'everyone starts unassigned, as everywhere')
  ok(!src.includes("from('teams')"), 'and no teams are written')
  ok(src.includes('hashPasscode'), 'the organiser PIN is hashed on the device')
  ok(!src.includes('service_role') && !src.includes('SERVICE_ROLE'),
    'no service key anywhere near the browser')

  // A standalone day writes its one date to both ends, so everything
  // downstream sees a normal one-day event; a series runs from its first
  // event to its last, and the Scoring tab moves the end on as events come.
  ok(src.includes("schedule === 'standalone' && !multiDay ? startDate"),
    'a standalone single day is one date written to both ends')
  ok(src.includes("schedule === 'series' ? (slots.at(-1)?.date ?? startDate)"),
    'a series runs from its first event to its last')
  ok(src.includes('seriesDates(startDate, { every: repeatEvery, unit: repeatUnit }, eventCount)'),
    'a recurring series makes every event from the one copy of the dates')
  ok(src.includes("repeat: { every: repeatEvery, unit: repeatUnit }"),
    'and stores the repeat it was made from')

  // Same-venue is a form convenience, never a stored fact: with the toggle
  // on, the first pick is every slot's at write time. A continuous league
  // keys venues by date, so a date added or removed cannot shuffle courses.
  ok(src.includes('sameVenue || slots.length === 1\n      ? venues[0]'),
    'the same-venue toggle — and a lone slot — resolve to one venue at write time')
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

section('A league grows from the Scoring tab and the hub, one round at a time')
{
  const page = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(page.includes("parseLeagueSetup(setupRow?.bracket_setup)?.schedule === 'series'")
    && page.includes('&& !!trip.start_date'),
    'the door is a dated league\'s alone — an undated series keeps the running order')
  ok(page.includes("allowsParticipant(kind, permsRaw, 'add_rounds')"),
    'the field adds rounds only when the organiser lets it')
  ok(page.includes("allowsParticipant(kind, permsRaw, 'set_venues')"),
    'and chooses a TBC venue only when the organiser lets it')
  ok(page.includes("allowsParticipant(kind, permsRaw, 'add_courses')"),
    'and adds a course only with add_courses — the gate the registry promised')
  ok(page.includes(".select('bracket_setup, settings_passcode_hash')")
    && page.includes(".select('event_permissions')"),
    'the setup and permissions ride in their own fail-soft queries, never the main select')
  ok(page.includes('leagueRounds(') && page.includes('<TbcRoundTile'),
    'the tab lists the league\'s rounds through the one copy, a TBC one in its place')
  ok(page.includes('number={nextRoundNumber(league)}'),
    'a new round takes the number the one rule gives it')

  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes('leagueRounds(') && hub.includes('<TbcRoundTile'),
    'the hub lists the same rounds the same way')
  ok(hub.includes("allowsParticipant(trip.kind, tripRaw.event_permissions, 'set_venues')"),
    'behind the same permission')

  const doors = read('app/trip/[tripCode]/LeagueRounds.tsx')
  ok(doors.includes('nextRoundIssue(date, { startDate: door.startDate, roundDates })'),
    'the date is checked by the one copy of the rule')
  ok(doors.includes('addLeagueRound({') && doors.includes('confirmLeagueVenue({'),
    'both doors write through the league\'s own writer')
  ok(doors.includes('<InlineUnlock') && doors.includes('hasUnlocked(door.tripCode)'),
    'the organiser\'s PIN is asked in place, and remembered')
  ok(doors.includes('allowAdd={organiser || door.fieldMayAddCourses}'),
    'the picker hides its add-course door unless the person may use it')
  ok(doors.includes("failed ? 'Could not load the field"),
    'a failed fetch of the field stops the save rather than making a round with no handicaps')

  const store = read('lib/leagueRoundStore.ts')
  ok(!store.includes("from './itineraryStore'"),
    'not saveItinerary — "last + 1" would hand a TBC round\'s number to somebody else')
  ok(store.indexOf(".update({ end_date: args.date })") < store.indexOf("from('itinerary_items')"),
    'the end date moves on before the round is made, never after')
  ok(store.includes(".is('course_id', null)"),
    'a TBC venue is claimed only while it is still TBC — two phones cannot both make the round')
  ok(store.includes('if (!made.made)'),
    'a round that could not be made leaves no half-made item behind')
  ok(store.includes('!isHandicapPending(p.handicap)'), 'pending handicaps get no snapshot')

  const wizard = read('app/dashboard/create/CreateLeagueForm.tsx')
  ok(wizard.includes("useState(schedule === 'series')"), 'a league presumes one venue')
  ok(wizard.includes("label: 'Ad hoc'"), 'and is planned ad hoc or recurring')
  ok(wizard.includes('if (!item.courseId) return []'),
    'a TBC round is made without a round row, its number kept free')

  const picker = read('app/components/CourseSelect.tsx')
  ok(picker.includes('allowAdd = true') && picker.includes("view.kind === 'add' && allowAdd"),
    'the picker is open by default everywhere it always was')

  const itin = read('lib/itineraryStore.ts')
  ok(itin.includes('players.filter(p => !isHandicapPending(p.handicap))')
    && !itin.includes('Math.round(p.handicap ?? 0)'),
    'an added round gives a pending handicap no snapshot — pending is not scratch')
}

section('Every round has its own leaderboard; a round can stop counting')
{
  const board = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
  ok(board.includes('const showRounds = isEvent && series && roundOptions.length > 1'),
    'a league reads its board overall or one round at a time')
  ok(board.includes('const showCourses = isEvent && !series && courses.length > 1'),
    '  …in the course switch\'s place, never beside it')
  ok(board.includes('? [shownRound.id]') && board.includes('return withOnlyRounds(base, courseRoundIds)'),
    'a round\'s board is the league\'s own boards narrowed by the one copy — never a stored second board')
  ok(board.includes('r.id === shownRound.id ? { ...r, casual: false } : r'),
    'a round that does not count is read with its flag cleared for that round alone')
  ok(board.includes('? <div className="opacity-60">{board}</div>'),
    '  …and greyed, with a line saying it does not count')
  ok(board.includes("(r.casual !== true || r.id === shownRound?.id)"),
    'the overall still draws no column for it')

  const page = read('app/trip/[tripCode]/leaderboard/page.tsx')
  ok(page.includes("const series = leagueSetup?.schedule === 'series'") && page.includes('series={series}'),
    'the page tells the board it is a league, off the stored shape')

  const rows = read('lib/boardRows.ts')
  ok(rows.includes('withOnlyRounds(withoutCasualRounds(withoutCardsOff(ctx)), lb.roundIds)'),
    'and the overall skips it through the one rule in buildRows, untouched')

  const doors = read('app/trip/[tripCode]/LeagueRounds.tsx')
  ok(doors.includes(".update({ casual: !next })") && doors.includes(".eq('trip_id', door.tripId)"),
    'the gear writes the casual flag, scoped by trip — never the scores')
  ok(doors.includes("if (!organiser) { setError('Changing a round needs the organiser PIN.')"),
    'and it is the organiser\'s, with the PIN asked in place')

  const tab = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(tab.includes('rounds(*, courses(name, location))'),
    'the tab reads the flag without naming a column migration 031 adds')
  ok(tab.indexOf('</Link>') < tab.indexOf('<RoundSettings'),
    'the gear sits beside the tile, outside its link')

  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes("supabase.from('rounds').select('id, casual')"),
    'the hub reads it in its own fail-soft query')

  const summary = read('app/trip/[tripCode]/round/[roundNumber]/page.tsx')
  ok(summary.includes("(event ? ' · doesn’t count' : ' · casual')"),
    'and a round\'s own page says it in an event\'s words')
}

section('A player\'s card in a round can be switched off, and back on')
{
  // Two players, two rounds of nine par-4s, stroke index 1–9, both off 9 —
  // a gross of 5 is nett 4, two points a hole, 18 a round.
  const holes = Array.from({ length: 9 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
  }))
  const players = [
    { id: 'p1', name: 'Alice', handicap: 9, gender: 'M' },
    { id: 'p2', name: 'Bob', handicap: 9, gender: 'M' },
  ]
  const card = (roundId: string, playerId: string): ResolvedScore[] => holes.map(h => ({
    playerId, roundId, holeId: h.id, holeNumber: h.hole_number,
    gross: 5, points: 2, noReturn: false, live: false,
  }))
  const ctx = (cardsOff?: string[]): RowContext => ({
    players, teams: [], memberships: [], holes,
    rounds: [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }],
    resolved: [...card('r1', 'p1'), ...card('r2', 'p1'), ...card('r1', 'p2'), ...card('r2', 'p2')],
    hcpFor: new Map(players.flatMap(p => [[`r1:${p.id}`, 9], [`r2:${p.id}`, 9]] as [string, number][])),
    liveRoundIds: new Set<string>(), livePlayerIds: new Set<string>(), legacyTeamScoring: null,
    ...(cardsOff ? { cardsOff: new Set(cardsOff) } : {}),
  })
  const board = starterBoards()[0]
  const total = (c: RowContext, id: string) => buildRows(board, c).find(r => r.id === id)!.total

  eq([total(ctx(), 'p1'), total(ctx(), 'p2')], [36, 36], 'every card counting, both on 36')
  const off = ctx([cardKey('r2', 'p2')])
  eq([total(off, 'p1'), total(off, 'p2')], [36, 18],
    'Bob\'s round two switched off — his round one still counts, Alice is untouched')
  eq(buildRows({ ...board, roundIds: ['r2'] }, off).find(r => r.id === 'p2')?.total ?? 0, 0,
    'and it is off round two\'s own board too')
  eq(total(ctx([]), 'p2'), 36, 'an empty list is every card counting')

  eq(cardKey('r1', 'p1'), 'r1:p1', 'a card is keyed the way the board keys a player\'s round')
  eq(tidyCardsOff(['r2:p1', 'r1:p1', 'r1:p1', 'nonsense', 7, 'a:b:c']), ['r1:p1', 'r2:p1'],
    'the stored list is tidied: well-formed, once each, in order')
  eq(tidyCardsOff('r1:p1'), [], 'and anything that is not a list is no list')
  eq(tidyCardsOff(Array.from({ length: MAX_CARDS_OFF + 5 }, (_, i) => `r${i}:p`)).length, MAX_CARDS_OFF,
    'with a ceiling far past any real league')
  eq(cardsOffWith(['r1:p1'], 'r2:p2', true), ['r1:p1', 'r2:p2'], 'switching one off adds it')
  eq(cardsOffWith(['r1:p1', 'r2:p2'], 'r1:p1', false), ['r2:p2'], 'switching it back on takes it out')
  eq(cardsOffWith(['r1:p1'], 'r1:p1', true), ['r1:p1'], 'and switching an off card off again changes nothing')

  const withCards = parseLeagueSetup({ format: 'league', entry: 'organiser', schedule: 'series', cardsOff: ['r1:p1', 'bad'] })
  eq(withCards?.cardsOff, ['r1:p1'], 'the setup carries the tidy list')
  ok(!('cardsOff' in parseLeagueSetup({ format: 'league', entry: 'organiser', cardsOff: [] })!),
    '  …and none at all when it is empty, so a league that never used it reads as it always did')

  const rows = read('lib/boardRows.ts')
  ok(rows.includes('withOnlyRounds(withoutCasualRounds(withoutCardsOff(ctx)), lb.roundIds)'),
    'buildRows drops a switched-off card first, beside the round rule and nowhere else')
  const rc = read('lib/rowContext.ts')
  ok(rc.includes('cardsOff: new Set(input.cardsOff)'), 'the one assembly carries the list')

  const hub = read('lib/hubStanding.ts')
  ok(hub.includes('fetchCardsOff(tripId)') && hub.includes('.filter(s => !off.has(cardKey(s.round_id, s.player_id)))'),
    'the hub\'s cheap standing drops it too, so it cannot disagree with the board')
  ok((hub.match(/fetchCardsOff\(tripId\)/g) ?? []).length === 2,
    '  …and its full path, both reading it fail-soft in their own batch')
  ok(read('app/trip/[tripCode]/leaderboard/page.tsx').includes('cardsOff={leagueSetup?.cardsOff}'),
    'the leaderboard is handed it')
  ok(read('app/trip/[tripCode]/export/page.tsx').includes('cardsOff: parseLeagueSetup('),
    'and the export, so paper agrees with the screen')

  const store = read('lib/leagueRoundStore.ts')
  ok(store.includes('const merged: Record<string, unknown> = { ...stored }'),
    'the switch merges into the stored setup — a key it does not know about survives')
  ok(store.includes('if (!parseLeagueSetup(raw)'), '  …and only ever writes over a league\'s own setup')
  ok(store.includes('withRoundAllowance(raw[index]'),
    'a round\'s allowance is merged into the stored board the same way')

  const gear = read('app/trip/[tripCode]/LeagueRounds.tsx')
  ok(gear.includes("{ value: 'round', label: 'Round' }, { value: 'rules', label: 'Rules' }"),
    'the gear opens on the round, with the rules on their own tab')
  ok(gear.includes("if (!organiser) { setError('Changing a round needs the organiser PIN.')"),
    'and every change in it is the organiser\'s')
  ok(gear.includes("readScores<") && gear.includes("readLiveScores<"),
    'who has a card is read whole, past the 1,000-row cap')
}

section('The next round appears the day after the one before it')
{
  // Four Wednesdays in November.
  const rounds = ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']
    .map((date, i) => ({ date, number: i + 1 }))
  const on = (today: string) => revealedLeagueRounds(rounds, today)

  eq(on('2026-11-01').shown.map(r => r.number), [1], 'before the league starts, the first round alone')
  eq(on('2026-11-01').hidden, 3, '  …with three more to come')
  eq(on('2026-11-04').shown.map(r => r.number), [1], 'on the day of round one, round one — the next waits')
  eq(on('2026-11-05').shown.map(r => r.number), [2, 1],
    'the day after, round two appears — newest first, the next on top')
  eq(on('2026-11-11').shown.map(r => r.number), [2, 1], 'on round two\'s day, still no round three')
  eq(on('2026-11-30').shown.map(r => r.number), [4, 3, 2, 1], 'after the last, the whole history')
  eq(on('2026-11-30').hidden, 0, '  …and nothing held back')
  eq(revealedLeagueRounds([{ date: null, number: 1 }, ...rounds], '2026-11-01').shown.map(r => r.number),
    [1, 1], 'a round with no date is always shown')
  eq(revealedLeagueRounds([], '2026-11-01'), { shown: [], hidden: 0 }, 'no rounds, nothing to show')

  for (const page of ['app/trip/[tripCode]/scoring/page.tsx', 'app/trip/[tripCode]/page.tsx']) {
    const src = read(page)
    ok(src.includes('revealedLeagueRounds(league, todayString(new Date()))')
      && src.includes('revealed.shown.map('),
      `${page.split('/').slice(-2).join('/')} draws the revealed rounds, newest first`)
    ok(src.includes('the next appears the day after this one is played'),
      '  …and says more are to come without saying when')
  }
  ok(read('app/trip/[tripCode]/scoring/page.tsx').includes('number={nextRoundNumber(league)}'),
    'adding a round still reads the whole plan, so no number is handed out twice')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
