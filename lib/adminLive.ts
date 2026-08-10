// The live cards page's view of the scoring sessions, and its order.
//
// The admin page answers one question the nightly job answers only at 03:00:
// which cards are hung right now, and what would closing or voiding one take
// with it. The decisions are all `lib/staleLive.ts`'s — the thresholds, the
// activity join, the close list — and this file only arranges them for a
// screen. Nothing here decides when a card is stale; it asks.
//
// Pure, no I/O. `app/admin/live/page.tsx` fetches and maps, the same shape as
// `app/api/cleanup/route.ts`.

import {
  cardsToClose, lastActivity,
  type CardLock, type LiveCard, type ScoreActivity,
} from './staleLive'

export type CardSummary = {
  id: string
  roundId: string
  /** 'active' | 'closed' | 'finalised' */
  status: string
  activatedAt: string
  /** When anybody last wrote a hole against this card. Null: never. */
  lastActivity: string | null
  /** Who is locked onto the card — the void confirmation names the count. */
  playerIds: string[]
  /** Hole rows written by this card's players on its round. */
  holesEntered: number
  /** What the nightly job would do with it right now, if anything. */
  wouldClose: 'empty' | 'abandoned' | null
}

/**
 * One row per card, with the nightly job's verdict attached.
 *
 * `holesEntered` counts this card's players' rows on this card's round —
 * the same join `lastActivity` uses, and the only one there is, because
 * `live_scores` carries no card id. Two groups on one round therefore count
 * only their own players' holes.
 */
export function summariseCards(
  cards: readonly LiveCard[],
  locks: readonly CardLock[],
  activity: readonly ScoreActivity[],
  now: Date,
): CardSummary[] {
  const closing = new Map(
    cardsToClose(cards, locks, activity, now).map(c => [c.id, c.reason]),
  )

  return cards.map(card => {
    const playerIds = locks
      .filter(l => l.liveRoundId === card.id)
      .map(l => l.playerId)
    const players = new Set(playerIds)
    const holesEntered = activity.filter(
      a => a.roundId === card.roundId && players.has(a.playerId),
    ).length

    return {
      id: card.id,
      roundId: card.roundId,
      status: card.status,
      activatedAt: card.activatedAt,
      lastActivity: lastActivity(card, locks, activity),
      playerIds,
      holesEntered,
      wouldClose: closing.get(card.id) ?? null,
    }
  })
}

/**
 * The order the page shows them in: the cards needing a hand first.
 *
 * Stale active cards, then healthy active ones, then finalised, then closed —
 * and within a group, the most recently touched first, so the card somebody
 * is asking about is near the top. A card never touched sorts by when it was
 * opened, which is the only date it has.
 */
export function orderCards(summaries: readonly CardSummary[]): CardSummary[] {
  const rank = (s: CardSummary): number => {
    if (s.status === 'active') return s.wouldClose !== null ? 0 : 1
    if (s.status === 'finalised') return 2
    return 3
  }
  const touched = (s: CardSummary): number =>
    Date.parse(s.lastActivity ?? s.activatedAt)

  return [...summaries].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    return touched(b) - touched(a)
  })
}
