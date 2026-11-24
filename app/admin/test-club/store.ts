// The service role's store for the test club (D308–D317): the wipe's reads
// and deletes, the keep-list, and which trips belong to a test club (D316).
// Server only — the admin page's actions and the platform figures use it.

import type { createAdminClient } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteTrip } from '@/lib/tripDelete'
import { why } from '@/lib/writeFailure'
import { isMissingColumn } from '@/app/api/club/rows'
import { CLUB_TABLES, OUTSIDE_TABLES, type Counts, type OutsideTable, type WipePreview } from '@/lib/testClub'
import type { WipeStore, TestClub } from './wipe'

type Db = ReturnType<typeof createAdminClient>

/** A table not there yet (migration 103) — read as nothing, never as a failure. */
const missingTable = (e: { code?: string } | null | undefined) => !!e && (e.code === '42P01' || e.code === 'PGRST205')

/** `ids` cut into lists short enough for an address. */
function chunks<T>(ids: readonly T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

async function count(q: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>): Promise<number> {
  const { count: n, error } = await q
  if (error) throw error
  return n ?? 0
}

/** The test clubs — none before migration 103. */
export async function testClubs(db: Db): Promise<{ id: string; name: string; slug: string }[]> {
  const { data, error } = await db.from('clubs').select('id, name, slug').eq('is_test', true).order('name')
  if (error) { if (isMissingColumn(error)) return []; throw error }
  return (data ?? []) as { id: string; name: string; slug: string }[]
}

/** Every event under a club. */
async function eventIdsOf(db: Db, clubIds: string[]): Promise<string[]> {
  if (clubIds.length === 0) return []
  const { data, error } = await db.from('trip_private').select('trip_id').in('club_id', clubIds)
  if (error) throw error
  return ((data ?? []) as { trip_id: string }[]).map(r => r.trip_id)
}

/**
 * Every trip under a test club (D316) — what a platform-wide figure leaves
 * out. Empty before migration 103, or on any failure: a figure that counts a
 * test event is better than a page that will not load.
 */
export async function testTripIds(db: Db): Promise<Set<string>> {
  try {
    return new Set(await eventIdsOf(db, (await testClubs(db)).map(c => c.id)))
  } catch (e) {
    console.error('test trips not read:', e)
    return new Set()
  }
}

/** Whether a club is a test club (D316) — no on any failure. */
export async function isTestClubId(db: Db, clubId: string): Promise<boolean> {
  const { data, error } = await db.from('clubs').select('is_test').eq('id', clubId).maybeSingle()
  if (error) return false
  return !!(data as { is_test?: boolean } | null)?.is_test
}

/** Whether one trip is a test club's (D316) — no on any failure. */
export async function isTestTrip(db: Db | SupabaseClient, tripId: string): Promise<boolean> {
  const { data, error } = await db.from('trip_private').select('club_id').eq('trip_id', tripId).maybeSingle()
  const clubId = error ? null : (data as { club_id?: string | null } | null)?.club_id ?? null
  return clubId ? isTestClubId(db as Db, clubId) : false
}

export function wipeStore(db: Db): WipeStore {
  const fictionalIds = async (clubId: string): Promise<string[]> => {
    const { data, error } = await db.from('test_accounts').select('user_id').eq('club_id', clubId)
    if (error) { if (missingTable(error)) return []; throw error }
    return ((data ?? []) as { user_id: string }[]).map(r => r.user_id)
  }
  const roundIdsOf = async (tripIds: string[]): Promise<string[]> => {
    const out: string[] = []
    for (const part of chunks(tripIds)) {
      const { data, error } = await db.from('rounds').select('id').in('trip_id', part)
      if (error) throw error
      for (const r of (data ?? []) as { id: string }[]) out.push(r.id)
    }
    return out
  }
  /** Rows of `table` whose `col` is in `ids`, counted in pieces. */
  const countIn = async (table: string, col: string, ids: string[]): Promise<number> => {
    let n = 0
    for (const part of chunks(ids)) n += await count(db.from(table).select('*', { count: 'exact', head: true }).in(col, part))
    return n
  }
  const whole = (table: string) => count(db.from(table).select('*', { count: 'exact', head: true }))

  return {
    async club(clubId): Promise<TestClub | null | 'not_ready'> {
      const { data, error } = await db.from('clubs').select('id, name, slug, is_test').eq('id', clubId).maybeSingle()
      if (error) { if (isMissingColumn(error)) return 'not_ready'; throw error }
      const r = data as { id: string; name: string; slug: string; is_test: boolean } | null
      return r ? { id: r.id, name: r.name, slug: r.slug, isTest: !!r.is_test } : null
    },
    async keepList(clubId) {
      const { data, error } = await db.from('test_club_keep').select('user_id').eq('club_id', clubId)
      if (error) { if (missingTable(error)) return []; throw error }
      const ids = ((data ?? []) as { user_id: string }[]).map(r => r.user_id)
      if (ids.length === 0) return []
      const { data: names, error: nErr } = await db.from('account_usernames').select('user_id, username').in('user_id', ids)
      if (nErr) throw nErr
      const by = new Map(((names ?? []) as { user_id: string; username: string }[]).map(n => [n.user_id, n.username]))
      return ids.map(userId => ({ userId, username: by.get(userId) ?? null }))
    },
    fictionalIds,
    async listRows(clubId) {
      const { data, error } = await db.from('club_members').select('id, user_id, role').eq('club_id', clubId)
      if (error) throw error
      return ((data ?? []) as { id: string; user_id: string | null; role: string }[]).map(r => ({ id: r.id, userId: r.user_id, owner: r.role === 'owner' }))
    },
    eventIds: clubId => eventIdsOf(db, [clubId]),
    async clubRowCounts(clubId) {
      const out: WipePreview['clubRows'] = {}
      for (const t of [...CLUB_TABLES, 'club_categories'] as const) {
        const { count: n, error } = await db.from(t).select('*', { count: 'exact', head: true }).eq('club_id', clubId)
        if (error) { if (missingTable(error)) continue; throw error }
        out[t] = n ?? 0
      }
      out.feed_items = await count(db.from('feed_items').select('*', { count: 'exact', head: true }).eq('club_id', clubId).is('trip_id', null))
        .catch(e => { if (missingTable(e)) return 0; throw e })
      return out
    },
    async outsideCounts(clubId) {
      const [trips, fictional] = await Promise.all([eventIdsOf(db, [clubId]), fictionalIds(clubId)])
      const rounds = await roundIdsOf(trips)
      const inside: Record<OutsideTable, () => Promise<number>> = {
        trips: () => countIn('trips', 'id', trips),
        players: () => countIn('players', 'trip_id', trips),
        rounds: () => countIn('rounds', 'trip_id', trips),
        scores: () => countIn('scores', 'round_id', rounds),
        trip_members: () => countIn('trip_members', 'trip_id', trips),
        club_members: () => count(db.from('club_members').select('*', { count: 'exact', head: true }).eq('club_id', clubId)),
        club_events: () => count(db.from('club_events').select('*', { count: 'exact', head: true }).eq('club_id', clubId)),
        club_tee_bookings: () => count(db.from('club_tee_bookings').select('*', { count: 'exact', head: true }).eq('club_id', clubId)),
        card_summaries: () => countIn('card_summaries', 'trip_id', trips),
        // The club's items: on its events, on the club itself, or written by
        // one of its characters — counted once each (three sets that do not
        // overlap).
        feed_items: async () => {
          const onEvents = await countIn('feed_items', 'trip_id', trips)
          const notOnEvents = trips.length ? `trip_id.is.null,trip_id.not.in.(${trips.join(',')})` : null
          let onClub = db.from('feed_items').select('*', { count: 'exact', head: true }).eq('club_id', clubId)
          if (notOnEvents) onClub = onClub.or(notOnEvents)
          let n = onEvents + await count(onClub)
          for (const part of chunks(fictional)) {
            let q = db.from('feed_items').select('*', { count: 'exact', head: true }).in('author_id', part)
              .or(`club_id.is.null,club_id.neq.${clubId}`)
            if (notOnEvents) q = q.or(notOnEvents)
            n += await count(q)
          }
          return n
        },
        account_usernames: () => countIn('account_usernames', 'user_id', fictional),
      }
      const out: Counts = {}
      await Promise.all(OUTSIDE_TABLES.map(async t => {
        try {
          out[t] = (await whole(t)) - (await inside[t]())
        } catch (e) {
          // A table not there yet (an older database) is simply not counted.
          if (!missingTable(e as { code?: string })) throw e
        }
      }))
      return out
    },
    async deleteEvent(tripId) {
      const failure = await deleteTrip(db, tripId)
      return failure ? why(failure).replace(/^[\s:—-]+/, '') || 'try again' : null
    },
    async deleteClubRows(clubId) {
      for (const t of CLUB_TABLES) {
        const { error } = await db.from(t).delete().eq('club_id', clubId)
        if (error && !missingTable(error)) throw error
      }
      // The club's own feed items with no event (a handicap cut, a win), then
      // its memberships — the list's rows lose theirs (ON DELETE SET NULL) and
      // a reseed makes them afresh.
      const { error: fErr } = await db.from('feed_items').delete().eq('club_id', clubId).is('trip_id', null)
      if (fErr && !missingTable(fErr)) throw fErr
      const { error: cErr } = await db.from('club_categories').delete().eq('club_id', clubId)
      if (cErr && !missingTable(cErr)) throw cErr
    },
    async deleteListRows(ids) {
      for (const part of chunks(ids)) {
        const { error } = await db.from('club_members').delete().in('id', part)
        if (error) throw error
      }
    },
    async deleteAccount(userId) {
      const { error } = await db.auth.admin.deleteUser(userId)
      if (error && !/not.?found/i.test(error.message)) throw error
    },
  }
}
