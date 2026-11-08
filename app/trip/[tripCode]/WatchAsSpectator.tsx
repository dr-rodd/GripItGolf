'use client'

import { useRouter } from 'next/navigation'
import { watchAsSpectator } from '@/lib/playerCookie'

/**
 * "Just watching? View as a spectator" (Ross, 8 Nov 2026: "allow a spectator
 * to access the event as a viewer") — under the home screen's Claim your
 * spot, on the claim screen and on an event's Settings tab. It leaves the
 * claim exactly as it was and remembers this phone as a spectator
 * (lib/playerCookie.ts): the home screen then leads with what is on next
 * rather than asking again. A spectator sees what anybody with the code can,
 * and in a relaxed match play event may score a match, as players often do.
 *
 * `goTo` sends the phone there afterwards — the claim screen back to the
 * home screen; without it the page it is on simply redraws. The router is
 * refreshed first, because the server read the cookie for the page already
 * drawn (the note in lib/currentPlayer.ts).
 */
export default function WatchAsSpectator({ tripCode, goTo, className = '' }: {
  tripCode: string
  goTo?: string
  className?: string
}) {
  const router = useRouter()
  return (
    <p className={`t-cap text-ink/65 ${className}`.trim()}>
      Just watching?{' '}
      <button
        type="button"
        onClick={() => {
          watchAsSpectator(tripCode)
          router.refresh()
          if (goTo) router.push(goTo)
        }}
        className="t-label text-accent-deep hover:text-accent transition-colors duration-150"
      >
        View as a spectator
      </button>
    </p>
  )
}
