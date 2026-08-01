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
  // The numbers live outside the client component so a server page can read
  // them — see the comment at the top of headerMetrics.ts.
  const metrics = read('app/components/headerMetrics.ts')

  ok(src.includes('sticky top-0'), 'it sticks to the top')
  ok(metrics.includes('HEADER_H = 52'), 'at a known height')
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

section('The morph happens on the landing page, and nowhere else')
{
  const src = read('app/components/TripHeader.tsx')
  const metrics = read('app/components/headerMetrics.ts')
  const landing = read('app/page.tsx')

  // The entry screen is the one place the mark is the point. A trip screen
  // is opened to be read, and the brand performing on the way in delays it.
  ok(landing.includes('variant="morph"'), 'the landing page asks for the morph')
  ok(landing.includes('<HeroPin>'), 'and wraps its content so the page holds still')

  // Every trip screen, the hub included, is settled from the first pixel
  for (const f of [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/course/page.tsx',
    'app/trip/[tripCode]/course/[roundNumber]/page.tsx',
  ]) {
    ok(!read(f).includes('variant="morph"'),
      `${f.split('/').slice(-2).join('/')} does not morph — it is read standing on a tee`)
    ok(!read(f).includes('HeroPin'), '  …and holds nothing still, because nothing moves')
  }

  // Scroll handlers fire constantly on a phone; this one coalesces
  ok(src.includes('requestAnimationFrame'), 'the scroll listener is frame-coalesced')
  ok(src.includes('{ passive: true }'), 'and passive, so it never blocks a scroll')
  ok(src.includes('removeEventListener'), 'and is torn down')
  ok(src.includes('cancelAnimationFrame'), 'along with any frame still pending')

  // One element the whole way, not two crossfading
  eq((src.match(/<MorphWordmark/g) ?? []).length, 1,
    'there is one mark on screen, never two fading past each other')
  ok(src.includes('heroOrigin') && src.includes('lineOrigin'),
    'the header hands it both ends of the journey in screen pixels')
  ok(src.includes('HERO_W') && src.includes('LINE_W'),
    'and the size at each end')
  // The mark itself is positioned, not transformed: a scaling frame is what
  // made "dot" appear to lurch right while the mark as a whole moved left.
  // (HeroPin does use a transform, but that is the page, not the mark.)
  ok(!/<MorphWordmark[\s\S]{0,200}transform/.test(src),
    'the mark is positioned rather than transformed as a block')

  // ── The page holds still while the mark moves ──
  //
  // Two halves, and both are needed. The offset pushes the content back down
  // by exactly the distance scrolled, freezing it. The spacer then closes,
  // but only once the mark has essentially landed.
  ok(src.includes('const offset = TRAVEL * t'),
    'the content is pushed back by exactly the distance scrolled')
  ok(src.includes('HERO_SPACE * (1 - release)'),
    'and the gap the mark leaves closes separately')
  ok(metrics.includes('RELEASE_AT'), 'with the catch-up starting at a named point')

  const releaseAt = Number(metrics.match(/RELEASE_AT = ([\d.]+)/)?.[1] ?? 0)
  ok(releaseAt >= 0.6, 'late enough that the collapse finishes first')
  ok(releaseAt < 1, 'but early enough that the page does catch up')

  // The travel is longer than the space the mark occupies, which is what
  // leaves room for the catch-up to happen at a readable speed rather than
  // being crammed into whatever scroll is left.
  const travelMul = Number(metrics.match(/HERO_SPACE \* ([\d.]+)\)/)?.[1] ?? 0)
  ok(travelMul > 1, 'the sequence runs over more scroll than the mark occupies')

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

  const windows: Record<string, { y: [number, number]; x: [number, number] }> = {}
  for (const m of src.matchAll(
    /(\w+):\s*\{ y: \[([\d.]+), ([\d.]+)\], x: \[([\d.]+), ([\d.]+)\] \}/g)) {
    windows[m[1]] = { y: [+m[2], +m[3]], x: [+m[4], +m[5]] }
  }
  eq(Object.keys(windows).sort(), ['dot', 'golf', 'green', 'mark'],
    'all four are timed')

  // ── Up, then left ──
  // The rule the whole animation rests on. A word moving on both axes at
  // once cuts a diagonal, and the first version of this dragged "dot"
  // straight through the middle of "green" for a third of the travel.
  for (const [id, w] of Object.entries(windows)) {
    if (w.x[0] === w.x[1]) continue        // golf never moves sideways at all
    ok(w.x[0] >= w.y[1] - 0.001, `${id} finishes rising before it starts moving left`)
  }

  eq(windows.golf.y[0], 0, 'golf starts leaving straight away')
  ok(windows.mark.y[0] > windows.dot.y[0], 'and the dot follows the words, not leads them')
  // Last to land, but by a small margin — a long tail here left the end of
  // the scroll doing nothing.
  const finishes = Object.entries(windows).map(([id, w]) => [id, Math.max(w.x[1], w.y[1])] as const)
  const last = finishes.reduce((a, b) => (b[1] > a[1] ? b : a))
  eq(last[0], 'mark', 'landing last of all')

  // And the whole sequence is over well before the scroll is, so the tail
  // is the page catching up rather than an empty wait.
  ok(last[1] <= 0.85, 'with the sequence finished before the scroll ends')

  // ── Nothing moves right ──
  // Checked against the geometry rather than asserted in prose. The mark
  // shrinks towards its left edge, so every word's final screen position is
  // left of where it started — which is the whole reason each word is placed
  // in screen space instead of nudged about inside a scaling frame.
  {
    const box = (name: string) =>
      JSON.parse(geom.match(new RegExp(`${name} = (\\[[^\\]]+\\])`))![1]) as number[]
    const stackedBox = box('STACKED_BOX'), lineBox = box('LINE_BOX')
    const heroW = 210, lineW = 118, rowW = 390
    const heroUnit = heroW / stackedBox[2], lineUnit = lineW / lineBox[2]
    const heroX = (rowW - heroW) / 2, lineX = 6

    const words = [...geom.matchAll(
      /"id": "(\w+)",[\s\S]*?"stacked": \[\s*([-\d.]+),[\s\S]*?"line": \[\s*([-\d.]+),/g)]
    eq(words.length, 4, 'all four words have positions in both layouts')

    for (const [, id, sx, lx] of words) {
      const from = heroX + (Number(sx) - stackedBox[0]) * heroUnit
      const to   = lineX + (Number(lx) - lineBox[0])    * lineUnit
      ok(to <= from + 0.5, `${id} ends left of where it started`)
    }
  }

  // ── No two words ever overlap ──
  //
  // The property itself, sampled across the whole travel, rather than a
  // rule of thumb about timings that stands in for it. This is the check
  // that would have caught the first version directly: it dragged "dot"
  // through the middle of "green" for about a third of the scroll.
  {
    const box = (name: string) =>
      JSON.parse(geom.match(new RegExp(`${name} = (\\[[^\\]]+\\])`))![1]) as number[]
    const stackedBox = box('STACKED_BOX'), lineBox = box('LINE_BOX')
    const words = [...geom.matchAll(
      /"id": "(\w+)",\s*"fades": (true|false),\s*"box": \[\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)[\s\S]*?"stacked": \[\s*([-\d.]+),\s*([-\d.]+)[\s\S]*?"line": \[\s*([-\d.]+),\s*([-\d.]+)/g)]
      .map(m => ({
        id: m[1], fades: m[2] === 'true',
        w: +m[5], h: +m[6],
        sx: +m[7], sy: +m[8], lx: +m[9], ly: +m[10],
      }))
    eq(words.length, 4, 'every word has a box in both layouts')

    const heroW = 210, lineW = 118, rowW = 390, heroTop = 96
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    const rampAt = ([a, b]: [number, number], p: number) =>
      b <= a ? (p >= b ? 1 : 0) : p <= a ? 0 : p >= b ? 1 : ease((p - a) / (b - a))
    const mix = (a: number, b: number, t: number) => a + (b - a) * t

    // Defensive: if the fade is ever removed this must read as a failure,
    // not throw on a null match and take the whole run with it.
    const fadeMatch = src.match(/1 - ty \* ([\d.]+)/)
    ok(fadeMatch !== null, 'the leaving word fades on its way out')
    const fadeK = fadeMatch ? Number(fadeMatch[1]) : 0

    const rectsAt = (p: number) => {
      return words.map(w => {
        const ty = rampAt(windows[w.id].y as [number, number], p)
        const tx = rampAt(windows[w.id].x as [number, number], p)
        // Each word shrinks on its own rise, so the scale is per word too
        const unit = mix(heroW / stackedBox[2], lineW / lineBox[2], ty)
        return {
          id: w.id,
          opacity: w.fades ? Math.max(0, 1 - ty * fadeK) : 1,
          x: mix((rowW - heroW) / 2 + (w.sx - stackedBox[0]) * unit,
                 0 + (w.lx - lineBox[0]) * unit, tx),
          y: mix(heroTop + (w.sy - stackedBox[1]) * unit,
                 14 + (w.ly - lineBox[1]) * unit, ty),
          w: w.w * unit, h: w.h * unit,
        }
      }).filter(r => r.opacity > 0.15)
    }

    type R = { id: string; x: number; y: number; w: number; h: number }
    const overlap = (A: R, B: R) => {
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x)
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
      return ox > 0 && oy > 0 ? ox * oy : 0
    }
    const pairKey = (a: string, b: string) => [a, b].sort().join('/')

    // The two layouts are the designer's, and in the stacked one the lines
    // are set tightly enough that the ink boxes already touch. That is
    // kerning, not collision — so what is measured is only the overlap the
    // animation *introduces* on top of whichever end state overlaps more.
    const resting = new Map<string, number>()
    for (const p of [0, 1]) {
      const rects = rectsAt(p)
      for (let a = 0; a < rects.length; a++) {
        for (let b = a + 1; b < rects.length; b++) {
          const k = pairKey(rects[a].id, rects[b].id)
          resting.set(k, Math.max(resting.get(k) ?? 0, overlap(rects[a], rects[b])))
        }
      }
    }

    let worst: string | null = null
    for (let i = 0; i <= 80 && !worst; i++) {
      const p = i / 80
      const rects = rectsAt(p)
      for (let a = 0; a < rects.length; a++) {
        for (let b = a + 1; b < rects.length; b++) {
          const A = rects[a], B = rects[b]
          const area = overlap(A, B)
          const allowed = (resting.get(pairKey(A.id, B.id)) ?? 0) + 300
          if (area > allowed) {
            worst = `${A.id} and ${B.id} collide at progress ${p.toFixed(2)}: ` +
                    `${area.toFixed(0)}px² against ${allowed.toFixed(0)} allowed`
            break
          }
        }
      }
    }
    eq(worst, null, 'and the animation never puts one word across another')
  }

  // ── The component actually applies the per-word timing ──
  //
  // Everything above reads the timing table out of the source and reasons
  // about it. That leaves a hole: the component could ignore the table and
  // move every word together. So this drives the real thing and checks that
  // at a moment when green has moved, dot has not.
  {
    // Representative geometry: a phone-width row, the mark at its two sizes.
    // The landing inset is read from the header rather than assumed, so this
    // tracks the real value instead of quietly passing against a stand-in.
    const inset = Number(
      read('app/components/headerMetrics.ts').match(/LINE_INSET = ([\d.]+)/)?.[1] ?? -1)
    ok(inset >= 4, 'the mark lands with a margin from the edge, not flush against it')
    const MARK = {
      heroWidth: 210, lineWidth: 118,
      heroOrigin: [90, 96] as [number, number],
      lineOrigin: [inset, 14] as [number, number],
    }
    const tops = (progress: number) => {
      const html = renderToStaticMarkup(
        React.createElement(MorphWordmark, { progress, ...MARK }))
      const found: Record<string, number> = {}
      const order = ['green', 'dot', 'golf', 'mark']
      const matches = [...html.matchAll(/top:\s*([-\d.]+)px/g)]
      matches.forEach((m, i) => { if (order[i]) found[order[i]] = Number(m[1]) })
      return found
    }

    // Sampled where green is well into its rise and dot has not begun.
    // Those points move whenever the timings are compressed, so they are
    // derived from the table rather than written in by hand.
    const rest  = tops(0)
    const early = tops(windows.dot.y[0] - 0.04)
    const late  = tops(windows.dot.y[1])

    // The whole mark is shrinking throughout, so every word drifts a little
    // even before its own window opens. What matters is that green is doing
    // far more than that while dot is doing only that.
    const greenEarly = Math.abs(early.green - rest.green)
    const dotEarly   = Math.abs(early.dot - rest.dot)
    ok(greenEarly > 40, 'green has risen properly a fifth of the way through')
    ok(dotEarly < greenEarly / 3,
      'while dot has barely stirred — they are not on one clock')
    ok(Math.abs(late.dot - rest.dot) > 40, 'and dot makes its own move later')

    // ── Nothing drifts before its turn ──
    //
    // The defect this replaced: one shrink for the whole mark meant a word's
    // resting position was measured from an edge that was itself moving, so
    // words slid left before they had started. Tying the scale to each word's
    // own rise means an unmoved word is exactly where it was.
    const lefts = (progress: number) => {
      const html = renderToStaticMarkup(
        React.createElement(MorphWordmark, { progress, ...MARK }))
      const order = ['green', 'dot', 'golf', 'mark']
      const found: Record<string, number> = {}
      const ms = [...html.matchAll(/left:\s*([-\d.]+)px/g)]
      ms.forEach((m, i) => { if (order[i]) found[order[i]] = Number(m[1]) })
      return found
    }
    const atRest = lefts(0)
    const early2 = lefts(Math.min(windows.dot.y[0], windows.mark.y[0]) - 0.02)
    eq(+(early2.dot - atRest.dot).toFixed(2), 0,
      'dot has not moved sideways at all before its turn')
    eq(+(early2.mark - atRest.mark).toFixed(2), 0,
      'and neither has the emerald dot')

    // ── It does not land flush against the edge ──
    const landed = lefts(1)
    ok(landed.green > 2, 'the mark keeps a margin from the left edge when it lands')

    // golf leaves downwards, away from everything else
    ok(tops(0.3).golf > rest.golf + 40, 'golf drops away from the others')

    // And it is gone early. What it does after that does not matter — it is
    // invisible — so the assertion is about the fade, not the drift.
    const opacityOf = (progress: number, index: number) => {
      const html = renderToStaticMarkup(
        React.createElement(MorphWordmark, { progress, ...MARK }))
      return [...html.matchAll(/opacity:\s*([\d.]+)/g)].map(m => Number(m[1]))[index]
    }
    ok(opacityOf(0, 2) === 1, 'golf is fully there to begin with')
    ok(opacityOf(0.25, 2) === 0, 'and completely gone a quarter of the way through')
  }

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

// ─── The header's numbers cross the client boundary ────────────

section('Header metrics are readable from a server component')
{
  // The landing page is a server component and sizes itself from TRAVEL. A
  // value exported from a 'use client' module arrives there as a client
  // reference rather than as the number, and dropping one into a template
  // literal writes a stub function into the markup. TypeScript sees a number
  // the whole way and the build says nothing — the only symptom is a style
  // attribute full of nonsense in the rendered page.
  const metrics = read('app/components/headerMetrics.ts')
  // Checked as the directive, not as a mention: the file's own comment
  // explains the trap and names it.
  ok(!/^\s*['"]use client['"]/.test(metrics), 'the metrics module is not client-only')

  for (const name of ['HEADER_H', 'HERO_SPACE', 'TRAVEL', 'RELEASE_AT', 'LINE_INSET']) {
    ok(new RegExp(`export const ${name}\\b`).test(metrics), `${name} is exported from it`)
  }

  // …and nothing re-exports them from the client component, which would put
  // the same trap back with a different import path
  const header = read('app/components/TripHeader.tsx')
  for (const name of ['HEADER_H', 'HERO_SPACE', 'TRAVEL']) {
    ok(!new RegExp(`export const ${name}\\b`).test(header),
      `TripHeader does not re-export ${name}`)
  }

  // The server pages that need a number take it from the right place
  ok(read('app/page.tsx').includes("from \"@/app/components/headerMetrics\""),
    'the landing page reads TRAVEL from the metrics module')
}

// ─── The page's name as artwork ────────────────────────────────

section('A page can name itself in the header')
{
  const src = read('app/components/TitleMark.tsx')
  const header = read('app/components/TripHeader.tsx')

  // Every mark is a file, exactly like the wordmark — never retyped in a
  // webfont, so replacing one needs no code change
  for (const name of ['leaderboard', 'settings', 'scoring', 'trip']) {
    ok(src.includes(`/title-${name}.png`), `${name}. is a file`)
    ok(fs.existsSync(`public/title-${name}.png`), `  …and the file is there`)
  }
  ok(src.includes('<img'), 'rendered as an image, not as type')

  // Same place, same height as the mark it stands in for. The header sizes
  // by height and lets each word's own width follow.
  ok(header.includes('<TitleMark name={title} height={lineH} />'),
    'set to the height the line mark settles at')
  ok(header.includes('style={{ left: lineOrigin[0], top: lineOrigin[1] }}'),
    'and to the place it settles in')

  // A word has no stacked form to collapse out of
  ok(header.includes("variant === 'morph' && title === 'green-dot'"),
    'a named page never morphs')

  // Which page wears which
  const wears: [string, string][] = [
    ['app/trip/[tripCode]/leaderboard/page.tsx', 'leaderboard'],
    ['app/trip/[tripCode]/course/page.tsx', 'scoring'],
    ['app/trip/[tripCode]/course/[roundNumber]/page.tsx', 'scoring'],
    ['app/trip/[tripCode]/setup/TripSetupClient.tsx', 'settings'],
  ]
  for (const [file, name] of wears) {
    ok(read(file).includes(`title="${name}"`),
      `${file.split('/').slice(-2).join('/')} wears ${name}.`)
  }

  // The hub keeps the mark — "trip." is drawn but not in use yet
  ok(!read('app/trip/[tripCode]/page.tsx').includes('title="trip"'),
    'the trip hub still shows the green dot, not its own name')

  // The old text heading is gone from settings, or the page says it twice
  ok(!read('app/trip/[tripCode]/setup/TripSetupClient.tsx').includes('>Trip Setup<'),
    'and settings does not also spell its name out in type')
}

// ─── Landing page ──────────────────────────────────────────────

const home = renderToStaticMarkup(React.createElement(Home))

section('Landing page')
{
  // The mark is the header's now, and it is drawn from the artwork's own
  // paths rather than loaded as a file, so it is the ink that is checked.
  ok(home.includes('<svg'), 'the wordmark is the page')
  ok(/#4a3728/i.test(home), '  …in the artwork\'s own brown')
  ok(/#0a9d56/i.test(home), '  …closed by the emerald dot')
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
