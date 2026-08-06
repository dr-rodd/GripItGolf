// A handicap, and the shots it is worth on a hole.
//
// A player better than scratch has a **plus** handicap: they give strokes back
// to the course rather than receiving them. It is written with a leading plus
// — "+1" — and stored here as a negative number, which is the only way one
// value can carry both directions.
//
// The two are mirror images, and the mirror is the part that was wrong:
//
//   handicap 1   receives a shot on the HARDEST hole, SI 1
//   handicap +1  gives one back on the EASIEST hole, SI 18
//
// So a +1 is level par by birdieing SI 18 and paring the other seventeen. The
// old formula tested `strokeIndex <= handicap % 18`, which for a negative
// handicap is `strokeIndex <= -1` — never true on any hole — so the whole
// part alone survived and a +1 gave a shot back on all eighteen. That asked a
// +1 to birdie every hole for level par, and made +1 and +2 identical.
//
// Pure. No I/O.

/**
 * Shots received on a hole. Negative for a plus handicap, which gives them.
 *
 * The whole part applies to every hole; the remainder picks the holes that get
 * one more. A handicap counts up from the hardest hole, a plus handicap counts
 * down from the easiest, and 18 holes is exactly one lap either way.
 *
 * Rounded before it is split. `round_handicaps` is whole by the time anything
 * scores off it, but an allowance can hand a fraction straight in, and
 * `Math.floor` on a fraction would put the extra shot on a different hole than
 * the remainder expects.
 */
export function shotsReceived(playingHandicap: number, strokeIndex: number): number {
  const hcp = Math.round(playingHandicap)
  if (hcp < 0) {
    // Given back, from the easiest hole down. `19 - remainder` is where the
    // extra one starts: with a remainder of 1 that is SI 18 alone, with 3 it
    // is SI 16, 17 and 18.
    const given = Math.abs(hcp)
    return -(Math.floor(given / 18) + (strokeIndex >= 19 - (given % 18) ? 1 : 0))
  }
  return Math.floor(hcp / 18) + (strokeIndex <= hcp % 18 ? 1 : 0)
}

// ─── Reading and writing one ───────────────────────────────────

/**
 * A handicap as golf writes it: "+1" better than scratch, "12" worse, "0" at.
 *
 * A minus sign never appears. Nobody has ever called themselves a minus one,
 * and printing the stored number raw is what made a course handicap of +1 read
 * as "-1" on the card.
 */
export function formatHandicap(h: number): string {
  // To one decimal, which is what the column holds. `String` drops a trailing
  // ".0" on its own, so 12 is "12" and 12.4 is "12.4".
  const rounded = Math.round(h * 10) / 10
  return rounded < 0 ? `+${-rounded}` : String(rounded)
}

/**
 * What somebody typed, as a number this app can store.
 *
 * "+1" is better than scratch and comes back as -1, which is the whole reason
 * this exists: `parseFloat('+1')` is 1, so a plus handicap typed into any of
 * the handicap fields used to be stored as an ordinary one and nothing
 * anywhere said otherwise.
 *
 * A leading minus is read the same way as a plus. Nobody means "worse than
 * scratch by minus one", and taking it as a plus handicap is the only reading
 * that is ever what they meant.
 *
 * Null for anything unreadable, so a caller can refuse rather than store a
 * zero it invented.
 */
export function parseHandicap(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null

  const plus = text.startsWith('+') || text.startsWith('-')
  const digits = plus ? text.slice(1).trim() : text
  if (!/^\d*\.?\d+$/.test(digits)) return null

  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return plus ? -n : n
}

/** What the keypad should offer. A plus handicap needs a `+` on it. */
export const HANDICAP_INPUT = {
  type: 'text',
  inputMode: 'text',
  // Digits and one decimal, optionally led by a sign. Loose on purpose: it
  // hints the keyboard rather than validating, and `parseHandicap` is what
  // actually decides.
  pattern: '[+-]?[0-9]*\\.?[0-9]*',
  autoComplete: 'off',
} as const
