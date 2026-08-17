'use client'

import { useEffect, useRef } from 'react'

/**
 * The trip URL as a scannable code, held up rather than sent: round brown
 * modules on a white card, the three corner anchors in emerald, and the
 * brand's green dot sitting in the middle.
 *
 * Drawn by qr-code-styling (MIT), in the app — no external QR service. The
 * centre dot stays our own overlay rather than the library's image option:
 * its `imageSize` is a coverage coefficient tangled up with the error
 * correction level, not a width fraction, and the one rule that keeps this
 * scannable is stated in width.
 *
 * Two rules keep it scannable, and they are a pair:
 *
 * - **Error correction is H**, the highest level, so the code survives
 *   losing what the dot covers. H tolerates ~30% damage.
 * - **The dot stays under 20% of the code's width.** DOT_FRACTION is 0.18;
 *   grow it past 0.2 and phones start failing at arm's length, which was
 *   the test that set the number.
 *
 * MODULE_TYPE is the styling's one dial. 'dots' is the brand answer — a
 * field of round dots is what the mark is. **If real phones start refusing
 * it, the agreed fallback is 'square'**: plain square modules, the emerald
 * anchors and everything else unchanged.
 *
 * The colours are literal hexes, deliberately, where everything else on the
 * page reads tokens. A QR code is data the way a tee swatch is data: dark
 * mode re-points `bark` to a light tan, and a light-on-white code scans as
 * nothing at all. The card behind it stays literal white for the same
 * reason — the quiet zone around a QR must be white whatever the page is.
 *
 * Generated in an effect because the library needs the document, which is
 * also where `window.location.origin` comes from — so a preview deploy
 * prints codes that stay on the preview.
 */

const DOT_FRACTION = 0.18
const MODULE_TYPE: 'dots' | 'square' = 'dots'

/** The drawing resolution. The SVG carries a viewBox, so CSS does the rest. */
const DRAW_SIZE = 600

export default function TripQr({ tripCode }: { tripCode: string }) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    let cancelled = false

    ;(async () => {
      // Imported here rather than at the top: the module reaches for browser
      // globals on load, which a server render does not have.
      const { default: QRCodeStyling } = await import('qr-code-styling')
      if (cancelled) return

      const qr = new QRCodeStyling({
        type: 'svg',
        width: DRAW_SIZE,
        height: DRAW_SIZE,
        data: `${window.location.origin}/trip/${tripCode}`,
        qrOptions: { errorCorrectionLevel: 'H' },
        margin: 0,
        backgroundOptions: { color: '#FFFFFF' },
        dotsOptions: { type: MODULE_TYPE, color: '#4A3728' },
        cornersSquareOptions: { type: 'extra-rounded', color: '#0A9D56' },
        cornersDotOptions: { type: 'dot', color: '#0A9D56' },
      })

      el.replaceChildren()
      qr.append(el)
    })()

    return () => {
      cancelled = true
      el.replaceChildren()
    }
  }, [tripCode])

  return (
    <div
      className="relative mx-auto rounded-2xl border border-bark/12 p-5"
      style={{
        width: 'min(70vw, 340px)',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Sized by the code, not the card: the wrapper is exactly the QR's
          own square, so the dot's fraction below means what the rule
          means. Against the padded card it was quietly a fifth wider. */}
      <div className="relative">
        {/* The library appends its SVG here; the square holds the card's
            shape for the frame before it lands. */}
        <div
          ref={box}
          className="w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
          style={{ aspectRatio: '1' }}
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
      </div>
    </div>
  )
}
