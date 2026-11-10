'use client'

import type { CardSideKey, MatchCardDetail } from '@/lib/matchCard'
import type { SideColour } from '@/lib/matchSides'
import MatchStrip from './MatchStrip'
import { MatchScoresTable } from './MatchScorecard'

/**
 * A match as a viewer sees it — the strip of marks and the scores hole by
 * hole, the one copy every viewing screen draws (Ross, 10 Nov 2026: one card
 * to show slides open beneath its row; a viewer never leaves for the card to
 * score). Nothing on its card yet says so.
 */
export default function MatchDetailView({ detail, colours }: {
  detail: MatchCardDetail | null | undefined
  colours: Record<CardSideKey, SideColour>
}) {
  if (!detail) return <p className="t-cap text-ink/65 text-center py-2">Not started — nothing on its card yet.</p>
  return (
    <>
      <MatchStrip holes={detail.holes} outcomes={detail.outcomes} colours={colours} />
      <div className="mt-2">
        <MatchScoresTable a={detail.a} b={detail.b} colours={colours}
          holes={detail.holes} outcomes={detail.outcomes} scores={detail.scores} />
      </div>
    </>
  )
}
