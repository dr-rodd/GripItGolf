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
  matchLine, contextLine, olderThan, newestFirst,
  type Audience, type CompRef, type ItemFacts, type Viewer,
} from '../lib/feed'
import { runFeed, type FeedStore, type ItemRow } from '../app/api/feed/feed'
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
  ok(inStream({ authorId: 'x', tripId: 't', clubId: 'c' }, { kind: 'club', id: 'c' }, viewer), 'a club item is in that club’s stream')
  ok(!inStream({ authorId: 'x', tripId: 't', clubId: 'c' }, { kind: 'club', id: 'd' }, viewer), '…never another club’s')
  ok(inStream({ authorId: 'x', tripId: 't', clubId: null }, { kind: 'comp', id: 't' }, viewer), 'an event’s item is in its Comp stream')
  ok(!inStream({ authorId: 'x', tripId: 'u', clubId: null }, { kind: 'comp', id: 't' }, viewer), '…never another event’s')
  ok(!inStream({ authorId: 'f', tripId: 't', clubId: 'c' }, { kind: 'team', id: 'p' }, viewer), 'a Team stream holds nothing until interclub panels exist — so nobody off a team gets anything from one')

  section('The member’s streams (D300)')
  eq(readStreams(null, ['c1', 'c2']).map(s => s.kind), ['comp', 'friends', 'club', 'club'], 'nothing stored is Comp, Friends, then their clubs')
  eq(readStreams(['friends', 'club:00000000-0000-0000-0000-00000000000c', 'club:00000000-0000-0000-0000-00000000000d', 'friends', 'nonsense'], ['00000000-0000-0000-0000-00000000000c']).map(s => s.kind),
    ['friends', 'club'], 'a club they have left goes, a stream kept twice is once, nonsense is dropped')
  eq(readStreams([], ['c1']), [], 'a member may keep no streams at all')
  const all = readStreams(null, ['c1'])
  eq(pillsFor(all, { here: null, compLive: false, hasComps: true }).map(s => s.kind), ['comp', 'friends'], 'a Club stream shows only inside that club’s area (D294)')
  eq(pillsFor(all, { here: 'c1', compLive: false, hasComps: false }).map(s => s.kind), ['friends', 'club'], 'no Comp pill while there is no comp')
  eq(pillsFor([{ kind: 'friends' }, { kind: 'comp' }], { here: null, compLive: true, hasComps: true }).map(s => s.kind), ['comp', 'friends'], 'a live comp leads (D295)')

  section('The Comp picker (D300): the latest comp played, a pick kept until a newer one')
  const comp = (code: string, date: string, playing: boolean): CompRef => ({ tripId: code, code, name: code, date, endDate: null, playing, live: false, clubId: null, clubName: null })
  const comps = [comp('OLD', '2026-11-01', true), comp('NEW', '2026-11-20', true), comp('CLUB', '2026-11-22', false)]
  eq(defaultComp(comps, '2026-11-24')?.code, 'NEW', 'opens on the most recent comp played in')
  eq(shownComp(comps, '2026-11-24', { code: 'CLUB', over: 'NEW' })?.code, 'CLUB', 'a comp picked is kept…')
  eq(shownComp([...comps, comp('NEWER', '2026-11-23', true)], '2026-11-24', { code: 'CLUB', over: 'NEW' })?.code, 'NEWER', '…until they play a newer one')

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
  }
}

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
      return w.items.filter(r => !r.removedAt && !r.held && (!r.parentId || r.kind === 'comment'))
        .filter(r => !q.authors || (!!r.authorId && q.authors.includes(r.authorId)))
        .filter(r => !q.clubId || r.clubId === q.clubId)
        .filter(r => !q.tripId || r.tripId === q.tripId)
        .filter(olderThan(q.before))
        .sort(newestFirst).slice(0, q.limit)
    },
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

  const xClub = await ask('x', { action: 'page', stream: `club:${C1}` })
  eq((xClub.body as unknown as { items: { kind: string }[] }).items.map(i => i.kind), ['comment', 'card'], 'a club-mate sees the club card and the comment on it in the Club stream')
  eq((await ask('z', { action: 'page', stream: `club:${C1}` })).status, 403, 'somebody not on the club’s list cannot open its stream')

  w.settings.set('y', { audience: 'me', streams: null, commentsSeenAt: null })
  const xClub2 = await ask('x', { action: 'page', stream: `club:${C1}` })
  eq((xClub2.body as unknown as { items: unknown[] }).items, [], 'Only me hides the card and the comment on it from everybody else')
  eq(((await ask('y', { action: 'page', stream: 'friends' })).body as unknown as { items: unknown[] }).items.length, 1, '…and Y still sees their own')
  w.settings.delete('y')

  section('Comp stream: only a comp the picker offers')
  w.comps.set('z', [])
  eq((await ask('z', { action: 'page', stream: 'comp', comp: 'T1CODE' })).status, 404, 'a comp that isn’t yours is refused')
  w.comps.set('c', [{ tripId: 'T1', code: 'T1CODE', name: 'Medal', date: '2026-11-24', endDate: null, playing: false, live: true, clubId: C1, clubName: 'Pints GC' }])
  const cComp = await ask('c', { action: 'page', stream: 'comp', comp: 'T1CODE' })
  eq((cComp.body as unknown as { items: { id: string }[] }).items.map(i => i.id), [xcomment.id, ycard.id], 'a club-mate watching the comp sees its cards and comments')

  section('A Team stream (D294): nothing until interclub panels exist')
  eq(((await ask('x', { action: 'page', stream: 'team:00000000-0000-0000-0000-000000000099' })).body as unknown as { items: unknown[] }).items, [], 'empty for everybody')

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
  eq(w.settings.get('x')?.streams, ['friends', `club:${C1}`], 'streams kept, a club they are not on dropped')
  const home = await ask('x', { action: 'home', club: 'pints' })
  eq((home.body as unknown as { streams: { key: string }[] }).streams.map(s => s.key), ['friends', `club:${C1}`], 'home answers the member’s streams')
  eq((home.body as unknown as { here: string }).here, C1, '…and which club’s area it is asked from')
  w.ready = false
  eq((await ask('x', { action: 'home' })).body, { ok: true, ready: false }, 'before migration 102 the feed simply does not show')
  w.ready = true
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
  const cPage = async () => ((await ask('x', { action: 'page', stream: `club:${C1}` })).body as unknown as { items: { id: string }[] }).items.map(i => i.id)
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

  section('Wiring: the feed on Home (D293, D295)')
  const club = read('app/club/[slug]/ClubView.tsx')
  ok(club.indexOf('<Feed ') > club.indexOf('>Your bookings</h2>'), 'the club home draws the feed under Your bookings')
  ok(/<Feed mePath=/.test(read('app/home/HomeScreen.tsx')), '/home draws it too')
  for (const bar of ['app/home/HomeTabBar.tsx', 'app/club/[slug]/ClubTabBar.tsx', 'lib/clubBar.ts']) ok(!/feed/i.test(read(bar)), `${bar} knows nothing of the feed — no new tab, no dot on a footer`)
  const feedUi = read('app/components/feed/Feed.tsx')
  ok(/feed-streams/.test(feedUi) && /scroll-snap-type: x mandatory/.test(read('app/globals.css')), 'streams swipe on the browser’s own scroll snap — no library')
  ok(/reducedMotion\(\) \? 'auto' : 'smooth'/.test(feedUi), '…and switch instantly under Reduce Motion')
  ok(/gd\.feed\.stream\.v1/.test(feedUi), 'the last stream chosen is remembered on the phone')
  ok(!/setInterval/.test(feedUi), 'the feed is never polled — read on show and on coming back')

  section('Wiring: comments, the dot, reports (D301, D303, D307)')
  ok(/askFeed\('seen'\)/.test(feedUi), 'looking at your own cards clears the Home dot')
  ok(/reports\.club/.test(read('app/clubhouse/[slug]/Overview.tsx')) && fs.existsSync('app/clubhouse/[slug]/reports/Reports.tsx'), 'a club card’s reports wait in the Clubhouse’s Alerts and its Reports page')
  ok(/openReports\(createAdminClient\(\), null\)/.test(read('app/admin/reports/page.tsx')) && /'reports'/.test(read('app/admin/AdminShell.tsx')), 'anything else waits in /admin → Reports')
  ok(/tidyFeed\(/.test(read('app/api/cleanup/route.ts')), 'the nightly cleanup keeps the feed to FEED_KEEP_DAYS')
  ok(!/resend|sendEmail/i.test(read('app/api/feed/social.ts')), 'a comment never sends an email (D307)')

}

async function main() {
  ruleTests()
  await routeTests()
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
