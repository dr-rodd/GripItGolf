'use client'

import type { CardHole, CardSideKey, HoleOutcome } from '@/lib/matchCard'
import type { SideColour } from '@/lib/matchSides'

/**
 * Every hole of a match as a mark — trip scoring's strip, the one copy:
 * filled in the colour of whoever won it, the brown softened for a half,
 * faint for one still to play, and the hole being played (where there is
 * one) the long mark in a lighter version of its own colour, light green
 * while it has no result. No black (Ross, 25 Oct 2026). The match card
 * draws it above both its faces; the leaderboard above a match opened
 * beneath its row.
 */
export default function MatchStrip({ holes, outcomes, colours, current = null }: {
  holes: readonly CardHole[]
  outcomes: readonly HoleOutcome[]
  colours: Record<CardSideKey, SideColour>
  /** The hole being played — the long mark. None on a viewer's card. */
  current?: number | null
}) {
  const lighter = (c: string) => `color-mix(in srgb, ${c} 45%, transparent)`
  const fill = (o: HoleOutcome | undefined, isNow: boolean): string => {
    const base = o?.winner === 'A' ? colours.A.fill
      : o?.winner === 'B' ? colours.B.fill
        : o?.winner === 'halved' ? 'var(--color-bark)'
          : null
    if (isNow) return lighter(base ?? 'var(--color-accent)')
    if (!base) return 'var(--color-tint)'
    return o?.winner === 'halved' ? lighter(base) : base
  }
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="flex-1 flex gap-[3px] items-center">
        {holes.map(x => {
          const isNow = x.holeNumber === current
          const o = outcomes.find(y => y.holeNumber === x.holeNumber)
          return (
            <div
              key={x.holeNumber}
              className="h-1.5 rounded-full transition-all duration-300 ease-out"
              style={{
                flexGrow: isNow ? 1.6 : 1, flexBasis: 0, minWidth: isNow ? 18 : 0,
                backgroundColor: fill(o, isNow),
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
