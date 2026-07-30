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
    <div className="w-full rounded-xl border border-emerald-500/35 bg-emerald-500/[0.06] px-4 py-3.5 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="text-emerald-300 text-sm min-w-0">
          Welcome back, <span className="font-semibold">{name}</span>
        </p>
        <button
          onClick={onNotMe}
          className="flex-shrink-0 text-white/30 text-[10px] tracking-wider uppercase hover:text-white/60 transition-colors"
        >
          Not you?
        </button>
      </div>

      {lines.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
          {lines.map(l => (
            <span key={l.label} className="flex items-baseline gap-1.5">
              <span className="text-white/30 text-[10px] tracking-wider uppercase">
                {l.label}
              </span>
              <span
                className={`tabular-nums ${
                  l.strong
                    ? 'font-[family-name:var(--font-playfair)] text-[#C9A84C] text-base leading-none'
                    : 'text-white/70 text-sm'
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
        setDismissed(true)
        // Re-render the server component, so the greeting is gone for good
        // rather than hidden until the next navigation.
        router.refresh()
      }}
    />
  )
}
