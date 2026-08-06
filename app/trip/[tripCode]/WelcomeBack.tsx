'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { forgetPlayer } from '@/lib/playerCookie'

export type SummaryLine = { label: string; value: string; strong?: boolean }

/**
 * The card itself, with no behaviour of its own.
 *
 * Split out from the component below so it can be rendered on its own in a
 * test. The wrapper needs the app router, which only exists inside a running
 * Next app — testing through it would mean mocking the framework to assert on
 * markup that has nothing to do with the framework.
 */
export function WelcomeBackCard({
  name, lines, onNotMe,
}: {
  name: string
  lines: SummaryLine[]
  onNotMe: () => void
}) {
  return (
    <div className="w-full rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3.5 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="t-body text-ink min-w-0">
          Welcome back, <span className="t-card">{name}</span>
        </p>
        <button
          onClick={onNotMe}
          className="flex-shrink-0 t-cap uppercase tracking-[0.12em] text-ink/65 hover:text-ink/80 transition-colors duration-150"
        >
          Not you?
        </button>
      </div>

      {lines.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
          {lines.map(l => (
            <span key={l.label} className="flex items-baseline gap-1.5">
              <span className="t-cap uppercase tracking-[0.12em] text-ink/65">
                {l.label}
              </span>
              <span
                className={`t-num ${
                  l.strong ? 't-card text-accent-deep' : 't-data text-ink/80'
                }`}
              >
                {l.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * "Welcome back, Ross" — and their own line on the board.
 *
 * Everything shown is worked out on the server and passed in. This is a
 * client component only because of "Not you?", which clears a cookie in the
 * browser.
 *
 * That control is worth its fifteen lines. A phone gets handed round on a
 * golf trip, and without it the first person to join on a shared handset owns
 * that device's greeting for six months with no way back.
 *
 * It goes to the player list rather than refreshing in place. Refreshing left
 * somebody standing on a hub that had just stopped recognising them, with no
 * indication of what to do about it; the list is what to do about it, and now
 * that it offers confirmed players too, whoever is actually holding the phone
 * can find their own name on it.
 *
 * **Nobody is un-confirmed by this.** `claimed` stays true for the player
 * being forgotten — confirmation belongs to the player, not to the handset,
 * and a device changing hands says nothing about whether they are on the trip.
 */
export default function WelcomeBack({
  tripCode, name, lines,
}: {
  tripCode: string
  /** Their first name — this is a greeting, not a roll call. */
  name: string
  /** Ready-made pairs. Empty when they have not played yet. */
  lines: SummaryLine[]
}) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <WelcomeBackCard
      name={name}
      lines={lines}
      onNotMe={() => {
        forgetPlayer(tripCode)
        // Hidden first, so the card does not sit there through the
        // navigation still greeting somebody this device has forgotten.
        setDismissed(true)
        router.push(`/trip/${tripCode}/players`)
      }}
    />
  )
}
