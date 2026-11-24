// The feed's service-role store (./feed.ts's FeedStore). Every table is
// server only (migration 102); every read is fail-soft before it — the
// route answers "not set up yet" and Home draws no feed.

import type { createAdminClient } from '@/lib/supabase-admin'
import { makeCopyKeeper } from '@/lib/sharedCopy'
import { DEFAULT_AUDIENCE, FEED_COPY_SECONDS, readAudience, type Audience, type CompRef, type FeedKind } from '@/lib/feed'
import { asUser } from '../account/store'
import type { ClubRef, FeedStore, ItemRow, Settings, StreamQuery } from './feed'

export type Db = ReturnType<typeof createAdminClient>

export const ITEM_COLS = 'id, key, kind, author_id, parent_id, trip_id, round_id, player_id, club_id, data, status, audience, held, created_at, edited_at, removed_at'

export type ItemDbRow = {
  id: string; key: string | null; kind: FeedKind; author_id: string | null; parent_id: string | null
  trip_id: string | null; round_id: string | null; player_id: string | null; club_id: string | null
  data: Record<string, unknown> | null; status: string | null; audience: string | null; held: boolean
  created_at: string; edited_at: string | null; removed_at: string | null
}

export function asItem(r: ItemDbRow): ItemRow {
  return {
    id: r.id, key: r.key, kind: r.kind, authorId: r.author_id, parentId: r.parent_id,
    tripId: r.trip_id, roundId: r.round_id, playerId: r.player_id, clubId: r.club_id,
    data: r.data && typeof r.data === 'object' ? r.data : {}, status: r.status,
    audience: readAudience(r.audience), held: r.held, createdAt: r.created_at,
    editedAt: r.edited_at, removedAt: r.removed_at,
  }
}

/** One copy per server for the Club and Comp streams' first pages (D305). */
const copies = makeCopyKeeper<unknown>({ maxAgeMs: FEED_COPY_SECONDS * 1000, holdMs: 10 * 60_000 })

/** Whether 102 is in — once yes, never asked again by this server. */
let readyOnce = false

export async function feedReady(db: Db): Promise<boolean> {
  if (readyOnce) return true
  const { error } = await db.from('feed_settings').select('user_id', { head: true, count: 'exact' }).limit(1)
  if (!error) readyOnce = true
  return !error
}

/** Accounts on a Junior membership on any club's list (D230, migration 102's `junior`). */
export async function juniorsByMembership(db: Db, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await db.from('club_members')
    .select('user_id, category:club_categories(junior)')
    .in('user_id', userIds).is('removed_at', null)
  if (error) return new Set()
  const out = new Set<string>()
  for (const r of (data ?? []) as unknown as { user_id: string; category: { junior?: boolean } | { junior?: boolean }[] | null }[]) {
    const c = Array.isArray(r.category) ? r.category[0] : r.category
    if (c?.junior) out.add(r.user_id)
  }
  return out
}

/** A junior's profile (D108): `app_metadata.junior`, set only by the server — asked one account at a time. */
export async function juniorProfile(db: Db, userId: string): Promise<boolean> {
  const { data } = await db.auth.admin.getUserById(userId).catch(() => ({ data: null }))
  return (data?.user?.app_metadata as Record<string, unknown> | undefined)?.junior === true
}

export async function myClubsOf(db: Db, userId: string): Promise<ClubRef[]> {
  const { data, error } = await db.from('club_members')
    .select('clubs!inner(id, slug, name, verified_at)')
    .eq('user_id', userId).is('removed_at', null)
  if (error) return []
  const seen = new Map<string, ClubRef>()
  for (const r of (data ?? []) as unknown as { clubs: { id: string; slug: string; name: string; verified_at: string | null } | null }[]) {
    const c = r.clubs
    if (c?.verified_at && !seen.has(c.id)) seen.set(c.id, { id: c.id, slug: c.slug, name: c.name })
  }
  return [...seen.values()]
}

export async function friendIdsOf(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db.from('friendships').select('user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`).eq('accepted', true)
  if (error) return []
  return ((data ?? []) as { user_a: string; user_b: string }[]).map(r => (r.user_a === userId ? r.user_b : r.user_a))
}

/** The trips an account plays in: a player linked to it (D134), or one made from its place on a club's list (D163). */
export async function tripsPlayedBy(db: Db, userId: string): Promise<Map<string, string[]>> {
  const [linked, rows] = await Promise.all([
    db.from('account_players').select('trip_id, player_id').eq('user_id', userId),
    db.from('club_members').select('id').eq('user_id', userId).is('removed_at', null),
  ])
  const out = new Map<string, string[]>()
  const add = (trip: string, player: string) => out.set(trip, [...(out.get(trip) ?? []), player])
  for (const r of (linked.data ?? []) as { trip_id: string; player_id: string }[]) add(r.trip_id, r.player_id)
  const rowIds = ((rows.data ?? []) as { id: string }[]).map(r => r.id)
  if (rowIds.length) {
    const made = await db.from('players').select('id, trip_id').in('club_member_id', rowIds)
    if (!made.error) for (const p of (made.data ?? []) as { id: string; trip_id: string }[]) if (!out.get(p.trip_id)?.includes(p.id)) add(p.trip_id, p.id)
  }
  return out
}

/**
 * How an account is named in the feed and to its friends: its name on a
 * club's list (and that club), else its username, else nobody's name.
 */
export async function namesOf(db: Db, userIds: string[]): Promise<Map<string, { name: string; club: string | null }>> {
  const out = new Map<string, { name: string; club: string | null }>()
  if (userIds.length === 0) return out
  const { data } = await db.from('club_members').select('user_id, name, clubs(name)').in('user_id', userIds).is('removed_at', null)
  for (const r of (data ?? []) as unknown as { user_id: string; name: string; clubs: { name: string } | { name: string }[] | null }[]) {
    if (out.has(r.user_id)) continue
    const c = Array.isArray(r.clubs) ? r.clubs[0] : r.clubs
    out.set(r.user_id, { name: r.name, club: c?.name ?? null })
  }
  const rest = userIds.filter(id => !out.has(id))
  if (rest.length) {
    const { data: u } = await db.from('account_usernames').select('user_id, username').in('user_id', rest)
    for (const r of (u ?? []) as { user_id: string; username: string }[]) out.set(r.user_id, { name: r.username, club: null })
  }
  return out
}

export function feedStore(db: Db): FeedStore {
  return {
    async userFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : asUser(data.user)
    },
    ready: () => feedReady(db),
    async settings(userId): Promise<Settings> {
      const { data } = await db.from('feed_settings').select('audience, streams, comments_seen_at').eq('user_id', userId).maybeSingle()
      const r = data as { audience: string; streams: unknown; comments_seen_at: string | null } | null
      return { audience: readAudience(r?.audience) ?? DEFAULT_AUDIENCE, streams: r?.streams ?? null, commentsSeenAt: r?.comments_seen_at ?? null }
    },
    async saveSettings(userId, patch) {
      const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
      if (patch.audience) row.audience = patch.audience
      if (patch.streams) row.streams = patch.streams
      if (patch.commentsSeenAt) row.comments_seen_at = patch.commentsSeenAt
      const { error } = await db.from('feed_settings').upsert(row, { onConflict: 'user_id' })
      if (error) throw error
    },
    async audiences(userIds) {
      const out = new Map<string, Audience>()
      if (userIds.length === 0) return out
      const { data } = await db.from('feed_settings').select('user_id, audience').in('user_id', userIds)
      for (const r of (data ?? []) as { user_id: string; audience: string }[]) out.set(r.user_id, readAudience(r.audience) ?? DEFAULT_AUDIENCE)
      return out
    },
    juniors: ids => juniorsByMembership(db, ids),
    myClubs: userId => myClubsOf(db, userId),
    friendIds: userId => friendIdsOf(db, userId),
    async items(q: StreamQuery) {
      let r = db.from('feed_items').select(ITEM_COLS)
        .or('parent_id.is.null,kind.eq.comment')
        .is('removed_at', null).eq('held', false)
      if (q.authors) r = r.in('author_id', q.authors.length ? q.authors : ['00000000-0000-0000-0000-000000000000'])
      if (q.clubId) r = r.eq('club_id', q.clubId)
      if (q.tripId) r = r.eq('trip_id', q.tripId)
      if (q.before) r = r.or(`created_at.lt."${q.before.at}",and(created_at.eq."${q.before.at}",id.lt.${q.before.id})`)
      const { data, error } = await r.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(q.limit)
      if (error) throw error
      return ((data ?? []) as unknown as ItemDbRow[]).map(asItem)
    },
    async itemsByIds(ids) {
      if (ids.length === 0) return []
      const { data, error } = await db.from('feed_items').select(ITEM_COLS).in('id', ids)
      if (error) throw error
      return ((data ?? []) as unknown as ItemDbRow[]).map(asItem)
    },
    async childrenOf(parentIds) {
      if (parentIds.length === 0) return []
      const { data, error } = await db.from('feed_items').select(ITEM_COLS)
        .in('parent_id', parentIds).is('removed_at', null).eq('held', false)
        .order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      return ((data ?? []) as unknown as ItemDbRow[]).map(asItem)
    },
    async dotsOn(itemIds) {
      if (itemIds.length === 0) return []
      const { data } = await db.from('feed_dots').select('item_id, user_id').in('item_id', itemIds)
      return ((data ?? []) as { item_id: string; user_id: string }[]).map(d => ({ itemId: d.item_id, userId: d.user_id }))
    },
    async recentComps(userId, clubIds, since, today) {
      const played = await tripsPlayedBy(db, userId)
      const clubComps = clubIds.length
        ? await db.from('trip_private').select('trip_id').in('club_id', clubIds).is('club_unlinked_at', null)
        : { data: [], error: null }
      const ids = [...new Set([...played.keys(), ...((clubComps.data ?? []) as { trip_id: string }[]).map(r => r.trip_id)])]
      if (ids.length === 0) return []
      const [trips, privs] = await Promise.all([
        db.from('trips').select('id, trip_code, name, kind, start_date, end_date, competition').in('id', ids),
        db.from('trip_private').select('trip_id, club_id, club_unlinked_at, clubs(name, verified_at)').in('trip_id', ids),
      ])
      if (trips.error) return []
      type P = { trip_id: string; club_id: string | null; club_unlinked_at: string | null; clubs: { name: string; verified_at: string | null } | { name: string; verified_at: string | null }[] | null }
      const clubOf = new Map<string, { id: string; name: string } | null>()
      for (const p of (privs.data ?? []) as unknown as P[]) {
        const c = Array.isArray(p.clubs) ? p.clubs[0] : p.clubs
        clubOf.set(p.trip_id, p.club_id && !p.club_unlinked_at && c?.verified_at ? { id: p.club_id, name: c.name } : null)
      }
      const out: CompRef[] = []
      for (const t of (trips.data ?? []) as { id: string; trip_code: string; name: string; kind: string | null; start_date: string | null; end_date: string | null; competition: string | null }[]) {
        if (t.kind === 'run') continue
        const playing = played.has(t.id)
        const club = clubOf.get(t.id) ?? null
        // Another member's comp at the club: only its competitions (D300).
        if (!playing && t.competition !== 'club') continue
        if (!playing && !(club && clubIds.includes(club.id))) continue
        const start = t.start_date, end = t.end_date ?? t.start_date
        if (!start || start > today) continue
        if ((end ?? start) < since) continue
        out.push({
          tripId: t.id, code: t.trip_code, name: t.name, date: start, endDate: t.end_date,
          playing, live: start <= today && (end ?? start) >= today,
          clubId: club?.id ?? null, clubName: club?.name ?? null,
        })
      }
      return out.slice(0, 60)
    },
    async commentsSince(userId, since) {
      const from = since ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
      const mine = await db.from('feed_items').select('id').eq('author_id', userId).eq('kind', 'card')
        .is('removed_at', null).order('created_at', { ascending: false }).limit(200)
      const ids = ((mine.data ?? []) as { id: string }[]).map(r => r.id)
      if (mine.error || ids.length === 0) return 0
      const { count } = await db.from('feed_items').select('id', { head: true, count: 'exact' })
        .eq('kind', 'comment').in('parent_id', ids).neq('author_id', userId)
        .is('removed_at', null).gt('created_at', from)
      return count ?? 0
    },
    // ─── Friends (D297) ───
    async friendRows(userId) {
      const { data, error } = await db.from('friendships').select('user_a, user_b, requested_by, accepted')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      if (error) throw error
      return ((data ?? []) as { user_a: string; user_b: string; requested_by: string; accepted: boolean }[])
        .map(r => ({ userA: r.user_a, userB: r.user_b, requestedBy: r.requested_by, accepted: r.accepted }))
    },
    async searchList(clubIds, term, limit) {
      // Linked rows only, never taken off, a Junior membership left out here
      // as well as by the caller's check (D297).
      const ask = (junior: boolean) => db.from('club_members')
        .select(`id, user_id, name, club_id, clubs!inner(name, verified_at)${junior ? ', category:club_categories(junior)' : ''}`)
        .in('club_id', clubIds).not('user_id', 'is', null).is('removed_at', null)
        .ilike('name', `%${term}%`).order('name').limit(limit)
      let res = await ask(true)
      if (res.error) res = await ask(false)
      if (res.error) throw res.error
      type R = { id: string; user_id: string; name: string; club_id: string; clubs: { name: string; verified_at: string | null } | null; category?: { junior?: boolean } | { junior?: boolean }[] | null }
      return ((res.data ?? []) as unknown as R[]).flatMap(r => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category
        if (cat?.junior || !r.clubs?.verified_at) return []
        return [{ rowId: r.id, userId: r.user_id, name: r.name, clubId: r.club_id, clubName: r.clubs.name }]
      })
    },
    async listRow(rowId) {
      if (!/^[0-9a-f-]{36}$/i.test(rowId)) return null
      const { data } = await db.from('club_members').select('user_id, club_id, removed_at').eq('id', rowId).maybeSingle()
      const r = data as { user_id: string | null; club_id: string; removed_at: string | null } | null
      return r ? { userId: r.user_id, clubId: r.club_id, removed: !!r.removed_at } : null
    },
    async saveFriend(row, at) {
      const { error } = await db.from('friendships').upsert({
        user_a: row.userA, user_b: row.userB, requested_by: row.requestedBy, accepted: row.accepted,
        accepted_at: row.accepted ? at : null,
      }, { onConflict: 'user_a,user_b' })
      if (error) throw error
    },
    async dropFriend(userA, userB) {
      const { error } = await db.from('friendships').delete().eq('user_a', userA).eq('user_b', userB)
      if (error) throw error
    },
    names: userIds => namesOf(db, userIds),
    juniorProfile: userId => juniorProfile(db, userId),
    shared<T>(key: string, read: () => Promise<T>): Promise<T> {
      return copies.look(key, read as () => Promise<unknown>) as Promise<T>
    },
  }
}
