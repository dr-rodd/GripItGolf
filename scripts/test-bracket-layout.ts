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
  connectorPath, roundHeaderLabel, clampPosition, easeOut, centringShift,
  swipeAxis, releaseTarget, settleMs, focalY, dragRange, heldLift, SWIPE_SLOP, SWIPE_COMMIT, FLICK_SPEED,
} from '../lib/bracketLayout'
import { bracketShape, generateBracket } from '../lib/matchplay'
import { readFileSync } from 'fs'

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

section('The last round is centred, not left against the edge')
{
  // A phone: 360 wide, a 158 tile. Centred means 101 from the left.
  const at = (position: number, roundCount: number) =>
    centringShift({ position, roundCount, width: 360, tileWidth: 158 })

  eq(at(0, 4), 0, 'the first round is pinned left, with its pair beside it')
  eq(at(1, 4), 0, 'and so is every round that still has one on its right')
  eq(at(3, 4), 101, 'the Final slides across until it is centred')
  near(at(2.5, 4), 50.5, 'half a swipe in, it is half way across')
  eq(at(2, 4), 0, 'the slide starts exactly where the Final starts arriving')

  // Two players: a Final and nothing else. There was never a pair to pin.
  eq(at(0, 1), 101, 'a one-round bracket is centred outright')

  eq(at(0, 0), 0, 'an empty bracket asks for nothing')
  // A tile wider than the screen would otherwise shift it off to the left
  eq(centringShift({ position: 1, roundCount: 1, width: 100, tileWidth: 158 }), 0,
    'and a viewport narrower than a tile is left alone')
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

// The component's own pitch and tile — the swipe cases below are phone-sized.
const PITCH = 98

section('One axis per gesture')
{
  eq(swipeAxis(3, 4), 'pending', 'a few pixels decide nothing')
  eq(swipeAxis(SWIPE_SLOP - 1, 0), 'pending', '  …up to the slop')
  eq(swipeAxis(-12, 3), 'x', 'mostly sideways is the bracket\'s')
  eq(swipeAxis(4, 20), 'y', 'mostly up or down is the page\'s')
  eq(swipeAxis(6, -30), 'y', '  …however much it wanders sideways on the way')
  eq(swipeAxis(10, 10), 'y', 'a dead diagonal is the page\'s, as the browser reads pan-y')
}

section('A release lands on a round, by distance or by speed')
{
  const at = (from: number, position: number, velocity = 0, roundCount = 6) =>
    releaseTarget({ from, position, velocity, roundCount })

  eq(at(0, 0.1), 0, 'a nudge settles back')
  eq(at(0, SWIPE_COMMIT + 0.01), 1, 'past the commit line, on to the next round')
  eq(at(0, SWIPE_COMMIT - 0.01), 0, '  …and short of it, back')
  eq(at(2, 1.7), 1, 'the same going back a round')
  eq(at(2, 1.9), 2, '  …and a nudge back settles where it was')
  eq(at(1, 1.05), 1, 'a drag that just reaches a round stays on it')
  eq(at(0, 1, FLICK_SPEED * 2), 1, 'a long fast sweep is still one round — the player\'s next match, not the one after')
  eq(at(2, 1, -FLICK_SPEED * 2), 1, '  …and the same going back')
  eq(dragRange(2, 6), [1, 3], 'a drag reaches one round either side')
  eq(dragRange(0, 6), [0, 1], '  …and never off the ends')
  eq(dragRange(1.6, 6), [1, 3], '  …around the round a caught settle was nearest')
  eq(at(0, 0.05, FLICK_SPEED), 1, 'a flick goes on however short')
  eq(at(3, 2.95, -FLICK_SPEED), 2, 'a flick back goes back')
  eq(at(0, 0.6, -FLICK_SPEED), 0, 'a flick the other way at the end wins over the distance')
  eq(at(1.5, 1.6, 0), 2, 'a settle caught mid-flight goes on the way the finger took it')
  eq(at(0, 0.3, 0, 1), 0, 'a one-round bracket goes nowhere')
  eq(at(5, 5, FLICK_SPEED), 5, 'nor past the Final')
  eq(at(0, 0, -FLICK_SPEED), 0, 'nor before the first round')

  eq(settleMs(1, 340), 340, 'a whole round takes the full time')
  eq(settleMs(3, 340), 340, '  …and so does a jump of several — never over the ceiling')
  ok(settleMs(0.3, 340) < 340, 'what is left of a dragged round takes less')
  ok(settleMs(0.01, 340) >= 150, '  …but never so little it reads as a jump')
}

section('The bracket closes in on what you are looking at')
{
  // Every tile, in every round, at every position, follows the one scaling —
  // which is what lets one held point keep a player in view through a swipe.
  let follows = true
  for (const r of [0, 1, 2, 3, 4]) {
    for (let j = 0; j < 16; j++) {
      for (const [p0, p1] of [[0, 1], [1, 0], [0, 2.5], [1.3, 3], [2, 0.4]]) {
        const before = tileTop(j, r - p0, PITCH)
        const after = tileTop(j, r - p1, PITCH)
        if (Math.abs(focalY(before, p0, p1, PITCH) - after) > 1e-6) follows = false
      }
    }
  }
  ok(follows, 'every tile follows focalY, so the held point tracks the tiles exactly')
  eq(focalY(300, 1, 1, PITCH), 300, 'not moving moves nothing')

  // The case Ross met: the foot of a 32-player draw, a finger on a match near
  // the bottom, a swipe to that player's next round. Held under the finger,
  // their next match lands under it too.
  const TILE = 76
  const j = 13                               // the lower of a pair, near the foot
  const finger = tileTop(j, 0, PITCH) + TILE / 2
  const next = Math.floor(j / 2)
  const landed = focalY(finger, 0, 1, PITCH)
  const nextTop = tileTop(next, 0, PITCH)
  ok(landed >= nextTop && landed <= nextTop + TILE,
    'the point under the finger lands inside that player\'s next match')
  ok(tileTop(next, 0, PITCH) < finger - 500,
    '  …which, drawn from the top, would have flown a long way up the screen')
}

section('Held without scrolling the page while it moves')
{
  // Ross, 27 Oct 2026: the swipe juddered. The page was scrolled every frame
  // to hold the point, and a page scrolled under a finger fights it. The
  // bracket moves inside its own box now, and the page takes the lift over
  // once, at rest. These walk a swipe frame by frame on a 32-player draw.
  // The page: 300 above the box, 400 below it, a 844-high screen.
  const TILE = 76, VH = 844, REST = 700, BOX = 300
  const height = (p: number) => {
    let h = TILE
    for (let r = Math.max(0, Math.floor(p) - 1); r <= Math.min(4, Math.ceil(p) + 2); r++) {
      h = Math.max(h, columnHeight(16 / 2 ** r, r - p, PITCH, TILE))
    }
    return h
  }
  // One swipe from p0 to p1 with the finger at `screenY` and the page at
  // `scrollY`, never scrolled while it moves. What the eye sees each frame,
  // and the page once the lift is handed over.
  const swipe = (p0: number, p1: number, scrollY: number, screenY: number, rest = REST) => {
    const y0 = screenY + scrollY - BOX
    const frames: { screen: number; lift: number; pageHeight: number; gapOnScreen: boolean; cutOnScreen: boolean }[] = []
    for (let i = 0; i <= 20; i++) {
      const p = p0 + (p1 - p0) * i / 20
      const lift = heldLift({
        pointPageY: screenY + scrollY, boxTop: BOX, pointY: focalY(y0, p0, p, PITCH),
        scrollY, height: height(p), restHeight: rest, viewportHeight: VH,
      })
      const boxOnScreen = BOX - scrollY
      frames.push({
        screen: boxOnScreen + lift + focalY(y0, p0, p, PITCH),
        lift,
        pageHeight: rest + Math.max(TILE, height(p) + lift),
        gapOnScreen: lift > 0 && boxOnScreen + lift > 0.5,
        cutOnScreen: lift < 0 && boxOnScreen > 0.5,
      })
    }
    const end = frames[frames.length - 1]
    return { frames, end, pageAfter: scrollY - end.lift, pageHeightAfter: rest + height(p1) }
  }

  // The case Ross met, deep in the draw: held exactly, every frame.
  const deep = swipe(0, 1, 1000, 420)
  ok(deep.frames.every(f => Math.abs(f.screen - 420) < 1e-6),
    'deep in a big draw the point stays under the finger every frame, the page unscrolled')
  ok(deep.frames.every(f => !f.gapOnScreen && !f.cutOnScreen),
    '  …the gap opened over the bracket never on the screen')
  ok(deep.pageAfter >= 0 && deep.pageAfter + VH <= deep.pageHeightAfter + 1e-6,
    '  …and the page can take the lift over: in range at rest')
  ok(deep.frames.every(f => f.pageHeight >= 1000 + VH - 1e-6),
    '  …and never too short for where it is scrolled, so the browser never scrolls it either')

  const back = swipe(1, 0, 500, 420)
  ok(back.frames.every(f => Math.abs(f.screen - 420) < 1e-6), 'going back, the same — held every frame')
  ok(back.frames.every(f => !f.cutOnScreen), '  …the top it cuts off never on the screen')
  ok(back.pageAfter + VH <= back.pageHeightAfter + 1e-6, '  …and in range at rest')

  // The foot of the draw on a page with little under it: the page would run
  // out below. The point gives way rather than the browser scrolling the
  // page under the finger.
  const rest = BOX + 60
  const bottom = rest + height(0) - VH             // scrolled as far as it goes
  const foot = swipe(0, 1, bottom, 640, rest)      // a finger on the last match
  ok(foot.frames.every(f => f.pageHeight >= bottom + VH - 1e-6),
    'at the foot of the draw the page never runs short under the finger')
  ok(foot.end.screen > 640 && foot.end.screen < VH - 64,
    '  …the point drifting down instead, as little as it must, still above the tab bar')
  ok(foot.pageAfter >= 0 && foot.pageAfter + VH <= foot.pageHeightAfter + 1e-6, '  …and in range at rest')

  // The heading in view: the bracket stays put in its box, as it always did.
  const top = swipe(0, 1, 0, 500)
  ok(top.frames.every(f => f.lift === 0), 'with the heading in view the bracket is never moved in its box')
  ok(top.frames.every(f => f.screen <= 500 + 1e-6 && f.screen >= BOX), '  …and the point stays on the screen')
  const topBack = swipe(1, 0, 0, 500)
  ok(topBack.frames.every(f => f.lift === 0 && !f.cutOnScreen), '  …going back too')

  // Just past the heading: lowered only as far as the box's top is above.
  const near = swipe(0, 1, BOX + 40, 600)
  ok(near.frames.every(f => !f.gapOnScreen && f.lift <= 40 + 1e-6),
    'just past the heading, lowered no further than the box is above the screen')

  // And the bracket itself: the page is moved in one place, at rest.
  const src = readFileSync('app/trip/[tripCode]/matchplay/MatchplayBracket.tsx', 'utf8')
  ok(!src.includes('scrollBy('), 'the bracket never scrolls the page by a frame\'s drift')
  ok((src.match(/window\.scrollTo\(/g) ?? []).length === 1 && src.includes('pageTargetRef.current = window.scrollY - l'),
    '  …only once, handing the lift over at rest')
  ok(/fingersRef\.current > 0 \|\| performance\.now\(\) - lastScrollRef\.current < 150/.test(src),
    '  …and not while a finger is down or the page is gliding')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
