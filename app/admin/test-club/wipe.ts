// Wiping a test club (D311, D314), on an injected store so `test:test-club`
// runs it against a stand-in. `store.ts` is the service role's.
//
// Order, each step finding what is left so a wipe cut short is finished by
// pressing again:
//   1. every event under the club (`trip_private.club_id`), through
//      lib/tripDelete — its players, rounds, scores, signatures, summaries
//      and feed items go with it by the database's own cascades;
//   2. the club's own tables (CLUB_TABLES), its feed items, its memberships;
//   3. its list, every row but the keep-list's own (`rowsToWipe`);
//   4. the fictional accounts (`test_accounts`), which takes their username,
//      details, handicap, friendships and feed with them.
// The club's own row — name, address, crest, art, colour, home course — stays.

import {
  rowsToWipe, wipeConfirmed, type Counts, type WipePreview, type WipeRow,
  outsideUnchanged, TEST_CLUB_NOT_READY,
} from '@/lib/testClub'

export interface TestClub { id: string; name: string; slug: string; isTest: boolean }

export interface WipeStore {
  /** null before migration 103 (no `is_test`). */
  club(clubId: string): Promise<TestClub | null | 'not_ready'>
  keepList(clubId: string): Promise<{ userId: string; username: string | null }[]>
  fictionalIds(clubId: string): Promise<string[]>
  listRows(clubId: string): Promise<WipeRow[]>
  eventIds(clubId: string): Promise<string[]>
  clubRowCounts(clubId: string): Promise<WipePreview['clubRows']>
  /** Every row outside the club, by table — the check that nothing else changed. */
  outsideCounts(clubId: string): Promise<Counts>
  deleteEvent(tripId: string): Promise<string | null>
  deleteClubRows(clubId: string): Promise<void>
  deleteListRows(ids: string[]): Promise<void>
  deleteAccount(userId: string): Promise<void>
}

export type WipeOutcome =
  | { ok: true; done: boolean; deleted: { events: number; listRows: number; accounts: number }; before: Counts; after: Counts; changed: string[] }
  | { ok: false; error: string }

/** What a wipe will take — read only. */
export async function previewWipe(store: WipeStore, clubId: string): Promise<{ ok: true; preview: WipePreview } | { ok: false; error: string }> {
  const club = await store.club(clubId)
  if (club === 'not_ready') return { ok: false, error: TEST_CLUB_NOT_READY }
  if (!club) return { ok: false, error: 'No such club.' }
  if (!club.isTest) return { ok: false, error: `${club.name} is not a test club — only a test club can be wiped.` }
  const [keep, fictional, rows, events, clubRows] = await Promise.all([
    store.keepList(clubId), store.fictionalIds(clubId), store.listRows(clubId), store.eventIds(clubId), store.clubRowCounts(clubId),
  ])
  const keepIds = new Set(keep.map(k => k.userId))
  const plan = rowsToWipe(rows, keepIds, new Set(fictional))
  const onList = new Set(rows.map(r => r.userId).filter(Boolean))
  return {
    ok: true,
    preview: {
      club: { id: club.id, name: club.name, slug: club.slug },
      events: events.length, listRows: plan.wipe.length, keptRows: plan.kept.length,
      fictionalAccounts: fictional.length, clubRows,
      keep: keep.map(k => ({ ...k, onList: onList.has(k.userId) })),
    },
  }
}

/** The wipe. Refused unless the club is a test club and its name is typed. */
export async function runWipe(store: WipeStore, clubId: string, typed: string, deadline: number, now: () => number = Date.now): Promise<WipeOutcome> {
  const club = await store.club(clubId)
  if (club === 'not_ready') return { ok: false, error: TEST_CLUB_NOT_READY }
  if (!club) return { ok: false, error: 'No such club.' }
  if (!club.isTest) return { ok: false, error: `${club.name} is not a test club — only a test club can be wiped.` }
  if (!wipeConfirmed(typed, club.name)) return { ok: false, error: `Type ${club.name} exactly to confirm.` }

  const before = await store.outsideCounts(clubId)
  const deleted = { events: 0, listRows: 0, accounts: 0 }

  // 1. Events — one at a time, stopping short of the deadline; pressing
  //    again carries on from what is left.
  for (const id of await store.eventIds(clubId)) {
    if (now() > deadline) return finish(false)
    const failure = await store.deleteEvent(id)
    if (failure) return { ok: false, error: `Could not delete one of the club’s events (${failure}) — press again to carry on.` }
    deleted.events++
  }

  // 2–3. The club's own rows, then its list but the keep-list's rows.
  const [keep, fictional, rows] = await Promise.all([store.keepList(clubId), store.fictionalIds(clubId), store.listRows(clubId)])
  await store.deleteClubRows(clubId)
  const plan = rowsToWipe(rows, new Set(keep.map(k => k.userId)), new Set(fictional))
  await store.deleteListRows(plan.wipe)
  deleted.listRows = plan.wipe.length

  // 4. The fictional accounts — never one on the keep-list (D314).
  const keepIds = new Set(keep.map(k => k.userId))
  for (const id of fictional) {
    if (keepIds.has(id)) continue
    if (now() > deadline) return finish(false)
    await store.deleteAccount(id)
    deleted.accounts++
  }
  return finish(true)

  async function finish(done: boolean): Promise<WipeOutcome> {
    const after = await store.outsideCounts(clubId)
    return { ok: true, done, deleted, before, after, changed: outsideUnchanged(before, after).changed }
  }
}
