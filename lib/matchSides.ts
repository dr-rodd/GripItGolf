// The two sides of a match, in colour — the only copy (Ross, 25 Oct 2026).
//
// **The top of the draw is red, the bottom blue** — the card's left and
// right, a listed match's first name and second — and **every phone shows
// the same**, whoever is holding it: a hole Red won is red on the card's
// strip, on the live board and in the bracket alike. The gold-and-brown
// result tones (lib/resultTone.ts) never reach a match.
//
// A side that plays in a team colour — both its players in the same side
// of the event, a tag (lib/tagBoards.ts) — wears that colour instead, so
// long as the other side's is a different one; otherwise red and blue.
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

/**
 * Both sides' colours. Team colours only when both sides have one and
 * they differ — two sides in one colour could not be told apart.
 */
export function sideColours(teamA?: string | null, teamB?: string | null): Record<SideKey, SideColour> {
  const a = teamA && HEX.test(teamA) ? teamA : null
  const b = teamB && HEX.test(teamB) ? teamB : null
  if (!a || !b || a.toLowerCase() === b.toLowerCase()) return DEFAULT_SIDE_COLOURS
  return { A: { fill: a, on: inkOn(a) }, B: { fill: b, on: inkOn(b) } }
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
