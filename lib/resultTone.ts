// How a result reads, sitewide — the only copy (Ross, 21 October 2026).
//
//   won     gold, solid
//   up      the duller gold: the tint, gold lettering
//   level   neutral
//   down    the brown: bark at a tint
//   lost    the darker brown: bark, solid
//   live    emerald — green means live and nothing else on a result
//
// A match, a board's relative score and a stat's gain all come through
// here, so "winning" is one colour on every screen. The tokens live in
// app/globals.css (`gold`, `gold-deep`, `gold-tint`, `on-gold`,
// `bark-tint`). Pure. No I/O, no React.

export type ResultTone = 'won' | 'up' | 'level' | 'down' | 'lost' | 'live'

/** A pill or a small filled box. */
export const RESULT_PILL: Record<ResultTone, string> = {
  won:   'bg-gold text-on-gold',
  up:    'bg-gold-tint text-gold-deep',
  level: 'bg-tint text-ink/80',
  down:  'bg-bark-tint text-ink',
  lost:  'bg-bark text-cream',
  live:  'bg-accent-tint text-accent-deep',
}

/** The same tones as bare text, for a line too tight for a pill. */
export const RESULT_TEXT: Record<ResultTone, string> = {
  won:   'text-gold-deep font-semibold',
  up:    'text-gold-deep',
  level: 'text-ink/80',
  down:  'text-bark',
  lost:  'text-ink font-semibold',
  live:  'text-accent-deep',
}

/** A fill with no words on it — an edge, a bar, a dot. */
export const RESULT_FILL: Record<ResultTone, string> = {
  won:   'bg-gold',
  up:    'bg-gold-tint',
  level: 'bg-tint',
  down:  'bg-bark-tint',
  lost:  'bg-bark',
  live:  'bg-accent',
}

/**
 * One side of a match as it stands: ahead is up, and won once it is over;
 * behind is down, and lost once it is over.
 */
export function sideTone<S extends string>(side: S, state: { leader: S | null; settled: boolean }): ResultTone {
  if (state.leader === null) return 'level'
  if (state.leader === side) return state.settled ? 'won' : 'up'
  return state.settled ? 'lost' : 'down'
}

/** A signed figure where more is better — a gain, holes up: up, level or down. */
export function signTone(n: number): ResultTone {
  return n > 0 ? 'up' : n < 0 ? 'down' : 'level'
}
