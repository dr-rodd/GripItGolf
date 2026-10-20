// Golf Ireland — the one file that talks to it.
//
// Everything Green Dot needs from Golf Ireland is the five calls on
// `GolfIrelandClient`. Every decision about what comes back lives in
// lib/golfIreland.ts, which never sees the network; this file only fetches.
//
// **Access is assumed to come club by club** (docs/golf-ireland.md): Golf
// Ireland opens one club's members to Green Dot with that club's
// permission, and Green Dot holds one credential per club
// (`golf_ireland_clubs`, migration 056). No player signs in to Golf
// Ireland, so there is no sign-in link, no code exchange and no per-player
// token: every call is made on a club's credential.
//
// **The real calls are not written yet.** Partner access to Golf Ireland's
// Clubhouse API was asked for in October 2026, and its documentation is
// what the requests below will be written from. Until then
// `golfIrelandClient` returns a client whose every call refuses with
// `GolfIrelandNotReady`, so anything built on it fails calmly in one known
// way rather than guessing at an API. The tests run against a fake that
// keeps the same promises.
//
// When the documentation arrives, the work is: fill in the five calls,
// shape each member and card into `normaliseMember` / `normaliseCard`'s
// input (the field names in `RawMember` and `RawCard`), and nothing else
// on the platform changes.
//
// Server only — the partner keys and every club credential pass through
// here.

import type { GolfIrelandConfig } from './golfIreland'

/**
 * One club's credential. Secrets — server only, never sent to a phone. The
 * refresh half and the expiry are null when Golf Ireland issues a plain
 * key rather than tokens that expire; either shape fits.
 */
export type ClubCredential = {
  clubId: string
  accessToken: string
  refreshToken: string | null
  /** Epoch milliseconds, or null for a key that does not expire. */
  expiresAt: number | null
}

/** A club as Golf Ireland describes it — and whether its access still stands. */
export type ClubStatus = { clubId: string; name: string; active: boolean }

/**
 * A member in the shape `normaliseMember` reads. The client maps Golf
 * Ireland's own field names onto these; nothing beyond them is kept.
 */
export type RawMember = {
  memberId: unknown
  clubId: unknown
  firstName?: unknown
  surname: unknown
  handicapIndex?: unknown
}

/** A card in the shape `normaliseCard` reads. */
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
  /**
   * Does this club's access still stand? Asked before a club is trusted
   * with a league and by the nightly job. `active: false` is Golf Ireland
   * saying the club withdrew — the one answer that ends a club's access.
   * A failed request is not that answer: it throws, and is a retry.
   */
  club(cred: ClubCredential): Promise<ClubStatus>
  /** A fresh credential from the refresh half. A refusal is a retry, never a reason to delete. */
  refresh(cred: ClubCredential): Promise<ClubCredential>
  /**
   * The club's members matching a surname or a membership number. The
   * client passes the query through; `memberMatches` decides what may be
   * shown. Never cached.
   */
  searchMembers(cred: ClubCredential, query: { surname: string } | { number: string }): Promise<RawMember[]>
  /** One member, by id — their current handicap index, when a link is confirmed. Null when not a member. */
  member(cred: ClubCredential, memberId: string): Promise<RawMember | null>
  /**
   * The member's accepted cards played between two dates, inclusive. When
   * Golf Ireland pages its answer and not every page could be read,
   * `complete` is false — and a sync then removes nothing.
   */
  cards(cred: ClubCredential, memberId: string, from: string, to: string): Promise<{ cards: RawCard[]; complete: boolean }>
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
  const notReady = async (): Promise<never> => { throw new GolfIrelandNotReady() }
  return {
    club: notReady,
    refresh: notReady,
    searchMembers: notReady,
    member: notReady,
    cards: notReady,
  }
}
