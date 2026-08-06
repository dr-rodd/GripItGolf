/**
 * Handicaps, plus and otherwise. Run with: npm run test:handicap
 *
 * A player better than scratch gives strokes back to the course instead of
 * receiving them, and the allocation is the mirror of an ordinary handicap:
 *
 *   handicap 1   receives a shot on the HARDEST hole, SI 1
 *   handicap +1  gives one back on the EASIEST hole, SI 18
 *
 * So a +1 is level par by birdieing SI 18 and paring the other seventeen.
 *
 * The old formula tested `strokeIndex <= handicap % 18`, which for -1 is
 * `strokeIndex <= -1` — false on every hole. Only the whole part survived, and
 * `Math.floor(-1 / 18)` is -1, so a plus one gave a shot back on all eighteen:
 * it had to birdie the lot for level par, and +1 and +2 were identical. The
 * same error was in five copies of the formula and in the Postgres trigger.
 *
 * Two other things are pinned here, both of which produced a wrong number on
 * screen rather than a wrong score:
 *
 *   · a plus handicap is written "+1", never "-1"
 *   · "+1" typed into a handicap field is -1, not 1 — `parseFloat('+1')` is 1,
 *     so it used to be stored as an ordinary one and nothing said otherwise
 */

import { readFileSync } from 'fs'
import {
  shotsReceived, formatHandicap, parseHandicap, HANDICAP_INPUT,
} from '../lib/handicap'

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

/** Shots on every hole of a course whose stroke indexes run 1..18. */
const across = (hcp: number) =>
  Array.from({ length: 18 }, (_, i) => shotsReceived(hcp, i + 1))

// ─── An ordinary handicap, unchanged ───────────────────────────

section('A handicap receives shots from the hardest hole down')
{
  eq(across(0), Array(18).fill(0), 'scratch receives nothing anywhere')
  eq(across(1), [1, ...Array(17).fill(0)], 'a one receives on SI 1 alone')
  eq(across(3), [1, 1, 1, ...Array(15).fill(0)], 'a three on the three hardest')
  eq(across(18), Array(18).fill(1), 'eighteen receives one on every hole')
  eq(across(19), [2, ...Array(17).fill(1)], 'nineteen doubles up on SI 1')
  eq(across(36), Array(18).fill(2), 'thirty-six is two a hole')

  // A fraction can arrive from an allowance. It rounds before it is split, or
  // the whole part and the remainder disagree about which hole gets the extra.
  eq(shotsReceived(11.6, 12), shotsReceived(12, 12), 'a fraction rounds before it is split')
}

// ─── A plus handicap, which was wrong ──────────────────────────

section('A plus handicap gives shots back from the easiest hole down')
{
  eq(across(-1), [...Array(17).fill(0), -1],
    'a plus one gives one back on SI 18, and nowhere else')
  eq(across(-2), [...Array(16).fill(0), -1, -1], 'a plus two on the two easiest')
  eq(across(-4), [...Array(14).fill(0), -1, -1, -1, -1], 'a plus four on the four easiest')

  // The old formula gave -1 on all eighteen for both of these, which is how a
  // plus one came to be asked for eighteen birdies.
  ok(JSON.stringify(across(-1)) !== JSON.stringify(across(-2)),
    'a plus one and a plus two are not the same player')
  ok(!across(-1).every(s => s === -1), 'and a plus one does not give a shot back on every hole')

  eq(across(-18), Array(18).fill(-1), 'a plus eighteen gives one back on every hole')
  eq(across(-19), [...Array(17).fill(-1), -2], 'and a plus nineteen doubles up on SI 18')
}

section('The worked case: a plus one is level par with one birdie')
{
  const par = 4
  const nett = (grossOn: (si: number) => number) =>
    Array.from({ length: 18 }, (_, i) => i + 1)
      .reduce((sum, si) => sum + (grossOn(si) - shotsReceived(-1, si)), 0)

  eq(nett(si => (si === 18 ? par - 1 : par)), 18 * par,
    'birdie SI 18, par the other seventeen — level')
  eq(nett(() => par), 18 * par + 1, 'par all eighteen and they are one over')
  eq(nett(si => (si === 1 ? par - 1 : par)), 18 * par,
    'a birdie anywhere is worth the same to the total…')

  // …but not to the Stableford, which is per hole. The shot comes off SI 18
  // whichever hole the birdie lands on.
  const points = (si: number, gross: number) =>
    Math.max(0, par + 2 - (gross - shotsReceived(-1, si)))
  eq(points(18, par - 1), 2, 'a birdie on SI 18 is worth a par: two points')
  eq(points(18, par), 1, 'and a par there is worth a bogey')
  eq(points(1, par), 2, 'while a par on SI 1 is just a par')
  eq(points(1, par - 1), 3, 'and a birdie there is a birdie')
}

// ─── Writing it down ───────────────────────────────────────────

section('A plus handicap is written with a plus, never a minus')
{
  eq(formatHandicap(-1), '+1', 'a stored -1 is a plus one')
  eq(formatHandicap(-2.5), '+2.5', 'and keeps its half')
  eq(formatHandicap(12), '12', 'an ordinary handicap is the bare number')
  eq(formatHandicap(12.4), '12.4', 'to one decimal where it has one')
  eq(formatHandicap(0), '0', 'scratch is nought')
  ok(!formatHandicap(-1).includes('-'), 'a minus sign never appears on a handicap')
}

section('Reading one back off a keypad')
{
  eq(parseHandicap('+1'), -1, '"+1" is better than scratch')
  eq(parseHandicap('+2.5'), -2.5, 'with its half kept')
  eq(parseHandicap('1'), 1, 'a bare number is an ordinary handicap')
  eq(parseHandicap('14.2'), 14.2, 'to one decimal')
  eq(parseHandicap('0'), 0, 'nought is scratch')
  eq(parseHandicap(' +1 '), -1, 'and whitespace is not an opinion')

  // Nobody means "worse than scratch by minus one"
  eq(parseHandicap('-1'), -1, 'a minus is read as the plus it was meant to be')

  eq(parseHandicap(''), null, 'nothing is not a handicap')
  eq(parseHandicap('   '), null, 'nor is whitespace')
  eq(parseHandicap('abc'), null, 'nor is a word')
  eq(parseHandicap('+'), null, 'nor a sign on its own')
  eq(parseHandicap('1.2.3'), null, 'nor a version number')

  // The whole reason this exists
  ok(parseFloat('+1') !== parseHandicap('+1'),
    'parseFloat would have stored a plus one as an ordinary one')

  ok(HANDICAP_INPUT.inputMode === 'text',
    'the field takes text, because a decimal keypad has no plus on it')
}

// ─── Nothing prints one raw ────────────────────────────────────

section('Every screen writes a handicap the way golf writes one')
{
  // A raw `{playingHcp}` renders a plus one as "-1". The formatter is the only
  // thing standing between the stored sign and the reader, so the check is
  // that no screen puts a handicap on the page without it.
  //
  // `[^=]` before the brace is what tells a rendered value from a prop being
  // passed: `playingHcp={displayHcp}` is plumbing, `>HC {displayHcp}<` is the
  // number somebody reads.
  const RAW = /[^=]\{(playingHcp|displayHcp|player\.handicap|p\.handicap|hcp)\}/g

  const screens = [
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
    'app/trip/[tripCode]/players/PlayersClient.tsx',
    'app/score-entry/ScoreEntryForm.tsx',
  ]
  for (const f of screens) {
    const src = readFileSync(f, 'utf-8')
    const raw = [...src.matchAll(RAW)].map(m => m[0].trim())
    const name = f.split('/').pop()
    eq(raw, [], `${name} never prints a handicap unformatted`)
    ok(src.includes('formatHandicap('), `  …and does format the ones it shows`)
  }
}

// ─── The trigger has to agree ──────────────────────────────────
//
// Stableford points at the full handicap come from the Postgres trigger, so a
// second implementation of this formula exists in SQL and the two have to give
// the same answer for every handicap on every hole. The plpgsql is transcribed
// here and run against the real one — a transcription error would be a card
// that scores one way on the phone and another on the leaderboard.

/** The migration's `shots_received`, in TypeScript, with Postgres semantics. */
function asSql(playingHandicap: number, strokeIndex: number): number {
  // ROUND(numeric). The column is whole by the time the trigger reads it, so
  // the half-away-from-zero difference from Math.round cannot arise.
  const hcp = Math.round(playingHandicap)
  if (hcp < 0) {
    const given = Math.abs(hcp)
    // Integer division in Postgres truncates toward zero; `given` is positive,
    // so this is floor.
    return -(Math.trunc(given / 18) + (strokeIndex >= 19 - (given % 18) ? 1 : 0))
  }
  return Math.trunc(hcp / 18) + (strokeIndex <= hcp % 18 ? 1 : 0)
}

section('The Postgres trigger gives the same answer as the app')
{
  const disagreements: string[] = []
  for (let hcp = -40; hcp <= 54; hcp++) {
    for (let si = 1; si <= 18; si++) {
      if (asSql(hcp, si) !== shotsReceived(hcp, si)) {
        disagreements.push(`hcp ${hcp} SI ${si}: sql ${asSql(hcp, si)}, app ${shotsReceived(hcp, si)}`)
      }
    }
  }
  eq(disagreements, [], 'every handicap from +40 to 54, on every stroke index')
}

section('The migration says what this was checked against')
{
  const sql = readFileSync('supabase/migrations/20260101000024_plus_handicaps.sql', 'utf-8')

  ok(/CREATE OR REPLACE FUNCTION shots_received/.test(sql),
    'the allocation is a function of its own rather than inline in the trigger')
  ok(/IF v_hcp < 0 THEN/.test(sql), 'which forks on a plus handicap')
  ok(/p_stroke_index >= 19 - MOD\(v_given, 18\)/.test(sql),
    'giving shots back from the easiest hole down')
  ok(/p_stroke_index <= MOD\(v_hcp, 18\)/.test(sql),
    'and receiving them from the hardest, exactly as before')
  ok(/v_shots_received := shots_received\(v_playing_handicap, v_stroke_index\)/.test(sql),
    'the trigger calls it rather than keeping its own copy')

  // The backfill re-fires the trigger for plus players and nobody else. An
  // ordinary handicap gets the same arithmetic it always got, so touching
  // those rows could only introduce a difference rather than correct one.
  ok(/UPDATE scores/.test(sql), 'cards already scored are re-scored')
  ok(/rh\.playing_handicap < 0/.test(sql), 'but only the ones off a plus handicap')
  ok(/SET gross_score = s\.gross_score/.test(sql),
    'by a no-op write, so the gross is never touched — only the points it implies')
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
