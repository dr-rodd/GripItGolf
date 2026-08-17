'use client'

import { useSyncExternalStore } from 'react'
import { QRCodeSVG } from 'qrcode.react'

/**
 * The trip URL as a scannable code, held up rather than sent: brown modules
 * on a white card, with the brand's green dot sitting in the middle.
 *
 * Two rules keep it scannable, and they are a pair:
 *
 * - **Error correction is H**, the highest level, so the code survives
 *   losing what the dot covers. H tolerates ~30% damage.
 * - **The dot stays under 20% of the code's width.** DOT_FRACTION is 0.18;
 *   grow it past 0.2 and phones start failing at arm's length, which was
 *   the test that set the number.
 *
 * The colours are literal hexes, deliberately, where everything else on the
 * page reads tokens. A QR code is data the way a tee swatch is data: dark
 * mode re-points `bark` to a light tan, and a light-on-white code scans as
 * nothing at all. The card behind it stays literal white for the same
 * reason — the quiet zone around a QR must be white whatever the page is.
 *
 * The URL comes off `window.location.origin` (via useSyncExternalStore, the
 * same server-renders-empty pattern /join uses for `?code=`), so a preview
 * deploy prints codes that stay on the preview.
 */

const DOT_FRACTION = 0.18

const subscribeNoop = () => () => {}

export default function TripQr({ tripCode }: { tripCode: string }) {
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => null,
  )

  return (
    <div
      className="relative mx-auto rounded-2xl border border-bark/12 p-5"
      style={{
        width: 'min(70vw, 340px)',
        backgroundColor: '#FFFFFF',
      }}
    >
      {origin ? (
        <>
          <QRCodeSVG
            value={`${origin}/trip/${tripCode}`}
            level="H"
            fgColor="#4A3728"
            bgColor="#FFFFFF"
            marginSize={0}
            className="w-full h-auto"
          />
          {/* The green dot, over the middle of the code. A plain circle laid
              on top rather than woven into the modules — level H above is
              what pays for it. */}
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: `${DOT_FRACTION * 100}%`,
              aspectRatio: '1',
              backgroundColor: '#0A9D56',
            }}
          />
        </>
      ) : (
        // The server's frame: the card at its final size, empty. The code
        // needs the browser's own origin, which arrives with hydration.
        <div className="w-full" style={{ aspectRatio: '1' }} />
      )}
    </div>
  )
}
