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
import { isStaleBuildError, shouldReload, RELOAD_GAP_MS } from '../lib/staleBuild'
import Home from '../app/page'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import Wordmark from '../app/components/Wordmark'
import MorphWordmark from '../app/components/MorphWordmark'
import {
  Pill, LiveDot, EmptyState, buttonClass, cardClass, chipClass, iconButtonClass,
  Field, FIELD, Segmented, ListGroup, ListRow, IconButton, SectionHeader, optionClass,
} from '../app/components/ui'
import { SITE } from '../config/site'
import WizardShell, { STEP_SLIDE_MS } from '../app/components/WizardShell'
import CountUp from '../app/components/CountUp'

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
  for (const d of ['app/trip', 'app/components', 'app/join', 'app/dashboard', 'app/admin', 'app/golf', 'app/create', 'app/run', 'app/privacy', 'app/terms', 'app/enter']) walk(d)
  out.push('app/page.tsx', 'app/layout.tsx', 'app/Landing.tsx', 'app/[code]/page.tsx')
  // The scoring screens a trip actually uses (refresh plan, Phase 6). The
  // legacy portal beside them — ScoringClient, CoursePortalClient and the
  // /scoring page — is Donegal Masters' and on no trip (copy-review.md,
  // Appendix), so it stays outside the floor.
  walk('app/scoring/[slug]')
  out.push('app/scoring/LiveScoringFlow.tsx', 'app/scoring/LiveLeaderboardPanel.tsx', 'app/scoring/CardCheck.tsx')
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

section('A page left open across a deploy reloads onto the new version')
{
  // lib/staleBuild.ts — Ross saw the bare "Application error" after a push
  // with a tab already open; a refresh cured it, so the site refreshes itself.
  for (const msg of [
    'ChunkLoadError: Loading chunk 123 failed.',
    'Failed to fetch dynamically imported module: https://greendot.live/_next/static/chunks/x.js',
    'Importing a module script failed.',
    'Loading CSS chunk 9 failed',
  ]) ok(isStaleBuildError(new Error(msg)), `a missing file from an older version is recognised: ${msg.slice(0, 40)}`)
  ok(isStaleBuildError({ name: 'ChunkLoadError', message: '' }), '  …by its name too')
  ok(!isStaleBuildError(new Error("Cannot read properties of undefined (reading 'id')")), 'an ordinary fault is not mistaken for one — that gets the calm message')
  ok(!isStaleBuildError(null), '  …and nothing is nothing')
  ok(shouldReload(null, 1000) && !shouldReload(1000, 1000 + RELOAD_GAP_MS - 1) && shouldReload(1000, 1000 + RELOAD_GAP_MS),
    'one reload a minute at most, so a failure a reload cannot cure never loops')
  const layout = read('app/layout.tsx')
  ok(layout.includes('<StaleBuildGuard />'), 'every page listens for it')
  ok(fs.existsSync('app/error.tsx') && fs.existsSync('app/global-error.tsx'), 'and the error pages are the site\'s own, never the bare Next one')
  ok(read('app/components/ErrorScreen.tsx').includes('if (reloading) reloadForNewVersion()'), '  …which reload for a stale version first')
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

  // That rule only ever scanned the components, never the stylesheet — so it
  // would not have caught one written straight into globals.css. It does now,
  // with exactly one exception, named here rather than left as a loophole.
  //
  // `.scroll-shade` is the leaderboard's right-hand scroll shadow. The
  // guide's ban is on gradients as decoration — the old design's gold washes
  // — and a shade marking columns you can scroll to is not decoration; it is
  // the scrollbar the design deliberately hides, put back in a form that
  // suits a stack of a dozen rows. Nothing else in the stylesheet may have
  // one.
  {
    const rules = css.split('}').filter(r => /linear-gradient|radial-gradient/.test(r))
    const strays = rules.filter(r => !r.includes('.scroll-shade')).map(r => r.trim().split('{')[0].trim())
    eq(strays, [], 'the stylesheet has no gradient but the scroll shade')

    // One per pinned column. Read by exact rule name, not by prefix: the two
    // differ only in which way they fade, and a `split('.scroll-shade')`
    // lands on whichever comes first and quietly checks it twice.
    const rule = (name: string) =>
      css.split(new RegExp(`\\.${name}\\s*\\{`))[1]?.split('}')[0] ?? ''
    const left  = rule('scroll-shade-l')
    const right = rule('scroll-shade-r')
    ok(left !== '' && right !== '', 'both pinned columns have a shade')

    // Each falls away from the column casting it. Get these the wrong way
    // round and the shadow lands on the far side of the thing making it,
    // over the name rather than over what the name is hiding — which looks
    // deliberate enough to survive a glance.
    ok(/linear-gradient\(\s*to right/.test(left),
      'the left column\'s shade falls to its right, over what it hides')
    ok(/linear-gradient\(\s*to left/.test(right), 'and the right column\'s to its left')

    // Flat top to bottom, so the rows join into one band. It was radial
    // once — the right shape for a shadow cast by a single box, and the
    // wrong one here, where it is drawn per row and peaked at each row's own
    // middle. Twelve rows of that is a string of ovals with a pinch at every
    // boundary, not an edge.
    for (const [name, shade] of [['left', left], ['right', right]] as const) {
      ok(!shade.includes('radial-gradient'),
        `the ${name} shade is flat top to bottom, so the rows join into one band`)

      // Subtle enough to be depth rather than a mark on the screen, and the
      // same on both sides — one heavier than the other reads as a lit room
      // rather than as an edge.
      const alpha = Number(shade.match(/rgba\(74,\s*55,\s*40,\s*([\d.]+)\)/)?.[1] ?? 1)
      ok(alpha > 0, `  …is actually painted`)
      ok(alpha <= 0.12, `  …and stays under 12% bark (${alpha})`)
    }
    eq(left.match(/rgba\([^)]*\)/)?.[0], right.match(/rgba\([^)]*\)/)?.[0],
      'and the two ends are shaded to exactly the same strength')

    // The board is one horizontal scroller, which puts an expanded row's
    // tiles inside it. This is what sizes them to what you can see rather
    // than to the width of every column — and the container type is what
    // makes the unit mean the scroller rather than the viewport, so the two
    // rules only work as a pair.
    ok(/\.board-scroll\s*\{[^}]*container-type:\s*inline-size/.test(css),
      'the board scroller is a query container')
    ok(/\.board-wide\s*\{[^}]*width:\s*100cqw/.test(css),
      'and an expanded row is sized to it rather than to all the columns')
  }

  // "No pure gray anywhere. Every neutral is derived from #4A3728."
  //
  // The one exception the guide itself names: a tee swatch keeps the tee's
  // real colour, because a blue tee is blue — they are data, not brand, and
  // Slate and Granite are tees. Exempted by file, not by pattern, so a grey
  // creeping into anything else is still caught.
  const TEE_SWATCHES = 'components/scorecardStyle.ts'
  eq(offenders(/\b(text|bg|border)-(gray|slate|zinc|neutral|stone)-\d/)
       .filter(f => f !== TEE_SWATCHES), [],
    'no grey utility classes — every neutral comes from bark')

  // …and that exemption only covers the swatch map itself
  const swatches = read(`app/${TEE_SWATCHES}`)
  ok(/TEE_DOT/.test(swatches),
    'the exempted file is the tee swatch map, and nothing else uses those greys')
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
  const layout = read('app/layout.tsx')

  // Schibsted Grotesk replaced Clash Display in October 2026
  // (docs/refresh-plan.md, D4), in the same deploy that made the title face
  // render at all — so Clash Display never once appeared on the live site.
  // Titles are 700 everywhere: heavier turns shouty, lighter goes soft in
  // sunlight, and the one weight loaded makes that the rule.
  ok(/import \{[^}]*\bSchibsted_Grotesk\b[^}]*\} from "next\/font\/google"/.test(layout),
    'Schibsted Grotesk is the headline face, self-hosted through next/font')
  ok(/--font-display:\s*var\(--font-schibsted\)/.test(css), '  …and leads the display stack')
  ok(/Schibsted_Grotesk\(\{[^}]*weight: "700"/.test(layout), '  …at 700, the one weight a title uses')
  for (const level of ['t-h1', 't-h2', 't-card']) {
    ok(new RegExp(`\\.${level}\\s*\\{[^}]*font-weight: 700`).test(css), `  ${level} is set at 700`)
  }
  ok(!/clash/i.test(stripComments(css) + stripComments(layout)),
    'Clash Display is gone, from the stacks and from the CDN request')
  ok(css.includes("'Bespoke Serif'"), 'Bespoke Serif is the data face')
  ok(css.includes('--font-archivo'), 'Archivo is the UI and body face')
  ok(/\nbody \{[^}]*font-family: var\(--font-ui\)/.test(stripComments(css)),
    'the body is sans — the serif is asked for by name, never inherited')

  // Fontshare is a third party; a slow or blocked CDN must not change the
  // page's texture, so every family names a fallback of the same kind.
  ok(/--font-display:[^;]*sans-serif/.test(css), 'the headline falls back to a sans')
  ok(/--font-serif:[^;]*serif/.test(css), 'the body falls back to a serif')
  // Bespoke Serif is the one face still on Fontshare, until it is
  // self-hosted too (refresh plan, Phase 2) — then these two pins flip.
  ok(layout.includes('api.fontshare.com'), 'and Fontshare is actually loaded, for Bespoke Serif')
  ok(layout.includes('preconnect'), 'with a preconnect, since it is off-origin')

  // The old faces are gone
  eq(uiFiles().filter(f => /font-playfair|font-caveat|font-crimson/.test(read(f))), [],
    'no trace of the previous typefaces')

  for (const level of ['t-h1', 't-h2', 't-card', 't-body', 't-data', 't-label', 't-cap', 't-eyebrow']) {
    ok(css.includes(`.${level}`), `${level} is in the scale`)
  }
  // Which family each step is: titles Schibsted, data the serif, every
  // other word Archivo.
  const family = (level: string) =>
    css.match(new RegExp(`\\.${level}\\s*\\{[^}]*font-family:\\s*var\\((--font-[\\w-]+)\\)`))?.[1]
  for (const level of ['t-h1', 't-h2', 't-card']) eq(family(level), '--font-display', `${level} is a title`)
  for (const level of ['t-body', 't-label', 't-cap', 't-eyebrow']) eq(family(level), '--font-ui', `${level} is Archivo`)
  eq(family('t-data'), '--font-serif', 't-data is the serif')

  // Numbers in a table must not jitter as they change
  ok(/\.t-data, \.t-num \{[^}]*tabular-nums/.test(css), 'table numerals are tabular')
}

section('The fonts resolve, not just appear in the stylesheet')
{
  // For the whole of the site's life until October 2026, only the serif
  // ever rendered. layout.tsx put the next/font variable class on <body>,
  // while the stacks that use it (--font-ui, --font-display) are declared on
  // :root. A custom property works out its var() where it is declared, and
  // at :root --font-archivo did not exist yet — so both stacks came out
  // invalid, were inherited that way, and every title, label, button and
  // tab fell back to Bespoke Serif. The section above only asked whether the
  // stylesheet named the fonts, which it always did. This one asks whether
  // each name can reach the element it is used on.
  const layout = stripComments(read('app/layout.tsx'))

  // Every next/font loader the layout imports, google and local alike…
  const loaders = new Set<string>()
  for (const m of layout.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']next\/font\/google["']/g)) {
    for (const n of m[1].split(',')) if (n.trim()) loaders.add(n.trim())
  }
  for (const m of layout.matchAll(/import\s+(\w+)\s+from\s*["']next\/font\/local["']/g)) loaders.add(m[1])

  // …and every font it makes with one: `const x = Loader({ … variable: "--font-y" … })`
  const fonts: { name: string; variable: string }[] = []
  for (const m of layout.matchAll(/const\s+(\w+)\s*=\s*(\w+)\(\{([\s\S]*?)\}\)/g)) {
    if (!loaders.has(m[2])) continue
    const v = m[3].match(/variable:\s*["'](--font-[\w-]+)["']/)?.[1]
    if (v) fonts.push({ name: m[1], variable: v })
  }
  ok(fonts.length >= 2,
    `the layout loads its fonts through next/font (${fonts.map(f => f.variable).join(', ')})`)

  const tag = (t: string) => layout.match(new RegExp(`<${t}\\b[^>]*>`))?.[0] ?? ''
  const html = tag('html'), body = tag('body')
  for (const f of fonts) {
    ok(html.includes(`${f.name}.variable`), `${f.variable} is set on <html>`)
    ok(!body.includes(`${f.name}.variable`),
      '  …and not on <body>, where the stacks declared on :root cannot see it')
  }

  // Every font stack refers only to variables that exist where it is
  // declared: one set on <html> by next/font, or another stack on :root.
  // A typo'd name fails here too, rather than falling back in silence.
  const code = stripComments(css)
  const onRoot = new Set([...code.matchAll(/(--font-[\w-]+):/g)].map(m => m[1]))
  const onHtml = new Set(fonts.map(f => f.variable))
  let refs = 0
  for (const m of code.matchAll(/(--font-[\w-]+):\s*([^;]+);/g)) {
    for (const r of m[2].matchAll(/var\((--font-[\w-]+)/g)) {
      refs++
      ok(onHtml.has(r[1]) || onRoot.has(r[1]), `${m[1]} refers to ${r[1]}, which it can see`)
    }
  }
  ok(refs >= 2, 'and the display and UI stacks both do refer to a next/font variable')
}

section('Names and numbers on a board ask for the serif by name')
{
  // Until October 2026 every board was in Bespoke Serif by inheritance —
  // the body was the serif, and the display face its names asked for never
  // resolved. The body is sans now, so each place where the serif is the
  // point names it. A board losing it would quietly turn sans; these pins
  // are where that would show first. The before/after was checked element
  // by element against the pre-refresh build: no name or number moved.
  const has = (f: string, re: RegExp, label: string) => ok(re.test(read(f)), label)
  const LB = 'app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx'
  has(LB, /className=\{`font-serif flex items-center \$\{GAP\}/, 'the trip leaderboard: each row')
  ok(!/textClassName="font-\[family-name:var\(--font-display\)\]/.test(read(LB)),
    '  …and its names inherit it rather than asking for the title face')
  has(LB, /font-serif text-xl font-bold tabular-nums/, '  …and a round tile\'s score')
  has('app/scoring/LiveLeaderboardPanel.tsx', /className=\{`font-serif w-full flex items-center/,
    'the in-play board inside the scoring card')
  has('app/components/ScoreShape.tsx', /font-\[family-name:var\(--font-serif\)\]/, 'the score shapes')
  has('app/components/scorecardStyle.ts', /SC_SF = \{ fontFamily: 'var\(--font-serif\)' \}/, 'the scorecards')
  const RUN = 'app/run/[tripCode]/leaderboard/RunBoardClient.tsx'
  has(RUN, /const ROW = 'font-serif /, 'the run leaderboard')
  ok(!/const (NAME|SCORE) = 'font-\[family-name:var\(--font-display\)\]/.test(read(RUN)),
    '  …whose names and scores inherit it')
  has('app/run/[tripCode]/page.tsx', /className="font-serif flex items-center gap-3"/, 'the run hub\'s standings')
  has('app/trip/[tripCode]/StatusBlock.tsx', /className="font-serif font-bold text-\[30px\][^"]*">\s*\{player\.placing/,
    'the hub\'s standing')
  has('app/trip/[tripCode]/round/[roundNumber]/page.tsx', /className=\{`font-serif flex items-center gap-3 px-4 py-3/,
    'a round\'s podium')
  has('app/trip/[tripCode]/StatsPanel.tsx', /font-serif text-3xl t-num/, 'the hub\'s stats headline')
  has('app/trip/[tripCode]/stats/StatsClient.tsx', /<tbody className="font-serif">/, 'the stats tables')
  ok((read('app/trip/[tripCode]/stats/charts.tsx').match(/h-auto font-serif/g) ?? []).length === 3,
    '  …and all three charts')

  // `font-serif` is a Tailwind utility, in a layer; the t-* scale classes
  // are not, so they win whatever the order. A place number cannot be
  // `t-cap font-serif` — it takes t-cap's size and the serif instead.
  for (const f of [LB, RUN, 'app/scoring/LiveLeaderboardPanel.tsx']) {
    ok(!/font-serif[^"`]*\bt-(cap|label|card|body)\b|\bt-(cap|label|card|body)\b[^"`]*font-serif/.test(read(f)),
      `${f.split('/').pop()} never pairs the serif with a t-* class that would overrule it`)
  }
}

section('Depth, texture and the named mixes are tokens')
{
  // Named once, so nobody retypes an opacity: line, line-strong, tint, the
  // disabled pair and accent-tint. Each a var() like the palette, for the
  // same reason — a literal is folded at build time and cannot follow the
  // theme.
  for (const name of ['line', 'line-strong', 'tint', 'disabled-bg', 'disabled-fg', 'accent-tint']) {
    ok(new RegExp(`--color-${name}:\\s*var\\(--gd-${name}\\)`).test(css), `${name} is a token`)
    ok(new RegExp(`--gd-${name}:\\s*color-mix\\(in srgb, var\\(--gd-(bark|ink|accent)\\)`).test(css),
      `  …mixed from the palette, so it follows the theme`)
  }

  // Elevation: four named levels, each with a night value
  const dark = css.slice(css.indexOf('html.dark {'), css.indexOf('}', css.indexOf('html.dark {')))
  for (const level of ['raised', 'floating', 'cta']) {
    ok(new RegExp(`--shadow-${level}:\\s*var\\(--gd-shadow-${level}\\)`).test(css), `shadow-${level} is a token`)
    ok(dark.includes(`--gd-shadow-${level}:`), `  …with its own night value`)
  }
  ok(/--gd-shadow-raised:[^;]*rgba\(74, 55, 40/.test(css), 'shadows on cream are warm bark, never black')

  // Bigger things rounder
  const r = (n: string) => Number(css.match(new RegExp(`--radius-${n}:\\s*(\\d+)px`))?.[1] ?? 0)
  eq([r('card'), r('button'), r('field'), r('tile'), r('sheet')], [20, 16, 14, 12, 24],
    'radius: card 20, button 16, field 14, tile 12, sheet 24')

  // The grain: paper, not cards, never fixed, never printed
  const code = stripComments(css)
  ok(/\nbody \{[^}]*background-image: var\(--gd-grain\)/.test(code), 'the page has its grain')
  ok(/--gd-grain: url\("data:image\/svg\+xml,[^"]*feTurbulence[^"]*fractalNoise/.test(css),
    '  …fractal noise, a texture and not a gradient')
  ok(dark.includes('--gd-grain:'), '  …in tan at night')
  // Faint. At twice today's strength it read as fake paper laid over the
  // app. The alpha row of the colour matrix is slope·R + offset; noise R
  // tops out near 0.8, so a speck's alpha peaks at about 0.8·slope + offset.
  const alphaRows = [...css.matchAll(/feColorMatrix values='(?:[\d.-]+ ){15}([\d.]+) 0 0 0 (-?[\d.]+)'/g)]
    .map(m => 0.8 * Number(m[1]) + Number(m[2]))
  eq(alphaRows.length, 2, '  …one grain by day, one by night')
  ok(alphaRows.length === 2 && alphaRows[0] <= 0.1 && alphaRows[1] <= 0.06,
    `  …a hint of tooth, not an imitation: specks peak at ${alphaRows.map(a => Math.round(a * 100) + '%').join(' and ')}`)
  ok(!/background-attachment:\s*fixed/.test(code), '  …never fixed, which repaints on every iPhone scroll')
  ok(/@media print \{[\s\S]*body \{ background-image: none; \}/.test(code), '  …and never on paper')
  // The body, and `paper` — the same surface for whatever stands in for
  // the page and would otherwise paint flat cream over the grain: a
  // screen's wrapper, a sticky bar, a sheet. Nothing else names the grain.
  eq((code.match(/var\(--gd-grain\)/g) ?? []).length, 2, '  …named by the body and by paper, nothing else')
  ok(/@utility paper \{[^}]*background-color: var\(--color-cream\);[^}]*background-image: var\(--gd-grain\)/.test(code),
    '  …paper is cream with the grain')
  const pages = uiFiles().filter(f => /className="[^"]*min-h-dvh[^"]*"/.test(read(f)))
  eq(pages.filter(f => /className="[^"]*\bmin-h-dvh\b[^"]*(?<![\w/-])bg-cream(?![\w/-])[^"]*"|className="[^"]*(?<![\w/-])bg-cream(?![\w/-])[^"]*\bmin-h-dvh\b[^"]*"/.test(read(f))), [],
    '  …and a full-height screen is paper, never flat cream that hides it')
  // A card is never paper. (Fields and insets inside one keep a flat bg-cream.)
  eq(uiFiles().filter(f => /className="[^"]*\bbg-surface\b[^"]*\bpaper\b|className="[^"]*\bpaper\b[^"]*\bbg-surface\b/.test(read(f))), [],
    '  …and nothing is both a card and paper')
}

// ─── Readability ───────────────────────────────────────────────
//
// The two things that actually stop this being legible on a phone in
// daylight: type that is too small, and type that is too pale. Both are
// arithmetic, so both are checked rather than eyeballed.

/** WCAG relative luminance. */
function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast between two colours, brighter over darker. */
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const INK   = [0x2B, 0x21, 0x18]
const CREAM = [0xF6, 0xF4, 0xF0]
/** Ink at an opacity, composited over the page. */
const inkAt = (a: number) => INK.map((c, i) => c * a + CREAM[i] * (1 - a))

section('Text is dark enough to read')
{
  // Sanity: the arithmetic agrees with the known figure for solid ink
  ok(Math.abs(contrast(INK, CREAM) - 14.34) < 0.1,
    'solid ink on cream is about 14:1')

  // Every ink opacity the app actually uses, checked against the page it is
  // printed on. 65% is the floor for anything that is a sentence; 50% is
  // allowed only for large text, and nothing goes below it.
  const used = new Set<number>()
  for (const f of uiFiles()) {
    for (const m of read(f).matchAll(/text-ink\/(\d+)/g)) used.add(Number(m[1]))
  }
  ok(used.size > 0, 'the app prints ink at several opacities')

  for (const pct of [...used].sort((a, b) => a - b)) {
    const ratio = contrast(inkAt(pct / 100), CREAM)
    ok(ratio >= 3, `ink/${pct} clears 3:1 for large text (${ratio.toFixed(2)}:1)`)
  }

  // …and the tier that carries most of the writing clears AA outright
  const body = contrast(inkAt(0.65), CREAM)
  ok(body >= 4.5, `the muted tier clears AA for body text (${body.toFixed(2)}:1)`)

  // The tiers that were failing are gone. ink/40 was 2.37:1 and was the most
  // used colour in the app; ink/25 was 1.66:1, which is barely a mark.
  for (const gone of [25, 30, 40, 45]) {
    eq(uiFiles().filter(f => new RegExp(`text-ink/${gone}\\b`).test(read(f))), [],
      `nothing prints at ink/${gone} any more`)
  }

  // A placeholder is text too
  const ph = Number(css.match(/::placeholder[\s\S]{0,80}rgba\(43, 33, 24, ([\d.]+)\)/)?.[1] ?? 0)
  ok(contrast(inkAt(ph), CREAM) >= 3,
    `placeholders clear 3:1 (${contrast(inkAt(ph), CREAM).toFixed(2)}:1 at ${ph})`)
}

section('Titles come from the scale, hairlines from the mixes')
{
  // Seventy-odd titles were set by hand — the display font at whatever size
  // the screen's author picked, 16 to 36px across eight sizes — so no two
  // screens' headings agreed. They are t-h1, t-h2 and t-card now. The two
  // left are numbers rather than titles: the hub countdown and a forecast's
  // temperature, set in the display face for its numerals.
  const handSet = uiFiles().filter(f => read(f).includes('font-[family-name:var(--font-display)]'))
  eq(handSet.sort(), [
    'app/components/CourseWeather.tsx',
    'app/trip/[tripCode]/TripCountdown.tsx',
  ], 'no title is set in the display font by hand')

  // The hairline, the field border and the flat wash each have a name
  // (docs/refresh-plan.md, 3.2), so nobody retypes an opacity — 140 copies
  // of border-bark/12 was how "the card border" came to be four values.
  // (Fills at other strengths — a schedule block, a tee dot — are not
  // these three, and keep their own figures.)
  const retyped = /(?<![\w-])(?:(?:border|divide|ring)-bark\/(?:12|25|\[0\.0[68]\])|bg-bark\/(?:12|\[0\.0[456]\]))(?![\w/])/
  eq(uiFiles().filter(f => retyped.test(read(f))), [],
    'no hairline, field border or flat wash is a retyped opacity')
}

section('A label on a coloured fill is dark enough too')
{
  const ACCENT = [0x0A, 0x9D, 0x56]
  const DEEP   = [0x0A, 0x6B, 0x3C]
  const WHITE  = [255, 255, 255]

  // The emerald a button rests on is the deeper of the two, because white on
  // the brighter one is 3.5:1 and dark ink on it is 4.5:1 — neither reads at
  // button size. The button was already using both greens; this only swaps
  // which one it sits at.
  ok(contrast(WHITE, DEEP) >= 4.5,
    `white on the deep emerald clears AA (${contrast(WHITE, DEEP).toFixed(2)}:1)`)
  ok(contrast(WHITE, ACCENT) < 4.5,
    'which the brighter emerald does not, and is why it is not the resting fill')

  // Nothing prints text straight onto the brighter emerald any more
  const offenders = uiFiles().filter(f =>
    new RegExp('bg-accent(?![-/\\[])\\s+text-').test(read(f)))
  eq(offenders, [], 'no text sits on the brighter emerald')

  // The accent itself is untouched everywhere it is not behind words
  ok(uiFiles().some(f => /rounded-full bg-accent\b/.test(read(f))),
    'the emerald is still the dot, the bar and the active state')
}

section('Dark mode is the same tokens with night values')
{
  // One class, redefining every token — not a second stylesheet. The block
  // lives under html.dark so it outranks :root by specificity, whatever
  // order the compiled sheet lands in.
  const darkBlock = css.match(/html\.dark \{([\s\S]*?)\}/)?.[1] ?? ''
  ok(darkBlock !== '', 'html.dark exists in the stylesheet')
  const darkHex = (name: string) =>
    darkBlock.match(new RegExp(`--gd-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1] ?? ''

  // The indirection the whole feature rests on: a token that carries its hex
  // straight gets folded into every opacity-modified utility at build time
  // (`text-ink/65` becomes a baked `#2b2118a6` no theme can reach), so each
  // token must point at the plain property the theme blocks re-point.
  for (const name of ['cream', 'surface', 'ink', 'bark',
                      'accent', 'accent-deep', 'rust', 'rust-deep', 'gold', 'gold-deep', 'on-gold']) {
    ok(new RegExp(`--color-${name}:\\s*var\\(--gd-${name}\\)`).test(css),
      `the ${name} token is a var(), which the build cannot fold away`)
  }
  for (const name of ['cream', 'surface', 'ink', 'bark',
                      'accent', 'accent-deep', 'rust', 'rust-deep', 'gold', 'gold-deep', 'on-gold']) {
    ok(darkHex(name) !== '', `${name} has a dark value`)
  }

  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const DCREAM   = rgb(darkHex('cream'))
  const DSURFACE = rgb(darkHex('surface'))
  const DINK     = rgb(darkHex('ink'))
  const DDEEP    = rgb(darkHex('accent-deep'))
  const WHITE    = [255, 255, 255]
  const overD = (fg: number[], a: number, bg: number[]) =>
    fg.map((c, i) => c * a + bg[i] * (1 - a))

  // No pure grey at night either — every neutral stays warm, red over green
  // over blue, the same rule the light palette lives by.
  for (const name of ['cream', 'surface', 'ink', 'bark']) {
    const [r, g, b] = rgb(darkHex(name))
    ok(r > g && g > b, `dark ${name} is warm, not grey (${darkHex(name)})`)
  }

  // The same contrast arithmetic the light palette answers to. Ink at an
  // opacity is composited over the dark page exactly as the light checks
  // composite it over cream.
  ok(contrast(DINK, DCREAM) >= 10,
    `dark ink on the dark page is emphatic (${contrast(DINK, DCREAM).toFixed(2)}:1)`)
  for (const bg of [DCREAM, DSURFACE]) {
    ok(contrast(overD(DINK, 0.65, bg), bg) >= 4.5,
      `dark ink/65 clears AA (${contrast(overD(DINK, 0.65, bg), bg).toFixed(2)}:1)`)
    ok(contrast(overD(DINK, 0.5, bg), bg) >= 3,
      `dark ink/50 clears 3:1 for large text (${contrast(overD(DINK, 0.5, bg), bg).toFixed(2)}:1)`)
  }

  // accent-deep works two jobs — a button fill under white text, and link
  // text on the page — and the dark value is chosen as the balance point
  // that clears 4:1 in the fill job without failing the text one.
  ok(contrast(WHITE, DDEEP) >= 4,
    `white on the dark accent-deep reads at button size (${contrast(WHITE, DDEEP).toFixed(2)}:1)`)
  ok(contrast(DDEEP, DCREAM) >= 4,
    `and the same green reads as a link on the page (${contrast(DDEEP, DCREAM).toFixed(2)}:1)`)
  ok(contrast(rgb(darkHex('accent')), DCREAM) >= 4.5,
    `the accent itself reads as text on the dark page (${contrast(rgb(darkHex('accent')), DCREAM).toFixed(2)}:1)`)

  // Gold is winning (lib/resultTone.ts), and a result is read, so it is
  // held to the same arithmetic as text — in both themes.
  {
    const lightBlock = css.match(/:root \{([\s\S]*?)\}/)?.[1] ?? ''
    const lightHex = (name: string) =>
      lightBlock.match(new RegExp(`--gd-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1] ?? ''
    const mixOver = (fg: number[], a: number, bg: number[]) => fg.map((c, i) => c * a + bg[i] * (1 - a))
    const LGOLD = rgb(lightHex('gold')), LDEEP = rgb(lightHex('gold-deep')), ON = rgb(lightHex('on-gold'))
    const LSURF = rgb(lightHex('surface'))
    ok(lightHex('gold') !== '' && lightHex('gold').toUpperCase() !== '#C9A84C',
      'gold is a token — and not the old identity\'s gold')
    for (const [where, bg] of [['the page', CREAM], ['a card', LSURF]] as const) {
      ok(contrast(LDEEP, bg) >= 4.5, `gold text reads on ${where} (${contrast(LDEEP, bg).toFixed(2)}:1)`)
      ok(contrast(LDEEP, mixOver(LGOLD, 0.24, bg)) >= 4.5,
        `  …and on the up pill's tint over ${where} (${contrast(LDEEP, mixOver(LGOLD, 0.24, bg)).toFixed(2)}:1)`)
    }
    ok(contrast(ON, LGOLD) >= 4.5, `the ink on a won pill reads (${contrast(ON, LGOLD).toFixed(2)}:1)`)
    const DGOLD = rgb(darkHex('gold')), DGDEEP = rgb(darkHex('gold-deep')), DON = rgb(darkHex('on-gold'))
    ok(contrast(DGDEEP, DCREAM) >= 4.5 && contrast(DGDEEP, DSURFACE) >= 4.5,
      `dark gold text reads on the dark page and card (${contrast(DGDEEP, DSURFACE).toFixed(2)}:1)`)
    ok(contrast(DGDEEP, mixOver(DGOLD, 0.24, DSURFACE)) >= 4.5, '  …and on the dark up pill')
    ok(contrast(DON, DGOLD) >= 4.5, `the ink on a won pill reads at night too (${contrast(DON, DGOLD).toFixed(2)}:1)`)
  }

  // Errors are text before they are colour
  ok(contrast(rgb(darkHex('rust-deep')), DCREAM) >= 4.5,
    `dark rust-deep clears AA for error copy (${contrast(rgb(darkHex('rust-deep')), DCREAM).toFixed(2)}:1)`)

  // The class arrives before first paint, from an inline script — cookies()
  // in the root layout would force every route dynamic, which the landing
  // animation's prefetch checks above forbid.
  const layout = read('app/layout.tsx')
  ok(layout.includes('THEME_BOOT_SCRIPT'), 'the layout carries the boot script')
  ok(layout.includes('suppressHydrationWarning'),
    '  …and tells React the class is allowed to differ from the server')

  // The browser chrome follows the page: theme.ts names one colour per
  // theme, and each must be that theme\'s own page colour or the status bar
  // sits on a page it does not match.
  const theme = read('lib/theme.ts')
  ok(theme.includes(`DARK_THEME_COLOR = '${darkHex('cream')}'`),
    'the dark browser chrome is the dark page')
  ok(theme.includes("LIGHT_THEME_COLOR = '#F6F4F0'"),
    'and the light one is still cream')

  // The gear is on every hub, claimed or not — a phone that went dark must
  // always have the way back (Ross, 25 Oct 2026). The nickname is a
  // claimed player\'s, so only the player is conditional.
  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes('<PlayerSettings'), 'the hub carries the preferences gear')
  ok(!/preferences = me &&/.test(hub), '  …for every phone, not only a claimed one')
  ok(/playerId=\{me && isConfirmed\(me\) \? me\.id : null\}/.test(hub),
    '  …handing it the player only when one is claimed')
  ok(!read('app/components/PlayerSettings.tsx').includes('dark_mode'),
    'appearance is the device\'s — the old player column is never read or written')

  // The other half of the indirection: Turbopack's CSS pass strips the
  // color-mix branches the tinted utilities compile to when the browser
  // targets predate color-mix — every `/65` then quietly renders solid.
  // The stylesheet already assumed this baseline (100cqw, dvh) before dark
  // mode did; what is pinned is that nobody deletes the browserslist
  // without knowing what it holds up.
  ok(read('package.json').includes('"safari >= 16.4"'),
    'package.json pins modern CSS targets, or the build bakes every tint solid')

  // The stylesheet\'s baked literals are themed where they would vanish
  ok(/\.skeleton \{[\s\S]{0,400}color-mix\(in srgb, var\(--color-bark\)/.test(css),
    'skeletons read the bark token, so they shimmer on either page')
  ok(css.includes('html.dark input::placeholder'),
    'placeholders lighten with the ink')
  ok(css.includes('html.dark .scroll-shade-l') && css.includes('html.dark .scroll-shade-r'),
    'and the board\'s scroll shades invert to a light haze')

  // The preferences sheet must escape the header before it can be fixed to
  // the viewport: the sticky bar\'s backdrop-filter makes it the containing
  // block for fixed descendants, and rendered in place the sheet pinned
  // itself to the 52px bar — a brown band across the top of a live phone.
  const sheet = read('app/components/PlayerSettings.tsx')
  ok(sheet.includes('createPortal') && sheet.includes('document.body'),
    'the preferences sheet portals to <body>, out of the header\'s filter')

  // The mark\'s letters lift after dark. The wordmark\'s brown is a fill
  // attribute in the generated markup, overridden to bark under html.dark —
  // an attribute override, never a filter, which would drag the emerald dot
  // through colours that are not the brand\'s on its way to lightening the
  // words.
  ok(css.includes('html.dark .gd-mark [fill="#4a3728"]'),
    'the wordmark\'s words lift to bark in the dark')
  ok(read('app/components/MorphWordmark.tsx').includes('gd-mark'),
    '  …and the mark actually wears the class that rule hangs off')

  // The page-title marks are two-ink PNGs, so each carries a pre-rendered
  // dark twin at the same dimensions — the ratio in the register serves
  // both. Same-size is load-bearing: TitleMark sizes by height and hands
  // the width to the light file\'s ratio.
  const titleSrc = read('app/components/TitleMark.tsx')
  ok(titleSrc.includes("only-light") && titleSrc.includes("only-dark"),
    'TitleMark draws the pair and lets the theme pick')
  for (const m of [...titleSrc.matchAll(/src: '\/title-([a-z-]+)\.png'/g)]) {
    const name = m[1]
    ok(fs.existsSync(`public/title-${name}-dark.png`),
      `title-${name} has a dark twin`)
    if (!fs.existsSync(`public/title-${name}-dark.png`)) continue
    const light = fs.readFileSync(`public/title-${name}.png`)
    const dark  = fs.readFileSync(`public/title-${name}-dark.png`)
    ok(light.readUInt32BE(16) === dark.readUInt32BE(16) &&
       light.readUInt32BE(20) === dark.readUInt32BE(20),
      `  …at the same dimensions, so one ratio serves both`)
  }
}

section('Type is big enough to read')
{
  // The scale itself
  const sizes: Record<string, number> = {}
  for (const m of css.matchAll(/\.(t-h1|t-h2|t-card|t-body|t-data|t-label|t-cap|t-eyebrow)\s*\{[^}]*font-size:\s*(\d+)px/g)) {
    sizes[m[1]] = Number(m[2])
  }
  eq(Object.keys(sizes).sort(),
    ['t-body', 't-cap', 't-card', 't-data', 't-eyebrow', 't-h1', 't-h2', 't-label'],
    'every step of the scale has a size')

  for (const [name, px] of Object.entries(sizes)) {
    ok(px >= 13, `${name} is at least 13px (${px}px)`)
  }
  ok(sizes['t-body'] >= 16, `body copy is at least 16px (${sizes['t-body']}px)`)
  ok(sizes['t-h1'] > sizes['t-h2'] && sizes['t-h2'] > sizes['t-card'],
    'and the headings still step down in order')

  // The floor held, but nearly all the writing on a screen was sitting on
  // it. A caption and a label are where every note, unit and uppercase
  // heading lands, and at 13px that was most of the page set at the smallest
  // size the guide allows. They carry the bump; the display sizes do not,
  // because lifting those too would leave the ratios where they started.
  ok(sizes['t-cap'] >= 15, `captions are at least 15px (${sizes['t-cap']}px)`)
  ok(sizes['t-label'] >= 15, `so are labels (${sizes['t-label']}px)`)
  ok(sizes['t-body'] - sizes['t-cap'] <= 4,
    'and body copy is within a step of them, not three')

  // Ad-hoc sizes bypass the scale, so they get the same floor
  const BRACKET = 'app/trip/[tripCode]/matchplay/MatchplayBracket.tsx'
  const tooSmall: string[] = []
  for (const f of uiFiles()) {
    // The one exception, named rather than hidden: a knockout bracket is a
    // dense grid of boxes sized to fit a round across a phone, and it is
    // frozen for its own reasons.
    //
    // There was briefly a second, for an 11px countback badge on the
    // leaderboard. That badge is gone — it fought the totals column it hung
    // off — and the fact it carried is words on a round tile now, at a size
    // that needs no exception.
    if (f === BRACKET) continue
    for (const m of read(f).matchAll(/text-\[(\d+)px\]/g)) {
      if (Number(m[1]) < 13) tooSmall.push(`${f.split('/').pop()}:${m[1]}px`)
    }
  }
  eq(tooSmall, [], 'nothing else is set smaller than 13px by hand')

  // Tailwind's own small end ships under the floor — text-sm is 14px and
  // text-xs is 12px — and a few hundred call sites across the app reach for
  // them rather than the scale. The tokens move instead of the call sites.
  const px = (v: string) => Number(css.match(new RegExp(`--text-${v}:\\s*(\\d+)px`))?.[1] ?? 0)
  ok(px('sm') >= 15, `text-sm is retuned to at least 15px (${px('sm')}px)`)
  ok(px('xs') >= 13, `and text-xs to at least 13px (${px('xs')}px)`)

  // The tab labels were the one exception, at 11px, for five labels across
  // the narrowest phone. Archivo's width axis buys that room instead now,
  // so the bar keeps the same floor as everything else.
  const bar = Number(read('app/components/TabBar.tsx').match(/fontSize: (\d+)/)?.[1] ?? 0)
  ok(bar >= 13, `the tab labels are at least 13px (${bar}px)`)
}

// ─── The tab bar ───────────────────────────────────────────────

section('The bottom tab bar')
{
  const src = read('app/components/TabBar.tsx')

  // Five tabs: the leaderboard holds the centre, which is the emphasis —
  // the emerald circle around it was tried and retired the same day (the
  // label had to go, then came back and dragged the alignment sideways).
  // Five identical tabs; position does the emphasising.
  // A trip's five, then the one an event adds: an event is Home, Scoring,
  // Leaderboard and Settings — four, with Settings at the right edge where
  // a trip keeps Trip Setup (its tee sheet and stats are home screen
  // modules now).
  eq(
    (src.match(/label: '([^']+)'/g) ?? []).map(s => s.replace(/label: '|'/g, '')),
    ['Home', 'Scoring', 'Leaderboard', 'Stats', 'Trip Setup', 'Settings', 'Bracket'],
    'a trip\'s five with the leaderboard centred, the Settings an event ends on, and a match play event\'s Bracket in the leaderboard\'s place',
  )
  ok(src.includes('grid-cols-5') && src.includes('grid-cols-4'), 'the grid matches the count')
  ok(!/emphasis/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')) && !/rounded-full/.test(src),
    'no tab is dressed differently from the others')

  // The bar's env(safe-area-inset-bottom) is only a real number when the
  // viewport declares viewport-fit=cover — without it iOS reports every
  // inset as zero, the padding never fired, and the bar sat in the home
  // indicator's zone once Safari's toolbar collapsed at the bottom of a
  // scroll. The one line that makes the whole clearance chain true.
  ok(/viewportFit: "cover"/.test(read('app/layout.tsx')),
    'the viewport declares cover, so the safe-area insets exist')

  ok(src.includes('fixed bottom-0'), 'fixed to the bottom of the viewport')
  ok(src.includes('env(safe-area-inset-bottom)'),
    'clearing the iPhone home indicator, or the bottom row of taps lands on nothing')

  // ── The bar staying put at the bottom of a scroll ──
  //
  // Two mitigations for iOS bar-flicker used to be pinned here — the root
  // forbidding the rubber-band, and the bar painting 80px past itself for
  // the toolbar-collapse lag — and both are now pinned ABSENT, because the
  // deploy that carried them is when every trip screen on a real iPhone
  // gained scroll range past the end of its content: a blank field the page
  // could be scrolled into until the whole site sat above the top of the
  // screen, on Safari and the installed app alike. A bounce always springs
  // back; that page did not. The flicker they treated is cosmetic and
  // self-correcting, and it is the accepted cost of never being stuck.
  // Comments stripped first: the stylesheet explains this very removal in
  // prose that names the property, and a pin that matches its own
  // explanation is a pin that can never pass.
  const globalsCode = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
  ok(!/overscroll-behavior-y:\s*none/.test(globalsCode),
    'the root does not forbid the rubber-band — the bounce springs back, the blank field did not')
  ok(!/OVERHANG|marginBottom: -/.test(src),
    'and the bar paints nothing past the viewport — iOS 26 clips it anyway')
  ok(/paddingBottom: 'env\(safe-area-inset-bottom\)'/.test(src),
    'the bar occupies its height plus the home-indicator inset, exactly')
  ok(src.includes('bg-surface'), 'on white')
  ok(src.includes('border-t border-line'), 'with a hairline top border')

  // "Labels must fit on one line — test Leaderboard specifically"
  ok(src.includes('whitespace-nowrap'), 'labels never wrap')
  // 13px, up from 11, in Archivo at 87.5% width — the narrower cut is what
  // lets "Leaderboard", the tight one, sit in a fifth of a phone at the
  // floor size (the measurements are in the note in TabBar.tsx). The width axis has to be loaded for the stretch to do
  // anything: without it the browser has one width and quietly ignores it.
  ok(src.includes('fontSize: 13'), 'at 13px, the floor everything else keeps')
  ok(src.includes("fontStretch: '87.5%'"), '  …set at 87.5% width, which is what lets Leaderboard fit')
  const archivo = read('app/layout.tsx').match(/Archivo\(\{[\s\S]*?\}\)/)?.[0] ?? ''
  ok(/axes: \["wdth"\]/.test(archivo), '  …so Archivo loads with its width axis')
  ok(!/weight:/.test(archivo), '  …as the whole variable font, not a list of static weights')
  ok(src.includes('size={22}') && src.includes('gap-1.5 h-16'), 'with 22px icons, 6px clear of their labels — 20 and 4 read as cramped')

  ok(src.includes("'text-accent'"), 'the active tab is emerald')
  ok(src.includes('text-bark/60'), 'and an inactive one is bark at 60%')
  ok(src.includes('fontWeight: lit ? 600 : 400'), 'with the lit label heavier')

  // ── Saying that the tap landed ──
  //
  // `active` comes from the pathname, and the pathname does not change until
  // the next page has rendered on the server — which on these screens is a
  // database round trip away. Lighting the tab on `active` alone meant a tap
  // looked like nothing for two or three seconds, and the second tap that
  // gets is the real cost. `useLinkStatus` is true from the touch, so the
  // destination tab lights immediately and the emerald is a promise rather
  // than a report.
  ok(src.includes('useLinkStatus'), 'a tab knows when it is being navigated to')
  ok(/const lit = active \|\| pending/.test(src),
    'and lights on that as well as on being the page you are on')
  ok(src.includes('tab-pressed'), 'the press itself is felt under the finger')
  ok(src.includes('touch-manipulation'),
    'and lands at once, rather than after the browser waits for a second tap')

  // The press is driven from a pointer handler, NOT from CSS `:active`.
  //
  // `:active` matches the element being activated and its ancestors, never
  // its descendants — so a rule on the tab's content would never fire for a
  // press on the link around it. And iOS Safari withholds `:active` from an
  // element with no touch handler nearby, which is this bar on the phone the
  // app is built for. The obvious version of this is dead CSS twice over,
  // and dead CSS with a passing test in front of it is worse than none.
  // Comments stripped, because the note explaining why `:active` is wrong
  // here says the word four times.
  ok(!/:active/.test(stripComments(src)),
    'and not left to :active, which would never fire here')
  ok(/onPointerDown/.test(src), 'a pointer press marks the tab held')
  for (const up of ['onPointerUp', 'onPointerCancel', 'onPointerLeave']) {
    ok(src.includes(up), `  …and ${up} lets it go again`)
  }

  // The two states are motion, so they answer to the same switch everything
  // else does. A press that still moves under reduced motion is the one
  // exception nobody asked for.
  ok(/\.tab-pressed \{ transform: scale\(0\.9/.test(css),
    'the press is a transform, not a second meaning on the colour')
  ok(/prefers-reduced-motion[\s\S]*\.tab-pending/.test(css),
    'the pending breath is stilled under reduced motion')
  ok(/prefers-reduced-motion[\s\S]*\.tab-pressed \{ transform: none/.test(css),
    '  …and so is the press, which keeps its colour and loses its movement')

  // Every trip screen has it, so the app is navigable from anywhere — but
  // exactly one file draws it. It was ten, one per page, and a component
  // rendered by a page unmounts when that page does: tapping a tab tore the
  // bar off the screen and drew a new one once the next page's queries came
  // back. The layout outlives the page, so now it does not move.
  ok(read('app/trip/[tripCode]/layout.tsx').includes('<TabBar'),
    'the trip layout draws the tab bar')

  const carriers = [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/teams/page.tsx',
    'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
    'app/trip/[tripCode]/stats/page.tsx',
  ]
  for (const f of carriers) {
    ok(!read(f).includes('<TabBar'),
      `${f.split('/').slice(-2).join('/')} leaves the bar to the layout`)
    ok(read(f).includes('has-tabbar'), '  …and leaves room for it')
  }
  ok(css.includes('.has-tabbar'), 'and the room is a token, not a magic number per page')
}

// ─── The support footer ─────────────────────────────────────────

section('The footer is sitewide, once inside a trip')
{
  // Every screen inside a trip except the ones where score entry happens —
  // it used to be only the trip hub and the leaderboard, so most of a trip
  // never showed it at all. Settings has no tab bar of its own, but it still
  // carries the footer.
  const carriers = [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/teams/page.tsx',
    'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
    'app/trip/[tripCode]/stats/page.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
  ]
  for (const f of carriers) {
    ok(read(f).includes('<SupportLink'), `${f.split('/').slice(-2).join('/')} carries the footer`)
  }

  // The one screen it must never sit near: the guide is explicit that it
  // "must not sit anywhere near someone entering a score."
  const scoring = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(!scoring.includes('SupportLink'), 'the live scoring dashboard does not carry it')
  const dashboard = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  ok(!dashboard.includes('SupportLink'), 'nor does the shared scoring client behind it')

  // A drawn bracket used to lose both the tab bar and the footer at once —
  // TabBar lived inside the matchplay page's EmptyState, so it vanished the
  // moment there was a real bracket to show instead.
  const matchplay = read('app/trip/[tripCode]/matchplay/page.tsx')
  const emptyState = matchplay.slice(matchplay.indexOf('function EmptyState'))
  ok(!emptyState.includes('<TabBar'), 'the tab bar no longer hides inside the empty state')
  ok(!emptyState.includes('<SupportLink'), 'and neither does the footer')
}

// ─── The sticky header ─────────────────────────────────────────

section('The mark is the header, and the way back')
{
  const src = read('app/components/TripHeader.tsx')
  // The numbers live outside the client component so a server page can read
  // them — see the comment at the top of headerMetrics.ts.
  const metrics = read('app/components/headerMetrics.ts')

  ok(src.includes("pinned ? 'sticky' : 'relative'"), 'it sticks to the top')
  ok(/pinned = true/.test(src), '  …unless a screen says otherwise, which only the landing page does')
  ok(metrics.includes('HEADER_H = 52'), 'at a known height')
  ok(src.includes('href={backTo}'), 'and tapping it goes wherever it was pointed')
  ok(src.includes("backTo === '/' ? 'Back to the start' : 'Back'"),
    'which is said out loud, since it is only a logo')
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
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/scoring/[roundNumber]/page.tsx',
    'app/trip/[tripCode]/teams/page.tsx',
    'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
    'app/trip/[tripCode]/stats/page.tsx',
  ]
  for (const f of carriers) {
    ok(read(f).includes('<TripHeader'), `${f.split('/').slice(-2).join('/')} carries the mark`)
  }
}

section('The collapse happens on leaving the landing page, and nowhere else')
{
  const src = read('app/components/TripHeader.tsx')
  const landing = read('app/Landing.tsx')

  // Driven by a tap on the way out, not by scrolling the page. A timed
  // animation runs at the speed it was written to run at; one driven by a
  // finger runs at whatever speed the finger moves, and can stop halfway.
  ok(landing.includes('requestAnimationFrame'), 'the landing page animates the mark itself')
  ok(landing.includes('const TRAVEL_MS'), 'over a named length of time')

  // The words shake themselves loose before any of them travels
  ok(landing.includes('const WOBBLE_MS'), 'after a named shake, which comes first')
  const wob = Number(landing.match(/WOBBLE_MS = (\d+)/)?.[1] ?? 0)
  const ms  = Number(landing.match(/TRAVEL_MS = (\d+)/)?.[1] ?? 0)
  ok(wob > 0 && ms > 0, 'both have a length')

  // A deliberate exception to the 400ms the guide allows ordinary UI motion.
  // This is a page transition with a shake in front of it, and it was asked
  // to be slower — but it is still bounded, so it cannot creep.
  ok(ms > 400, 'the move is slower than the ceiling for ordinary UI motion')
  ok(wob + ms <= 1400, `and the whole thing still ends promptly (${wob + ms}ms)`)

  // Started at rest and finished at rest, or the hand-over shows a seam
  ok(landing.includes('const smooth ='), 'the driver is smoothed, not linear')
  const mark = read('app/components/MorphWordmark.tsx')
  ok(mark.includes('Math.sin(Math.PI * Math.min(1, Math.max(0, wobble)))'),
    'the shake is enveloped, so it grows out of stillness and settles back into it')
  ok(/i \* \(Math\.PI \/ 2\)/.test(mark),
    'and each word is a quarter-cycle behind the last, so the mark loosens rather than rocking as one')

  // Nothing on the page reacts to scrolling any more
  ok(!/addEventListener\(\s*'scroll'/.test(landing + src), 'nothing listens for a scroll')
  ok(!landing.includes('HeroPin'), 'and nothing has to be held still while it happens')

  // The mark stands *below* the bar here rather than in it, so a pinned
  // header holds 145px of wordmark over open page. The front page outgrew a
  // phone screen when the event code box moved onto it, and the sentence and
  // the form then scrolled up through the letterforms. Unpinned, the mark
  // goes up the screen with them and nothing can pass behind it.
  ok(/<TripHeader[\s\S]{0,160}pinned=\{false\}/.test(landing),
    'the mark scrolls away with the page rather than standing over it')
  // Which leaves the bar at the top of the document rather than the top of
  // the screen — so a departure from a scrolled page needs telling where the
  // screen currently is, or the whole collapse happens above the fold.
  ok(/lineOffsetY=\{landsAt\}/.test(landing) && landing.includes('setLandsAt(window.scrollY)'),
    '  …and still collapses onto the screen the finger is looking at')

  // The frame loop is cleaned up, and a second tap cannot start a second one
  ok(landing.includes('cancelAnimationFrame'), 'the frame loop is torn down on unmount')
  ok(landing.includes('if (going.current) return'),
    'and a second tap cannot start a second animation over the first')

  // The order is: fade what is leaving, land the mark, then navigate
  // lastIndexOf, because the reduced-motion path pushes first and skips
  // straight past all of this
  ok(landing.indexOf('setLeaving(true)') < landing.lastIndexOf('router.push(href)'),
    'the content clears before the next screen is asked for')
  ok(/if \(t < total\)[\s\S]{0,120}router\.push/.test(landing),
    'which happens only once the mark has landed')
  ok(landing.includes("router.prefetch('/dashboard/create')") &&
     landing.includes("router.prefetch('/join')"),
    'both destinations are prefetched, so the wait after it is as short as it can be')

  // …and the screen it arrives at fades up rather than appearing
  for (const f of ['app/join/JoinForm.tsx', 'app/dashboard/create/CreateTripForm.tsx']) {
    ok(read(f).includes('page-enter'), `${f.split('/').pop()} fades up under it`)
  }

  // Anyone who asked for less motion is simply taken there
  ok(landing.includes('prefers-reduced-motion'), 'reduced motion is honoured')
  ok(/prefers-reduced-motion[\s\S]{0,120}router\.push\(href\)[\s\S]{0,40}return/.test(landing),
    'by going straight to the page, with no collapse and no fade')

  // Every other screen is settled from the first pixel, and says nothing
  // about progress at all
  for (const f of [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/scoring/[roundNumber]/page.tsx',
  ]) {
    // The prop, not the word — "in-progress scores" is a different thing
    ok(!/progress=/.test(read(f)),
      `${f.split('/').slice(-2).join('/')} does not move — it is read standing on a tee`)
  }

  // The header renders the position it is handed and nothing more. It has no
  // opinion about what drives the mark, which is what let the driver change
  // from a scrollbar to a tap without touching the animation itself.
  ok(src.includes('const t = title === \'green-dot\' ? (progress ?? 1) : 1'),
    'the header settles unless it is handed a position')
  ok(!src.includes('useScrollProgress'), 'and computes nothing from the page itself')

  // One element the whole way, not two crossfading
  eq((src.match(/<MorphWordmark/g) ?? []).length, 1,
    'there is one mark on screen, never two fading past each other')
  ok(src.includes('heroOrigin') && src.includes('lineOrigin'),
    'the header hands it both ends of the journey in screen pixels')
  ok(src.includes('HERO_W') && src.includes('LINE_W'),
    'and the size at each end')
  // The mark itself is positioned, not transformed: a scaling frame is what
  // made "dot" appear to lurch right while the mark as a whole moved left.
  ok(!/<MorphWordmark[\s\S]{0,200}transform/.test(src),
    'the mark is positioned rather than transformed as a block')
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
  for (const n of ['IconHome', 'IconTrophy', 'IconClipboardList', 'IconSettings', 'IconChartBar']) {
    ok(icons.includes(`export const ${n}`), `${n} exists for the tab bar`)
  }
}

// ─── Components ────────────────────────────────────────────────

section('Status pills follow the spec')
{
  // Pill replaced Badge in the refresh: sentence case and no tracking — a
  // pill was 15px spaced capitals, which is most of what made a screen
  // read as generated (docs/refresh-plan.md, 2.2).
  const win = renderToStaticMarkup(React.createElement(Pill, { tone: 'win', children: 'Won' }))
  const loss = renderToStaticMarkup(React.createElement(Pill, { tone: 'loss', children: 'Lost' }))
  const neutral = renderToStaticMarkup(React.createElement(Pill, { children: 'Thru 11' }))

  ok(win.includes('rounded-full'), 'a pill is round')
  ok(/text-\[13px\] font-semibold/.test(win), 'at 13px, semibold')
  ok(!/uppercase|tracking-/.test(win + loss + neutral), 'in sentence case, with no letter-spacing')
  // A tint behind, the deep shade of the same hue on it — never black
  ok(win.includes('bg-accent-tint') && win.includes('text-accent-deep'), 'win is emerald on emerald')
  ok(loss.includes('bg-rust/[0.14]') && loss.includes('text-rust-deep'), 'loss is rust on rust')
  ok(neutral.includes('bg-bark/[0.09]') && neutral.includes('text-ink/80'), 'and neutral is ink on a bark wash')
  ok(!/text-black|text-ink\b(?!\/)/.test(win), 'no black text on a coloured pill')

  const live = renderToStaticMarkup(React.createElement(Pill, { live: true, children: 'In play' }))
  ok(live.includes('dot-live'), 'a live pill carries the breathing dot')
  eq(uiFiles().filter(f => /\bBadge\b(?! is gone)/.test(stripComments(read(f)).replace(/\w+Badge|Badge\w+/g, ''))), [],
    'and Badge is gone, call sites and all')
}

section('One primary action per screen')
{
  const primary = buttonClass('primary'), secondary = buttonClass('secondary')
  ok(primary.includes('bg-accent-deep'), 'the primary action is the deep emerald')
  ok(primary.includes('text-white'), 'with white on it, for contrast')
  ok(primary.includes('shadow-cta'), '  …lifted on its own green shadow')
  ok(!secondary.includes('bg-accent'), 'a secondary action is not emerald')
  ok(secondary.includes('bg-surface') && secondary.includes('shadow-raised'), 'it is a raised white surface instead')
  ok(/\brounded-button\b/.test(primary), 'buttons are 16px round')
  ok(/w-full min-h-14/.test(primary) && /min-h-12/.test(buttonClass('primary', false)),
    'full width is 56px tall, inline 48 — a real touch target either way')
  ok(/text-\[17px\] font-semibold/.test(primary), 'the words are 17px semibold')
  ok(!/uppercase|tracking-/.test(primary + secondary + buttonClass('quiet') + buttonClass('danger')),
    '  …in sentence case, with no letter-spacing')

  // Not yet is not broken. A pale green button reads as a fault; a flat
  // bark wash with dimmed words reads as waiting. The dimmed words are the
  // one place text may sit under the contrast floor — a disabled control
  // is exempt, and only ever through `disabled:`.
  ok(primary.includes('disabled:bg-disabled-bg') && primary.includes('disabled:text-disabled-fg'),
    'disabled is a bark wash with dimmed words')
  ok(primary.includes('disabled:shadow-none'), '  …flat, with no shadow')
  ok(!/disabled:opacity/.test(primary), '  …and never a faded green')
  eq(uiFiles().filter(f => /(?<!disabled:)\btext-disabled-fg\b|(?<!disabled:)\bbg-disabled-bg\b/.test(stripComments(read(f)))), [],
    'the disabled pair is only ever reached through disabled:')
}

section('The parts kit')
{
  // Card: three levels and a hairline that stays for sunlight
  ok(cardClass('raised') === 'bg-surface border border-line shadow-raised rounded-card', 'a raised card: white, hairline, warm shadow, 20px')
  ok(cardClass('flat') === 'bg-tint rounded-card', 'a flat one is a tint with no edge')
  ok(cardClass('floating').includes('shadow-floating'), 'a floating one is a sheet')
  ok(cardClass('raised', true).endsWith(' press'), 'and pressable adds the press')

  // The press: down under the thumb, shadow off; Reduce Motion keeps the drop
  ok(/\.press:active \{ transform: scale\(0\.97\); box-shadow: none; \}/.test(css), 'pressed, it shrinks to 0.97 and its shadow goes')
  ok(/\.press \{[^}]*transition-duration: 120ms/.test(css), '  …in 120ms')
  ok(/\.press\.shadow-cta:active \{ box-shadow: var\(--shadow-cta-pressed\)/.test(css), '  …the primary keeps a sliver of its shadow')

  // The field: 56 tall, 17px, a 1.5px line, focus 2.5px emerald with no glow
  const field = css.slice(css.indexOf('.field {'), css.indexOf('}', css.indexOf('.field {')))
  ok(/min-height: 56px/.test(field) && /font-size: 17px/.test(field), 'a field is 56px tall with 17px type')
  // Centred by padding: iOS puts a date or time value at the top of its box
  // (Ross's phone, 19 Oct), where a text input is centred by the browser
  const pad = field.match(/padding: (\d+)px 16px/)
  ok(!!pad && 2 * Number(pad[1]) + Math.round(17 * 1.3) + 3 <= 56 && Number(pad[1]) >= 14,
    '  …its line centred by its own padding, so a date sits where a name does')
  ok(/button\.field \{ display: flex; align-items: center;/.test(css),
    '  …and a button dressed as one lays its value, badge and chevron in a row')
  ok(/border: 1\.5px solid var\(--color-line-strong\)/.test(field) && /border-radius: 14px/.test(field),
    '  …a 1.5px line, 14px round')
  ok(/\.field:focus \{ outline: 2\.5px solid var\(--color-accent\)/.test(css), '  …2.5px emerald in focus')
  ok(/\.field\[aria-invalid="true"\] \{ outline: 2\.5px solid var\(--color-rust\)/.test(css), '  …and rust in error')
  ok(FIELD === 'field', 'FIELD is that class')
  const f = renderToStaticMarkup(React.createElement(Field, { label: 'Challenge name', error: 'Give it a name', children: React.createElement('input', { className: FIELD }) }))
  ok(f.includes('t-label') && f.includes('Challenge name'), 'a field is labelled in sentence case')
  ok(/text-rust-deep/.test(f) && f.indexOf('Give it a name') > f.indexOf('<input'), '  …with its error right under it, in rust')

  // Chip, segmented, toggle
  ok(/min-h-11/.test(chipClass(false)) && /rounded-full/.test(chipClass(false)), 'a chip is 44px and fully round')
  ok(chipClass(true).includes('bg-accent-deep text-white'), '  …chosen is deep emerald, white words')
  ok(chipClass(false).includes('shadow-raised'), '  …not chosen is a raised chip')
  const seg = renderToStaticMarkup(React.createElement(Segmented, {
    label: 'Board', value: 'a', onChange: () => {},
    options: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }],
  }))
  ok(seg.includes('bg-tint') && seg.includes('aria-pressed="true"'), 'a segmented control: a tinted track, the choice pressed')
  ok(/aria-pressed="true"[^>]*bg-surface text-ink shadow-raised/.test(seg), '  …raised out of it')
  ok(!/bg-accent/.test(seg), '  …and never spending the screen\'s emerald on a switch')
  const toggle = read('app/components/Toggle.tsx')
  ok(/TRACK_W = 52/.test(toggle) && /TRACK_H = 32/.test(toggle), 'a toggle is 52 by 32')
  ok(/checked \? 'bg-accent-deep' : 'bg-bark\/20'/.test(toggle), '  …deep emerald on, bark 20% off')

  // List groups: one card, rows divided, never cards in cards
  const lg = renderToStaticMarkup(React.createElement(ListGroup, { children: [
    React.createElement(ListRow, { key: 1, label: 'Players', value: '6', href: '/x' }),
    React.createElement(ListRow, { key: 2, label: 'Teams', hint: 'Two sides' }),
  ] }))
  ok(lg.includes('divide-y divide-line') && (lg.match(/shadow-raised/g) ?? []).length === 1,
    'a list group is one raised card, its rows divided by hairlines')
  ok(/min-h-14/.test(lg) && /text-\[17px\] font-medium/.test(lg), '  …rows at least 56px, labels 17/500')

  // Icon buttons: 48, 44 in a dense row, always named
  ok(iconButtonClass().includes('w-12 h-12') && iconButtonClass(true).includes('w-11 h-11'), 'an icon button is 48px, 44 when dense')
  const ib = renderToStaticMarkup(React.createElement(IconButton, { label: 'Remove', children: 'x' }))
  ok(ib.includes('aria-label="Remove"'), '  …and says what it does')

  // Section header: t-h2, one hint, one action
  const sh = renderToStaticMarkup(React.createElement(SectionHeader, { hint: 'Add as many as you like.', children: 'Leaderboards' }))
  ok(sh.includes('t-h2') && sh.includes('t-cap'), 'a section header is a t-h2 with a caption under it')

  // The chosen one: a card, an option and a day tile all wear the same
  // emerald wash with a deep edge when picked
  ok(cardClass('chosen').startsWith('bg-accent-tint border border-accent-deep'), 'a chosen card is the wash with a deep edge')
  for (const shape of ['card', 'row', 'tile'] as const) {
    ok(optionClass(true, shape).includes('bg-accent-tint border-accent-deep'), `  …as is a chosen ${shape} option`)
  }
  // One display and one padding per shape, so nothing has to be laid on top
  for (const shape of ['card', 'row', 'tile'] as const) {
    const c = optionClass(false, shape).split(' ')
    eq(c.filter(x => /^(block|flex|inline-flex|grid)$/.test(x)).length <= 1 && c.filter(x => /^p[xy]-/.test(x)).length === 2, true,
      `the ${shape} option sets its own shape once`)
  }

  // Every choice on a form is one of those parts. The hand-made look they
  // replaced — an emerald edge and a wash typed out at the call site, ten
  // copies at six strengths — is gone. (The bracket's tiles were the one
  // exception; a decided match is gold now, a result rather than a choice.)
  const handMade = /'border-accent(?:\/\d+)? bg-accent\/(?:\[0\.\d+\]|\d+)'/
  eq(uiFiles().filter(f => handMade.test(read(f))), [],
    'no choice wears a hand-made chosen look')
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

section('The stylesheet parses')
{
  // Every other check in this file reads `globals.css` as a string, which
  // means none of them can tell valid CSS from a comment that forgot to
  // close. A paragraph added to the note above `.press` landed after the
  // `*/` rather than before it, so half a sentence became a declaration —
  // the whole file failed to compile, and all 473 string checks still
  // passed. The build caught it; that is too late and too far away.
  //
  // Not a parser, just the two things that actually go wrong in a file that
  // is nine-tenths prose.
  const opens = (css.match(/\/\*/g) ?? []).length
  const closes = (css.match(/\*\//g) ?? []).length
  ok(opens === closes,
    `every comment is closed (${opens} opened, ${closes} closed)`)

  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let depth = 0
  let wentNegative = false
  for (const ch of bare) {
    if (ch === '{') depth++
    else if (ch === '}' && --depth < 0) { wentNegative = true; break }
  }
  ok(!wentNegative && depth === 0,
    `and the braces balance (ends at depth ${depth})`)
}

section('Motion is calm, and can be switched off')
{
  // "ease-out everywhere. No bounce, no spring, no elastic easing."
  const files = uiFiles()
  const springs = files.filter(f => /cubic-bezier\([^)]*1\.\d/.test(stripComments(read(f))))
  eq(springs, [], 'no overshoot curves anywhere')

  // "Nothing takes longer than ~400ms"
  //
  // Two ceilings, because there are two kinds of motion here and only one of
  // them is what that rule is about.
  //
  // A one-shot is a response: a page arriving, a cell flashing, a control
  // going down under a thumb. Those are the ones that must not outlast the
  // gesture, and 400ms is the ceiling.
  //
  // A repeating animation is ambient — the live dot's breath, a skeleton's
  // pulse, the tab bar's wait. It is not answering a touch and it has no
  // ending to be late for, so it runs slower on purpose. `dot-live` has been
  // 2s and the skeleton 1.4s since they were written.
  //
  // This used to be one ceiling over everything matching `\d+ms`, which
  // caught neither of those — not because they were allowed, but because
  // they are written in seconds and a search for `ms` does not find `2s`.
  // Reading both units is what makes the one-shot ceiling real, and it is
  // why the exemption has to be said out loud instead of left as a gap.
  const durationsIn = (s: string) =>
    [...s.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)]
      .map(m => (m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000))

  const loops = [...css.matchAll(/animation:[^;]*\binfinite\b[^;]*;/g)].map(m => m[0])
  const oneShot = loops.reduce((acc, l) => acc.replace(l, ''), css)

  const durations = durationsIn(oneShot)
  ok(durations.length > 0, 'the stylesheet defines durations')
  ok(durations.every(d => d <= 400),
    `no motion answering a touch exceeds 400ms (longest ${Math.max(...durations)}ms)`)

  // One repeating animation is not a breath, and it is named here rather
  // than left as a gap in the pattern — which is what the note above asks of
  // an exemption. A name too long for the leaderboard's column glides out
  // and back (`.name-scroll-track`). That is a journey at a reading pace,
  // not a pulse: a two-second ceiling would whip it past unread.
  //
  // It is **one figure shared by every name on the board**, which is the
  // half worth pinning. Set per name from how far each had to travel, four
  // names ran four cycles permanently out of step with each other — read as
  // a table that was worse than the clipping it replaced. The component
  // carries the same number for its phase anchor, and the two are held
  // against each other so neither can drift.
  const travel = loops.filter(l => l.includes('name-scroll'))
  ok(travel.length === 1, 'exactly one repeat is a travel rather than a breath')

  const travelMs = durationsIn(travel[0] ?? '')
  ok(travelMs.length === 1, 'and it is one duration, not one per name')
  ok(travelMs[0] > 2000,
    `slower than a breath on purpose, so a glance mostly lands on a name at rest (${travelMs[0]}ms)`)

  const anchor = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
    .match(/const NAME_SCROLL_MS = ([\d_]+)/)
  ok(!!anchor, 'the component names that duration too, for the phase anchor')
  ok(Number((anchor?.[1] ?? '0').replace(/_/g, '')) === travelMs[0],
    'and the two agree, so a track joining late lands in step rather than beside')

  const looping = loops.filter(l => !travel.includes(l)).flatMap(durationsIn)
  ok(looping.length > 0, 'and some motion repeats rather than answering anything')
  ok(looping.every(d => d >= 900 && d <= 2000),
    `each repeat is a slow breath, 900ms to 2s (${looping.join('ms, ')}ms)`)

  // One curve for the app: the putt curve, quick off the face with a long
  // settle and never past the hole. Promoted from the intro (refresh plan,
  // 3.5); `--gd-ease`, and `ease-putt` as a utility.
  ok(/--gd-ease: cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(css), 'the putt curve is a token')
  ok(/--ease-putt: var\(--gd-ease\)/.test(css), '  …and a utility')

  ok(css.includes('.page-enter'), 'pages fade in')
  ok(/\.page-enter \{ animation: gdFade 200ms ease-out/.test(css), 'over 200ms, ease-out')

  // "Live score updates: flash the cell emerald at ~20%, fade over ~400ms.
  //  Do not use a jump/bounce."
  ok(css.includes('.score-flash'), 'a changed score flashes')
  ok(css.includes('rgba(10, 157, 86, 0.20)'), 'emerald at 20%')
  // Scoped to the keyframes themselves. It used to read from `gdScoreFlash`
  // to the first `transform` anywhere after it, which passed only for as
  // long as nothing below it in the file used one — so the first transform
  // added further down the stylesheet failed this, naming the score flash
  // for something it had no part in.
  const flash = css.slice(
    css.indexOf('@keyframes gdScoreFlash'),
    css.indexOf('.score-flash'),
  )
  ok(flash.length > 0, 'the score flash is a keyframe animation')
  ok(!/transform/.test(flash), 'and does not move — the number is being read')

  // Anyone who asked for less motion gets none of it
  ok(css.includes('prefers-reduced-motion'), 'reduced motion is honoured')
  const reduced = css.slice(css.indexOf('prefers-reduced-motion'))
  for (const c of ['page-enter', 'score-flash', 'dot-live', 'skeleton']) {
    ok(reduced.includes(c), `  …including ${c}`)
  }

  // "Prefer skeleton loading states over spinners"
  ok(css.includes('.skeleton'), 'skeletons exist to be preferred')
}

section('One count-up, one celebration, and never on a board')
{
  // Phase 8 (D10, D11). Where each may appear is the whole rule: a number
  // being read on a board never moves, and score entry never celebrates.
  const users = (name: string) => uiFiles()
    .filter(f => !f.endsWith(`components/${name}.tsx`))
    .filter(f => new RegExp(`import ${name} from`).test(read(f))).sort()
  eq(users('CountUp'), [
    'app/run/[tripCode]/add/page.tsx',
    'app/trip/[tripCode]/round/[roundNumber]/page.tsx',
  ], 'a total counts up in two places: your run total, and your signed round')
  eq(users('DotBloom'), [
    'app/run/[tripCode]/add/RunAddClient.tsx',
    'app/scoring/LiveScoringFlow.tsx',
    'app/trip/[tripCode]/match/[matchId]/card/MatchFinish.tsx',
  ], 'the dot blooms in three: a run logged, a card signed, a match finalised')

  const cu = stripComments(read('app/components/CountUp.tsx'))
  ok(cu.includes('export const COUNT_UP_MS = 400'), 'the count takes 400ms — inside the ceiling')
  ok(/prefers-reduced-motion: reduce/.test(cu) && /reduced\(\)\) \{ setShown\(value\); return \}/.test(cu),
    '  …and under Reduce Motion the final number is simply there')
  ok(/className="sr-only">\{show\(value, decimals\)\}/.test(cu), '  …and a screen reader only ever hears the final number')
  const cuHtml = renderToStaticMarkup(React.createElement(CountUp, { value: 34 }))
  ok(/aria-hidden="true">34</.test(cuHtml), '  …which is what the server renders, before any script runs')

  const db = read('app/components/DotBloom.tsx')
  ok(db.includes('export const DOT_BLOOM_MS = 600'),
    'the bloom is 600ms: a named exception to the 400ms ceiling, like the intro')
  ok(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.dot-bloom \{ animation:/.test(db),
    '  …which only runs for a reader who has not asked for less motion')
  ok(!/cubic-bezier\([^)]*1\.\d/.test(db), '  …and never overshoots')
  ok(/100% \{ transform: scale\(1\); +background-color: color-mix\(in srgb, var\(--color-accent\) 20%/.test(db),
    '  …settling on the quiet tinted disc that is its Reduce Motion version')
}

section('No spaced capitals')
{
  // 317 uppercase utilities and ten different letter-spacings, most of them
  // in Bespoke Serif by accident, were most of what made a screen read as
  // generated: "CHALLENGE NAME", "STEP 1 OF 4 — CHALLENGE", "CONTINUE"
  // (docs/refresh-plan.md, 2.2). Labels and buttons are sentence case now.
  //
  // Capitals are spaced in exactly two places, both named in the stylesheet
  // rather than written at a call site: a table's column headings
  // (`t-eyebrow`) and an event's code — typed into its field (`field-code`)
  // or shown as text (`t-code`).
  // One more is allowed by name: the terms' warranty disclaimer, set in
  // capitals because a legal disclaimer is made conspicuous that way.
  const UPPERCASE_ALLOWED = ['app/terms/page.tsx']
  eq(uiFiles().filter(f => !UPPERCASE_ALLOWED.includes(f) && /(?<![\w:-])uppercase(?![\w-])/.test(stripComments(read(f)))), [],
    'no uppercase is written at a call site')
  eq(uiFiles().filter(f => /(?<![\w:-])tracking-(?!normal\b)[\w[\].]+/.test(stripComments(read(f)))), [],
    'and no letter-spacing either')
  ok(/\.t-eyebrow \{[^}]*letter-spacing: 0\.04em;[^}]*text-transform: uppercase/.test(css),
    'the column heading carries its own, at 0.04em')
  ok(/\.field\.field-code \{[^}]*letter-spacing: 0\.12em;[^}]*text-transform: uppercase/.test(css),
    'and so does the code field, at 0.12em')
  ok(/\.t-code \{[^}]*letter-spacing: 0\.12em;[^}]*text-transform: uppercase/.test(css),
    'and a code shown as text, at the same 0.12em')
  eq(uiFiles().filter(f => /\bEyebrow\b/.test(stripComments(read(f)))), [],
    'the old Eyebrow component, a spaced-capital label, is gone')
}

section('Shadows are the four named levels')
{
  // Raised, floating, the primary's own, and that primary pressed — every
  // other shadow was ad hoc (`shadow-xl` on a toast, `shadow-lg shadow-bark/20`
  // on a dragged tile) and each one drifted from the last. Flat is no shadow.
  const NAMED = /^shadow-(raised|floating|floating-up|cta|cta-pressed|none)$/
  const stray: string[] = []
  for (const f of uiFiles()) {
    for (const m of stripComments(read(f)).matchAll(/(?<![\w:/-])(?:[a-z]+:)*(shadow(?:-[\w[\]().,/#%-]+)?)(?![\w-])/g)) {
      const cls = m[1]
      if (!NAMED.test(cls)) stray.push(`${f.split('/').pop()}: ${cls}`)
    }
  }
  eq(stray, [], 'no shadow utility but the named ones')
  eq(uiFiles().filter(f => /boxShadow\s*:/.test(stripComments(read(f)))), [],
    'and none written inline')
  // In the stylesheet, a box-shadow belongs to the press (which takes one
  // away) or to the intro, a documented exception with its own motion.
  const rules = [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => /box-shadow\s*:/.test(m[2])).map(m => m[1].trim())
  eq(rules.filter(sel => !/^\.intro-|^\.press/.test(sel)), [],
    'the stylesheet casts shadows only for the press and the intro')
}

section('No glows')
{
  // The old design glowed; on cream a glow reads as a smudge, and the guide
  // has none. The dot is solid emerald and that is all.
  //
  // One exception, and it is written down rather than hidden: a round with a
  // card open on it right now. That tile is a white card on cream — not the
  // cream-on-cream the rule was written against — and it is the one thing on
  // the app worth spotting from across a room. It lives in lib/roundState.ts
  // so both screens that show a round read the same class.
  const GLOW_HOME = 'lib/roundState.ts'
  const files = [...uiFiles(), GLOW_HOME]
  const glows = files.filter(f => /boxShadow: '0 0 |shadow-\[0_0_/.test(read(f)))
  eq(glows, [GLOW_HOME], 'nothing glows but the live round tile')

  // Text can glow too, and this guard could not see it. The trip countdown
  // carried `style={{ textShadow: '0 0 30px …, 0 2px 4px rgba(0,0,0,0.8)' }}`
  // through every run of it: an inline style is not a class name, so a rule
  // written against `shadow-[0_0_` never looked. The second half of that
  // value was a black drop shadow drawn for a dark page, on cream.
  eq(uiFiles().filter(f => /textShadow/.test(read(f))), [],
    'and no text glows through an inline style')

  // …and there it is exactly one glow, on exactly that state
  const roundState = read(GLOW_HOME)
  eq((roundState.match(/shadow-\[0_0_/g) ?? []).length, 1, 'which glows once, not everywhere')
  const liveLine = roundState.match(/live:\s*'([^']*)'/)?.[1] ?? ''
  ok(liveLine.includes('shadow-[0_0_'), 'and it is the live state that carries it')
  // A played round is raised, like any card that opens something — a
  // named shadow, not a glow. An empty one is flat: no shadow at all.
  for (const dead of ['empty', 'played']) {
    const line = roundState.match(new RegExp(`${dead}:\\s*'([^']*)'`))?.[1] ?? ''
    ok(!line.includes('shadow-['), `a ${dead} round does not glow`)
  }
  ok(/empty:\s*'bg-tint[^']*'/.test(roundState) && !/empty:\s*'[^']*shadow/.test(roundState),
    'an empty round is flat')
  ok(/played:\s*'[^']*shadow-raised[^']*'/.test(roundState), 'and a played one is raised')

  const dot = renderToStaticMarkup(React.createElement(LiveDot, {}))
  ok(dot.includes('bg-accent'), 'the live dot is solid emerald')
  ok(dot.includes('dot-live'), 'and breathes')
  ok(!dot.includes('shadow'), 'without a glow')
  ok(dot.includes('w-1.5 h-1.5'), 'kept small, so it stays a punctuation mark')
}

// ─── The screens the mark lands on are already there ───────────

section('The destinations are prefetchable whole')
{
  // A dynamic route cannot be prefetched whole, so arriving at one is a
  // server round trip — which lands after the animation has finished and
  // reads as a gap. Measured before this was fixed: 480ms on join, 314ms on
  // create, and create still had a database query in front of it.
  for (const f of ['app/join/page.tsx', 'app/dashboard/create/page.tsx', 'app/create/page.tsx']) {
    const src = read(f)
    const name = f.split('/').slice(-2).join('/')
    ok(!src.includes('force-dynamic'), `${name} is not forced dynamic`)
    ok(!/await\s+searchParams/.test(src), `  …and does not read searchParams, which would make it so`)
    ok(!src.includes('supabase'), `  …nor query anything, which would too`)
  }

  // What moved off the server had to land somewhere
  ok(read('app/join/JoinForm.tsx').includes('window.location.search'),
    'the join code is read from the URL on the client instead')
  // The course list is fetched in the browser rather than by the page, which
  // is what lets `/dashboard/create` stay static and the landing animation
  // hand over without a gap. The query itself moved into a shared hook once
  // Trip Setup and the scoring screen stopped fetching it on the server too —
  // so what this pins is that it is still client-side, not which file the
  // `from('courses')` happens to sit in.
  const create = read('app/dashboard/create/CreateTripForm.tsx')
  ok(/usePlatformCourses|from\('courses'\)/.test(create),
    'and the course list is fetched by the form')
  const coursesHook = read('app/components/usePlatformCourses.ts')
  ok(coursesHook.trimStart().startsWith("'use client'") && coursesHook.includes("from('courses')"),
    '  …in the browser, from a client hook')
  ok(create.includes('coursesLoaded && courses.length === 0'),
    'which only reports an empty list once it actually knows')

  // Prefetched on the landing page, or none of the above helps
  const landing = read('app/Landing.tsx')
  ok(landing.includes("router.prefetch('/dashboard/create')") &&
     landing.includes("router.prefetch('/join')") &&
     landing.includes("router.prefetch('/create')"),
    'all three are prefetched while the landing page sits there')
}

// ─── One header, everywhere ────────────────────────────────────

section('The screens before a trip wear the same header')
{
  // The mark lands in the bar on the way off the landing page. If the screen
  // it lands on did not have it there, the collapse would be explaining a
  // move to somewhere the mark does not end up.
  for (const f of ['app/join/JoinForm.tsx', 'app/dashboard/create/CreateTripForm.tsx', 'app/golf/page.tsx', 'app/create/page.tsx']) {
    const src = read(f)
    const name = f.split('/').pop()
    ok(src.includes('<TripHeader backTo="/" />'),
      `${name} carries the mark, pointed home`)
    ok(!src.includes('<Wordmark'), `  …and does not draw a second one of its own`)
    ok(!/BackButton href="\/"/.test(src),
      `  …nor a home button, which the mark now is`)
  }

  // The wizard's own step-back is a different thing from site navigation and
  // stays: the mark goes home, this goes to the answers you just gave.
  const create = read('app/dashboard/create/CreateTripForm.tsx')
  const shell = stripComments(read('app/components/WizardShell.tsx'))
  ok(/<WizardShell[\s\S]{0,200}onBack=\{goBack\}/.test(create) && shell.includes('<BackButton onClick={onBack} />'),
    'the create wizard keeps a way back one step')
  ok(shell.includes('const first = step <= 1') && /inert=\{first\}[\s\S]{0,80}<BackButton onClick=\{onBack\}/.test(shell),
    'shown only where there is a step to go back to')

  // Every screen inside a trip points its mark at the trip hub, and nothing
  // points at a trip code that no longer travels as its own prop
  for (const f of [
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
  ]) {
    ok(/<TripHeader backTo=\{`\/trip\/\$\{[\w.]+\}`\}/.test(read(f)),
      `${f.split('/').slice(-2).join('/')} points its mark at the trip`)
  }
  eq(uiFiles().filter(f => /<TripHeader[^>]*tripCode=/.test(read(f))), [],
    'and no call site still passes a trip code')

  // The hub is the exception, because it IS the trip: pointing the mark here
  // made the one obvious tap on the screen do nothing. It goes to the start
  // of the site instead, and Home on the tab bar is what comes back here.
  // (Matched on the backTo alone: the hub's header also carries the
  // preferences gear in its action slot.)
  ok(/<TripHeader backTo="\/"/.test(read('app/trip/[tripCode]/page.tsx')),
    'the hub points its mark at the start of the site, not at itself')

  // A tap target with only a logo in it has to say where it goes
  ok(read('app/components/TripHeader.tsx').includes("'Back to the start'"),
    'and says so out loud for anyone who cannot see the mark')
}

section('The way back is a 48px arrow, sitting in its row')
{
  // It was a 44px bordered box, and in the create wizards that box was laid
  // absolutely over a step row about 34px tall — hanging out of it top and
  // bottom, into the progress bar and across the row's border, and under the
  // 48px touch target besides (docs/refresh-plan.md, 2.4).
  const code = stripComments(read('app/components/BackButton.tsx'))
  ok(/dense \? "h-11" : "h-12"/.test(code) && /dense \? "w-11" : "w-12"/.test(code),
    'the back button is 48px square')
  ok(!/\bborder\b|shadow|bg-/.test(code), '  …a bare arrow: no box, no border, no shadow')
  ok(/IconChevronLeft size=\{24\}/.test(code), '  …with a 24px chevron')

  // 44 is the floor for an icon button inside a row, and only the scoring
  // screens' header rows take it — their layout is frozen. Named here so a
  // new dense one is a decision, not a drift.
  const all: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.tsx$/.test(e.name)) all.push(p)
    }
  }
  walk('app')
  eq(all.filter(f => /<BackButton\b[^\n]*\bdense\b/.test(read(f))).sort(), [
    'app/scoring/LiveLeaderboardPanel.tsx',
    'app/scoring/LiveScoringFlow.tsx',
    'app/scoring/[slug]/CourseDashboardClient.tsx',
  ], '  …and only the scoring headers keep the 44px floor')

  // Nowhere is it laid over a row rather than placed in one
  eq(all.filter(f => /\babsolute\b[^"]*"[^>]*>\s*(?:\{[^}]*&&\s*\(?\s*)?<BackButton/.test(read(f))), [],
    'no back button is absolutely positioned over its row')

  // The wizards' step row: way back, step, and an empty cell to keep the
  // step centred — with the arrow's cell holding its width on step 1. It is
  // drawn once, by WizardShell, so this is one check rather than five.
  const shell = stripComments(read('app/components/WizardShell.tsx'))
  ok(/grid grid-cols-\[48px_1fr_48px\] min-h-14 items-center">\s*<div\b[\s\S]{0,240}<BackButton onClick=\{onBack\} \/>\s*<\/div>/
      .test(shell), 'the wizard frame puts the arrow in a 56px step row')
}

// ─── The wizards ───────────────────────────────────────────────

const WIZARDS = [
  'app/dashboard/create/CreateTripForm.tsx',
  'app/dashboard/create/CreateLeagueForm.tsx',
  'app/dashboard/create/CreateKnockoutForm.tsx',
  'app/dashboard/create/CreateRunForm.tsx',
  'app/trip/[tripCode]/organiser/bracket/BracketSetupForm.tsx',
]

section('Every wizard is one frame')
{
  // Five copies of the same header drifted five ways — the back button
  // hanging out of its row was one copy's bug, then everybody's
  // (docs/refresh-plan.md, 4.3). The frame is WizardShell's alone now.
  for (const f of WIZARDS) {
    const src = stripComments(read(f))
    const name = f.split('/').pop()
    ok(/<WizardShell\b/.test(src), `${name} wears WizardShell`)
    ok(!/Step \{stepNum\} of/.test(src) && !src.includes('grid-cols-[48px_1fr_48px]'),
      `  …and draws no step row of its own`)
    ok(!/\.map\(s =>\s*\(?\s*<div[^>]*h-1 flex-1/.test(src), `  …nor a progress bar`)
    // Each step opens on its question. The labels they replaced
    // ("Trip details", "Mode") named a screen rather than asking anything.
    ok(/const (EVENT_)?STEP_TITLES\b/.test(src) && !/STEP_LABELS/.test(src),
      `  …with a question for every step`)
  }

  type ShellProps = React.ComponentProps<typeof WizardShell>
  const render = (p: Partial<ShellProps>) => renderToStaticMarkup(
    React.createElement(WizardShell, {
      step: 1, titles: ['Name your trip', 'Plan the itinerary', 'Who’s playing'],
      onBack: () => {}, footer: React.createElement('button', null, 'Continue'),
      ...p,
    } as ShellProps, React.createElement('p', null, 'the step'))
  )
  const one = render({})
  const two = render({ step: 2, intro: 'Optional. Players can join later.' })

  eq((one.match(/h-1 flex-1 rounded-full/g) ?? []).length, 3, 'one progress segment a step')
  eq((two.match(/h-1 flex-1 rounded-full[^"]*bg-accent"/g) ?? []).length, 2,
    '  …filled up to the step you are on')
  ok(/<h1[^>]*class="t-h1[^"]*"[^>]*>Name your trip<\/h1>/.test(one),
    'the step opens on its question, as a page title')
  ok(/<h1[^>]*tabindex="-1"/.test(one) && /data-step-title/.test(one),
    '  …which can take the focus when the step arrives')
  ok(two.includes('Optional. Players can join later.'), '  …with its one line under it')
  ok(!/<p class="text-\[17px\][^"]*">/.test(one), '  …and nothing where a step has none')

  // On step 1 the arrow is held in place but hidden and out of reach, so
  // "Step 1 of 3" does not shift when it arrives.
  ok(/<div class="[^"]*opacity-0 pointer-events-none[^"]*" inert="" aria-hidden="true">/.test(one),
    'step 1 keeps the arrow’s place, hidden and inert')
  ok(!/inert=""/.test(two.split('Step ')[0]), '  …and step 2 can use it')
  ok(/Step (<!-- -->)?2(<!-- -->)? of (<!-- -->)?3/.test(two), 'the row says which step it is')

  // Sticky, not fixed: it rides above the keyboard instead of under it.
  ok(/class="sticky bottom-0 z-20 paper border-t border-line"/.test(one) && one.includes('Continue'),
    'the way forward is a bar stuck to the bottom')
  ok(one.includes('env(safe-area-inset-bottom)'), '  …clear of the home indicator')
  ok(!render({ footer: undefined }).includes('sticky bottom-0'),
    '  …and absent where a step pins its own')
}

section('A step slides')
{
  // Forward slides in from the right, back from the left, in the plan's
  // 340ms on the putt curve — and the component's timer is the same figure,
  // or the outgoing step would be dropped mid-slide or linger after it.
  for (const [cls, kf] of [
    ['step-in-forward', 'gdStepInRight'], ['step-out-forward', 'gdStepOutLeft'],
    ['step-in-back', 'gdStepInLeft'], ['step-out-back', 'gdStepOutRight'],
  ]) {
    ok(new RegExp(`\\.${cls}\\s*\\{\\s*animation: ${kf} ${STEP_SLIDE_MS}ms var\\(--gd-ease\\) both;`).test(css),
      `.${cls} runs ${kf} for ${STEP_SLIDE_MS}ms on the putt curve`)
  }
  eq(STEP_SLIDE_MS, 340, 'the slide is 340ms')
  ok(/@keyframes gdStepInRight\s*\{\s*from \{ transform: translateX\(100%\); \}/.test(css),
    'forward comes in from the right')
  ok(/@keyframes gdStepInLeft\s*\{\s*from \{ transform: translateX\(-30%\); opacity: 0; \}/.test(css),
    'back comes in from the left')

  // Reduce Motion: a short crossfade, no movement. Marked important, because
  // the catch-all that zeroes every animation would otherwise zero this too.
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n')
  ok(/\.step-in-forward, \.step-in-back \{ animation: gdFade 150ms ease-out both !important; \}/.test(reduced),
    'Reduce Motion brings a step in with a 150ms fade')
  ok(/\.step-out-forward, \.step-out-back \{ animation: gdFadeOut 150ms ease-out both !important; \}/.test(reduced),
    '  …and takes the old one out the same way')
  ok(!/gdStep(In|Out)(Left|Right)/.test(reduced), '  …with no slide left in it')

  // The outgoing step is a picture of the last one, not a second live form:
  // nothing in it may take a tap or the focus while it goes.
  const slider = stripComments(read('app/components/WizardShell.tsx'))
  ok(/\{leaving && \(\s*<div[\s\S]{0,80}\binert\b[\s\S]{0,40}aria-hidden="true"/.test(slider),
    'the step leaving is inert and hidden from screen readers')
  ok(/setTimeout\(\(\) => \{\s*setLeaving\(null\)\s*incoming\.current\?\.querySelector<HTMLElement>\('\[data-step-title\]'\)\?\.focus\(/.test(slider)
      && /ref=\{incoming\}/.test(slider)
      && /\}, STEP_SLIDE_MS\)/.test(slider),
    'when the slide ends the new question takes the focus — the incoming one, not the inert one leaving')
  ok(/window\.scrollTo\(\{ top: 0 \}\)/.test(slider), 'and a step is read from its top')
}

// ─── The bar at the bottom ─────────────────────────────────────

section('The tab bar is on every screen inside a trip')
{
  // The app should read as an app: the navigation is present everywhere,
  // score entry included. That screen was the exception once — the bottom of
  // it is the last row of a scorecard — and the room for the bar is now
  // reserved inside the card's own height so the Next button comes to rest
  // above it rather than beneath it.
  const tabbed = [
    'app/trip/[tripCode]/page.tsx',
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/scoring/page.tsx',
    'app/trip/[tripCode]/teams/page.tsx',
    'app/trip/[tripCode]/players/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
    'app/trip/[tripCode]/stats/page.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
    'app/trip/[tripCode]/settings/page.tsx',
  ]
  for (const f of tabbed) {
    const src = read(f)
    // The bar comes from the layout above these — see the note in the
    // navigation section. What each page still owes is the room for it.
    ok(!/<TabBar\s/.test(src),
      `${f.split('/').slice(-2).join('/')} leaves the bar to the layout`)
    ok(/has-tabbar/.test(src),
      `  …and leaves room for it, so the last thing on the page is reachable`)
  }

  // Which tab lights, on every route inside a trip.
  //
  // The scoring subtree was called `course` until the round summary needed
  // that word. The matcher is a prefix, so it is worth checking by hand that
  // it lights on both scoring screens and on nothing else — a tab lit on the
  // wrong page is the kind of thing nobody reports and everybody notices.
  {
    const base = '/trip/ABC123'
    const lit = (pathname: string) => {
      if (pathname === base || pathname === `${base}/`) return 'home'
      if (pathname.startsWith(`${base}/leaderboard`)) return 'leaderboard'
      if (pathname.startsWith(`${base}/scoring`)) return 'scoring'
      if (pathname.startsWith(`${base}/setup`) || pathname.startsWith(`${base}/teams`)) return 'settings'
      return null
    }
    // The matcher above is the one in TabBar. If that changes, this is stale.
    const matcher = read('app/components/TabBar.tsx')
    ok(matcher.includes('pathname.startsWith(`${base}/scoring`)'),
      'the bar matches the scoring subtree by prefix')

    eq(lit(`${base}/scoring`), 'scoring', 'the round picker lights Scoring')
    eq(lit(`${base}/scoring/2`), 'scoring', 'and so does a card open on a round')
    eq(lit(base), 'home', 'the hub lights Home, not Scoring')
    eq(lit(`${base}/leaderboard`), 'leaderboard', 'the leaderboard lights its own')
    eq(lit(`${base}/setup`), 'settings', 'and settings lights Settings')
    for (const other of ['/players', '/teams', '/matchplay']) {
      ok(lit(`${base}${other}`) !== 'scoring', `${other} does not light Scoring`)
    }
    // The legacy route at the root of the app shares a word and nothing else.
    ok(lit('/scoring/old-tom-morris') !== 'scoring',
      'and neither does the legacy /scoring route, which is not inside a trip')

    // A round summary is reached from the itinerary, not from the scoring
    // flow. Lighting Scoring on it would say the reader is somewhere they
    // are not — the card is one tap further on, behind a button.
    eq(lit(`${base}/round/2`), null, 'a round summary lights no tab at all')
    ok(lit(`${base}/round/2`) !== 'scoring', '  …and certainly not Scoring')
  }

  // Every destination the bar offers is one of the screens that carries it.
  const bar = read('app/components/TabBar.tsx')
  for (const leaf of ['leaderboard', 'scoring', 'setup']) {
    ok(bar.includes(`/${leaf}`), `the bar still offers ${leaf}`)
  }

  // Score entry is the one that has to reserve the room itself: its shell
  // sizes the card against the window, so padding added outside it would make
  // the page taller than the screen and pull the card up off the Next button.
  const scoring = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(!/<TabBar/.test(scoring), 'score entry leaves the bar to the layout too')
  ok(/bottomInset=\{TABBAR_SPACE\}/.test(scoring),
    '  …and reserves the room for it inside the card, not around it')

  const shell = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  ok(/paddingBottom: bottomInset/.test(shell),
    'the scoring shell leaves that room at the bottom of its own box')
  ok(/minHeight: `calc\(100dvh - \$\{stickyTop\}px\)`/.test(shell),
    'and still reaches exactly to the bottom of the window, no further')

  // One measurement, written once in TS and once in CSS because CSS cannot
  // import a constant. They have to agree.
  const metrics = read('app/components/tabbarMetrics.ts')
  ok(/TABBAR_H = 64/.test(metrics), 'the bar is 64px tall')
  ok(/64px/.test(css.slice(css.indexOf('.has-tabbar'), css.indexOf('.has-tabbar') + 120)),
    'and .has-tabbar reserves the same 64px')
}

section('A full-screen overlay covers the tab bar, never ties with it')
{
  // The bar is `z-40`. An overlay on the same rung does not sit above it or
  // below it by any rule worth relying on — document order breaks the tie,
  // and the bar is rendered last on every screen that has one, so the bar
  // wins and takes the bottom 64px of the overlay with it.
  //
  // The itinerary editor was `z-40`. What lived in that 64px was its
  // Continue button, so it could be read and not pressed, and the add sheets
  // went the same way: an overlay with a z-index starts a stacking context,
  // so their `z-50` was measured against the editor rather than against the
  // bar. "Add golf", "Add stay" and "Add journey" were all underneath it.
  const bar = read('app/components/TabBar.tsx')
  ok(/fixed bottom-0[^"]*z-40/.test(bar), 'the tab bar is on z-40')

  // No full-screen overlay anywhere may sit on that rung — scrims included.
  // A scrim tied with the bar leaves it bright and tappable behind a modal
  // that is meant to be blocking the screen.
  for (const f of [
    'app/trip/[tripCode]/setup/ItineraryEditor.tsx',
    'app/components/PlayerSettings.tsx',
  ]) {
    const src = read(f)
    const name = f.split('/').pop()
    ok(!/fixed inset-(?:0|x-0)[^"]*\bz-40\b/.test(src),
      `${name} puts nothing full-screen on the bar's rung`)
    ok(/fixed inset-(?:0|x-0)[^"]*\bz-50\b/.test(src),
      `  …what it does put there is z-50, above the bar`)
  }

  // The builder's own pinned footer stays below both. It is inside the
  // editor's stacking context, so its number is relative to that — raising
  // it would only put it over the editor's own header.
  const builder = read('app/components/ItineraryBuilder.tsx')
  ok(/fixed bottom-0[^"]*z-30/.test(builder),
    'the itinerary builder\'s footer stays on z-30, inside whatever contains it')
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

  for (const name of ['HEADER_H', 'HERO_SPACE', 'LINE_INSET']) {
    ok(new RegExp(`export const ${name}\\b`).test(metrics), `${name} is exported from it`)
  }

  // …and nothing re-exports them from the client component, which would put
  // the same trap back with a different import path
  const header = read('app/components/TripHeader.tsx')
  for (const name of ['HEADER_H', 'HERO_SPACE']) {
    ok(!new RegExp(`export const ${name}\\b`).test(header),
      `TripHeader does not re-export ${name}`)
  }

  // The pages that need a number take it from the right place
  ok(read('app/Landing.tsx').includes("from '@/app/components/headerMetrics'"),
    'the landing page reads HERO_SPACE from the metrics module')
}

// ─── Two sticky headers, one stack ─────────────────────────────

section('The scoring shell stacks under the site header, not behind it')
{
  // Both headers are sticky. TripHeader pins at the top of the window; the
  // scoring shell's own header has to pin below it, or — being the lower
  // z-index — it slides underneath and the course name vanishes the moment
  // the page is scrolled. This has now been got wrong twice, each time by
  // someone reaching for a constant, so what is pinned here is that nobody
  // reaches for one again.
  const shell = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  const page  = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')

  ok(page.includes('stickyTop={HEADER_H}'),
    'the trip round route tells the shell how much chrome is above it')
  ok(page.includes("from '@/app/components/headerMetrics'"),
    '  …reading the height from the metrics module, not retyping it')
  ok(/style=\{\{ top: stickyTop \}\}/.test(shell),
    'the shell sticks at that offset rather than at the top of the window')
  ok(!/sticky top-0/.test(shell),
    'and nothing in the shell is pinned to top-0')

  // The distance from the top of the window down to the bottom of the shell's
  // header is not a constant: the header grows a hole-progress row and a
  // leaderboard banner during score entry, and the trip route adds 52px of
  // site header above it that the legacy route does not have. So it is
  // measured and published, and everything below reads the published value.
  const metrics = read('app/scoring/scoringHeaderMetrics.ts')
  ok(/export const CHROME\b/.test(metrics), 'the chrome depth is a published CSS variable')
  ok(shell.includes('new ResizeObserver(measure)') && shell.includes('observer.observe('),
    'the shell measures its own header, and keeps measuring it')
  ok(shell.includes('setChrome(stickyTop + el.getBoundingClientRect().height)'),
    '  …counting the offset above it as well as its own height')
  ok(shell.includes('[CHROME_VAR]: `${chrome}px`'),
    '  …and publishes the total on its root')

  for (const file of ['app/scoring/LiveScoringFlow.tsx', 'app/scoring/LiveLeaderboardPanel.tsx']) {
    const src = read(file)
    const name = file.split('/').pop()
    ok(/import \{ CHROME \} from "\.\/scoringHeaderMetrics"/.test(src),
      `${name} reads the published depth`)
    // The two literals that were the bug both times: 52 was the site header
    // alone, 77 the shell's title row alone. Each was right on one screen.
    ok(!/top-\[\d+px\]|top: (52|77)\b/.test(src), `  …and pins nothing at a hardcoded offset`)
    // The spaced form is what a JS style object writes. (The unspaced
    // `calc(100dvh-57px)` inside Tailwind's arbitrary values is a separate
    // pre-existing wart on two centring wrappers, not a sticky offset.)
    ok(!/calc\(100dvh - \d+px\)/.test(src), `  …nor sizes anything against one`)
  }

  // The score-entry card reaches from the chrome down to the fixed Next bar,
  // which is what keeps the two reading as one unit instead of drifting
  // several hundred px apart on a one- or two-player card.
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  // Nothing inside the swipe track may be `position: fixed`. The track carries
  // `transform: translateX(...)` — always, `translateX(0)` when it is not
  // moving — and a transform makes an element the containing block for any
  // fixed descendant. The Next button was `fixed bottom-0` for exactly this
  // reason: it was not pinned to the window, it was pinned to the bottom of
  // the track, which is as tall as the taller of its two panels. On a
  // one-player card that put the button 118px below the fold, off the screen
  // entirely. Measured, not reasoned about: a harness that leaves the track
  // out reports the button sitting neatly at the bottom of the window.
  // Assert on code, not on the prose explaining it — the notes above these
  // lines name `fixed bottom-0` and `justify-end` in order to warn people off
  // them, and a check that reads the comments passes on the very thing it is
  // meant to forbid.
  const flowCode = stripComments(flow)
  ok(!/\bfixed bottom-0\b/.test(flowCode), 'nothing in the scoring flow is pinned with position: fixed')
  ok(/transform: showLeaderboard \? "translateX\(-50%\)" : "translateX\(0\)"/.test(flowCode),
    '  …and the swipe track is still the transformed ancestor that made it so')

  // The card runs top-down from the header with the button as its last row,
  // which is what "one connected unit" means once nothing is pinned.
  ok(/className="max-w-lg mx-auto w-full px-4 pt-4 pb-\[calc\(1rem\+env\(safe-area-inset-bottom,0px\)\)\] flex flex-col gap-4"/.test(flowCode),
    'the score-entry card flows from the top, safe-area inset kept')
  ok(!/justify-end/.test(flowCode), '  …not stretched and pushed to the bottom of the window')
  // Scoped to HoleCard's own body: the summary and edit screens further up
  // legitimately size themselves against the window, and matching the whole
  // file would read their `calc()` as this one.
  const holeCard = flowCode.slice(
    flowCode.indexOf('function HoleCard('),
    flowCode.indexOf('function LivePlayerTile('),
  )
  ok(holeCard.length > 500, '  (HoleCard\'s body was found to check)')
  ok(!/100dvh/.test(holeCard), '  …and not sized against the window height')
}

// ─── The page's name as artwork ────────────────────────────────

section('A page can name itself in the header')
{
  const src = read('app/components/TitleMark.tsx')
  const header = read('app/components/TripHeader.tsx')

  // Every mark is a file, exactly like the wordmark — never retyped in a
  // webfont, so replacing one needs no code change
  for (const name of ['leaderboard', 'settings', 'scoring', 'trip', 'stats-hub']) {
    ok(src.includes(`/title-${name}.png`), `${name}. is a file`)
    ok(fs.existsSync(`public/title-${name}.png`), `  …and the file is there`)
  }
  ok(src.includes('<img'), 'rendered as an image, not as type')

  // Every registered mark's ratio has to be the file's own, or the header
  // sizes by height and hands the width to a number that disagrees — the
  // word stretches or squashes and nothing else on the page shows it. The
  // stats mark shipped once as a lookalike face at a stand-in ratio, so
  // this is the check that a swapped file brought its measurement with it.
  const marks = [...src.matchAll(/src: '\/title-([a-z-]+)\.png',\s*ratio: ([\d.]+)/g)]
  ok(marks.length >= 5, 'every mark in the register carries a ratio')
  for (const [, name, ratio] of marks) {
    const png = fs.readFileSync(`public/title-${name}.png`)
    // PNG IHDR: width and height are the two big-endian uint32 at byte 16.
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20)
    const real = h / w
    ok(Math.abs(real - Number(ratio)) < 0.005,
      `title-${name} is declared ${ratio} and measures ${real.toFixed(4)}`)
  }

  // Same place, same height as the mark it stands in for. The header sizes
  // by height and lets each word's own width follow.
  ok(header.includes('<TitleMark name={title} height={lineH} />'),
    'set to the height the line mark settles at')
  ok(header.includes('style={{ left: lineOrigin[0], top: lineOrigin[1] }}'),
    'and to the place it settles in')

  // A word has no stacked form to collapse out of
  ok(header.includes("title === 'green-dot' ? (progress ?? 1) : 1"),
    'a named page never morphs, whatever it is handed')

  // Which page wears which
  const wears: [string, string][] = [
    ['app/trip/[tripCode]/leaderboard/page.tsx', 'leaderboard'],
    ['app/trip/[tripCode]/scoring/page.tsx', 'scoring'],
    ['app/trip/[tripCode]/scoring/[roundNumber]/page.tsx', 'scoring'],
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

/**
 * The landing page is a client component that reaches for the app router, so
 * a bare render throws "expected app router to be mounted". Rendering it
 * inside the context Next would give it is what lets the markup be checked
 * here at all — and the stub only has to exist, since nothing is navigated.
 */
const noop = () => {}
const stubRouter = {
  push: noop, replace: noop, refresh: noop, back: noop, forward: noop, prefetch: noop,
}
const home = renderToStaticMarkup(
  React.createElement(
    AppRouterContext.Provider,
    { value: stubRouter as never },
    React.createElement(Home),
  )
)

section('Landing page')
{
  // The mark is the header's now, and it is drawn from the artwork's own
  // paths rather than loaded as a file, so it is the ink that is checked.
  ok(home.includes('<svg'), 'the wordmark is the page')
  ok(/#4a3728/i.test(home), '  …in the artwork\'s own brown')
  ok(/#0a9d56/i.test(home), '  …closed by the emerald dot')
  ok(!home.includes('<h1'), 'and is not restated as a heading beneath itself')

  // One line underneath saying what the platform is. The enterprise is
  // Green Dot Live now: leaderboards for any event, golf first — so the
  // line stopped naming golf.
  ok(/Live scoring and leaderboards for your event/i.test(home),
    'one line says what the platform is for')

  // The event code goes straight in on the front page — no screen between a
  // person holding a code and typing it. /join survives for shared links.
  ok(home.includes('maxLength="6"'), 'the event code is typed straight into the page')
  ok(/Join Event/i.test(home), 'and joined from it')
  // Creating asks which sport first — golf's doorway and running's door
  // both sit behind /create, so a new sport is a card there, not a change here.
  ok(home.includes('/create'), 'creating goes through the sport chooser')
  ok(read('app/create/page.tsx').includes('href="/golf"') &&
     read('app/create/page.tsx').includes('/dashboard/create?type=run'),
    '  …which offers golf\'s doorway and running\'s door')
  ok(/Create an Event/i.test(home), 'named plainly')

  // One primary action: joining, which is the box directly above it.
  // Creating is secondary.
  // Counted as elements, not substrings: "hover:bg-accent-deep" contains
  // "bg-accent" and would double every button.
  // Either green counts: a solid emerald fill is a solid emerald fill
  const emeraldFills = [...home.matchAll(/class="([^"]*)"/g)]
    .filter(m => /(?:^| )bg-accent(-deep)?(?![-\w/])/.test(m[1]))
  eq(emeraldFills.length, 1, 'exactly one emerald button on the screen')

  ok(/class="[^"]*\bpaper\b/.test(home), 'on the cream page, grain and all')
  // A Schrödinger quotation was swept off this page with the rest of the old
  // branding, and this line guarded that. The copy review put one back on
  // purpose, so what is guarded now is the old *name* — the fact of a
  // quotation is no longer the thing that tells the two pages apart.
  ok(/both green and not green/i.test(home), 'the footnote is the green-dot line')
  ok(!home.includes('GripItGolf'), 'and the old name is gone')
}

// ─── The short link ────────────────────────────────────────────

section('A bare code is an address')
{
  // greendot.live/GX7K2P. A route rather than a config redirect, because a
  // config redirect runs before the filesystem and would swallow any future
  // six-letter page — "tennis" is exactly code-shaped.
  const short = read('app/[code]/page.tsx')
  ok(/\^\[A-Za-z0-9\]\{6\}\$/.test(short), 'only a code shape earns a lookup')
  ok(short.includes('code.toUpperCase()'), 'a typed lowercase code still finds its event')
  ok(short.includes('redirect(`/trip/${data.trip_code}`)'),
    'and lands on the hub, which stays the one canonical address')
  ok(short.includes('notFound()'), 'anything else is a plain 404')
  ok(/Event not found/.test(short), 'a code nobody owns gets the calm answer, not a 404')
}

// ─── Everywhere else ───────────────────────────────────────────

section('The old branding is gone')
{
  eq(SITE.name, 'Green Dot Live', 'the site config names the enterprise')

  const layout = read('app/layout.tsx')
  ok(layout.includes('green dot.'), 'the browser tab carries the wordmark')
  ok(layout.includes('#F6F4F0'), 'and the theme colour is cream')

  for (const f of ['app/page.tsx', 'app/layout.tsx', 'app/join/JoinForm.tsx']) {
    ok(!read(f).includes('GripItGolf'), `${f.split('/').pop()} does not mention the old name`)
  }

  // The tab icon. The Next.js starter's Vercel triangle sat in every tab from
  // the day the project was generated — the one piece of somebody else's
  // branding still shipping.
  ok(fs.existsSync('app/icon.svg'), 'there is a tab icon')

  const icon = read('app/icon.svg')
  ok(/<circle/.test(icon), 'it is the dot, which is the half of the mark that reads at 16px')
  // Tied to the palette rather than merely emerald-ish. An SVG cannot read a
  // CSS custom property, so this is the one file outside globals.css that has
  // to carry the hex — and this is what makes the two move together.
  const accent = css.match(/--gd-accent:\s*(#[0-9A-Fa-f]{6})/)?.[1] ?? ''
  ok(accent !== '' && icon.toUpperCase().includes(accent.toUpperCase()),
    `and it is the palette's own emerald (${accent})`)

  // /favicon.ico as well. Deleting the starter's triangle left that address a
  // 404 — and it is the address Chrome, bookmark bars and old crawlers ask at
  // by convention, so a client that never reads the <link> kept whatever it
  // had cached, which for early visitors was the triangle. The ICO is the
  // same dot, verified by its pixels: classic 32-bit ICO entries store BGRA,
  // so the palette emerald appears as the byte run 56 9D 0A.
  ok(fs.existsSync('app/favicon.ico'), 'favicon.ico answers instead of 404ing')
  const ico = fs.readFileSync('app/favicon.ico')
  ok(ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0,
    '  …as a real ICO')
  const accentBGR = Buffer.from(
    [accent.slice(5, 7), accent.slice(3, 5), accent.slice(1, 3)].map((h) => parseInt(h, 16)),
  )
  ok(accent !== '' && ico.includes(accentBGR),
    '  …drawn in the palette emerald, not the starter triangle')
  ok(!/rect|fill="#F6F4F0"/i.test(icon),
    'on nothing, so it does not show as a pale tile in dark browser chrome')
}

// ─── Who can edit ──────────────────────────────────────────────

section('The edit-permission toggle says what it did')
{
  // It changes what OTHER people can do, so from the owner's own phone —
  // which is the phone it is set from — nothing on screen moves, and it reads
  // as a control that does nothing at all.
  // It lives inside the trip-details sheet now, with the name and the dates:
  // it is a fact about the trip rather than about the golf. The block runs
  // from its own heading to the end of the sheet, which is nothing but
  // closing tags — the itinerary editor is the next thing rendered.
  const setup = read('app/trip/[tripCode]/setup/TripSetupClient.tsx')
  const section_ = setup.slice(setup.indexOf('{/* ── Who can edit ──'))
  const block = section_.slice(0, section_.indexOf('{itineraryOpen && ('))
  ok(block.length > 0 && block.length < section_.length,
    'the control sits inside the details sheet')

  ok(/editPermission === 'owner' \?/.test(block),
    'the screen states the effect of whichever setting is on')
  ok(/isOwner\s*$|isOwner$|isOwner/m.test(block),
    'and whether this device is the one that can act on it')
  ok(block.includes('Nothing changes for you'),
    'the owner is told outright why their own screen did not move')

  // Ownership is a flag on one device with no way to hand it over, so a
  // device that does not hold it must not be able to choose "owner only" —
  // that locks this screen, this control included, with no way back.
  ok(/wouldLockMeOut = o\.value === 'owner' && !isOwner/.test(block),
    'a device that is not the owner cannot lock itself out')
  ok(/disabled=\{locked \|\| wouldLockMeOut\}/.test(block),
    'and the option is genuinely disabled, not merely explained')

  // The copy no longer describes a phase the trip does not have
  ok(!/while it&apos;s in setup|while it's in setup/.test(block),
    'and does not describe a setup phase that no longer exists')
}

// ─── A trip is open from the moment it exists ──────────────────

section('Nothing has to be finalised before it can be played')
{
  // A trip used to sit in "draft" until Finalise & Go Live was pressed, and
  // draft meant Live Scoring and the Leaderboard were locked on the hub. The
  // button is gone, so the state it set has to go with it — leaving one
  // behind would have made every new trip permanently unable to score.
  const setup = stripComments(read('app/trip/[tripCode]/setup/TripSetupClient.tsx'))
  // "Go Live" rather than the whole label: the ampersand can be written as an
  // entity, and `finaliseBlockedReason` is legitimately imported into this
  // file, so neither "Finalise" nor the exact string is a reliable needle.
  ok(!/go\s*live/i.test(setup), 'settings has no finalise-and-go-live button')
  ok(!/isDraft/.test(setup), 'and nothing on that screen asks whether the trip is a draft')
  ok(!/setup_status/.test(setup), 'nor writes the flag it used to set')

  const hub = stripComments(read('app/trip/[tripCode]/page.tsx'))
  ok(!/isDraft/.test(hub), 'the hub does not ask either')
  ok(!hub.includes('Scoring opens when the trip is finalised'),
    'and never says scoring is waiting on something')
  // Nothing on the hub gates the scoring at all now — the button that used
  // to show a padlock when a trip had no rounds is gone, and the tab bar
  // links straight through on every screen. So the picker itself has to be
  // the one that says there is nothing to score, rather than throwing or
  // rendering an empty list under "Choose a round".
  const picker = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(/\(rounds \?\? \[\]\)\.length === 0\)? &&/.test(picker),
    'the round picker answers for a trip with no rounds')
  ok(picker.includes("No rounds set up for this ${event ? 'event' : 'trip'} yet"),
    '  …in words, which is the only lock left on scoring')
  ok(picker.includes("'No rounds yet — add the first one above.'"),
    '  …and a league, which grows from this screen, says where its first round comes from')

  const status = stripComments(read('lib/tripStatus.ts'))
  ok(!/setup_status/.test(status), 'a trip is placed by its dates alone')
  ok(!/'draft'/.test(status), 'with no state that outranks them')

  // The one thing that does still lock: a round's golf item, once that
  // round has scores. A course change would orphan real data, which no flag
  // was ever needed to know. Per round, not per trip — the rest of the golf
  // stays editable and new rounds can be added mid-trip.
  const page = stripComments(read('app/trip/[tripCode]/setup/page.tsx'))
  ok(/lockedRoundIds\.has\(r\.id\) && r\.itinerary_item_id/.test(page),
    'a round with scores locks its own golf item, and only its own')
}

// ─── The hole you are on ───────────────────────────────────────

section('The progress row shows a position, not a scale')
{
  const shell = read('app/scoring/[slug]/CourseDashboardClient.tsx')
  const row = shell.slice(shell.indexOf('{view === "scoring" && liveHole && ('))
  const progress = row.slice(0, row.indexOf('{/* Leaderboard / Scorecard banner'))

  ok(progress.includes('{allowanceButton}'),
    'the allowance sits on the line with the hole it applies to')
  ok(/flexGrow: isNow \? 1\.6 : 1/.test(progress),
    'the hole being played is wider than the seventeen that are not')
  ok(/minWidth: isNow \? 16 : 0/.test(progress),
    'and can never come out thinner than its neighbours')
  ok(!/flex-1 h-1/.test(progress),
    'the ticks are no longer equal shares of the row, which read as a scale')
  ok(/transition-all duration-300/.test(progress),
    'the change animates rather than jumping')

  // It leaves the title row, so a long course name gets the width back — and
  // the summary screen, which has no progress row, keeps it up there.
  ok(/view === "live-board" \|\| \(view === "scoring" && !liveHole\)/.test(shell),
    'the title row keeps the control only where there is no progress row to hold it')
}

// ─── A card, not a takeover ────────────────────────────────────

section('The scorecard opens as a card on the board, not over it')
{
  const board = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
  const sheet = board.slice(board.indexOf('export function ScorecardSheet'))

  ok(sheet.includes('${SC_CARD}'),
    'it wears the same clothes as the live leaderboard\'s card — white, hairline border, rounded')
  ok(!/fixed inset-0 z-50 flex flex-col justify-end/.test(sheet),
    'it is no longer a sheet pinned to the bottom edge of the screen')
  ok(/items-center justify-center/.test(sheet), 'it sits in the middle')
  ok(/max-w-lg/.test(sheet) && /p-4/.test(sheet),
    'inset on every side, so the board it came from is still visible around it')
  ok(!/max-h-\[9\d?vh\]/.test(sheet), 'and not sized to most of the window')
}

section('A screen names itself once')
{
  // The header already carries the page's name as artwork. A heading directly
  // under it saying the same thing spends the widest line on the screen
  // repeating the word above it.
  // Comments stripped: the note explaining why "Open →" went would match a
  // check looking for it.
  const picker = stripComments(read('app/trip/[tripCode]/scoring/page.tsx'))
  ok(/<TripHeader[^>]*title="scoring"/.test(picker), 'the round picker is named in the header')
  ok(!/Live scoring<\/h1>/.test(picker), 'and does not say it again underneath')

  // The whole tile is the link, so labelling it "Open" told the reader
  // something they already knew, in the width a long course name needs.
  ok(!picker.includes('Open →'), 'a round tile does not label itself Open')
  ok(picker.includes('dot-live'), 'though a live round still wears its dot')

  // The leaderboard is the one page that is all table, and a band across the
  // top carrying the trip's own name cost it a fixed slice of every screen —
  // to say something you knew, on the screen you reached it from.
  const board = stripComments(read('app/trip/[tripCode]/leaderboard/page.tsx'))
  ok(!board.includes('{trip.name}'), 'the leaderboard does not band the trip name across the top')
  ok(/<TripHeader[^>]*title="leaderboard"/.test(board), 'the header names it instead')
}

// ─── Pinned headers ────────────────────────────────────────────
//
// Two ways a pinned row goes wrong, both of which have shipped:
//
//   · it is transparent, and the content it is meant to hold still for scrolls
//     visibly through it
//   · something above it quietly becomes a scrollport, and it measures its
//     offset from that instead of from the window — landing halfway down the
//     list it is supposed to head
//
// Neither shows up in a typecheck and neither is visible until a page is long
// enough to scroll, which is why they are pinned here.

section('A pinned header holds still, and holds its own background')
{
  // `overflow-x: hidden` does NOT leave the other axis visible: the spec
  // computes `overflow-y: visible` to `auto` beside it, making the element a
  // scrollport. Any sticky descendant then measures against that box. `clip`
  // cuts the overflow without establishing one.
  const scoringFlow = stripComments(read('app/scoring/LiveScoringFlow.tsx'))
  ok(!scoringFlow.includes('overflow-x-hidden'),
    'the swipe track clips its sideways overflow rather than hiding it — ' +
    'hiding it makes the box a scrollport and unmoors every sticky heading below')
  ok(scoringFlow.includes('overflow-x-clip'), 'and it does still clip it')

  // The scorecard bands are a 5% tint. A tint pinned over moving content shows
  // all of it, so the box doing the pinning carries the card's own white.
  const style = read('app/components/scorecardStyle.ts')
  ok(style.includes('SC_STICKY'), 'the opaque backing for a pinned band is named once')
  const stickyBands = scoringFlow.match(/sticky[^"'`]*\$\{SC_STICKY\}/)
  ok(stickyBands !== null,
    'and the end-of-round card pins its details strip and column headings on it')

  // Every other sticky box in the platform names its own background rather
  // than inheriting whatever happens to be behind it.
  for (const f of uiFiles()) {
    const src = stripComments(read(f))
    for (const m of src.matchAll(/className=[{`"']([^`"']*\bsticky\b[^`"']*)[`"']/g)) {
      const cls = m[1]
      // `bottom-` bars float over content on purpose and are styled inline.
      if (/\bbottom-/.test(cls) || /\bz-30\b/.test(cls)) continue
      ok(/\bbg-|\bpaper\b/.test(cls) || /\$\{SC_STICKY\}/.test(cls),
        `${f.split('/').pop()}: a sticky row names its own background`)
    }
  }
}

// ─── The style lab ─────────────────────────────────────────────

section('The style lab is fenced in')
{
  // /admin/style tries other fonts and looks on one phone (lib/styleLab.ts).
  // Everything it can change lives in app/style-lab.css, behind attributes
  // that only a lab phone carries — so the house look, the font checks above
  // and the landing page's static-ness cannot be touched by it.
  const lab = read('app/style-lab.css')
  const labCode = lab.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [...labCode.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim())
  ok(rules.length > 10, `the lab stylesheet has its rules (${rules.length})`)
  eq(rules.filter(sel => !(sel === '@font-face' || sel.split(/,(?![^(]*\))/).every(p => /^html(\.dark)?\[data-/.test(p.trim())))), [],
    'every rule is a @font-face or starts html[data- / html.dark[data-')

  for (const attr of ['data-title-font', 'data-text-font', 'data-score-font', 'data-depth', 'data-corners', 'data-grain']) {
    ok(!css.includes(attr), `globals.css knows nothing of ${attr}`)
  }
  ok(!/Lab |style-lab/.test(css), '  …nor of a lab face or the lab file')

  // The cookie is read in the browser, never beside cookies().
  const SOURCES = ['app', 'lib']
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) files.push(p)
    }
  }
  SOURCES.forEach(walk)
  const naming = files.filter(f => /gg_style|STYLE_COOKIE/.test(read(f)))
  eq(naming.filter(f => !(f === 'lib/styleLab.ts' || f === 'lib/theme.ts' ||
                           read(f).trimStart().startsWith("'use client'"))), [],
    'the lab cookie is named only in lib/styleLab.ts, lib/theme.ts and client components')
  eq(naming.filter(f => /cookies\(\)/.test(stripComments(read(f)))), [], '  …never next to cookies()')
  ok(!/next\/headers/.test(read('lib/styleLab.ts')), '  …and the registry imports nothing from the server')

  const layout = read('app/layout.tsx')
  const g = layout.indexOf('import "./globals.css"'), l = layout.indexOf('import "./style-lab.css"')
  ok(g >= 0 && l > g, 'style-lab.css is imported after globals.css, so its rules win ties')
  const loaded = [...stripComments(layout).matchAll(/import\s*\{([^}]*)\}\s*from\s*["']next\/font\/google["']/g)]
    .flatMap(m => m[1].split(',').map(n => n.trim()).filter(Boolean))
  eq(loaded.sort(), ['Archivo', 'Schibsted_Grotesk'],
    'next/font still loads the two house faces and nothing else, so no lab face is preloaded for every player')
  ok(!/next\/font\/local/.test(layout), '  …locally either')
  ok(layout.includes('STYLE_BOOT_SCRIPT'), 'the lab setup is applied by the head script, before first paint')
  // Two IIFEs joined bare read as `(…)()(…)()` — the second calls the first's
  // undefined result and throws, so the lab never reached a reloaded page.
  ok(layout.includes('`${THEME_BOOT_SCRIPT};${STYLE_BOOT_SCRIPT}`'),
    '  …joined to the theme script with a semicolon, or it never runs')

  const preview = read('app/style-preview/page.tsx')
  ok(!/searchParams/.test(stripComments(preview)), '/style-preview takes no searchParams')
  ok(!preview.includes('force-dynamic'), '  …and is not forced dynamic')
  ok(read('app/style-preview/StylePreview.tsx').includes('window.location.search'),
    '  …it reads the link on the client instead')

  // The pill rides in the header's own slot, absolutely placed, so the bar
  // keeps its height and nothing below it moves.
  const header = read('app/components/TripHeader.tsx')
  ok(header.includes('<LabIndicator />'), 'the "Lab" pill is inside TripHeader')
  ok(/className="absolute flex items-center[^"]*"[\s\S]{0,300}<LabIndicator \/>/.test(header),
    '  …in the absolutely placed action slot, not the flow')
  ok(/style=\{\{\s*height: HEADER_H,/.test(header), '  …and the header is still HEADER_H tall')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
