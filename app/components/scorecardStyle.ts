// How every scorecard in the app is dressed.
//
// There are three of them and they answer to three different jobs:
//
//   · the live leaderboard's drop-down, opened from a row that already
//     names the player
//   · the end-of-round card, the last look before a score is committed
//   · the trip leaderboard's pop-up, one player or a whole team
//
// What they show differs. What they LOOK like must not, or the same round
// reads as three different documents depending on which screen found it.
// This is the shared half: the surface, the rules, the bands, the type.
//
// White, with alternating rows nudged towards the page's cream. The card is
// the brightest thing on screen and the browns sit on it properly — which is
// the whole reason the old parchment came off. A flat tint rather than a
// literal gradient: `test:branding` bans those outright, and a wash between
// white and cream is the effect the tint is after anyway.
//
// The old cards banded Out / In / Total in Donegal gold. There is no gold in
// this app; the bands are bark, because a scorecard that is half accent has
// no accent at all.

/** Dense figures — every scorecard number is set in the serif. */
export const SC_SF = { fontFamily: 'var(--font-serif)' } as const

/** The card itself. White, so the score shapes have somewhere to sit. */
export const SC_CARD = 'bg-surface border border-bark/12 rounded-2xl'

/** Hairline between holes. Lighter than a card border — 18 of them stack up. */
export const SC_RULE = 'border-b border-bark/[0.08]'

/**
 * Alternating rows, nudged towards the page.
 *
 * Pass the hole number, not the array index: the back nine is rendered from
 * its own slice, and indexing that restarts the stripe at hole 10 so 9 and 10
 * come out the same shade.
 */
export const scRow = (holeNumber: number) =>
  holeNumber % 2 === 0 ? 'bg-cream/60' : 'bg-surface'

/** Out and In. A wash of bark, enough to group the nine above it. */
export const SC_BAND = 'bg-bark/[0.05]'

/** The total. The same wash, one step up, so the eye lands there last. */
export const SC_BAND_TOTAL = 'bg-bark/[0.10]'

/** Column headings and the details strip above them. */
export const SC_HEAD = 'bg-bark/[0.05]'

/** A column heading: small caps, quiet, never smaller than the type floor. */
export const SC_HEAD_TEXT =
  'text-[13px] tracking-[0.15em] uppercase font-semibold text-ink/65'

/**
 * The same heading in a narrow fixed column.
 *
 * No letter-spacing: "Hole" and "Par" sit in the tightest columns on the
 * card, and the tracking pushed them into each other so the two read as one
 * word. The size is unchanged — 13px is the floor and this is still a label.
 */
export const SC_HEAD_TIGHT =
  'text-[13px] uppercase font-semibold text-ink/65'

/** A label above a value in the details strip — "PH", "Tee". */
export const SC_LABEL = 'text-[13px] tracking-[0.15em] uppercase text-ink/65'

export const SC_MUTED = 'text-ink/65'
export const SC_DARK  = 'text-ink'

/**
 * Stableford points, which carry the least weight until they are worth
 * something. A blank hole and a zero are not the same thing and do not read
 * the same: zero is a hole that was played and scored nothing.
 */
export const scPoints = (pts: number | null) =>
  pts === null ? SC_MUTED
    : pts === 0 ? 'text-ink/65'
    : 'text-ink font-bold'

// ─── Tee swatches ──────────────────────────────────────────────
//
// These are data, not brand: a blue tee is blue, and it keeps its own hue
// where everything else moved to the palette. On a white card the pale ones
// would vanish, so every swatch carries a hairline ring.
//
// Shared because a tee has to look the same on the card you score on and the
// card you read afterwards — they were separate copies in three files.

const TEE_RING = 'ring-1 ring-bark/25'

export const TEE_DOT: Record<string, string> = {
  Black:     `bg-zinc-800 ${TEE_RING}`,
  Blue:      `bg-blue-500 ${TEE_RING}`,
  White:     `bg-white ${TEE_RING}`,
  Red:       `bg-red-500 ${TEE_RING}`,
  Yellow:    `bg-yellow-400 ${TEE_RING}`,
  Sandstone: `bg-amber-300 ${TEE_RING}`,
  Slate:     `bg-slate-400 ${TEE_RING}`,
  Granite:   `bg-stone-400 ${TEE_RING}`,
  Claret:    `bg-rose-800 ${TEE_RING}`,
}

/** A tee's swatch, falling back to a neutral for a colour we do not know. */
export const teeDot = (name: string | null | undefined) =>
  (name && TEE_DOT[name]) || `bg-bark/25 ${TEE_RING}`
