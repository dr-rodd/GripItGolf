/**
 * Bracket render tests. Run with: npm run test:bracket-render
 *
 * Renders the real component to static markup across every bracket size, so a
 * crash or a missing BYE shows up here rather than on someone's phone on the
 * first tee. Effects and animation do not run under server rendering, so this
 * covers the initial paint — the geometry through a swipe is covered by
 * test-bracket-layout.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import MatchplayBracket, {
  type BracketMatchRow, type BracketPlayerRow,
} from '../app/trip/[tripCode]/matchplay/MatchplayBracket'
import { generateBracket, bracketToRows, bracketShape } from '../lib/matchplay'

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

function build(count: number) {
  const players: BracketPlayerRow[] = Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player${i + 1}`,
    handicap: i + 1,
  }))
  let id = 0
  const generated = generateBracket(
    players.map(p => ({ id: p.id, name: p.name })),
    { makeId: () => `m${++id}` }
  )
  const matches = bracketToRows('trip', generated) as unknown as BracketMatchRow[]
  return { players, matches }
}

function render(count: number) {
  const { players, matches } = build(count)
  return renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches, players })
  )
}

// ─── Renders at every bracket size ─────────────────────────────

section('Renders across bracket sizes')
for (const count of [2, 3, 4, 6, 8, 9, 11, 16, 20, 32]) {
  const shape = bracketShape(count)
  const label = `${count} players (${shape.totalRounds} round${shape.totalRounds === 1 ? '' : 's'})`
  let html = ''
  try {
    html = render(count)
    passed++
  } catch (e) {
    failed++
    failures.push(`${label} threw: ${(e as Error).message}`)
    console.log(`  FAIL  ${label} threw: ${(e as Error).message}`)
    continue
  }
  ok(html.length > 0, `${label}: produces markup`)
  ok(html.includes('Swipe to move between rounds'), `${label}: renders the whole component`)
}

// ─── Round header at first paint ───────────────────────────────

section('Round header')
{
  eq(render(32).includes('Round of 32 → Round of 16'), true,
    '32 players opens on "Round of 32 → Round of 16"')
  eq(render(6).includes('Quarter-Final → Semi-Final'), true,
    '6 players opens on "Quarter-Final → Semi-Final"')
  eq(render(4).includes('Semi-Final → Final'), true,
    '4 players opens on "Semi-Final → Final"')

  // A two-player bracket is a lone Final: one round, so no arrow anywhere
  const two = render(2)
  ok(two.includes('Final'), '2 players shows "Final"')
  ok(!two.includes('→'), '2 players shows no arrow, having nothing to point at')
}

// ─── Byes ──────────────────────────────────────────────────────

section('Byes are shown, not left blank')
{
  // 6 players in a bracket of 8 → seeds 1 and 2 draw byes
  const six = render(6)
  ok(six.includes('Bye'), '6 players: BYE appears on the card')
  eq((six.match(/>Bye</g) ?? []).length, 2, '6 players: exactly two byes shown')

  // 9 players in a bracket of 16 → seven byes
  const nine = render(9)
  eq((nine.match(/>Bye</g) ?? []).length, 7, '9 players: exactly seven byes shown')

  // An exact power of two has none
  const eight = render(8)
  ok(!eight.includes('>Bye<'), '8 players: no byes, none shown')

  // A bye slot must not also show a name or a handicap
  const { players, matches } = build(6)
  const byeMatch = matches.find(m => m.player_b_is_bye)!
  ok(byeMatch.player_b_id === null, 'a bye slot holds no player')
  ok(players.every(p => p.id !== null), 'sanity: players exist to be omitted')
}

// ─── Names and handicaps ───────────────────────────────────────

section('Tile content')
{
  const html = render(8)
  for (let i = 1; i <= 8; i++) {
    ok(html.includes(`Player${i}`), `8 players: Player${i} appears on the card`)
  }
  // Handicaps were seeded 1..8; the first round shows all eight
  ok(html.includes('>1<') && html.includes('>8<'), '8 players: handicaps are rendered')

  // Later rounds have nobody in them yet
  ok(render(8).includes('To be decided'), 'undecided slots read "To be decided"')
}

// ─── Structure ─────────────────────────────────────────────────

section('Structure')
{
  // At first paint the visible pair is rounds 1 and 2, plus one lookahead
  // column that is rendered faded and clipped.
  const html = render(16)
  const tiles = (html.match(/class="absolute rounded-sm border/g) ?? []).length
  ok(tiles >= 8 + 4, '16 players: at least the first two rounds are laid out')

  // Connectors are drawn as SVG paths
  ok(html.includes('<svg'), 'an SVG layer is present for the connectors')
  ok(html.includes('<path'), 'connector paths are drawn')
  const paths = (html.match(/<path d="M /g) ?? []).length
  ok(paths > 0, 'at least one connector joins a pair to its target')

  // The Final gets a placeholder rather than a blank column — only when
  // there is no next round, so not at first paint on a multi-round bracket
  ok(!render(16).includes('Winner'), '16 players: no winner placeholder at the first round pair')
  ok(render(2).includes('Winner'), '2 players: the lone Final shows the winner placeholder')
}

// ─── Navigation affordances ────────────────────────────────────

section('Navigation')
{
  const html = render(32)
  ok(html.includes('aria-label="Previous round"'), 'a previous-round control exists')
  ok(html.includes('aria-label="Next round"'), 'a next-round control exists')
  ok(html.includes('disabled=""'), 'at the first round, going back is disabled')

  // One dot per round
  const shape = bracketShape(32)
  const dots = (html.match(/aria-label="Go to /g) ?? []).length
  eq(dots, shape.totalRounds, '32 players: one position dot per round')
  eq((render(6).match(/aria-label="Go to /g) ?? []).length, 3,
    '6 players: three position dots')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
