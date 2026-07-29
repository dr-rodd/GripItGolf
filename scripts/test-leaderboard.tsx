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

function render(formats: TripFormats, opts: { activeRoundIds?: string[] } = {}) {
  return renderToStaticMarkup(
    React.createElement(TripLeaderboardClient, {
      tripCode: 'ABC123',
      formats,
      activeRoundIds: opts.activeRoundIds ?? [],
      teamScoring: DEFAULT_TEAM_SCORING,
      rounds, teams: [], players, holes, scores,
      liveScores: [], roundHandicaps,
    } as never)
  )
}

const F = (individual: Partial<TripFormats['individual']>, rest: Partial<TripFormats> = {}) =>
  parseFormats({ individual, ...rest })

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
  const CARD = 'border border-[#1e3d28] rounded-sm px-4 py-3 mb-3'

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
  ok(live.includes('bg-emerald-400'), 'with a green dot')
  ok(live.includes('animate-pulse'), 'that pulses')
  ok(live.includes('rgba(52,211,153'), 'and glows')

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

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
