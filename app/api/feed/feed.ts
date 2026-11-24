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
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { FEED_NOT_READY, done, fail, str, type FeedOutcome } from './outcome'
import { runFriends, type FriendsStore } from './friends'
import { runCards, type CardsStore } from './cards'
import { runSocial, type SocialStore } from './social'
import { runOwn } from './own'
import {
  AUDIENCES, COMP_RECENT_DAYS, FEED_PAGE, FEED_READ, contextLine, effectiveAudience, emptyLine, inStream,
  commentLine, isMatchStream, mayView, mayViewChild, newestFirst, olderThan, orderComps, talksOn, readAudience, readCursor, readStreamKey, readStreams,
  STREAMS_V2, keptStreams, offeredStreams, streamAbout, streamKey, streamLabel,
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
  /** When anything last happened to it — made, or commented on (D329). Before 104, when it was made. */
  bumpedAt?: string
  /** Where a standalone status was posted (D326, D328). */
  stream?: string | null
  /** A club post's one link (D325). */
  link?: string | null
  editedAt?: string | null
  removedAt: string | null
}

export interface Settings { audience: Audience; streams: unknown; commentsSeenAt: string | null }

export interface ClubRef { id: string; slug: string; name: string }

/** What a stream's page is read from, before anybody's eyes are applied. */
export interface Bundle {
  /** Items standing on their own, latest activity first (D329). */
  rows: ItemRow[]
  /** friends.stream: the cards friends commented on, with who (D327) — the guard is the card's own `mayView`. */
  pulledBy: Map<string, string[]>
  /** Every comment and highlight on the items in `rows`. */
  children: ItemRow[]
  dots: { itemId: string; userId: string }[]
  /** Each author's audience setting. */
  audiences: Map<string, Audience>
  /** Authors who are juniors now — left out whatever was written before. */
  juniors: Set<string>
  /** Whether the read reached the end. */
  more: boolean
}

export interface LivePlayer { playerId: string; name: string; tripId: string; clubId: string | null; userId: string | null; thru: number }

export interface StreamQuery {
  authors?: string[]
  clubId?: string
  tripId?: string
  /** A match stream's key (D326). */
  stream?: string
  /** Only these kinds (club.stream: posts). */
  kinds?: FeedKind[]
  /** Never these kinds. */
  notKinds?: FeedKind[]
  /** friends.stream: also the items these accounts commented on (D327). */
  pullFrom?: string[]
  before: Cursor | null
  limit: number
}

/** A comment, as pulling its card into friends.stream needs it. */
export interface CommentRef { parentId: string; authorId: string; createdAt: string }

/**
 * A signed card for the pop-out (D330, D334): what the trip's own scorecard
 * (`ScorecardSheet`) draws — one player, the round and its course, the
 * course's holes, the player's scores, and the handicap it was scored off.
 */
export interface CardDetail {
  player: { id: string; name: string; handicap: number | null; gender: string }
  round: { id: string; round_number: number; courses: { id: string; name: string } }
  holes: { id: string; hole_number: number; par: number; stroke_index: number; course_id: string; par_ladies?: number | null; stroke_index_ladies?: number | null }[]
  resolved: { playerId: string; roundId: string; holeId: string; holeNumber: number; gross: number | null; points: number; noReturn: boolean; live: boolean }[]
  handicap: number | null
}

/** What a member posts on their own (D325, D328). */
export interface OwnWrite {
  kind: 'status' | 'post'
  authorId: string
  clubId: string | null
  stream: string | null
  text: string
  link: string | null
  data: Record<string, unknown>
  at: string
}

export interface FeedStore extends FriendsStore, CardsStore, SocialStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** Whether migration 102 is in. */
  ready(): Promise<boolean>
  /** Whether migration 104 (Streams v2) is in — statuses, club posts, follows, last activity. */
  v2(): Promise<boolean>
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
  /** Items standing on their own, latest activity first, the page's worth plus one (D329). */
  items(q: StreamQuery): Promise<ItemRow[]>
  /** The latest comments by these accounts, older than the cursor's activity — for pulling cards in (D327). */
  commentsBy(authors: string[], before: Cursor | null, limit: number): Promise<CommentRef[]>
  /** Match streams this account follows (D326), as 'match:<id>'. */
  follows(userId: string): Promise<string[]>
  /** Whether a match stream exists to be followed — none until interclub teams exist (D332). */
  followable(stream: string): Promise<boolean>
  setFollow(userId: string, stream: string, on: boolean): Promise<void>
  /** A status or a club post (D325, D328). */
  insertOwn(o: OwnWrite): Promise<ItemRow>
  /** A comment lifts its item to the top (D329). */
  bump(itemId: string, at: string): Promise<void>
  /** The club event types this account turned off (095) — a club post about one is not shown to them. */
  hiddenTypes(userId: string): Promise<string[]>
  /** A signed card's holes, for the sheet (D330). */
  cardDetail(roundId: string, playerId: string): Promise<CardDetail | null>
  itemsByIds(ids: string[]): Promise<ItemRow[]>
  childrenOf(parentIds: string[]): Promise<ItemRow[]>
  dotsOn(itemIds: string[]): Promise<{ itemId: string; userId: string }[]>
  /** Comps for the picker: the account's own (ongoing or finished since `since`), then its clubs' competitions. */
  recentComps(userId: string, clubIds: string[], since: string, today: string): Promise<CompRef[]>
  /** Comments by others on this account's cards since a moment — the Home dot. */
  commentsSince(userId: string, since: string | null): Promise<number>
  /**
   * Everybody with an open card right now (D302's On the course strip):
   * who, in which event and club, their account, and how many holes in.
   * One read for every viewer (a shared copy, D305); each viewer's eyes after.
   */
  liveNow(): Promise<LivePlayer[]>
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
  /** "2 comments · John and 1 other" (D329). */
  commentLine: { count: string; who: string } | null
  /** Why a card is in friends.stream when it is not a friend's: "Dave commented" (D327). */
  why: string | null
  /** A club post's words (with its line breaks) and link (D325). */
  text: string | null
  link: string | null
  /** May this viewer comment on it and dot it (D301, D329). */
  talk: boolean
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

export interface StreamView { key: string; kind: StreamRef['kind']; label: string; empty: string; about: string }

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

export async function viewerOf(asker: Asker, store: FeedStore, o: { tripId?: string | null } = {}): Promise<{ viewer: Viewer; clubs: ClubRef[] }> {
  const [friends, clubs, follows] = await Promise.all([store.friendIds(asker.user.id), store.myClubs(asker.user.id), store.follows(asker.user.id)])
  return {
    clubs,
    viewer: {
      userId: asker.user.id, junior: asker.junior,
      friends: new Set(friends), clubs: new Set(clubs.map(c => c.id)),
      events: new Set(o.tripId ? [o.tripId] : []),
      follows: new Set(follows),
    },
  }
}

export function factsOf(r: ItemRow, audiences: Map<string, Audience>, juniors: ReadonlySet<string>): ItemFacts {
  return {
    id: r.id, kind: r.kind, authorId: r.authorId, parentId: r.parentId, tripId: r.tripId, clubId: r.clubId,
    audience: effectiveAudience(r.authorId ? audiences.get(r.authorId) ?? null : null, r.audience),
    removed: !!r.removedAt || (!!r.authorId && juniors.has(r.authorId)),
    held: r.held,
    stream: r.stream ?? null,
  }
}

// ─── Reading a stream ───────────────────────────────────────────

/** The order every stream reads in (D329): latest activity first, the id breaking a tie. */
export function activityOf(r: Pick<ItemRow, 'bumpedAt' | 'createdAt'>): string {
  return r.bumpedAt ?? r.createdAt
}

function latestFirst(a: ItemRow, b: ItemRow): number {
  return activityOf(b).localeCompare(activityOf(a)) || b.id.localeCompare(a.id)
}

function olderThanCursor(c: Cursor | null) {
  return (r: ItemRow) => !c || activityOf(r) < c.at || (activityOf(r) === c.at && r.id < c.id)
}

/** The raw page a stream reads, with everything its items need — nothing about who is looking. */
export async function readBundle(store: FeedStore, q: StreamQuery): Promise<Bundle> {
  const [own, comments] = await Promise.all([
    store.items({ ...q, limit: FEED_READ + 1 }),
    q.pullFrom?.length ? store.commentsBy(q.pullFrom, q.before, FEED_READ) : Promise.resolve([] as CommentRef[]),
  ])
  // friends.stream (D327): a card a friend commented on joins the page.
  const pulledBy = new Map<string, string[]>()
  for (const c of comments) pulledBy.set(c.parentId, [...(pulledBy.get(c.parentId) ?? []), c.authorId])
  const have = new Set(own.map(r => r.id))
  const extra = pulledBy.size
    ? (await store.itemsByIds([...pulledBy.keys()].filter(id => !have.has(id))))
      .filter(r => !r.parentId && !r.removedAt && !r.held).filter(olderThanCursor(q.before))
    : []
  const all = [...own, ...extra].sort(latestFirst)
  const more = own.length > FEED_READ || comments.length >= FEED_READ || all.length > FEED_READ
  const page = all.slice(0, FEED_READ)
  const ids = page.map(r => r.id)
  const [children, dots] = await Promise.all([
    ids.length ? store.childrenOf(ids) : Promise.resolve([]),
    ids.length ? store.dotsOn(ids) : Promise.resolve([]),
  ])
  const authors = [...new Set([...page, ...children].map(r => r.authorId).filter((x): x is string => !!x))]
  const [audiences, juniors] = await Promise.all([store.audiences(authors), store.juniors(authors)])
  return { rows: page, pulledBy, children, dots, audiences, juniors, more }
}

/** Who else the viewer sees as a poster's authority on club posts: the clubs whose posts they may take down (D325). */
export interface ViewExtras {
  /** Clubs where this viewer may post to and take down club.stream (D325). */
  postClubs?: ReadonlySet<string>
  /** Club event types this viewer turned off — a club post about one is not shown (D325, 095). */
  hiddenTypes?: ReadonlySet<string>
}

/**
 * A bundle through one viewer's eyes (D305): only what `mayView` lets them
 * see, in its stream, one item a card with its comments grouped on it
 * (D329) — the counts and the line worked out from what they may see too.
 */
export function viewBundle(b: Bundle, viewer: Viewer, stream: { kind: StreamRef['kind']; id?: string | null }, extras: ViewExtras = {}): { items: FeedView[]; next: Cursor | null } {
  const facts = (r: ItemRow) => factsOf(r, b.audiences, b.juniors)
  const kids = new Map<string, ItemRow[]>()
  for (const c of b.children) {
    if (!c.parentId) continue
    const list = kids.get(c.parentId)
    if (list) list.push(c)
    else kids.set(c.parentId, [c])
  }
  const items: FeedView[] = []
  for (const r of b.rows) {
    if (r.parentId) continue
    const f = facts(r)
    const friendsIn = (b.pulledBy.get(r.id) ?? []).filter(id => id !== viewer.userId && viewer.friends.has(id))
    if (!mayView(f, viewer) || !inStream({ ...f, kind: r.kind, stream: r.stream ?? null }, stream, viewer, { pulled: friendsIn.length > 0 })) continue
    if (r.kind === 'post' && typeof r.data.eventType === 'string' && extras.hiddenTypes?.has(r.data.eventType)) continue
    const children = (kids.get(r.id) ?? []).filter(c => mayViewChild(facts(c), f, viewer))
    const comments = children.filter(c => c.kind === 'comment').sort(newestFirst)
    const highlights = children.filter(c => c.kind === 'highlight').sort((x, z) => x.createdAt.localeCompare(z.createdAt))
    const dots = b.dots.filter(d => d.itemId === r.id)
    const mine = !!r.authorId && r.authorId === viewer.userId
    const friendAuthor = !!r.authorId && viewer.friends.has(r.authorId)
    // D327: say why a card a friend commented on is here, when it is not a friend's own.
    const whyName = stream.kind === 'friends' && !mine && !friendAuthor && friendsIn.length
      ? str(comments.find(c => c.authorId === friendsIn[0])?.data.name) : ''
    const postAdmin = r.kind === 'post' && !!r.clubId && !!extras.postClubs?.has(r.clubId)
    items.push({
      ...blank(r, viewer),
      dots: dots.length, dotted: dots.some(d => d.userId === viewer.userId),
      comments: comments.length,
      latest: comments[0] ? { name: str(comments[0].data.name) || 'A member', text: str(comments[0].data.text) } : null,
      commentLine: commentLine(comments.map(c => ({ authorId: c.authorId, name: str(c.data.name) || 'A member' })), viewer),
      why: whyName ? `${whyName} commented` : null,
      highlights: highlights.map(h => str(h.data.line)).filter(Boolean),
      audience: mine && r.kind === 'card' ? r.audience : null,
      canDelete: (mine && (r.kind === 'status' || r.kind === 'post' || (r.kind === 'card' && !!r.status))) || postAdmin,
    })
  }
  const last = b.rows[b.rows.length - 1]
  return { items: items.slice(0, FEED_PAGE * 2), next: b.more && last ? { at: activityOf(last), id: last.id } : null }
}

function blank(r: ItemRow, viewer: Viewer): FeedView {
  const d = r.data
  const mine = !!r.authorId && r.authorId === viewer.userId
  const line = r.kind === 'card'
    // D334: the event and where — the marker is left off, as the trip scorecard leaves it.
    ? contextLine({ event: str(d.event) || null, club: str(d.club) || null, course: str(d.course) || null })
    : r.kind === 'post' ? str(d.title) || str(d.club) : r.kind === 'status' ? '' : str(d.line)
  return {
    id: r.id, kind: r.kind, at: r.createdAt, name: str(d.name) || 'A member', line,
    status: r.kind === 'card' || r.kind === 'status' ? r.status : null,
    gross: num(d.gross), points: num(d.points), holes: num(d.holes), place: num(d.place),
    highlights: [], dots: 0, dotted: false, comments: 0, latest: null, commentLine: null, why: null,
    text: r.kind === 'post' ? str(d.text) || null : null, link: r.kind === 'post' ? r.link ?? null : null,
    talk: talksOn(r.kind),
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
  if (!(await store.ready())) return action === 'home' ? done({ ready: false }) : action === 'badge' ? done({ count: 0 }) : fail(503, FEED_NOT_READY)
  // A junior gets nothing social (D304): no feed, no friends, nothing written.
  if (a.junior) return action === 'home' ? done({ ready: true, junior: true }) : action === 'badge' ? done({ count: 0 }) : fail(403, 'The feed isn’t open to junior members.')
  const friends = await runFriends(action, input, a, store, now)
  if (friends) return friends
  const cards = await runCards(action, input, a, store, now)
  if (cards) return cards
  const social = await runSocial(action, input, a, store, now)
  if (social) return social
  const own = await runOwn(action, input, a, store, now)
  if (own) return own

  if (action === 'home') return home(input, a, store, now)
  // The Stream tab's dot (D307, moved by D320): one count, nothing else read.
  if (action === 'badge') {
    const settings = await store.settings(a.user.id)
    return done({ count: await store.commentsSince(a.user.id, settings.commentsSeenAt) })
  }
  if (action === 'page') return page(input, a, store, now)
  if (action === 'oncourse') return onCourse(input, a, store, now)
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
    const streams = readStreams([STREAMS_V2, ...keys], clubs.map(c => c.id))
    if (streams.length === 0) return fail(400, 'Keep at least one stream.')
    await store.saveSettings(a.user.id, { streams: keptStreams(streams) })
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
  const [settings, clubs, follows, v2] = await Promise.all([store.settings(a.user.id), store.myClubs(a.user.id), store.follows(a.user.id), store.v2()])
  const [comps, newComments] = await Promise.all([
    store.recentComps(a.user.id, clubs.map(c => c.id), sinceDay(today), today),
    store.commentsSince(a.user.id, settings.commentsSeenAt),
  ])
  const streams = readStreams(settings.streams, clubs.map(c => c.id))
  const clubName = (id: string) => clubs.find(c => c.id === id)?.name ?? null
  const view = (s: StreamRef): StreamView => ({ key: streamKey(s), kind: s.kind, label: streamLabel(s, { club: clubName }), empty: emptyLine(s.kind), about: streamAbout(s.kind) })
  // Every stream the member could keep (D321): their clubs', comp, match, friends.
  const offered = offeredStreams(clubs.map(c => c.id))
  const here = clubs.find(c => c.slug === str(input.club))?.id ?? null
  const posts = here && v2 ? await postClubsOf(a, store, [here]) : new Set<string>()
  return done({
    ready: true, junior: false, v2,
    audience: settings.audience, audiences: AUDIENCES,
    streams: streams.map(view), offered: offered.map(view),
    clubs: clubs.map(c => ({ id: c.id, slug: c.slug, name: c.name })),
    here,
    // D325: whether this member may post to the club's stream here.
    canPost: !!here && posts.has(here),
    // D326, D332: the match streams followed — none until interclub teams exist.
    follows: follows.map(key => ({ key, label: 'Match' })),
    comps: orderComps(comps).filter(c => (c.date ?? '') <= today),
    newComments,
    today,
  })
}

/** The clubs (of these) where this account may post to club.stream and take its posts down (D325). */
async function postClubsOf(a: Asker, store: FeedStore, clubIds: string[]): Promise<Set<string>> {
  const [staff, rows] = await Promise.all([
    store.isStaff(a.user.id),
    Promise.all(clubIds.map(id => store.clubCredentials(id, a.user.id).then(r => [id, r] as const))),
  ])
  return new Set(rows.filter(([, r]) => clubMay('post_club_stream', { row: r ? credentialsOf(r) : null, staff })).map(([id]) => id))
}

/** One page of one stream, through this viewer's eyes. */
async function page(input: Record<string, unknown>, a: Asker, store: FeedStore, now: Date): Promise<FeedOutcome> {
  const stream = readStreamKey(input.stream)
  if (!stream) return fail(400, 'Which stream?')
  const before = readCursor(input.before)

  if (stream.kind === 'friends') {
    const { viewer } = await viewerOf(a, store)
    const friends = [...viewer.friends]
    const b = await readBundle(store, { authors: [a.user.id, ...friends], notKinds: ['post'], pullFrom: friends, before, limit: FEED_READ })
    return done(viewBundle(b, viewer, { kind: 'friends' }))
  }

  if (stream.kind === 'match') {
    // D326, D332: a match stream the member follows — none until interclub teams exist.
    const { viewer } = await viewerOf(a, store)
    const key = str(input.match)
    if (!key) return done({ items: [], next: null })
    if (!isMatchStream(key) || !viewer.follows?.has(key)) return fail(403, 'Follow that match stream first.')
    const read = () => readBundle(store, { stream: key, before: null, limit: FEED_READ })
    const b = before ? await readBundle(store, { stream: key, before, limit: FEED_READ })
      : store.shared ? await store.shared(key, read) : await read()
    return done(viewBundle(b, viewer, { kind: 'match', id: key.slice('match:'.length) }))
  }

  if (stream.kind === 'club') {
    const { viewer } = await viewerOf(a, store)
    // A club's stream is for the club's own people only (D294); its posts only (D325).
    if (!viewer.clubs.has(stream.id)) return fail(403, 'That stream is for the club’s members.')
    const q = { clubId: stream.id, kinds: ['post'] as FeedKind[], limit: FEED_READ }
    const read = () => readBundle(store, { ...q, before: null })
    const [b, postClubs, hidden] = await Promise.all([
      before ? readBundle(store, { ...q, before }) : store.shared ? store.shared(`club:${stream.id}`, read) : read(),
      postClubsOf(a, store, [stream.id]),
      store.hiddenTypes(a.user.id),
    ])
    return done(viewBundle(b, viewer, { kind: 'club', id: stream.id }, { postClubs, hiddenTypes: new Set(hidden) }))
  }

  // Comp: only a comp the picker offers this member (D300), never one still to come (D323).
  const code = str(input.comp).trim().toUpperCase()
  const today = irishDay(now)
  const clubs = await store.myClubs(a.user.id)
  const comps = await store.recentComps(a.user.id, clubs.map(c => c.id), sinceDay(today), today)
  const comp = comps.find(c => c.code === code && (c.date ?? '') <= today)
  if (!comp) return fail(404, 'That comp isn’t one of yours.')
  const { viewer } = await viewerOf(a, store, { tripId: comp.playing ? comp.tripId : null })
  const q = { tripId: comp.tripId, notKinds: ['post', 'status'] as FeedKind[], limit: FEED_READ }
  const read = () => readBundle(store, { ...q, before: null })
  const b = before ? await readBundle(store, { ...q, before })
    : store.shared ? await store.shared(`comp:${comp.tripId}`, read) : await read()
  return done(viewBundle(b, viewer, { kind: 'comp', id: comp.tripId }))
}

/**
 * The On the course strip (D302): live players appear here and never as
 * items — only those with an account, never a junior, never one who chose
 * Only me, and only in the stream they belong to.
 */
async function onCourse(input: Record<string, unknown>, a: Asker, store: FeedStore, now: Date): Promise<FeedOutcome> {
  const stream = readStreamKey(input.stream)
  if (!stream || stream.kind === 'match') return done({ players: [] })
  const all = store.shared ? await store.shared('live', () => store.liveNow()) : await store.liveNow()
  const { viewer } = await viewerOf(a, store)
  let tripId: string | null = null
  if (stream.kind === 'comp') {
    const today = irishDay(now)
    const comps = await store.recentComps(a.user.id, [...viewer.clubs], sinceDay(today), today)
    tripId = comps.find(c => c.code === str(input.comp).trim().toUpperCase())?.tripId ?? null
    if (!tripId) return done({ players: [] })
  }
  if (stream.kind === 'club' && !viewer.clubs.has(stream.id)) return done({ players: [] })
  const here = all.filter(p => !!p.userId && (
    stream.kind === 'friends' ? viewer.friends.has(p.userId!)
      : stream.kind === 'club' ? p.clubId === stream.id
      : p.tripId === tripId))
  const users = [...new Set(here.map(p => p.userId as string))]
  const [audiences, juniors] = await Promise.all([store.audiences(users), store.juniors(users)])
  const shown = here.filter(p => p.userId === a.user.id || (audiences.get(p.userId as string) !== 'me' && !juniors.has(p.userId as string)))
  return done({ players: shown.sort((x, y) => y.thru - x.thru || x.name.localeCompare(y.name)).slice(0, 12).map(p => ({ name: p.name, thru: p.thru })) })
}

// Re-exported for the stand-in store in the tests.
export { olderThan, newestFirst }
