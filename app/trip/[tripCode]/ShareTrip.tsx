'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { buttonClass } from '@/app/components/ui'
import { IconShare, IconQrcode } from '@/app/components/icons'

/**
 * The way a trip travels: one tap hands the full trip URL to the phone's own
 * share sheet, so the group gets a link that opens the hub directly rather
 * than a six-character code to retype. The code stays as the fallback — this
 * adds a door, it closes none.
 *
 * The URL comes off `window.location.origin`, never a hardcoded host, so a
 * Vercel preview deploy shares links that stay on the preview.
 *
 * Where `navigator.share` does not exist (mostly desktop), the same tap
 * copies the link instead and says so. Cancelling the share sheet rejects
 * with AbortError, which is a person changing their mind, not a failure —
 * nothing happens, and in particular the link is not then copied over
 * whatever their clipboard was holding.
 *
 * Rendered on the hub with the small QR-code link beside it, and again on
 * the share page without (`qrLink={false}`) — that page IS the QR code.
 */
export default function ShareTrip({
  tripCode,
  tripName,
  qrLink = true,
}: {
  tripCode: string
  tripName: string
  /** The small link to the QR page. Off on the QR page itself. */
  qrLink?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function share() {
    const url = `${window.location.origin}/trip/${tripCode}`

    if (navigator.share) {
      try {
        await navigator.share({
          title: tripName,
          text: `You're invited to ${tripName} on Green Dot. Tap to join:`,
          url,
        })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        // Anything else falls through to the clipboard below.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (non-HTTPS)
    }
  }

  return (
    <div className="relative inline-flex items-center justify-center gap-5">
      <button type="button" onClick={share} className={buttonClass('secondary', false)}>
        <IconShare size={18} className="text-accent-deep" />
        Share trip
      </button>

      {qrLink && (
        <Link
          href={`/trip/${tripCode}/share`}
          className="inline-flex items-center gap-1.5 t-cap text-accent-deep hover:text-accent transition-colors duration-150"
        >
          <IconQrcode size={18} />
          QR code
        </Link>
      )}

      {/* "Link copied", fading in and out where the desktop eye already is.
          Absolutely positioned so a line appearing does not shove the status
          card below; aria-live says it out loud for a screen reader, since
          visually it is only ever a moment. */}
      <span
        aria-live="polite"
        className={`absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap t-cap text-ink/65 transition-opacity duration-300 ease-out pointer-events-none ${
          copied ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  )
}
