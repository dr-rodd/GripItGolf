// The test club, the only copy of its rules (D308–D317, Ross, 24 Nov 2026).
//
// Pints Golf Club is played by fictional characters alongside Ross and a few
// real friends, so a season can be watched end to end on the live site
// without waiting for real people to play it. A club is a test club only
// while `clubs.is_test` says so (migration 103, set by hand) — nothing here
// ever turns it on.
//
// This file decides; `app/admin/test-club/wipe.ts` does, on an injected
// store, and `/admin/test-club` is the page. Pure.

/** Pints, the one test club so far — named so the page can say what it is about. */
export const PINTS_SLUG = 'pints-golf-club'

/** Where a fictional account's address lives (D308): nothing is ever sent there. */
export const TEST_EMAIL_DOMAIN = 'greendot.invalid'

/** A fictional character's address, e.g. `jed.bartlet@pints.greendot.invalid`. */
export function testEmail(username: string, clubSlug: string): string {
  const club = clubSlug.split('-')[0] || 'test'
  return `${username}@${club}.${TEST_EMAIL_DOMAIN}`
}

/** Said while migration 103 is not in. */
export const TEST_CLUB_NOT_READY = 'The test club is not set up yet — paste migration 103 first.'

// ─── The keep-list (D311) ─────────────────────────────────────────

/** The usernames typed into the keep-list: one a line or comma, trimmed, lower case, no repeats. */
export function readKeepList(raw: string): string[] {
  const out: string[] = []
  for (const part of String(raw ?? '').split(/[\n,]+/)) {
    const u = part.trim().replace(/^@/, '').toLowerCase()
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}

/** The most the keep-list holds — Ross and a few friends. */
export const MAX_KEEP = 12

// ─── The wipe (D311) ──────────────────────────────────────────────

/** One row of the club's list, as the wipe sees it. */
export interface WipeRow { id: string; userId: string | null }

/**
 * Which of the club's list rows go. Every row but a keep-list account's own
 * row — and never a keep-list account's row, even one taken off the list.
 * A fictional account in the keep-list is not kept: the characters are
 * always the wipe’s (D311 — a reseed makes them afresh).
 */
export function rowsToWipe(
  rows: readonly WipeRow[],
  keep: ReadonlySet<string>,
  fictional: ReadonlySet<string>,
): { wipe: string[]; kept: string[] } {
  const wipe: string[] = []
  const kept: string[] = []
  for (const r of rows) {
    if (r.userId && keep.has(r.userId) && !fictional.has(r.userId)) kept.push(r.id)
    else wipe.push(r.id)
  }
  return { wipe, kept }
}

/** The club's own tables a wipe empties, child before parent (each `club_id`-keyed). */
export const CLUB_TABLES = [
  'club_tee_bookings', 'club_activity', 'club_awards', 'club_events',
  'club_presets', 'club_labels', 'club_locations', 'feed_reports',
  'test_week_loads',
] as const

/** The tables whose rows outside the club are counted before and after a wipe (D311's check). */
export const OUTSIDE_TABLES = [
  'trips', 'players', 'rounds', 'scores', 'trip_members', 'club_members',
  'club_events', 'club_tee_bookings', 'card_summaries', 'feed_items',
  'account_usernames',
] as const
export type OutsideTable = (typeof OUTSIDE_TABLES)[number]
export type Counts = Partial<Record<OutsideTable, number>>

/**
 * Whether nothing outside the club changed: every table's count the same
 * before and after. The site is live, so a real trip scoring meanwhile moves
 * a count — `changed` names each table so the page can say which.
 */
export function outsideUnchanged(before: Counts, after: Counts): { same: boolean; changed: OutsideTable[] } {
  const changed = OUTSIDE_TABLES.filter(t => before[t] !== undefined && after[t] !== undefined && before[t] !== after[t])
  return { same: changed.length === 0, changed }
}

/** What a wipe will take, counted, for the page to show before it asks. */
export interface WipePreview {
  club: { id: string; name: string; slug: string }
  events: number
  listRows: number
  keptRows: number
  fictionalAccounts: number
  clubRows: Partial<Record<(typeof CLUB_TABLES)[number] | 'club_categories' | 'feed_items', number>>
  keep: { userId: string; username: string | null; onList: boolean }[]
}

/** The words a wipe must be confirmed with: the club's name, exactly (case aside). */
export function wipeConfirmed(typed: string, clubName: string): boolean {
  return String(typed ?? '').trim().toLowerCase() === clubName.trim().toLowerCase()
}

// ─── Platform figures (D316) ──────────────────────────────────────

/**
 * Whether a trip counts in a platform-wide figure — the admin's counts,
 * anything sent to Golf Ireland. A test club's events never do. Handed the
 * set of test clubs' trip ids (`testTripIds` in app/admin/test-club/store.ts).
 */
export const countsOnPlatform = (tripId: string, testTrips: ReadonlySet<string>) => !testTrips.has(tripId)
