// The two sides of a match, in colour — the only copy (Ross, 25 Oct 2026).
//
// **The top of the draw is red, the bottom blue** — the card's left and
// right, a listed match's first name and second — and **every phone shows
// the same**, whoever is holding it: a hole Red won is red on the card's
// strip, on the live board and in the bracket alike. The gold-and-brown
// result tones (lib/resultTone.ts) never reach a match.
//
// **A side with a tag colour keeps it, in every match it plays** (Ross,
// 26 Oct 2026) — the tag every player in it shares (lib/tagBoards.ts), so a
// player is the same colour all the way up the bracket. Two sides in the
// same tag play in a dark and a light version of it, the top of the draw
// dark. A side with no tag takes red or blue — whichever is further from
// the other side's colour — so it never vanishes into its opponent.
//
// **On an event without sides, a player's own colour is worn the same way**
// (lib/playerColours.ts decides which colour a player has). Two players
// may pick the same one, or two that only nearly differ — the palette has
// two purples and two greens — so **two sides too alike to tell apart on
// the card's strip are shaded apart** (`setApart`; Ross, 26 Oct 2026): the
// darker of the two a touch darker, the lighter a touch lighter, only as
// far as it takes. The same colour twice is the dark-and-light pair above.
//
// Colours come back as CSS values for a `style`, because a team colour is
// whatever the organiser picked. Pure. No I/O.

export type SideKey = 'A' | 'B'

/** A side's colour: the fill, and the ink that reads on it. */
export type SideColour = { fill: string; on: string }

export const DEFAULT_SIDE_COLOURS: Record<SideKey, SideColour> = {
  A: { fill: 'var(--color-side-a)', on: 'var(--color-on-side)' },
  B: { fill: 'var(--color-side-b)', on: 'var(--color-on-side)' },
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** White or the dark ink, whichever reads on this fill. */
export function inkOn(hex: string): string {
  const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1)
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Where white and the ink give the same contrast.
  return lum > 0.18 ? '#1B1510' : '#FFFFFF'
}

/** The light theme's red and blue, to measure a tag colour against. */
const DEFAULT_HEX: Record<SideKey, string> = { A: '#C62F3A', B: '#2563B8' }

function rgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1)
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** The colour mixed toward black (`by` < 0) or white (`by` > 0), as hex. */
export function shade(hex: string, by: number): string {
  const target = by < 0 ? 0 : 255
  const t = Math.abs(by)
  return '#' + rgb(hex).map(c => Math.round(c + (target - c) * t).toString(16).padStart(2, '0')).join('')
}

/** CIE L*a*b* (D65) — near enough how far apart two colours look. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(c => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** How different two colours look (ΔE, CIE76): 0 the same, past 100 opposites. */
export function colourDistance(x: string, y: string): number {
  const [a, b] = [lab(x), lab(y)]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * Below this, two sides' colours are shaded apart. Set against the
 * palette: the two purples (7) and two greens (9) fall under it, and so do
 * red against orange (23), orange against amber (23), teal against cyan
 * (28) and green against lime (28) — each readable as a swatch on its own,
 * not as a run of thin marks on a strip.
 */
export const MIN_SIDE_DISTANCE = 30

const SHADE_STEP = 0.025
const SHADE_MAX = 0.45

/**
 * Two different colours, shaded apart until they read as two — the darker
 * mixed toward black and the lighter toward white, a step at a time, only
 * as far as `MIN_SIDE_DISTANCE`. Far enough apart already, they come back
 * as they were. Equal lightness: the top of the draw takes the dark.
 */
export function setApart(a: string, b: string): [string, string] {
  if (colourDistance(a, b) >= MIN_SIDE_DISTANCE) return [a, b]
  const aDarker = lab(a)[0] <= lab(b)[0]
  let pair: [string, string] = [a, b]
  for (let i = 1; i * SHADE_STEP <= SHADE_MAX + 1e-9; i++) {
    const t = i * SHADE_STEP
    pair = [shade(a, aDarker ? -t : t), shade(b, aDarker ? t : -t)]
    if (colourDistance(pair[0], pair[1]) >= MIN_SIDE_DISTANCE) break
  }
  return pair
}

const own = (hex: string): SideColour => ({ fill: hex, on: inkOn(hex) })

/**
 * Both sides' colours. Each coloured side its own — shaded apart when the
 * two are too alike to tell apart; two in the same colour a dark and a
 * light version of it; an uncoloured side red or blue, whichever stands
 * further from the other.
 */
export function sideColours(teamA?: string | null, teamB?: string | null): Record<SideKey, SideColour> {
  const a = teamA && HEX.test(teamA) ? teamA : null
  const b = teamB && HEX.test(teamB) ? teamB : null
  if (!a && !b) return DEFAULT_SIDE_COLOURS
  if (a && b) {
    if (a.toLowerCase() !== b.toLowerCase()) {
      const [x, y] = setApart(a, b)
      return { A: own(x), B: own(y) }
    }
    return { A: own(shade(a, -0.3)), B: own(shade(a, 0.45)) }
  }
  const tag = (a ?? b)!
  const free: SideKey = colourDistance(tag, DEFAULT_HEX.A) >= colourDistance(tag, DEFAULT_HEX.B) ? 'A' : 'B'
  return a ? { A: own(a), B: DEFAULT_SIDE_COLOURS[free] } : { A: DEFAULT_SIDE_COLOURS[free], B: own(b!) }
}

/** The side's colour as a wash behind words in the page's ink — an up, a lead. */
export function sideTint(c: SideColour, percent = 18): string {
  return `color-mix(in srgb, ${c.fill} ${percent}%, transparent)`
}

/**
 * The colour a whole side plays in: the one team colour every player in it
 * shares, or null.
 */
export function commonColour(colours: readonly (string | null | undefined)[]): string | null {
  if (colours.length === 0 || colours.some(c => !c)) return null
  return colours.every(c => c!.toLowerCase() === colours[0]!.toLowerCase()) ? colours[0]! : null
}
