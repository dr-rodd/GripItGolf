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
import BackButton from '../app/components/BackButton'
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

  // The schedule reads as days, not as a flat list of rounds: two rounds on
  // the same date are one card with two courses under it.
  ok(src.includes('function formatDay'), 'there is a day formatter')
  ok(src.includes("weekday: 'long'"), 'which names the weekday, not just the date')
  ok(src.includes("timeZone: 'UTC'"),
    'and reads the date as a plain date, so the 17th is the 17th anywhere')
  ok(/existing\.courses\.push/.test(src),
    'rounds sharing a date are gathered under one day')
  ok(src.includes('d.courses.map'), 'and every course on that day is listed')
  ok(src.includes('text-lg'), 'set large enough to read at a glance')

  // Not squeezed into one muted line the way it was
  ok(!src.includes('courseList'), 'the old flat course list is gone')
  ok(!src.includes('The Course'), 'and its caption with it')

  // The hero no longer fills the screen before anything useful appears
  ok(src.includes('pt-8'), 'the hero starts near the top')
  ok(!/section className="min-h-dvh/.test(src), 'rather than centring in a full screen')

  ok(src.includes('label="Green Dot Golf"'), 'the footer carries the new name')
}

section('The players button stops asking once everyone is in')
{
  const src = read('app/trip/[tripCode]/page.tsx')

  ok(src.includes('everyoneIn'), 'the page knows when the field is complete')
  ok(/const everyoneIn = players\.length > 0 && pendingCount === 0/.test(src),
    'which means at least one player and none pending — an empty trip is not complete')

  // Gold is a prompt. With nobody left to join there is nothing to prompt.
  const btn = src.slice(src.indexOf('everyoneIn'), src.indexOf('{isDraft ?'))
  ok(/everyoneIn[\s\S]*?'border-white\/15/.test(btn), 'complete: the button goes quiet')
  ok(/'border-\[#C9A84C\] text-\[#C9A84C\]/.test(btn), 'incomplete: it is still gold')
  ok(btn.includes("everyoneIn ? 'Players' : 'Join Trip'"),
    'and it stops saying Join Trip once there is nobody left to join')
}

// ─── Back controls ─────────────────────────────────────────────

section('There is one way back')
{
  const bare  = renderToStaticMarkup(React.createElement(BackButton, { href: '/' }))
  const named = renderToStaticMarkup(React.createElement(BackButton, { href: '/trip/ABC123', label: 'Trip' }))

  // The box, not a bare chevron or a tiny text link
  ok(bare.includes('rounded-xl'), 'it is a rounded box')
  // Named exactly: a bare `includes('border')` once passed on a borderless
  // pill, because the hover class still had the word in it.
  ok(bare.includes('border border-white/15'), 'with a border at rest, so it reads as a control')
  ok(bare.includes('bg-white/[0.04]'), 'and a fill faint enough not to compete with the page')
  ok(bare.includes('h-11'), 'and it is 44px tall — a real touch target')
  ok(bare.includes('w-11'), 'square when it is only an arrow')
  ok(bare.includes('<svg'), 'carrying a back arrow')

  // A labelled one widens rather than shrinking the text into the square
  ok(named.includes('px-4'), 'a labelled one is padded out instead')
  ok(!named.includes('w-11'), 'and is no longer square')
  ok(named.includes('>Trip<'), 'showing the word')
  ok(named.includes('/trip/ABC123'), 'and linking where it says')

  // The arrow alone has no text, so it needs a name read out; the labelled
  // one already has one and would otherwise be announced twice.
  ok(bare.includes('aria-label="Back"'), 'the bare arrow is named for screen readers')
  ok(!named.includes('aria-label'), 'the labelled one is not, since its text already names it')

  // Both forms exist because some places navigate and some just close
  const button = renderToStaticMarkup(React.createElement(BackButton, { onClick: () => {} }))
  ok(button.includes('<button'), 'it can be a button when there is nowhere to link to')
  ok(button.includes('type="button"'), 'and never submits a form it happens to sit in')
  ok(bare.includes('<a'), 'and a link when there is')

  // Nothing anywhere still rolls its own
  const pages = [
    'app/page.tsx', 'app/join/JoinForm.tsx',
    'app/trip/[tripCode]/page.tsx', 'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/setup/page.tsx', 'app/trip/[tripCode]/setup/PasscodeGate.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
  ]
  for (const f of pages) {
    const s = read(f)
    ok(!/←\s*(Back|Green Dot)/.test(s), `${f.split('/').pop()} has no bare ← text link`)
  }

  // The bracket's round nav is the same box language
  const bracket = read('app/trip/[tripCode]/matchplay/MatchplayBracket.tsx')
  ok(!bracket.includes('rounded-sm'), 'the bracket round nav is no longer a sharp box')
  ok(bracket.includes('rounded-xl border border-white/15'), 'it matches the rest')
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
