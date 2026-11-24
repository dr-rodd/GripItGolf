// The feed's server half (D293–D307): who is asking, what they may see, and
// every change to the feed — all decided here, never on a phone (D305). The
// rules are lib/feed.ts; this applies them to a store.
//
// Handed its store, so `test:feed` runs it on a stand-in; ./store.ts is the
// service-role store, ./route.ts the plumbing.
//
// Nobody needs an account for anything else on Green Dot (D94): this route
// answers a Green Dot member only, and a junior (D108, or a Junior
// membership — D230, migration 102) is told there is no feed at all.

import { isAccount, type AuthUser } from '@/lib/account'
import { FEED_NOT_READY, done, fail, str, type FeedOutcome } from './outcome'
import {
  AUDIENCES, COMP_RECENT_DAYS, FEED_PAGE, FEED_READ, contextLine, effectiveAudience, emptyLine, inStream,
  mayView, mayViewChild, newestFirst, olderThan, orderComps, readAudience, readCursor, readStreamKey, readStreams,
  streamKey, streamLabel,
  type Audience, type CompRef, type Cursor, type FeedKind, type ItemFacts, type StreamRef, type Viewer,
} from '@/lib/feed'

// ─── The store ──────────────────────────────────────────────────

export interface ItemRow {
  id: string
  key: string | null
  kind: FeedKind
  authorId: string | null
  parentId: string | null
  tripId: string | null
  roundId: string | null
  playerId: string | null
  clubId: string | null
  data: Record<string, unknown>
  status: string | null
  /** The card's own audience, chosen at signing — null follows the member's setting. */
  audience: Audience | null
  held: boolean
  createdAt: string
  editedAt?: string | null
  removedAt: string | null
}

export interface Settings { audience: Audience; streams: unknown; commentsSeenAt: string | null }

export interface ClubRef { id: string; slug: string; name: string }

/** What a stream's page is read from, before anybody's eyes are applied. */
export interface Bundle {
  rows: ItemRow[]
  /** The cards the comments among `rows` hang off. */
  parents: ItemRow[]
  /** Every comment and highlight on the cards in `rows`. */
  children: ItemRow[]
  dots: { itemId: string; userId: string }[]
  /** Each author's audience setting. */
  audiences: Map<string, Audience>
  /** Authors who are juniors now — left out whatever was written before. */
  juniors: Set<string>
  /** Whether the read reached the end. */
  more: boolean
}

export interface StreamQuery { authors?: string[]; clubId?: string; tripId?: string; before: Cursor | null; limit: number }

export interface FeedStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** Whether migration 102 is in. */
  ready(): Promise<boolean>
  /** This account's settings — the defaults when it has none. */
  settings(userId: string): Promise<Settings>
  saveSettings(userId: string, patch: { audience?: Audience; streams?: string[]; commentsSeenAt?: string }): Promise<void>
  audiences(userIds: string[]): Promise<Map<string, Audience>>
  /** Of these accounts, the juniors: a D108 junior profile, or a Junior membership on any list. */
  juniors(userIds: string[]): Promise<Set<string>>
  /** Verified clubs whose list this account is on (linked, not taken off). */
  myClubs(userId: string): Promise<ClubRef[]>
  /** Accepted friends' account ids. */
  friendIds(userId: string): Promise<string[]>
  /** Top-level items and comments, newest first, the page's worth plus one. */
  items(q: StreamQuery): Promise<ItemRow[]>
  itemsByIds(ids: string[]): Promise<ItemRow[]>
  childrenOf(parentIds: string[]): Promise<ItemRow[]>
  dotsOn(itemIds: string[]): Promise<{ itemId: string; userId: string }[]>
  /** Comps for the picker: the account's own (ongoing or finished since `since`), then its clubs' competitions. */
  recentComps(userId: string, clubIds: string[], since: string, today: string): Promise<CompRef[]>
  /** Comments by others on this account's cards since a moment — the Home dot. */
  commentsSince(userId: string, since: string | null): Promise<number>
  /**
   * One shared copy a stream (D305): Club and Comp streams' first page read
   * once for every viewer, at most FEED_COPY_SECONDS old. A store without a
   * copy (the stand-in) reads every time.
   */
  shared?<T>(key: string, read: () => Promise<T>): Promise<T>
}

// ─── Answers ────────────────────────────────────────────────────

/** An item as a phone draws it — only what this viewer may see. */
export interface FeedView {
  id: string
  kind: FeedKind
  at: string
  name: string
  /** A card's context line; a one-liner's words. */
  line: string
  status: string | null
  gross: number | null
  points: number | null
  holes: number | null
  place: number | null
  highlights: string[]
  dots: number
  dotted: boolean
  comments: number
  latest: { name: string; text: string } | null
  mine: boolean
  /** The card's own audience — to its owner only. */
  audience: Audience | null
  /** A comment's card, and whose it is. */
  parentId: string | null
  on: string | null
  /** May this viewer delete it: a comment's author or its card's owner; a card's status its owner. */
  canDelete: boolean
  canReport: boolean
  /** Where the context is: the event's code, for a tap through. */
  code: string | null
}

export interface StreamView { key: string; kind: StreamRef['kind']; label: string; empty: string }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ─── Who is looking ─────────────────────────────────────────────

export interface Asker { user: AuthUser; junior: boolean }

export async function askerOf(input: { token?: string | null }, store: FeedStore): Promise<Asker | FeedOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  if (user.junior) return { user, junior: true }
  const juniors = await store.juniors([user.id])
  return { user, junior: juniors.has(user.id) }
}

export function isOutcome(v: unknown): v is FeedOutcome {
  return !!v && typeof v === 'object' && 'status' in v && 'body' in v
}

async function viewerOf(asker: Asker, store: FeedStore, o: { tripId?: string | null } = {}): Promise<{ viewer: Viewer; clubs: ClubRef[] }> {
  const [friends, clubs] = await Promise.all([store.friendIds(asker.user.id), store.myClubs(asker.user.id)])
  return {
    clubs,
    viewer: {
      userId: asker.user.id, junior: asker.junior,
      friends: new Set(friends), clubs: new Set(clubs.map(c => c.id)),
      events: new Set(o.tripId ? [o.tripId] : []),
    },
  }
}

export function factsOf(r: ItemRow, audiences: Map<string, Audience>, juniors: ReadonlySet<string>): ItemFacts {
  return {
    id: r.id, kind: r.kind, authorId: r.authorId, parentId: r.parentId, tripId: r.tripId, clubId: r.clubId,
    audience: effectiveAudience(r.authorId ? audiences.get(r.authorId) ?? null : null, r.audience),
    removed: !!r.removedAt || (!!r.authorId && juniors.has(r.authorId)),
    held: r.held,
  }
}

// ─── Reading a stream ───────────────────────────────────────────

/** The raw page a stream reads, with everything its items need — nothing about who is looking. */
export async function readBundle(store: FeedStore, q: StreamQuery): Promise<Bundle> {
  const rows = await store.items({ ...q, limit: FEED_READ + 1 })
  const more = rows.length > FEED_READ
  const page = rows.slice(0, FEED_READ)
  const parentIds = [...new Set(page.filter(r => r.kind === 'comment' && r.parentId).map(r => r.parentId as string))]
  const cardIds = page.filter(r => !r.parentId).map(r => r.id)
  const [parents, children] = await Promise.all([
    parentIds.length ? store.itemsByIds(parentIds) : Promise.resolve([]),
    cardIds.length ? store.childrenOf(cardIds) : Promise.resolve([]),
  ])
  const dots = await store.dotsOn([...cardIds, ...parentIds])
  const authors = [...new Set([...page, ...parents, ...children].map(r => r.authorId).filter((a): a is string => !!a))]
  const [audiences, juniors] = await Promise.all([store.audiences(authors), store.juniors(authors)])
  return { rows: page, parents, children, dots, audiences, juniors, more }
}

/**
 * A bundle through one viewer's eyes (D305): only what `mayView` lets them
 * see, in its stream, with the counts and the latest comment worked out
 * from what they may see too.
 */
export function viewBundle(b: Bundle, viewer: Viewer, stream: { kind: StreamRef['kind']; id?: string | null }): { items: FeedView[]; next: Cursor | null } {
  const facts = (r: ItemRow) => factsOf(r, b.audiences, b.juniors)
  const byId = new Map([...b.rows, ...b.parents].map(r => [r.id, r]))
  const kids = new Map<string, ItemRow[]>()
  for (const c of b.children) {
    if (!c.parentId) continue
    const list = kids.get(c.parentId)
    if (list) list.push(c)
    else kids.set(c.parentId, [c])
  }
  const dotsOf = (id: string) => b.dots.filter(d => d.itemId === id)
  const items: FeedView[] = []
  for (const r of b.rows) {
    const f = facts(r)
    if (r.kind === 'comment') {
      const parent = r.parentId ? byId.get(r.parentId) ?? null : null
      if (!parent || !mayViewChild(f, facts(parent), viewer) || !inStream(f, stream, viewer)) continue
      items.push({
        ...blank(r, viewer), kind: 'comment', name: str(r.data.name) || 'A member',
        line: str(r.data.text), parentId: parent.id,
        on: str(parent.data.name) ? `on ${str(parent.data.name)}’s card` : null,
        canDelete: r.authorId === viewer.userId || parent.authorId === viewer.userId,
      })
      continue
    }
    if (r.parentId || !mayView(f, viewer) || !inStream(f, stream, viewer)) continue
    const children = (kids.get(r.id) ?? []).filter(c => mayViewChild(facts(c), f, viewer))
    const comments = children.filter(c => c.kind === 'comment').sort(newestFirst)
    const highlights = children.filter(c => c.kind === 'highlight').sort((a, z) => a.createdAt.localeCompare(z.createdAt))
    const dots = dotsOf(r.id)
    const mine = !!r.authorId && r.authorId === viewer.userId
    items.push({
      ...blank(r, viewer),
      dots: dots.length, dotted: dots.some(d => d.userId === viewer.userId),
      comments: comments.length,
      latest: comments[0] ? { name: str(comments[0].data.name) || 'A member', text: str(comments[0].data.text) } : null,
      highlights: highlights.map(h => str(h.data.line)).filter(Boolean),
      audience: mine ? r.audience : null,
      canDelete: mine && r.kind === 'card' && !!r.status,
    })
  }
  const last = b.rows[b.rows.length - 1]
  return { items: items.slice(0, FEED_PAGE * 2), next: b.more && last ? { at: last.createdAt, id: last.id } : null }
}

function blank(r: ItemRow, viewer: Viewer): FeedView {
  const d = r.data
  const mine = !!r.authorId && r.authorId === viewer.userId
  const line = r.kind === 'card'
    ? contextLine({ event: str(d.event) || null, club: str(d.club) || null, course: str(d.course) || null, marker: str(d.marker) || null })
    : str(d.line)
  return {
    id: r.id, kind: r.kind, at: r.createdAt, name: str(d.name) || 'A member', line,
    status: r.kind === 'card' ? r.status : null,
    gross: num(d.gross), points: num(d.points), holes: num(d.holes), place: num(d.place),
    highlights: [], dots: 0, dotted: false, comments: 0, latest: null,
    mine, audience: null, parentId: null, on: null, canDelete: false, canReport: !mine,
    code: str(d.code) || null,
  }
}

/** Recent comps for the picker: ongoing or finished in the last COMP_RECENT_DAYS. */
export function sinceDay(today: string, days = COMP_RECENT_DAYS): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function irishDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(now)
}

// ─── The actions ────────────────────────────────────────────────

export async function runFeed(
  input: Record<string, unknown> & { token?: string | null; action?: unknown },
  store: FeedStore,
  now: Date,
): Promise<FeedOutcome> {
  const a = await askerOf(input, store)
  if (isOutcome(a)) return a
  const action = str(input.action)
  if (!(await store.ready())) return action === 'home' ? done({ ready: false }) : fail(503, FEED_NOT_READY)
  // A junior gets nothing social (D304): no feed, no friends, nothing written.
  if (a.junior) return action === 'home' ? done({ ready: true, junior: true }) : fail(403, 'The feed isn’t open to junior members.')
  if (action === 'home') return home(input, a, store, now)
  if (action === 'page') return page(input, a, store, now)
  if (action === 'audience') {
    const audience = readAudience(input.audience)
    if (!audience) return fail(400, 'Choose who sees your cards.')
    await store.saveSettings(a.user.id, { audience })
    return done({ audience })
  }
  if (action === 'streams') {
    const keys = Array.isArray(input.streams) ? input.streams : null
    if (!keys) return fail(400, 'Choose your streams.')
    const clubs = await store.myClubs(a.user.id)
    const streams = readStreams(keys, clubs.map(c => c.id))
    await store.saveSettings(a.user.id, { streams: streams.map(streamKey) })
    return done({ streams: streams.map(streamKey) })
  }
  return fail(400, 'Unknown request.')
}

/**
 * Home's one ask (D305: after the page paints, never inside the club home's
 * own answer): the member's audience, their streams with labels, the comps
 * for the picker, and the Home dot's count.
 */
async function home(input: Record<string, unknown>, a: Asker, store: FeedStore, now: Date): Promise<FeedOutcome> {
  const today = irishDay(now)
  const [settings, clubs] = await Promise.all([store.settings(a.user.id), store.myClubs(a.user.id)])
  const [comps, newComments] = await Promise.all([
    store.recentComps(a.user.id, clubs.map(c => c.id), sinceDay(today), today),
    store.commentsSince(a.user.id, settings.commentsSeenAt),
  ])
  const streams = readStreams(settings.streams, clubs.map(c => c.id))
  const clubName = (id: string) => clubs.find(c => c.id === id)?.name ?? null
  const view = (s: StreamRef): StreamView => ({ key: streamKey(s), kind: s.kind, label: streamLabel(s, { club: clubName }), empty: emptyLine(s.kind) })
  // Every stream the member could add (D300): Friends, Comp, each of their clubs. Team waits for interclub teams.
  const offered = [{ kind: 'comp' } as StreamRef, { kind: 'friends' } as StreamRef, ...clubs.map(c => ({ kind: 'club' as const, id: c.id }))]
  const here = str(input.club)
  return done({
    ready: true, junior: false,
    audience: settings.audience, audiences: AUDIENCES,
    streams: streams.map(view), offered: offered.map(view),
    clubs: clubs.map(c => ({ id: c.id, slug: c.slug, name: c.name })),
    here: clubs.find(c => c.slug === here)?.id ?? null,
    comps: orderComps(comps),
    newComments,
    today,
  })
}

/** One page of one stream, through this viewer's eyes. */
async function page(input: Record<string, unknown>, a: Asker, store: FeedStore, now: Date): Promise<FeedOutcome> {
  const stream = readStreamKey(input.stream)
  if (!stream) return fail(400, 'Which stream?')
  const before = readCursor(input.before)
  if (stream.kind === 'team') return done({ items: [], next: null })

  if (stream.kind === 'friends') {
    const { viewer } = await viewerOf(a, store)
    const b = await readBundle(store, { authors: [a.user.id, ...viewer.friends], before, limit: FEED_READ })
    return done(viewBundle(b, viewer, { kind: 'friends' }))
  }

  if (stream.kind === 'club') {
    const { viewer } = await viewerOf(a, store)
    // A Club stream is for the club's own people only (D294).
    if (!viewer.clubs.has(stream.id)) return fail(403, 'That stream is for the club’s members.')
    const read = () => readBundle(store, { clubId: stream.id, before: null, limit: FEED_READ })
    const b = before ? await readBundle(store, { clubId: stream.id, before, limit: FEED_READ })
      : store.shared ? await store.shared(`club:${stream.id}`, read) : await read()
    return done(viewBundle(b, viewer, { kind: 'club', id: stream.id }))
  }

  // Comp: only a comp the picker offers this member (D300).
  const code = str(input.comp).trim().toUpperCase()
  const today = irishDay(now)
  const clubs = await store.myClubs(a.user.id)
  const comps = await store.recentComps(a.user.id, clubs.map(c => c.id), sinceDay(today), today)
  const comp = comps.find(c => c.code === code)
  if (!comp) return fail(404, 'That comp isn’t one of yours.')
  const { viewer } = await viewerOf(a, store, { tripId: comp.playing ? comp.tripId : null })
  const read = () => readBundle(store, { tripId: comp.tripId, before: null, limit: FEED_READ })
  const b = before ? await readBundle(store, { tripId: comp.tripId, before, limit: FEED_READ })
    : store.shared ? await store.shared(`comp:${comp.tripId}`, read) : await read()
  return done(viewBundle(b, viewer, { kind: 'comp', id: comp.tripId }))
}

// Re-exported for the stand-in store in the tests.
export { olderThan, newestFirst }
