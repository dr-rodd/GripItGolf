/**
 * Style-system tests. Run with: npm run test:branding
 *
 * The style guide is the source of truth and app/globals.css is its code.
 * What is pinned here is the handful of rules that are easy to break by
 * accident and expensive to notice:
 *
 *   · the palette — no pure grey, no gold, no lime, no gradients
 *   · the wordmark is a file, never retyped in a webfont
 *   · three fonts with one job each
 *   · the bottom tab bar, including the label that nearly does not fit
 *   · no glows, no springs, and motion that can be switched off
 *
 * Colour regressions are the ones worth automating: a wrong hex looks fine
 * in a diff and wrong on a phone in sunlight.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'fs'
import Home from '../app/page'
import Wordmark from '../app/components/Wordmark'
import MorphWordmark from '../app/components/MorphWordmark'
import { Badge, LiveDot, EmptyState, buttonClass } from '../app/components/ui'
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

/** Source with comments removed, for assertions about behaviour not prose. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const css = read('app/globals.css')

/** Every source file that makes up the platform UI. */
function uiFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  for (const d of ['app/trip', 'app/components', 'app/join', 'app/dashboard', 'app/admin']) walk(d)
  out.push('app/page.tsx', 'app/layout.tsx')
  return out
}

// ─── Palette ───────────────────────────────────────────────────

section('The palette is defined once, in one place')
{
  for (const [name, hex] of [
    ['cream',   '#F6F4F0'],
    ['surface', '#FFFFFF'],
    ['ink',     '#2B2118'],
    ['bark',    '#4A3728'],
    ['accent',  '#0A9D56'],
    ['rust',    '#B5533C'],
  ] as const) {
    ok(css.includes(`--color-${name}:`), `${name} is a token`)
    ok(css.toUpperCase().includes(hex.toUpperCase()), `${name} is ${hex}`)
  }
}

section('The old identity is gone')
{
  const files = uiFiles()
  const offenders = (re: RegExp) =>
    files.filter(f => re.test(read(f))).map(f => f.replace('app/', ''))

  // Gold was the accent for the whole of the previous design. One stray
  // #C9A84C on a cream page is glaring, and easy to leave behind.
  eq(offenders(/#C9A84C|#d4b35a/i), [], 'no gold anywhere')
  eq(offenders(/#0a1a0e|#0f2418|#1e3d28/i), [], 'no dark-green surfaces anywhere')

  // "Do not use lime/bright green — emerald is the final brand green."
  eq(offenders(/#3BBD30/i), [], 'no lime green')

  // "No gradients anywhere."
  eq(offenders(/bg-gradient|linear-gradient|radial-gradient/), [], 'no gradients')

  // "No pure gray anywhere. Every neutral is derived from #4A3728."
  eq(offenders(/\b(text|bg|border)-(gray|slate|zinc|neutral|stone)-\d/), [],
    'no grey utility classes — every neutral comes from bark')
}

section('Emerald is an accent, not a wash')
{
  // It may fill a button or a champion tile; it must never be a page or a
  // large surface. Those are cream and white.
  const files = uiFiles()
  const washes = files.filter(f =>
    /className="[^"]*min-h-dvh[^"]*bg-accent/.test(read(f)))
  eq(washes, [], 'no full-height emerald background')
}

// ─── The wordmark ──────────────────────────────────────────────

section('The wordmark is a file, not type')
{
  // Two forms of one mark: stacked for entry screens, a single line for the
  // sticky header. Both are files, at fixed paths, so replacing either is a
  // drop-in with no code change.
  ok(fs.existsSync('public/logo.svg'), 'the stacked mark exists')
  ok(fs.existsSync('public/logo-line.svg'), 'and so does the single-line one')

  const stacked = renderToStaticMarkup(React.createElement(Wordmark, { width: 280 }))
  ok(stacked.includes('/logo.svg'), 'the component renders the stacked file by default')
  ok(stacked.includes('alt="green dot golf"'), 'and names it for anyone who cannot see it')

  const line = renderToStaticMarkup(
    React.createElement(Wordmark, { variant: 'line', width: 118 }))
  ok(line.includes('/logo-line.svg'), 'and the line file when asked for it')
  ok(line.includes('alt="green dot."'), 'named too')

  // Where the header names itself, the image must not say it a second time
  const hidden = renderToStaticMarkup(
    React.createElement(Wordmark, { ariaHidden: true, width: 100 }))
  ok(hidden.includes('aria-hidden="true"'), 'it can be hidden when something else names it')
  ok(hidden.includes('alt=""'), 'with an empty alt, not a missing one')

  // "Do not attempt to recreate it in a webfont." Both files are vector
  // outlines of the supplied artwork — no live text, no font dependency.
  for (const f of ['public/logo.svg', 'public/logo-line.svg']) {
    const svg = read(f)
    ok(/#4a3728/i.test(svg), `${f.split('/')[1]} is brown`)
    ok(/#0a9d56/i.test(svg), '  …with an emerald dot')
    ok(!/<text|font-family/i.test(svg), '  …drawn as paths, not set in a typeface')
  }

  // The header sits over cream but the mark has to survive a white surface
  // too, so the line version carries no background of its own. The stacked
  // one keeps the background it was supplied with; it is only shown on cream.
  ok(!/<rect[^>]*fill="#f6f5ef"/i.test(read('public/logo-line.svg')),
    'the line mark has no baked background')

  // Derived from the stacked mark rather than redrawn, so replacing the
  // artwork and re-running the generator keeps the two in step.
  const gen = read('scripts/make-line-logo.ts')
  ok(gen.includes("SRC = 'public/logo.svg'"), 'the line mark is generated from the stacked one')
  ok(read('package.json').includes('logo:line'), 'and there is a command to regenerate it')

  // "Do not recolor it per-page" — no filters, no fill overrides
  const files = uiFiles().filter(f => read(f).includes('Wordmark'))
  for (const f of files) {
    ok(!/Wordmark[^/>]*(?:filter|invert|brightness)/.test(read(f)),
      `${f.split('/').pop()} does not recolour the mark`)
  }
}

// ─── Type ──────────────────────────────────────────────────────

section('Three fonts, one job each')
{
  ok(css.includes("'Clash Display'"), 'Clash Display is the headline face')
  ok(css.includes("'Bespoke Serif'"), 'Bespoke Serif is the body and data face')
  ok(css.includes('--font-archivo'), 'Archivo is the UI face')

  // Fontshare is a third party; a slow or blocked CDN must not change the
  // page's texture, so every family names a fallback of the same kind.
  ok(/--font-display:[^;]*sans-serif/.test(css), 'the headline falls back to a sans')
  ok(/--font-serif:[^;]*serif/.test(css), 'the body falls back to a serif')
  ok(read('app/layout.tsx').includes('api.fontshare.com'), 'and Fontshare is actually loaded')
  ok(read('app/layout.tsx').includes('preconnect'), 'with a preconnect, since it is off-origin')

  // The old faces are gone
  eq(uiFiles().filter(f => /font-playfair|font-caveat|font-crimson/.test(read(f))), [],
    'no trace of the previous typefaces')

  for (const level of ['t-h1', 't-h2', 't-card', 't-body', 't-data', 't-label', 't-cap']) {
    ok(css.includes(`.${level}`), `${level} is in the scale`)
  }

  // Numbers in a table must not jitter as they change
  ok(/\.t-data, \.t-num \{[^}]*tabular-nums/.test(css), 'table numerals are tabular')
}

// ─── The tab bar ───────────────────────────────────────────────

section('The bottom tab bar')
{
  const src = read('app/components/TabBar.tsx')

  eq(
    (src.match(/label: '([^']+)'/g) ?? []).map(s => s.replace(/label: '|'/g, '')),
    ['Home', 'Leaderboard', 'Scoring', 'Settings'],
    'four items, in the order the guide sets',
  )

  ok(src.includes('fixed bottom-0'), 'fixed to the bottom of the viewport')
  ok(src.includes('env(safe-area-inset-bottom)'),
    'clearing the iPhone home indicator, or the bottom row of taps lands on nothing')
  ok(src.includes('bg-surface'), 'on white')
  ok(src.includes('border-t border-bark/12'), 'with a hairline top border')

  // "Labels must fit on one line — test Leaderboard specifically"
  ok(src.includes('whitespace-nowrap'), 'labels never wrap')
  ok(src.includes('fontSize: 10'), 'at 10px, which is what makes Leaderboard fit')
  ok(src.includes('size={20}'), 'with 20px icons')

  ok(src.includes("'text-accent'"), 'the active tab is emerald')
  ok(src.includes('text-bark/60'), 'and an inactive one is bark at 60%')
  ok(src.includes('fontWeight: active ? 600 : 400'), 'with the active label heavier')

  // Every trip screen carries it, so the app is navigable from anywhere
  const carriers = [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/course/page.tsx',
    'app/trip/[tripCode]/teams/page.tsx',
    'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
  ]
  for (const f of carriers) {
    ok(read(f).includes('<TabBar'), `${f.split('/').slice(-2).join('/')} carries the tab bar`)
    ok(read(f).includes('has-tabbar'), '  …and leaves room for it')
  }
  ok(css.includes('.has-tabbar'), 'and the room is a token, not a magic number per page')
}

// ─── The sticky header ─────────────────────────────────────────

section('The mark is the header, and the way back')
{
  const src = read('app/components/TripHeader.tsx')

  ok(src.includes('sticky top-0'), 'it sticks to the top')
  ok(src.includes('HEADER_H = 52'), 'at a known height')
  ok(src.includes('href={`/trip/${tripCode}`}'), 'and tapping it goes to the trip hub')
  ok(src.includes("aria-label=\"Back to the trip\""), 'which is said out loud, since it is only a logo')
  ok(src.includes('<MorphWordmark'), 'the header carries the mark itself')

  // The board's own sticky row has to clear it, or the column headings
  // slide underneath the logo as you scroll.
  const board = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
  ok(board.includes('HEADER_H'), 'the leaderboard offsets its own sticky row by that height')
  ok(!board.includes('sticky top-0 z-10'), 'rather than pinning it to zero')

  // Every trip screen has it, so the way back is in the same place everywhere
  const carriers = [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/course/page.tsx',
    'app/trip/[tripCode]/course/[roundNumber]/page.tsx',
    'app/trip/[tripCode]/teams/page.tsx',
    'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
  ]
  for (const f of carriers) {
    ok(read(f).includes('<TripHeader'), `${f.split('/').slice(-2).join('/')} carries the mark`)
  }
}

section('The morph happens on the hub, and nowhere else')
{
  const src = read('app/components/TripHeader.tsx')
  const hub = read('app/trip/[tripCode]/page.tsx')

  ok(hub.includes('variant="morph"'), 'the hub asks for the morph')
  ok(hub.includes('<HeroWordmarkSpace'), 'and reserves the room the mark travels through')

  // The delicate screens get the settled header and nothing moving
  for (const f of [
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/course/page.tsx',
    'app/trip/[tripCode]/course/[roundNumber]/page.tsx',
  ]) {
    ok(!read(f).includes('variant="morph"'),
      `${f.split('/').slice(-2).join('/')} does not morph — it is read standing on a tee`)
    ok(!read(f).includes('HeroWordmark'), '  …and has no hero mark to morph from')
  }

  // Scroll handlers fire constantly on a phone; this one coalesces
  ok(src.includes('requestAnimationFrame'), 'the scroll listener is frame-coalesced')
  ok(src.includes('{ passive: true }'), 'and passive, so it never blocks a scroll')
  ok(src.includes('removeEventListener'), 'and is torn down')
  ok(src.includes('cancelAnimationFrame'), 'along with any frame still pending')

  // One element the whole way, not two crossfading
  ok(src.includes('scale('), 'the mark contracts towards the header')
  ok(src.includes('translate('), 'and travels towards it')
  eq((src.match(/<MorphWordmark/g) ?? []).length, 1,
    'there is one mark on screen, never two fading past each other')

  // Anyone who asked for less motion gets the end state, not a slow version
  ok(src.includes('prefers-reduced-motion'), 'reduced motion is honoured')
  ok(src.includes('if (query.matches) { setReduced(true); setProgress(1); return }'),
    'by settling immediately rather than animating slower')

  // Both marks read the same number, from one hook. Two copies of this drift
  // apart mid-scroll and the morph comes apart in the middle.
  ok(src.includes('function useScrollProgress'), 'the scroll position is computed once')
  eq((src.match(/requestAnimationFrame/g) ?? []).length, 1, 'with one frame loop, not two')
  eq((src.match(/addEventListener/g) ?? []).length, 1, 'and one listener')
  eq((src.match(/useScrollProgress\(/g) ?? []).length, 3,
    'defined once and used by both the header and the hero mark')
}

section('The words move separately, and never through each other')
{
  const src  = read('app/components/MorphWordmark.tsx')
  const geom = read('app/components/wordmarkMorph.ts')

  // The four groups are the artwork's own, split by word
  for (const id of ['green', 'dot', 'golf', 'mark']) {
    ok(geom.includes(`"id": "${id}"`), `${id} is its own group`)
  }
  ok(geom.includes('GENERATED by scripts/make-line-logo.ts'),
    'and the geometry is generated from the artwork, not typed in')

  // Each word runs on its own window, or it is not a morph but a slide
  ok(src.includes('const TIMING'), 'each word has its own timing')
  for (const id of ['green', 'dot', 'golf', 'mark']) {
    ok(new RegExp(`\\b${id}:\\s*\\{ x:`).test(src), `  …including ${id}`)
  }

  // The defect this exists to prevent: "dot" sits below "green" and ends up
  // to its right, so moving it diagonally drags it straight through the
  // other word. Across first, then up.
  const dotX = src.match(/dot:\s*\{ x: \[([\d.]+), ([\d.]+)\], y: \[([\d.]+), ([\d.]+)\]/)
  ok(dotX !== null, 'dot has a window on each axis')
  if (dotX) {
    const [, , xEnd, yStart] = dotX.map(Number)
    ok(yStart >= xEnd - 0.2,
      'dot clears sideways before it rises, so it never crosses green')
  }

  // Only the word that leaves fades. Anything else dimming mid-move reads as
  // a crossfade, which is the thing this replaced.
  const fading = [...geom.matchAll(/"id": "(\w+)",[\s\S]*?"fades": (true|false)/g)]
    .filter(m => m[2] === 'true').map(m => m[1])
  eq(fading, ['golf'], 'only golf is marked as leaving')

  // Asserted on what it renders, not just on the flag: an earlier version
  // checked the data and missed the component dimming every word.
  const mid = renderToStaticMarkup(
    React.createElement(MorphWordmark, { progress: 0.5, width: 118 }))
  const opacities = [...mid.matchAll(/\sopacity="([\d.]+)"/g)].map(m => Number(m[1]))
  eq(opacities.length, 4, 'all four groups render')
  eq(opacities.filter(o => o < 1).length, 1,
    'and exactly one of them is fading halfway through — the one that leaves')

  // The end state is the line mark, whole and opaque
  const done = renderToStaticMarkup(
    React.createElement(MorphWordmark, { progress: 1, width: 118 }))
  eq([...done.matchAll(/\sopacity="([\d.]+)"/g)].map(m => Number(m[1])).filter(o => o > 0).length, 3,
    'and by the end only the three words that stay are visible')

  ok(src.includes('easeOut'), 'every word decelerates')
  // Checked against the code, not the prose: the comment above easeOut says
  // the word "springier", and an earlier version of this matched that.
  ok(!/cubic-bezier\(/.test(stripComments(src)), 'and none of them springs')
}

// ─── Icons ─────────────────────────────────────────────────────

section('One icon set')
{
  const icons = read('app/components/icons.tsx')
  ok(icons.includes('Tabler'), 'the set is named and credited')
  ok(icons.includes('stroke="currentColor"'), 'icons take their colour from the text')
  ok(icons.includes('fill="none"'), 'and are outline, not solid')
  for (const n of ['IconHome', 'IconTrophy', 'IconClipboardList', 'IconSettings']) {
    ok(icons.includes(`export const ${n}`), `${n} exists for the tab bar`)
  }
}

// ─── Components ────────────────────────────────────────────────

section('Status badges follow the spec')
{
  const win = renderToStaticMarkup(React.createElement(Badge, { tone: 'win', children: 'Won' }))
  const loss = renderToStaticMarkup(React.createElement(Badge, { tone: 'loss', children: 'Lost' }))
  const neutral = renderToStaticMarkup(React.createElement(Badge, { children: 'Thru 11' }))

  ok(win.includes('rounded-full'), 'a badge is a pill')
  // Background at 22%, text a darker shade of the same hue — never black
  ok(win.includes('bg-accent/[0.22]') && win.includes('text-accent-deep'), 'win is emerald on emerald')
  ok(loss.includes('bg-rust/[0.22]') && loss.includes('text-rust-deep'), 'loss is rust on rust')
  ok(neutral.includes('text-bark'), 'and neutral is bark on bark')
  ok(!/text-black|text-ink\b/.test(win), 'no black text on a coloured pill')

  const live = renderToStaticMarkup(React.createElement(Badge, { live: true, children: 'In play' }))
  ok(live.includes('dot-live'), 'a live badge carries the breathing dot')
}

section('One primary action per screen')
{
  ok(buttonClass('primary').includes('bg-accent'), 'the primary action is emerald')
  ok(buttonClass('primary').includes('text-white'), 'with white on it, for contrast')
  ok(!buttonClass('secondary').includes('bg-accent'), 'a secondary action is not')
  ok(buttonClass('secondary').includes('border-bark/25'), 'it is a bordered surface instead')
  ok(buttonClass('primary').includes('min-h-[48px]'), 'and every button is a real touch target')
}

section('Empty states say what to do next')
{
  const html = renderToStaticMarkup(
    React.createElement(EmptyState, {
      message: 'No trips yet.',
      actionLabel: 'Create a trip',
      actionHref: '/dashboard/create',
    })
  )
  ok(html.includes('No trips yet.'), 'one short sentence')
  ok(html.includes('Create a trip'), 'and one clear action')
  ok(html.includes('/dashboard/create'), 'that goes somewhere')
  ok(!html.includes('<svg'), 'with no illustration or icon')
}

// ─── Motion ────────────────────────────────────────────────────

section('Motion is calm, and can be switched off')
{
  // "ease-out everywhere. No bounce, no spring, no elastic easing."
  const files = uiFiles()
  const springs = files.filter(f => /cubic-bezier\([^)]*1\.\d/.test(stripComments(read(f))))
  eq(springs, [], 'no overshoot curves anywhere')

  // "Nothing takes longer than ~400ms"
  const durations = [...css.matchAll(/(\d+)ms/g)].map(m => Number(m[1]))
  ok(durations.length > 0, 'the stylesheet defines durations')
  ok(durations.every(d => d <= 400), `none of them exceeds 400ms (longest ${Math.max(...durations)}ms)`)

  ok(css.includes('.page-enter'), 'pages fade in')
  ok(/\.page-enter \{ animation: gdFade 200ms ease-out/.test(css), 'over 200ms, ease-out')

  // "Live score updates: flash the cell emerald at ~20%, fade over ~400ms.
  //  Do not use a jump/bounce."
  ok(css.includes('.score-flash'), 'a changed score flashes')
  ok(css.includes('rgba(10, 157, 86, 0.20)'), 'emerald at 20%')
  ok(!/gdScoreFlash[\s\S]*?transform/.test(css), 'and does not move — the number is being read')

  // Anyone who asked for less motion gets none of it
  ok(css.includes('prefers-reduced-motion'), 'reduced motion is honoured')
  const reduced = css.slice(css.indexOf('prefers-reduced-motion'))
  for (const c of ['page-enter', 'score-flash', 'dot-live', 'skeleton']) {
    ok(reduced.includes(c), `  …including ${c}`)
  }

  // "Prefer skeleton loading states over spinners"
  ok(css.includes('.skeleton'), 'skeletons exist to be preferred')
}

section('No glows')
{
  // The old design glowed; on cream a glow reads as a smudge, and the guide
  // has none. The dot is solid emerald and that is all.
  const files = uiFiles()
  const glows = files.filter(f => /boxShadow: '0 0 |shadow-\[0_0_/.test(read(f)))
  eq(glows, [], 'nothing glows')

  const dot = renderToStaticMarkup(React.createElement(LiveDot, {}))
  ok(dot.includes('bg-accent'), 'the live dot is solid emerald')
  ok(dot.includes('dot-live'), 'and breathes')
  ok(!dot.includes('shadow'), 'without a glow')
  ok(dot.includes('w-1.5 h-1.5'), 'kept small, so it stays a punctuation mark')
}

// ─── Landing page ──────────────────────────────────────────────

const home = renderToStaticMarkup(React.createElement(Home))

section('Landing page')
{
  ok(home.includes('/logo.svg'), 'the wordmark is the page')
  ok(!home.includes('<h1'), 'and is not restated as a heading beneath itself')

  // "a simple title underneath explaining that the user should tap the nav
  //  buttons to start their trip"
  ok(/tap below/i.test(home), 'one line tells you to tap below')
  ok(home.includes('/dashboard/create'), 'Create a trip is one of the two')
  ok(home.includes('/join'), 'Join a trip is the other')
  ok(/Create a trip/i.test(home) && /Join a trip/i.test(home), 'both are named plainly')

  // One primary action: creating. Joining is secondary.
  // Counted as elements, not substrings: "hover:bg-accent-deep" contains
  // "bg-accent" and would double every button.
  const emeraldFills = [...home.matchAll(/class="([^"]*)"/g)]
    .filter(m => /(?:^| )bg-accent(?![-\w/])/.test(m[1]))
  eq(emeraldFills.length, 1, 'exactly one emerald button on the screen')

  ok(home.includes('bg-cream'), 'on the cream page')
  ok(!home.includes('Schr'), 'the old quotation is gone')
  ok(!home.includes('GripItGolf'), 'and so is the old name')
}

// ─── Everywhere else ───────────────────────────────────────────

section('The old branding is gone')
{
  eq(SITE.name, 'Green Dot Golf', 'the site config still names the app')

  const layout = read('app/layout.tsx')
  ok(layout.includes('green dot.'), 'the browser tab carries the wordmark')
  ok(layout.includes('#F6F4F0'), 'and the theme colour is cream')

  for (const f of ['app/page.tsx', 'app/layout.tsx', 'app/join/JoinForm.tsx']) {
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
