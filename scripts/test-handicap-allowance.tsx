/**
 * Handicap allowance tests. Run with: npm run test:handicap-allowance
 *
 * Competitive golf plays off a percentage of the course handicap — 85% for a
 * four-ball, 95% for a singles. The percentage belongs to the competition, so
 * one trip can run two boards on two different allowances off the same cards.
 *
 * Four things have to hold, and each of them is a way of getting a number
 * wrong that nobody would notice until prizes were being handed out:
 *
 *   · the reduction rounds to the nearest shot, the way WHS says, rather than
 *     truncating — the two disagree at exactly the handicaps most argued about
 *   · a board at the full handicap is byte-for-byte what it was before this
 *     existed, points included. Every trip on the platform predates it
 *   · a board under a reduction genuinely scores differently — on Stableford,
 *     on strokes, and through a team format
 *   · the card that opens off a board row agrees with the board's total. A
 *     board reading 33 whose scorecard adds to 36 is a bug report
 */

import {
  FULL_ALLOWANCE, MIN_ALLOWANCE, ALLOWANCE_PRESETS,
  clampAllowance, allowanceOf, allowedHandicap, suggestedAllowance,
  describeAllowance, allowanceCycle, hasReduction,
} from '../lib/handicapAllowance'
import {
  type Leaderboard, parseLeaderboards, boardRules, offersAllowance,
} from '../lib/leaderboards'
import {
  buildRows, scoresForBoard, shotsReceived,
  type RowContext, type ResolvedScore,
} from '../lib/boardRows'
import { exactCourseHandicap, courseHandicap, teesForPlayer } from '../lib/courseHandicap'
import { runningStablefordTotals, resolveCourseHandicap } from '../app/scoring/LiveScoringFlow'
import { readFileSync } from 'fs'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import LeaderboardSetup from '../app/components/LeaderboardSetup'

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

// ─── The reduction itself ──────────────────────────────────────

section('The course handicap itself')
{
  const scratch = { slope: 113, course_rating: 72, par: 72 }
  eq(exactCourseHandicap(10, scratch), 10, 'a standard-slope course of rating par returns the index')

  // The reported case: index 10, a course that plays two shots harder than
  // its par off a slope of 128.
  const tee = { slope: 128, course_rating: 72.6, par: 72 }
  const exact = exactCourseHandicap(10, tee)
  ok(Math.abs(exact - 11.9274) < 0.001, 'the formula is HI × slope ÷ 113 + (CR − par)')
  eq(courseHandicap(10, tee), 12, 'which shows as 12 on a card')

  // And the reason the unrounded figure has to be kept: 90% of 11.93 and 90%
  // of 12 are a shot apart, and the card would be wrong either way round if
  // it rounded first.
  eq(allowedHandicap(exact, 90), 11, '90% of the real figure is 11')
  eq(allowedHandicap(exact, 85), 10, 'and 85% of it is 10')
  eq(allowedHandicap(courseHandicap(10, tee), 85), 10,
    'rounding first happens to agree here')

  const edgy = { slope: 113, course_rating: 72, par: 72 }
  const e = exactCourseHandicap(11.6, edgy)
  eq(courseHandicap(11.6, edgy), 12, '11.6 shows as 12')
  eq(allowedHandicap(e, 90), 10, 'but 90% of it is 10.44 → 10')
  eq(allowedHandicap(12, 90), 11, 'where 90% of the rounded 12 would have been 11')
}

section('A course handicap reduced to an allowance')
{
  eq(allowedHandicap(18, 100), 18, 'the full allowance is the handicap untouched')
  eq(allowedHandicap(11.63, 100), 12, 'and turns an exact figure into the whole number a card shows')
  eq(allowedHandicap(0, 85), 0, 'scratch stays scratch')

  // 18 × 0.85 = 15.3. Truncation and rounding agree here.
  eq(allowedHandicap(18, 85), 15, '18 off 85% is 15')
  // 17 × 0.85 = 14.45 — rounds down, and truncation would agree
  eq(allowedHandicap(17, 85), 14, '17 off 85% is 14')
  // 16 × 0.85 = 13.6 — rounds UP to 14, where truncation would say 13.
  // This is the check that pins rounding rather than truncation.
  eq(allowedHandicap(16, 85), 14, '16 off 85% is 14, not 13 — nearest shot, not truncated')
  // 10 × 0.95 = 9.5 — the exact half, which must go up
  eq(allowedHandicap(10, 95), 10, '10 off 95% is 10 — a half rounds up')
  eq(allowedHandicap(9, 95), 9, '9 off 95% is 9')
  eq(allowedHandicap(30, 90), 27, '30 off 90% is 27')

  // A plus handicap is a negative number and reduces the same way
  eq(allowedHandicap(-2, 90), -2, 'a plus handicap rounds by the same rule')
  eq(allowedHandicap(-4, 50), -2, 'and halves like any other')
}

section('What a board says it plays off')
{
  eq(allowanceOf({}), 100, 'a board with no allowance plays off all of it')
  eq(allowanceOf({ handicapAllowance: 85 }), 85, 'and one with an allowance plays off that')

  eq(clampAllowance(undefined), 100, 'nothing readable is no reduction')
  eq(clampAllowance('nonsense'), 100, 'and so is nonsense')
  eq(clampAllowance(85), 85, 'a whole percentage is itself')
  eq(clampAllowance(87.4), 87, 'a fraction of a percent is rounded away')
  eq(clampAllowance(140), FULL_ALLOWANCE, 'nobody plays off more than their handicap')
  eq(clampAllowance(0), MIN_ALLOWANCE, 'and there is a floor under the reduction')

  eq(describeAllowance(100), 'Full course handicap', 'the full figure is named, not printed as 100%')
  eq(describeAllowance(85), '85% of course handicap', 'a reduction is printed as what it is')
}

// ─── What the rules recommend ──────────────────────────────────

section('The recommended allowance')
{
  const league = { competition: 'league' as const }
  eq(suggestedAllowance({ ...league, audience: 'individual' }), 95,
    'a singles competition is 95%')
  eq(suggestedAllowance({ ...league, audience: 'team', teamFormat: 'better_ball' }), 85,
    'a four-ball is 85%')
  eq(suggestedAllowance({ ...league, audience: 'team', teamFormat: 'hero' }), 85,
    'and so is every other way of combining individual cards')
  eq(suggestedAllowance({ competition: 'matchplay', audience: 'individual' }), 100,
    'a draw is left at the full handicap — its rule is a different calculation')

  ok(ALLOWANCE_PRESETS.includes(95) && ALLOWANCE_PRESETS.includes(85),
    'both recommendations are one tap away')
  ok(ALLOWANCE_PRESETS[0] === FULL_ALLOWANCE, 'and turning it off is the first of them')
}

section('When the question is asked')
{
  ok(!offersAllowance({}), 'not before the board knows anything')
  ok(!offersAllowance({ audience: 'individual', competition: 'matchplay' }),
    'never of a draw')
  ok(!offersAllowance({ audience: 'team', competition: 'league', scoring: 'stableford' }),
    'and not of a team board until it says how the players combine — the ' +
    'recommendation depends on the answer')
  ok(offersAllowance({ audience: 'individual', competition: 'league', scoring: 'stableford' }),
    'asked of an individual league once it is scored')
  ok(offersAllowance({
    audience: 'team', competition: 'league', scoring: 'strokes', teamFormat: 'hero',
  }), 'and of a team league once it combines')
}

// ─── Storage ───────────────────────────────────────────────────

section('Reading it back')
{
  const stored = [{
    id: 'x', audience: 'team', competition: 'league',
    scoring: 'stableford', teamFormat: 'better_ball', combine: 'total',
    handicapAllowance: 85,
  }]
  eq(parseLeaderboards(stored)[0].handicapAllowance, 85, 'an allowance survives the round trip')

  const full = parseLeaderboards([{ ...stored[0], handicapAllowance: 100 }])[0]
  ok(!('handicapAllowance' in full),
    'no reduction is stored as no field — a trip that never asked reads back exactly as it did')

  const none = parseLeaderboards([{ ...stored[0], handicapAllowance: undefined }])[0]
  ok(!('handicapAllowance' in none), 'and so does one that has never heard of the question')

  eq(parseLeaderboards([{ ...stored[0], handicapAllowance: 900 }])[0].handicapAllowance, undefined,
    'a stored value above 100 is clamped back to no reduction and disappears')
  eq(parseLeaderboards([{ ...stored[0], handicapAllowance: 84.6 }])[0].handicapAllowance, 85,
    'and a fraction is rounded on the way in')

  const board = parseLeaderboards(stored)[0]
  ok(boardRules(board).includes('85% of course handicap'),
    'a board says what it is played off')
  ok(!boardRules(parseLeaderboards([{ ...stored[0], handicapAllowance: 100 }])[0])
    .includes('course handicap'),
    'and says nothing at all when there is nothing to say')
}

// ─── Cycling through them on a scorecard ───────────────────────

const SF = (allowance?: number): Leaderboard => ({
  id: `sf-${allowance ?? 'full'}`, audience: 'individual', competition: 'league',
  scoring: 'stableford', combine: 'total', handicapAllowance: allowance,
})
const TEAM = (allowance?: number): Leaderboard => ({
  id: `team-${allowance ?? 'full'}`, audience: 'team', competition: 'league',
  scoring: 'stableford', teamFormat: 'better_ball', combine: 'total',
  handicapAllowance: allowance,
})
const DRAW: Leaderboard = { id: 'draw', audience: 'individual', competition: 'matchplay' }

section('The handicaps one scorecard has to be able to show')
{
  const none = allowanceCycle([SF(), TEAM()])
  eq(none.steps, [100], 'a trip that reduces nothing has one handicap')
  ok(!hasReduction(none.steps), 'so the card needs no control at all')

  const two = allowanceCycle([TEAM(85), SF(95)])
  eq(two.steps, [100, 95, 85], 'every allowance in play, highest first, the full figure included')
  ok(hasReduction(two.steps), 'and a control to walk them')
  eq(two.steps[two.startIndex], 85, 'opening on the primary board — the first one made')

  const other = allowanceCycle([SF(95), TEAM(85)])
  eq(other.steps[other.startIndex], 95, 'whichever board that is')

  eq(allowanceCycle([SF(85), TEAM(85)]).steps, [100, 85],
    'two boards on the same allowance are one step')

  const led = allowanceCycle([DRAW, TEAM(85)])
  eq(led.steps, [100, 85], 'a draw contributes no allowance of its own')
  eq(led.steps[led.startIndex], 100, 'and a trip it leads opens on the full handicap')

  eq(allowanceCycle([]).steps, [100], 'a trip with no boards still knows one handicap')
}

// ─── The maths, driven through the real board builder ──────────
//
// Two players, one round, eighteen par-4 holes with stroke indexes 1..18, and
// a gross of 5 everywhere. Both play off 18.
//
//   At the full handicap: one shot a hole, nett 4, two points a hole  → 36
//   At 85%:  18 → 15 shots. SI 1-15 get a shot (2 points, 30) and SI 16, 17,
//            18 do not (nett 5, one point, 3)                        → 33
//
// The gap is what makes this a real check: a reduction that quietly did
// nothing would still produce 36.

const holes = Array.from({ length: 18 }, (_, i) => ({
  id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1, course_id: 'c1',
}))
const players = [
  { id: 'p1', name: 'Alice', handicap: 18, gender: 'M' },
  { id: 'p2', name: 'Bob', handicap: 18, gender: 'M' },
]
const rounds = [{ id: 'r1', round_number: 1 }]

/** A whole round of the same gross, with the points the trigger would store. */
function card(playerId: string, gross: number, storedPoints: number): ResolvedScore[] {
  return holes.map(h => ({
    playerId, roundId: 'r1', holeId: h.id, holeNumber: h.hole_number,
    gross, points: storedPoints, noReturn: false, live: false,
  }))
}

function ctxOf(resolved: ResolvedScore[]): RowContext {
  return {
    players,
    teams: [{ id: 't1', name: 'Reds', color: '#f00', team_set: 'main' }],
    memberships: players.map(p => ({ team_id: 't1', team_set: 'main', player_id: p.id })),
    holes,
    rounds,
    resolved,
    hcpFor: new Map(players.map(p => [`r1:${p.id}`, 18])),
    liveRoundIds: new Set<string>(),
    livePlayerIds: new Set<string>(),
    legacyTeamScoring: null,
  }
}

const bothCards = [...card('p1', 5, 2), ...card('p2', 5, 2)]
const ctx = ctxOf(bothCards)

section('Stableford under a reduction')
{
  const full = buildRows(SF(), ctx)
  eq(full[0].total, 36, 'off the full handicap a card of 5s is level — 36 points')

  const reduced = buildRows(SF(85), ctx)
  eq(reduced[0].total, 33,
    'off 85% the three highest stroke indexes lose their shot — 33 points')

  eq(buildRows(SF(100), ctx)[0].total, 36,
    'an allowance written down as 100 is the same board as one with none')
}

section('A hole nobody finished')
{
  const nr = ctxOf([
    ...card('p1', 5, 2).slice(0, 17),
    { playerId: 'p1', roundId: 'r1', holeId: 'h18', holeNumber: 18, gross: null, points: 0, noReturn: true, live: false },
    ...card('p2', 5, 2),
  ])
  // Hole 18 is SI 18, which scores 1 point at 85% and 2 at full — so the
  // no-return has to be worth zero either way, not the hole's value.
  eq(buildRows(SF(), nr).find(r => r.id === 'p1')!.total, 34,
    'a no return is worth nothing off the full handicap')
  eq(buildRows(SF(85), nr).find(r => r.id === 'p1')!.total, 32,
    'and still nothing under a reduction — 17 holes, three of them short a shot')
}

section('Strokes under a reduction')
{
  const ST = (allowance?: number): Leaderboard => ({
    id: 'st', audience: 'individual', competition: 'league',
    scoring: 'strokes', combine: 'total', handicapAllowance: allowance,
  })
  eq(buildRows(ST(), ctx)[0].total, 72, 'gross 90, eighteen shots back, nett 72')
  eq(buildRows(ST(85), ctx)[0].total, 75, 'off 85% only fifteen shots come back — nett 75')
}

section('A team format under a reduction')
{
  // Better ball, two scores counting, both players identical: the team's hole
  // is both of their scores added, so the round is twice the individual one.
  eq(buildRows(TEAM(), ctx)[0].total, 72, 'the pair off the full handicap')
  eq(buildRows(TEAM(85), ctx)[0].total, 66, 'and off 85%, six points worse between them')
}

section('A board scores off the real handicap, at every allowance')
{
  // The realistic shape of the problem on an already-played trip: the stored
  // snapshot is the placeholder written at finalise — the player's index — and
  // the real course handicap off the tee they played is far higher.
  const withExact: RowContext = {
    ...ctxOf(bothCards),
    hcpFor: new Map(players.map(p => [`r1:${p.id}`, 10])),
    exactHcpFor: new Map(players.map(p => [`r1:${p.id}`, 17.6])),
  }
  const ST = (allowance?: number): Leaderboard => ({
    id: 'st', audience: 'individual', competition: 'league',
    scoring: 'strokes', combine: 'total', handicapAllowance: allowance,
  })

  // 17.6 → 18 shots, not the placeholder's 10. One rule at every allowance:
  // a board that reached past the snapshot only when reduced would put the
  // same round two places apart on two tabs of the same page.
  eq(buildRows(ST(), withExact)[0].total, 72,
    'the real figure is used at the full handicap too, not only under a reduction — ' +
    'one round must not sit in two places on two tabs of the same page')
  eq(buildRows(ST(90), withExact)[0].total, 74,
    'and 90% of it is 16 shots — off the placeholder it would have been 9')

  eq(buildRows(ST(90), { ...withExact, exactHcpFor: undefined })[0].total, 81,
    'with no tee recorded there is nothing to reach for, and the snapshot stands')
}

section('Where a reduced board gets its points')
{
  // The trigger is canonical, so a board at the full handicap reads what it
  // stored. The two agree by construction once the card and the trigger are
  // working off the same course handicap — the card writes the handicap the
  // trigger reads.
  //
  // A reduced board has no stored answer to agree with, so it goes to the
  // gross. This fixture makes that visible by caching something the gross
  // could never produce: the full board repeats it, the reduced one does not.
  const cached = ctxOf([...card('p1', 5, 99), ...card('p2', 5, 99)])

  eq(buildRows(SF(), cached).find(r => r.id === 'p1')!.total, 99 * 18,
    'at the full handicap the stored points are the answer, whatever they say')
  eq(buildRows(SF(85), cached).find(r => r.id === 'p1')!.total, 33,
    'and a reduced board ignores them entirely, working from the gross')
}

section('The scorecard agrees with the board it opened from')
{
  eq(scoresForBoard(SF(), ctx).filter(s => s.playerId === 'p1')
    .reduce((sum, s) => sum + s.points, 0), 36,
    'a card at the full handicap adds up to what the board says')

  const restated = scoresForBoard(SF(85), ctx)
  const mine = restated.filter(s => s.playerId === 'p1')
  eq(mine.reduce((sum, s) => sum + s.points, 0), 33,
    'and one under a reduction hands back a card that adds to the board total')
  eq(mine.find(s => s.holeNumber === 18)!.points, 1,
    'hole by hole, not just in the total')
  eq(mine.find(s => s.holeNumber === 1)!.points, 2,
    'and only where the shot was actually lost')
  eq(mine.map(s => s.gross).filter(g => g !== 5).length, 0,
    'gross is never touched by any of it')
}

// ─── The card being scored ─────────────────────────────────────
//
// The running total on a score-entry tile is worked out from the gross rather
// than read off the points the card cached — those were computed at the full
// handicap, so trusting them would leave the total sitting still while the
// allowance control changed everything else on the screen. Every card in play
// goes through this, allowance or no allowance, so it is pinned rather than
// left to the one screen that shows it.

section('The running total on a card being scored')
{
  const entryHoles = holes.map(h => ({ par: h.par, stroke_index: h.stroke_index }))
  // A full `HoleScore`. The stats fields are always null here: this suite is
  // about the handicap a card is read at, and a running total never looks at
  // them — but the type is the type, and a fixture that is not one would stop
  // proving anything about the real thing.
  const hs = (gross: number | null, isNR: boolean, stableford: number | null) =>
    ({ gross, isNR, stableford, putts: null, fairway: null })
  const played = (upTo: number, gross: number) =>
    Object.fromEntries(Array.from({ length: upTo }, (_, i) =>
      [i, { p1: hs(gross, false, 2) }]))

  eq(runningStablefordTotals(played(18, 5), entryHoles, [{ id: 'p1', gender: 'M', displayHcp: 18 }]),
    { p1: 36 }, 'eighteen holes of nett par is 36 points')
  eq(runningStablefordTotals(played(9, 5), entryHoles, [{ id: 'p1', gender: 'M', displayHcp: 18 }]),
    { p1: 18 }, 'and nine of them is 18 — a running total counts what is in, not what is left')

  eq(runningStablefordTotals(played(18, 5), entryHoles, [{ id: 'p1', gender: 'M', displayHcp: 15 }]),
    { p1: 33 }, 'the same card off 85% is 33, so the total moves with the control')

  // The card is keyed by position on the course and the holes are in that
  // order. Pair them up wrongly and every stroke index is off by one — which
  // is a total that is plausible, wrong, and silent.
  const backNine = Object.fromEntries(Array.from({ length: 9 }, (_, i) =>
    [i + 9, { p1: hs(5, false, 2) }]))
  eq(runningStablefordTotals(backNine, entryHoles, [{ id: 'p1', gender: 'M', displayHcp: 9 }]),
    { p1: 9 },
    'holes 10-18 off a handicap of 9 get no shots — nine bogeys, nine points')

  eq(runningStablefordTotals(
    { 0: { p1: hs(null, true, 0) } },
    entryHoles, [{ id: 'p1', gender: 'M', displayHcp: 18 }]),
    { p1: 0 }, 'a no return adds nothing')
  eq(runningStablefordTotals(
    { 0: { p1: hs(null, false, null) } },
    entryHoles, [{ id: 'p1', gender: 'M', displayHcp: 18 }]),
    { p1: 0 }, 'and neither does a hole nobody has entered yet')

  eq(runningStablefordTotals({}, entryHoles, []), {}, 'an empty card totals nothing for nobody')
}

// ─── Which handicap a scorecard is scored off ──────────────────
//
// `round_handicaps` gets a row for every player of every round long before
// anyone tees off — at trip creation, at finalise, and again whenever a
// handicap is edited. All three store the player's *index*, because no tee has
// been chosen and there is nothing else to store.
//
// Preferring that row is what made the player picker and the score card
// disagree: the picker worked the handicap out from the tee just chosen, the
// card read the placeholder underneath, and locking the players in wrote the
// placeholder back over the real answer.

section('The tee beats the placeholder')
{
  const player = { id: 'p1', handicap: 10 }
  const tee = { slope: 128, course_rating: 72.6, par: 72 }
  // What creation, finalise and every handicap edit write: the index.
  const placeholder = { round_id: 'r1', player_id: 'p1', playing_handicap: 10 }

  const off = resolveCourseHandicap(placeholder, player, tee)
  ok(Math.abs(off - 11.9274) < 0.001,
    'a card with a tee works the handicap out from it, placeholder or no placeholder')
  eq(Math.round(off), 12, 'so the card shows 12 — the same number the picker showed')
  eq(allowedHandicap(off, 90), 11, 'and 90% of it is 11, off the real figure')

  // Which is the whole bug: reading the placeholder gave 10, and 90% of that
  // is 9. Two shots adrift of the picker on the previous screen.
  eq(allowedHandicap(placeholder.playing_handicap, 90), 9,
    'where the placeholder would have given 9')

  eq(resolveCourseHandicap(undefined, player, tee), off,
    'no stored row at all changes nothing when there is a tee')

  // The one case the stored row is still the answer: a session resumed on a
  // handicap row written before any tee was recorded against it.
  eq(resolveCourseHandicap(placeholder, player, undefined), 10,
    'with no tee, the stored whole number is all there is')
  eq(resolveCourseHandicap(undefined, player, undefined), 10,
    'and with neither, the index is the last resort rather than a zero')
}

// ─── What a no return is stored as ─────────────────────────────

section('A no return is written off the full handicap')
{
  const flow = readFileSync('app/scoring/LiveScoringFlow.tsx', 'utf-8')

  // Three places write a gross for a picked-up ball: the hole as it is
  // entered, an edit on the summary, and the commit. All three must reach for
  // the full course handicap — a no return is a fact about the hole, not about
  // whichever board happened to be on screen when the card was signed.
  // Call sites only — the declaration itself matches `nrGross(` too.
  const calls = [...flow.matchAll(/nrGross\(p, si, [^)]*\)/g)].map(m => m[0])
  eq(calls.length, 3, 'three places write a no return')
  ok(calls.every(c => /playingHcp/.test(c) && !/displayHcp/.test(c)),
    'and every one of them uses the full handicap, never the reduced one')

  // And the reason that stays consistent: net double bogey off the full
  // handicap still scores nothing once the handicap is cut, because a cut
  // handicap gives no more shots than the full one did.
  const par = 4
  for (const si of [1, 9, 18]) {
    for (const full of [0, 7, 12, 18, 28]) {
      const stored = par + 2 + shotsReceived(full, si)
      for (const pct of [100, 95, 90, 85, 50]) {
        const reduced = allowedHandicap(full, pct)
        const pts = Math.max(0, par + 2 - (stored - shotsReceived(reduced, si)))
        if (pts !== 0) {
          ok(false, `SI ${si}, handicap ${full} at ${pct}%: a no return scored ${pts}`)
        }
      }
    }
  }
  ok(true, 'a stored no return scores zero at every allowance, on every stroke index')
}

// ─── Editing a card ────────────────────────────────────────────

section('The card being edited says what it is being edited against')
{
  const flow = readFileSync('app/scoring/LiveScoringFlow.tsx', 'utf-8')

  // Every points figure on the edit screen is worked out from the reduced
  // handicap, so that is the one it shows. The written figure would be a
  // different number that explains none of the arithmetic on the page.
  ok(/const \{ player, displayHcp: playingHcp \} = editSetup/.test(flow),
    'the edit screen reads the handicap the card is being shown at')

  const sub = flow.slice(flow.indexOf('{/* Sub-header */}'),
                         flow.indexOf('{/* Scrollable holes */}'))
  ok(sub.length > 0, 'the edit sub-header is there to check')
  ok(sub.includes('{player.name}'), 'it names whose card it is')
  ok(sub.includes('formatHandicap(playingHcp)'),
    'and prints the handicap beside the name, written the way golf writes one — ' +
    'a plus handicap is "+1", never "-1"')
  ok(sub.includes('{allowance}%'),
    'with the allowance it is at, so a reduced figure is not read as the full one')
  ok(!/\{setup\.playingHcp\}|\{exactHcp\}/.test(sub),
    'and never the written figure, which would explain none of the points below')
}

// ─── On the settings screen ────────────────────────────────────

section('What settings says about a board')
{
  const setup = (boards: Leaderboard[]) => renderToStaticMarkup(
    React.createElement(LeaderboardSetup, {
      boards, playerCount: 8, teamCount: 2, onChange: () => {},
    }))

  const reduced = setup([TEAM(85)])
  ok(reduced.includes('85% of course handicap'),
    'a board carrying a reduction says so on its card, in words')

  const full = setup([TEAM()])
  ok(!full.includes('course handicap'),
    'and a board without one says nothing — every trip made before this ' +
    'question existed is one of those')
}

section('A question ends in a question mark')
{
  const src = readFileSync('app/components/LeaderboardSetup.tsx', 'utf-8')
  const titles = [...src.matchAll(/<Question n=\{next\(\)\} title="([^"]+)"/g)].map(m => m[1])
  ok(titles.length >= 6, 'the setup form asks a handful of questions')

  ok(titles.includes('Do you want to apply a handicap reduction?'),
    'the allowance is asked, not stated — it shipped with a full stop on it')

  // Not every title is a question: "Pick the format." is an instruction and
  // is punctuated like one. So the rule is narrower than "all of them" — a
  // title that *opens* like a question has to close like one.
  const asks = /^(is|are|do|does|how|what|which|who|should|can|would)\b/i
  for (const t of titles) {
    if (asks.test(t)) ok(t.endsWith('?'), `"${t}" opens as a question and ends as one`)
  }
}

// ─── Which tees a player can be given ──────────────────────────
//
// A course can arrive with only men's tees — a club that publishes no ladies
// card, or a bulk import whose ratings carried no ladies set. Filtered
// strictly, a woman on such a course had nothing selectable, and `canStart`
// is an `.every` over the selected players, so she disabled the round for
// everybody on her card.

section('teesForPlayer — nobody is left with nothing to play off')
{
  // Slopes are distinct and deliberately not in the array's own order, so an
  // expectation below can only be met by actually sorting.
  const tee = (name: string, gender: string, slope: number | null = 125) =>
    ({ id: name, name, gender, par: 72, course_rating: 71, slope })
  const mixed = [tee('White', 'M', 122), tee('Blue', 'M', 134), tee('Red', 'F', 118)]
  const mensOnly = [tee('White', 'M', 122), tee('Blue', 'M', 134), tee('Red', 'M', 113)]

  eq(teesForPlayer(mixed, 'F').map(t => t.name), ['Red'],
    'a woman on a course with a ladies tee gets only the ladies tee')
  eq(teesForPlayer(mixed, 'M').map(t => t.name), ['Blue', 'White'],
    'and a man gets only the men\'s')

  eq(teesForPlayer(mensOnly, 'F').map(t => t.name), ['Blue', 'White', 'Red'],
    'a woman on a men\'s-only course gets every tee rather than none')
  eq(teesForPlayer(mensOnly, 'M').map(t => t.name), ['Blue', 'White', 'Red'],
    '  …and the men on that course are unaffected')

  eq(teesForPlayer([], 'F'), [], 'a course with no tees at all still has none')
  ok(teesForPlayer(mixed, 'F') !== mixed, 'the caller\'s array is never handed back to be mutated')

  // The auto-select fires on "exactly one option", so order and length have
  // to mean what they say.
  eq(teesForPlayer([tee('Red', 'F'), tee('Blue', 'M')], 'F').length, 1,
    'one matching tee is still exactly one option')

  // ── Hardest first, by slope ──
  //
  // The order used to be whatever the database happened to return, so one
  // course could offer its tees one way on one screen and another way on the
  // next, and neither matched the card in the pocket.
  eq(teesForPlayer(mensOnly, 'M').map(t => t.slope), [134, 122, 113],
    'the tees come back hardest first, by slope')

  // By slope and not by name, because the names are not a sequence — a course
  // can print Championship/Medal/Society or Sandstone/Slate/Granite, and only
  // the rating says which of two is the harder.
  eq(teesForPlayer(
    [tee('Society', 'M', 118), tee('Championship', 'M', 141), tee('Medal', 'M', 130)], 'M',
  ).map(t => t.name), ['Championship', 'Medal', 'Society'],
    'named tees with no alphabetical sequence still come out in playing order')

  // An unrated tee is one the research or the card check could not fill in.
  // First in the list would make it both the first thing offered and, through
  // `teesForPlayer(...)[0]` on the resume path, the fallback guess.
  eq(teesForPlayer(
    [tee('Yellow', 'M', null), tee('White', 'M', 122), tee('Blue', 'M', 134)], 'M',
  ).map(t => t.name), ['Blue', 'White', 'Yellow'],
    'a tee with no slope sorts last rather than first')

  // Ties are broken by name, so the order is stable rather than merely
  // sorted — two tees on the same slope must not swap between renders.
  eq(teesForPlayer([tee('White', 'M'), tee('Blue', 'M')], 'M').map(t => t.name),
    ['Blue', 'White'],
    'two tees on the same slope keep a settled order')
}

section('No scoring surface filters tees by gender on its own')
{
  // Structural, in test:admin-pages' style. A fifth copy of
  // `t.gender === player.gender` is exactly how this reopens, and it would
  // reopen silently — the failure is a disabled button, not an error.
  for (const path of [
    'app/scoring/LiveScoringFlow.tsx',
    'app/score-entry/ScoreEntryForm.tsx',
  ]) {
    const src = readFileSync(path, 'utf-8')
    ok(src.includes('teesForPlayer'), `${path} goes through teesForPlayer`)
    ok(!/\.filter\(\s*t\s*=>\s*t\.gender\s*===/.test(src),
      `${path} does not filter tees by gender itself`)
    ok(!/courseTees\.find\(\s*t\s*=>\s*t\.gender\s*===/.test(src),
      `${path} does not pick a tee by gender itself either`)
    ok(!/\.sort\([^)]*slope/.test(src),
      `${path} does not order tees itself — teesForPlayer already did`)
  }

  // The round summary is a table rather than a picker, so it does not go
  // through `teesForPlayer` — but a player reads it straight after using the
  // picker, and the two listing the same course's tees in different orders is
  // exactly the inconsistency this was asked to end. It was by course rating,
  // which usually agrees with slope and is not the same thing.
  const summary = readFileSync('app/trip/[tripCode]/round/[roundNumber]/page.tsx', 'utf-8')
  ok(/\.order\('slope', \{ ascending: false, nullsFirst: false \}\)/.test(summary),
    'the round summary lists tees hardest first too, with unrated ones last')
  ok(!/\.order\('course_rating'/.test(summary),
    '  …and no longer by the rating that merely resembled it')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} failed`)
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
