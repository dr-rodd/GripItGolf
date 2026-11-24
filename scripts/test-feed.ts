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
}

async function main() {
  ruleTests()
  await routeTests()
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
