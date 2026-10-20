// Golf Ireland — the one file that talks to it.
//
// Everything Green Dot needs from Golf Ireland is the five calls on
// `GolfIrelandClient`. Every decision about what comes back lives in
// lib/golfIreland.ts, which never sees the network; this file only fetches.
//
// **The real calls are not written yet.** Partner access to Golf Ireland's
// Clubhouse API was asked for in October 2026 (the email is in
// docs/golf-ireland.md), and its documentation is what the requests below
// will be written from. Until then `golfIrelandClient` returns a client
// whose every call refuses with `GolfIrelandNotReady`, so anything built on
// it fails calmly in one known way rather than guessing at an API. The
// tests run against a fake that keeps the same promises.
//
// When the documentation arrives, the work is: fill in the five calls,
// shape each card into `normaliseCard`'s input (the field names in
// `RawCard`), and nothing else on the platform changes.
//
// Server only — the client secret and every token pass through here.

import type { GolfIrelandConfig } from './golfIreland'

/** Tokens for one linked Golf Ireland member. Secrets — server only. */
export type GolfIrelandTokens = {
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds. */
  expiresAt: number
}

/** Who a token belongs to, as Golf Ireland says. */
export type GolfIrelandMember = {
  memberId: string
  name: string
  /** The member's current handicap index, when Golf Ireland says. */
  handicapIndex: number | null
}

/**
 * A card in the shape `normaliseCard` reads. The client maps Golf
 * Ireland's own field names onto these; nothing beyond them is kept.
 */
export type RawCard = {
  cardId: unknown
  playedOn: unknown
  holesPlayed: unknown
  courseId?: unknown
  courseName?: unknown
  grossTotal?: unknown
  stablefordPoints?: unknown
  handicapIndex?: unknown
  courseHandicap?: unknown
  holeScores?: unknown
}

export interface GolfIrelandClient {
  /** Golf Ireland's sign-in page for linking, carrying our signed `state`. */
  authorizeUrl(redirectUri: string, state: string): string
  /** The code from the sign-in page, swapped for tokens and the member they belong to. */
  exchangeCode(code: string, redirectUri: string): Promise<{ tokens: GolfIrelandTokens; member: GolfIrelandMember }>
  /** Fresh tokens from a refresh token. A refusal is a retry, never a reason to delete. */
  refresh(refreshToken: string): Promise<GolfIrelandTokens>
  /**
   * The member's accepted cards played between two dates, inclusive. When
   * Golf Ireland pages its answer and not every page could be read,
   * `complete` is false — and a sync then removes nothing.
   */
  cards(accessToken: string, from: string, to: string): Promise<{ cards: RawCard[]; complete: boolean }>
  /** Tell Golf Ireland the member has unlinked. Best effort. */
  revoke(accessToken: string): Promise<void>
}

/** Every call of the placeholder client refuses with this. */
export class GolfIrelandNotReady extends Error {
  constructor() {
    super('Golf Ireland is not connected yet.')
    this.name = 'GolfIrelandNotReady'
  }
}

/**
 * The client for the configured keys. Until Golf Ireland's documentation
 * arrives, a placeholder that refuses every call — see the note at the top.
 */
export function golfIrelandClient(_cfg: GolfIrelandConfig): GolfIrelandClient {
  const notReady = (): never => { throw new GolfIrelandNotReady() }
  return {
    authorizeUrl: notReady,
    exchangeCode: async () => notReady(),
    refresh: async () => notReady(),
    cards: async () => notReady(),
    revoke: async () => notReady(),
  }
}
