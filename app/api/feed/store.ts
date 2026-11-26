// The feed's service-role store (./feed.ts's FeedStore). Every table is
// server only (migration 102); every read is fail-soft before it — the
// route answers "not set up yet" and Home draws no feed.

import type { createAdminClient } from '@/lib/supabase-admin'
import { makeCopyKeeper } from '@/lib/sharedCopy'
import { DEFAULT_AUDIENCE, FEED_COPY_SECONDS, readAudience, type Audience, type CompRef, type FeedKind } from '@/lib/feed'
import { asUser } from '../account/store'
import type { ClubRef, FeedStore, ItemRow, Settings, StreamQuery } from './feed'
import { readMemberHiddenOf } from '../club/notesStore'
import { readCardDetail } from './cardDetail'
import { ReactionsNotReady } from './social'

export type Db = ReturnType<typeof createAdminClient>

export const ITEM_COLS = 'id, key, kind, author_id, parent_id, trip_id, round_id, player_id, club_id, data, status, audience, held, created_at, edited_at, removed_at'
/** With 104 (Streams v2): when an item last had activity, where a status went, a post's link. */
export const ITEM_COLS_V2 = `${ITEM_COLS}, bumped_at, stream, link`

export type ItemDbRow = {
  id: string; key: string | null; kind: FeedKind; author_id: string | null; parent_id: string | null
  trip_id: string | null; round_id: string | null; player_id: string | null; club_id: string | null
  data: Record<string, unknown> | null; status: string | null; audience: string | null; held: boolean
  created_at: string; edited_at: string | null; removed_at: string | null
  bumped_at?: string | null; stream?: string | null; link?: string | null
}

export function asItem(r: ItemDbRow): ItemRow {
  return {
    id: r.id, key: r.key, kind: r.kind, authorId: r.author_id, parentId: r.parent_id,
    tripId: r.trip_id, roundId: r.round_id, playerId: r.player_id, clubId: r.club_id,
    data: r.data && typeof r.data === 'object' ? r.data : {}, status: r.status,
    audience: readAudience(r.audience), held: r.held, createdAt: r.created_at,
    bumpedAt: r.bumped_at ?? r.created_at, stream: r.stream ?? null, link: r.link ?? null,
    editedAt: r.edited_at, removedAt: r.removed_at,
  }
}

/** One copy per server for the Club and Comp streams' first pages (D305). */
const copies = makeCopyKeeper<unknown>({ maxAgeMs: FEED_COPY_SECONDS * 1000, holdMs: 10 * 60_000 })

/** Whether 102 is in — once yes, never asked again by this server. */
let readyOnce = false

/** Whether 104 is in (Streams v2) — once yes, never asked again by this server. */
let v2Once = false

/** Whether 105 is in (stream groups) — once yes, never asked again by this server. */
let groupsOnce = false
export async function groupsReady(db: Db): Promise<boolean> {
  if (groupsOnce) return true
  const { error } = await db.from('stream_groups').select('id', { head: true, count: 'exact' }).limit(1)
  if (!error) groupsOnce = true
  return !error
}

export async function feedV2(db: Db): Promise<boolean> {
  if (v2Once) return true
  const { error } = await db.from('feed_items').select('bumped_at', { head: true, count: 'exact' }).limit(1)
  if (!error) v2Once = true
  return !error
}

/** The columns an item is read with: 104's too, once it is in. */
export async function itemCols(db: Db): Promise<string> {
  return (await feedV2(db)) ? ITEM_COLS_V2 : ITEM_COLS
}

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

/**
 * Open reports (D303): a club's, or — `null` — Green Dot's own (every report
 * with no club). Each with what was reported, as it reads, and who reported it.
 */
export async function openReports(db: Db, clubId: string | null) {
  let q = db.from('feed_reports').select('id, item_id, reason, created_at, reporter_id').is('resolved_at', null)
  q = clubId ? q.eq('club_id', clubId) : q.is('club_id', null)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
  if (error) return []
  const rows = (data ?? []) as { id: string; item_id: string; reason: string | null; created_at: string; reporter_id: string }[]
  const itemIds = [...new Set(rows.map(r => r.item_id))]
  const [items, names] = await Promise.all([
    itemIds.length ? db.from('feed_items').select(ITEM_COLS).in('id', itemIds) : Promise.resolve({ data: [] }),
    namesOf(db, [...new Set(rows.map(r => r.reporter_id))]),
  ])
  const byId = new Map(((items.data ?? []) as unknown as ItemDbRow[]).map(r => [r.id, asItem(r)]))
  return rows.flatMap(r => {
    const it = byId.get(r.item_id)
    if (!it) return []
    const text = it.kind === 'comment' ? String(it.data.text ?? '') : it.kind === 'card' ? (it.status ?? '') : String(it.data.line ?? '')
    return [{
      id: r.id, itemId: r.item_id, reason: r.reason, createdAt: r.created_at,
      item: { kind: it.kind, name: String(it.data.name ?? 'A member'), text, event: typeof it.data.event === 'string' ? it.data.event : null, removed: !!it.removedAt },
      reporter: names.get(r.reporter_id)?.name ?? 'A member',
    }]
  })
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
      // D329: items standing on their own, by their latest activity — before 104, when each was made.
      const v2 = await feedV2(db)
      if ((q.stream || q.group) && !v2) return []
      const at = v2 ? 'bumped_at' : 'created_at'
      // D343: a group's page is two reads — what was posted in it, and its members' cards and results — merged.
      if (q.group) {
        const { group, ...rest } = q
        const [posted, theirs] = await Promise.all([
          this.items({ ...rest, stream: group.stream }),
          this.items({ ...rest, authors: group.authors, kinds: ['card', 'match_result'] }),
        ])
        const byId = new Map([...posted, ...theirs].map(r => [r.id, r]))
        return [...byId.values()]
          .sort((x, y) => (y.bumpedAt ?? y.createdAt).localeCompare(x.bumpedAt ?? x.createdAt) || y.id.localeCompare(x.id))
          .slice(0, q.limit)
      }
      let r = db.from('feed_items').select(v2 ? ITEM_COLS_V2 : ITEM_COLS)
        .is('parent_id', null).is('removed_at', null).eq('held', false)
      if (q.authors) r = r.in('author_id', q.authors.length ? q.authors : ['00000000-0000-0000-0000-000000000000'])
      if (q.clubId) r = r.eq('club_id', q.clubId)
      if (q.tripId) r = r.eq('trip_id', q.tripId)
      if (q.stream) r = r.eq('stream', q.stream)
      if (q.kinds) r = r.in('kind', q.kinds)
      if (q.notKinds?.length) r = r.not('kind', 'in', `(${q.notKinds.join(',')})`)
      if (q.before) r = r.or(`${at}.lt."${q.before.at}",and(${at}.eq."${q.before.at}",id.lt.${q.before.id})`)
      const { data, error } = await r.order(at, { ascending: false }).order('id', { ascending: false }).limit(q.limit)
      if (error) throw error
      return ((data ?? []) as unknown as ItemDbRow[]).map(asItem)
    },
    async commentsBy(authors, before, limit) {
      if (authors.length === 0) return []
      let r = db.from('feed_items').select('parent_id, author_id, created_at')
        .eq('kind', 'comment').in('author_id', authors).is('removed_at', null).not('parent_id', 'is', null)
      // A card's activity is never earlier than a comment on it, so comments before the cursor reach every card before it.
      if (before) r = r.lte('created_at', before.at)
      const { data, error } = await r.order('created_at', { ascending: false }).limit(limit)
      if (error) return []
      return ((data ?? []) as { parent_id: string; author_id: string; created_at: string }[])
        .map(c => ({ parentId: c.parent_id, authorId: c.author_id, createdAt: c.created_at }))
    },
    v2: () => feedV2(db),
    // ─── Stream groups (D343, 105) ───
    groupsReady: () => groupsReady(db),
    async groupsOf(userId) {
      if (!(await groupsReady(db))) return []
      const { data, error } = await db.from('stream_group_members').select('admin, group:stream_groups(id, name, created_by, created_at)').eq('user_id', userId)
      if (error) return []
      const rows = ((data ?? []) as unknown as { admin: boolean; group: { id: string; name: string; created_by: string | null; created_at: string } | null }[]).filter(r => r.group)
      if (rows.length === 0) return []
      const { data: all } = await db.from('stream_group_members').select('group_id').in('group_id', rows.map(r => r.group!.id))
      const count = new Map<string, number>()
      for (const m of (all ?? []) as { group_id: string }[]) count.set(m.group_id, (count.get(m.group_id) ?? 0) + 1)
      return rows.map(r => ({ id: r.group!.id, name: r.group!.name, createdBy: r.group!.created_by, createdAt: r.group!.created_at, admin: r.admin, members: count.get(r.group!.id) ?? 1 }))
        .sort((x, y) => x.name.localeCompare(y.name))
    },
    async group(groupId) {
      const { data } = await db.from('stream_groups').select('id, name, created_by, created_at').eq('id', groupId).maybeSingle()
      const g = data as { id: string; name: string; created_by: string | null; created_at: string } | null
      return g ? { id: g.id, name: g.name, createdBy: g.created_by, createdAt: g.created_at } : null
    },
    async groupMembers(groupId) {
      if (!(await groupsReady(db))) return []
      const { data, error } = await db.from('stream_group_members').select('user_id, admin, added_by, joined_at').eq('group_id', groupId)
      if (error) throw error
      return ((data ?? []) as { user_id: string; admin: boolean; added_by: string | null; joined_at: string }[])
        .map(m => ({ userId: m.user_id, admin: m.admin, addedBy: m.added_by, joinedAt: m.joined_at }))
    },
    async groupmates(userId) {
      if (!(await groupsReady(db))) return []
      const { data: mine } = await db.from('stream_group_members').select('group_id').eq('user_id', userId)
      const ids = ((mine ?? []) as { group_id: string }[]).map(r => r.group_id)
      if (ids.length === 0) return []
      const { data } = await db.from('stream_group_members').select('user_id').in('group_id', ids)
      return [...new Set(((data ?? []) as { user_id: string }[]).map(r => r.user_id))]
    },
    async makeGroup(name, by, at) {
      const { data, error } = await db.from('stream_groups').insert({ name, created_by: by, created_at: at }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    async addGroupMembers(groupId, rows, at) {
      if (rows.length === 0) return
      const { error } = await db.from('stream_group_members').upsert(
        rows.map(r => ({ group_id: groupId, user_id: r.userId, admin: r.admin, added_by: r.addedBy, joined_at: at })),
        { onConflict: 'group_id,user_id', ignoreDuplicates: true })
      if (error) throw error
    },
    async removeGroupMember(groupId, userId) {
      const { error } = await db.from('stream_group_members').delete().eq('group_id', groupId).eq('user_id', userId)
      if (error) throw error
    },
    async setGroupAdmin(groupId, userId, admin) {
      const { error } = await db.from('stream_group_members').update({ admin }).eq('group_id', groupId).eq('user_id', userId)
      if (error) throw error
    },
    async renameGroup(groupId, name) {
      const { error } = await db.from('stream_groups').update({ name }).eq('id', groupId)
      if (error) throw error
    },
    async deleteGroup(groupId) {
      await db.from('feed_items').delete().eq('stream', `group:${groupId}`)
      const { error } = await db.from('stream_groups').delete().eq('id', groupId)
      if (error) throw error
    },
    async follows(userId) {
      const { data, error } = await db.from('feed_follows').select('stream').eq('user_id', userId)
      if (error) return []
      return ((data ?? []) as { stream: string }[]).map(r => r.stream)
    },
    // D332: nothing to follow until the Clubhouse lists interclub teams. The day it
    // does, this asks whether the team behind the key exists.
    async followable() { return false },
    async setFollow(userId, stream, on) {
      const { error } = on
        ? await db.from('feed_follows').upsert({ user_id: userId, stream }, { onConflict: 'user_id,stream', ignoreDuplicates: true })
        : await db.from('feed_follows').delete().eq('user_id', userId).eq('stream', stream)
      if (error) throw error
    },
    async insertOwn(o) {
      const { data, error } = await db.from('feed_items').insert({
        kind: o.kind, author_id: o.authorId, club_id: o.clubId, stream: o.stream,
        status: o.kind === 'status' ? o.text : null, link: o.link, data: o.data,
        created_at: o.at, bumped_at: o.at,
      }).select(ITEM_COLS_V2).single()
      if (error) throw error
      return asItem(data as unknown as ItemDbRow)
    },
    async bump(itemId, at) {
      const { error } = await db.from('feed_items').update({ bumped_at: at }).eq('id', itemId).lt('bumped_at', at)
      if (error) throw error
    },
    hiddenTypes: userId => readMemberHiddenOf(db, userId),
    cardDetail: (roundId, playerId) => readCardDetail(db, roundId, playerId),
    async itemsByIds(ids) {
      if (ids.length === 0) return []
      const { data, error } = await db.from('feed_items').select(await itemCols(db)).in('id', ids)
      if (error) throw error
      return ((data ?? []) as unknown as ItemDbRow[]).map(asItem)
    },
    async childrenOf(parentIds) {
      if (parentIds.length === 0) return []
      const { data, error } = await db.from('feed_items').select(await itemCols(db))
        .in('parent_id', parentIds).is('removed_at', null).eq('held', false)
        .order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      return ((data ?? []) as unknown as ItemDbRow[]).map(asItem)
    },
    async reactionsOn(itemIds, parentIds) {
      // D348: the items' own, and their replies' (through the reply's parent). Before 106 there is no emoji: each a 👍.
      type Row = { item_id: string; user_id: string; emoji?: string | null }
      const read = async (cols: string) => Promise.all([
        itemIds.length ? db.from('feed_dots').select(cols).in('item_id', itemIds) : null,
        parentIds.length ? db.from('feed_dots').select(`${cols}, feed_items!inner(parent_id)`).in('feed_items.parent_id', parentIds) : null,
      ])
      let got = await read('item_id, user_id, emoji')
      if (got.some(r => r?.error && /emoji/.test(r.error.message))) got = await read('item_id, user_id')
      const seen = new Set<string>()
      const out: { itemId: string; userId: string; emoji: string | null }[] = []
      for (const r of got) for (const d of ((r?.data ?? []) as unknown as Row[])) {
        const k = `${d.item_id}:${d.user_id}`
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ itemId: d.item_id, userId: d.user_id, emoji: d.emoji ?? null })
      }
      return out
    },
    async recentComps(userId, clubIds, since, today) {
      const played = await tripsPlayedBy(db, userId)
      const clubComps = clubIds.length
        ? await db.from('trip_private').select('trip_id').in('club_id', clubIds).is('club_unlinked_at', null)
        : { data: [], error: null }
      const ids = [...new Set([...played.keys(), ...((clubComps.data ?? []) as { trip_id: string }[]).map(r => r.trip_id)])]
      if (ids.length === 0) return []
      const [trips, privs] = await Promise.all([
        db.from('trips').select('id, trip_code, name, kind, start_date, end_date, competition, format:bracket_setup->>format').in('id', ids),
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
      for (const t of (trips.data ?? []) as unknown as { id: string; trip_code: string; name: string; kind: string | null; start_date: string | null; end_date: string | null; competition: string | null; format: string | null }[]) {
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
          // D323, D332: the menu's heading — a club's match plays apart from its other competitions.
          category: t.competition === 'club' ? (t.format === 'match_play' ? 'matchplay' : 'club') : 'events',
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
    // ─── Comments, dots, reports (D301, D303) ───
    async insertComment(o) {
      const { data, error } = await db.from('feed_items').insert({
        kind: 'comment', author_id: o.authorId, parent_id: o.parentId, trip_id: o.tripId, club_id: o.clubId,
        data: { name: o.name, text: o.text, ...(o.replyTo ? { replyTo: o.replyTo.id, replyName: o.replyTo.name } : {}) },
      }).select(ITEM_COLS).single()
      if (error) throw error
      return asItem(data as unknown as ItemDbRow)
    },
    async deleteItem(itemId) {
      const { error } = await db.from('feed_items').delete().eq('id', itemId)
      if (error) throw error
    },
    async setReaction(itemId, userId, emoji) {
      if (!emoji) {
        const { error } = await db.from('feed_dots').delete().eq('item_id', itemId).eq('user_id', userId)
        if (error) throw error
        return
      }
      const { error } = await db.from('feed_dots').upsert({ item_id: itemId, user_id: userId, emoji }, { onConflict: 'item_id,user_id' })
      if (!error) return
      // Before 106: a 👍 is a plain dot; anything else waits for the column.
      if (!/emoji/.test(error.message)) throw error
      if (emoji !== '👍') throw new ReactionsNotReady()
      const plain = await db.from('feed_dots').upsert({ item_id: itemId, user_id: userId }, { onConflict: 'item_id,user_id', ignoreDuplicates: true })
      if (plain.error) throw plain.error
    },
    async insertReport(o) {
      const { error } = await db.from('feed_reports').upsert(
        { item_id: o.itemId, reporter_id: o.reporterId, club_id: o.clubId, reason: o.reason },
        { onConflict: 'item_id,reporter_id', ignoreDuplicates: true })
      if (error) throw error
    },
    async clubCredentials(clubId, userId) {
      if (!/^[0-9a-f-]{36}$/i.test(clubId)) return null
      const ask = (ticks: boolean) => db.from('club_members').select(`role${ticks ? ', officer, clubhouse' : ''}`)
        .eq('club_id', clubId).eq('user_id', userId).is('removed_at', null).limit(1)
      let res = await ask(true)
      if (res.error) res = await ask(false)
      const r = ((res.data ?? []) as unknown as { role: 'owner' | 'admin' | 'member'; officer?: boolean | null; clubhouse?: boolean | null }[])[0]
      return r ? { role: r.role, officer: r.officer, clubhouse: r.clubhouse } : null
    },
    async isStaff(userId) {
      const { data, error } = await db.from('green_dot_staff').select('user_id').eq('user_id', userId).maybeSingle()
      return !error && !!data
    },
    reportsFor: clubId => openReports(db, clubId),
    async resolveReports(itemId, by, outcome, at) {
      if (outcome === 'removed') {
        const { error } = await db.from('feed_items').update({ removed_at: at, removed_by: by }).eq('id', itemId)
        if (error) throw error
      }
      const { error } = await db.from('feed_reports').update({ resolved_at: at, resolved_by: by, outcome }).eq('item_id', itemId).is('resolved_at', null)
      if (error) throw error
    },
    async liveNow() {
      const since = new Date(Date.now() - 12 * 3_600_000).toISOString()
      const { data, error } = await db.from('live_rounds')
        .select('round_id, rounds!inner(trip_id), live_player_locks(player_id)')
        .eq('status', 'active').gt('activated_at', since).limit(200)
      if (error) return []
      type R = { round_id: string; rounds: { trip_id: string } | { trip_id: string }[]; live_player_locks: { player_id: string }[] | null }
      const cards = ((data ?? []) as unknown as R[]).map(r => ({
        roundId: r.round_id, tripId: (Array.isArray(r.rounds) ? r.rounds[0] : r.rounds).trip_id,
        players: (r.live_player_locks ?? []).map(l => l.player_id),
      }))
      const playerIds = [...new Set(cards.flatMap(c => c.players))]
      if (playerIds.length === 0) return []
      const roundIds = [...new Set(cards.map(c => c.roundId))]
      const tripIds = [...new Set(cards.map(c => c.tripId))]
      const { accountsOfPlayers } = await import('./write')
      const [names, scores, accounts, privs] = await Promise.all([
        db.from('players').select('id, name').in('id', playerIds),
        db.from('live_scores').select('player_id, round_id').in('player_id', playerIds).in('round_id', roundIds).not('gross_score', 'is', null).limit(5000),
        accountsOfPlayers(db, playerIds),
        db.from('trip_private').select('trip_id, club_id, club_unlinked_at, clubs(verified_at)').in('trip_id', tripIds),
      ])
      const nameOf = new Map(((names.data ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
      const thru = new Map<string, number>()
      for (const r of (scores.data ?? []) as { player_id: string; round_id: string }[]) thru.set(`${r.player_id}:${r.round_id}`, (thru.get(`${r.player_id}:${r.round_id}`) ?? 0) + 1)
      const clubOf = new Map<string, string | null>()
      for (const p of (privs.data ?? []) as unknown as { trip_id: string; club_id: string | null; club_unlinked_at: string | null; clubs: { verified_at: string | null } | { verified_at: string | null }[] | null }[]) {
        const c = Array.isArray(p.clubs) ? p.clubs[0] : p.clubs
        clubOf.set(p.trip_id, p.club_id && !p.club_unlinked_at && c?.verified_at ? p.club_id : null)
      }
      return cards.flatMap(c => c.players.map(playerId => ({
        playerId, name: nameOf.get(playerId) ?? 'A player', tripId: c.tripId, clubId: clubOf.get(c.tripId) ?? null,
        userId: accounts.get(playerId) ?? null, thru: thru.get(`${playerId}:${c.roundId}`) ?? 0,
      }))).filter(p => p.thru > 0)
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
    // ─── The sign step (D299) ───
    async cardPlayers(code, roundId, playerIds) {
      if (!/^[A-Z0-9]{4,12}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(roundId) || playerIds.length === 0) return null
      const [trip, round] = await Promise.all([
        db.from('trips').select('id').eq('trip_code', code).maybeSingle(),
        db.from('rounds').select('trip_id').eq('id', roundId).maybeSingle(),
      ])
      const tripId = (trip.data as { id: string } | null)?.id
      if (!tripId || (round.data as { trip_id: string } | null)?.trip_id !== tripId) return null
      const { data: players } = await db.from('players').select('id, name').in('id', playerIds).eq('trip_id', tripId)
      const ps = (players ?? []) as { id: string; name: string }[]
      const { accountsOfPlayers } = await import('./write')
      return { tripId, accounts: await accountsOfPlayers(db, ps.map(p => p.id)), names: new Map(ps.map(p => [p.id, p.name])) }
    },
    async setCardStatus(o) {
      const patch = { status: o.status, audience: o.audience, edited_at: o.at }
      const update = () => db.from('feed_items').update(patch).eq('key', o.key).eq('author_id', o.authorId).select('id')
      const first = await update()
      if (first.error) throw first.error
      if ((first.data ?? []).length) return
      // No card yet (a club card waiting on its marker): kept held until it arrives.
      const ins = await db.from('feed_items').insert({
        key: o.key, kind: 'card', author_id: o.authorId, trip_id: o.tripId, round_id: o.roundId, player_id: o.playerId,
        status: o.status, audience: o.audience, held: true, data: {},
      })
      if (ins.error?.code === '23505') { const again = await update(); if (again.error) throw again.error; return }
      if (ins.error) throw ins.error
    },
    async ownItem(itemId, userId) {
      if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null
      const { data } = await db.from('feed_items').select('id, kind').eq('id', itemId).eq('author_id', userId).is('removed_at', null).maybeSingle()
      return (data as { id: string; kind: string } | null) ?? null
    },
    async updateStatus(itemId, status, at) {
      const { error } = await db.from('feed_items').update({ status, edited_at: at }).eq('id', itemId)
      if (error) throw error
    },
    juniorProfile: userId => juniorProfile(db, userId),
    shared<T>(key: string, read: () => Promise<T>): Promise<T> {
      return copies.look(key, read as () => Promise<unknown>) as Promise<T>
    },
  }
}
