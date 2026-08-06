/**
 * The trip hub. Run with: npm run test:hub
 *
 * What is pinned here is the logic behind the rebuilt hub — what happens
 * next, where the player stands, and the two sections that were pure text:
 *
 *   · up next picks the right thing, and only counts down to golf
 *   · the two standing paths agree on a board they both understand
 *   · the four next-match cases, including the two with no opponent
 *   · consecutive nights in one place fold into one booking
 *   · the page carries no deleted stat tiles and no empty sections
 */

import fs from 'fs'
import type { ItineraryItem } from '../lib/itinerary'
import {
  upNext, describeCountdown, describeGroups, momentOf, orderedItems, dayArrived,
} from '../lib/upNext'
import { nextMatch, describeNextMatch, type DrawMatch } from '../lib/nextMatch'
import { stayRuns, travelLegs, describeStayRun } from '../lib/stays'
import { mapsUrl } from '../lib/places'
import {
  usesSimpleStandings, placingFromStandings, placingFromRows, describePlacing,
  podium,
} from '../lib/standing'
import { courseCard, hasCard, hasLadiesCard } from '../lib/courseCard'
import { standings, type SummaryScore } from '../lib/playerSummary'
import { buildRows, type RowContext, type RowHole, type BoardRow } from '../lib/boardRows'
import { resolveScores, handicapMap, sortRounds, buildRowContext } from '../lib/rowContext'
import { parseTeamScoring } from '../lib/teamScoring'
import { isLegacy } from '../lib/leaderboardsCompat'
import { parseLeaderboards } from '../lib/leaderboards'
import type { Leaderboard } from '../lib/leaderboards'

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
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ─── Fixtures ──────────────────────────────────────────────

const START = '2026-08-13'

const golf = (id: string, day: number, pos: number, teeTime: string | null, count = 1): ItineraryItem =>
  ({ id, dayIndex: day, position: pos, kind: 'golf', courseId: 'c1', teeTime, teeCount: count })
const stay = (id: string, day: number, pos: number, name: string): ItineraryItem =>
  ({ id, dayIndex: day, position: pos, kind: 'stay', stayName: name })
const travel = (id: string, day: number, pos: number, to: string): ItineraryItem =>
  ({ id, dayIndex: day, position: pos, kind: 'travel', travelMode: 'car', fromPlace: 'Dublin', toPlace: to, durationMins: 270 })

const COURSES = { c1: 'Carne' }
/** Round dates, keyed by the itinerary item that made them. */
const DATES = new Map<string, string | null>([
  ['g0', '2026-08-13'], ['g1', '2026-08-14'], ['g2', '2026-08-15'],
])

// ─── Up next ───────────────────────────────────────────────

section('Up next picks the next thing that has not happened')
{
  const items = [
    travel('t0', 0, 0, 'Carne'),
    golf('g0', 0, 1, '14:00'),
    stay('s0', 0, 2, 'The Shandon'),
    golf('g1', 1, 0, '09:20', 3),
    stay('s1', 1, 1, 'The Shandon'),
    golf('g2', 2, 0, '10:00'),
  ]

  // Before the trip: nothing's day has arrived, so the next round leads —
  // it is the only kind of item that can carry a countdown.
  const before = upNext(items, START, DATES, COURSES, new Date(2026, 7, 10, 9, 0))
  eq(before?.item.id, 'g0', 'before the trip, the first round leads')
  ok(!!before?.startsAt, '  …with a moment to count down to')

  // On the morning of day one, the drive is what is actually next.
  const driveDay = upNext(items, START, DATES, COURSES, new Date(2026, 7, 13, 8, 0))
  eq(driveDay?.item.id, 't0', 'once its day arrives, the journey takes the card')
  eq(driveDay?.startsAt, null, '  …and carries no invented time')

  // Same day, after the round has been and gone: the guesthouse is next.
  const evening = upNext(items, START, DATES, COURSES, new Date(2026, 7, 13, 21, 0))
  eq(evening?.item.id, 's0', 'a stay leads once the golf before it is done')

  // Day two, before the tee time.
  const dayTwo = upNext(items, START, DATES, COURSES, new Date(2026, 7, 14, 7, 0))
  eq(dayTwo?.item.id, 'g1', 'the next morning it is that day\'s round')
  eq(dayTwo?.groups, 3, '  …carrying how many groups go off')

  // The trip is over.
  eq(upNext(items, START, DATES, COURSES, new Date(2026, 8, 1, 9, 0)), null,
    'and once everything is behind you there is nothing next')

  eq(upNext([], START, DATES, COURSES, new Date(2026, 7, 13)), null,
    'a trip with no itinerary has nothing next either')
}

section('The server renders a stable answer, and the browser corrects it')
{
  const items = [travel('t0', 0, 0, 'Carne'), golf('g0', 0, 1, '14:00')]
  // With no clock, nothing has arrived and nothing is past — so the rule
  // falls to "the next golf item", which is what the server paints.
  const server = upNext(items, START, DATES, COURSES, null)
  eq(server?.item.id, 'g0', 'with no clock it is the next round')
}

section('Only golf can be counted down to')
{
  eq(momentOf('2026-08-14', '09:20')?.getHours(), 9, 'a date and a tee time make a moment')
  eq(momentOf('2026-08-14', '09:20')?.getDate(), 14, '  …on the right day')
  eq(momentOf('2026-08-14', null), null, 'no time, no moment')
  eq(momentOf(null, '09:20'), null, 'and no date, no moment')

  // Local, deliberately — "four hours until you tee off" has to be four
  // hours on the phone in your pocket.
  const m = momentOf('2026-08-14', '09:20')!
  eq(m.getTime(), new Date(2026, 7, 14, 9, 20).getTime(), 'built in local clock time, with no zone applied')

  eq(describeCountdown(3 * 86_400_000 + 4 * 3_600_000), '3 days 4 hr', 'days and hours')
  eq(describeCountdown(86_400_000), '1 day', 'one day reads singular')
  eq(describeCountdown(4 * 3_600_000 + 20 * 60_000), '4 hr 20 min', 'hours and minutes')
  eq(describeCountdown(35 * 60_000), '35 min', 'minutes alone')
  eq(describeCountdown(20_000), 'any minute', 'and under a minute says so')
  eq(describeCountdown(-5), '', 'a moment already gone has nothing to count')
  eq(describeCountdown(NaN), '', 'and nonsense counts nothing at all')
}

section('The card describes the trip, never the player')
{
  // Nothing on the platform records who is in which group, so the card says
  // how many go off and when the first one does. Anything narrower would be
  // invented.
  eq(describeGroups(3, '9:20 am'), '3 groups from 9:20 am', 'how many groups, and from when')
  eq(describeGroups(1, '9:20 am'), '1 group from 9:20 am', 'one group reads singular')
  eq(describeGroups(null, '9:20 am'), '', 'and a non-golf item claims no groups')

  const status = code('app/trip/[tripCode]/StatusBlock.tsx')
  ok(!/your tee time|you tee off at|Your group/i.test(status),
    'and nothing on the card claims a personal tee time')
}

section('Ordering and day arithmetic')
{
  const jumbled = [golf('g2', 2, 0, null), stay('s0', 0, 1, 'X'), travel('t0', 0, 0, 'Y')]
  eq(orderedItems(jumbled).map(i => i.id), ['t0', 's0', 'g2'], 'day first, then position within it')

  ok(dayArrived('2026-08-13', new Date(2026, 7, 13, 6, 0)), 'today counts as arrived')
  ok(dayArrived('2026-08-12', new Date(2026, 7, 13, 6, 0)), 'and so does yesterday')
  ok(!dayArrived('2026-08-14', new Date(2026, 7, 13, 23, 0)), 'tomorrow has not')
  ok(!dayArrived(null, new Date()), 'and a trip with no dates never has')
}

// ─── Standing: two paths, one answer ───────────────────────

section('The cheap standing path is taken only where it is right')
{
  const board = (over: Partial<Leaderboard>): Leaderboard => ({
    id: 'b', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total', ...over,
  })

  ok(usesSimpleStandings(board({})), 'an individual Stableford total takes the cheap path')

  // Every one of these would be answered wrongly by it.
  ok(!usesSimpleStandings(board({ scoring: 'strokes' })),
    'strokes does not — lowest wins, and the cheap path sorts the other way')
  ok(!usesSimpleStandings(board({ audience: 'team', teamFormat: 'better_ball' })),
    'a team board does not — it ranks teams, not people')
  ok(!usesSimpleStandings(board({ combine: 'position' })),
    'a prize table does not — it pays by place, not by the points that earned it')
  ok(!usesSimpleStandings({ id: 'm', audience: 'individual', competition: 'matchplay' }),
    'and a draw has no table at all')
  ok(!usesSimpleStandings(null), 'a trip playing for nothing has no standing')
}

section('Both standing paths give the same position on the same board')
{
  // The two paths exist because the full one costs nine queries and most
  // trips do not need it. Two implementations answering one question have to
  // be held against each other, or they drift and nobody notices until the
  // hub and the leaderboard disagree about who is winning.

  const PAR = 4
  const holes: RowHole[] = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: PAR, stroke_index: i + 1, course_id: 'c1',
  }))
  const rounds = [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }]
  const players = [
    { id: 'a', name: 'Alan',  handicap: 0, gender: 'M' },
    { id: 'b', name: 'Brian', handicap: 0, gender: 'M' },
    { id: 'c', name: 'Cara',  handicap: 0, gender: 'M' },
    { id: 'd', name: 'Dev',   handicap: 0, gender: 'M' },
  ]

  // Off scratch on a par-4 course, a par is 2 points and a birdie 3. Each
  // player birdies a fixed number of holes, so the totals are known and both
  // paths are looking at the very same cards.
  const birdies: Record<string, number> = { a: 0, b: 2, c: 2, d: 5 }

  const scoreRows = players.flatMap(p =>
    rounds.flatMap(r =>
      holes.map((h, i) => {
        const gross = i < birdies[p.id] ? PAR - 1 : PAR
        return {
          player_id: p.id, round_id: r.id, hole_id: h.id,
          gross_score: gross,
          stableford_points: Math.max(0, PAR + 2 - gross),
          no_return: false,
        }
      })))

  const hcpRows = players.flatMap(p =>
    rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: 0 })))

  const ctx: RowContext = {
    players, teams: [], memberships: [], holes,
    rounds: sortRounds(rounds),
    resolved: resolveScores(scoreRows, [], holes, new Map([['r1', 'c1'], ['r2', 'c1']])),
    hcpFor: handicapMap(hcpRows),
    liveRoundIds: new Set(), livePlayerIds: new Set(),
    legacyTeamScoring: null,
  }

  const cheapScores: SummaryScore[] = scoreRows.map(s => ({
    playerId: s.player_id, roundId: s.round_id, points: s.stableford_points,
  }))

  for (const discardWorst of [0, 1]) {
    const lb: Leaderboard = {
      id: 'b', audience: 'individual', competition: 'league',
      scoring: 'stableford', combine: 'total', discardWorst,
    }
    const rows = buildRows(lb, ctx)
    const table = standings(cheapScores, discardWorst)

    for (const p of players) {
      const cheap = placingFromStandings(p.id, table)
      const full = placingFromRows([p.id], rows)
      eq(full, cheap, `${p.name} sits in the same place either way (discard ${discardWorst})`)
    }
  }

  // And the place itself is right, ties shared the way a scoreboard reads.
  const lb: Leaderboard = {
    id: 'b', audience: 'individual', competition: 'league',
    scoring: 'stableford', combine: 'total', discardWorst: 0,
  }
  const rows = buildRows(lb, ctx)
  eq(placingFromRows(['d'], rows), { position: 1, field: 4 }, 'the best score leads')
  eq(placingFromRows(['b'], rows), { position: 2, field: 4 }, 'two level share second')
  eq(placingFromRows(['c'], rows), { position: 2, field: 4 }, '  …both of them')
  eq(placingFromRows(['a'], rows), { position: 4, field: 4 }, 'and the next one down is fourth, not third')

  eq(placingFromRows(['nobody'], rows), null, 'somebody with no card has no position')
  eq(placingFromStandings('nobody', standings(cheapScores, 0)), null, '  …by either path')

  eq(describePlacing({ position: 1, field: 12 }), '1st of 12', 'and it reads as a place')
  eq(describePlacing(null), '', 'with nothing to read when there is no place')
}

section('The hub gates the old team setting the way the leaderboard does')
{
  // A trip that has chosen real boards must not be scored on the trip-wide
  // options the old model carried. The leaderboard has always gated on
  // `isLegacy(stored)`; the hub parsed the column unconditionally, so a
  // leftover in `trips.team_scoring` scored the same cards two ways and put
  // a player in two different places on two screens.
  //
  // Reds score 2 a hole each, Blues 3 and 0. Both cards counting: Reds 72,
  // Blues 54. Only the best counting: Reds 36, Blues 54 — the lead changes
  // hands, and so does Alice's position.
  const holes: RowHole[] = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
  }))
  const people = [
    { id: 'p1', name: 'Alice', handicap: 0, gender: 'M' },
    { id: 'p2', name: 'Bob',   handicap: 0, gender: 'M' },
    { id: 'p3', name: 'Cara',  handicap: 0, gender: 'M' },
    { id: 'p4', name: 'Dan',   handicap: 0, gender: 'M' },
  ]
  const flat = (pid: string, pts: number) => holes.map(h => ({
    player_id: pid, round_id: 'r1', hole_id: h.id,
    gross_score: 6 - pts, stableford_points: pts, no_return: false,
  }))

  const stored = parseLeaderboards([{
    id: 'b-team', audience: 'team', competition: 'league', scoring: 'stableford',
    combine: 'total', teamFormat: 'better_ball', teamSet: 'main',
  }])
  const board = stored[0]
  // Left behind on the trip row by the model that came before the boards.
  const leftover = { mode: 'better_ball', countingScores: 1, aggregateFinish: 0, aggregateHoles: 18 }

  const base = {
    players: people,
    teams: [
      { id: 't1', name: 'Reds',  color: '#B5533C', team_set: 'main' },
      { id: 't2', name: 'Blues', color: '#0A9D56', team_set: 'main' },
    ],
    memberships: [
      { team_id: 't1', team_set: 'main', player_id: 'p1' },
      { team_id: 't1', team_set: 'main', player_id: 'p2' },
      { team_id: 't2', team_set: 'main', player_id: 'p3' },
      { team_id: 't2', team_set: 'main', player_id: 'p4' },
    ],
    holes,
    rounds: [{ id: 'r1', round_number: 1 }],
    courseByRound: new Map([['r1', 'c1']]),
    scores: [...flat('p1', 2), ...flat('p2', 2), ...flat('p3', 3), ...flat('p4', 0)],
    liveScores: [],
    roundHandicaps: people.map(p => ({ round_id: 'r1', player_id: p.id, playing_handicap: 0 })),
    tees: [],
    activeRoundIds: [],
    livePlayerIds: [],
  }

  ok(!isLegacy(stored), 'a trip with a stored board list is not a legacy trip')

  const gated = buildRows(board, buildRowContext({
    ...base, legacyTeamScoring: isLegacy(stored) ? parseTeamScoring(leftover) : null,
  }))
  const ungated = buildRows(board, buildRowContext({
    ...base, legacyTeamScoring: parseTeamScoring(leftover),
  }))

  // The bug, stated as the thing it did: the two disagree, and not subtly.
  eq(gated.map(r => r.total), [72, 54], 'gated, both cards count and Reds lead')
  eq(ungated.map(r => r.total), [54, 36], 'ungated, only the best counts and Blues lead')
  eq(placingFromRows(['p1'], gated), { position: 1, field: 2 }, 'Alice is first on the gated board')
  eq(placingFromRows(['p1'], ungated), { position: 2, field: 2 }, '  …and second on the ungated one')

  // So the hub must gate. It takes the setting already gated, from the page,
  // exactly as the leaderboard page hands it to the leaderboard.
  const hub = code('lib/hubStanding.ts')
  ok(!hub.includes('parseTeamScoring('),
    'hubStanding does not parse the column itself any more')
  ok(hub.includes('legacyTeamScoring: TeamScoring | null'),
    '  …it is handed the setting, already decided')
  const hubPage = code('app/trip/[tripCode]/page.tsx')
  ok(/isLegacy\(parseLeaderboards\(trip\.leaderboards\)\)/.test(hubPage),
    'and the hub page gates it on isLegacy, the same expression the leaderboard page uses')
}

// ─── The draw ──────────────────────────────────────────────

section('The next match, in all four states it can be in')
{
  const m = (over: Partial<DrawMatch>): DrawMatch => ({
    roundNumber: 1, roundName: 'Quarter-final',
    sideA: null, sideB: null, aIsBye: false, bIsBye: false, winner: null, ...over,
  })
  const named = (id: string) => ({ ross: 'Ross', alan: 'Alan' } as Record<string, string>)[id] ?? null

  // 1. The opponent is known.
  const known = nextMatch('me', [m({ sideA: 'me', sideB: 'ross' })])
  eq(known, { state: 'match', roundName: 'Quarter-final', opponentId: 'ross' }, 'an opponent who is known')
  eq(describeNextMatch(known, named), 'Plays Ross · Quarter-final', '  …reads as a name and a round')

  // 2. The match feeding this one has not been played.
  const waiting = nextMatch('me', [m({ sideA: 'me', sideB: null, roundName: 'Semi-final' })])
  eq(waiting?.state, 'undecided', 'an opponent still to be decided')
  eq(describeNextMatch(waiting, named), 'Semi-final · opponent to be decided',
    '  …says so rather than printing a blank where a name goes')

  // 3. A bye is awarded, not played.
  const bye = nextMatch('me', [m({ sideA: 'me', sideB: null, bIsBye: true, roundName: 'Semi-final' })])
  eq(bye?.state, 'bye', 'a bye')
  eq(describeNextMatch(bye, named), 'Bye into the semi-final', '  …reads as a walk into the next round')

  // 4. Out, or never in it.
  eq(nextMatch('me', [m({ sideA: 'me', sideB: 'ross', winner: 'ross' })]), null,
    'a decided match is not a next match')
  eq(nextMatch('me', [m({ sideA: 'ross', sideB: 'alan' })]), null, 'and neither is somebody else\'s')
  eq(nextMatch(null, [m({ sideA: 'me', sideB: 'ross' })]), null,
    'an entrant who does not exist has no next match')
  eq(describeNextMatch(null, named), '', 'and there is nothing to print for any of that')

  // Earliest round first, so a player is told about the tie in front of them.
  const two = nextMatch('me', [
    m({ roundNumber: 2, roundName: 'Semi-final', sideA: 'me', sideB: 'alan' }),
    m({ roundNumber: 1, roundName: 'Quarter-final', sideA: 'me', sideB: 'ross' }),
  ])
  eq((two as { opponentId: string }).opponentId, 'ross', 'the nearest round comes first')

  // An id naming nobody is an undecided opponent, not an empty name.
  eq(describeNextMatch({ state: 'match', roundName: 'Final', opponentId: 'ghost' }, named),
    'Final · opponent to be decided', 'an unresolvable opponent does not print blank')
}

section('A pairs draw is between pairings, not players')
{
  const hub = code('app/trip/[tripCode]/page.tsx')
  ok(hub.includes('needsPairings'), 'the hub asks whether the draw is between pairings')
  ok(hub.includes('teamFor'), '  …and resolves the entrant to their pairing when it is')
  ok(hub.includes('setOf'), '  …on that draw\'s own sheet, not whichever team they play the league in')
}

// ─── Travel and accommodation ──────────────────────────────

section('Consecutive nights in one place are one booking')
{
  const items = [
    stay('s0', 0, 1, 'The Shandon'),
    stay('s1', 1, 1, 'The Shandon '),
    stay('s2', 2, 1, 'the shandon'),
    stay('s3', 3, 1, 'Downhill House'),
  ]
  const runs = stayRuns(items)
  eq(runs.length, 2, 'four rows, two bookings')
  eq(runs[0], { name: 'The Shandon', fromDay: 0, nights: 3 }, 'three nights in the one place')
  eq(runs[1].nights, 1, 'and one in the next')

  // A gap breaks the run: reading two separate nights as one stay would be a
  // lie about the night in between.
  const split = stayRuns([
    stay('a', 0, 1, 'The Shandon'),
    stay('b', 1, 1, 'Somewhere Else'),
    stay('c', 2, 1, 'The Shandon'),
  ])
  eq(split.map(r => r.nights), [1, 1, 1], 'a night elsewhere splits the run')
  eq(split.map(r => r.name), ['The Shandon', 'Somewhere Else', 'The Shandon'], '  …into three bookings')

  eq(stayRuns([stay('x', 0, 1, '   ')]), [], 'a blank name is not a booking')

  // Asserted by what it contains rather than character for character — the
  // date itself is `describeDay`, whose punctuation is the locale's business.
  const threeNights = describeStayRun({ name: 'X', fromDay: 0, nights: 3 }, START)
  ok(threeNights.includes('13 August') && threeNights.includes('Thursday'),
    'a run reads as the day of its first night')
  ok(threeNights.includes('3 nights'), '  …and how many nights it runs')
  ok(!describeStayRun({ name: 'X', fromDay: 0, nights: 1 }, START).includes('night'),
    'and one night does not say "1 night"')
}

section('Every place gets a map, and nothing gets a dead link')
{
  const url = mapsUrl('The Shandon Hotel')!
  ok(url.startsWith('https://www.google.com/maps/search/'), 'a place becomes a maps search')
  ok(url.includes('The%20Shandon%20Hotel'), '  …with the name encoded into the query')

  eq(mapsUrl(''), null, 'a blank place gets no link')
  eq(mapsUrl('   '), null, 'and neither does whitespace')
  eq(mapsUrl(null), null, 'nor a missing one')

  // The scheme and host are fixed and only the query is interpolated, so
  // nothing anybody types can change where the link goes.
  ok(mapsUrl('javascript:alert(1)')!.startsWith('https://www.google.com/'),
    'a href can never be made to point anywhere else')
  ok(!mapsUrl('a&b=c')!.includes('&b=c'), 'and a stray parameter cannot be smuggled in')
}

section('Journeys carry their mode')
{
  const legs = travelLegs([travel('t0', 1, 0, 'Carne'), travel('t1', 0, 0, 'Ballina')])
  eq(legs.map(l => l.dayIndex), [0, 1], 'in the order they happen')
  eq(legs[0].mode, 'car', 'each knowing how it is made')
  eq(legs[0].duration, '4 hr 30', 'and how long it takes')

  // One icon per mode the itinerary can actually store. A ferry or a bus
  // cannot be entered, so an icon for either would be one nothing selects.
  const icons = read('app/components/icons.tsx')
  for (const icon of ['IconCar', 'IconPlane', 'IconTrain']) {
    ok(icons.includes(`export const ${icon}`), `${icon} exists`)
  }
  const travelSection = code('app/trip/[tripCode]/TravelStays.tsx')
  ok(travelSection.includes('IconCar') && travelSection.includes('IconPlane')
     && travelSection.includes('IconTrain'), 'and the section draws all three')
  ok(travelSection.includes('IconHome'), 'with the existing home icon for a stay')
}

section('A live score counts only while its card is open')
{
  // `live_scores` has no foreign key to `live_rounds` — migration 003 rekeyed
  // it to (player_id, round_id, hole_number), and only the locks cascade when
  // a session ends. So a card half-entered and abandoned leaves its holes in
  // the table for good, and the hourly cleanup deliberately will not close a
  // session that has any scores against it.
  const holes: RowHole[] = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
  }))
  const base = {
    players: [{ id: 'p1', name: 'Alice', handicap: 0, gender: 'M' }],
    teams: [], memberships: [], holes,
    rounds: [{ id: 'r1', round_number: 1 }],
    courseByRound: new Map([['r1', 'c1']]),
    scores: [],
    roundHandicaps: [{ round_id: 'r1', player_id: 'p1', playing_handicap: 0 }],
    tees: [], livePlayerIds: [], legacyTeamScoring: null,
  }
  const orphans = [1, 2, 3, 4, 5, 6, 7].map(n => ({
    player_id: 'p1', round_id: 'r1', hole_number: n, gross_score: 4, stableford_points: 2,
  }))

  const abandoned = buildRowContext({ ...base, liveScores: orphans, activeRoundIds: [] })
  eq(abandoned.resolved.length, 0, 'scores with no card open are not read at all')
  eq([...abandoned.liveRoundIds], [], '  …and the round they sit on is not in play')

  const openCard = buildRowContext({ ...base, liveScores: orphans, activeRoundIds: ['r1'] })
  eq(openCard.resolved.length, 7, 'the same rows count while the card is open')
  ok(openCard.resolved.every(s => s.live), '  …and every one of them reads as in progress')
  eq([...openCard.liveRoundIds], ['r1'], '  …with the round in play')

  // The orphans are ignored, not deleted. Nothing is removed on the strength
  // of an inference about a session that ended.
  const ctx = code('lib/rowContext.ts')
  ok(!/delete/i.test(ctx), 'nothing is deleted to achieve it')

  // The round picker applies the same rule, or a tile says "Scores in" on a
  // round the board shows as empty.
  const picker = code('app/trip/[tripCode]/scoring/page.tsx')
  ok(/openRounds\.has\(id\)/.test(picker),
    'the round picker counts uncommitted scores only against an open card')
}

// ─── The round summary ─────────────────────────────────────

section('A podium reads places off the shared order, and never sorts')
{
  const row = (id: string, name: string, total: number): BoardRow => ({
    id, name, subLabel: '', perRound: {}, playedRounds: [], total,
    isLive: false, playerIds: [id],
  })

  // Already in finishing order — that is what buildRows hands back, and this
  // reads places off it rather than deciding any.
  const clear = [row('a', 'Alice', 82), row('b', 'Bob', 74), row('c', 'Cara', 70), row('d', 'Dan', 66)]
  eq(podium(clear).map(p => [p.name, p.position]),
    [['Alice', 1], ['Bob', 2], ['Cara', 3]], 'three names, three places')
  eq(podium(clear).length, 3, 'and no more than three')

  // Two level for second: both second, and the next one is fourth.
  const tied = [row('a', 'Alice', 82), row('b', 'Bob', 74), row('c', 'Cara', 74), row('d', 'Dan', 66)]
  eq(podium(tied).map(p => p.position), [1, 2, 2], 'two level share second')
  eq(podium(tied, 4).map(p => p.position), [1, 2, 2, 4], '  …and the next is fourth, not third')

  // Three level at the top are all first.
  const three = [row('a', 'A', 74), row('b', 'B', 74), row('c', 'C', 74), row('d', 'D', 66)]
  eq(podium(three).map(p => p.position), [1, 1, 1], 'three level are all first')
  eq(podium(three, 4).map(p => p.position), [1, 1, 1, 4], '  …and the next is fourth')

  eq(podium([]), [], 'a round nobody played has no podium')
  eq(podium([row('a', 'Alice', 74)]).length, 1, 'and a field of one is a field of one')

  // The tie rule is the same one the standing line reads.
  eq(podium(tied)[1].position, placingFromRows(['b'], tied)?.position,
    'and it is the same place the standing line would give them')

  // No comparator anywhere on the page or in the reader.
  const standing = code('lib/standing.ts')
  ok(!/\.sort\(/.test(standing), 'lib/standing.ts sorts nothing')
  const page = code('app/trip/[tripCode]/round/[roundNumber]/page.tsx')
  ok(!/\.sort\(/.test(page), 'and neither does the round summary')
  ok(page.includes('podium('), '  …it reads the shared one')
  ok(page.includes('fetchRoundRows'), '  …built through the shared assembly')
}

section('A round result drops the trip\'s discard rule')
{
  // A trip that throws away your worst round has nothing to say about a
  // table built from exactly one: discarding the only card puts the whole
  // field on nothing.
  const hub = code('lib/hubStanding.ts')
  ok(/discardWorst: 0/.test(hub), 'the round podium zeroes the discard')
  ok(/fetchRoundRows/.test(hub), '  …in the one place that fetches a round\'s board')
}

section('The card is one set of numbers, never two')
{
  const holes: RowHole[] = Array.from({ length: 18 }, (_, i) => ({
    id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
    par_ladies: i < 6 ? 5 : 4, stroke_index_ladies: 18 - i,
  }))
  const plain: RowHole[] = holes.map(h => ({ ...h, par_ladies: null, stroke_index_ladies: null }))

  ok(hasLadiesCard(holes), 'a course with both ladies columns has a ladies card')
  ok(!hasLadiesCard(plain), 'and one with neither does not')
  ok(!hasLadiesCard(holes.map(h => ({ ...h, stroke_index_ladies: null }))),
    'half a ladies card is not one — it would print two sets of numbers at once')

  const mens = courseCard(holes, 'M')
  const ladies = courseCard(holes, 'F')
  eq(mens.par, 72, 'the men play a par 72 here')
  eq(ladies.par, 78, 'and the ladies card is six shots longer')
  ok(!mens.ladies, 'the card knows which it is showing')
  ok(ladies.ladies, '  …either way')

  // A course with no ladies data shows the men's to everybody.
  eq(courseCard(plain, 'F').par, 72, 'no ladies data, no ladies card')
  ok(!courseCard(plain, 'F').ladies, '  …and it does not claim to be one')

  eq(mens.front.holes.length, 9, 'nine out')
  eq(mens.back.holes.length, 9, 'nine in')
  eq(mens.front.par + mens.back.par, mens.par, 'and the two add up to the total')
  eq(mens.front.holes[0].number, 1, 'the front nine starts at one')
  eq(mens.back.holes[0].number, 10, 'and the back nine at ten')

  ok(!hasCard([]), 'a course with no holes recorded has no card')

  // Yardages exist as columns and have never held a value. No empty column.
  // Comments stripped: explaining why there is no yardage row is fine, and
  // is worth keeping. Rendering one is not.
  const cardFile = code('app/trip/[tripCode]/round/[roundNumber]/RoundCard.tsx')
  ok(!/yardage/i.test(cardFile), 'and no yardage row anywhere')
  const summary = code('app/trip/[tripCode]/round/[roundNumber]/page.tsx')
  ok(!/yardage/i.test(summary), '  …on the page either')
}

section('The round summary reuses, and invents nothing')
{
  const page = read('app/trip/[tripCode]/round/[roundNumber]/page.tsx')

  for (const [what, token] of [
    ['who is holding the phone', 'currentPlayer'],
    ['the maps link', 'mapsUrl'],
    ['the tee-time phrasing', 'describeGroups'],
    ['the day phrasing', 'describeDay'],
    ['the shared board fetch', 'fetchRoundRows'],
    ['the shared podium reader', 'podium'],
  ] as const) {
    ok(page.includes(token), `it reuses ${what}`)
  }

  // Weather: two slots, no data, and nothing that looks like a reading.
  ok(/Not available yet/.test(page), 'weather says plainly that it is not there')
  eq((page.match(/WeatherSlot label=/g) ?? []).length, 2, 'two slots: now, and at the tee')
  ok(!/°|celsius|fahrenheit|mph|km\/h/i.test(page), 'and no invented figure of any kind')

  // The scoring shortcut goes to the renamed route.
  ok(page.includes('/scoring/${round.round_number}'), 'the shortcut routes into live scoring')

  // No glow, anywhere.
  ok(!/shadow-\[0_0_/.test(page), 'the page adds no glow')
  ok(!page.includes('ROUND_TILE.live'), '  …and never touches the state that carries one')
}

section('Only golf opens a page')
{
  const itin = code('app/trip/[tripCode]/Itinerary.tsx')
  ok(itin.includes('roundNumbers'), 'the itinerary is told which items became rounds')
  ok(/kind !== 'golf'[\s\S]{0,200}SubtleRow/.test(itin),
    'a stay or a journey is still the plain row it was')
  ok(/roundNumber != null \?[\s\S]{0,200}Link/.test(itin),
    'and a golf item with a round behind it becomes a link')

  const status = code('app/trip/[tripCode]/StatusBlock.tsx')
  ok(/next\?\.item\.kind === 'golf'/.test(status),
    'up next links through only when the next thing is golf')
}

// ─── The page itself ───────────────────────────────────────

section('The hub is the sections it should be, and nothing else')
{
  const hub = read('app/trip/[tripCode]/page.tsx')
  const hubCode = code('app/trip/[tripCode]/page.tsx')

  ok(hub.includes('SectionStack'), 'the collapsible sections are one shared component')
  ok(hub.includes("initial=\"itinerary\""), 'and the itinerary is the one open on arrival')

  for (const title of ['Itinerary', 'Travel & accommodation', 'Players']) {
    ok(hub.includes(`'${title}'`) || hub.includes(`"${title}"`), `there is a ${title} section`)
  }

  // "The plan" was what the itinerary called itself. It is Itinerary now,
  // everywhere a reader can see it.
  for (const f of ['app/trip/[tripCode]/page.tsx', 'app/trip/[tripCode]/Itinerary.tsx']) {
    ok(!/The plan/.test(read(f)), `"The plan" is gone from ${f.split('/').pop()}`)
  }

  // The stat tiles are deleted, not relocated. Stats are Phase 4.
  ok(!/Your stats|Trip stats|coming soon/i.test(hub), 'no empty stats headings')

  // Phase 1's rules still hold on this page.
  ok(hubCode.includes('currentPlayer'), 'the cookie is read through the shared helper')
  ok(!hubCode.includes('playerCookieName'), '  …and never directly')
  ok(hubCode.includes('isConfirmed'), 'confirmation goes through the shared test')
  ok(!/claimed === true/.test(hubCode), '  …rather than being restated here')
  ok(hub.includes("from '@/lib/roundState'"), 'the two player states share the round tile treatment')
  ok(!hub.includes('ROUND_TILE.live'), '  …and never the glowing one')
  ok(!hub.includes('shadow-[0_0_'), '  …and the hub adds no glow of its own')

  // A failed query is said out loud rather than rendering as an absence.
  ok(hubCode.includes('standingError'), 'a standing that could not be worked out says so')
}

section('One section is open at a time')
{
  const stack = code('app/components/Section.tsx')
  ok(stack.includes('openKey'), 'the stack owns which one is open')
  ok(/k === s\.key \? null : s\.key/.test(stack), 'and opening one closes whichever was')

  // Motion: the guide allows 250–350ms for something this size, ease-out,
  // and nothing on this page may glow.
  ok(stack.includes('duration-300') && stack.includes('ease-out'), 'it opens over 300ms, ease-out')
  ok(!stack.includes('shadow-[0_0_'), 'and nothing about it glows')
}

// ─── Result ────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
