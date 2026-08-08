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

// ─── Result ────────────────────────────────────────────────────

console.log('\n────────────────────────────────────────────────────────')
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exit(1)
}
