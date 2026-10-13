/* eslint-disable @next/next/no-img-element */
/**
 * Strava's own "Powered by Strava" logo — wherever Strava data is shown.
 *
 * The files in public/strava/ are Strava's, from their API logo pack, and
 * are used exactly as supplied: Strava's brand guidelines allow the logo
 * unaltered or not at all, never recoloured, redrawn or run into Green
 * Dot's own mark. Two of them because the orange version's "Powered by" is
 * black, which vanishes on the dark palette — so the same two-file pattern
 * as TitleMark: `only-light` / `only-dark` in globals.css picks one before
 * hydration, and display: none keeps the hidden one out of the
 * accessibility tree, so the shared alt is announced once.
 *
 * Small and quiet on purpose — the logo says where the data came from, and
 * must never read as though Strava made or endorses Green Dot. A plain
 * <img>, as TitleMark's: next/image does nothing for an SVG.
 */

const W = 365
const H = 37

export default function PoweredByStrava({ height = 12, className = '' }: {
  height?: number
  className?: string
}) {
  const common = {
    width: Math.round((W / H) * height),
    height,
    style: { height, width: 'auto' } as const,
  }
  return (
    <span className={`inline-flex ${className}`}>
      <img src="/strava/powered-by-strava.svg" alt="Powered by Strava" className="only-light" {...common} />
      <img src="/strava/powered-by-strava-white.svg" alt="Powered by Strava" className="only-dark" {...common} />
    </span>
  )
}
