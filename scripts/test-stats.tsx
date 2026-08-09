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
  scoringCounts, scrambling, approachStats, parSplits,
  pointsVsField, roundForm, miscStats,
  MIN_OTHERS, MIN_HOLE_SAMPLE, MIN_MISSES,
  type StatsContext, type Fairway,
} from '../lib/holeStats'
import { tripAwards, MIN_AWARD_FAIRWAYS } from '../lib/tripAwards'
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
  const from = src.indexOf('function StatsRow')
  ok(from > -1, 'the stats row is where this expects it')
  const tile = src.slice(from)
  ok(tile.length > 500, '  …and is a real component, not a stub')
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

section('Scoring counts read the gross against that player\'s own par')
{
  // h1–h4 are par 4s: 2 eagle, 3 birdie, 4 par, 5 bogey, 6 double.
  const c = scoringCounts(holeStats(ctxOf([
    sc('b', 'h1', 2), sc('b', 'h2', 3), sc('b', 'h3', 4), sc('b', 'h4', 5),
    sc('b', 'h5', 5), // par 3, gross 5 — a double
  ])))
  eq(c.eaglesOrBetter, 1, 'a two on a par 4 is an eagle')
  eq(c.birdies, 1, 'a three is a birdie')
  eq(c.pars, 1, 'a four is a par')
  eq(c.bogeys, 1, 'a five is a bogey')
  eq(c.doublesOrWorse, 1, 'and a five on the par 3 is a double')

  // The same gross on the shared hole lands in different columns per card.
  const mixed = holeStats(ctxOf([sc('a', 'h6', 4, 2), sc('b', 'h6', 4, 2)]))
  eq(scoringCounts(mixed.filter(s => s.playerId === 'a')).pars, 1,
    'a four on the sixth is a par on Ann\'s card')
  eq(scoringCounts(mixed.filter(s => s.playerId === 'b')).birdies, 1,
    '  …and a birdie on Bob\'s')
}

section('A bounce-back is the very next hole, and only the very next hole')
{
  // Fed out of order on purpose: the database returns rows in whatever
  // order it returns them, and a bounce-back read off unsorted input would
  // pair the wrong holes silently. The order matters to the trap — with
  // h2 *before* h1, an unsorted walk pairs the double with h3, fails the
  // adjacency test and finds no chance at all, so skipping the sort changes
  // the answer rather than accidentally agreeing with it.
  const backed = scoringCounts(holeStats(ctxOf([
    sc('b', 'h2', 4), sc('b', 'h1', 6), sc('b', 'h3', 4),
  ])))
  eq(backed.bounceBackChances, 1, 'a double followed by a scored hole is a chance')
  eq(backed.bounceBacks, 1, '  …and the par converts it, wherever the rows arrived')

  const bogeyAfter = scoringCounts(holeStats(ctxOf([
    sc('b', 'h1', 6), sc('b', 'h2', 5),
  ])))
  eq(bogeyAfter.bounceBackChances, 1, 'a bogey after a double is still a chance')
  eq(bogeyAfter.bounceBacks, 0, '  …just not a converted one')

  // A gap is not a next hole. An NR after a blow-up vanishes from the stats
  // entirely, and promoting whatever came after it would call the tail end
  // of a meltdown a recovery.
  const gap = scoringCounts(holeStats(ctxOf([
    sc('b', 'h1', 6), sc('b', 'h3', 4),
  ])))
  eq(gap.bounceBackChances, 0, 'a hole missing in between drops the chance')

  const last = scoringCounts(holeStats(ctxOf([sc('b', 'h6', 8)])))
  eq(last.bounceBackChances, 0, 'and the last hole scored can never be one')

  // Two rounds do not run into each other: a double ending round one is not
  // bounced back by a par opening round two.
  const across = scoringCounts(holeStats(ctxOf([
    sc('b', 'h6', 8), sc('b', 'h1', 4, null, null, { roundId: 'r2' }),
  ])))
  eq(across.bounceBackChances, 0, 'a round\'s last double does not reach into the next round')
}

section('Scrambling is the missed greens that still made par')
{
  const s = scrambling(holeStats(ctxOf([
    sc('b', 'h1', 4, 1),   // to green in 3, one putt: green missed, par saved
    sc('b', 'h2', 3, 0),   // chipped in for birdie off a missed green — the best save
    sc('b', 'h3', 5, 2),   // to green in 3, two putts: missed, bogey — no save
    sc('b', 'h4', 4, 2),   // green in regulation — never a chance
    sc('b', 'h5', 4),      // no putt count — invisible, not guessed at
  ])))
  eq(s.chances, 3, 'three greens missed with the putts known')
  eq(s.saves, 2, 'two of them saved')
  eq(s.rate, 2 / 3, '  …which is the rate')
  eq(scrambling([]).rate, null, 'and nobody scrambles at nothing')
}

section('The approach split is what a missed fairway actually costs')
{
  const a = approachStats(holeStats(ctxOf([
    sc('b', 'h1', 4, 2, 'fairway'),  // from the fairway, green hit
    sc('b', 'h2', 5, 2, 'fairway'),  // from the fairway, green missed
    sc('b', 'h3', 5, 1, 'left'),     // from a miss, green missed
    sc('b', 'h4', 4, 2),             // no fairway answer — in neither side
  ])))
  eq(a.fromFairway.holes, 2, 'two approaches came off the short grass')
  eq(a.fromFairway.girRate, 0.5, '  …finding half the greens')
  eq(a.fromMiss.holes, 1, 'one came out of the rough')
  eq(a.fromMiss.girRate, 0, '  …finding none')
  // vsRegulation over the four with putts: leaks 0, 1, 2, 0 → 0.75.
  // (h3 is gross 5 with one putt — four to the green against a regulation
  // two, which is the long game bleeding while the putter bails it out.)
  eq(a.vsRegulation, 0.75, 'the leak is measured to the green, not to the hole')

  // Regulation is the player's own: five shots and two putts on the sixth
  // is a shot over regulation for Ann and dead on it for Bob.
  const shared = holeStats(ctxOf([sc('a', 'h6', 5, 2), sc('b', 'h6', 5, 2)]))
  eq(approachStats(shared.filter(s => s.playerId === 'a')).vsRegulation, 1,
    'a shot of leak against a par-4 regulation')
  eq(approachStats(shared.filter(s => s.playerId === 'b')).vsRegulation, 0,
    '  …and none against a par-5 one')
}

section('Par splits put every hole in that player\'s own column')
{
  const splits = parSplits(holeStats(ctxOf([
    sc('b', 'h1', 5, 2), sc('b', 'h2', 4, 2),   // two par 4s: +1, E
    sc('b', 'h5', 3, 2),                        // the par 3, on in one
    sc('b', 'h6', 6, 2),                        // the par 5: +1
  ])))
  eq(splits.map(r => r.par), [3, 4, 5], 'in par order, and only pars played')
  eq(splits[1].holes, 2, 'two par 4s')
  eq(splits[1].averageToPar, 0.5, '  …averaging half over')
  eq(splits[0].girRate, 1, 'the par-3 green was found — the pure iron figure')
  eq(splits[2].vsRegulation, 1, 'and the par 5 leaked a shot getting there')

  // Ann's sixth is a par 4, so it lands in her par-4 row, not a par-5 one.
  const ann = parSplits(holeStats(ctxOf([sc('a', 'h6', 5, 2)])))
  eq(ann.map(r => r.par), [4], 'the shared hole splits by the card being played')
}

section('The putting tails say what the average hides')
{
  const p = puttingStats(holeStats(ctxOf([
    sc('b', 'h1', 4, 0),   // chipped in
    sc('b', 'h2', 4, 1),
    sc('b', 'h3', 4, 2),
    sc('b', 'h4', 6, 3),
    sc('b', 'h5', 6, 4),
  ])))
  eq(p.onePutts, 2, 'a chip-in and a one-putt are both the good tail')
  eq(p.threePuttsOrWorse, 2, 'a three and a four are both the bad one')
  eq(p.onePuttRate, 0.4, 'two of five')
  eq(p.threePuttRate, 0.4, '  …either way')
  eq(p.puttsPerHole, 2, 'while the average sits innocently on two')
}

section('Points against the field is the net answer, and it still sums to zero')
{
  // Five cards on one hole: one four-pointer, four twos. The handicaps are
  // inside the points already — that is the whole trick.
  const level = [
    sc('a', 'h1', 4, null, null, { points: 4 }),
    sc('b', 'h1', 4, null, null, { points: 2 }),
    sc('c', 'h1', 4, null, null, { points: 2 }),
    sc('d', 'h1', 4, null, null, { points: 2 }),
    sc('e', 'h1', 4, null, null, { points: 2 }),
  ]
  const g = pointsVsField(holeStats(ctxOf(level)))

  eq(g.get('a')!.points.toFixed(4), '2.0000', 'four points against a field of twos gains two')
  eq(g.get('b')!.points.toFixed(4), '-0.5000', '  …and each two gives half of one back')
  const sum = [...g.values()].reduce((n, x) => n + x.points, 0)
  ok(Math.abs(sum) < 1e-9, 'the net gains over a hole sum to exactly zero')

  // No putt count anywhere — and every hole still counts, which is the
  // point of the net figure covering more of the trip than the gross one.
  ok(g.get('a')!.holes === 1, 'a hole with no putt count is still in the net field')

  const three = pointsVsField(holeStats(ctxOf(level.slice(0, 3))))
  eq([...three.values()].length, 0, `and ${MIN_OTHERS} others are still required`)

  // No handicap is read anywhere in the file — the points carry it in.
  ok(!/shotsReceived|playing_handicap|handicapAllowance/.test(code('lib/holeStats.ts')),
    'the net figure never re-derives a handicap')
}

section('Round form is the Stableford sign every golfer already reads')
{
  const form = roundForm(holeStats(ctxOf([
    sc('b', 'h1', 4, null, null, { points: 3 }),
    sc('b', 'h2', 4, null, null, { points: 2 }),
    sc('b', 'h1', 5, null, null, { points: 1, roundId: 'r2' }),
    sc('b', 'h2', 5, null, null, { points: 2, roundId: 'r2' }),
  ])))
  eq(form.length, 2, 'one line per round')
  eq(form[0].vsHandicap, 1, 'five points over two holes is one better than handicap')
  eq(form[1].vsHandicap, -1, '  …and three over two holes is one worse')
}

section('The miscellany earns its box')
{
  // SI bands off the fixture's own card: h1 SI1 and h2 SI5 in the first
  // third, h3 SI9 in the middle, h4 SI13 and h5 SI17 in the last.
  const m = miscStats(holeStats(ctxOf([
    sc('b', 'h1', 5), sc('b', 'h2', 4),   // 1–6: +1, E
    sc('b', 'h3', 4),                     // 7–12: E
    sc('b', 'h4', 6), sc('b', 'h5', 3),   // 13–18: +2, E
  ])))
  eq(m.siBands.map(b => b.band), ['1–6', '7–12', '13–18'], 'three thirds, in card order')
  eq(m.siBands[0].averageToPar, 0.5, 'half a shot dropped on the hard third')
  eq(m.siBands[2].averageToPar, 1, '  …and a full one on the easy third, which is the finding')
  eq(m.blowUpsPer18, (1 / 5) * 18, 'one double in five holes, said per eighteen')

  // The nines split on the number on the flag — and the tenth is the first
  // hole of the back nine, which is the boundary a lazy `<= 10` gets wrong.
  const nines = miscStats(holeStats(ctxOf([
    sc('b', 'h1', 4),
    sc('b', 'h2', 5, null, null, { holeNumber: 10 }),
    sc('b', 'h3', 6, null, null, { holeNumber: 12 }),
  ])))
  eq(nines.frontNine?.holes, 1, 'the ninth is the last of the front')
  eq(nines.frontNine?.averageToPar, 0, '  …which held together')
  eq(nines.backNine?.holes, 2, 'the tenth opens the back nine')
  eq(nines.backNine?.averageToPar, 1.5, '  …which did not')
  eq(miscStats([]).frontNine, null, 'and no holes is no half, not a level one')

  // The streak: broken by a bogey, broken by a gap, never crossing rounds.
  const run = (rows: ReturnType<typeof sc>[]) => miscStats(holeStats(ctxOf(rows))).longestParRun
  eq(run([sc('b', 'h1', 4), sc('b', 'h2', 4), sc('b', 'h3', 5), sc('b', 'h4', 4)]), 2,
    'two pars, a bogey, a par is a run of two')
  eq(run([sc('b', 'h1', 4), sc('b', 'h2', 4), sc('b', 'h4', 4)]), 2,
    'a hole with no score breaks the run — it is not evidence of a par')
  eq(run([
    sc('b', 'h5', 3), sc('b', 'h6', 5),
    sc('b', 'h1', 4, null, null, { roundId: 'r2' }),
  ]), 2, 'and the walk to the next morning\'s first tee resets everything')
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

section('A mis-tapped putt count is no longer permanent')
{
  const flow = code(FLOW)

  // One implementation, asked on two screens. Two copies of this control is
  // exactly the drift the extraction exists to prevent.
  eq((flow.match(/function StatsRow/g) ?? []).length, 1,
    'the stats row is written once')
  ok((flow.match(/<StatsRow/g) ?? []).length >= 2,
    '  …and rendered on both the live card and the edit screen')

  // The edit screen gates the same way the live tile does: a score on the
  // hole, no NR, and the trip tracking stats at all.
  ok(/trackStats && hs\.gross !== null && !hs\.isNR/.test(flow),
    'the edit screen only asks where the live card would have')
  ok(/setDraftHole\(idx, \{ putts: v \}\)/.test(flow),
    '  …and writes into the draft the save already carries')

  // Both NR toggles clear both stats — the live tile's and the edit one's.
  eq((flow.match(/isNR: true, gross: null, putts: null, fairway: null/g) ?? []).length, 2,
    'a no return clears the stats on either screen')
}

section('The honours go to whoever earned them, and to nobody early')
{
  // Enough real holes to clear every floor: two full rounds per player over
  // the four par 4s, with each player's cards written so the winners are
  // known by construction.
  const rowsFor = (pid: string, gross: number, putts: number, fw: Fairway) =>
    ['r1', 'r2', 'r3', 'r4', 'r5'].flatMap(r =>
      ['h1', 'h2', 'h3', 'h4'].map(h =>
        sc(pid, h, gross, putts, fw, { roundId: r })))

  // Ann: fairways and greens all day. Bob: misses greens, saves every one.
  // Cal: mediocre everywhere, so he wins nothing.
  const fieldStats = playerStats(holeStats(ctxOf([
    ...rowsFor('a', 4, 2, 'fairway'),   // FW 100%, GIR 100%, 2 putts
    ...rowsFor('b', 4, 1, 'left'),      // FW 0%, GIR 0%, scrambles 100%, 1 putt
    ...rowsFor('c', 5, 2, 'right'),     // bogeys, GIR 100% (3 to green? no —
                                        // 5−2=3 > 2, GIR 0%), saves none
  ])))
  const board = tripAwards(fieldStats)
  const winner = (key: string) =>
    board.find(a => a.key === key)?.winnerIds ?? []

  eq(winner('fairways'), ['a'], 'the straightest driver finds the most fairways')
  eq(winner('greens'), ['a'], '  …and the flag hunter the most greens')
  eq(winner('putter'), ['b'], 'the hot putter took the fewest per round')
  eq(winner('scrambler'), ['b'], '  …and saved every green he missed')
  ok(!board.some(a => a.winnerIds.includes('c')), 'and mediocrity wins nothing')

  // Nobody birdied, so there is no birdie award at all rather than an
  // award for the least none.
  ok(!board.some(a => a.key === 'birdies'), 'no birdies means no birdie machine')

  // Ties share the line, and share it on the figure as printed rather than
  // on the last floating-point bit.
  const tied = tripAwards(playerStats(holeStats(ctxOf([
    ...rowsFor('a', 4, 2, 'fairway'),
    ...rowsFor('b', 4, 2, 'fairway'),
  ]))))
  eq(tied.find(a => a.key === 'fairways')?.winnerIds, ['a', 'b'],
    'two players level both hold the award')

  // Below a floor there is no award, however good the rate looks.
  const thin = tripAwards(playerStats(holeStats(ctxOf([
    sc('a', 'h1', 4, 2, 'fairway'),
  ]))))
  ok(!thin.some(a => a.key === 'fairways'),
    `one perfect fairway is not ${MIN_AWARD_FAIRWAYS} of them`)
  ok(!thin.some(a => a.key === 'greens'), 'nor is one green a hunt')

  // The floors are exported and honoured, not restated inline.
  const src = read('lib/tripAwards.ts')
  for (const k of ['MIN_AWARD_FAIRWAYS', 'MIN_AWARD_PUTT_HOLES', 'MIN_AWARD_SCRAMBLES', 'MIN_AWARD_BOUNCES']) {
    ok(new RegExp(`export const ${k}`).test(src), `${k} is a constant somebody can argue with`)
  }

  // Chosen here, derived elsewhere: this module may read PlayerStats and
  // must not restate a single rule of what the figures mean.
  const c = code('lib/tripAwards.ts')
  ok(/from '\.\/holeStats'/.test(c), 'the awards read the derivation')
  ok(!/par - 2|gross -|=== 'fairway'|\/ 18/.test(c),
    '  …and re-derive nothing of their own')
  ok(!/supabase|\.from\(|useState/.test(c), 'and the module is pure')
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

  // ── The migration is run by hand, so nothing a board needs may name a
  // column it adds. `scores.putts` and `scores.fairway_hit` arrive with 028;
  // naming them in the query the leaderboard and the standing line both
  // depend on would take both screens down on any database where that has
  // not been applied yet. Only the stats path asks — and on such a database
  // the trip cannot have stats switched on in the first place.
  const hub = code('lib/hubStanding.ts')
  ok(/withStats = false/.test(hub), 'the shared fetch asks for the stats only when told to')
  ok(/fetchTripContext\(tripId, null, onlyRoundIds, true\)/.test(hub),
    '  …which the stats path does')
  const boardFetch = hub.slice(hub.indexOf('async function fetchBoardRows'),
    hub.indexOf('export async function fetchTripContext'))
  ok(!/putts|fairway_hit|true\)/.test(boardFetch),
    '  …and a board does not')
  for (const f of [
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/[roundNumber]/page.tsx',
  ]) {
    const q = code(f).match(/from\('trips'\)[\s\S]{0,80}?\.select\(([^)]*)\)/)?.[1] ?? ''
    ok(q.length > 0 && !/track_stats/.test(q),
      `${f.split('/').slice(-2).join('/')} does not name track_stats in its query`)
  }

  // The furniture every trip route carries. test:branding pins these by
  // name too; restated here so a failure names this feature.
  //
  // `<TabBar` is not in the list any more, and its absence is the check: the
  // bar is rendered once by app/trip/[tripCode]/layout.tsx so that it stays
  // on screen through a navigation instead of unmounting with the page. The
  // room for it is still the page's own business, because the page is what
  // scrolls.
  for (const bit of ['<TripHeader', 'has-tabbar', '<SupportLink']) {
    ok(page.includes(bit), `the stats route carries ${bit}`)
  }
  // The page has a name now, set as artwork like the other three, and the
  // loading state wears the same one so arriving does not change the header.
  ok(page.includes('title="statsHub"'), 'the header says stats hub')
  // …and only there: the h1 row under it said "Stats" a second time, and
  // went by request.
  ok(!page.includes('<h1'), 'no page-title row repeats what the artwork says')
  // The Courses view is a breakdown, not just the difficulty table: the
  // field on that course leads, ranked by the one figure fair across every
  // handicap on the trip.
  ok(/CourseField/.test(client), 'the courses view carries the field on that course')
  ok(code('app/trip/[tripCode]/stats/loading.tsx').includes('title="statsHub"'),
    '  …and the skeleton already says it')
  ok(code('app/components/TitleMark.tsx').includes('statsHub'),
    '  …from the one register of title marks')
  ok(!page.includes('<TabBar'),
    'and does not draw its own tab bar over the layout’s')

  // A failed query is said out loud rather than rendered as an absence: an
  // empty table and a broken one look identical, and only one of them means
  // nobody has played.
  ok(/error \?/.test(page), 'a query that failed says so')
  ok(/cover\.level === 'none'/.test(page),
    'and nothing entered gets an empty state rather than a table of dashes')

  const panels = code('app/trip/[tripCode]/stats/panels.tsx')

  // Rust is for a loss, and losing shots to the field is one. Nothing else
  // on these screens may use it.
  ok((panels.match(/rust/g) ?? []).length > 0 && /gainTone/.test(panels),
    'rust appears only through the one function that decides a gain is a loss')

  // The category boxes read the derived blocks and derive nothing.
  ok(!/par - 2|gross - .*putts|\/ others/.test(panels),
    'the panels work nothing out for themselves')
  for (const bit of ['Scoring', 'Approach', 'Scrambling', 'One-putts', 'By par']) {
    ok(panels.includes(bit), `a player's page carries ${bit}`)
  }
  // Demoted, by request: bounce-back reads in Miscellaneous, and only there.
  const misc = panels.slice(panels.indexOf('title="Miscellaneous"'))
  ok(misc.includes('Bounced back'), 'bounce-back lives in the miscellany')
  ok(!panels.slice(0, panels.indexOf('title="Miscellaneous"')).includes('Bounced back'),
    '  …and nowhere above it')
  // The leak never goes through formatGained, whose green would call shots
  // given away a gain.
  ok(/leak/.test(panels) && !/formatGained\(a\.vsRegulation/.test(panels),
    'the leak to the green is signed like a score, not tinted like a gain')

  // ── The instrument ──
  //
  // The first choice is who or where; the field is category boxes in the
  // one-player idiom, not the cramped five-column table it replaced.
  ok(/\['players', 'Players'\], \['courses', 'Courses'\]/.test(client),
    'the first choice on the page is players or courses')
  ok(/'everyone'/.test(client) && />[\s]*Everyone[\s]*</.test(read('app/trip/[tripCode]/stats/StatsClient.tsx')),
    'the field is a chip at the head of the player list')
  ok(/meId \?\? 'everyone'/.test(client),
    '  …and the device\'s player opens their own numbers')
  ok(!/function Field/.test(client) && /RankedBox/.test(panels),
    'the field view is ranked category boxes, not one table')

  // **Filter the holes, never the field.** The course filter narrows which
  // holes count; the field on those holes is everybody who played them. The
  // filter must run before playerStats, and never mention a player.
  ok(/stats\.filter\(s => !excluded\.has\(s\.courseId\)\)/.test(client),
    'the course filter excludes holes by course')
  ok(/playerStats\(filtered\)/.test(client),
    '  …and the field is computed over what is left')
  ok(!/filter\(s => s\.playerId/.test(client),
    '  …with no player ever filtered out of a field')

  // The last course standing cannot be switched off — a stats page over no
  // holes at all is not a state anybody means.
  ok(/playedCourseIds\.length - next\.size > 1/.test(client),
    'the last course cannot be excluded')

  // The controls stick under the site header, offset the way every sticky
  // row in the app must be.
  ok(/sticky/.test(client) && /top: HEADER_H/.test(client),
    'the controls pin under the header, never at top-0')

  // The awards fold into the Everyone view — the tab is gone.
  ok(!/'awards', 'Awards'/.test(client), 'the awards tab is gone')
  ok(/awards\.map/.test(panels) && /Final honours/.test(panels),
    '  …and the honours render at the foot of Everyone')

  // ── The charts ──
  const charts = code('app/trip/[tripCode]/stats/charts.tsx')

  // Hand-drawn SVG, and dumb: values arrive computed, drawn as given.
  ok(/<svg/.test(charts), 'the charts are drawn by hand')
  ok(!/playerStats|gainedOnField|pointsVsField|holeDifficulty/.test(charts),
    '  …and derive nothing of their own')
  ok(!/recharts|chart\.js|d3/.test(charts.toLowerCase()),
    '  …with no charting library behind them')

  // Emerald-for-gain and rust-for-loss is a red/green pair a deutan reader
  // cannot split — the palette validator measured ΔE 4.8 — so colour never
  // carries the encoding. Which side of the zero line a bar sits does, and
  // every readout figure is signed.
  ok(/zeroY/.test(charts), 'polarity is encoded by which side of zero the bar sits')
  ok(/formatGained/.test(charts), '  …and every readout figure carries its sign')

  // A tap target is the whole column, never the sliver of a small bar.
  ok(/fill="transparent"/.test(charts) && /role="button"/.test(charts),
    'the tap target is wider than the mark, and announces itself')

  // The per-round bars are sliced per round AFTER the course filter, so the
  // filter-the-holes rule holds for the chart too.
  ok(/filtered\.filter\(s => s\.roundId === r\.id\)/.test(client),
    'the round chart slices the filtered holes, keeping the field whole')
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
