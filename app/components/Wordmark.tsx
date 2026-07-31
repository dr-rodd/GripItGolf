/* eslint-disable @next/next/no-img-element */

/**
 * The "green dot." wordmark, in its two forms.
 *
 *   stacked  green / dot / golf over three lines, with the emerald dot.
 *            Square. The full mark, for entry screens.
 *   line     green dot, on one line. Wide. For the sticky header.
 *
 * Both are fixed vector files, never type — the mark is not recreated in a
 * webfont, and it is never recoloured. Rendered as <img> so replacing either
 * file needs no code change at all.
 *
 * next/image is deliberately avoided: these are fixed-size vectors, so there
 * is nothing to optimise, and Image would only wrap them in a layout box that
 * the header animation would then have to fight.
 */

export const WORDMARK = {
  // The supplied artwork: a square canvas with the mark inset, and a cream
  // background baked in. That background is a shade off our own cream, but
  // by one or two values — invisible in practice, and the stacked mark is
  // only ever shown on cream.
  stacked: { src: '/logo.svg',      ratio: 1,      alt: 'green dot golf' },
  // Derived from the same paths by scripts/make-line-logo.ts, cropped to the
  // ink and with no background, so it sits on cream and on white alike.
  line:    { src: '/logo-line.svg', ratio: 0.2015, alt: 'green dot.' },
} as const

export type WordmarkVariant = keyof typeof WORDMARK

export default function Wordmark({
  variant = 'stacked',
  width = 180,
  className = '',
  priority = false,
  ariaHidden = false,
}: {
  variant?: WordmarkVariant
  /** Rendered width in px. Height follows the file's own ratio. */
  width?: number
  className?: string
  /** True where it is the largest thing on screen and should not pop in. */
  priority?: boolean
  /** True when a neighbouring element already names it, to avoid saying it twice. */
  ariaHidden?: boolean
}) {
  const mark = WORDMARK[variant]
  return (
    <img
      src={mark.src}
      alt={ariaHidden ? '' : mark.alt}
      aria-hidden={ariaHidden ? 'true' : undefined}
      width={width}
      height={Math.round(width * mark.ratio)}
      className={className}
      style={{ width, height: 'auto' }}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
    />
  )
}
