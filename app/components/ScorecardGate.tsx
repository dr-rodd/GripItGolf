'use client'

import { useRouter } from 'next/navigation'
import CardCheck from '@/app/scoring/CardCheck'
import { GATE_TITLE, gateLine, type CardBlocker } from '@/lib/courseCard'
import { mayScoreCard } from '@/lib/matchCard'
import { IconCamera } from './icons'
import { cardClass } from './ui'
import { useUnlocked } from './useUnlocked'

/**
 * One scorecard gate for every card (D68; Ross, 11 Nov 2026). Drawn by every
 * door that starts a card — a stroke round, a knockout or session match card,
 * a league period's Start a card — in place of starting, while `cardBlocker`
 * (lib/courseCard.ts) says the course cannot be scored.
 *
 * `none`: the photo of the printed card, `CardCheck`'s create mode, the
 * screen's one emerald action. Once the eighteen are saved `onReady` hands
 * them up and the door carries on in place; a server page passes none and
 * is refreshed in place (`router.refresh()`, never a reload). `unrated`: the
 * same card with no button — a photo will not fix it — saying who can (never
 * Trip Setup on an event, whose field never sees it).
 *
 * **Whoever may start the card may photograph it** (D71), trips and events
 * alike. A stroke round's and a period card's doors are already behind that
 * rule; a match card hands `match` and the gate asks `mayScoreCard` — its
 * players, the organiser with the lock open, or anybody while the event's
 * scoring permission is on.
 */
export default function ScorecardGate({ blocker, courseId, tripCode, event, onReady, match }: {
  blocker: CardBlocker
  courseId: string
  tripCode?: string
  /** An event: "Ask the organiser"; a trip: "Add them in Trip Setup". */
  event: boolean
  /** The new card's holes and tees, as the apply route returned them. */
  onReady?: (holes: unknown[], tees: unknown[]) => void
  /** A match card: who may start it, the card's own rule. */
  match?: { decided: boolean; inMatch: boolean; anyoneScores: boolean; pinSet: boolean }
}) {
  const router = useRouter()
  const [unlocked] = useUnlocked(tripCode ?? '')
  const allowed = !match || mayScoreCard({
    decided: match.decided,
    organiser: !match.pinSet || unlocked,
    inMatch: match.inMatch,
    anyoneScores: match.anyoneScores,
  })

  if (blocker === 'none' && allowed) {
    return (
      <CardCheck
        face="gate"
        gateLine={gateLine('none', event)}
        courseId={courseId}
        tripCode={tripCode}
        onApplied={(holes, tees) => (onReady ? onReady(holes, tees) : router.refresh())}
      />
    )
  }
  const line = blocker === 'none'
    ? 'The players in this match or the organiser can photograph the printed card.'
    : gateLine('unrated', event)
  return (
    <div className={`${cardClass('raised')} p-5`}>
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-tile bg-tint text-ink/65 flex items-center justify-center flex-shrink-0" aria-hidden>
          <IconCamera size={20} />
        </span>
        <div className="min-w-0">
          <p className="t-card text-ink">{GATE_TITLE[blocker]}</p>
          <p className="t-cap text-ink/65 mt-1 leading-snug">{line}</p>
        </div>
      </div>
    </div>
  )
}
