/**
 * Branding tests. Run with: npm run test:branding
 *
 * The green dot is the identity, not decoration, so the pieces that carry it
 * are asserted rather than eyeballed: the wordmark, the dot beneath it, the
 * dot at the top of every trip, and the fact that the old name is gone.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'fs'
import GreenDot from '../app/components/GreenDot'
import Home from '../app/page'
import { SITE } from '../config/site'

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

// ─── The dot ───────────────────────────────────────────────────

section('The green dot')
{
  const dot = renderToStaticMarkup(React.createElement(GreenDot, { size: 22, label: 'Green dot' }))

  ok(dot.includes('gdBreathe'), 'it breathes')
  ok(dot.includes('gdRipple'), 'and sends out a ripple')
  // Strict: the dot itself must be green, not merely sit inside a green halo.
  // An OR here once let a gold dot through a mutation test.
  ok(dot.includes('#34D399'), 'the dot is emerald at its core')
  ok(dot.includes('#6EE7B7'), 'with a lighter highlight')
  ok(dot.includes('#10B981'), 'and a deeper edge')
  ok(dot.includes('rgba(52,211,153'), 'the halo and glow are green too')
  ok(!/C9A84C|201,168,76/.test(dot), 'no gold anywhere in the mark — the dot is the one green thing')
  ok(dot.includes('box-shadow'), 'and it glows')
  ok(dot.includes('aria-label="Green dot"'), 'it can be labelled where it means something')

  // Purely decorative uses are hidden from screen readers
  const plain = renderToStaticMarkup(React.createElement(GreenDot, { size: 14 }))
  ok(plain.includes('aria-hidden="true"'), 'and hidden when it is only decoration')
  ok(!plain.includes('aria-label'), 'with no label to read out')

  // Size drives the whole mark, so a bigger dot really is bigger
  const small = renderToStaticMarkup(React.createElement(GreenDot, { size: 10 }))
  const large = renderToStaticMarkup(React.createElement(GreenDot, { size: 40 }))
  ok(small.includes('width:10px'), 'a small dot is 10px')
  ok(large.includes('width:40px'), 'a large one is 40px')
  ok(large.length > 0 && small !== large, 'the size prop actually changes the output')

  // The glow is drawn around the dot, so the halo is larger than the dot
  ok(large.includes('width:104px'), 'the halo scales with the dot')
}

section('Motion can be turned off')
{
  const css = read('app/globals.css')
  ok(css.includes('@keyframes gdBreathe'), 'the breathe keyframes exist')
  ok(css.includes('@keyframes gdRipple'), 'so do the ripple keyframes')
  ok(css.includes('prefers-reduced-motion'),
    'and anyone who asked for less motion gets a still dot')
}

// ─── Landing page ──────────────────────────────────────────────

const home = renderToStaticMarkup(React.createElement(Home))

section('Landing page')
{
  ok(home.includes('Green Dot'), 'the wordmark reads Green Dot')
  ok(home.includes('>Golf<'), 'with Golf beneath it')
  ok(!home.includes('GripItGolf'), 'the old name is gone')

  // The dot sits under the lettering, which is the whole idea of the mark
  const titleAt = home.indexOf('Green Dot')
  const dotAt   = home.indexOf('gdBreathe')
  ok(dotAt > titleAt, 'the dot comes after the lettering, so it sits beneath it')

  const ctaAt = home.indexOf('Create a Trip')
  ok(dotAt < ctaAt, 'and above the buttons, so it is the centre of the page')

  // The blurb is the Schrödinger line: the dot is undecided until you play
  ok(home.includes('both green and not green'), 'the quote is on the page')
  ok(/only your actions decide/i.test(home), 'including the part that puts it on the golfer')
  ok(home.includes('Schr'), 'and it is attributed')
  ok(home.includes('Erwin'), 'to Erwin, which is the physicist\'s name')
  ok(!home.includes('Ernst'), 'not Ernst')

  // Marked up as a quotation rather than styled to look like one
  ok(home.includes('<blockquote'), 'set as a blockquote')
  ok(home.includes('<figcaption'), 'with the attribution as a caption')

  ok(home.includes('/dashboard/create'), 'Create a Trip still links out')
  ok(home.includes('/join'), 'so does Join a Trip')

  // The title scales rather than being pinned to one size
  ok(home.includes('clamp('), 'the wordmark scales with the viewport')
}

// ─── Trip hub ──────────────────────────────────────────────────

section('Trip hub')
{
  const src = read('app/trip/[tripCode]/page.tsx')

  ok(src.includes('<GreenDot'), 'a green dot sits at the top of a trip')
  ok(!src.includes('Est. {estYear}'), 'the Est. lettering is gone')
  ok(!src.includes('estYear'), 'and nothing is left computing it')

  // The trip name leads the page
  ok(src.includes('clamp(2.25rem,11vw,3.5rem)'), 'the trip name scales up large')
  ok(src.includes('text-balance'), 'and wraps evenly rather than orphaning a word')

  // Courses are listed, not squeezed into one muted line
  ok(src.includes('courseList'), 'courses are held as a list')
  ok(!src.includes("join(' · ')\n") || !src.includes('courseNames'),
    'not flattened into a single string')
  ok(src.includes('The Course'), 'the list is captioned')
  ok(src.includes('text-lg'), 'and set large enough to read at a glance')

  ok(src.includes('← Green Dot Golf'), 'the footer carries the new name')
}

// ─── Everywhere else ───────────────────────────────────────────

section('The old branding is gone')
{
  eq(SITE.name, 'Green Dot Golf', 'the site config names the app')
  ok(SITE.tagline.includes('best 8 of your last 20'), 'and carries the premise')

  const layout = read('app/layout.tsx')
  ok(layout.includes('Green Dot Golf'), 'the browser tab says Green Dot Golf')
  ok(!layout.includes('title: "GripItGolf"'), 'and no longer says GripItGolf')

  const join = read('app/join/JoinForm.tsx')
  ok(join.includes('GreenDot'), 'the join page uses the green dot')
  ok(!join.includes('rounded-full border-2 border-[#C9A84C]" />\n          <div className="w-3 h-3 rounded-full bg-[#C9A84C]'),
    'rather than the old three-dot mark')

  // Nothing user-facing still says the old name
  const files = [
    'app/page.tsx', 'app/layout.tsx', 'app/join/JoinForm.tsx',
    'app/trip/[tripCode]/page.tsx', 'config/site.ts',
  ]
  for (const f of files) {
    ok(!read(f).includes('GripItGolf'), `${f.split('/').pop()} does not mention the old name`)
  }
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
