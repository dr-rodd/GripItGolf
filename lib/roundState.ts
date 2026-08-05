// What a round tile says about itself, before you tap it.
//
// Two screens offer a course to open: the round picker in scoring, and the
// list that drops out of a row on the trip leaderboard. They are the same
// question asked twice — which round, and what has happened on it — so they
// have to answer it the same way.
//
// Three states, and the border carries all three:
//
//   empty   nothing scored. The quietest thing on the page; there is
//           nothing to report, so it reports nothing.
//   live    a card is open on it now. Emerald, and the one place in the app
//           that glows — see the note below.
//   played  scores are in and nothing is open. A hard brown edge: finished,
//           and finished is a fact rather than an event.
//
// **The glow is a deliberate exception.** The style guide has none —
// "on cream a glow reads as a smudge" — and `test:branding` enforces that
// everywhere else. A live round is the one thing on the app worth seeing
// from across a room with the phone on a bar table, and the tile is a white
// card on cream rather than cream on cream, which is the case the rule was
// written against. It is pinned as an exception rather than allowed
// generally: exactly one class, on exactly this state.
//
// Pure. No I/O, no React.

export type RoundTone = 'empty' | 'live' | 'played'

/**
 * Which of the three a round is in.
 *
 * `live` wins over `played`: a round can have committed scores from the
 * group that finished and an open card from the group still out, and the
 * open card is the thing worth knowing.
 */
export function roundTone(hasScores: boolean, isLive: boolean): RoundTone {
  if (isLive) return 'live'
  return hasScores ? 'played' : 'empty'
}

/**
 * The tile itself. White, in both places — the card is the app's surface and
 * a round is a thing you act on.
 *
 * The border is the whole signal, so it is the only thing that changes.
 */
export const ROUND_TILE: Record<RoundTone, string> = {
  // Barely there. A round nobody has played is not news.
  empty:  'bg-surface border border-bark/[0.08]',
  // The exception. A ring at the accent, and a soft emerald spill under it.
  live:   'bg-surface border-2 border-accent shadow-[0_0_16px_rgba(10,157,86,0.28)]',
  // Hard brown. Done, and legible as done without being loud.
  played: 'bg-surface border-2 border-bark/45',
}

/** What the tile says under the round number. */
export const ROUND_NOTE: Record<RoundTone, string> = {
  empty:  'No scores yet',
  live:   'In play',
  played: 'Scores in',
}

/** The note's colour: emerald only while something is actually happening. */
export const ROUND_NOTE_TONE: Record<RoundTone, string> = {
  empty:  'text-ink/65',
  live:   'text-accent-deep',
  played: 'text-ink/80',
}
