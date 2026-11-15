// A club's colour, made readable — the only copy of the rule (D118, D119,
// D125; Ross, 14–15 Nov 2026).
//
// A club chooses one colour and only that hex is stored (`clubs.colour`), so
// a better rule later moves every club at once. From it come four values for
// each mode, worked out on the server when a page is drawn:
//
// * `club` — marks, rings, the lit tab: at least 3:1 against the page and a
//   card (WCAG 1.4.11, a mark);
// * `deep` — club-coloured words: at least 4.5:1 against both;
// * `on` — words on a club fill: ink or white, whichever clears 4.5:1;
// * `tint` — a faint wash of `club`, mixed in CSS.
//
// **Checked and adjusted, never refused.** The hue is never moved — a club's
// colour is its identity — only its lightness is stepped: darker by day,
// lighter at night, until every floor clears. A colour too close to the
// emerald (Ireland is full of green clubs) is stepped further, so it can
// never pass for Live or for an action. And the club colour is identity only
// (D125): never a result, a side, a button or Live — `test:clubs` and
// `test:branding` hold where it may be used.
//
// Pure: the club page, the club area and the admin's preview all call it.

/**
 * The page, a card and the page's words, by day and at night —
 * `app/globals.css`'s values, checked by `test:clubs`. `ink` is the dark ink
 * a light fill takes in either mode (as `on-gold` is).
 */
export const CLUB_GROUNDS = {
  light: { page: '#F6F4F0', card: '#FFFFFF', ink: '#2B2118', text: '#2B2118', accent: '#0A9D56', accentDeep: '#0A6B3C' },
  dark: { page: '#1B1510', card: '#272019', ink: '#2B2118', text: '#F2EBE2', accent: '#22B573', accentDeep: '#0E9151' },
} as const

/** How far, ΔE over Lab, a club colour must stand from the emerald. */
export const MIN_ACCENT_DISTANCE = 20

export interface ClubShades { club: string; deep: string; on: string }
export interface ClubColours {
  /** The hex the club chose, tidied. */
  chosen: string
  light: ClubShades
  dark: ClubShades
  /** Either mode's mark moved from what was chosen — the admin is told so. */
  adjusted: boolean
}

const HEX = /^#[0-9A-Fa-f]{6}$/

/** A stored or typed colour as kept: `#RRGGBB`, upper case — null when it is not one. */
export function cleanHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`
  return HEX.test(s) ? s.toUpperCase() : null
}

// ─── Colour arithmetic ─────────────────────────────────────────

type RGB = [number, number, number]

function rgb(hex: string): RGB {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(c => c / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  if (s === 0) return toHex([l * 255, l * 255, l * 255])
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return toHex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255])
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(c => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** ΔE (CIE76) between two colours — how far apart they look. */
export function deltaE(a: string, b: string): number {
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/**
 * The colour stepped in lightness — darker (`-1`) or lighter (`+1`), hue and
 * saturation kept — until `ok` holds, or as far as it can go.
 */
function stepUntil(hex: string, dir: -1 | 1, ok: (h: string) => boolean): string {
  const [h, s, l0] = hsl(hex)
  let cur = hex
  for (let l = l0; l >= 0 && l <= 1; l += dir * 0.01) {
    cur = fromHsl(h, s, Math.min(1, Math.max(0, l)))
    if (ok(cur)) return cur
  }
  return cur
}

function shadesFor(chosen: string, mode: 'light' | 'dark'): ClubShades {
  const g = CLUB_GROUNDS[mode]
  const dir: -1 | 1 = mode === 'light' ? -1 : 1
  const clears = (h: string, ratio: number) => contrast(h, g.page) >= ratio && contrast(h, g.card) >= ratio
  const onFor = (h: string) => (contrast('#FFFFFF', h) >= contrast(g.ink, h) ? '#FFFFFF' : g.ink)
  // A mark: clears the page and a card, stands apart from the emerald and
  // its deep (action and Live, D125), and carries readable words on it.
  const mark = (h: string) => clears(h, 3)
    && deltaE(h, g.accent) >= MIN_ACCENT_DISTANCE && deltaE(h, g.accentDeep) >= MIN_ACCENT_DISTANCE
    && contrast(onFor(h), h) >= 4.5
  const club = mark(chosen) ? chosen : stepUntil(chosen, dir, mark)
  const deep = clears(club, 4.5) ? club : stepUntil(club, dir, h => clears(h, 4.5))
  return { club, deep, on: onFor(club) }
}

/** The club's colours for both modes, adjusted where they must be. Null for a club with none: the house look. */
export function clubColours(raw: unknown): ClubColours | null {
  const chosen = cleanHex(raw)
  if (!chosen) return null
  const light = shadesFor(chosen, 'light')
  const dark = shadesFor(chosen, 'dark')
  return { chosen, light, dark, adjusted: light.club !== chosen || dark.club !== chosen }
}

/**
 * The inline style a `[data-club]` wrapper carries: both modes at once, so
 * the theme switch works live (globals.css picks `-l` by day, `-d` at
 * night). Only ever built from checked hex — nothing else can reach a token.
 */
export function clubStyle(c: ClubColours | null): Record<string, string> {
  if (!c) return {}
  const out: Record<string, string> = {}
  for (const [mode, s] of [['l', c.light], ['d', c.dark]] as const) {
    for (const [k, v] of [['club', s.club], ['club-deep', s.deep], ['on-club', s.on]] as const) {
      const hex = cleanHex(v)
      if (hex) out[`--gd-${k}-${mode}`] = hex
    }
  }
  return out
}
