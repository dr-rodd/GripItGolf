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
  type BracketMatchRow, type BracketEntrantRow,
} from '../app/trip/[tripCode]/matchplay/MatchplayBracket'
import { playerEntrant, pairEntrant } from '../lib/matchplayEntrants'
import { generateBracket, bracketToRows, bracketShape } from '../lib/matchplay'
import { isDecidable } from '../lib/matchplayProgress'

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
  const entrants: BracketEntrantRow[] = Array.from({ length: count }, (_, i) =>
    playerEntrant({ id: `p${i + 1}`, name: `Player${i + 1}`, handicap: i + 1 }))
  let id = 0
  const generated = generateBracket(
    entrants.map(e => ({ id: e.id, name: e.name })),
    { makeId: () => `m${++id}` }
  )
  const matches = bracketToRows('trip', generated) as unknown as BracketMatchRow[]
  return { players: entrants, matches }
}

function render(count: number) {
  const { players, matches } = build(count)
  return renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches, entrants: players })
  )
}

/** The same, but between pairings of two. */
function buildPairs(pairCount: number) {
  const entrants: BracketEntrantRow[] = Array.from({ length: pairCount }, (_, i) =>
    pairEntrant(
      { id: `t${i + 1}`, name: `Team ${String.fromCharCode(65 + i)}` },
      [
        { id: `p${i}a`, name: `Alpha${i + 1} Surname`, handicap: i + 1 },
        { id: `p${i}b`, name: `Beta${i + 1} Surname`, handicap: 20 - i },
      ],
    ))
  let id = 0
  const generated = generateBracket(
    entrants.map(e => ({ id: e.id, name: e.name })),
    { makeId: () => `mp${++id}` }
  )
  const matches = bracketToRows('trip', generated) as unknown as BracketMatchRow[]
  return { entrants, matches }
}

function renderPairs(pairCount: number) {
  const { entrants, matches } = buildPairs(pairCount)
  return renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches, entrants })
  )
}

// ─── A pairs draw shows the players, not the pairing ───────────

section('Pairings are shown as their players')
{
  const html = renderPairs(4)

  // "In the matchplay leaderboard no need to name the pairings. Just put the
  // players names beside each other."
  ok(html.includes('Alpha1 &amp; Beta1'), 'both first names appear, side by side')
  ok(html.includes('Alpha2 &amp; Beta2'), 'for every pairing in the draw')
  ok(!html.includes('Team A'), 'and the team name is not used')
  ok(!html.includes('Team B'), 'for any of them')

  // Surnames do not fit a tile, and never did for singles either
  ok(!html.includes('Surname'), 'surnames are dropped, as they are for players')

  // The combined handicap is what a pairing plays off
  ok(html.includes('>21<'), 'the pairing shows its combined handicap')

  // A singles draw is unaffected
  const singles = render(4)
  ok(singles.includes('>Player1<'), 'a singles draw still shows one name')
  ok(!singles.includes('&amp;'), 'with nothing joined to it')
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
  // The header names the left column only
  eq(render(32).includes('Round of 32'), true, '32 players opens titled "Round of 32"')
  eq(render(6).includes('Quarter-Final'), true, '6 players opens titled "Quarter-Final"')
  eq(render(4).includes('Semi-Final'), true, '4 players opens titled "Semi-Final"')

  // The next round is not named, and no arrow is drawn
  ok(!render(6).includes('→'), '6 players: no arrow in the header')
  ok(!render(32).includes('→'), '32 players: no arrow in the header')
  ok(!render(4).includes('Semi-Final → Final'), '4 players: the next round is not named')

  const two = render(2)
  ok(two.includes('Final'), '2 players shows "Final"')
  ok(!two.includes('→'), '2 players shows no arrow')
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

// ─── Decided matches ───────────────────────────────────────────

section('Won matches show green and the margin')
{
  const { players, matches } = build(8)
  // Settle the first quarter-final 3&2
  const first = matches.find(m => m.round_number === 1)!
  const decided = matches.map(m =>
    m.id === first.id
      ? { ...m, winner_player_id: first.player_a_id, result: '3&2' }
      : m
  )
  const html = renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches: decided, entrants: players })
  )

  ok(html.includes('3&amp;2') || html.includes('3&2'), 'the margin is shown on the tile')
  ok(html.includes('border-accent/50'), 'the tile itself is outlined once won')
  ok(html.includes('text-accent-deep'), 'and the winning name carries the accent')

  // Undecided matches stay neutral
  const plain = renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches, entrants: players })
  )
  ok(!plain.includes('border-accent/50'), 'an unplayed tile is not outlined')
  ok(!plain.includes('3&amp;2'), 'and carries no margin')

  // A bye has a winner but was never played, so it must not read as won
  const { players: sixP, matches: sixM } = build(6)
  const byeHtml = renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches: sixM, entrants: sixP })
  )
  const byeMatch = sixM.find(m => m.player_b_is_bye)!
  ok(byeMatch.winner_player_id !== null, 'the bye does carry a winner in the data')
  ok(!byeHtml.includes('border-accent/50'),
    'but a bye is not marked as won — it was awarded, not played')
}

// ─── The champion ──────────────────────────────────────────────

section('The champion is solid, an ordinary win is a tint')
{
  const { players, matches } = build(4)
  const finalMatch = matches.find(m => m.next_match_id === null)!

  // Play both semis, then the Final
  let played = matches
  for (const sf of matches.filter(m => m.round_number === 1)) {
    played = played.map(m => m.id === sf.id
      ? { ...m, winner_player_id: sf.player_a_id, result: '3&2' } : m)
    played = played.map(m => m.id === finalMatch.id
      ? { ...m, [sf.next_slot === 'A' ? 'player_a_id' : 'player_b_id']: sf.player_a_id }
      : m)
  }
  const champion = played.find(m => m.id === finalMatch.id)!.player_a_id
  played = played.map(m => m.id === finalMatch.id
    ? { ...m, winner_player_id: champion, result: '2 up' } : m)

  const html = renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches: played, entrants: players })
  )

  // There is only one accent now, so the hierarchy lives inside it: a won
  // match is an emerald tint, the champion is filled solid emerald. Two
  // weights of one hue rather than two competing colours.
  ok(html.includes('border-accent bg-accent'), 'the champion tile is filled solid')
  ok(html.includes('text-white font-semibold'), 'with the name reversed out of it')
  ok(!html.includes('rgba(10,157,86,0.12), 0 0 24px'), 'and no glow — the guide has none')

  // Ordinary wins stay a tint — solid means winning the whole thing
  ok(html.includes('border-accent/50'), 'the semi-finals keep the outline')
  ok(html.includes('text-accent-deep'), 'and their winners the accent text')

  // An undecided Final gets none of it
  const unfinished = played.map(m => m.id === finalMatch.id
    ? { ...m, winner_player_id: null, result: null } : m)
  const plainHtml = renderToStaticMarkup(
    React.createElement(MatchplayBracket, { matches: unfinished, entrants: players })
  )
  ok(!plainHtml.includes('rgba(201,168,76'), 'an unwon Final does not glow')

  // A won semi-final is not treated as the champion — it advances somewhere
  ok(plainHtml.includes('border-accent/50'),
    'a won semi is still marked even when the Final is open')
  ok(!plainHtml.includes('border-accent bg-accent'),
    'and never gets the champion styling')
}

section('Press feedback is wired up')
{
  const html = render(8)
  ok(html.includes('@keyframes holdFill'), 'the hold animation is defined')
  ok(html.includes('transform:scale('), 'tiles carry a scale transform for the press')
  // The style guide is explicit: ease-out everywhere, no bounce, no spring,
  // no elastic easing. The release used to overshoot; it no longer does.
  ok(html.includes('ease-out'), 'the release eases out')
  ok(!html.includes('cubic-bezier(0.34, 1.56, 0.64, 1)'),
    'and does not overshoot — no spring anywhere in the system')
}

// ─── Interaction ───────────────────────────────────────────────

section('Which tiles are interactive')
{
  const { matches } = build(6)
  const r1 = matches.filter(m => m.round_number === 1)

  const byes = r1.filter(m => m.player_a_is_bye || m.player_b_is_bye)
  const real = r1.filter(m => !m.player_a_is_bye && !m.player_b_is_bye)
  eq(byes.length, 2, '6 players: two bye tiles')
  eq(real.length, 2, '6 players: two playable tiles')

  ok(byes.every(m => !isDecidable(m)), 'bye tiles are not decidable')
  ok(real.every(m => isDecidable(m)), 'playable tiles are')

  // A later round with nobody in it yet cannot be tapped either
  const later = matches.filter(m => m.round_number > 1)
  ok(later.every(m => !isDecidable(m)), 'empty later-round tiles are not decidable')

  // Interactive tiles carry the pointer affordance, byes do not.
  // Counting the class is how we tell handlers were attached at all.
  const html = render(6)
  const interactive = (html.match(/cursor-pointer/g) ?? []).length
  eq(interactive, 2, 'exactly the two playable tiles are interactive')

  // With no byes every first-round tile is interactive
  eq((render(8).match(/cursor-pointer/g) ?? []).length, 4,
    '8 players: all four quarter-finals are interactive')
}

section('The hold hint is present')
{
  ok(render(8).includes('hold a finished match to change it'),
    'the correction gesture is explained rather than left to be discovered')
}

// ─── Structure ─────────────────────────────────────────────────

section('Structure')
{
  // At first paint the visible pair is rounds 1 and 2, plus one lookahead
  // column that is rendered faded and clipped.
  const html = render(16)
  const tiles = (html.match(/relative w-full h-full rounded-lg border/g) ?? []).length
  ok(tiles >= 8 + 4, '16 players: at least the first two rounds are laid out')

  // Connectors are drawn as SVG paths
  ok(html.includes('<svg'), 'an SVG layer is present for the connectors')
  ok(html.includes('<path'), 'connector paths are drawn')
  const paths = (html.match(/<path d="M /g) ?? []).length
  ok(paths > 0, 'at least one connector joins a pair to its target')

  // The empty winner box is gone — a won Final marks itself instead
  ok(!render(16).includes('>Winner<'), '16 players: no winner box')
  ok(!render(2).includes('>Winner<'), '2 players: no winner box either')
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
