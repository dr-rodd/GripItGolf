// The sign step's half of the feed (D299, D306): which of a card's players is
// this account's, and the status and audience they leave on it. A status is
// never in the way of signing — typed before its card is in the feed (a club
// card waiting on its marker), it is kept **held**, shown to nobody, until the
// card arrives; a held status whose card never comes goes in the night.

import { cleanText, readAudience, statusIssue, STATUS_MAX } from '@/lib/feed'
import { done, fail, str, type FeedOutcome } from './outcome'
import type { Asker, FeedStore } from './feed'

export interface CardsStore {
  /** The round's event, and each of these players' accounts — null when the round is not that event's. */
  cardPlayers(code: string, roundId: string, playerIds: string[]): Promise<{ tripId: string; accounts: Map<string, string>; names: Map<string, string> } | null>
  /** The status and audience onto the card's item — held until the card is written, if it is not yet. */
  setCardStatus(o: { key: string; authorId: string; tripId: string; roundId: string; playerId: string; status: string | null; audience: 'wide' | 'me' | null; at: string }): Promise<void>
  /** An item this account owns, for editing its status. */
  ownItem(itemId: string, userId: string): Promise<{ id: string; kind: string } | null>
  updateStatus(itemId: string, status: string | null, at: string): Promise<void>
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 8) : [])

export async function runCards(action: string, input: Record<string, unknown>, a: Asker, store: FeedStore & CardsStore, now: Date): Promise<FeedOutcome | null> {
  if (action === 'card.mine') {
    const found = await store.cardPlayers(str(input.code).trim().toUpperCase(), str(input.roundId), ids(input.playerIds))
    if (!found) return done({ playerId: null })
    const playerId = [...found.accounts].find(([, u]) => u === a.user.id)?.[0] ?? null
    if (!playerId) return done({ playerId: null })
    const settings = await store.settings(a.user.id)
    return done({ playerId, name: found.names.get(playerId) ?? '', audience: settings.audience })
  }

  if (action === 'card.status') {
    const text = cleanText(input.text, STATUS_MAX)
    const why = statusIssue(text)
    if (why) return fail(400, why)
    const audience = input.audience === null || input.audience === undefined ? null : readAudience(input.audience)
    const playerId = str(input.playerId)
    const roundId = str(input.roundId)
    const found = await store.cardPlayers(str(input.code).trim().toUpperCase(), roundId, [playerId])
    if (!found || found.accounts.get(playerId) !== a.user.id) return fail(403, 'Only the player leaves a status on their own card.')
    await store.setCardStatus({
      key: `card:${roundId}:${playerId}`, authorId: a.user.id, tripId: found.tripId, roundId, playerId,
      status: text || null, audience, at: now.toISOString(),
    })
    return done()
  }

  // The owner edits or deletes their status afterwards (D299).
  if (action === 'status.edit') {
    const text = cleanText(input.text, STATUS_MAX)
    const why = statusIssue(text)
    if (why) return fail(400, why)
    const item = await store.ownItem(str(input.itemId), a.user.id)
    if (!item || item.kind !== 'card') return fail(404, 'That card isn’t yours.')
    await store.updateStatus(item.id, text || null, now.toISOString())
    return done({ status: text || null })
  }

  return null
}
