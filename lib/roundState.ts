// What a round tile says about itself, before you tap it.
//
// Two screens offer a course to open: the round picker in scoring, and the
// list that drops out of a row on the trip leaderboard. They are the same
// question asked twice — which round, and what has happened on it — so they
// have to answer it the same way.
//
// Three states, and the surface carries all three (refresh plan, 4.4):
//
//   empty   nothing scored. Flat — a tint with no edge and no shadow, the
//           quietest thing on the page; there is nothing to report, so it
//           reports nothing but "No scores yet".
//   live    a card is open on it now. A 2px emerald edge, and the one place
//           in the app that glows — see the note below.
//   played  scores are in and nothing is open. A raised card with a
//           chevron, like every other card that opens something: finished
//           is a fact rather than an event. It was a heavy 2px brown frame,
//           which read as an alarm on a screen full of them.
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
  // Flat. A round nobody has played is not news.
  empty:  'bg-tint border border-transparent',
  // The exception. A ring at the accent, and a soft emerald spill under it.
  live:   'bg-surface border-2 border-accent shadow-[0_0_16px_rgba(10,157,86,0.28)]',
  // Raised, like any card that opens something. The chevron is the tile's.
  played: 'bg-surface border border-line shadow-raised',
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
