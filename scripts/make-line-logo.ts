/**
 * Derive the single-line wordmark from the stacked one.
 *
 * Run with: npm run logo:line
 *
 * The supplied artwork is the stacked mark — green / dot / golf over three
 * lines, with the emerald dot. The header needs the same mark on one line,
 * and no separate file was supplied for it.
 *
 * Rather than draw a new one (the style guide forbids recreating the mark),
 * this reuses the very same paths. The exported SVG happens to place each
 * word in its own `<g transform="translate(x, y)">`, so putting "green" and
 * "dot" on a shared baseline is arithmetic on those transforms — every curve
 * is the original.
 *
 * "golf" is dropped, and the emerald dot follows the shortened wordmark, so
 * the result reads "green dot." exactly as the supplied line version does.
 *
 * Re-run this whenever public/logo.svg is replaced.
 */

import fs from 'fs'

const SRC = 'public/logo.svg'
const OUT = 'public/logo-line.svg'
const MORPH_OUT = 'app/components/wordmarkMorph.ts'

type Glyph = {
  x: number; y: number; start: number; end: number; emerald: boolean
  /** Real ink bounds, in the same coordinate space as x/y. */
  left: number; right: number; top: number; bottom: number
  /**
   * Vertical ink bounds relative to the glyph's own baseline.
   *
   * Kept separate because every glyph is about to be moved onto a shared
   * baseline, and cropping to `top`/`bottom` — which are relative to where
   * each glyph *was* — clipped the ascenders off the d and the t.
   */
  relTop: number; relBottom: number
}

/**
 * The ink bounds of one glyph.
 *
 * Path data in this export is absolute and relative to the glyph's own
 * translate, so every coordinate pair in it can be read directly. Curve
 * control points can sit outside the drawn shape, which makes this a slight
 * over-estimate — the right way round for cropping, since it can only ever
 * leave a hair too much room rather than clip a letter.
 */
function inkBounds(body: string): { left: number; right: number; top: number; bottom: number } {
  const d = [...body.matchAll(/ d="([^"]+)"/g)].map(m => m[1]).join(' ')
  const nums = d.match(/-?\d*\.?\d+/g)?.map(Number) ?? []
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1]
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }
  return { left, right, top, bottom }
}

const src = fs.readFileSync(SRC, 'utf-8')

// Each glyph is a <g transform="translate(x, y)"> holding one path. The fill
// is set by the enclosing group, so the colour is read from whichever <g fill>
// most recently opened before it.
const glyphs: Glyph[] = []
const re = /<g fill="(#[0-9a-f]{6})" fill-opacity="1"><g transform="translate\(([-\d.]+), ?([-\d.]+)\)">/gi
let m: RegExpExecArray | null
while ((m = re.exec(src)) !== null) {
  const close = src.indexOf('</g></g></g>', m.index)
  if (close === -1) continue
  const end = close + '</g></g></g>'.length
  const x = parseFloat(m[2])
  const y = parseFloat(m[3])
  const b = inkBounds(src.slice(m.index, end))
  glyphs.push({
    x, y, start: m.index, end,
    emerald: m[1].toLowerCase() === '#0a9d56',
    left: x + b.left, right: x + b.right, top: y + b.top, bottom: y + b.bottom,
    relTop: b.top, relBottom: b.bottom,
  })
}

if (glyphs.length === 0) {
  console.error('✖  No glyph groups found in', SRC)
  console.error('   The artwork was probably exported differently. Place a')
  console.error('   single-line version at', OUT, 'by hand instead.')
  process.exit(1)
}

// Group by baseline: one per line of the stacked mark, plus the dot.
const baselines = [...new Set(glyphs.map(g => Math.round(g.y)))].sort((a, b) => a - b)
const lineOf = (g: Glyph) => baselines.indexOf(Math.round(g.y))

const green = glyphs.filter(g => lineOf(g) === 0 && !g.emerald)
const dot   = glyphs.filter(g => lineOf(g) === 1 && !g.emerald)
const golf  = glyphs.filter(g => lineOf(g) === 2 && !g.emerald)
const mark  = glyphs.filter(g => g.emerald)

if (!green.length || !dot.length || !mark.length) {
  console.error('✖  Expected three lines and an emerald dot, found:',
    baselines.length, 'baselines,', mark.length, 'emerald glyphs')
  process.exit(1)
}

// Put everything on "green"'s baseline, spaced off the real ink rather than
// off the transforms. Measuring where the "n" actually ends is what puts a
// space between the words; measuring where its transform sits does not, and
// the first attempt at this read "greendot".
const baseY = green[0].y

/** The gap the artwork itself uses between letters, as a unit of measure. */
const letterGaps = green
  .slice(1)
  .map((g, i) => g.left - green[i].right)
  .filter(v => Number.isFinite(v))
const letterGap = letterGaps.length
  ? letterGaps.reduce((a, b) => a + b, 0) / letterGaps.length
  : 20

const capHeight = Math.max(...green.map(g => g.bottom)) - Math.min(...green.map(g => g.top))

// A word space is wider than a letter gap. A third of the cap height is the
// long-standing typographic default and matches the supplied line version.
const wordSpace = capHeight * 0.33

const inkRight = (gs: Glyph[]) => Math.max(...gs.map(g => g.right))
const inkLeft  = (gs: Glyph[]) => Math.min(...gs.map(g => g.left))

const dotShift  = (inkRight(green) + wordSpace) - inkLeft(dot)
const markShift = (inkRight(dot) + dotShift + wordSpace * 0.72) - inkLeft(mark)

const moved: { g: Glyph; dx: number }[] = [
  ...green.map(g => ({ g, dx: 0 })),
  ...dot.map(g => ({ g, dx: dotShift })),
  ...mark.map(g => ({ g, dx: markShift })),
]

/** Re-emit a glyph at a new position, its path untouched. */
function place(g: Glyph, dx: number): string {
  const body = src.slice(g.start, g.end)
  return body.replace(
    /<g transform="translate\([-\d.]+, ?[-\d.]+\)">/,
    `<g transform="translate(${(g.x + dx).toFixed(3)}, ${baseY.toFixed(3)})">`,
  )
}

// Crop to the real ink, with a hair of breathing room. Cropping to the
// transforms instead left a wide empty margin after the dot.
const left   = Math.min(...moved.map(p => p.g.left + p.dx))
const right  = Math.max(...moved.map(p => p.g.right + p.dx))
// Measured against the shared baseline every glyph is moving to, not the one
// it came from.
const top    = baseY + Math.min(...moved.map(p => p.g.relTop))
const bottom = baseY + Math.max(...moved.map(p => p.g.relBottom))
const pad    = letterGap * 0.9
const height = (bottom - top) + pad * 2

const defs = src.slice(src.indexOf('<defs>'), src.indexOf('</defs>') + '</defs>'.length)

const out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${
  (left - pad).toFixed(2)} ${(top - pad).toFixed(2)} ${(right - left + pad * 2).toFixed(2)} ${height.toFixed(2)
}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="green dot.">
<!-- GENERATED by scripts/make-line-logo.ts from public/logo.svg. Do not edit
     by hand: re-run "npm run logo:line" after replacing the stacked mark.
     Every path here is the original artwork, only repositioned. No baked
     background, so it sits on cream and on white alike. -->
${defs}
${moved.map(p => place(p.g, p.dx)).join('\n')}
</svg>
`

fs.writeFileSync(OUT, out)

// ── The morph ───────────────────────────────────────────────────
//
// The same two layouts, expressed as one set of word groups and the offset
// each needs to travel between them. The header component interpolates those
// offsets against scroll, so the animation is derived from the artwork rather
// than hand-tuned — replace the logo, re-run this, and it still lands.

/** One word, as its original glyph markup, unmoved. */
function wordBody(gs: Glyph[]): string {
  return gs.map(g => src.slice(g.start, g.end)).join('')
}

// The stacked crop: the ink of the whole mark, where it already sits.
const allInk = {
  left:   Math.min(...glyphs.map(g => g.left)),
  right:  Math.max(...glyphs.map(g => g.right)),
  top:    Math.min(...glyphs.map(g => g.top)),
  bottom: Math.max(...glyphs.map(g => g.bottom)),
}

const stackedBox = [
  allInk.left - pad,
  allInk.top - pad,
  allInk.right - allInk.left + pad * 2,
  allInk.bottom - allInk.top + pad * 2,
]
const lineBox = [left - pad, top - pad, right - left + pad * 2, height]

// "golf" leaves the frame downwards.
//
// Upwards is the obvious choice — everything else is rising — but golf is
// the bottom line of the stacked mark, so going up means crossing straight
// through "dot" and then "green" on the way. Downwards it is the only word
// heading that way and it touches nothing: the rest of the mark lifts away
// and golf drops out from under it, which is exactly what scrolling out of
// sight looks like.
const golfExit = (allInk.bottom - allInk.top) * 1.15

/** One word's ink box, and where that box sits in each of the two layouts. */
function wordEntry(
  id: string, gs: Glyph[], dx: number, dy: number, fades: boolean,
) {
  const x = Math.min(...gs.map(g => g.left))
  const y = Math.min(...gs.map(g => g.top))
  const w = Math.max(...gs.map(g => g.right)) - x
  const h = Math.max(...gs.map(g => g.bottom)) - y
  return {
    id, fades,
    // The word's own crop, so it can be drawn on its own
    box: [x, y, w, h].map(n => +n.toFixed(2)),
    // Where that crop sits in each layout, in the same units
    stacked: [+x.toFixed(2), +y.toFixed(2)],
    line: [+(x + dx).toFixed(2), +(y + dy).toFixed(2)],
    body: wordBody(gs),
  }
}

const morph = {
  stackedBox,
  lineBox,
  words: [
    wordEntry('green', green, 0,         0,                 false),
    wordEntry('dot',   dot,   dotShift,  baseY - dot[0].y,  false),
    // golf is not in the line mark. It leaves upwards, out of the frame.
    wordEntry('golf',  golf,  0,         golfExit,          true),
    wordEntry('mark',  mark,  markShift, baseY - mark[0].y, false),
  ],
}

fs.writeFileSync(MORPH_OUT, `// GENERATED by scripts/make-line-logo.ts — do not edit by hand.
// Re-run "npm run logo:line" after replacing public/logo.svg.
//
// The stacked wordmark's own paths, split into the words they belong to,
// with the offset each travels to reach the single-line layout. Every curve
// is the supplied artwork; only the group transforms differ between the two
// states, which is what lets one morph into the other rather than crossfade.

export type MorphWord = {
  id: 'green' | 'dot' | 'golf' | 'mark'
  /** True for the word that leaves rather than arrives. */
  fades: boolean
  /** The word's own ink crop: [x, y, w, h] in source units. */
  box: readonly [number, number, number, number]
  /** Top-left of that crop in the stacked layout. */
  stacked: readonly [number, number]
  /** Top-left of that crop in the single-line layout. */
  line: readonly [number, number]
  /** The original glyph markup, unmoved. */
  body: string
}

/** The crop around the whole stacked mark. */
export const STACKED_BOX = ${JSON.stringify(stackedBox.map(n => +n.toFixed(2)))} as const

/** The crop around the single line, which the viewBox animates towards. */
export const LINE_BOX = ${JSON.stringify(lineBox.map(n => +n.toFixed(2)))} as const

export const MORPH_WORDS: MorphWord[] = ${JSON.stringify(morph.words, null, 2)}
`)

const ratio = height / (right - left + pad * 2)
console.log(`✓  ${MORPH_OUT} written (${morph.words.length} word groups)`)
console.log(`✓  ${OUT} written`)
console.log(`   ${green.length} + ${dot.length} glyphs and the dot, from the original paths`)
console.log(`   word space ${wordSpace.toFixed(0)} from a cap height of ${capHeight.toFixed(0)}`)
console.log(`   aspect ratio ${ratio.toFixed(4)}  (WORDMARK.line.ratio)`)
