/**
 * The stats package. Run with: npm run test:stats
 *
 * Two halves, and the second is the one that has already cost this codebase
 * a live round:
 *
 *   · the write path carries putts and a fairway through every place a hole
 *     is written or read back — the live upserts, the resume, and the commit
 *   · the control asks for them without ever holding up the next hole
 *
 * The `no_return` prohibition is re-pinned here rather than left to
 * test:scorecard, because there are now two more column names in the same
 * selects for somebody to pattern-match wrongly.
 */

import fs from 'fs'
import {
  mergeSaved, isScored, type Card, type SavedScore, type HoleScore,
} from '../lib/liveScores'
import {
  holeStats, strokesToGreen, isGreenInRegulation, countsForFairway,
  fairwayStats, puttingStats, gainedOnField, holeDifficulty,
  playerStats, statsFor, coverage,
  MIN_OTHERS, MIN_HOLE_SAMPLE, MIN_MISSES,
  type StatsContext, type Fairway,
} from '../lib/holeStats'
import { resolveScores } from '../lib/rowContext'
import type { RowHole, RowPlayer, ResolvedScore } from '../lib/boardRows'

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

const FLOW = 'app/scoring/LiveScoringFlow.tsx'
const LIVE = 'lib/liveScores.ts'
const MIGRATION = 'supabase/migrations/20260101000028_hole_stats.sql'

// ─── The schema ────────────────────────────────────────────────

section('The two columns say the same thing on both tables')
{
  const m = read(MIGRATION)
  const schema003 = read('supabase/migrations/20260101000003_full_schema_v2.sql')

  ok(/ADD COLUMN IF NOT EXISTS putts/.test(m), 'scores gains putts')
  ok(/ADD COLUMN IF NOT EXISTS fairway_hit/.test(m), '  …and fairway_hit')
  ok(/ADD COLUMN IF NOT EXISTS track_stats BOOLEAN NOT NULL DEFAULT false/.test(m),
    'and trips gains the opt-in, off by default and never null')

  // Every statement has to survive being run again: `npm run migrate` with no
  // arguments replays the whole directory and there is no ledger.
  eq((m.match(/ADD COLUMN/g) ?? []).length, 3, 'three columns are added and no more')
  ok(!/ADD COLUMN (?!IF NOT EXISTS)/.test(m), 'and every one of them is guarded')
  for (const c of ['ck_scores_putts', 'ck_scores_fairway_hit']) {
    ok(new RegExp(`DROP CONSTRAINT IF EXISTS ${c}`).test(m), `${c} is dropped before it is added`)
  }

  // The commit copies a live row into `scores`. Anything `scores` refuses
  // that `live_scores` accepted is a card that cannot be signed, discovered
  // on the eighteenth green — so the two checks are held against each other
  // rather than merely both existing.
  const liveFairway = /fairway_hit\s+TEXT\s+CHECK \(fairway_hit IN \('left', 'fairway', 'right'\)\)/.test(schema003)
  ok(liveFairway, 'live_scores still spells the three values the way this assumes')
  ok(/fairway_hit IN \('left', 'fairway', 'right'\)/.test(m),
    '  …and scores spells them identically')
  ok(/putts IS NULL OR putts >= 0/.test(m),
    'putts is floored at zero and given no ceiling')
  ok(!/putts <= gross|putts <= .*gross_score/.test(m),
    '  …and no upper bound against the gross, which would fail a commit on a mis-tap')
}

// ─── The card ──────────────────────────────────────────────────

section('A hole carries its stats, and a blank one is blank on every field')
{
  const empty = code(FLOW).match(/const EMPTY_HOLE: HoleScore = \{[\s\S]*?\}/)?.[0] ?? ''
  for (const f of ['gross', 'isNR', 'stableford', 'putts', 'fairway']) {
    ok(new RegExp(`${f}:`).test(empty), `EMPTY_HOLE names ${f}`)
  }
  // The six copies of the blank literal are what let a new field reach the
  // type and not the defaults.
  ok(!/\{ gross: null, isNR: false, stableford: null \}/.test(code(FLOW)),
    'and no bare blank literal is left behind')

  // The two declarations are one type in two places.
  const flowType = code(FLOW).match(/interface HoleScore \{[\s\S]*?\n\}/)?.[0] ?? ''
  const libType  = code(LIVE).match(/export type HoleScore = \{[\s\S]*?\n\}/)?.[0] ?? ''
  for (const f of ['gross', 'isNR', 'stableford', 'putts', 'fairway']) {
    ok(new RegExp(`\\b${f}\\b`).test(flowType) && new RegExp(`\\b${f}\\b`).test(libType),
      `both copies of HoleScore declare ${f}`)
  }

  // Putts alone must never make a hole count as an answer: `handleCommit`
  // decides a no return by `gross == null`, so a hole with a stray putt count
  // and no score would be written as an NR carrying stats.
  const scored = code(LIVE).match(/export function isScored[\s\S]*?\n\}/)?.[0] ?? ''
  ok(!/putts|fairway/.test(scored), 'a putt count alone is not an answer')
  ok(!isScored({ gross: null, isNR: false, stableford: null, putts: 2, fairway: 'left' }),
    '  …proved rather than only read')
}

// ─── Reconciling ───────────────────────────────────────────────

section('Stats survive being left and come back with their own hole')
{
  const HOLES = Array.from({ length: 18 }, (_, i) => i + 1)
  const saved = (
    pid: string, hole: number, gross: number,
    putts: number | null = null, fw: SavedScore['fairway_hit'] = null,
  ): SavedScore => ({
    player_id: pid, hole_number: hole, gross_score: gross,
    stableford_points: 2, putts, fairway_hit: fw,
  })
  const hs = (
    gross: number | null, putts: number | null = null,
    fairway: HoleScore['fairway'] = null, isNR = false,
  ): HoleScore => ({ gross, isNR, stableford: 2, putts, fairway })

  const restored = mergeSaved({}, [saved('p1', 1, 4, 2, 'left')], HOLES)
  eq(restored[0].p1.putts, 2, 'a hole read back brings its putts')
  eq(restored[0].p1.fairway, 'left', '  …and where the tee shot went')

  const noStats = mergeSaved({}, [saved('p1', 1, 4)], HOLES)
  eq(noStats[0].p1.putts, null, 'a hole saved before stats existed restores as null')
  eq(noStats[0].p1.fairway, null, '  …never as zero, which is a real answer')

  // The unit is the hole. Half-taking a saved row would leave one hole
  // holding one person's gross and another's putt count.
  const remembered: Card = { 0: { p1: hs(5) } }
  const kept = mergeSaved(remembered, [saved('p1', 1, 4, 3, 'right')], HOLES)
  eq(kept[0].p1.gross, 5, 'memory keeps its score')
  eq(kept[0].p1.putts, null, '  …and its silence about the stats, rather than borrowing')

  const typed: Card = { 0: { p1: hs(4, 1, 'fairway') } }
  const untouched = mergeSaved(typed, [saved('p1', 1, 4, 3, 'left')], HOLES)
  eq(untouched[0].p1.putts, 1, 'a stat typed on this device is not overwritten')
  eq(untouched[0].p1.fairway, 'fairway', '  …on either field')
}

// ─── Every place a hole is written ─────────────────────────────

section('Nothing on the write path drops the two columns')
{
  const flow = code(FLOW)

  // Every read of `live_scores` asks for both, and none of them asks for the
  // one column that is not there. The second half is the pinned prohibition:
  // selecting `no_return` failed the whole select, the error was swallowed,
  // and the card opened blank.
  const selects = [...flow.matchAll(/from\("live_scores"\)\s*\.select\(([^)]*)\)/g)]
    .map(m => m[1])
  ok(selects.length >= 2, 'there are live_scores selects to check')
  for (const [i, s] of selects.entries()) {
    ok(/putts/.test(s) && /fairway_hit/.test(s), `live_scores select ${i + 1} asks for both stats`)
    ok(!/no_return/.test(s), `  …and select ${i + 1} still never asks for no_return`)
  }

  // Both live upserts, and the commit. Each has to write a value that came
  // off the card — `putts: null` also contains the word "putts", which is
  // how a weaker version of this check let a commit that dropped every putt
  // count go by.
  for (const [label, marker, puttsRule] of [
    ['the hole submit', 'round_id: roundId, hole_number: hole.hole_number,',
      /putts:\s*hs\.isNR\s*\?\s*null\s*:\s*\(hs\.putts\s*\?\?\s*null\)/],
    ['the edit draft', 'upsertRows.push',
      /putts:\s*hs\.isNR\s*\?\s*null\s*:\s*\(hs\.putts\s*\?\?\s*null\)/],
    ['the commit', 'scoreRows.push',
      /const putts = noReturn \|\| hs\?\.putts == null \|\| hs\.putts > gross/],
  ] as const) {
    const at = flow.indexOf(marker)
    ok(at > -1, `${label} is where this expects it`)
    const window = flow.slice(Math.max(0, at - 600), at + 700)
    ok(/fairway_hit:\s*(hs\.isNR|noReturn)/.test(window),
      `${label} writes a fairway that came off the card`)
    ok(puttsRule.test(window), `  …and ${label} writes a putt count that did too`)
  }
  // …and the commit's row actually carries the value it just worked out.
  const rows = flow.slice(flow.indexOf('scoreRows.push'), flow.indexOf('scoreRows.push') + 400)
  ok(/^\s*putts,\s*$/m.test(rows), 'the committed row carries that putt count and not a literal')

  // A picked-up ball has no putt count, and a par 3 has no fairway to find.
  ok((flow.match(/isNR \|\| p < 4 \? null/g) ?? []).length >= 2,
    'a no return and a par 3 both clear the fairway, in both live writers')
  ok(/noReturn \|\| p < 4 \? null/.test(flow),
    '  …and the commit does the same')
  ok(/hs\.putts > gross/.test(flow),
    'more putts than shots is dropped on the way in rather than trusted')
}

// ─── The control ───────────────────────────────────────────────

section('The control asks, and never insists')
{
  const flow = code(FLOW)

  ok(/const showStats = trackStats && hasScore && !isNR/.test(flow),
    'the row appears only once the hole has a score, and never on a no return')
  ok(/const showFairway = effectivePar >= 4/.test(flow),
    'and the fairway question is not asked on a par 3')
  // effectivePar, not hole.par: a hole that is a ladies par 4 and a men's
  // par 3 has to ask the right question of each person on the card.
  ok(!/showFairway = hole\.par/.test(flow),
    '  …off the par that player is playing, not the card\'s')

  // The Next button is the whole point of "not intrusive". It reads the
  // scores and nothing else.
  //
  // Sliced to the closing `})` of the `.every(`, not to the first one in the
  // file — the first `})` after the assignment is the one inside
  // `every(({ player }) =>`, and a window that stopped there contained no
  // condition at all, so this check passed while testing nothing. It is the
  // exact failure docs/testing-and-data.md keeps a mutation pass for.
  const gateAt = flow.indexOf('const allHaveGross')
  const gate = flow.slice(gateAt, flow.indexOf('\n  })', gateAt))
  ok(/return hs\?\.gross/.test(gate), 'the next-hole gate is where this expects it')
  ok(!/putts|fairway/.test(gate),
    'the next hole is never held up by a missing stat')

  // Tap the chosen one again and it clears — the only way out of a
  // three-way control with no fourth button.
  ok(/onFairway\(fairway === v \? null : v\)/.test(flow),
    'a fairway chip clears when tapped again')
  ok(/putts <= 0 \? null/.test(flow),
    'and the putts counter clears below zero rather than sticking there')
  ok(/putts == null \? 1 :/.test(flow) && /putts == null \? 2 :/.test(flow),
    'one tap either way lands on 1 or 2, the two commonest answers')
  ok(!/putts \?\? 2\b/.test(flow.replace(/putts == null \? 2/g, '')),
    'nothing is pre-filled, so an average is never the average of a default')

  // A tap is not a drag, but a handler that stopped propagation would break
  // swiping to the live board from anywhere on this row.
  const tile = flow.slice(flow.indexOf('function LivePlayerTile'))
  ok(!/stopPropagation/.test(tile), 'the row does not swallow the swipe to the board')

  // Two steppers on one tile, one for the score and one for the putts. The
  // second says what it is, in the same shape the points badge already uses.
  ok(/>putts</.test(read(FLOW)), 'the putts stepper carries its own unit')

  // The switch reaches the tile from the trip, and is off unless asked for.
  ok(/trackStats = false/.test(code('app/scoring/[slug]/CourseDashboardClient.tsx')),
    'the legacy scoring route gets the card it always had')
  ok(/trackStats = false/.test(flow), '  …and so does anything else that omits it')
  ok(/track_stats/.test(code('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')),
    'the trip route reads the column')
}

// ─── Branding, on the new surface only ─────────────────────────

section('The new row is emerald or it is nothing')
{
  const src = read(FLOW)
  const from = src.indexOf('const showStats')
  const tile = src.slice(from, src.indexOf('\n  return (', from))
  ok(tile.length > 500, 'the stats row is where this expects it')
  ok(!/C9A84C/i.test(tile), 'no gold in the stats row')
  ok(!/rust/.test(tile), 'and no rust — a missed fairway is not a loss')
  ok(/border-accent bg-accent\/\[0\.12\] text-accent-deep/.test(tile),
    'a chosen answer is a tint, not a slab of emerald')
}

// ─── The derivation ────────────────────────────────────────────

// A fixture whose answers are known by construction. Holes 1–4 are par 4,
// hole 5 is a par 3, hole 6 is a par 5 on the men's card and a par 4 on the
// ladies' — which is the hole that proves par is asked for rather than
// restated.
const HOLES: RowHole[] = [
  { id: 'h1', hole_number: 1, par: 4, stroke_index: 1,  course_id: 'c1' },
  { id: 'h2', hole_number: 2, par: 4, stroke_index: 5,  course_id: 'c1' },
  { id: 'h3', hole_number: 3, par: 4, stroke_index: 9,  course_id: 'c1' },
  { id: 'h4', hole_number: 4, par: 4, stroke_index: 13, course_id: 'c1' },
  { id: 'h5', hole_number: 5, par: 3, stroke_index: 17, course_id: 'c1' },
  { id: 'h6', hole_number: 6, par: 5, stroke_index: 3,  course_id: 'c1',
    par_ladies: 4, stroke_index_ladies: 2 },
]
const PLAYERS: RowPlayer[] = [
  { id: 'a', name: 'Ann',  handicap: 10, gender: 'F' },
  { id: 'b', name: 'Bob',  handicap: 12, gender: 'M' },
  { id: 'c', name: 'Cal',  handicap: 8,  gender: 'M' },
  { id: 'd', name: 'Dee',  handicap: 20, gender: 'M' },
  { id: 'e', name: 'Eli',  handicap: 4,  gender: 'M' },
]

const sc = (
  playerId: string, holeId: string, gross: number | null,
  putts: number | null = null, fairway: Fairway | null = null,
  extra: Partial<ResolvedScore> = {},
): ResolvedScore => ({
  playerId, roundId: 'r1', holeId,
  holeNumber: Number(holeId.slice(1)),
  gross, points: 2, noReturn: false, live: false, putts, fairway, ...extra,
})

const ctxOf = (resolved: ResolvedScore[]): StatsContext =>
  ({ players: PLAYERS, holes: HOLES, resolved })

section('Greens in regulation is two putts short of par, and nothing else')
{
  eq(strokesToGreen(4, 2), 2, 'four shots with two putts reached the green in two')
  eq(strokesToGreen(4, null), null, 'and without a putt count there is no answer')
  eq(strokesToGreen(null, 2), null, '  …nor without a score')

  eq(isGreenInRegulation(4, 2, 4), true,  'par 4, four shots, two putts — green hit')
  eq(isGreenInRegulation(4, 1, 4), false, 'a one-putt par took three to get there')
  eq(isGreenInRegulation(3, 0, 4), false, 'and a chip-in is a birdie, not a green hit')
  eq(isGreenInRegulation(5, 2, 5), true,  'par 5, five shots, two putts — hit')
  eq(isGreenInRegulation(6, 2, 5), false, '  …six shots is not')
  eq(isGreenInRegulation(3, 2, 3), true,  'a par 3 needs one shot to the green')
  eq(isGreenInRegulation(4, 2, 3), false, '  …two and it is missed')

  ok(!countsForFairway(3), 'a par 3 has no fairway')
  ok(countsForFairway(4) && countsForFairway(5), 'a par 4 and a par 5 do')
}

section('The par is the one that player is playing')
{
  // The same card on the same hole: a par 5 for the men, a par 4 for Ann.
  const stats = holeStats(ctxOf([sc('a', 'h6', 5, 2), sc('b', 'h6', 5, 2)]))
  const ann = stats.find(s => s.playerId === 'a')!
  const bob = stats.find(s => s.playerId === 'b')!

  eq(ann.par, 4, "Ann's card says the sixth is a par 4")
  eq(bob.par, 5, "and Bob's says it is a par 5")
  eq(ann.gir, false, 'so five shots and two putts is a green missed for her')
  eq(bob.gir, true,  '  …and a green hit for him')
  eq(ann.strokeIndex, 2, 'and the ladies stroke index comes with it')
  eq(bob.strokeIndex, 3, '  …while his does not move')
}

section('A hole that says nothing is dropped rather than guessed at')
{
  eq(holeStats(ctxOf([sc('b', 'h1', 7, 2, 'left', { noReturn: true })])).length, 0,
    'a no return is out — its gross is a computed maximum, not a hole played')
  eq(holeStats(ctxOf([sc('b', 'h1', null, 2)])).length, 0, 'and so is a hole with no score')
  eq(holeStats(ctxOf([sc('zz', 'h1', 4, 2)])).length, 0,
    'a player not on the roster is out, which is what keeps composites out')
  eq(holeStats(ctxOf([sc('b', 'nope', 4, 2)])).length, 0, 'and a hole not on the course')

  // Kept, but with the impossible half dropped.
  const [mistap] = holeStats(ctxOf([sc('b', 'h1', 4, 9)]))
  eq(mistap.putts, null, 'more putts than shots is a mis-tap, so the count goes')
  eq(mistap.gir, null, '  …and there is no green to judge')
  eq(mistap.gross, 4, '  …but the score stays, because the score was fine')

  const [par3] = holeStats(ctxOf([sc('b', 'h5', 3, 2, 'left')]))
  eq(par3.fairway, null, 'a fairway stored against a par 3 is dropped')
  ok(!par3.fairwayCounted, '  …and the hole is out of the denominator')
}

section('Fairways count par 4s and 5s, and only the ones answered')
{
  const stats = holeStats(ctxOf([
    sc('b', 'h1', 4, 2, 'fairway'),
    sc('b', 'h2', 5, 2, 'left'),
    sc('b', 'h3', 5, 2, 'right'),
    sc('b', 'h4', 4, 2),               // par 4, not answered
    sc('b', 'h5', 3, 2, 'left'),       // par 3, never asked
  ]))
  const f = fairwayStats(stats)

  eq(f.counted, 3, 'three holes were both asked and answered')
  eq(f.hit, 1, 'one of them found the fairway')
  eq(f.missedLeft, 1, 'one missed left')
  eq(f.missedRight, 1, '  …and one right')
  eq(f.hitRate, 1 / 3, 'so the rate is one in three, not one in five')
  eq(f.missBias, null, 'two misses is not a tendency')

  // Both tests have to pass: enough misses, and enough of them one way.
  const miss = (fws: Fairway[]) => fairwayStats(holeStats(ctxOf(
    fws.map((fw, i) => sc('b', `h${(i % 4) + 1}`, 4, 2, fw, { roundId: `r${i}` })))))

  eq(miss(['right', 'right', 'right', 'left']).missBias, 'right',
    `${MIN_MISSES} misses, three of them one way, is a lean`)
  eq(miss(['right', 'right', 'left', 'left']).missBias, null,
    'an even split is not')
  // The case that shipped as "leaning left" before BIAS_SHARE existed.
  eq(miss([...Array(7).fill('left'), ...Array(5).fill('right')] as Fairway[]).missBias, null,
    'and neither is seven to five, which is a coin toss with a name on it')
  eq(miss([...Array(9).fill('left'), ...Array(3).fill('right')] as Fairway[]).missBias, 'left',
    '  …while nine to three is')
  eq(miss(['left', 'left', 'left']).missBias, null,
    `three misses is under ${MIN_MISSES}, however lopsided`)
  eq(fairwayStats([]).hitRate, null, 'nothing counted has no rate rather than a zero')
}

section('Putting counts the holes it was told about')
{
  const stats = holeStats(ctxOf([
    sc('b', 'h1', 4, 2),   // green hit, two putts
    sc('b', 'h2', 5, 3),   // green hit (5-3=2), three putts
    sc('b', 'h3', 5, 1),   // green missed (5-1=4), one putt
    sc('b', 'h4', 4),      // no putt count at all
  ]))
  const p = puttingStats(stats)

  eq(p.holes, 3, 'three holes carried a putt count')
  eq(p.putts, 6, 'six putts between them')
  eq(p.puttsPerHole, 2, 'two a hole')
  eq(p.puttsPer18, 36, '  …which is 36 over a full round')
  eq(p.greenHoles, 3, 'three holes could be judged for a green')
  eq(p.greensHit, 2, 'two of them were hit')
  eq(p.puttsOnGreensHit, 5, 'with five putts taken on those two')
  eq(p.puttsPerGreenHit, 2.5, '  …so 2.5 a green hit, which is the putting figure')
  eq(puttingStats([]).puttsPerHole, null, 'and nothing at all averages to nothing')
}

section('Gained on the field is measured against everybody else')
{
  // Five cards on one par 4. Four make 4 with two putts; one makes 5 with
  // three. Every figure below is arithmetic, not a recorded expectation.
  const level = [
    sc('a', 'h1', 4, 2), sc('b', 'h1', 4, 2), sc('c', 'h1', 4, 2),
    sc('d', 'h1', 4, 2), sc('e', 'h1', 5, 3),
  ]
  const g = gainedOnField(holeStats(ctxOf(level)))

  // Eli: the field of four averages 2 putts, he took 3 → −1. To the green
  // they all took 2, so 0.
  eq(g.get('e')!.putting.toFixed(4), '-1.0000', 'the three-putt loses a shot to the field')
  eq(g.get('e')!.toGreen.toFixed(4), '0.0000', '  …and none of it to the green')
  eq(g.get('e')!.total.toFixed(4), '-1.0000', '  …so a shot in total')
  // Ann: field is {2,2,2,3}, mean 2.25, she took 2 → +0.25.
  eq(g.get('a')!.putting.toFixed(4), '0.2500', 'and each of the others gains a quarter')

  // The identity that makes this checkable at all.
  const sum = [...g.values()].reduce((n, x) => n + x.total, 0)
  ok(Math.abs(sum) < 1e-9, 'the gains over a hole sum to exactly zero')
  for (const x of g.values()) {
    ok(Math.abs(x.putting + x.toGreen - x.total) < 1e-9,
      `putting and tee-to-green add up to the total for ${x.playerId}`)
  }

  // Both halves are averaged over the same subset, so the total is the gain
  // in gross shots and not merely close to it.
  const grossMean = (id: string) => {
    const others = level.filter(s => s.playerId !== id)
    return others.reduce((n, s) => n + s.gross!, 0) / others.length
  }
  for (const s of level) {
    const mine = level.find(x => x.playerId === s.playerId)!
    ok(Math.abs(g.get(s.playerId)!.total - (grossMean(s.playerId) - mine.gross!)) < 1e-9,
      `the total is the gross gain for ${s.playerId}`)
  }
}

section('A hole nobody else played says nothing')
{
  // MIN_OTHERS is three, so four cards is the floor and three is not.
  const three = gainedOnField(holeStats(ctxOf([
    sc('a', 'h1', 4, 2), sc('b', 'h1', 5, 3), sc('c', 'h1', 6, 4),
  ])))
  eq([...three.values()].length, 0, `${MIN_OTHERS} others are needed, and two are not enough`)

  const four = gainedOnField(holeStats(ctxOf([
    sc('a', 'h1', 4, 2), sc('b', 'h1', 4, 2), sc('c', 'h1', 4, 2), sc('d', 'h1', 5, 3),
  ])))
  eq(four.get('d')!.holes, 1, '  …and four cards is the floor, not five')

  // A player with no putt count is not in the field for that hole, and gets
  // nothing from it — the gains would otherwise mix two populations.
  const partial = gainedOnField(holeStats(ctxOf([
    sc('a', 'h1', 4, 2), sc('b', 'h1', 4, 2), sc('c', 'h1', 4, 2),
    sc('d', 'h1', 4, 2), sc('e', 'h1', 4),
  ])))
  eq(partial.get('e'), undefined, 'a hole with no putt count gains its player nothing')
  eq(partial.get('a')!.holes, 1, '  …and is simply not in anybody else\'s field either')
  eq(partial.get('a')!.total.toFixed(4), '0.0000', '  …so four level cards are all square')
}

section('Hole difficulty is what actually happened, ranked against the card')
{
  // The fourth is the card's easiest of these and plays hardest.
  const rows = holeDifficulty(holeStats(ctxOf([
    sc('b', 'h1', 4, 2), sc('c', 'h1', 4, 2),
    sc('b', 'h2', 5, 2), sc('c', 'h2', 5, 2),
    sc('b', 'h4', 7, 2), sc('c', 'h4', 7, 2),
  ])), HOLES)

  eq(rows.map(r => r.holeNumber), [4, 2, 1], 'hardest played first, whatever the card says')
  eq(rows[0].strokeIndex, 13, '  …and the card\'s own index rides along to be read against')
  eq(rows[0].averageToPar, 3, 'three over par on average')
  ok(rows.every(r => !r.settled), `two cards is under ${MIN_HOLE_SAMPLE}, so nothing is settled`)
  eq(rows.map(r => r.rank), [1, 2, 3], 'but they are still ranked, because there is no alternative')

  const settled = holeDifficulty(holeStats(ctxOf(
    PLAYERS.flatMap(p => [sc(p.id, 'h1', 5, 2), sc(p.id, 'h2', 4, 2)])
      .concat(PLAYERS.map(p => sc(p.id, 'h1', 5, 2, null, { roundId: 'r2' })))
      .concat(PLAYERS.map(p => sc(p.id, 'h2', 4, 2, null, { roundId: 'r2' }))),
  )), HOLES)
  ok(settled.every(r => r.settled), 'ten cards a hole is settled')
  eq(settled[0].cards, 10, '  …and two rounds on one course pool rather than split')

  // Each card is scored against its own par.
  const mixed = holeDifficulty(holeStats(ctxOf([
    sc('a', 'h6', 5, 2), sc('b', 'h6', 5, 2), sc('c', 'h6', 5, 2), sc('d', 'h6', 5, 2),
  ])), HOLES)
  eq(mixed[0].averageToPar, 0.25,
    'a par 5 for three of them and a par 4 for Ann averages a quarter over')
  eq(mixed[0].par, 5, '  …and prints as the par the men\'s card says')
}

section('The whole field, and one player out of it')
{
  const stats = holeStats(ctxOf([
    sc('a', 'h1', 4, 2, 'fairway'), sc('b', 'h1', 4, 2, 'left'),
    sc('c', 'h1', 4, 2, 'right'),   sc('d', 'h1', 5, 3, 'fairway'),
    sc('a', 'h2', 4, 2, 'fairway', { roundId: 'r2' }),
  ]))
  const all = playerStats(stats)
  eq(all.length, 4, 'everyone with a hole to their name is on the list')

  const ann = statsFor(stats, 'a')!
  eq(ann.holes, 2, 'Ann played two holes')
  eq(ann.rounds, 2, '  …across two rounds')
  eq(ann.fairways.hit, 2, '  …finding the fairway on both')
  eq(statsFor(stats, 'nobody'), null, 'and somebody with no holes has no line')

  // Worked out once over the field and handed out, not rebuilt per player.
  const direct = gainedOnField(stats)
  for (const p of all) {
    eq(p.gained.total.toFixed(6), (direct.get(p.playerId)?.total ?? 0).toFixed(6),
      `the field figure and the player line agree for ${p.playerId}`)
  }
}

section('Nothing entered means no heading at all')
{
  eq(coverage([]).level, 'none', 'no holes is nothing to show')
  eq(coverage(holeStats(ctxOf([sc('b', 'h1', 4)]))).level, 'none',
    'and a scored hole with no stats on it is still nothing to show')
  eq(coverage(holeStats(ctxOf([sc('b', 'h1', 4, 2)]))).level, 'thin',
    'one putt count is something, but only just')
  const full = coverage(holeStats(ctxOf(
    Array.from({ length: 4 }, (_, r) =>
      HOLES.map(h => sc('b', h.id, 4, 2, null, { roundId: `r${r}` }))).flat(),
  )))
  eq(full.level, 'good', 'a round and more of putt counts is worth believing')
  eq(full.withFairway, 0, '  …and the two are counted apart')
}

section('The rules reach the stats through the one assembly')
{
  // Not a second fetch: a committed card beats a live one, stats included.
  const resolved = resolveScores(
    [{ player_id: 'b', round_id: 'r1', hole_id: 'h1', gross_score: 4,
       stableford_points: 2, no_return: false, putts: 2, fairway_hit: 'fairway' }],
    [{ player_id: 'b', round_id: 'r1', hole_number: 1, gross_score: 6,
       stableford_points: 0, putts: 4, fairway_hit: 'left' }],
    HOLES, new Map([['r1', 'c1']]),
  )
  eq(resolved.length, 1, 'one hole, not two')
  eq(resolved[0].putts, 2, 'and the signed card\'s putt count is the one that counts')
  eq(resolved[0].fairway, 'fairway', '  …along with its fairway')

  // A no return carries no stats out, whatever is stored against it.
  const nr = resolveScores(
    [{ player_id: 'b', round_id: 'r1', hole_id: 'h1', gross_score: 9,
       stableford_points: 0, no_return: true, putts: 3, fairway_hit: 'left' }],
    [], HOLES, new Map([['r1', 'c1']]),
  )
  eq(nr[0].putts, null, 'a no return reports no putts')
  eq(nr[0].fairway, null, '  …and no fairway')
}

section('The derivation is pure, and states each rule once')
{
  const src = read('lib/holeStats.ts')
  const c = code('lib/holeStats.ts')

  ok(/from '\.\/boardRows'/.test(src), 'par comes from the module the board uses')
  ok(!/par_ladies|stroke_index_ladies|gender === 'F'/.test(c),
    '  …rather than being chosen again here')
  ok(!/supabase|\.from\(|useState/.test(c), 'and nothing in it touches a database or a screen')

  // Gross, on the shots played rather than the shots allowed.
  ok(!/shotsReceived|playing_handicap|handicapAllowance/.test(c),
    'no handicap appears anywhere in the gains')

  for (const k of ['MIN_OTHERS', 'MIN_HOLE_SAMPLE', 'MIN_MISSES', 'BIAS_SHARE', 'THIN_UNTIL']) {
    ok(new RegExp(`export const ${k}`).test(src), `${k} is a constant somebody can argue with`)
  }

  // The one copy of the greens-in-regulation rule.
  const appsWithRule = ['app', 'lib'].flatMap(dir => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true })
      .flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`)
        : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : [])
    return walk(dir)
  }).filter(f => f !== 'lib/holeStats.ts' && /par - 2|par-2/.test(code(f)))
  eq(appsWithRule, [], 'and greens in regulation is written down exactly once')
}

section('The lab reads the derivation and does none of its own')
{
  const client = code('app/trip/[tripCode]/stats/StatsClient.tsx')
  const page = code('app/trip/[tripCode]/stats/page.tsx')

  ok(/from '@\/lib\/holeStats'/.test(client), 'the screen imports the derivation')
  // Everything printed comes out of that module, so a figure here and the
  // same figure on the hub cannot disagree.
  ok(!/par - 2|gross - .*putts|\/ others/.test(client),
    '  …and works nothing out for itself')
  ok(/formatGained|formatRate|formatAverage/.test(client),
    'and prints through the shared formatters')

  // Nine queries, once, through the one assembly — not a tenth set here.
  ok(/fetchTripStats/.test(page), 'the page fetches through the shared path')
  ok(!/from\('scores'\)|from\('live_scores'\)|from\('holes'\)/.test(page),
    '  …and asks for no round-scoped table by hand')

  // The furniture every trip route carries. test:branding pins these by
  // name too; restated here so a failure names this feature.
  for (const bit of ['<TripHeader', '<TabBar', 'has-tabbar', '<SupportLink']) {
    ok(page.includes(bit), `the stats route carries ${bit}`)
  }

  // A failed query is said out loud rather than rendered as an absence: an
  // empty table and a broken one look identical, and only one of them means
  // nobody has played.
  ok(/error \?/.test(page), 'a query that failed says so')
  ok(/cover\.level === 'none'/.test(page),
    'and nothing entered gets an empty state rather than a table of dashes')

  // Rust is for a loss, and losing shots to the field is one. Nothing else
  // on these screens may use it.
  const rustUses = (client.match(/rust/g) ?? []).length
  ok(rustUses > 0 && /gainTone/.test(client),
    'rust appears only through the one function that decides a gain is a loss')
}

section('A heading only where there is something behind it')
{
  const hub = code('app/trip/[tripCode]/page.tsx')
  const panel = code('app/trip/[tripCode]/StatsPanel.tsx')
  const board = code('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')

  // Two conditions, and neither on its own is enough.
  ok(/trip\.track_stats === true/.test(hub), 'the trip has to have asked for stats')
  ok(/statsCover\.level !== 'none'/.test(hub), '  …and a card has to have recorded one')
  ok(/'Your stats'|'Trip stats'/.test(hub) === false,
    'and the two banned headings are still banned')

  // Nothing derived on the way to the screen — the hub and the lab print the
  // same figure through the same formatters or they will disagree.
  ok(!/par - 2|\/ others|gross - /.test(panel), 'the hub panel works nothing out')
  ok(/formatGained|formatRate|formatAverage/.test(panel), '  …and prints through the shared ones')

  // A link, not a button: the hub already has its one emerald action.
  ok(/<Link/.test(panel) && !/buttonClass|ButtonLink/.test(panel),
    'the way through is a link rather than a second primary action')

  // The chip is a link to the route, so none of the stats code loads with
  // the board — the same reason the draw is a link.
  ok(/function StatsTab/.test(board), 'the leaderboard offers a stats chip')
  ok(/href=\{`\/trip\/\$\{tripCode\}\/stats`\}/.test(board), '  …as a link to the route')
  ok(!/holeStats/.test(board), '  …and imports none of the stats code')
  // Without widening this, a one-board trip never sees the chip at all.
  ok(/tabs\.length > 1 \|\| showMatchplay \|\| showStats/.test(board),
    'and the strip renders for a one-board trip that has stats on')
}

// ─── Result ────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────────')
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exit(1)
}
