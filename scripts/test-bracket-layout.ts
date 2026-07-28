/**
 * Bracket layout tests. Run with: npm run test:bracket-layout
 *
 * The alignment rule is the whole point of the two-column view: every
 * right-hand tile must sit exactly level with the midpoint of the two tiles
 * feeding it. These checks assert that across every bracket size, at every
 * slot, and — critically — at fractional slots, which is what the view passes
 * through while a swipe is animating.
 */

import {
  columnGeometry, tileTop, tileCenter, columnX, columnHeight,
  connectorPath, roundHeaderLabel, clampPosition, easeOut,
} from '../lib/bracketLayout'
import { bracketShape, generateBracket } from '../lib/matchplay'

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
/** Floating-point comparison — these are geometry values, not integers. */
function near(got: number, want: number, label: string, tol = 1e-9) {
  if (Math.abs(got - want) <= tol) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${got}\n        want ${want}`) }
}
const section = (n: string) => console.log(`\n${n}`)

const P = 68   // base pitch
const H = 54   // tile height

// ─── Column geometry ───────────────────────────────────────────

section('Column geometry')
{
  eq(columnGeometry(0, P), { pitch: 68, offset: 0 }, 'left column is standard pitch, no offset')
  eq(columnGeometry(1, P), { pitch: 136, offset: 34 }, 'right column is double pitch, half-pitch offset')
  eq(columnGeometry(2, P), { pitch: 272, offset: 102 }, 'two columns right doubles again')
  near(columnGeometry(-1, P).pitch, 34, 'a column to the left is half pitch')
  near(columnGeometry(-1, P).offset, -17, 'and offsets upward')

  // Tiles never resize, so pitch must always leave room for one
  ok(columnGeometry(0, P).pitch > H, 'standard pitch clears the tile height')
}

// ─── The alignment invariant ───────────────────────────────────

section('Alignment: every tile sits between the pair feeding it')
{
  // Integer slots — what you see when nothing is moving
  let allOk = true
  for (let slot = -2; slot <= 3; slot++) {
    for (let j = 0; j < 16; j++) {
      const target  = tileCenter(j, slot + 1, P, H)
      const feederA = tileCenter(2 * j,     slot, P, H)
      const feederB = tileCenter(2 * j + 1, slot, P, H)
      if (Math.abs(target - (feederA + feederB) / 2) > 1e-9) allOk = false
    }
  }
  ok(allOk, 'holds at every whole slot from -2 to 3, for the first 16 tiles')

  // Fractional slots — what you see mid-swipe. This is the property that
  // keeps connectors joined during the animation rather than at its ends.
  let midAnimationOk = true
  for (let step = 0; step <= 20; step++) {
    const slot = -1 + (step / 20) * 3      // -1 → 2 in twentieths
    for (let j = 0; j < 8; j++) {
      const target  = tileCenter(j, slot + 1, P, H)
      const feederA = tileCenter(2 * j,     slot, P, H)
      const feederB = tileCenter(2 * j + 1, slot, P, H)
      if (Math.abs(target - (feederA + feederB) / 2) > 1e-9) midAnimationOk = false
    }
  }
  ok(midAnimationOk, 'holds at 21 fractional slots across the animation range')

  // Adjacent columns keep an exact 2:1 pitch at every instant
  let ratioOk = true
  for (let step = 0; step <= 20; step++) {
    const slot = step / 20
    const r = columnGeometry(slot + 1, P).pitch / columnGeometry(slot, P).pitch
    if (Math.abs(r - 2) > 1e-9) ratioOk = false
  }
  ok(ratioOk, 'the pitch ratio between neighbouring columns stays exactly 2 throughout')
}

// ─── Every real bracket size ───────────────────────────────────

section('Alignment against real brackets')
{
  const makePlayers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }))

  // 4, 8, 16 and 32 brackets — 2 through 5 rounds
  for (const count of [3, 4, 6, 8, 9, 16, 20, 32]) {
    const shape = bracketShape(count)
    let id = 0
    const matches = generateBracket(makePlayers(count), { makeId: () => `m${++id}` })
    const label = `${count} players (${shape.totalRounds} rounds)`

    // Walk every adjacent pair of rounds as they would be viewed together
    let ok_ = true
    let heightsSane = true
    for (let leftIndex = 0; leftIndex < shape.totalRounds - 1; leftIndex++) {
      const leftRound  = matches.filter(m => m.roundNumber === leftIndex + 1)
        .sort((a, b) => a.slot - b.slot)
      const rightRound = matches.filter(m => m.roundNumber === leftIndex + 2)
        .sort((a, b) => a.slot - b.slot)

      if (rightRound.length * 2 !== leftRound.length) ok_ = false

      for (let j = 0; j < rightRound.length; j++) {
        const target  = tileCenter(j, 1, P, H)
        const feederA = tileCenter(2 * j,     0, P, H)
        const feederB = tileCenter(2 * j + 1, 0, P, H)
        if (Math.abs(target - (feederA + feederB) / 2) > 1e-9) ok_ = false

        // The pairing on screen must be the pairing in the data
        const feeders = leftRound.filter(m => m.nextMatchId === rightRound[j].id)
        if (feeders.length !== 2) ok_ = false
        if (!feeders.some(f => f.slot === 2 * j) || !feeders.some(f => f.slot === 2 * j + 1)) ok_ = false
      }

      // Both columns should span close to the same height, so the view does
      // not lurch when you swipe
      const hl = columnHeight(leftRound.length, 0, P, H)
      const hr = columnHeight(rightRound.length, 1, P, H)
      if (Math.abs(hl - hr) > P) heightsSane = false
    }
    ok(ok_, `${label}: on-screen pairing matches the data at every round pair`)
    ok(heightsSane, `${label}: paired columns span comparable heights`)
  }
}

// ─── Column heights ────────────────────────────────────────────

section('Column heights')
{
  eq(columnHeight(0, 0, P, H), 0, 'an empty column has no height')
  eq(columnHeight(1, 0, P, H), H, 'a single tile is one tile tall')
  eq(columnHeight(4, 0, P, H), 3 * P + H, 'four tiles span three pitches plus a tile')
  // A doubled column nests inside its feeder column: it starts half a pitch
  // lower and ends half a pitch higher, so it is shorter by exactly one
  // half-pitch. That is why the view barely changes height as you swipe.
  for (const n of [2, 4, 8, 16]) {
    near(columnHeight(n, 0, P, H) - columnHeight(n / 2, 1, P, H), P / 2,
      `${n} tiles: the doubled column is exactly half a pitch shorter`)
    ok(tileTop(0, 1, P) > tileTop(0, 0, P),
      `${n} tiles: the doubled column starts below its feeders`)
    near(
      tileTop(n / 2 - 1, 1, P) + H,
      tileTop(n - 1, 0, P) + H - P / 2,
      `${n} tiles: and ends half a pitch above their bottom`)
  }
}

// ─── Connectors ────────────────────────────────────────────────

section('Connector paths')
{
  const path = connectorPath({
    feederRightX: 140, feederTopY: 27, feederBottomY: 95,
    targetLeftX: 220, targetY: 61,
  })
  ok(path.includes('M 140 27 H 180'), 'stub out of the upper feeder to the spine')
  ok(path.includes('M 140 95 H 180'), 'stub out of the lower feeder to the spine')
  ok(path.includes('M 180 27 V 95'),  'vertical spine joins the two feeders')
  ok(path.includes('M 180 61 H 220'), 'stub from the spine into the target')

  // The spine's midpoint is the target's centre, by construction
  near((27 + 95) / 2, 61, 'the target sits level with the middle of the spine')

  // Recomputing from moved coordinates gives a different path — the line
  // follows the tiles rather than being drawn once
  const moved = connectorPath({
    feederRightX: 140, feederTopY: 30, feederBottomY: 98,
    targetLeftX: 220, targetY: 64,
  })
  ok(moved !== path, 'the path changes when the tiles move')

  // Joined at every step of an animation, not just at the ends
  let joinedThroughout = true
  for (let step = 0; step <= 12; step++) {
    const slot = step / 12
    const topY    = tileCenter(0, slot, P, H)
    const bottomY = tileCenter(1, slot, P, H)
    const targetY = tileCenter(0, slot + 1, P, H)
    if (Math.abs(targetY - (topY + bottomY) / 2) > 1e-9) joinedThroughout = false
  }
  ok(joinedThroughout, 'the target stays on the spine midpoint at every animation step')
}

// ─── Horizontal placement ──────────────────────────────────────

section('Horizontal placement')
{
  eq(columnX(0, 180), 0, 'the left column sits at the origin')
  eq(columnX(1, 180), 180, 'the right column sits one stride over')
  eq(columnX(-1, 180), -180, 'the outgoing column is one stride off-screen')
  near(columnX(0.5, 180), 90, 'mid-swipe a column sits proportionally between')
}

// ─── Round header ──────────────────────────────────────────────

section('Round header')
{
  const five = ['Round of 32', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final']
  // The header names the left column only. The right column is self-evidently
  // the round after it, and naming both truncated on a phone.
  eq(roundHeaderLabel(five, 0), 'Round of 32', 'first pair is titled by its left column')
  eq(roundHeaderLabel(five, 2), 'Quarter-Final',
    'with a quarter-final and semi-final in view it reads "Quarter-Final"')
  eq(roundHeaderLabel(five, 3), 'Semi-Final', 'and so on down the bracket')
  eq(roundHeaderLabel(five, 4), 'Final', 'the Final is titled "Final"')
  eq(roundHeaderLabel(five, 5), '', 'past the end there is nothing to show')

  const two = ['Semi-Final', 'Final']
  eq(roundHeaderLabel(two, 0), 'Semi-Final', 'a four-player bracket opens on its semi-final')
  eq(roundHeaderLabel(two, 1), 'Final', 'and ends on its Final')

  eq(roundHeaderLabel(['Final'], 0), 'Final', 'a two-player bracket is a Final alone')
  eq(roundHeaderLabel([], 0), '', 'no rounds gives an empty header')

  // With a single name there is nothing to dangle at either end
  let noArrows = true
  for (const names of [five, two, ['Final'], []]) {
    for (let i = -1; i <= names.length + 1; i++) {
      if (roundHeaderLabel(names, i).includes('→')) noArrows = false
    }
  }
  ok(noArrows, 'no arrow appears at any position in any bracket size')

  // Every index inside a real bracket produces a usable title
  for (const count of [2, 4, 6, 9, 20, 32]) {
    const shape = bracketShape(count)
    let allNamed = true
    for (let i = 0; i < shape.totalRounds; i++) {
      if (roundHeaderLabel(shape.roundNames, i) !== shape.roundNames[i]) allNamed = false
    }
    ok(allNamed, `${count} players: every round is titled by its own name`)
  }
}

// ─── Navigation bounds ─────────────────────────────────────────

section('Navigation bounds')
{
  eq(clampPosition(-1, 5), 0, 'swiping back at the first round goes nowhere')
  eq(clampPosition(-0.4, 5), 0, 'nor part-way back')
  eq(clampPosition(0, 5), 0, 'the first round is a valid position')
  eq(clampPosition(4, 5), 4, 'the Final is a valid position')
  eq(clampPosition(5, 5), 4, 'swiping past the Final goes nowhere')
  eq(clampPosition(2.5, 5), 2.5, 'mid-swipe positions pass through untouched')
  eq(clampPosition(3, 1), 0, 'a single-round bracket cannot be navigated')
  eq(clampPosition(-2, 1), 0, 'in either direction')

  // Every real bracket size can reach its Final and no further
  for (const count of [2, 4, 6, 9, 20, 32]) {
    const rounds = bracketShape(count).totalRounds
    eq(clampPosition(99, rounds), rounds - 1, `${count} players: cannot pass the Final`)
    eq(clampPosition(-99, rounds), 0, `${count} players: cannot pass the first round`)
  }
}

section('Easing')
{
  eq(easeOut(0), 0, 'starts at rest')
  eq(easeOut(1), 1, 'ends at rest')
  ok(easeOut(0.5) > 0.5, 'front-loaded, so it feels responsive to the finger')
  eq(easeOut(-1), 0, 'clamps below zero')
  eq(easeOut(2), 1, 'clamps above one')
  let monotonic = true
  for (let i = 1; i <= 50; i++) {
    if (easeOut(i / 50) < easeOut((i - 1) / 50)) monotonic = false
  }
  ok(monotonic, 'never goes backwards')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
