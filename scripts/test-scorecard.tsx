/**
 * Scorecard rendering tests. Run with: npm run test:scorecard
 *
 * The scoring module is the oldest code in the app and the least forgiving:
 * it is the only screen anybody uses standing on a tee, and a card that
 * renders wrongly there is a round lost. Restyling it is exactly the kind of
 * change that can look fine in a diff and be broken on grass.
 *
 * So two things are pinned here:
 *
 *   · every score shape, at every size, actually renders its number
 *   · the nett and no-return arithmetic is untouched, checked against the
 *     canonical rules in CLAUDE.md rather than against the code's own idea
 *     of itself
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'fs'
import ScoreShape, { NoReturnShape } from '../app/components/ScoreShape'

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

const shape = (gross: number, par: number, size: 'sm' | 'md' | 'lg' = 'md') =>
  renderToStaticMarkup(React.createElement(ScoreShape, { gross, par, size }))

// ─── The number always survives ────────────────────────────────

section('Every score still renders its number')
{
  // The whole point of a scorecard. A shape that swallowed its own number
  // would be worse than no shape at all.
  for (const par of [3, 4, 5]) {
    for (let gross = 1; gross <= par + 5; gross++) {
      const html = shape(gross, par)
      ok(html.includes(`>${gross}<`), `${gross} on a par ${par} shows the number`)
    }
  }
  for (const size of ['sm', 'md', 'lg'] as const) {
    ok(shape(4, 4, size).includes('>4<'), `and at size ${size}`)
  }
}

// ─── The marks themselves ──────────────────────────────────────

section('Under par is filled, over par is a quiet wash')
{
  const eagle  = shape(2, 4)
  const birdie = shape(3, 4)
  const par    = shape(4, 4)
  const bogey  = shape(5, 4)
  const double = shape(6, 4)

  // Filled, not outlined — the old card drew rings and boxes in thin strokes
  for (const [name, html] of Object.entries({ eagle, birdie, par, bogey, double })) {
    ok(!/\bborder\b/.test(html), `${name} has no outline`)
  }

  ok(eagle.includes('rounded-full') && eagle.includes('bg-accent-deep'),
    'an eagle is a solid deep emerald disc')
  ok(eagle.includes('text-white'), '  …with a white numeral, which reads on it')
  ok(birdie.includes('rounded-full') && birdie.includes('bg-accent/25'),
    'a birdie is a lighter emerald disc')

  // Level is the quietest thing on the card
  ok(!par.includes('bg-'), 'par is the bare number, with nothing behind it')

  ok(bogey.includes('bg-bark/[0.10]'), 'a bogey is a soft bark square')
  ok(double.includes('bg-bark/[0.20]'), 'and a double the same square, a shade stronger')
  ok(bogey.includes('rounded-lg') && double.includes('rounded-lg'), 'both are rounded')

  // Most amateur holes are one of these two, so they cannot shout
  const alpha = (h: string) => Number(h.match(/bg-bark\/\[([\d.]+)\]/)?.[1] ?? 1)
  ok(alpha(bogey) <= 0.15, 'a bogey sits under 15% — most holes are one')
  ok(alpha(double) > alpha(bogey), 'and a double is the heavier of the two')
  ok(alpha(double) <= 0.25, 'without becoming a block of colour')

  // Worse than a double keeps the same mark rather than escalating forever
  eq(shape(8, 4).includes('bg-bark/[0.20]'), true, 'a triple is marked as a double is')
}

section('A no return is not a score')
{
  const nr = renderToStaticMarkup(React.createElement(NoReturnShape, {}))
  ok(nr.includes('NR'), 'it says NR')
  ok(nr.includes('rust'), 'in the colour the app uses for a loss')
  ok(!/\d/.test(nr.replace(/[^>]*>/g, '')), 'and carries no number, because there is not one')
}

// ─── One shape, everywhere ─────────────────────────────────────

section('Every card in the app draws the same shape')
{
  const cards = [
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
    'app/scorecard/[playerId]/ScorecardClient.tsx',
  ]
  for (const f of cards) {
    ok(read(f).includes('ScoreShape'), `${f.split('/').pop()} uses the shared shape`)
  }

  // …and none of them still draws its own
  for (const f of cards) {
    ok(!/rounded-full border border-accent[\s\S]{0,80}inset-\[2px\]/.test(read(f)),
      `  …and ${f.split('/').pop()} no longer draws its own rings`)
  }
}

// ─── The sticky header must not sit on the leader ──────────────

section('The column headings stay above the board')
{
  const src = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')

  // position: sticky measures its offset from the nearest scrollport. An
  // ancestor with overflow-hidden *is* one, so `top: HEADER_H` then counted
  // from the card's own top edge instead of the viewport's and dropped the
  // headings 52px down the card, straight onto whoever was leading.
  const card = src.match(/<div className="bg-surface border border-bark\/12 rounded-2xl[^"]*">\s*\{\/\* Sticky column headers/)
  ok(card !== null, 'the board card is found')
  ok(!/rounded-2xl overflow-hidden">\s*\{\/\* Sticky column headers/.test(src),
    'and does not clip its own overflow, which would break the sticky offset')

  ok(src.includes('style={{ ...gridStyle, top: HEADER_H }}'),
    'the headings still pin below the wordmark bar')
  ok(src.includes("className=\"sticky z-10"), 'and are still sticky')
}

// ─── The card is the app's, not Donegal's ──────────────────────

section('Scorecards are brown and cream, not green')
{
  const cards = [
    'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx',
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
  ]
  for (const f of cards) {
    const src = read(f)
    const name = f.split('/').pop()
    // Emerald is the accent. A card that is half green stops it meaning
    // anything, and the summary bands were the biggest green on the screen.
    ok(!/rgba\(10,\s*157,\s*86/.test(src), `${name} has no emerald wash`)
    ok(!src.includes('0A6B3C'), `  …and no emerald text left over from the old card`)
    // …and nothing is pretending to be paper any more
    ok(!/#(EEE8D6|EAE4D5|E2DAC8|D4CBBA|F5F0E8|C9A84C)/i.test(src),
      `  …nor any parchment or gold`)
  }
  ok(read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
    .includes("SC_BAND  = 'rgba(74,55,40,0.04)'"),
    'the summary bands are a wash of bark')
}

// ─── The card is the app's card ────────────────────────────────

section('Scorecards are the same card as everywhere else')
{
  const cards = [
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/scoring/[slug]/CourseDashboardClient.tsx',
  ]
  for (const f of cards) {
    const src = read(f)
    const name = f.split('/').pop()
    // Donegal's 2px corners. Everything in this app is rounded-xl or -2xl.
    ok(!/\brounded-sm\b/.test(src), `${name} has no square Donegal corners`)
    // "No gradients. No glows." — one of these was a green halo on a live dot
    ok(!/shadow-\[0_0/.test(src), `  …and no glow`)
    // The serif is a token, not a font stack typed out by hand
    ok(!src.includes('Georgia'), `  …and names no font by hand`)
  }

  ok(read('app/scoring/LiveScoringFlow.tsx')
    .includes('rounded-2xl border border-bark/12 bg-surface'),
    'the scorecard is the same card as a settings section')
}

// ─── The maths the whole thing rests on ────────────────────────

section('Nett and no-return arithmetic is untouched')
{
  const flow = read('app/scoring/LiveScoringFlow.tsx')

  // Straight out of CLAUDE.md: shots = floor(hcp/18) + (1 if si <= hcp%18)
  ok(/function shotsReceived\(si: number, hcp: number\)/.test(flow),
    'shotsReceived still takes (si, hcp) — in that order')
  ok(flow.includes('Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0)'),
    'and is the WHS allocation, unchanged')

  // points = max(0, par + 2 - nett)
  ok(flow.includes('Math.max(0, par + 2 - (gross - shotsReceived(si, hcp)))'),
    'stableford is still par + 2 - nett, floored at zero')

  // A no return is capped at the score that scores nothing — this is what
  // makes nett strokes work when somebody picks up
  ok(flow.includes('return par + 2 + shotsReceived(si, hcp)'),
    'a no return still counts as nett double bogey, which is what nett strokes need')

  // The call sites that decide which of the two is used
  ok(flow.includes('hs.isNR ? nrGross(p, si, setup.playingHcp) : hs.gross!'),
    'a picked-up hole is written as that capped gross, not as null')
  ok(flow.includes('stableford_points: hs.isNR ? 0 : calcStableford'),
    'and scores zero points, without disturbing the stroke total')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
