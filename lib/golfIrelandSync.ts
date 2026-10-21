// Reading a league's Golf Ireland cards — one pass over its confirmed links.
//
// lib/golfIreland.ts decides every rule; lib/golfIrelandClient.ts is the
// one file that talks to Golf Ireland. This is the loop between them: for
// each linked member, the club's credential (refreshed when it is about to
// run out), the member's cards in the league's window, each one checked
// (`normaliseCard`), and the plan (`planImport`) carried out against a
// store. The store is an interface so the tests run the whole pass against
// a fake Golf Ireland and a fake table; app/api/golf-ireland/sync.ts is
// the one on the service role.
//
// Three rules, the same ones Strava's sync keeps:
//
//   · **A list cut short removes nothing.** So does a list holding a card
//     that would not check: a stored card missing from it may be that card,
//     unreadable this time rather than withdrawn.
//   · **A refused request is a retry, never a deletion.** One member
//     failing is counted and the pass goes on to the next.
//   · **Until Golf Ireland's documentation arrives the client refuses every
//     call** (`GolfIrelandNotReady`), and the pass stops at the first one
//     and says so, having written nothing.

import {
  normaliseCard, planImport,
  type CardContext, type GolfIrelandCard, type GolfIrelandRules, type StoredCard,
} from './golfIreland'
import type { ClubCredential, GolfIrelandClient } from './golfIrelandClient'

/** A confirmed link whose club's access stands — the only links read. */
export type SyncTarget = { playerId: string; memberId: string; clubId: string }

/** Where the cards and the credentials live. */
export type SyncStore = {
  /** The club's credential, or null when it has none (or has withdrawn). */
  credential(clubId: string): Promise<ClubCredential | null>
  /** A refreshed credential, kept for next time. */
  saveCredential(cred: ClubCredential): Promise<void>
  /** The cards already held for this player in this league. */
  held(playerId: string): Promise<StoredCard[]>
  /** Write these cards — new ones, and fresh copies of ones already held. */
  write(playerId: string, cards: GolfIrelandCard[]): Promise<void>
  remove(playerId: string, cardIds: string[]): Promise<void>
  /** The link was read in full just now. */
  synced(playerId: string, at: string): Promise<void>
}

export type SyncResult =
  | { state: 'not_ready' }
  | {
      state: 'done'
      /** Links read without a hitch. */
      read: number
      added: number
      refreshed: number
      removed: number
      /** Players whose cards could not be read this time — a retry, nothing removed. */
      failed: string[]
    }

/** A credential this close to running out is refreshed first. */
export const REFRESH_MARGIN_MS = 60_000

export async function syncCards(args: {
  client: GolfIrelandClient
  store: SyncStore
  targets: readonly SyncTarget[]
  rules: GolfIrelandRules
  /** The context each player's cards are read against — their live days differ. */
  ctxFor: (playerId: string) => CardContext
  /** The dates asked of Golf Ireland, inclusive. */
  window: { from: string; to: string }
  now: number
}): Promise<SyncResult> {
  const { client, store, targets, rules, ctxFor, window, now } = args
  const creds = new Map<string, ClubCredential | null>()
  let read = 0, added = 0, refreshed = 0, removed = 0
  const failed: string[] = []

  for (const t of targets) {
    try {
      if (!creds.has(t.clubId)) {
        let cred = await store.credential(t.clubId)
        if (cred && cred.expiresAt !== null && cred.refreshToken && cred.expiresAt <= now + REFRESH_MARGIN_MS) {
          cred = await client.refresh(cred)
          await store.saveCredential(cred)
        }
        creds.set(t.clubId, cred)
      }
      const cred = creds.get(t.clubId)
      if (!cred) { failed.push(t.playerId); continue }

      const listed = await client.cards(cred, t.memberId, window.from, window.to)
      const fetched = listed.cards.map(normaliseCard).filter((c): c is GolfIrelandCard => c !== null)
      const stored = await store.held(t.playerId)
      const plan = planImport({
        stored, fetched, rules, ctx: ctxFor(t.playerId),
        complete: listed.complete && fetched.length === listed.cards.length,
      })

      if (plan.upsert.length > 0) await store.write(t.playerId, plan.upsert)
      if (plan.remove.length > 0) await store.remove(t.playerId, plan.remove)
      await store.synced(t.playerId, new Date(now).toISOString())

      const held = new Set(stored.map(s => s.cardId))
      added += plan.upsert.filter(c => !held.has(c.cardId)).length
      refreshed += plan.upsert.filter(c => held.has(c.cardId)).length
      removed += plan.remove.length
      read++
    } catch (e) {
      // The placeholder client: nothing can be read for anybody, so stop.
      if (e instanceof Error && e.name === 'GolfIrelandNotReady') return { state: 'not_ready' }
      console.error('golf-ireland sync failed for a player:', e)
      failed.push(t.playerId)
    }
  }
  return { state: 'done', read, added, refreshed, removed, failed }
}

/** What a fetch button says afterwards — "3 new rounds read in." and so on. */
export function describeSync(result: SyncResult, scope: 'mine' | 'all'): string {
  if (result.state === 'not_ready') {
    return 'Golf Ireland is not connected yet. Access has been asked for, and rounds are read in once it is granted.'
  }
  if (result.read === 0 && result.failed.length === 0) {
    return scope === 'mine' ? 'Your link is not confirmed yet.' : 'Nobody is linked and confirmed yet.'
  }
  const parts: string[] = []
  if (result.added > 0) parts.push(result.added === 1 ? 'One new round read in.' : `${result.added} new rounds read in.`)
  else if (result.read > 0) parts.push('No new rounds.')
  if (result.removed > 0) {
    parts.push(result.removed === 1 ? 'One round no longer counts.' : `${result.removed} rounds no longer count.`)
  }
  if (result.failed.length > 0) {
    parts.push(scope === 'mine'
      ? 'Could not read your rounds just now — try again later.'
      : result.failed.length === 1
        ? 'One player’s rounds could not be read just now — try again later.'
        : `${result.failed.length} players’ rounds could not be read just now — try again later.`)
  }
  return parts.join(' ')
}
