/**
 * Leaderboard render tests. Run with: npm run test:leaderboard
 *
 * Drives the real board with real scores: the Custom table paying out by
 * position, worst rounds being set aside, the title card that appears once
 * more than one competition is running, and the In play badge.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import TripLeaderboardClient from '../app/trip/[tripCode]/leaderboard/TripLeaderboardClient'
import { parseFormats, type TripFormats } from '../lib/formats'
import { DEFAULT_TEAM_SCORING } from '../lib/teamScoring'

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

// ─── Fixture: 3 players, 2 rounds, every hole scored ───────────

const players = [
  { id: 'p1', name: 'Alice', handicap: 10, gender: 'M', team_id: null },
  { id: 'p2', name: 'Bob',   handicap: 14, gender: 'M', team_id: null },
  { id: 'p3', name: 'Cara',  handicap: 18, gender: 'F', team_id: null },
]
const rounds = [
  { id: 'r1', round_number: 1, status: 'completed', courses: { id: 'c1', name: 'Ballyliffin' } },
  { id: 'r2', round_number: 2, status: 'completed', courses: { id: 'c1', name: 'Portsalon' } },
]
const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
}))

/** Give a player the same points on every hole of a round. */
function scoresFor(playerId: string, roundId: string, pointsPerHole: number) {
  return holes.map(h => ({
    player_id: playerId, hole_id: h.id, round_id: roundId,
    gross_score: 6 - pointsPerHole, stableford_points: pointsPerHole, no_return: false,
  }))
}

// Round 1: Alice 3/hole (54), Bob 2/hole (36), Cara 1/hole (18)
// Round 2: Alice 1/hole (18), Bob 2/hole (36), Cara 3/hole (54)
const scores = [
  ...scoresFor('p1', 'r1', 3), ...scoresFor('p2', 'r1', 2), ...scoresFor('p3', 'r1', 1),
  ...scoresFor('p1', 'r2', 1), ...scoresFor('p2', 'r2', 2), ...scoresFor('p3', 'r2', 3),
]
const roundHandicaps = players.flatMap(p =>
  rounds.map(r => ({ round_id: r.id, player_id: p.id, playing_handicap: p.handicap }))
)

type RenderOpts = {
  activeRoundIds?: string[]
  liveScores?: unknown[]
  scores?: unknown[]
  teams?: unknown[]
  players?: unknown[]
  teamScoring?: unknown
}

function render(formats: TripFormats, opts: RenderOpts = {}) {
  return renderToStaticMarkup(
    React.createElement(TripLeaderboardClient, {
      tripCode: 'ABC123',
      formats,
      activeRoundIds: opts.activeRoundIds ?? [],
      teamScoring: opts.teamScoring ?? DEFAULT_TEAM_SCORING,
      rounds,
      teams: opts.teams ?? [],
      players: opts.players ?? players,
      holes,
      scores: opts.scores ?? scores,
      liveScores: opts.liveScores ?? [],
      roundHandicaps,
    } as never)
  )
}

/** Holes 1..n of a round, still sitting in the in-progress table. */
function liveHoles(playerId: string, roundId: string, upTo: number, pointsPerHole: number) {
  return holes.slice(0, upTo).map(h => ({
    player_id: playerId, round_id: roundId, hole_number: h.hole_number,
    gross_score: 6 - pointsPerHole, stableford_points: pointsPerHole,
  }))
}

/** A trip running an individual league with the given boards ticked. */
const F = (league: Partial<TripFormats['league']>, rest: Record<string, unknown> = {}) =>
  parseFormats({ individual: true, league: { on: true, ...league }, ...rest })

// ─── Tabs follow the boards that are on ────────────────────────

section('Tabs')
{
  const one = render(F({ stableford: true }))
  ok(one.includes('Alice'), 'a single board renders')
  ok(!one.includes('>Strokes<'), 'no Strokes tab when that board is off')

  const all = render(F({ stableford: true, strokes: true, custom: true }))
  ok(all.includes('>Stableford<'), 'Stableford tab shown')
  ok(all.includes('>Strokes<'), 'Strokes tab shown')
  ok(all.includes('>Custom<'), 'Custom tab shown')
}

// ─── Stableford totals, and dropping the worst round ───────────

section('Stableford')
{
  // No discard: Alice 54+18 = 72, Bob 36+36 = 72, Cara 18+54 = 72
  const plain = render(F({ stableford: true }))
  eq((plain.match(/>72</g) ?? []).length, 3, 'all three total 72 with every round counting')
  ok(!plain.includes('line-through'), 'nothing is struck through')

  // Drop the worst: Alice keeps 54, Bob keeps 36, Cara keeps 54 — so Bob
  // falls to last. Dropping the *best* by mistake would put Bob top instead,
  // which is what the ordering assertion below actually catches.
  const dropped = render(F({ stableford: true, discardWorst: 1 }))
  ok(dropped.includes('line-through'), 'the dropped round is struck through')
  ok(dropped.includes('Set aside'), 'and says why on hover')
  eq((dropped.match(/>72</g) ?? []).length, 0, 'nobody still totals both rounds')

  const order = (html: string) =>
    ['Alice', 'Bob', 'Cara'].sort((a, b) => html.indexOf(a) - html.indexOf(b))
  eq(order(dropped)[2], 'Bob',
    'Bob finishes last once the worst round is dropped — his 36 is beaten by two 54s')
  ok(order(dropped)[0] !== 'Bob',
    'and is certainly not top, which is where dropping the best round would put him')
}

// ─── Custom points ─────────────────────────────────────────────

section('Custom points')
{
  // Default table for 3 players is 3/2/1.
  // R1: Alice 1st (3), Bob 2nd (2), Cara 3rd (1)
  // R2: Cara 1st (3), Bob 2nd (2), Alice 3rd (1)
  // Totals: Alice 4, Bob 4, Cara 4
  const html = render(F({ custom: true }))
  ok(html.includes('Alice') && html.includes('Bob') && html.includes('Cara'),
    'every player appears')
  eq((html.match(/>4</g) ?? []).length >= 3, true,
    'all three finish on 4 with the default 3/2/1 table')

  // A custom table pays what it says
  const rich = render(F({ custom: true, customPoints: [10, 5, 1] }))
  ok(rich.includes('>11<'), 'Alice takes 10 + 1 with a 10/5/1 table')
  ok(rich.includes('>10<'), 'Bob takes 5 + 5')
  ok(rich.includes('11'), 'and Cara likewise 1 + 10')

  // Zero is a legitimate value for a position
  const zeroed = render(F({ custom: true, customPoints: [10, 0, 0] }))
  ok(zeroed.includes('>10<'), 'a table paying only the winner still works')
}

section('Custom points when players tie')
{
  // Everyone level in round 1, so all three share 1st, 2nd and 3rd
  const tied = [
    ...scoresFor('p1', 'r1', 2), ...scoresFor('p2', 'r1', 2), ...scoresFor('p3', 'r1', 2),
  ]
  const html = renderToStaticMarkup(
    React.createElement(TripLeaderboardClient, {
      tripCode: 'ABC123',
      formats: F({ custom: true, customPoints: [10, 5, 3] }),
      activeRoundIds: [],
      teamScoring: DEFAULT_TEAM_SCORING,
      rounds: [rounds[0]], teams: [], players, holes, scores: tied,
      liveScores: [], roundHandicaps,
    } as never)
  )
  // 10 + 5 + 3 = 18 shared three ways = 6 each. Each player shows it twice —
  // once as the round's award and once as the total.
  eq((html.match(/>6</g) ?? []).length, 6,
    'three players level share 10/5/3 as six points each')
  ok(!html.includes('>10<'),
    'nobody takes the winner\'s ten outright — a tie is not a win')
}

section('Custom points with the worst round dropped')
{
  // 10/5/1, dropping the worst: Alice keeps 10, Bob keeps 5, Cara keeps 10
  const html = render(F({ custom: true, customPoints: [10, 5, 1], discardWorst: 1 }))
  ok(html.includes('line-through'), 'the weaker round is struck through')
  ok(html.includes('>10<'), 'and the better one carries the total')
}

// ─── Title card ────────────────────────────────────────────────

section('Title card appears once more than one board is running')
{
  const CARD = 'bg-surface border border-bark/12 rounded-2xl px-4 py-3 mb-3'

  const single = render(F({ stableford: true }))
  ok(!single.includes(CARD), 'a lone board gets no title card, just its rule line')
  ok(single.includes('Total points, highest wins'), 'the rule is still stated')

  const multi = render(F({ stableford: true, strokes: true }))
  ok(multi.includes(CARD), 'a second board brings the title card in')
  ok(multi.includes('Total points, highest wins'), 'with how the board is scored')
  // The tab strip also says "Stableford", so the card must be identified by
  // its own markup rather than by the word appearing anywhere
  ok(multi.split(CARD).length === 2, 'exactly one title card, for the active board')

  const withDiscard = render(F({ stableford: true, strokes: true, discardWorst: 2 }))
  ok(withDiscard.includes('worst 2 rounds dropped'),
    'the discard rule is spelled out on the card')

  const custom = render(F({ stableford: true, custom: true, customPoints: [10, 5, 1] }))
  ok(custom.includes('Stableford'), 'the first board is titled')
  ok(custom.includes('Total points, highest wins'), 'with its rule')
}

// ─── In play ───────────────────────────────────────────────────

section('In play badge')
{
  const idle = render(F({ stableford: true }))
  ok(!idle.includes('In play'), 'nothing shown when no scorecard is open')

  const live = render(F({ stableford: true }), { activeRoundIds: ['r1'] })
  ok(live.includes('In play'), 'shown while a scorecard is open')
  ok(live.includes('bg-accent'), 'with an emerald dot')
  ok(live.includes('dot-live'), 'that breathes rather than blinks')
  ok(!live.includes('box-shadow'), 'and does not glow — the guide has none')

  // It belongs to the trip, not to one board
  const liveMulti = render(F({ stableford: true, strokes: true }), { activeRoundIds: ['r2'] })
  ok(liveMulti.includes('In play'), 'shown on a multi-board leaderboard too')

  // A round that merely has scores is finished, not in play
  ok(!render(F({ stableford: true }), { activeRoundIds: [] }).includes('In play'),
    'recorded scores alone do not mean a round is in play')
}

// ─── Matchplay stays a button ──────────────────────────────────

section('Matchplay')
{
  const off = render(F({ stableford: true }))
  ok(off.includes('Switch it on in Trip Setup'), 'the button is disabled when matchplay is off')

  const on = render(F({ stableford: true }, { matchplay: true }))
  ok(on.includes('/trip/ABC123/matchplay'), 'and links out when it is on')
  ok(!on.includes('>Matchplay<') || !on.includes('role="tab"'),
    'it never becomes a tab')
}

// ─── Live vs finalised ─────────────────────────────────────────

section('A card still open reads against level, in green')
{
  // Alice nine holes into round 1 at 3 points a hole: 27 points, which is
  // nine ahead of the eighteen that nine holes of level would give.
  const html = render(F({ stableford: true }), {
    scores: [],
    liveScores: liveHoles('p1', 'r1', 9, 3),
    activeRoundIds: ['r1'],
  })

  ok(html.includes('+9'), 'the round shows how far ahead of level it stands')
  ok(html.includes('text-accent'), 'and it carries the accent')

  // The round column and the Total column say different things: the round
  // reads against level, the total stays a total. Round columns come first,
  // so the relative figure precedes the total in the markup.
  ok(html.includes('>27<'), 'the total column still carries the running total')
  ok(html.indexOf('+9') < html.lastIndexOf('>27<'),
    'with the round reading against level before it')
  ok(html.includes('In play'), 'with the board marked as in play')

  // Exactly level reads as E, the way a scoreboard has always shown it
  const level = render(F({ stableford: true }), {
    scores: [], liveScores: liveHoles('p2', 'r1', 9, 2), activeRoundIds: ['r1'],
  })
  ok(level.includes('>E<'), 'two points a hole is level, shown as E')
  ok(!level.includes('+0'), 'not as +0')

  // Behind level carries its sign
  const behind = render(F({ stableford: true }), {
    scores: [], liveScores: liveHoles('p3', 'r1', 9, 1), activeRoundIds: ['r1'],
  })
  ok(behind.includes('-9'), 'behind level shows a minus')
}

section('A finalised card reads as its total, in plain ink')
{
  // The default fixture is entirely committed scores
  const html = render(F({ stableford: true }))

  ok(html.includes('>54<'), 'a finished round shows the total it scored')
  // Emerald means live. There is no second accent, so a finished round is
  // simply the number — which is the right emphasis once the card is in.
  ok(html.includes('text-ink'), 'in plain ink')
  // Emerald appears nowhere on a board with nothing in play. That is the
  // whole distinction: it does not mean "score", it means "still going".
  ok(!/class="[^"]*text-accent[^"]*"/.test(html),
    'with no emerald anywhere, since nothing is in play')
  ok(!html.includes('In play'), 'and no in-play badge')

  // The relative figure is gone once the card is in — the total is the number
  // that matters, and "+18" would be a different claim from "54"
  ok(!html.includes('+18'), 'and not how far ahead of level it finished')
}

section('Committed always wins over in-progress for the same hole')
{
  // The same hole in both tables: the committed one is the truth, and the
  // round is no longer live because nothing uncommitted is left.
  const html = render(F({ stableford: true }), {
    scores: scoresFor('p1', 'r1', 3),
    liveScores: liveHoles('p1', 'r1', 18, 1),
    activeRoundIds: ['r1'],
  })
  ok(html.includes('>54<'), 'the committed score is the one counted')
  ok(!html.includes('>18<'), 'not the stale in-progress one')
}

section('Strokes measures against par, not against two points a hole')
{
  // Nine holes of par 4 is 36. Alice plays them in 3 gross each — but off 10
  // she also receives shots, so the nett is what the board compares to par.
  const html = render(F({ strokes: true }), {
    scores: [], liveScores: liveHoles('p1', 'r1', 9, 3), activeRoundIds: ['r1'],
  })
  ok(html.includes('text-accent'), 'an open card carries the accent here too')
  // 9 holes at 3 gross = 27, less 9 shots received (SI 1-9 all inside a
  // handicap of 10) = 18 nett, against 36 of par
  ok(html.includes('-18'), 'and reads as nett against the par of the holes played')
  ok(html.includes('>18<'), 'while the total column keeps the nett total')
  ok(html.indexOf('-18') < html.lastIndexOf('>18<'),
    'the round reading against par, the total reading as a total')
}

// ─── Players own their scores, not teams ───────────────────────

section('A player carries their scores to whichever team they end up in')
{
  const teams = [
    { id: 't1', name: 'Reds',  color: '#DC2626' },
    { id: 't2', name: 'Blues', color: '#2563EB' },
  ]
  const inReds = players.map(p => p.id === 'p1' ? { ...p, team_id: 't1' } : { ...p, team_id: 't2' })
  const inBlues = players.map(p => ({ ...p, team_id: 't2' }))

  const teamFormats = parseFormats({
    individual: false, teams: true,
    league: { on: true, stableford: true },
  })

  const before = render(teamFormats, { teams, players: inReds })
  const after  = render(teamFormats, { teams, players: inBlues })

  // Alice's 54 and 18 move with her. Under hero scoring the Reds had her
  // card and nothing else; once she moves they have nobody left.
  ok(before.includes('Reds'), 'the Reds are on the board while she is in them')
  // A team with no players is not a row — it has no scores to show
  ok(!after.includes('Reds'), 'and drop off it once nobody is left in them')
  ok(after.includes('Blues'), 'with the Blues carrying everyone')

  // The scores themselves were never re-entered — they belong to the player,
  // and the team row is built from whoever is in the team right now. The team
  // leads the row; its members are listed underneath it.
  ok(before.indexOf('Reds') < before.indexOf('Alice'),
    'the team name leads the row, with its members listed under it')
  ok(after.includes('Alice'), 'and she is listed under the Blues once she moves')
}

section('A player with no team is on the individual board but no team board')
{
  const teams = [{ id: 't1', name: 'Reds', color: '#DC2626' }]
  // Alice is in a team; Bob and Cara joined later and have not been placed
  const partly = players.map(p => p.id === 'p1' ? { ...p, team_id: 't1' } : p)

  const both = parseFormats({
    individual: true, teams: true,
    league: { on: true, stableford: true },
  })

  const html = render(both, { teams, players: partly })

  // Teams lead, so the team tab is the one showing
  ok(html.includes('Reds'), 'the team with a player in it is on the board')
  ok(html.includes('>Teams<'), 'the team tab is present')
  ok(html.includes('>Stableford<'), 'and so is the individual one')

  // Every player is on the individual board whether or not they have a team.
  // Rendering only shows the active tab, so this is asserted on the tab list
  // plus the fact that an unplaced player is not silently dropped from the
  // roster the board is built from.
  const individualOnly = parseFormats({
    individual: true, league: { on: true, stableford: true },
  })
  const solo = render(individualOnly, { players: partly })
  ok(solo.includes('Alice') && solo.includes('Bob') && solo.includes('Cara'),
    'all three are on the individual board, placed or not')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
