/* eslint-disable @next/next/no-img-element */

/**
 * The "green dot." wordmark.
 *
 * A fixed vector file, not type — never recreated in a webfont, never
 * recoloured per page. It is brown on cream or brown on white, and nothing
 * else. Rendered as an <img> rather than inlined so replacing the file at
 * public/logo.svg needs no code change at all.
 *
 * next/image is deliberately not used: this is a fixed-size vector, so there
 * is nothing to optimise and nothing to resize, and Image would only add a
 * layout wrapper around it.
 */
export default function Wordmark({
  width = 180,
  className = '',
  priority = false,
}: {
  /** Rendered width in px. Height follows the file's own ratio. */
  width?: number
  className?: string
  /** True on the landing page, where it is the largest thing on screen. */
  priority?: boolean
}) {
  return (
    <img
      src="/logo.svg"
      alt="green dot."
      width={width}
      height={Math.round(width * (150 / 560))}
      className={className}
      style={{ width, height: 'auto' }}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
    />
  )
}
