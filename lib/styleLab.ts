// The style lab: other fonts and looks, tried on one phone, never shown to
// anyone else. The page is /admin/style; this file is the only copy of what
// it can change.
//
// Six axes — the title, text and score fonts, depth, corners and the paper's
// grain — each a `data-*` attribute on <html> that app/style-lab.css answers.
// "House" is today's look, and **house is the absence of the attribute**:
// choosing a house option removes it rather than setting it, so a phone that
// has never seen the lab and a phone that reset it are byte for byte the
// same document. Colour is deliberately not an axis — every combination
// would need its own contrast check in both themes.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ PERSONALISES THIS DEVICE, never the site. Nothing here is stored on │
// │ the server, and the cookie is never read there: cookies() in a      │
// │ layout would make every route dynamic and break the landing page's  │
// │ prefetch (test:branding pins it). The head script reads it instead. │
// └─────────────────────────────────────────────────────────────────────┘
//
// Lab fonts are plain @font-face in app/style-lab.css, generated from this
// registry by `npm run fonts:lab` — never next/font, which would preload
// every one of them on every page for every player. A @font-face file is
// downloaded only by a phone that actually draws text in it.
//
// The pure parts are up top so they can be tested; the browser-only parts are
// at the bottom, the same split as lib/theme.ts.

import { buildCookie } from './playerCookie'

/** One cookie for the whole site, this device's lab setup. */
export const STYLE_COOKIE = 'gg_style'

/** A year, the same as the theme. */
export const STYLE_COOKIE_DAYS = 365

/** Where the font files live, one folder per family, licence beside them. */
export const LAB_FONT_DIR = '/fonts/lab'

export type Licence = 'OFL' | 'Apache' | 'ITF-FFL'

/**
 * A family the lab ships files for. One entry per family, however many axes
 * offer it — Instrument Sans is a title option and a text option off the one
 * file, so its @font-face is written once.
 */
export type LabFamily = {
  /** The folder under public/fonts/lab/, and the key options refer to. */
  id: string
  /** The @font-face family. Prefixed `Lab ` so nothing collides with a house face. */
  family: string
  files: { path: string; weight: string; style: 'normal' | 'italic' }[]
  licence: Licence
  /** Where the files came from. */
  source: string
}

export const LAB_FAMILIES: readonly LabFamily[] = [
  {
    id: 'bricolage', family: 'Lab Bricolage Grotesque',
    files: [{ path: 'bricolage/bricolage-grotesque-latin-wght-normal.woff2', weight: '200 800', style: 'normal' }],
    licence: 'OFL', source: 'https://www.npmjs.com/package/@fontsource-variable/bricolage-grotesque',
  },
  {
    id: 'instrument', family: 'Lab Instrument Sans',
    files: [{ path: 'instrument/instrument-sans-latin-wght-normal.woff2', weight: '400 700', style: 'normal' }],
    licence: 'OFL', source: 'https://www.npmjs.com/package/@fontsource-variable/instrument-sans',
  },
  {
    id: 'gabarito', family: 'Lab Gabarito',
    files: [{ path: 'gabarito/gabarito-latin-wght-normal.woff2', weight: '400 900', style: 'normal' }],
    licence: 'OFL', source: 'https://www.npmjs.com/package/@fontsource-variable/gabarito',
  },
  {
    // The house title face is 700 only through next/font, so as a text face
    // it needs its own files for 400–600.
    id: 'schibsted', family: 'Lab Schibsted Grotesk',
    files: [{ path: 'schibsted/schibsted-grotesk-latin-wght-normal.woff2', weight: '400 900', style: 'normal' }],
    licence: 'OFL', source: 'https://www.npmjs.com/package/@fontsource-variable/schibsted-grotesk',
  },
  {
    id: 'newsreader', family: 'Lab Newsreader',
    files: [{ path: 'newsreader/newsreader-latin-wght-normal.woff2', weight: '200 800', style: 'normal' }],
    licence: 'OFL', source: 'https://www.npmjs.com/package/@fontsource-variable/newsreader',
  },
]

export type FontRole = 'title' | 'text' | 'score'

/** One choice on a font axis. */
export type FontOption = {
  id: string
  name: string
  role: FontRole
  /** A lab family's id, or absent for a face the site already loads. */
  family?: string
  /**
   * The family as CSS names it, first in the stack. For a lab face its
   * quoted family; for a house face the variable or name the site uses.
   */
  face: string
  fallback: 'sans' | 'serif'
  /** What titles use, if not 700. Titles only. */
  weight?: number
  /** A @font-face size-adjust, for a face that sets visibly larger or smaller. */
  sizeAdjust?: string
}

export type PlainOption = { id: string; name: string }

export type AxisKey = 'title' | 'text' | 'score' | 'depth' | 'corners' | 'grain'

type FontAxis = { key: 'title' | 'text' | 'score'; label: string; attr: string; house: string; options: readonly FontOption[] }
type PlainAxis = { key: 'depth' | 'corners' | 'grain'; label: string; attr: string; house: string; options: readonly PlainOption[] }
export type Axis = FontAxis | PlainAxis

/** The six axes, house option first in each. Order is the page's order. */
export const AXES: readonly Axis[] = [
  {
    key: 'title', label: 'Title font', attr: 'data-title-font', house: 'schibsted',
    options: [
      { id: 'schibsted', name: 'Schibsted Grotesk', role: 'title', face: 'var(--font-schibsted)', fallback: 'sans' },
      { id: 'bricolage', name: 'Bricolage Grotesque', role: 'title', family: 'bricolage', face: "'Lab Bricolage Grotesque'", fallback: 'sans', weight: 600 },
      { id: 'instrument', name: 'Instrument Sans', role: 'title', family: 'instrument', face: "'Lab Instrument Sans'", fallback: 'sans', weight: 600 },
      { id: 'gabarito', name: 'Gabarito', role: 'title', family: 'gabarito', face: "'Lab Gabarito'", fallback: 'sans' },
    ],
  },
  {
    key: 'text', label: 'Text font', attr: 'data-text-font', house: 'archivo',
    options: [
      { id: 'archivo', name: 'Archivo', role: 'text', face: 'var(--font-archivo)', fallback: 'sans' },
      { id: 'instrument', name: 'Instrument Sans', role: 'text', family: 'instrument', face: "'Lab Instrument Sans'", fallback: 'sans' },
      { id: 'schibsted', name: 'Schibsted Grotesk', role: 'text', family: 'schibsted', face: "'Lab Schibsted Grotesk'", fallback: 'sans' },
    ],
  },
  {
    key: 'score', label: 'Score font', attr: 'data-score-font', house: 'bespoke',
    options: [
      { id: 'bespoke', name: 'Bespoke Serif', role: 'score', face: "'Bespoke Serif'", fallback: 'serif' },
      { id: 'newsreader', name: 'Newsreader', role: 'score', family: 'newsreader', face: "'Lab Newsreader'", fallback: 'serif' },
      // Already on every page through next/font — no files of its own.
      { id: 'archivo', name: 'Archivo', role: 'score', face: 'var(--font-archivo)', fallback: 'sans' },
    ],
  },
  {
    key: 'depth', label: 'Depth', attr: 'data-depth', house: 'raised',
    options: [{ id: 'raised', name: 'Raised' }, { id: 'flat', name: 'Flat' }, { id: 'deep', name: 'Deep' }],
  },
  {
    key: 'corners', label: 'Corners', attr: 'data-corners', house: 'soft',
    options: [{ id: 'soft', name: 'Soft' }, { id: 'sharp', name: 'Sharp' }, { id: 'round', name: 'Round' }],
  },
  {
    key: 'grain', label: 'Paper grain', attr: 'data-grain', house: 'on',
    options: [{ id: 'on', name: 'On' }, { id: 'off', name: 'Off' }],
  },
]

export type Setup = Record<AxisKey, string>

export const HOUSE_SETUP: Setup = Object.fromEntries(AXES.map(a => [a.key, a.house])) as Setup

/** The stack an option's face sits at the head of. */
export function fontStack(o: FontOption): string {
  return o.fallback === 'serif'
    ? `${o.face}, Georgia, 'Times New Roman', serif`
    : `${o.face}, ui-sans-serif, system-ui, sans-serif`
}

/**
 * A setup string → a setup. Whole and fail-soft, never null: an unknown axis
 * is ignored and an unknown or missing id is house, so a stale cookie or a
 * mistyped link degrades to today's look rather than to nothing.
 */
export function parseSetup(raw: string | null | undefined): Setup {
  const out: Setup = { ...HOUSE_SETUP }
  if (!raw) return out
  for (const part of raw.trim().split(/[\s&,;]+/)) {
    const [k, v] = part.split('=')
    const axis = AXES.find(a => a.key === k)
    if (axis && axis.options.some(o => o.id === v)) out[axis.key] = v
  }
  return out
}

/** A setup → `title=… text=… score=… depth=… corners=… grain=…`, every axis. */
export function serialiseSetup(setup: Setup): string {
  return AXES.map(a => `${a.key}=${setup[a.key]}`).join(' ')
}

/** How many axes are off house — what the header pill counts. */
export function labCount(setup: Setup): number {
  return AXES.filter(a => setup[a.key] !== a.house).length
}

export function isHouse(setup: Setup): boolean {
  return labCount(setup) === 0
}

/** The attributes a setup puts on <html>; a house axis is absent. */
export function setupAttributes(setup: Setup): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of AXES) if (setup[a.key] !== a.house) out[a.attr] = setup[a.key]
  return out
}

/** The preview link that shows a look to the group, a phone at a time. */
export function previewLink(setup: Setup | 'reset'): string {
  const s = setup === 'reset' ? 'reset' : serialiseSetup(setup)
  return `https://greendot.live/style-preview?s=${encodeURIComponent(s)}`
}

/**
 * Runs inline in <head>, beside THEME_BOOT_SCRIPT, before first paint.
 *
 * Registry-free on purpose — it carries only the six attribute names and
 * their house values, not the options. A value it does not recognise is put
 * on <html> anyway and simply matches no rule in style-lab.css, so the house
 * look shows; a house value is skipped, so "no attributes means house" holds
 * from the first paint. Values must be lowercase words; anything else is
 * ignored rather than written onto the document.
 */
export const STYLE_BOOT_SCRIPT =
  `(function(){try{` +
  `var m=document.cookie.match(/(?:^|;\\s*)${STYLE_COOKIE}=([^;]*)/);if(!m)return;` +
  `var a=${JSON.stringify(Object.fromEntries(AXES.map(x => [x.key, [x.attr, x.house]])))};` +
  `var p=decodeURIComponent(m[1]).split(' ');` +
  `for(var i=0;i<p.length;i++){var kv=p[i].split('='),x=a[kv[0]];` +
  `if(x&&/^[a-z0-9-]+$/.test(kv[1]||'')&&kv[1]!==x[1])document.documentElement.setAttribute(x[0],kv[1])}` +
  `}catch(e){}})()`

// ─── The stylesheet ────────────────────────────────────────────

/** Radii per corners option, in px. Soft is house and so has no rule. */
export const CORNER_RADII: Record<'sharp' | 'round', Record<string, number>> = {
  sharp: { card: 10, button: 8, field: 8, tile: 6, xl: 8, '2xl': 10 },
  round: { card: 28, button: 24, field: 22, tile: 16, xl: 18, '2xl': 24 },
}

const DEEP_LIGHT = '0 2px 6px rgba(74,55,40,.10), 0 24px 44px -18px rgba(74,55,40,.42)'
const DEEP_DARK = 'inset 0 1px 0 rgba(242,235,226,.07), 0 26px 50px -16px rgba(0,0,0,.85)'

/**
 * app/style-lab.css, whole. `npm run fonts:lab` writes it and
 * `-- --check` fails when it is out of date, so the file and this registry
 * cannot drift. Every rule is a @font-face or starts `html[data-` /
 * `html.dark[data-`, which test:branding holds.
 *
 * Specificity: house values sit on :root (0,1,0) and html.dark (0,1,1). Lab
 * rules are html[data-…] (0,1,1) and html.dark[data-…] (0,2,1), unlayered,
 * and the file is imported after globals.css — so a lab rule wins every tie.
 */
export function labStylesheet(): string {
  const out: string[] = [
    '/* Generated by `npm run fonts:lab` from lib/styleLab.ts — do not edit by hand.',
    '   The style lab: /admin/style, this phone only. No attribute on <html>',
    '   means none of this applies, and the house look is untouched. */',
    '',
  ]

  for (const fam of LAB_FAMILIES) {
    const sizeAdjust = AXES.flatMap(a => a.options as readonly (FontOption | PlainOption)[])
      .find((o): o is FontOption => 'family' in o && o.family === fam.id && !!o.sizeAdjust)?.sizeAdjust
    for (const f of fam.files) {
      out.push(
        `@font-face { font-family: '${fam.family}'; src: url('${LAB_FONT_DIR}/${f.path}') format('woff2'); ` +
        `font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap;` +
        (sizeAdjust ? ` size-adjust: ${sizeAdjust};` : '') + ' }',
      )
    }
  }
  out.push('')

  const vars: Record<'title' | 'text' | 'score', string> = {
    title: '--font-display', text: '--font-ui', score: '--font-serif',
  }
  for (const axis of AXES) {
    if (axis.key !== 'title' && axis.key !== 'text' && axis.key !== 'score') continue
    for (const o of axis.options as readonly FontOption[]) {
      if (o.id === axis.house) continue
      const sel = `html[${axis.attr}="${o.id}"]`
      out.push(`${sel} { ${vars[axis.key]}: ${fontStack(o)}; }`)
      if (axis.key === 'title' && o.weight && o.weight !== 700) {
        out.push(`${sel} :is(.t-h1, .t-h2, .t-card) { font-weight: ${o.weight}; }`)
      }
    }
  }
  out.push('')

  // A transparent zero rather than `none`: Tailwind sets a shadow utility as
  // one item in a comma list, and `none` inside a list is invalid.
  out.push('html[data-depth="flat"], html.dark[data-depth="flat"] { --gd-shadow-raised: 0 0 #0000; --gd-shadow-cta: 0 0 #0000; }')
  out.push(`html[data-depth="deep"] { --gd-shadow-raised: ${DEEP_LIGHT}; }`)
  out.push(`html.dark[data-depth="deep"] { --gd-shadow-raised: ${DEEP_DARK}; }`)
  out.push('')

  for (const [id, r] of Object.entries(CORNER_RADII)) {
    const decls = Object.entries(r).map(([k, px]) => `--radius-${k}: ${px}px;`).join(' ')
    out.push(`html[data-corners="${id}"] { ${decls} }`)
  }
  // A field's radius is a literal in globals.css (the parts-kit test pins
  // 14px there), so it would not follow the tokens on its own.
  out.push('html[data-corners] .field { border-radius: var(--radius-field); }')
  out.push('html[data-corners] .field.field-dense { border-radius: var(--radius-tile); }')
  out.push('')

  out.push('html[data-grain="off"], html[data-grain="off"] body { background-image: none; }')
  // `paper` stands in for the page on wrappers, sticky bars and sheets.
  out.push('html[data-grain="off"] .paper { background-image: none; }')
  out.push('')
  return out.join('\n')
}

// ─── Browser only ──────────────────────────────────────────────

/** The setup this document is wearing, read off <html>'s attributes. */
export function currentSetup(): Setup {
  const out: Setup = { ...HOUSE_SETUP }
  if (typeof document === 'undefined') return out
  const el = document.documentElement
  for (const a of AXES) {
    const v = el.getAttribute(a.attr)
    if (v && a.options.some(o => o.id === v)) out[a.key] = v
  }
  return out
}

/** Put a setup on <html> now: set what is off house, remove what is house. */
export function applySetup(setup: Setup): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const attrs = setupAttributes(setup)
  for (const a of AXES) {
    if (attrs[a.attr]) el.setAttribute(a.attr, attrs[a.attr])
    else el.removeAttribute(a.attr)
  }
}

const isHttps = () => typeof location !== 'undefined' && location.protocol === 'https:'

/** Remember a setup on this device; a house setup clears the cookie instead. */
export function rememberSetup(setup: Setup): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = isHouse(setup)
      ? buildCookie(STYLE_COOKIE, '', { days: 0, https: isHttps() })
      : buildCookie(STYLE_COOKIE, serialiseSetup(setup), { days: STYLE_COOKIE_DAYS, https: isHttps() })
  } catch {
    // Cookies blocked. The attributes still hold for this page view.
  }
}

/** Back to the house style: no cookie, no attributes. */
export function resetSetup(): void {
  applySetup(HOUSE_SETUP)
  rememberSetup(HOUSE_SETUP)
}

/** The lab attributes, for anyone observing <html>. */
export const LAB_ATTRIBUTES = AXES.map(a => a.attr)
const FONT_ATTRIBUTES = AXES.filter(a => a.key === 'title' || a.key === 'text' || a.key === 'score').map(a => a.attr)

/**
 * Call `measure` whenever text may have changed width without any box
 * resizing: once the fonts settle, when a lab font attribute changes, and
 * again when the face that change asked for has finished loading. For code
 * that measures text — a ResizeObserver cannot see a font swap inside a box
 * of fixed size. Returns the cleanup.
 */
export function watchFontChanges(measure: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  let live = true
  const run = () => { if (live) measure() }
  document.fonts?.ready.then(run).catch(() => {})
  const onLoaded = () => run()
  document.fonts?.addEventListener?.('loadingdone', onLoaded)
  let mo: MutationObserver | null = null
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => {
      run()
      requestAnimationFrame(() => document.fonts?.ready.then(run).catch(() => {}))
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: FONT_ATTRIBUTES })
  }
  return () => {
    live = false
    mo?.disconnect()
    document.fonts?.removeEventListener?.('loadingdone', onLoaded)
  }
}
