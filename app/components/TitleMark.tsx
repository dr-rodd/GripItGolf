/* eslint-disable @next/next/no-img-element */

/**
 * The page's name, set as artwork rather than as type.
 *
 * "leaderboard." / "settings." / "scoring." — the supplied lettering, each
 * closed by the emerald dot the way the wordmark is. They stand in the
 * header where the green dot mark stands on the trip hub: same place, same
 * height, left aligned, so moving between screens changes the word and
 * nothing else.
 *
 * The original four are cropped to a shared baseline and to one common
 * height, so a descender in "scoring" does not make it sit differently
 * from "leaderboard". Only the width varies, which is why each carries its
 * own ratio — the header sizes by height and lets the width follow.
 *
 * `public/title-donate.png` was cut from the same supplied sheet as the
 * stats mark and is deliberately not registered here: a donate control is
 * not a page title, and it has no role yet. Kept because the sheet it came
 * from does not live in the repo.
 *
 * Rendered as <img> for the same reason as the wordmark: they are fixed
 * artwork, so replacing a file needs no code change. Swap a PNG for an SVG
 * of the same proportions and nothing here has to know.
 */

export const TITLE_MARKS = {
  leaderboard: { src: '/title-leaderboard.png', ratio: 0.1972, alt: 'leaderboard.' },
  settings:    { src: '/title-settings.png',    ratio: 0.2777, alt: 'settings.' },
  scoring:     { src: '/title-scoring.png',     ratio: 0.3077, alt: 'scoring.' },
  // Cut from the supplied sheet rather than set in a lookalike face: the
  // cream was keyed out with each pixel's alpha recovered from how far it
  // sits from it, so the curves stay smooth instead of going ragged at a
  // threshold. Its two inks came out of that sheet at #4A3728 and #0A9D56
  // — the same two the other three marks are drawn in, which is the check
  // that the cut was faithful rather than merely close.
  //
  // Its dot hangs below the baseline where theirs sit on it, so lettering
  // is 81.5% of this file's height against their 84–87%. That renders the
  // word about 3% smaller than "leaderboard" at the same height: measured,
  // and left alone, because it is under the threshold of noticing and the
  // alternative is cropping into the artwork.
  statsHub:    { src: '/title-stats-hub.png',   ratio: 0.2050, alt: 'stats hub.' },
  // Drawn and kept, but not in use — the trip hub shows the green dot mark.
  trip:        { src: '/title-trip.png',        ratio: 0.5957, alt: 'trip.' },
} as const

export type TitleMarkKey = keyof typeof TITLE_MARKS

export default function TitleMark({
  name, height, className = '',
}: {
  name: TitleMarkKey
  /** Rendered height in px. The width follows the artwork's own ratio. */
  height: number
  className?: string
}) {
  const mark = TITLE_MARKS[name]
  const width = Math.round(height / mark.ratio)
  return (
    <img
      src={mark.src}
      alt={mark.alt}
      width={width}
      height={Math.round(height)}
      className={className}
      style={{ height, width: 'auto' }}
      fetchPriority="high"
      decoding="sync"
    />
  )
}
