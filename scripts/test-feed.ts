/**
 * The feed and its streams (social v1, D293–D307): the rules
 * (lib/feed.ts), the route's logic on a stand-in store (app/api/feed/), and
 * the wiring read off the source.
 *
 *   npx tsx scripts/test-feed.ts
 */
import fs from 'fs'
import {
  cardFacts, cardHighlights, defaultComp, effectiveAudience, inStream, mayView, mayViewChild, pillsFor, readStreams,
  searchTerm, shownComp, statusIssue, cleanText, counter, friendState, standingWith, pair, reportDestination, moveLine,
  matchLine, contextLine, olderThan, newestFirst, commentLine, compMenu, STREAMS_V2, keptStreams, streamKey, streamWord,
  type Audience, type CompRef, type ItemFacts, type StreamKind, type Viewer,
} from '../lib/feed'
import { runFeed, type FeedStore, type ItemRow } from '../app/api/feed/feed'
import { announcement, mayAnnounce } from '../lib/clubEvents'
import { clubMay } from '../lib/clubMay'
import type { AuthUser } from '../lib/account'
import { runSign, type SignStore, type Signature } from '../app/api/card/sign'
import type { MemberRecord } from '../app/api/club/club'

let passed = 0, failed = 0
const failures: string[] = []
export function ok(c: boolean, label: string) {
  if (c) { passed++; return }
  failed++; failures.push(label); console.log(`  ✗ ${label}`)
}
export function eq<T>(a: T, b: T, label: string) {
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) console.log(`    got      ${JSON.stringify(a)}\n    expected ${JSON.stringify(b)}`)
  ok(same, label)
}
function section(s: string) { console.log(`\n${s}`) }
const read = (f: string) => fs.readFileSync(f, 'utf8')
const NOW = new Date('2026-11-24T12:00:00Z')

// ─── The rules ──────────────────────────────────────────────────

function ruleTests() {
  section('Audience (D296): Only me always wins; else the card’s own, else the setting')
  eq(effectiveAudience('me', 'wide'), 'me', 'Only me in the settings beats a card set wider')
  eq(effectiveAudience('wide', 'me'), 'me', 'a card kept to Only me')
  eq(effectiveAudience(null, null), 'wide', 'nothing chosen is Friends and my clubs (the default)')

  const v = (o: Partial<Viewer> = {}): Viewer => ({ userId: 'z', junior: false, friends: new Set(), clubs: new Set(), events: new Set(), ...o })
  const item = (o: Partial<ItemFacts> = {}): ItemFacts => ({ id: 'i', kind: 'card', authorId: 'y', parentId: null, tripId: 't1', clubId: null, audience: 'wide', removed: false, held: false, ...o })

  section('Who sees an item (D305)')
  ok(!mayView(item(), v()), 'a stranger sees nothing')
  ok(mayView(item(), v({ friends: new Set(['y']) })), 'a friend sees it')
  ok(mayView(item({ clubId: 'c1' }), v({ clubs: new Set(['c1']) })), 'somebody on the club’s list sees a club card')
  ok(!mayView(item({ clubId: 'c1' }), v({ clubs: new Set(['c2']) })), '…another club’s member does not')
  ok(mayView(item(), v({ events: new Set(['t1']) })), 'somebody in the same event sees it')
  ok(!mayView(item({ audience: 'me' }), v({ friends: new Set(['y']), clubs: new Set(['c1']), events: new Set(['t1']) })), 'Only me hides it from a friend, a club-mate and the field')
  ok(mayView(item({ audience: 'me' }), v({ userId: 'y' })), '…never from its author')
  ok(!mayView(item({ held: true }), v({ userId: 'y' })), 'a held status is shown to nobody')
  ok(!mayView(item({ removed: true }), v({ friends: new Set(['y']) })), 'a card taken down is shown to nobody')
  ok(!mayView(item(), v({ junior: true, friends: new Set(['y']) })), 'a junior sees nothing (D304)')

  section('Comments follow their card (D301)')
  const ys = item({ authorId: 'y', tripId: 't9' })
  const xsComment = { removed: false, held: false }
  ok(!mayViewChild(xsComment, ys, v({ userId: 'z', friends: new Set(['x']) })), 'X comments on Y’s card; X’s friend Z, who may not see the card, sees nothing')
  ok(mayViewChild(xsComment, ys, v({ userId: 'z', friends: new Set(['y']) })), '…Z sees it once Z may see the card')
  ok(!mayViewChild(xsComment, null, v()), 'a comment whose card is gone is shown to nobody')

  section('Streams (D294): each holds only its own')
  const viewer = { userId: 'me', friends: new Set(['f']) }
  ok(inStream({ authorId: 'f', tripId: 't', clubId: 'c' }, { kind: 'friends' }, viewer), 'a friend’s item is in Friends')
  ok(inStream({ authorId: 'me', tripId: 't', clubId: null }, { kind: 'friends' }, viewer), '…and my own, to see comments on it')
  ok(!inStream({ authorId: 'x', tripId: 't', clubId: 'c' }, { kind: 'friends' }, viewer), 'a stranger’s is not in Friends')
  ok(inStream({ authorId: 'x', tripId: null, clubId: 'c', kind: 'post' }, { kind: 'club', id: 'c' }, viewer), 'a club’s post is in that club’s stream (D325)')
  ok(!inStream({ authorId: 'x', tripId: 't', clubId: 'c', kind: 'card' }, { kind: 'club', id: 'c' }, viewer), '…its cards are comp.stream’s, not club.stream’s')
  ok(!inStream({ authorId: 'f', tripId: null, clubId: 'c', kind: 'post' }, { kind: 'friends' }, viewer), 'a post is never in friends.stream, even a friend’s')
  ok(!inStream({ authorId: 'f', tripId: null, clubId: null, kind: 'status', stream: 'match:00000000-0000-0000-0000-000000000001' }, { kind: 'friends' }, viewer), '…nor a status posted to a match stream')
  ok(inStream({ authorId: 'z', tripId: 't', clubId: 'c', kind: 'card' }, { kind: 'friends' }, viewer, { pulled: true }), 'a card a friend commented on is in friends.stream (D327)')
  ok(!inStream({ authorId: 'x', tripId: 't', clubId: null, kind: 'status' }, { kind: 'comp', id: 't' }, viewer), 'a status is never in comp.stream')
  ok(!inStream({ authorId: 'x', tripId: 't', clubId: 'c' }, { kind: 'club', id: 'd' }, viewer), '…never another club’s')
  ok(inStream({ authorId: 'x', tripId: 't', clubId: null }, { kind: 'comp', id: 't' }, viewer), 'an event’s item is in its Comp stream')
  ok(!inStream({ authorId: 'x', tripId: 'u', clubId: null }, { kind: 'comp', id: 't' }, viewer), '…never another event’s')
  ok(!inStream({ authorId: 'f', tripId: 't', clubId: 'c' }, { kind: 'match', id: 'p' }, viewer), 'match.stream holds nothing until interclub teams exist (D332) — so nobody off a team gets anything from one')

  section('The member’s streams (D300, D321)')
  const C = '00000000-0000-0000-0000-00000000000c', D = '00000000-0000-0000-0000-00000000000d'
  eq(readStreams(null, [C, D]).map(s => streamKey(s)), [`club:${C}`, `club:${D}`, 'comp', 'match', 'friends'], 'nothing stored is their clubs, then comp, match, friends')
  eq(readStreams(['friends', `club:${C}`, `club:${D}`, 'friends', 'nonsense'], [C]).map(s => streamKey(s)),
    ['friends', `club:${C}`, 'match'], 'a club they have left goes, a stream kept twice is once, nonsense is dropped — and a list kept before v2 gains match')
  eq(readStreams(['comp', 'friends'], []).map(s => s.kind), ['comp', 'match', 'friends'], '…match.stream after comp')
  eq(readStreams(['team:00000000-0000-0000-0000-000000000099'], []).map(s => s.kind), ['match'], 'a Team stream kept before is match.stream now (D332)')
  eq(readStreams([STREAMS_V2, 'friends'], []).map(s => s.kind), ['friends'], 'a list saved under v2 keeps match off when the member turned it off')
  eq(keptStreams([{ kind: 'friends' }, { kind: 'club', id: C }]), [STREAMS_V2, 'friends', `club:${C}`], 'kept with the v2 mark')
  eq(readStreams([STREAMS_V2], []), [], 'nothing kept reads as nothing (the route refuses to save an empty list)')
  const all = readStreams(null, ['c1'])
  eq(pillsFor(all, { here: null, compLive: false }).map(s => s.kind), ['comp', 'match', 'friends'], 'a club’s stream shows only inside that club’s area (D294)')
  eq(pillsFor(all, { here: 'c1', compLive: false }).map(s => s.kind), ['club', 'comp', 'match', 'friends'], '…where it leads')
  eq(pillsFor(all, { here: 'c1', compLive: true }).map(s => s.kind), ['comp', 'club', 'match', 'friends'], 'a live comp leads (D295)')
  eq(['club', 'comp', 'match', 'friends'].map(k => streamWord(k as StreamKind)), ['club', 'comp', 'match', 'friends'], 'the four names’ words (D321)')

  section('The Comp picker (D300): the latest comp played, a pick kept until a newer one')
  const comp = (code: string, date: string, playing: boolean): CompRef => ({ tripId: code, code, name: code, date, endDate: null, playing, live: false, clubId: null, clubName: null })
  const comps = [comp('OLD', '2026-11-01', true), comp('NEW', '2026-11-20', true), comp('CLUB', '2026-11-22', false)]
  eq(defaultComp(comps, '2026-11-24')?.code, 'CLUB', 'opens on the most recent comp that is live or finished (D323)')
  eq(defaultComp([...comps, comp('FUTURE', '2026-11-30', true)], '2026-11-24')?.code, 'CLUB', '…never one still to come')
  eq(compMenu([...comps, { ...comp('MP', '2026-11-10', false), category: 'matchplay' }, comp('FUTURE', '2026-11-30', true)], '2026-11-24').map(h => [h.label, h.comps.map(c => c.code)]),
    [['Match play', ['MP']], ['Your events', ['CLUB', 'NEW', 'OLD']]], 'the menu: its headings, each newest first, a future comp nowhere (D323)')
  eq(shownComp(comps, '2026-11-24', { code: 'OLD', over: 'CLUB' })?.code, 'OLD', 'a comp picked is kept…')
  eq(shownComp([...comps, comp('NEWER', '2026-11-23', true)], '2026-11-24', { code: 'OLD', over: 'CLUB' })?.code, 'NEWER', '…until a newer one goes live or finishes')

  section('Cards and highlights (D302)')
  const h = (n: number, par: number, gross: number | null, noReturn = false) => ({ number: n, par, gross, noReturn, points: gross == null ? 0 : Math.max(0, par + 2 - gross) })
  const card = [h(1, 3, 1), h(2, 5, 3), ...Array.from({ length: 16 }, (_, i) => h(i + 3, 4, 4))]
  const f = cardFacts(card)
  eq([f.holes, f.gross, f.holesInOne, f.eagles], [18, 68, [1], [2]], 'a card’s gross, its hole in one and its eagle (an ace is not also an eagle)')
  eq(cardHighlights(f, [72, 70], 'Lahinch').map(x => x.type), ['hole_in_one', 'eagle', 'personal_best'], 'a personal best beats every earlier complete 18 at the course')
  eq(cardHighlights(f, [], null).map(x => x.type), ['hole_in_one', 'eagle'], 'no personal best on a first card there')
  eq(cardFacts([h(1, 4, 4), h(2, 4, null, true)]).gross, null, 'a card with a no return has no gross')
  eq(moveLine('Dave', 1, false), 'Dave takes the lead', 'a leaderboard move')
  eq(matchLine('Ross', 'Dave', '3&2'), 'Ross beat Dave 3&2', 'a match result')
  eq(contextLine({ event: 'Saturday medal', club: 'Pints GC', marker: 'Mark' }), 'Saturday medal · Pints GC · co-signed by Mark', 'the context line')

  section('Status (D299)')
  eq(statusIssue(''), null, 'an empty status is no status at all, never an error')
  ok(!!statusIssue('x'.repeat(141)), 'over 140 characters is refused')
  eq(counter('x'.repeat(44)), '44 / 140', 'the counter')
  eq(cleanText('  two\nlines\t ', 140), 'two lines', 'one line of plain words')

  section('Friends (D297)')
  eq(searchTerm('a'), null, 'one character asks nothing')
  eq(searchTerm('  ro  '), 'ro', 'two characters search')
  eq(searchTerm('%,()'), null, 'wildcards are not a search')
  const rows = [{ ...pair('me', 'a'), requestedBy: 'a', accepted: false }, { ...pair('me', 'b'), requestedBy: 'me', accepted: false }, { ...pair('me', 'c'), requestedBy: 'c', accepted: true }]
  eq(friendState(rows, 'me'), { friends: ['c'], incoming: ['a'], outgoing: ['b'] }, 'friends, and requests each way')
  eq(['a', 'b', 'c', 'd'].map(o => standingWith(rows, 'me', o)), ['asks_you', 'asked', 'friend', 'none'], 'where each stands')

  section('Reports (D303)')
  eq(reportDestination({ clubId: 'c1', kind: 'card' }, null), { clubId: 'c1' }, 'a club card’s report goes to its club')
  eq(reportDestination({ clubId: null, kind: 'comment' }, { clubId: 'c1' }), { clubId: 'c1' }, 'a comment on a club card goes to the club')
  eq(reportDestination({ clubId: null, kind: 'card' }, null), 'green_dot', 'anything else goes to Green Dot')
}

// ─── The route on a stand-in ────────────────────────────────────

export type World = {
  users: Map<string, AuthUser>
  juniors: Set<string>
  settings: Map<string, { audience: Audience; streams: unknown; commentsSeenAt: string | null }>
  clubs: Map<string, { id: string; slug: string; name: string; members: string[] }>
  friends: { a: string; b: string; by: string; accepted: boolean }[]
  items: ItemRow[]
  dots: { itemId: string; userId: string }[]
  comps: Map<string, CompRef[]>
  ready: boolean
  /** Club list rows: a junior's membership marked, a row taken off, one with no account. */
  rows: { rowId: string; userId: string | null; clubId: string; name: string; removed: boolean; junior: boolean }[]
  profiles: Set<string>
  /** Card players: round → trip code, trip id, player → account. */
  cards: Map<string, { code: string; tripId: string; accounts: Map<string, string> }>
  live: { playerId: string; name: string; tripId: string; clubId: string | null; userId: string | null; thru: number }[]
  reports: { itemId: string; reporterId: string; clubId: string | null; reason: string | null; resolved: string | null }[]
  creds: Map<string, { role: 'owner' | 'admin' | 'member'; officer?: boolean; clubhouse?: boolean }>
  /** 104 in (Streams v2). */
  v2: boolean
  follows: { userId: string; stream: string }[]
  /** Match streams that exist to be followed — none on the live site until interclub teams (D332). */
  followable: Set<string>
  hidden: Map<string, string[]>
}

export function world(): World {
  const user = (id: string): AuthUser => ({ id, isAnonymous: false, email: `${id}@x.ie`, emailConfirmed: true })
  return {
    users: new Map(['x', 'y', 'z', 'j', 'c'].map(id => [`tok-${id}`, user(id)])),
    juniors: new Set(['j']),
    settings: new Map(),
    clubs: new Map([['club-1', { id: '00000000-0000-0000-0000-0000000000c1', slug: 'pints', name: 'Pints GC', members: ['x', 'y', 'c'] }]]),
    friends: [],
    items: [],
    dots: [],
    comps: new Map(),
    ready: true,
    rows: [],
    profiles: new Set(),
    cards: new Map(),
    live: [],
    reports: [],
    creds: new Map(),
    v2: true,
    follows: [],
    followable: new Set(),
    hidden: new Map(),
  }
}

const activity = (r: ItemRow) => r.bumpedAt ?? r.createdAt

export function standIn(w: World): FeedStore {
  const club = () => [...w.clubs.values()]
  return {
    async userFromToken(t) { return w.users.get(t) ?? null },
    async ready() { return w.ready },
    async settings(u) { return w.settings.get(u) ?? { audience: 'wide', streams: null, commentsSeenAt: null } },
    async saveSettings(u, p) {
      const s = w.settings.get(u) ?? { audience: 'wide' as Audience, streams: null, commentsSeenAt: null }
      w.settings.set(u, { audience: p.audience ?? s.audience, streams: p.streams ?? s.streams, commentsSeenAt: p.commentsSeenAt ?? s.commentsSeenAt })
    },
    async audiences(ids) { return new Map(ids.filter(i => w.settings.has(i)).map(i => [i, w.settings.get(i)!.audience])) },
    async juniors(ids) { return new Set(ids.filter(i => w.juniors.has(i))) },
    async myClubs(u) { return club().filter(c => c.members.includes(u)).map(c => ({ id: c.id, slug: c.slug, name: c.name })) },
    async friendIds(u) { return w.friends.filter(f => f.accepted && (f.a === u || f.b === u)).map(f => (f.a === u ? f.b : f.a)) },
    async items(q) {
      const c = q.before
      return w.items.filter(r => !r.removedAt && !r.held && !r.parentId)
        .filter(r => !q.authors || (!!r.authorId && q.authors.includes(r.authorId)))
        .filter(r => !q.clubId || r.clubId === q.clubId)
        .filter(r => !q.tripId || r.tripId === q.tripId)
        .filter(r => !q.stream || r.stream === q.stream)
        .filter(r => !q.kinds || q.kinds.includes(r.kind))
        .filter(r => !q.notKinds || !q.notKinds.includes(r.kind))
        .filter(r => !c || activity(r) < c.at || (activity(r) === c.at && r.id < c.id))
        .sort((a, b) => activity(b).localeCompare(activity(a)) || b.id.localeCompare(a.id)).slice(0, q.limit)
    },
    async commentsBy(authors, before, limit) {
      return w.items.filter(r => r.kind === 'comment' && r.parentId && r.authorId && authors.includes(r.authorId) && !r.removedAt && (!before || r.createdAt <= before.at))
        .sort(newestFirst).slice(0, limit).map(r => ({ parentId: r.parentId as string, authorId: r.authorId as string, createdAt: r.createdAt }))
    },
    async v2() { return w.v2 },
    async follows(u) { return w.follows.filter(f => f.userId === u).map(f => f.stream) },
    async followable(stream) { return w.followable.has(stream) },
    async setFollow(u, stream, on) {
      w.follows = w.follows.filter(f => !(f.userId === u && f.stream === stream))
      if (on) w.follows.push({ userId: u, stream })
    },
    async insertOwn(o) {
      const r = itemRow({ kind: o.kind, authorId: o.authorId, clubId: o.clubId, stream: o.stream, status: o.kind === 'status' ? o.text : null, link: o.link, data: o.data })
      w.items.push(r)
      return r
    },
    async bump(id, at) { const r = w.items.find(x => x.id === id); if (r && activity(r) < at) r.bumpedAt = at },
    async hiddenTypes(u) { return w.hidden.get(u) ?? [] },
    async cardDetail() { return { course: 'Pints', tees: 'White', handicap: 12, holes: [{ number: 1, par: 4, si: 7, gross: 5, net: 4, points: 2 }] } },
    async itemsByIds(ids) { return w.items.filter(r => ids.includes(r.id)) },
    async childrenOf(ids) { return w.items.filter(r => r.parentId && ids.includes(r.parentId) && !r.removedAt && !r.held) },
    async dotsOn(ids) { return w.dots.filter(d => ids.includes(d.itemId)) },
    async recentComps(u) { return w.comps.get(u) ?? [] },
    async friendRows(u) { return w.friends.filter(f => f.a === u || f.b === u).map(f => ({ userA: f.a, userB: f.b, requestedBy: f.by, accepted: f.accepted })) },
    async searchList(clubIds, term, limit) {
      const clubName = (id: string) => [...w.clubs.values()].find(c => c.id === id)?.name ?? ''
      return w.rows.filter(r => clubIds.includes(r.clubId) && r.userId && !r.removed && !r.junior && r.name.toLowerCase().includes(term.toLowerCase()))
        .slice(0, limit).map(r => ({ rowId: r.rowId, userId: r.userId as string, name: r.name, clubId: r.clubId, clubName: clubName(r.clubId) }))
    },
    async listRow(id) { const r = w.rows.find(x => x.rowId === id); return r ? { userId: r.userId, clubId: r.clubId, removed: r.removed } : null },
    async saveFriend(row) {
      w.friends = w.friends.filter(f => !(f.a === row.userA && f.b === row.userB))
      w.friends.push({ a: row.userA, b: row.userB, by: row.requestedBy, accepted: row.accepted })
    },
    async dropFriend(a, b) { w.friends = w.friends.filter(f => !(f.a === a && f.b === b)) },
    async names(ids) { return new Map(ids.map(id => [id, { name: w.rows.find(r => r.userId === id)?.name ?? id, club: 'Pints GC' }])) },
    async juniorProfile(u) { return w.profiles.has(u) },
    async liveNow() { return w.live },
    async insertComment(o) {
      const c = itemRow({ kind: 'comment', authorId: o.authorId, parentId: o.parentId, tripId: o.tripId, clubId: o.clubId, data: { name: o.name, text: o.text } })
      w.items.push(c)
      return c
    },
    async deleteItem(id) { w.items = w.items.filter(r => r.id !== id && r.parentId !== id) },
    async setDot(itemId, userId, on) {
      w.dots = w.dots.filter(d => !(d.itemId === itemId && d.userId === userId))
      if (on) w.dots.push({ itemId, userId })
    },
    async insertReport(o) { if (!w.reports.some(r => r.itemId === o.itemId && r.reporterId === o.reporterId)) w.reports.push({ ...o, resolved: null }) },
    async clubCredentials(clubId, userId) { return w.creds.get(`${clubId}:${userId}`) ?? null },
    async isStaff() { return false },
    async reportsFor(clubId) {
      return w.reports.filter(r => !r.resolved && r.clubId === clubId).map((r, i) => ({ id: `rep${i}`, itemId: r.itemId, reason: r.reason, createdAt: '', item: { kind: 'card', name: '', text: '', event: null, removed: false }, reporter: r.reporterId }))
    },
    async resolveReports(itemId, by, outcome, at) {
      if (outcome === 'removed') { const it = w.items.find(r => r.id === itemId); if (it) it.removedAt = at }
      for (const r of w.reports) if (r.itemId === itemId && !r.resolved) r.resolved = outcome
    },
    async cardPlayers(code, roundId, playerIds) {
      const c = w.cards.get(roundId)
      if (!c || c.code !== code) return null
      return { tripId: c.tripId, accounts: new Map([...c.accounts].filter(([p]) => playerIds.includes(p))), names: new Map(playerIds.map(p => [p, p.toUpperCase()])) }
    },
    async setCardStatus(o) {
      const it = w.items.find(r => r.key === o.key && r.authorId === o.authorId)
      if (it) { it.status = o.status; it.audience = o.audience; return }
      w.items.push(itemRow({ key: o.key, kind: 'card', authorId: o.authorId, tripId: o.tripId, roundId: o.roundId, playerId: o.playerId, status: o.status, audience: o.audience, held: true }))
    },
    async ownItem(id, u) { const r = w.items.find(x => x.id === id && x.authorId === u && !x.removedAt); return r ? { id: r.id, kind: r.kind } : null },
    async updateStatus(id, status) { const r = w.items.find(x => x.id === id); if (r) r.status = status },
    async commentsSince(u, since) {
      const mine = new Set(w.items.filter(r => r.authorId === u && r.kind === 'card').map(r => r.id))
      return w.items.filter(r => r.kind === 'comment' && r.parentId && mine.has(r.parentId) && r.authorId !== u && (!since || r.createdAt > since)).length
    },
  }
}

let seq = 0
export function itemRow(o: Partial<ItemRow>): ItemRow {
  seq++
  const id = `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`
  return {
    id, key: null, kind: 'card', authorId: null, parentId: null, tripId: null, roundId: null, playerId: null, clubId: null,
    data: {}, status: null, audience: null, held: false, createdAt: `2026-11-24T10:${String(seq).padStart(2, '0')}:00.000Z`, removedAt: null, ...o,
  }
}

async function routeTests() {
  section('The route (D305): decided on the server')
  const w = world()
  const s = standIn(w)
  const C1 = '00000000-0000-0000-0000-0000000000c1'
  const ask = (who: string, body: Record<string, unknown>) => runFeed({ ...body, token: `tok-${who}` }, s, NOW)

  eq((await runFeed({ action: 'home', token: null }, s, NOW)).status, 401, 'nobody signed in is refused')
  eq((await ask('j', { action: 'home' })).body, { ok: true, ready: true, junior: true }, 'a junior is told there is no feed (D304)')
  eq((await ask('j', { action: 'page', stream: 'friends' })).status, 403, '…and reads nothing')

  // Y's card in a club competition; X comments on it; Z is X's friend only.
  const ycard = itemRow({ kind: 'card', authorId: 'y', tripId: 'T1', clubId: C1, data: { name: 'Yvonne', gross: 80, points: 36, event: 'Medal' } })
  const xcomment = itemRow({ kind: 'comment', authorId: 'x', parentId: ycard.id, tripId: 'T1', clubId: C1, data: { name: 'Xavier', text: 'Shot' } })
  const xcard = itemRow({ kind: 'card', authorId: 'x', tripId: 'T2', data: { name: 'Xavier', gross: 90 } })
  w.items.push(ycard, xcomment, xcard)
  w.friends.push({ a: 'x', b: 'z', by: 'x', accepted: true })

  const zFriends = await ask('z', { action: 'page', stream: 'friends' })
  const zIds = (zFriends.body as unknown as { items: { id: string }[] }).items.map(i => i.id)
  eq(zIds, [xcard.id], 'Z sees X’s card, never X’s comment on Y’s card that Z may not see (D301)')

  const yFriends = await ask('y', { action: 'page', stream: 'friends' })
  const yItems = (yFriends.body as unknown as { items: { id: string; comments: number; latest: unknown; mine: boolean }[] }).items
  eq(yItems.map(i => [i.id, i.comments, i.mine]), [[ycard.id, 1, true]], 'Y sees their own card, with X’s comment counted on it')

  const T1 = { tripId: 'T1', code: 'T1CODE', name: 'Medal', date: '2026-11-24', endDate: null, playing: false, live: true, clubId: C1, clubName: 'Pints GC' }
  w.comps.set('x', [T1])
  const xComp = await ask('x', { action: 'page', stream: 'comp', comp: 'T1CODE' })
  eq((xComp.body as unknown as { items: { kind: string; comments: number }[] }).items.map(i => [i.kind, i.comments]), [['card', 1]],
    'a club-mate sees the club card in comp.stream, the comment on it grouped on it — never an item of its own (D329)')
  eq(((await ask('x', { action: 'page', stream: `club:${C1}` })).body as unknown as { items: unknown[] }).items, [], 'club.stream holds the club’s own posts, never its cards (D325)')
  void xcomment
  eq((await ask('z', { action: 'page', stream: `club:${C1}` })).status, 403, 'somebody not on the club’s list cannot open its stream')

  w.settings.set('y', { audience: 'me', streams: null, commentsSeenAt: null })
  const xComp2 = await ask('x', { action: 'page', stream: 'comp', comp: 'T1CODE' })
  eq((xComp2.body as unknown as { items: unknown[] }).items, [], 'Only me hides the card and the comment on it from everybody else')
  eq(((await ask('y', { action: 'page', stream: 'friends' })).body as unknown as { items: unknown[] }).items.length, 1, '…and Y still sees their own')
  w.settings.delete('y')

  section('Comp stream: only a comp the picker offers')
  w.comps.set('z', [])
  eq((await ask('z', { action: 'page', stream: 'comp', comp: 'T1CODE' })).status, 404, 'a comp that isn’t yours is refused')
  w.comps.set('c', [{ tripId: 'T1', code: 'T1CODE', name: 'Medal', date: '2026-11-24', endDate: null, playing: false, live: true, clubId: C1, clubName: 'Pints GC' }])
  const cComp = await ask('c', { action: 'page', stream: 'comp', comp: 'T1CODE' })
  eq((cComp.body as unknown as { items: { id: string }[] }).items.map(i => i.id), [ycard.id], 'a club-mate watching the comp sees its cards')
  w.comps.set('c', [{ ...T1, date: '2026-11-30', code: 'LATER' }])
  eq((await ask('c', { action: 'page', stream: 'comp', comp: 'LATER' })).status, 404, 'never a comp still to come (D323)')
  w.comps.set('c', [T1])

  eq((await ask('x', { action: 'badge' })).status, 200, 'the Stream tab’s badge answers a count (D320)')

  section('match.stream (D332): vacant until interclub teams exist')
  eq(((await ask('x', { action: 'page', stream: 'match' })).body as unknown as { items: unknown[] }).items, [], 'empty for everybody')

  section('On the course (D302): live players in the strip, never as items')
  w.friends.push({ a: 'x', b: 'y', by: 'x', accepted: true })
  w.live = [
    { playerId: 'py', name: 'Yvonne', tripId: 'T1', clubId: C1, userId: 'y', thru: 11 },
    { playerId: 'pg', name: 'A guest', tripId: 'T1', clubId: C1, userId: null, thru: 7 },
    { playerId: 'pj', name: 'Junior', tripId: 'T1', clubId: C1, userId: 'j', thru: 5 },
    { playerId: 'pc', name: 'Clubmate', tripId: 'T1', clubId: C1, userId: 'c', thru: 3 },
  ]
  const strip = async (who: string, stream: string) => ((await ask(who, { action: 'oncourse', stream })).body as unknown as { players: { name: string; thru: number }[] }).players.map(p => `${p.name} ${p.thru}`)
  eq(await strip('x', 'friends'), ['Yvonne 11'], 'Friends: a friend out on the course, thru 11')
  eq(await strip('x', `club:${C1}`), ['Yvonne 11', 'Clubmate 3'], 'Club: the club’s members with accounts — never a guest without one, never a junior')
  w.settings.set('y', { audience: 'me', streams: null, commentsSeenAt: null })
  eq(await strip('x', 'friends'), [], 'Only me keeps a player out of the strip too')
  w.settings.delete('y')
  w.friends = []

  section('Settings')
  eq((await ask('x', { action: 'audience', audience: 'me' })).status, 200, 'a member keeps their cards to themselves')
  eq(w.settings.get('x')?.audience, 'me', '…stored')
  eq((await ask('x', { action: 'audience', audience: 'close' })).status, 400, 'close friends is not built')
  await ask('x', { action: 'streams', streams: ['friends', `club:${C1}`, 'club:00000000-0000-0000-0000-0000000000ff'] })
  eq(w.settings.get('x')?.streams, [STREAMS_V2, 'friends', `club:${C1}`], 'streams kept, a club they are not on dropped')
  eq((await ask('x', { action: 'streams', streams: ['nonsense'] })).status, 400, 'a member keeps at least one stream')
  const home = await ask('x', { action: 'home', club: 'pints' })
  eq((home.body as unknown as { streams: { key: string }[] }).streams.map(s => s.key), ['friends', `club:${C1}`], 'home answers the member’s streams')
  eq((home.body as unknown as { here: string }).here, C1, '…and which club’s area it is asked from')
  w.ready = false
  eq((await ask('x', { action: 'home' })).body, { ok: true, ready: false }, 'before migration 102 the feed simply does not show')
  w.ready = true
}

async function streamsV2Tests() {
  section('friends.stream pulls in a card a friend commented on — only one you may see (D327, M8)')
  const w = world()
  const s = standIn(w)
  const C1 = '00000000-0000-0000-0000-0000000000c1'
  const ask = (who: string, body: Record<string, unknown>) => runFeed({ ...body, token: `tok-${who}` }, s, NOW)
  // X and Z are friends; Y and C are X's clubmates at Pints (not Z's friends); Z is on Pints too here.
  w.friends.push({ a: 'x', b: 'z', by: 'x', accepted: true })
  w.clubs.get('club-1')!.members.push('z')
  const clubmate = itemRow({ kind: 'card', authorId: 'y', tripId: 'T1', clubId: C1, roundId: 'R1', playerId: 'PY', data: { name: 'Yvonne' } })
  const hidden = itemRow({ kind: 'card', authorId: 'c', tripId: 'T1', clubId: C1, roundId: 'R1', playerId: 'PC', data: { name: 'Cathal' } })
  w.items.push(clubmate, hidden)
  w.settings.set('c', { audience: 'me', streams: null, commentsSeenAt: null })
  const read = async (who: string) => ((await ask(who, { action: 'page', stream: 'friends' })).body as unknown as { items: { id: string; why: string | null; commentLine: { count: string; who: string } | null }[] }).items
  eq(await read('z'), [], 'before anybody comments, a clubmate’s card is not in friends.stream')
  eq((await ask('x', { action: 'comment', itemId: clubmate.id, text: 'Some round' })).status, 200, 'friend X comments on a clubmate’s card')
  const zSees = await read('z')
  eq(zSees.map(i => i.id), [clubmate.id], '…and it appears in Z’s friends.stream')
  eq(zSees[0].why, 'x commented', '…saying why it is there')
  eq(zSees[0].commentLine, { count: '1 comment', who: 'x' }, '…its comments grouped on it (D329)')
  // An Only-me card: X (Cathal's clubmate) cannot comment on what X cannot see; nor does a comment pull it in.
  w.items.push(itemRow({ kind: 'comment', authorId: 'x', parentId: hidden.id, tripId: 'T1', clubId: C1, data: { name: 'x', text: 'leaked?' } }))
  eq((await read('z')).map(i => i.id), [clubmate.id], 'a friend’s comment on an Only-me card never pulls it in (D301 stands)')
  eq((await ask('x', { action: 'comment', itemId: hidden.id, text: 'hi' })).status, 404, '…and nobody else may comment on it')

  section('A comment lifts its card; a dot does not (D329, M10)')
  const older = itemRow({ kind: 'card', authorId: 'x', tripId: 'T2', data: { name: 'x' } })
  const newer = itemRow({ kind: 'card', authorId: 'x', tripId: 'T2', data: { name: 'x' } })
  w.items.push(older, newer)
  const xOwn = async () => ((await ask('x', { action: 'page', stream: 'friends' })).body as unknown as { items: { id: string }[] }).items.map(i => i.id).filter(id => id === older.id || id === newer.id)
  eq(await xOwn(), [newer.id, older.id], 'newest first')
  await ask('z', { action: 'dot', itemId: older.id })
  eq(await xOwn(), [newer.id, older.id], 'a dot moves nothing')
  await ask('z', { action: 'comment', itemId: older.id, text: 'Ha' })
  eq(await xOwn(), [older.id, newer.id], 'a comment moves the whole card to the top')

  section('The comment line (D329)')
  const v = { userId: 'me', friends: new Set(['f']) }
  eq(commentLine([], v), null, 'no comments, no line')
  eq(commentLine([{ authorId: 'a', name: 'Ann' }], v), { count: '1 comment', who: 'Ann' }, 'one comment: that person')
  eq(commentLine([{ authorId: 'a', name: 'Ann' }, { authorId: 'f', name: 'Fred' }, { authorId: 'b', name: 'Bob' }], v), { count: '3 comments', who: 'Fred and 2 others' }, 'more: a friend who commented leads')
  eq(commentLine([{ authorId: 'a', name: 'Ann' }, { authorId: 'b', name: 'Bob' }], v), { count: '2 comments', who: 'Ann and 1 other' }, '…else the most recent commenter')
  eq(commentLine([{ authorId: 'a', name: 'Ann' }, { authorId: 'a', name: 'Ann' }], v), { count: '2 comments', who: 'Ann' }, 'others counts people, not comments')
  eq(commentLine([{ authorId: 'me', name: 'Ross' }], v), { count: '1 comment', who: 'You' }, 'your own reads You')

  section('Statuses on their own (D328, M9)')
  eq((await ask('x', { action: 'status.post', text: '' })).status, 400, 'something to say')
  eq((await ask('x', { action: 'status.post', text: 'x'.repeat(281) })).status, 400, 'at most 280')
  eq((await ask('x', { action: 'status.post', text: 'x'.repeat(280) })).status, 200, '280 is fine')
  eq((await ask('x', { action: 'status.post', text: 'Range session', stream: 'club:' + C1 })).status, 400, 'never into club.stream')
  eq((await ask('x', { action: 'status.post', text: 'Range session', stream: 'comp' })).status, 400, '…or comp.stream')
  const posted = await ask('x', { action: 'status.post', text: 'Range session done' })
  eq(posted.status, 200, 'into friends.stream')
  const zStream = ((await ask('z', { action: 'page', stream: 'friends' })).body as unknown as { items: { kind: string; status: string; talk: boolean }[] }).items
  ok(zStream.some(i => i.kind === 'status' && i.status === 'Range session done' && i.talk), 'a friend sees it, and may comment and dot')
  ok(!((await ask('y', { action: 'page', stream: 'friends' })).body as unknown as { items: { kind: string }[] }).items.some(i => i.kind === 'status'), 'a clubmate who is not a friend does not')
  const sid = (posted.body as unknown as { id: string }).id
  eq((await ask('z', { action: 'comment', itemId: sid, text: 'Good man' })).status, 200, 'comments on a status')
  eq((await ask('z', { action: 'report', itemId: sid })).status, 200, 'and reports cover statuses (D303)')
  eq(w.reports.find(r => r.itemId === sid)?.clubId, null, '…to Green Dot')
  eq((await ask('z', { action: 'item.delete', itemId: sid })).status, 403, 'only its author deletes it')
  eq((await ask('x', { action: 'status.edit', itemId: sid, text: 'Range session done, hitting it well' })).status, 200, 'its author edits it')
  eq((await ask('x', { action: 'item.delete', itemId: sid })).status, 200, '…and deletes it')
  w.v2 = false
  eq((await ask('x', { action: 'status.post', text: 'Before 104' })).status, 503, 'before migration 104: not set up yet')
  w.v2 = true

  section('Match streams (D326, D332): follow, post, only followers see')
  const M = 'match:00000000-0000-0000-0000-0000000000f1'
  eq((await ask('x', { action: 'follow', stream: M })).status, 404, 'nothing to follow until interclub teams exist')
  w.followable.add(M)
  eq((await ask('x', { action: 'follow', stream: M })).status, 200, 'the day a team stream exists, it can be followed')
  eq((await ask('z', { action: 'status.post', text: 'Up the Pints', stream: M })).status, 403, 'a status into a match stream needs following it')
  const m = await ask('x', { action: 'status.post', text: 'Away to Lahinch Sunday', stream: M })
  eq(m.status, 200, 'a follower posts into it')
  const mPage = async (who: string) => ask(who, { action: 'page', stream: 'match', match: M })
  eq(((await mPage('x')).body as unknown as { items: { status: string }[] }).items.map(i => i.status), ['Away to Lahinch Sunday'], 'followers read it')
  eq((await mPage('z')).status, 403, 'somebody not following cannot open it')
  ok(!((await ask('z', { action: 'page', stream: 'friends' })).body as unknown as { items: { status: string | null }[] }).items.some(i => i.status === 'Away to Lahinch Sunday'),
    '…and a match stream’s status never shows in friends.stream, even to a friend')
  await ask('x', { action: 'follow', stream: M, on: false })
  eq((await mPage('x')).status, 403, 'unfollowed, gone')

  section('club.stream: the club’s own posts (D325, M5)')
  eq((await ask('y', { action: 'post.club', clubId: C1, text: 'Course closed Monday' })).status, 403, 'a member does not post to club.stream')
  w.creds.set(`${C1}:c`, { role: 'member', officer: true })
  eq((await ask('c', { action: 'post.club', clubId: C1, text: 'Course closed Monday', link: 'http://pints.ie' })).status, 400, 'links are https only')
  const post = await ask('c', { action: 'post.club', clubId: C1, text: 'Course closed Monday\n\nGreens hollow-tined.', link: 'pints.ie/news' })
  eq(post.status, 200, 'an Officer posts, with a link')
  const yClub = ((await ask('y', { action: 'page', stream: `club:${C1}` })).body as unknown as { items: { kind: string; text: string; link: string; canDelete: boolean; talk: boolean }[] }).items
  eq(yClub.map(i => [i.kind, i.text, i.link]), [['post', 'Course closed Monday\n\nGreens hollow-tined.', 'https://pints.ie/news']], 'members read it — its paragraphs kept, its link made whole')
  ok(yClub[0].talk && !yClub[0].canDelete, '…comment on it and dot it, never delete it')
  const pid = (post.body as unknown as { id: string }).id
  eq((await ask('y', { action: 'comment', itemId: pid, text: 'Grand' })).status, 200, 'a member comments on a post')
  eq((await ask('y', { action: 'item.delete', itemId: pid })).status, 403, 'a member cannot take it down')
  w.creds.set(`${C1}:x`, { role: 'member', clubhouse: true })
  eq((await ask('x', { action: 'item.delete', itemId: pid })).status, 200, 'the club’s Clubhouse can')
  w.settings.set('c', { audience: 'me', streams: null, commentsSeenAt: null })
  const p2 = await ask('c', { action: 'post.club', clubId: C1, text: 'AGM Friday' })
  ok(((await ask('y', { action: 'page', stream: `club:${C1}` })).body as unknown as { items: { id: string }[] }).items.some(i => i.id === (p2.body as unknown as { id: string }).id),
    'a post is the club’s word: its poster’s Only me does not hide it')
  eq(((await ask('z', { action: 'page', stream: 'friends' })).body as unknown as { items: { kind: string }[] }).items.filter(i => i.kind === 'post'), [], 'never in friends.stream')

  section('The card sheet (D330)')
  const sheet = await ask('z', { action: 'card.detail', itemId: clubmate.id })
  eq(sheet.status, 200, 'a card you may see opens with its holes')
  eq((await ask('z', { action: 'card.detail', itemId: hidden.id })).status, 404, 'an Only-me card does not')
}

async function friendTests() {
  section('Friends (D297): found only in your own clubs’ lists, mutual, never a junior')
  const w = world()
  const s = standIn(w)
  const C1 = '00000000-0000-0000-0000-0000000000c1'
  const C2 = '00000000-0000-0000-0000-0000000000c2'
  w.clubs.set('club-2', { id: C2, slug: 'other', name: 'Other GC', members: ['o'] })
  w.users.set('tok-o', { id: 'o', isAnonymous: false, email: 'o@x.ie', emailConfirmed: true })
  const R = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  w.rows.push(
    { rowId: R(1), userId: 'y', clubId: C1, name: 'Rosie Young', removed: false, junior: false },
    { rowId: R(2), userId: 'j', clubId: C1, name: 'Rory Junior', removed: false, junior: true },
    { rowId: R(3), userId: null, clubId: C1, name: 'Ronan Nolink', removed: false, junior: false },
    { rowId: R(4), userId: 'o', clubId: C2, name: 'Roisin Other', removed: false, junior: false },
    { rowId: R(5), userId: 'c', clubId: C1, name: 'Robbie Profile', removed: false, junior: false },
    { rowId: R(6), userId: 'x', clubId: C1, name: 'Ross Me', removed: false, junior: false },
  )
  w.profiles.add('c')
  const ask = (who: string, body: Record<string, unknown>) => runFeed({ ...body, token: `tok-${who}` }, s, NOW)
  const names = async (q: string) => ((await ask('x', { action: 'search', q })).body as unknown as { results: { name: string }[] }).results.map(r => r.name)
  eq(await names('R'), [], 'one character returns nothing')
  eq(await names('Ro'), ['Rosie Young'], 'two characters: only a linked adult on my own club’s list — never a junior (by membership or profile), a row with no account, another club’s member, or me')
  const hit = ((await ask('x', { action: 'search', q: 'rosie' })).body as unknown as { results: Record<string, unknown>[] }).results[0]
  eq(Object.keys(hit).sort(), ['club', 'name', 'rowId', 'standing'], 'a result is a name and a club (and the row to ask by) — nothing else')
  eq((await ask('x', { action: 'request', rowId: R(4) })).status, 404, 'another club’s member cannot be asked')
  eq((await ask('x', { action: 'request', rowId: R(2) })).status, 404, 'a junior cannot be asked')
  eq((await ask('x', { action: 'request', rowId: R(5) })).status, 404, '…nor a junior profile')
  eq((await ask('x', { action: 'request', rowId: R(1) })).body, { ok: true, standing: 'asked' }, 'a request')
  eq(((await ask('y', { action: 'friends' })).body as unknown as { incoming: { id: string }[] }).incoming.map(p => p.id), ['x'], 'Y sees it waiting')
  eq((await runFeed({ action: 'friends', token: 'tok-j' }, s, NOW)).status, 403, 'a junior has no friends list (D304)')
  eq((await ask('y', { action: 'respond', id: 'x', accept: true })).body, { ok: true, standing: 'friend' }, 'accepted')
  eq(w.friends, [{ a: 'x', b: 'y', by: 'x', accepted: true }], 'one row a pair')
  w.rows[0].removed = true
  eq(((await ask('x', { action: 'friends' })).body as unknown as { friends: { id: string }[] }).friends.map(p => p.id), ['y'], 'a friendship survives leaving the club')
  eq((await ask('y', { action: 'unfriend', id: 'x' })).body, { ok: true, standing: 'none' }, 'either removes it')
  eq(w.friends, [], '…and it is gone')
}

async function statusTests() {
  section('The status on the sign step (D299, D306)')
  const w = world()
  const s = standIn(w)
  const R1 = '00000000-0000-0000-0000-0000000000a1'
  const PX = '00000000-0000-0000-0000-0000000000b1', PY = '00000000-0000-0000-0000-0000000000b2', PG = '00000000-0000-0000-0000-0000000000b3'
  w.cards.set(R1, { code: 'PINTS1', tripId: 'T1', accounts: new Map([[PX, 'x'], [PY, 'y']]) })
  const ask = (who: string, body: Record<string, unknown>) => runFeed({ ...body, token: `tok-${who}` }, s, NOW)
  eq((await ask('x', { action: 'card.mine', code: 'PINTS1', roundId: R1, playerIds: [PX, PY, PG] })).body, { ok: true, playerId: PX, name: PX.toUpperCase(), audience: 'wide' }, 'the sign step finds this account’s own player on the card')
  eq((await ask('z', { action: 'card.mine', code: 'PINTS1', roundId: R1, playerIds: [PX] })).body, { ok: true, playerId: null }, '…and nothing for somebody not on it')
  eq((await ask('y', { action: 'card.status', code: 'PINTS1', roundId: R1, playerId: PX, text: 'Mine now' })).status, 403, 'nobody leaves a status on another player’s card')
  eq((await ask('x', { action: 'card.status', code: 'PINTS1', roundId: R1, playerId: PX, text: 'x'.repeat(141) })).status, 400, 'over 140 characters is refused')
  eq((await ask('x', { action: 'card.status', code: 'PINTS1', roundId: R1, playerId: PX, text: 'Two birdies on the back', audience: 'me' })).status, 200, 'a status with its card’s own audience')
  const held = w.items.find(r => r.key === `card:${R1}:${PX}`)
  eq([held?.held, held?.status, held?.audience], [true, 'Two birdies on the back', 'me'], 'typed before the card is in the feed, it is held — shown to nobody')
  w.items.push(itemRow({ kind: 'card', authorId: 'x', tripId: 'T1', data: { name: 'X' } }))
  const mine = w.items[w.items.length - 1]
  eq((await ask('x', { action: 'status.edit', itemId: mine.id, text: '  Changed  ' })).body, { ok: true, status: 'Changed' }, 'its owner edits the status afterwards')
  eq((await ask('x', { action: 'status.edit', itemId: mine.id, text: '' })).body, { ok: true, status: null }, '…or deletes it')
  eq((await ask('y', { action: 'status.edit', itemId: mine.id, text: 'Hijack' })).status, 404, 'nobody else can')
}

async function coSignTests() {
  section('A club card is in the feed only once its marker co-signs (D302)')
  const user = (id: string): AuthUser => ({ id, isAnonymous: false, email: `${id}@x.ie`, emailConfirmed: true })
  const row = (id: string, userId: string, name: string): MemberRecord => ({ id, clubId: 'C', name, memberNumber: null, guiNumber: null, email: null, role: 'member', userId, removedAt: null, onBoards: true })
  const rows = [row('r-ann', 'ann', 'Ann'), row('r-mark', 'mark', 'Mark')]
  const sigs: Signature[] = []
  const fed: { playerId: string; marker: string | null }[] = []
  const holes = Array.from({ length: 18 }, (_, i) => ({ id: `h${i + 1}`, hole_number: i + 1, par: 4, stroke_index: i + 1 }))
  const store: SignStore = {
    async userFromToken(t) { return t === 'tok-ann' ? user('ann') : t === 'tok-mark' ? user('mark') : null },
    async competition() { return { tripId: 'T', code: 'COMP01', clubId: 'C', roundId: 'R', date: '2026-11-24', rules: null as never, publicHash: null } },
    async myRow(_c, u) { return rows.find(r => r.userId === u) ?? null },
    async rowsByIds(_c, ids) { return rows.filter(r => ids.includes(r.id)) },
    async players() { return [{ id: 'p-ann', clubMemberId: 'r-ann', name: 'Ann', gender: 'F' }, { id: 'p-mark', clubMemberId: 'r-mark', name: 'Mark', gender: 'M' }] },
    async bookings() { return [{ playerId: 'p-ann', slot: 0, bookedBy: null }, { playerId: 'p-mark', slot: 0, bookedBy: null }] },
    async liveCard() { return { id: 'L', roundId: 'R', status: 'active', playerIds: ['p-ann'] } },
    async signatures() { return sigs.filter(x => true) },
    async holes() { return holes },
    async playingHcps() { return new Map([['p-ann', 10]]) },
    async liveScores() { return holes.map(h => ({ player_id: 'p-ann', hole_number: h.hole_number, gross_score: 4, stableford_points: 2 })) },
    async upsertScores() {},
    async markCommitted() {},
    async insertSignatures(list) {
      for (const n of list) sigs.push({ id: `s-${n.player_id}`, playerId: n.player_id, liveRoundId: n.live_round_id, finalisedBy: n.finalised_by, finalisedAt: n.finalised_at, approvedBy: n.approved_by, approvedAt: n.approved_at, markerMemberId: n.marker_member_id, markedBy: n.marked_by, markedAt: n.marked_at, markedAs: n.marked_as })
      return 'ok'
    },
    async updateSignature(id, patch) {
      const x = sigs.find(g => g.id === id)!
      if ('approved_at' in patch) { x.approvedAt = patch.approved_at; x.approvedBy = patch.approved_by }
      if ('marked_at' in patch) { x.markedAt = patch.marked_at; x.markedBy = patch.marked_by; x.markedAs = patch.marked_as as 'marker' }
    },
    async finaliseCard() {},
    async reopenCard() {},
    async deleteScores() {},
    async card() { return holes.map(h => ({ number: h.hole_number, par: 4, gross: 4, noReturn: false, points: 2 })) },
    async signedOff(o) { fed.push({ playerId: o.playerId, marker: o.marker }) },
  }
  const fin = await runSign({ token: 'tok-ann', action: 'finalise', code: 'COMP01', liveRoundId: 'L', markers: { 'p-ann': { memberId: 'r-mark' } } }, store, NOW)
  eq(fin.status, 200, 'Ann finalises her card, Mark chosen to mark it')
  eq(fed, [], 'a finalised card without the marker’s co-sign produces no item')
  await runSign({ token: 'tok-mark', action: 'mark', code: 'COMP01', playerId: 'p-ann' }, store, NOW)
  eq(fed, [{ playerId: 'p-ann', marker: 'Mark' }], 'Mark co-signs: the card goes in, “co-signed by Mark”')
}

async function socialTests() {
  section('Comments and the dot (D301): only on a card you may see')
  const w = world()
  const s = standIn(w)
  const C1 = '00000000-0000-0000-0000-0000000000c1'
  const ask = (who: string, body: Record<string, unknown>) => runFeed({ ...body, token: `tok-${who}` }, s, NOW)
  // Y's card is Y's friends' only (no club, no event Z is in). X is Y's friend; Z is X's friend only.
  const ycard = itemRow({ kind: 'card', authorId: 'y', tripId: 'TY', data: { name: 'Yvonne' } })
  w.items.push(ycard)
  w.friends.push({ a: 'x', b: 'y', by: 'x', accepted: true }, { a: 'x', b: 'z', by: 'x', accepted: true })
  eq((await ask('z', { action: 'comment', itemId: ycard.id, text: 'Hi' })).status, 404, 'Z cannot comment on a card Z may not see')
  eq((await ask('z', { action: 'dot', itemId: ycard.id })).status, 404, '…nor dot it')
  const made = await ask('x', { action: 'comment', itemId: ycard.id, text: '  Shot!  ' })
  eq(made.status, 200, 'X, Y’s friend, comments on Y’s card')
  const commentId = (made.body as unknown as { comment: { id: string } }).comment.id
  eq(w.items.find(r => r.id === commentId)?.data, { name: 'x', text: 'Shot!' }, '…stored with X’s name, trimmed')
  eq((await ask('z', { action: 'comments', itemId: ycard.id })).status, 404, 'X’s friend Z, who may not see Y’s card, sees none of its comments')
  const zFeed = ((await ask('z', { action: 'page', stream: 'friends' })).body as unknown as { items: unknown[] }).items
  eq(zFeed, [], '…and no item announcing X’s comment in Z’s Friends stream (the M9 test)')
  eq(((await ask('y', { action: 'comments', itemId: ycard.id })).body as unknown as { comments: { text: string; canDelete: boolean }[] }).comments.map(c => [c.text, c.canDelete]), [['Shot!', true]], 'Y sees it, and may delete it — the card is Y’s')
  eq(((await ask('y', { action: 'home' })).body as unknown as { newComments: number }).newComments, 1, 'a comment on your card puts a dot on Home (D307)')
  await ask('y', { action: 'seen' })
  eq(((await ask('y', { action: 'home' })).body as unknown as { newComments: number }).newComments, 0, '…until you have looked')
  await ask('x', { action: 'dot', itemId: ycard.id })
  await ask('x', { action: 'dot', itemId: ycard.id })
  eq(w.dots.length, 1, 'a dot is once a person')
  const yPage = ((await ask('y', { action: 'page', stream: 'friends' })).body as unknown as { items: { id: string; dots: number; comments: number }[] }).items.find(i => i.id === ycard.id)
  eq([yPage?.dots, yPage?.comments], [1, 1], 'the card shows its dot and comment counts')
  await ask('x', { action: 'dot', itemId: ycard.id, on: false })
  eq(w.dots.length, 0, 'tapped again, it comes off')
  w.friends.push({ a: 'c', b: 'y', by: 'c', accepted: true })
  eq((await ask('c', { action: 'comment.delete', id: commentId })).status, 403, 'somebody else cannot delete X’s comment')
  eq((await ask('y', { action: 'comment.delete', id: commentId })).status, 200, 'the card’s owner deletes any comment on it')
  eq(w.items.some(r => r.id === commentId), false, '…gone')

  section('Reports (D303): a club card to its Clubhouse, anything else to Green Dot')
  const ccard = itemRow({ kind: 'card', authorId: 'y', clubId: C1, tripId: 'TC', data: { name: 'Yvonne' } })
  w.items.push(ccard)
  eq((await ask('x', { action: 'report', itemId: ccard.id, reason: 'Not golf' })).body, { ok: true, to: 'club' }, 'a club card’s report goes to the club')
  eq((await ask('x', { action: 'report', itemId: ycard.id })).body, { ok: true, to: 'green_dot' }, 'a card outside a club goes to Green Dot')
  eq((await ask('y', { action: 'report', itemId: ycard.id })).status, 400, 'nobody reports their own')
  eq((await ask('x', { action: 'reports.club', clubId: C1 })).status, 403, 'a member without Clubhouse cannot see the club’s reports')
  w.creds.set(`${C1}:c`, { role: 'member', clubhouse: true })
  eq(((await ask('c', { action: 'reports.club', clubId: C1 })).body as unknown as { reports: { itemId: string }[] }).reports.map(r => r.itemId), [ccard.id], 'the Clubhouse sees its club’s report — never Green Dot’s')
  w.comps.set('x', [{ tripId: 'TC', code: 'TCCODE', name: 'Medal', date: '2026-11-24', endDate: null, playing: false, live: true, clubId: C1, clubName: 'Pints GC' }])
  const cPage = async () => ((await ask('x', { action: 'page', stream: 'comp', comp: 'TCCODE' })).body as unknown as { items: { id: string }[] }).items.map(i => i.id)
  eq(await cPage(), [ccard.id], 'a report hides nothing by itself')
  await ask('c', { action: 'reports.resolve', clubId: C1, itemId: ccard.id, outcome: 'removed' })
  eq(await cPage(), [], 'taken down, it is gone from every stream')
}

// ─── Wiring ─────────────────────────────────────────────────────

function wiringTests() {
  section('Wiring')
  const sql = read('supabase/migrations/20260101000102_feed.sql')
  for (const t of ['feed_settings', 'friendships', 'feed_items', 'feed_dots', 'feed_reports']) {
    ok(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`).test(sql), `${t} is closed to phones`)
  }
  ok(/UNDO/.test(sql), 'the migration carries its undo')
  const files = ['app/api/feed/feed.ts', 'app/api/feed/store.ts']
  ok(files.every(f => !/['"]use client['"]/.test(read(f))), 'the feed is decided on the server')
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  ok(/<CardStatus /.test(flow) && flow.indexOf('<CardStatus ') > flow.indexOf('<MarkerPicker ') - 400 && flow.indexOf('<CardStatus ') < flow.indexOf('handleCommit()}'), 'the status sits on the sign step, by the Commit / Sign the cards button (D306)')
  ok((flow.match(/<CardStatus /g) ?? []).length === 1 && flow.indexOf('<CardStatus ') > flow.indexOf('// ─── Commit'), '…drawn once, never in score entry')
  ok(/sendStatus\(\)\s*\n\s*summariseCard\(tripCode, roundId\)\s*\n\s*onBack\(\)/.test(flow) && /if \(!signed\.ok\) throw new Error\(signed\.error\)\s*\n\s*sendStatus\(\)/.test(flow), 'the status is sent only after the card is signed, and never waited for')
  ok(!/@\/lib\/account/.test(read('app/scoring/CardStatus.tsx')), 'the sign step asks through the phone’s own sign-in, never the account code')
  ok(/afterWrite: read => feedAfterSummaries/.test(read('app/api/stats/store.ts')), 'a round’s signed cards follow its card summaries')
  ok(/trip\.competition === 'club'\) return/.test(read('app/api/feed/write.ts')), '…except a club competition’s, which wait for the co-sign')
  ok(/noteMatchResults\(changed\.map/.test(read('lib/matchplayStore.ts')), 'a knockout result recorded asks for its feed item')

  section('Wiring: the Stream tab (D318, D320)')
  const club = read('app/club/[slug]/ClubView.tsx')
  ok(/tab === 'stream' && <Stream /.test(club), 'the club area draws the stream on its Stream tab')
  ok(/tab === 'stream' && <Stream /.test(read('app/home/HomeScreen.tsx')), '/home too')
  for (const bar of ['app/home/HomeTabBar.tsx', 'app/club/[slug]/ClubTabBar.tsx']) ok(/useStreamDot\(/.test(read(bar)) && /key === 'stream' && dot/.test(read(bar)), `${bar}: the comment dot rides on the Stream tab (D320)`)
  {
    const dot = read('app/components/feed/useStreamDot.ts')
    ok(/requestIdleCallback/.test(dot) && /setTimeout/.test(dot) && /askFeed<\{ count\?: number \}>\('badge'\)/.test(dot) && !/setInterval/.test(dot), '…asked once the page is idle after its paint, one count, never polled (M3)')
  }
  const feedUi = read('app/components/feed/Stream.tsx')
  ok(!fs.existsSync('app/components/feed/Feed.tsx'), 'the feed on Home is gone — the Stream tab is its place (M3)')
  ok(/feed-streams/.test(feedUi) && /scroll-snap-type: x mandatory/.test(read('app/globals.css')), 'streams swipe on the browser’s own scroll snap — no library')
  ok(/reducedMotion\(\) \? 'auto' : 'smooth'/.test(feedUi), '…and switch instantly under Reduce Motion')
  ok(/gd\.feed\.stream\.v1/.test(feedUi), 'the last stream chosen is remembered on the phone')
  ok(!/setInterval/.test(feedUi), 'the stream is never polled — read on show and on coming back')
  ok(/<StreamName kind=\{activeRef\.kind\} \/>/.test(feedUi) && /compMenu\(comps, home\.today\)/.test(feedUi) && /role="menu"/.test(feedUi),
    'the stream on show is named at the top, a chevron opening comp.stream’s menu of headings and comps (D321, D323)')
  ok(/touchstart/.test(feedUi) && /PULL_AT/.test(feedUi) && /stream-arrive/.test(read('app/components/feed/FeedItem.tsx')) && /\.stream-arrive/.test(read('app/globals.css')),
    'pull to refresh, and what is new fades in at the top (M13)')
  {
    const name = read('app/components/feed/StreamName.tsx'), css = read('app/globals.css')
    ok(/sr-only">\{word\} stream/.test(name) && /stream-name-dot/.test(name) && /\.stream-name-dot \{[^}]*background: var\(--color-accent\)/.test(css) && /0\.32em/.test(css),
      'club•stream: the word, a CSS dot in the accent sized to the text, "stream" — read aloud as "club stream" (D321)')
    ok(!/gd-mark|<svg|<img/i.test(name.replace(/\/\*[\s\S]*?\*\//g, '')), '…never the wordmark’s artwork')
  }
  {
    const sheet = read('app/components/feed/ItemSheet.tsx')
    ok(/card\.detail/.test(sheet) && /Scorecard/.test(sheet) && /'comments'/.test(sheet) && /visualViewport/.test(sheet) && /onPointerDown=\{onDown\}/.test(sheet) && /onClick=\{close\}/.test(sheet),
      'the sheet: the scorecard, the comments, a box above the keyboard; closed by a swipe down, a tap outside or the ✕ (D330, M11)')
    ok(/reducedMotion\(\)[^\n]*\n?[^\n]*opacity: 0/.test(sheet) && /openKeyframes\(from, to\)/.test(sheet), '…grown out of the card, a fade under Reduce Motion (M12)')
    ok(!/from ['"](framer-motion|motion|react-spring|gsap)/.test(sheet), '…with no animation library')
  }

  section('Wiring: club.stream from both apps (D325)')
  {
    const panel = read('app/clubhouse/[slug]/events/EventPanel.tsx'), ov = read('app/clubhouse/[slug]/Overview.tsx')
    ok(/mayAnnounce\(draft\) && \(/.test(panel) && /askFeed\('post\.club', \{ clubId, title: said\.title, text: said\.text, eventType: type \}\)/.test(panel),
      'a club event can be broadcast to club.stream when saved — never an Office only one')
    ok(/may\('post_club_stream'\)/.test(ov) && /<ClubPostComposer clubId=\{club\.id\}/.test(ov), 'the Clubhouse posts from its Overview')
    ok(/home\.canPost/.test(read('app/components/feed/Stream.tsx')), '…and Officers from club.stream itself')
    eq(announcement({ title: 'AGM', startTime: '19:30', endTime: null, notes: 'Bring your card.' }, 'Fri 5 Dec', 'Clubhouse bar'),
      { title: 'AGM', text: 'Fri 5 Dec, From 7:30 pm · Clubhouse bar\n\nBring your card.' }, 'an event’s post: when and where on a line, then its notes')
    ok(!mayAnnounce({ visibility: 'office' }) && mayAnnounce({ visibility: 'members' }), 'an Office only event is never broadcast')
    ok(clubMay('post_club_stream', { row: { owner: false, playsHere: true, officer: true, clubhouse: false } }) && clubMay('post_club_stream', { row: { owner: false, playsHere: true, officer: false, clubhouse: true } })
      && !clubMay('post_club_stream', { row: { owner: false, playsHere: true, officer: false, clubhouse: false } }), 'Officers and Clubhouse holders post; a member does not')
  }

  section('Wiring: comments, the dot, reports (D301, D303, D307)')
  ok(/askFeed\('seen'\)/.test(feedUi) && /streamSeen\(\)/.test(feedUi), 'looking at friends.stream clears the Stream tab’s dot (D307, D320)')
  ok(/reports\.club/.test(read('app/clubhouse/[slug]/Overview.tsx')) && fs.existsSync('app/clubhouse/[slug]/reports/Reports.tsx'), 'a club card’s reports wait in the Clubhouse’s Alerts and its Reports page')
  ok(/openReports\(createAdminClient\(\), null\)/.test(read('app/admin/reports/page.tsx')) && /'reports'/.test(read('app/admin/AdminShell.tsx')), 'anything else waits in /admin → Reports')
  ok(/tidyFeed\(/.test(read('app/api/cleanup/route.ts')), 'the nightly cleanup keeps the feed to FEED_KEEP_DAYS')
  ok(!/resend|sendEmail/i.test(read('app/api/feed/social.ts')), 'a comment never sends an email (D307)')

}

async function main() {
  ruleTests()
  await routeTests()
  await streamsV2Tests()
  await friendTests()
  await statusTests()
  await coSignTests()
  await socialTests()
  wiringTests()
  console.log(`\n${'─'.repeat(56)}`)
  if (failed > 0) {
    console.log(`✗ ${failed} failed, ${passed} passed`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`✓ all ${passed} checks passed`)
}

if (require.main === module) void main()
