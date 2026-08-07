// How a score reads on a leaderboard.
//
// Both boards show the same idea — a number against a level — and they were
// colouring it two different ways, one of them wrong. This is the one place
// that decides.
//
// The rule the boards share:
//
//   better than level   emerald. The only colour on the board.
//   level               neutral bark, quiet
//   worse than level    MORE bark than level, never emerald
//
// The bug this exists to kill: the live board painted both sides of level
// emerald, so a round four over and a round four under looked equally good.
// Under par is the thing worth colouring; over par is worth *weight*, which
// on this palette means more brown. Emerald is the accent — a board where
// half the numbers are green has no accent at all.
//
// Which direction is "better" is not fixed: Stableford counts up and strokes
// count down, so every caller says which it is rather than guessing.
//
// Pure. No I/O, no React.

export type ScoreTone = 'good' | 'level' | 'bad'

/**
 * Where a relative score sits against level.
 *
 * `lowerIsBetter` is true for strokes — nett or gross, under par is the good
 * side — and false for Stableford, where points above two a hole is.
 */
export function scoreTone(relative: number, lowerIsBetter: boolean): ScoreTone {
  if (relative === 0) return 'level'
  const better = lowerIsBetter ? relative < 0 : relative > 0
  return better ? 'good' : 'bad'
}

/**
 * The pill a relative score sits in.
 *
 * Bark at two strengths for level and worse, the same two steps ScoreShape
 * uses for a bogey and a double — so a card and a leaderboard grade the same
 * round the same way.
 *
 * The two steps were 6% and 14%, and side by side down a live board they were
 * too close to tell apart at a glance: level looked like a mild version of
 * over rather than its own state. They are 4% and 20% now — level barely
 * tinted, over unmistakably shaded — which is the same ordering, further
 * apart. Level stays above nothing at all on purpose: a bare number in that
 * column would read as a missing pill rather than as level.
 */
export const TONE_PILL: Record<ScoreTone, string> = {
  good:  'bg-accent/[0.14] text-accent-deep',
  level: 'bg-bark/[0.04] text-ink/80',
  bad:   'bg-bark/[0.20] text-ink',
}

/** The same three tones as bare text, for a column too tight for a pill. */
export const TONE_TEXT: Record<ScoreTone, string> = {
  good:  'text-accent-deep',
  level: 'text-ink/80',
  bad:   'text-ink',
}
