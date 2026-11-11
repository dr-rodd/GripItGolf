import { CARD_BLOCKER_LABEL, type CardBlocker } from '@/lib/courseCard'

/**
 * "No scorecard" or "No ratings" under a course's name (D69; Ross, 11 Nov
 * 2026) — **a plain line, never a pill, never rust**: choosing the course is
 * never refused, only starting a card on it, and the tile stays tappable so
 * the tap reaches the scorecard gate. A course that can be played — researched
 * or confirmed — has no line at all. `cardBlocker` decides; this only draws.
 */
export default function CardStateLine({ blocker, className = '' }: {
  blocker: CardBlocker | null
  className?: string
}) {
  if (!blocker) return null
  return <span className={`block t-cap text-ink/65 mt-1 ${className}`.trim()}>{CARD_BLOCKER_LABEL[blocker]}</span>
}
