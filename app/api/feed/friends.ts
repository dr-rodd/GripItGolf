// Friends (D297): mutual — a request, then an accept — found **only** by
// searching the lists of the clubs the searcher is on: two characters at
// least, at most twenty results, only rows linked to a Green Dot account,
// name and club only, never browsable. Juniors never appear and can neither
// send nor receive a request. Either side removes a friendship, and it
// survives either leaving a club. Friends are a subset of the members
// (Ross, 24 Nov 2026) — close friends is not built (D298).

import {
  MAX_FRIENDS, SEARCH_LIMIT, SEARCH_RATE, friendState, pair, searchTerm, standingWith,
  type FriendRow, type Standing,
} from '@/lib/feed'
import { done, fail, str, type FeedOutcome } from './outcome'
import type { Asker, FeedStore } from './feed'

/** A row of a club's list, as a search may answer it. */
export interface ListHit { rowId: string; userId: string; name: string; clubId: string; clubName: string }

export interface FriendsStore {
  friendRows(userId: string): Promise<FriendRow[]>
  /** Linked, not-taken-off rows of these clubs whose name matches — never a junior's membership. */
  searchList(clubIds: string[], term: string, limit: number): Promise<ListHit[]>
  /** One list row, for a request made from a search result. */
  listRow(rowId: string): Promise<{ userId: string | null; clubId: string; removed: boolean } | null>
  saveFriend(row: FriendRow, at: string): Promise<void>
  dropFriend(userA: string, userB: string): Promise<void>
  /** How each account is named to its friends: its name on a club's list, and that club. */
  names(userIds: string[]): Promise<Map<string, { name: string; club: string | null }>>
  /** A D108 junior profile — asked one account at a time, only where a request is made or accepted. */
  juniorProfile(userId: string): Promise<boolean>
}

/** Searches per account in a window, per server — the directory is never browsable (D297). */
const searches = new Map<string, number[]>()
export function searchAllowed(userId: string, now: number): boolean {
  const recent = (searches.get(userId) ?? []).filter(t => now - t < SEARCH_RATE.windowMs)
  if (recent.length >= SEARCH_RATE.max) { searches.set(userId, recent); return false }
  recent.push(now)
  searches.set(userId, recent)
  return true
}

async function isJunior(store: FeedStore & FriendsStore, userId: string): Promise<boolean> {
  const [byMembership, profile] = await Promise.all([store.juniors([userId]), store.juniorProfile(userId)])
  return byMembership.has(userId) || profile
}

export async function runFriends(action: string, input: Record<string, unknown>, a: Asker, store: FeedStore & FriendsStore, now: Date): Promise<FeedOutcome | null> {
  const me = a.user.id

  if (action === 'friends') {
    const rows = await store.friendRows(me)
    const s = friendState(rows, me)
    const names = await store.names([...s.friends, ...s.incoming, ...s.outgoing])
    const person = (id: string) => ({ id, name: names.get(id)?.name ?? 'A Green Dot member', club: names.get(id)?.club ?? null })
    const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name)
    return done({
      friends: s.friends.map(person).sort(byName),
      incoming: s.incoming.map(person).sort(byName),
      outgoing: s.outgoing.map(person).sort(byName),
    })
  }

  if (action === 'search') {
    const term = searchTerm(input.q)
    if (!term) return done({ results: [] })
    if (!searchAllowed(me, now.getTime())) return fail(429, 'That’s a lot of searching — try again in a few minutes.')
    const clubs = await store.myClubs(me)
    if (clubs.length === 0) return done({ results: [] })
    const hits = await store.searchList(clubs.map(c => c.id), term, SEARCH_LIMIT * 2)
    const others = hits.filter(h => h.userId !== me)
    const people = [...new Set(others.map(h => h.userId))]
    const [rows, juniors] = await Promise.all([store.friendRows(me), store.juniors(people)])
    const profiles = await Promise.all(people.filter(p => !juniors.has(p)).map(async p => [p, await store.juniorProfile(p)] as const))
    const junior = new Set([...juniors, ...profiles.filter(([, j]) => j).map(([p]) => p)])
    const seen = new Set<string>()
    const results: { rowId: string; name: string; club: string; standing: Standing }[] = []
    for (const h of others) {
      if (junior.has(h.userId) || seen.has(h.userId)) continue
      seen.add(h.userId)
      // Name and club only (D297) — the row id is how a request is made, nothing more.
      results.push({ rowId: h.rowId, name: h.name, club: h.clubName, standing: standingWith(rows, me, h.userId) })
      if (results.length >= SEARCH_LIMIT) break
    }
    return done({ results })
  }

  if (action === 'request') {
    const row = await store.listRow(str(input.rowId))
    const clubs = await store.myClubs(me)
    if (!row || row.removed || !row.userId || !clubs.some(c => c.id === row.clubId)) return fail(404, 'That person isn’t on your club’s list.')
    const other = row.userId
    if (other === me) return fail(400, 'That’s you.')
    if (await isJunior(store, other)) return fail(404, 'That person isn’t on your club’s list.')
    const rows = await store.friendRows(me)
    const standing = standingWith(rows, me, other)
    if (standing === 'friend' || standing === 'asked') return done({ standing })
    if (friendState(rows, me).friends.length >= MAX_FRIENDS) return fail(409, `You have ${MAX_FRIENDS} friends — remove one to add another.`)
    // They asked first: asking back is accepting.
    await store.saveFriend({ ...pair(me, other), requestedBy: standing === 'asks_you' ? other : me, accepted: standing === 'asks_you' }, now.toISOString())
    return done({ standing: standing === 'asks_you' ? 'friend' : 'asked' })
  }

  if (action === 'respond') {
    const other = str(input.id)
    const rows = await store.friendRows(me)
    if (standingWith(rows, me, other) !== 'asks_you') return fail(404, 'That request has gone.')
    if (input.accept !== true) {
      await store.dropFriend(pair(me, other).userA, pair(me, other).userB)
      return done({ standing: 'none' })
    }
    if (await isJunior(store, other)) {
      await store.dropFriend(pair(me, other).userA, pair(me, other).userB)
      return fail(404, 'That request has gone.')
    }
    if (friendState(rows, me).friends.length >= MAX_FRIENDS) return fail(409, `You have ${MAX_FRIENDS} friends — remove one to add another.`)
    await store.saveFriend({ ...pair(me, other), requestedBy: other, accepted: true }, now.toISOString())
    return done({ standing: 'friend' })
  }

  if (action === 'unfriend') {
    const other = str(input.id)
    if (!other || other === me) return fail(400, 'Who?')
    const p = pair(me, other)
    await store.dropFriend(p.userA, p.userB)
    return done({ standing: 'none' })
  }

  return null
}
