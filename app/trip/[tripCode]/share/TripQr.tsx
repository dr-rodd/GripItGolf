'use client'

import { useEffect, useRef } from 'react'

/**
 * The trip URL as a scannable code, held up rather than sent: round brown
 * modules on a white card, with the three corner anchors carrying the
 * brand's emerald dot — each anchor is a green ring around a green dot,
 * which turned out to say it better than a stamp over the middle. There was
 * one, briefly; it came off because the anchors already do its job.
 *
 * Drawn by qr-code-styling (MIT), in the app — no external QR service.
 * Error correction stays H: nothing covers the code any more, but the
 * headroom is what keeps a scan working through glare, a cracked screen or
 * a shaking hand, and the URL is short enough that the extra density costs
 * nothing worth having back.
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
      className="mx-auto rounded-2xl border border-bark/12 p-5"
      style={{
        width: 'min(70vw, 340px)',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* The library appends its SVG here; the square holds the card's
          shape for the frame before it lands. */}
      <div
        ref={box}
        className="w-full [&_svg]:w-full [&_svg]:h-auto [&_svg]:block"
        style={{ aspectRatio: '1' }}
      />
    </div>
  )
}
