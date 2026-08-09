/**
 * The card check. Run with: npm run test:card-check
 *
 * `lib/cardCheck.ts` stands between a photograph and the course record, and
 * the bugs that matter are the ones that let a misread through:
 *
 *   1. Validation. A stroke index column that is not a permutation of 1–18,
 *      a half-read ladies card, a par of 45 — none of it may reach a diff.
 *   2. The photo is only the challenger. A card with no ladies row must
 *      never erase a stored ladies card; a missing slope challenges nothing.
 *   3. A stored null against a read value is an addition, not a mismatch —
 *      that is how the empty yardage columns finally fill.
 *   4. The apply guard. Updates come back off the wire, so a column outside
 *      the whitelist or a value outside its range is refused whole.
 */

import {
  normalizeCard, validateCard, diffCard, diffIsEmpty,
  holeUpdates, teeUpdates, validHoleUpdate, validTeeUpdate,
  EXTRACTION_PROMPT, YARDAGE_TEES,
  type ExtractedCard, type ExtractedHole, type StoredHole, type StoredTee,
} from '../lib/cardCheck'

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

// ─── Fixtures ──────────────────────────────────────────────────
//
// A real-shaped par-72: four 3s, four 5s, ten 4s, SI a permutation.

const PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4]
const SIS  = [7, 11, 15, 1, 9, 13, 17, 3, 5, 8, 16, 12, 2, 10, 18, 14, 4, 6]

function goodHoles(): ExtractedHole[] {
  return PARS.map((par, i) => ({
    number: i + 1,
    par,
    strokeIndex: SIS[i],
    parLadies: null,
    strokeIndexLadies: null,
    yardages: {},
  }))
}

function goodCard(over: Partial<ExtractedCard> = {}): ExtractedCard {
  return { courseName: 'Portsalon', holes: goodHoles(), tees: [], ...over }
}

function storedHoles(): StoredHole[] {
  return PARS.map((par, i) => ({
    id: `h${i + 1}`,
    hole_number: i + 1,
    par,
    stroke_index: SIS[i],
    par_ladies: null,
    stroke_index_ladies: null,
  }))
}

const storedTees = (): StoredTee[] => [
  { id: 't-blue', name: 'Blue', gender: 'M', par: 72, course_rating: 71.4, slope: 125 },
  { id: 't-red',  name: 'Red',  gender: 'F', par: 74, course_rating: 72.8, slope: 128 },
]

// ─── Normalising the wire shape ────────────────────────────────

section('normalizeCard')
{
  const card = normalizeCard({
    courseName: null,
    holes: [
      { number: 2, par: 5, strokeIndex: 3, parLadies: null, strokeIndexLadies: null,
        yardages: [{ tee: ' Blue ', yards: 410 }, { tee: 'Green', yards: 395 }] },
      { number: 1, par: 4, strokeIndex: 7, parLadies: null, strokeIndexLadies: null, yardages: [] },
    ],
    tees: [{ name: '  Blue ', gender: 'M', par: 72, courseRating: null, slope: null }],
  })
  eq(card.holes.map(h => h.number), [1, 2], 'holes come out sorted by number')
  eq(card.holes[1].yardages, { blue: 410 }, 'yardages keyed by lowercased colour; colours without a column dropped')
  eq(card.tees[0].name, 'Blue', 'tee names trimmed')
}

// ─── Whether an extraction can be trusted ──────────────────────

section('validateCard: the good card passes')
eq(validateCard(goodCard()), [], 'a clean card has no problems')

section('validateCard: structure')
{
  const seventeen = goodCard()
  seventeen.holes = seventeen.holes.slice(0, 17)
  ok(validateCard(seventeen).length > 0, '17 holes is refused')

  const renumbered = goodCard()
  renumbered.holes[4] = { ...renumbered.holes[4], number: 9 }
  ok(validateCard(renumbered).length > 0, 'numbering that does not run 1–18 is refused')
}

section('validateCard: pars and indices')
{
  const badPar = goodCard()
  badPar.holes[6] = { ...badPar.holes[6], par: 45 }
  ok(validateCard(badPar).some(p => p.includes('hole 7')), 'a par of 45 is named, by hole')

  const nullSI = goodCard()
  nullSI.holes[0] = { ...nullSI.holes[0], strokeIndex: null as unknown as number }
  ok(validateCard(nullSI).length > 0, 'an unread stroke index column is refused')

  const dupSI = goodCard()
  dupSI.holes[1] = { ...dupSI.holes[1], strokeIndex: SIS[0] }
  ok(validateCard(dupSI).some(p => p.includes('1 to 18')), 'a duplicated stroke index breaks the permutation and is refused')
}

section('validateCard: the ladies card is all or nothing')
{
  const partial = goodCard()
  partial.holes = partial.holes.map((h, i) => i < 12 ? { ...h, parLadies: h.par } : h)
  ok(validateCard(partial).some(p => p.includes('12 of 18')), 'ladies par on 12 holes is a misread, not a partial truth')

  const fullLadies = goodCard()
  fullLadies.holes = fullLadies.holes.map(h => ({
    ...h, parLadies: h.par === 3 ? 4 : h.par, strokeIndexLadies: h.strokeIndex,
  }))
  eq(validateCard(fullLadies), [], 'a complete ladies card passes')

  const badLadiesSI = goodCard()
  badLadiesSI.holes = badLadiesSI.holes.map(h => ({ ...h, strokeIndexLadies: 3 }))
  ok(validateCard(badLadiesSI).length > 0, 'ladies SIs that are not a permutation are refused')
}

section('validateCard: ranges')
{
  const badYards = goodCard()
  badYards.holes[0] = { ...badYards.holes[0], yardages: { blue: 4100 } }
  ok(validateCard(badYards).length > 0, 'a 4100-yard hole is refused')

  const badSlope = goodCard({ tees: [{ name: 'Blue', gender: 'M', par: 72, courseRating: 71.4, slope: 300 }] })
  ok(validateCard(badSlope).some(p => p.includes('55 to 155')), 'a slope of 300 is refused')

  const badCR = goodCard({ tees: [{ name: 'Blue', gender: 'M', par: 72, courseRating: 714, slope: 125 }] })
  ok(validateCard(badCR).length > 0, 'a course rating of 714 is refused')
}

// ─── The diff ──────────────────────────────────────────────────

section('diffCard: agreement is empty')
{
  const d = diffCard(goodCard({
    tees: [{ name: 'blue', gender: 'M', par: 72, courseRating: 71.4, slope: 125 }],
  }), storedHoles(), storedTees())
  ok(diffIsEmpty(d), 'a photo that matches the record changes nothing')
  eq(d.unmatchedTees, [], 'and reports nothing unmatched')
}

section('diffCard: the numbers that matter')
{
  const card = goodCard()
  card.holes[3] = { ...card.holes[3], par: 5 }           // stored 4
  card.holes[9] = { ...card.holes[9], strokeIndex: 6 }   // stored 8…
  card.holes[17] = { ...card.holes[17], strokeIndex: 8 } // …swapped with 6
  const d = diffCard(card, storedHoles(), storedTees())
  eq(d.holeChanges.map(c => `${c.holeNumber}:${c.column}:${c.from}>${c.to}`),
    ['4:par:4>5', '10:stroke_index:8>6', '18:stroke_index:6>8'],
    'a par change and an SI swap are found, and nothing else')
  // Hole 4 par 4→5 lifts the men's total to 73, and the tee par follows —
  // PH = HI × Slope ÷ 113 + CR − Par reads tees.par, so leaving it behind
  // would mis-hand every playing handicap.
  eq(d.teeChanges.map(c => `${c.teeId}:${c.column}:${c.from}>${c.to}`),
    ['t-blue:par:72>73'],
    'the tee par follows the hole total when the card prints no tee par')
}

section('diffCard: the photo is only the challenger')
{
  const withLadies = storedHoles().map(h => ({ ...h, par_ladies: h.par, stroke_index_ladies: h.stroke_index }))
  const d = diffCard(goodCard(), withLadies, storedTees())
  ok(diffIsEmpty(d), 'a card with no ladies row never erases a stored ladies card')

  const noRatings = goodCard({ tees: [{ name: 'Blue', gender: 'M', par: null, courseRating: null, slope: null }] })
  const d2 = diffCard(noRatings, storedHoles(), storedTees())
  eq(d2.teeChanges, [], 'a tee the photo printed no ratings for challenges nothing')
}

section('diffCard: additions from null')
{
  const card = goodCard()
  card.holes = card.holes.map(h => ({ ...h, parLadies: h.par, strokeIndexLadies: h.strokeIndex }))
  const d = diffCard(card, storedHoles(), storedTees())
  eq(d.holeChanges.length, 36, 'a ladies card lands as 18 pars and 18 indices')
  ok(d.holeChanges.every(c => c.from === null), 'each shown as an addition, from nothing')

  const yards = goodCard()
  yards.holes = yards.holes.map(h => ({ ...h, yardages: { blue: 400 } }))
  const dy = diffCard(yards, storedHoles(), storedTees())
  eq(dy.holeChanges.length, 18, 'yardages fill the empty columns')
  eq(dy.holeChanges[0].column, 'yardage_blue', 'under the tee\'s own column')
  eq(dy.holeChanges[0].label, 'Blue yards', 'named for a person')
}

section('diffCard: tees')
{
  const card = goodCard({
    tees: [
      { name: 'BLUE', gender: 'M', par: 72, courseRating: 72.1, slope: 129 },
      { name: 'Green', gender: 'M', par: 70, courseRating: 69.0, slope: 119 },
    ],
  })
  const d = diffCard(card, storedHoles(), storedTees())
  eq(d.teeChanges.map(c => `${c.teeId}:${c.column}:${c.to}`),
    ['t-blue:course_rating:72.1', 't-blue:slope:129'],
    'matched case-insensitively; the printed CR and slope correct the stored ones')
  eq(d.unmatchedTees, ['Green (men)'], 'a tee the record does not hold is reported, never written')
}

section('diffCard: a ladies tee par follows the ladies total')
{
  const card = goodCard({
    tees: [{ name: 'Red', gender: 'F', par: null, courseRating: null, slope: null }],
  })
  card.holes = card.holes.map(h => ({
    ...h, parLadies: h.par === 3 ? 4 : h.par, strokeIndexLadies: h.strokeIndex,
  }))
  // Ladies total: the four par 3s become 4s → 72 + 4 = 76; stored red par 74.
  const d = diffCard(card, storedHoles(), storedTees())
  ok(d.teeChanges.some(c => c.teeId === 't-red' && c.column === 'par' && c.to === 76),
    'the red tee par is checked against the ladies hole total, not the men\'s')
}

// ─── Turning a diff into writes ────────────────────────────────

section('holeUpdates / teeUpdates')
{
  const card = goodCard()
  card.holes[3] = { ...card.holes[3], par: 5, strokeIndex: 2 }
  card.holes[12] = { ...card.holes[12], strokeIndex: 1 }
  const d = diffCard(card, storedHoles(), storedTees())
  const ups = holeUpdates(d)
  eq(ups.map(u => u.holeNumber), [4, 13], 'one update per hole, in hole order')
  eq(ups[0].fields, { par: 5, stroke_index: 2 }, 'both of a hole\'s changes in one update')
  ok(ups.every(validHoleUpdate), 'what this module builds, its own guard accepts')

  const teeUps = teeUpdates(d)
  ok(teeUps.every(validTeeUpdate), 'tee updates pass their guard too')
}

section('the apply guard refuses what the routes must never write')
{
  ok(!validHoleUpdate({ holeNumber: 4, fields: { id: 9 } }), 'a column outside the card is refused')
  ok(!validHoleUpdate({ holeNumber: 4, fields: { course_id: 3 } }), 'course_id especially')
  ok(!validHoleUpdate({ holeNumber: 4, fields: { par: 45 } }), 'a par of 45 is refused')
  ok(!validHoleUpdate({ holeNumber: 4, fields: { stroke_index: 3.5 } }), 'a fractional index is refused')
  ok(!validHoleUpdate({ holeNumber: 0, fields: { par: 4 } }), 'hole 0 is refused')
  ok(!validHoleUpdate({ holeNumber: 4, fields: {} }), 'an empty update is refused')
  ok(validHoleUpdate({ holeNumber: 4, fields: { yardage_blue: 410 } }), 'a yardage lands')
  ok(!validTeeUpdate({ teeId: 't-blue', fields: { gender: 1 } }), 'a tee column outside par/CR/slope is refused')
  ok(!validTeeUpdate({ teeId: 't-blue', fields: { slope: 300 } }), 'a slope of 300 is refused')
  ok(validTeeUpdate({ teeId: 't-blue', fields: { course_rating: 71.4 } }), 'a fractional course rating is allowed — CR is decimal')
  ok(!validTeeUpdate({ teeId: '', fields: { slope: 125 } }), 'a blank tee id is refused')
}

// ─── The prompt holds its traps ────────────────────────────────

section('the extraction prompt names the traps')
ok(/permutation of 1 to 18/.test(EXTRACTION_PROMPT), 'the permutation rule is stated')
ok(/[Ll]adies/.test(EXTRACTION_PROMPT), 'the ladies rows are called out')
ok(/OUT, IN and TOTAL/.test(EXTRACTION_PROMPT), 'totals are excluded')
ok(/slope/i.test(EXTRACTION_PROMPT), 'tee ratings are asked for')
eq(YARDAGE_TEES.length, 8, 'the eight yardage columns, no more')

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(failures.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
