/* eslint-disable @next/next/no-img-element */
/**
 * Strava's own "Connect with Strava" button — the artwork from their button
 * pack (`public/strava/connect-with-strava.svg`), used exactly as supplied.
 *
 * Strava's brand guidelines want the button that starts the connection to
 * be theirs, unaltered: never redrawn, recoloured, faded or resized out of
 * proportion. So it is drawn at its own 48px height in both themes — the
 * orange version reads on cream and on the dark page alike, where the
 * white one would be a bright bar — and it is never shown greyed out.
 * What it does before the consent box is ticked is the Strava card's
 * business, not the artwork's (StravaCard).
 *
 * A plain <img>, as PoweredByStrava's: next/image does nothing for an SVG.
 */

const W = 237
const H = 48

export default function ConnectWithStrava() {
  return (
    <img
      src="/strava/connect-with-strava.svg"
      alt="Connect with Strava"
      width={W}
      height={H}
      style={{ height: H, width: 'auto' }}
      className="block"
    />
  )
}
