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
  isPlusHandicap, PLUS_HANDICAP_WARNING,
  isHandicapPending, readHandicapField, pendingInCard, pendingCardReason,
  HANDICAP_PENDING_LABEL,
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

  // The keypad and the sign have now been broken at both ends. `decimal` is
  // the right keyboard for 14.2 and has no `+` on it, so a plus handicap
  // could not be typed; `text` got the sign back by handing everybody a full
  // QWERTY keyboard to enter two digits with. The sign is a button now.
  ok(HANDICAP_INPUT.inputMode === 'decimal',
    'the field asks for a keypad, not a keyboard')
  ok(HANDICAP_INPUT.type === 'text',
    '  …still a text input, because a number one rejects the leading plus')

  // Which means these props are no longer enough on their own. Anything
  // spreading them onto a bare input asks for a keypad that cannot produce
  // the sign — the exact bug, reintroduced.
  const fs = require('fs') as typeof import('fs')
  const field = fs.readFileSync('app/components/HandicapField.tsx', 'utf-8')
  ok(field.includes('{...HANDICAP_INPUT}'), 'the shared field spreads them')
  for (const f of [
    'app/dashboard/create/CreateTripForm.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
    'app/trip/[tripCode]/players/PlayersClient.tsx',
  ]) {
    const src = fs.readFileSync(f, 'utf-8')
    ok(!src.includes('HANDICAP_INPUT'),
      `${f.split('/').pop()} spreads no handicap props of its own`)
    const fields = (src.match(/placeholder="(Handicap|HCP)/g) ?? []).length
    const shared = (src.match(/<HandicapField/g) ?? []).length
    ok(shared >= fields && shared > 0,
      `  …every handicap field there is the shared one`)
  }
}

// ─── A plus handicap is asked about before it is stored ────────

section('Nothing writes a plus handicap without asking')
{
  // It is the one entry on these forms that means the opposite of what it
  // looks like: "+2" is a better player than "2", is stored as -2, and gives
  // shots back rather than receiving them. Entered by mistake, nothing
  // downstream ever questions it — the trigger scores the card, the board
  // reads it, and the only symptom is a leaderboard that looks wrong for a
  // reason nobody can find.
  eq(isPlusHandicap(-1), true, 'a plus handicap is the negative one')
  eq(isPlusHandicap(0), false, 'scratch is not plus')
  eq(isPlusHandicap(12), false, 'nor is an ordinary handicap')
  eq(isPlusHandicap(null), false, 'nor is a blank')
  ok(/Hold on there Cowboy/.test(PLUS_HANDICAP_WARNING), 'and the warning is written once, here')

  // Every form that writes one asks first. Listed rather than inferred: a
  // fifth entry point added later should fail this until it is added.
  const fs = require('fs') as typeof import('fs')
  const WRITERS = [
    'app/dashboard/create/CreateTripForm.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
    'app/trip/[tripCode]/players/PlayersClient.tsx',
  ]
  const asksIn = (src: string) =>
    (src.match(/isPlusHandicap\([^\n]*\)[\s\S]{0,120}?PLUS_HANDICAP_WARNING/g) ?? []).length

  for (const f of WRITERS) {
    const src = fs.readFileSync(f, 'utf-8')
    const name = f.split('/').pop()
    ok(asksIn(src) > 0, `${name} asks before storing one`)
    ok(!/Hold on there/.test(src), `  …without keeping its own copy of the words`)
  }

  // Settings is the one with two ways in — the add-player form and the
  // editable row — and a guard on only the first would leave the commonest
  // route, correcting a handicap already on the trip, unasked.
  eq(asksIn(fs.readFileSync(WRITERS[1], 'utf-8')), 2,
    'settings asks on both of its paths: adding a player, and editing one')
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

section('A handicap nobody has given yet is pending, and pending is not scratch')
{
  // This is the whole point of the rule. The creation form has always let a
  // handicap box be left empty, and an empty one was written as
  // `parseHandicap(text) ?? 0` — so the player the lead player was least
  // sure about was entered as the best handicap on the trip. Zero is a real
  // answer and nothing downstream can tell it from one somebody meant.
  ok(isHandicapPending(null), 'null is pending')
  ok(isHandicapPending(undefined), 'and so is a column that is not there yet')
  ok(!isHandicapPending(0), 'scratch is NOT pending — that is the bug this replaces')
  ok(!isHandicapPending(-1), 'nor is a plus handicap, which is also a real answer')
  ok(!isHandicapPending(14.2), 'nor an ordinary one')

  // Blank and wrong are two different instructions. A field that saves as it
  // is left cannot treat them alike, or every backspace through the last
  // digit would wipe the stored figure.
  eq(readHandicapField('14.2'), 14.2, 'a handicap reads as itself')
  eq(readHandicapField('+1'), -1, '  …and a plus one is still negative')
  eq(readHandicapField(''), null, 'cleared on purpose is pending')
  eq(readHandicapField('   '), null, '  …spaces included')
  eq(readHandicapField(null), null, '  …and nothing at all')
  eq(readHandicapField('abc'), undefined, 'a stray letter is a keystroke, not an answer')
  eq(readHandicapField('1.'), undefined, '  …and so is a half-typed decimal')
  eq(readHandicapField('+'), undefined, '  …or a sign on its own')

  // Every screen says it the same way. "—", "TBC" and "not set" were three
  // ways of saying it before anything said it deliberately, and the hub's
  // roster already uses the bare word "Pending" for an unclaimed *name* two
  // rows above — hence the HCP.
  ok(HANDICAP_PENDING_LABEL.includes('pending'), 'there is one phrase for it')
  ok(/HCP/.test(HANDICAP_PENDING_LABEL),
    '  …carrying its HCP, because "Pending" alone already means unclaimed')
}

section('A pending player cannot be put on a scorecard')
{
  const ross = { name: 'Ross', handicap: 14.2 }
  const dave = { name: 'Dave', handicap: null }
  const anne = { name: 'Anne', handicap: undefined }
  const scratch = { name: 'Pat', handicap: 0 }

  eq(pendingInCard([ross, scratch]), [], 'a card of rated players is fine')
  eq(pendingInCard([ross, dave]), ['Dave'], 'and one without a handicap is named')
  eq(pendingInCard([dave, ross, anne]), ['Dave', 'Anne'], 'as are two')
  eq(pendingInCard([]), [], 'an empty card asks nothing')
  eq(pendingInCard([scratch]), [],
    'scratch plays — it is a handicap, not an absence')

  // Named rather than counted: on a fourball the group needs to know who.
  eq(pendingCardReason([]), null, 'nothing missing, nothing said')
  ok(pendingCardReason(['Dave'])!.startsWith('Dave has'), 'one player, singular')
  ok(pendingCardReason(['Dave', 'Anne'])!.startsWith('Dave and Anne have'),
    'two are joined and plural')
  ok(pendingCardReason(['Dave', 'Anne', 'Pat'])!.startsWith('Dave, Anne and Pat have'),
    'three read as a list')
  ok(/join screen|Trip Setup/.test(pendingCardReason(['Dave'])!),
    'and it says where to fix it, not just that it is broken')

  // The picker is where it bites, and it bites structurally: a pending
  // player is filtered out of `playerSetups` as well as greying the button,
  // so nothing downstream — the locks, the snapshot write, the card — can
  // be handed one even if the button were somehow pressed.
  const flow = readFileSync('app/scoring/LiveScoringFlow.tsx', 'utf-8')
  ok(/pendingReason === null/.test(flow), 'Start Round waits on every handicap')
  ok(/\{pendingReason && \(/.test(flow), '  …and says which player it is waiting on')
  const setups = flow.slice(flow.indexOf('const playerSetups'), flow.indexOf('const canStart'))
  ok(setups.includes('isHandicapPending'),
    'a pending player never becomes a player setup')

  // And the one thing that must never come back.
  const resolve = flow.slice(flow.indexOf('export function resolveCourseHandicap'))
  ok(!/player\.handicap \?\? 0/.test(flow),
    'nothing anywhere falls back to scoring a pending player off scratch')
  ok(resolve.includes('handicap: number'),
    '  …and resolveCourseHandicap only ever takes a real one')
}

section('Where a pending handicap is written and shown')
{
  // Creation writes null rather than nought — the original sin.
  const create = readFileSync('app/dashboard/create/CreateTripForm.tsx', 'utf-8')
  ok(create.includes('handicap: parseHandicap(p.handicap),'),
    'creation stores a blank handicap as blank')
  ok(!/handicap: parseHandicap\(p\.handicap\) \?\? 0/.test(create),
    '  …never as scratch, which is what it did')
  ok(create.includes('ratedPlayers'),
    'and a pending player gets no round_handicaps row')

  // `playing_handicap` is NOT NULL, so the row is absent rather than null —
  // which is exactly what the Stableford trigger reads to leave a card
  // unscored instead of scoring it off a guess.
  const trigger = readFileSync('supabase/migrations/20260101000024_plus_handicaps.sql', 'utf-8')
  ok(/v_playing_handicap IS NULL/.test(trigger),
    'the trigger already returns early with no handicap snapshot')

  // The migration drops the NOT NULL and the DEFAULT 0, and backfills
  // nothing: a 0 already stored is somebody's real scratch handicap.
  const migration = readFileSync('supabase/migrations/20260101000051_pending_handicap.sql', 'utf-8')
  ok(/ALTER COLUMN handicap DROP NOT NULL/.test(migration), 'handicap may be null')
  ok(/ALTER COLUMN handicap DROP DEFAULT/.test(migration),
    '  …and no longer defaults to scratch')
  ok(!/UPDATE players/.test(migration),
    '  …and nothing already stored is rewritten')

  // Shown as pending on the trip dash and in the roster, through the one
  // label rather than a dash each screen invented for itself.
  for (const f of [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
    'app/scoring/LiveScoringFlow.tsx',
  ]) {
    const src = readFileSync(f, 'utf-8')
    ok(src.includes('HANDICAP_PENDING_LABEL'),
      `${f.split('/').pop()} says pending in the shared words`)
  }

  // And the organiser can actually leave it blank in both places they type
  // one — a required field is what forced the guess in the first place.
  const setup = readFileSync('app/trip/[tripCode]/setup/TripSetupClient.tsx', 'utf-8')
  ok(setup.includes('disabled={busy || !newName.trim()}'),
    'Add player waits on a name, not on a handicap')
  ok(/readHandicapField\(newHandicap\)/.test(setup),
    '  …and reads the box knowing blank is an answer')
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
