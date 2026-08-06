/**
 * The leaderboard's golden master. Run with: npm run test:golden
 * Re-record with:                            npm run test:golden -- --update
 *
 * This is not a test of whether the leaderboard is *right*. It is a test of
 * whether it still does exactly what it did before somebody moved the code —
 * so it asserts on the rendered markup, byte for byte, against a fixture
 * recorded from the version that was running beforehand.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ NEVER re-record to make a failing run pass.                          │
 * │                                                                     │
 * │ A difference here means the calculation changed. That is either a    │
 * │ bug being introduced or a bug being fixed, and both deserve to be    │
 * │ looked at rather than absorbed. `--update` is for a deliberate,      │
 * │ separately-committed behaviour change, and the diff it produces is   │
 * │ the thing worth reading.                                            │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * The markup rather than the row objects, deliberately: the rows are an
 * internal shape that an extraction is allowed to change, while what the
 * reader sees is the contract. It also catches an ordering change and a
 * display change with one assertion.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'fs'
import path from 'path'
import TripLeaderboardClient from '../app/trip/[tripCode]/leaderboard/TripLeaderboardClient'
import type { Leaderboard } from '../lib/leaderboards'
import type { TeamScoring } from '../lib/teamScoring'

const UPDATE = process.argv.includes('--update')
const FIXTURE = path.join('scripts', 'fixtures', 'leaderboard-golden.json')

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── The trip ──────────────────────────────────────────────
//
// Four players, two rounds, one course. Cara plays the ladies tees and the
// course has its own par and stroke index for them — deliberately different
// from the men's, or the case would prove nothing.

const players = [
  { id: 'p1', name: 'Alice Nolan', handicap: 10, gender: 'M' },
  { id: 'p2', name: 'Bob Ryan',    handicap: 14, gender: 'M' },
  { id: 'p3', name: 'Cara Walsh',  handicap: 18, gender: 'F' },
  { id: 'p4', name: 'Dan Byrne',   handicap: 10, gender: 'M' },
]

const rounds = [
  { id: 'r1', round_number: 1, status: 'completed', courses: { id: 'c1', name: 'Ballyliffin' } },
  { id: 'r2', round_number: 2, status: 'completed', courses: { id: 'c1', name: 'Portsalon' } },
]

/**
 * Par 4 throughout for the men. The ladies card differs on both counts —
 * the first six are par 5, and the stroke index runs the other way — so a
 * board that consults it lands somewhere a board that does not cannot.
 */
const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`,
  hole_number: i + 1,
  par: 4,
  stroke_index: i + 1,
  course_id: 'c1',
  par_ladies: i < 6 ? 5 : 4,
  stroke_index_ladies: 18 - i,
}))

/** The same course with no ladies card recorded against it. */
const holesNoLadies = holes.map(h => ({
  ...h, par_ladies: null, stroke_index_ladies: null,
}))

/** Every hole of a round at the same score. */
function card(playerId: string, roundId: string, pointsPerHole: number) {
  return holes.map(h => ({
    player_id: playerId,
    hole_id: h.id,
    round_id: roundId,
    gross_score: 6 - pointsPerHole,
    stableford_points: pointsPerHole,
    no_return: false,
  }))
}

/** Holes 1..n of a round, still sitting in the in-progress table. */
function liveCard(playerId: string, roundId: string, upTo: number, pointsPerHole: number) {
  return holes.slice(0, upTo).map(h => ({
    player_id: playerId,
    round_id: roundId,
    hole_number: h.hole_number,
    gross_score: 6 - pointsPerHole,
    stableford_points: pointsPerHole,
  }))
}

// Round totals: Alice 54/18, Bob 36/36, Cara 36/36, Dan 18/18.
// Which puts Alice, Bob and Cara all on 72 — a three-way tie at the top —
// and gives the discard rule something to bite on.
const scores = [
  ...card('p1', 'r1', 3), ...card('p2', 'r1', 2), ...card('p3', 'r1', 2), ...card('p4', 'r1', 1),
  ...card('p1', 'r2', 1), ...card('p2', 'r2', 2), ...card('p3', 'r2', 2), ...card('p4', 'r2', 1),
]

const roundHandicaps = players.flatMap(p =>
  rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap })))

/** The same, with the tee each round was played off recorded against it. */
const roundHandicapsWithTees = players.flatMap(p =>
  rounds.map(r => ({
    round_id: r.id, player_id: p.id, playing_handicap: p.handicap,
    tee_id: p.gender === 'F' ? 'tee-red' : 'tee-white',
  })))

/**
 * Ratings only — enough to rebuild a course handicap before it was rounded.
 * A slope away from 113 is what makes the unrounded figure differ from the
 * stored whole number, which is the whole point of the allowance case.
 */
const tees = [
  { id: 'tee-white', slope: 132, course_rating: 72.4, par: 72 },
  { id: 'tee-red',   slope: 128, course_rating: 73.1, par: 74 },
]

const teams = [
  { id: 't1', name: 'Reds',  color: '#B5533C', team_set: 'main' },
  { id: 't2', name: 'Blues', color: '#0A9D56', team_set: 'main' },
]
const memberships = [
  { team_id: 't1', team_set: 'main', player_id: 'p1' },
  { team_id: 't1', team_set: 'main', player_id: 'p2' },
  { team_id: 't2', team_set: 'main', player_id: 'p3' },
  { team_id: 't2', team_set: 'main', player_id: 'p4' },
]

// ─── The boards ────────────────────────────────────────────

const SF = (discardWorst = 0, handicapAllowance?: number): Leaderboard => ({
  id: 'b-sf', audience: 'individual', competition: 'league',
  scoring: 'stableford', combine: 'total', discardWorst,
  ...(handicapAllowance ? { handicapAllowance } : {}),
})

const ST = (discardWorst = 0, handicapAllowance?: number): Leaderboard => ({
  id: 'b-st', audience: 'individual', competition: 'league',
  scoring: 'strokes', combine: 'total', discardWorst,
  ...(handicapAllowance ? { handicapAllowance } : {}),
})

const TEAM = (handicapAllowance?: number): Leaderboard => ({
  id: 'b-team', audience: 'team', competition: 'league',
  scoring: 'stableford', combine: 'total', teamFormat: 'better_ball',
  teamSet: 'main', ...(handicapAllowance ? { handicapAllowance } : {}),
})

// ─── Rendering one case ────────────────────────────────────

type Opts = {
  players?: unknown[]
  holes?: unknown[]
  scores?: unknown[]
  liveScores?: unknown[]
  activeRoundIds?: string[]
  livePlayerIds?: string[]
  teams?: unknown[]
  memberships?: unknown[]
  roundHandicaps?: unknown[]
  tees?: unknown[]
  legacyTeamScoring?: TeamScoring | null
}

function render(boards: Leaderboard[], opts: Opts = {}): string {
  return renderToStaticMarkup(
    React.createElement(TripLeaderboardClient, {
      tripCode: 'ABC123',
      boards,
      activeRoundIds: opts.activeRoundIds ?? [],
      livePlayerIds: opts.livePlayerIds ?? [],
      legacyTeamScoring: opts.legacyTeamScoring ?? null,
      rounds,
      teams: opts.teams ?? [],
      memberships: opts.memberships ?? [],
      players: opts.players ?? players,
      holes: opts.holes ?? holes,
      scores: opts.scores ?? scores,
      liveScores: opts.liveScores ?? [],
      roundHandicaps: opts.roundHandicaps ?? roundHandicaps,
      tees: opts.tees ?? [],
    } as never))
}

// ─── The cases ─────────────────────────────────────────────
//
// Each one is a board shape the calculation treats differently. If a change
// to the maths cannot move any of these, it cannot move a real trip either.

const CASES: Record<string, () => string> = {
  // The board most trips run, and the same board dropping a round.
  'stableford-discard-0': () => render([SF(0)]),
  'stableford-discard-1': () => render([SF(1)]),

  // Lowest wins, and it sorts the other way.
  'strokes-discard-0': () => render([ST(0)]),
  'strokes-discard-1': () => render([ST(1)]),

  // Teams rank teams, not people.
  'team-better-ball': () => render([TEAM()], { teams, memberships }),

  // Three level at the top. The base fixture is built that way, so this is
  // the same render as `stableford-discard-0` — kept under its own name so
  // the case cannot be dropped without the coverage check noticing.
  'tie-three-way': () => render([SF(0)]),

  // Two level: Cara drops a shot a hole in the second round.
  'tie-two-way': () => render([SF(0)], {
    scores: [
      ...card('p1', 'r1', 3), ...card('p2', 'r1', 2), ...card('p3', 'r1', 2), ...card('p4', 'r1', 1),
      ...card('p1', 'r2', 1), ...card('p2', 'r2', 2), ...card('p3', 'r2', 1), ...card('p4', 'r2', 1),
    ],
  }),

  // A percentage of the course handicap, off the unrounded figure — which
  // only exists where a tee was recorded against the round.
  'allowance-85-stableford': () => render([SF(0, 85)], {
    roundHandicaps: roundHandicapsWithTees, tees,
  }),
  'allowance-85-strokes': () => render([ST(0, 85)], {
    roundHandicaps: roundHandicapsWithTees, tees,
  }),
  'allowance-85-team': () => render([TEAM(85)], {
    teams, memberships, roundHandicaps: roundHandicapsWithTees, tees,
  }),

  // Somebody who did not play the second round at all. Not the same as
  // having played it badly.
  'missing-round': () => render([SF(0)], {
    scores: scores.filter(s => !(s.player_id === 'p2' && s.round_id === 'r2')),
  }),

  // A card open on the second round, eleven holes in.
  'live-in-progress': () => render([SF(0)], {
    scores: scores.filter(s => s.round_id === 'r1'),
    liveScores: [
      ...liveCard('p1', 'r2', 11, 2),
      ...liveCard('p2', 'r2', 11, 3),
    ],
    activeRoundIds: ['r2'],
    livePlayerIds: ['p1', 'p2'],
  }),

  // ── The phantom ──
  //
  // Live scores sitting against a round with no card open on it. They get
  // there because `live_scores` has no foreign key to `live_rounds` — the
  // locks cascade when a session ends and the scores do not — so a card
  // half-entered and abandoned leaves its holes behind for good.
  'live-scores-with-no-open-card': () => render([SF(0)], {
    scores: scores.filter(s => s.round_id === 'r1'),
    liveScores: liveCard('p1', 'r2', 7, 3),
    activeRoundIds: [],
    livePlayerIds: [],
  }),

  // Committed always wins over in-progress for the same hole.
  'live-overlapping-committed': () => render([SF(0)], {
    liveScores: liveCard('p1', 'r1', 18, 1),
    activeRoundIds: ['r1'],
    livePlayerIds: ['p1'],
  }),

  // ── The ladies card ──
  //
  // par_ladies and stroke_index_ladies are only consulted where the points
  // are worked out from the gross — a strokes board, or any board playing
  // off a reduction. At the full allowance on Stableford the stored trigger
  // points are used as they stand and the hole is never looked at, so a
  // ladies case there would prove nothing.
  // Paired with the same board over a card that has no ladies data at all.
  // The two must differ, and the check below says so out loud — a ladies
  // case that renders identically to the men's card proves nothing.
  //
  // The strokes pair is a round still being played, and it has to be. Over a
  // **complete** card the ladies stroke index cannot change a strokes total:
  // shots received across all eighteen holes add up to the handicap however
  // the index is ordered, and the ladies par only enters the against-level
  // figure, which a finished round does not print. Half a card played, and
  // both halves of that bite — which holes carried a shot, and what par the
  // holes played were measured against.
  'ladies-strokes-with-data': () => render([ST(0)], {
    scores: scores.filter(s => s.round_id === 'r1'),
    liveScores: [...liveCard('p3', 'r2', 11, 2), ...liveCard('p1', 'r2', 11, 2)],
    activeRoundIds: ['r2'], livePlayerIds: ['p1', 'p3'],
  }),
  'ladies-strokes-without-data': () => render([ST(0)], {
    holes: holesNoLadies,
    scores: scores.filter(s => s.round_id === 'r1'),
    liveScores: [...liveCard('p3', 'r2', 11, 2), ...liveCard('p1', 'r2', 11, 2)],
    activeRoundIds: ['r2'], livePlayerIds: ['p1', 'p3'],
  }),
  'ladies-allowance-85-with-data': () => render([SF(0, 85)], {
    roundHandicaps: roundHandicapsWithTees, tees,
  }),
  'ladies-allowance-85-without-data': () => render([SF(0, 85)], {
    holes: holesNoLadies, roundHandicaps: roundHandicapsWithTees, tees,
  }),

  // More than one board on a trip: tab order, and which one leads.
  'two-boards-sf-then-strokes': () => render([SF(0), ST(0)]),
  'two-boards-strokes-then-sf': () => render([ST(0), SF(0)]),
  'three-boards-with-team': () => render([SF(0), TEAM(), ST(1)], { teams, memberships }),

  // A draw alongside a league: matchplay is a button, not a tab.
  'league-plus-matchplay': () => render([
    SF(0), { id: 'b-mp', audience: 'individual', competition: 'matchplay' },
  ]),
}

// ─── Compare, or record ────────────────────────────────────

const current: Record<string, string> = {}
for (const [name, run] of Object.entries(CASES)) current[name] = run()

if (UPDATE) {
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true })
  fs.writeFileSync(FIXTURE, JSON.stringify(current, null, 2) + '\n')
  console.log(`\nRecorded ${Object.keys(current).length} cases to ${FIXTURE}`)
  console.log('Read the diff before committing it.')
  process.exit(0)
}

if (!fs.existsSync(FIXTURE)) {
  console.log(`\nNo fixture at ${FIXTURE}. Record one with:\n  npm run test:golden -- --update`)
  process.exit(1)
}

const golden: Record<string, string> = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'))

section('The leaderboard renders exactly what it rendered before')
{
  for (const name of Object.keys(CASES)) {
    const want = golden[name]
    const got = current[name]
    if (want === undefined) {
      ok(false, `${name} — no recorded output. Re-record deliberately if this case is new.`)
      continue
    }
    if (want === got) { passed++; continue }

    failed++
    failures.push(name)
    console.log(`  FAIL  ${name} — the rendered board changed`)
    console.log(`        ${describeDiff(want, got)}`)
  }
}

section('The ladies card actually changes the answer')
{
  // If these matched, the fixture would be recording that ladies data is
  // read — while proving only that the file parses.
  ok(current['ladies-strokes-with-data'] !== current['ladies-strokes-without-data'],
    'a strokes card in progress reads against the ladies par and stroke index')
  ok(current['ladies-allowance-85-with-data'] !== current['ladies-allowance-85-without-data'],
    'and so does a board playing off a reduction')
}

section('Every recorded case is still exercised')
{
  for (const name of Object.keys(golden)) {
    ok(name in CASES, `${name} is still covered — a case cannot be dropped silently`)
  }
}

/** Where two renders part company, in a form worth reading. */
function describeDiff(want: string, got: string): string {
  let i = 0
  while (i < want.length && i < got.length && want[i] === got[i]) i++
  const from = Math.max(0, i - 60)
  return [
    `first difference at character ${i} of ${want.length}`,
    `  was: …${want.slice(from, i + 60)}…`,
    `  now: …${got.slice(from, i + 60)}…`,
  ].join('\n        ')
}

// ─── Result ────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  console.log('\nDo NOT re-record to make this pass. Find out what moved.')
  process.exit(1)
}
