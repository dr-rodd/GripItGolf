/**
 * The test club (D308–D317): the email guard, the keep-list and the wipe
 * (lib/testClub.ts, app/admin/test-club/wipe.ts on a stand-in store), and
 * the wiring read off the source — one sender for Resend, no demo address
 * ever handed to Supabase, test events kept out of platform figures.
 *
 *   npx tsx scripts/test-test-club.ts
 */
import fs from 'fs'
import path from 'path'
import { undeliverable } from '../lib/emailGuard'
import {
  readKeepList, rowsToWipe, wipeConfirmed, outsideUnchanged, testEmail, countsOnPlatform,
  CLUB_TABLES, PINTS_SLUG, TEST_CLUB_NOT_READY, type Counts,
} from '../lib/testClub'
import { previewWipe, runWipe, type WipeStore, type TestClub } from '../app/admin/test-club/wipe'
import {
  readCharacters, readDenyList, deniedName, casualPlan, memberNumber, MEMBERSHIPS, TEST_LABELS, DEFAULT_MEMBERSHIP, type Character,
} from '../lib/testClub'
import { usernameIssue } from '../lib/account'
import { LIST_FILTERS } from '../lib/clubhouse'
import { seasonPlan, groupsOf, banterIssue, dotPlan, type Banter } from '../lib/testClub'
import { makeCard, holePoints, targetOver, seeded } from '../lib/testClubCards'
import type { WipeRow } from '../lib/testClub'

let passed = 0, failed = 0
const failures: string[] = []
function ok(c: boolean, label: string) {
  if (c) { passed++; return }
  failed++; failures.push(label); console.log(`  ✗ ${label}`)
}
function eq<T>(a: T, b: T, label: string) {
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) console.log(`    got      ${JSON.stringify(a)}\n    expected ${JSON.stringify(b)}`)
  ok(same, label)
}
function section(s: string) { console.log(`\n${s}`) }
const read = (f: string) => fs.readFileSync(f, 'utf8')

/** Every .ts/.tsx file under the given folders. */
function sources(dirs: string[]): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p) }
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
  }
  for (const d of dirs) walk(d)
  return out
}

// ─── The email guard (D308) ─────────────────────────────────────

function guardTests() {
  section('Nothing is sent to an address nobody can receive at (D308)')
  ok(undeliverable('jed.bartlet@pints.greendot.invalid'), 'a .invalid address is refused')
  ok(undeliverable('JED@PINTS.GREENDOT.INVALID'), 'whatever its case')
  ok(undeliverable('x@pints.greendot.invalid.'), 'with a trailing dot')
  ok(undeliverable('a@b.test') && undeliverable('a@b.example') && undeliverable('a@localhost'), 'the other reserved names too')
  ok(!undeliverable('ross@example.com'), 'example.com is a real domain — sent')
  ok(!undeliverable('someone@gmail.com'), 'a real address is sent')
  ok(!undeliverable('someone@invalid.ie'), 'invalid as a name, not the domain, is sent')
  ok(!undeliverable('') && !undeliverable(null) && !undeliverable('no-at-sign'), 'nothing to read is not refused (the sender’s own checks)')
  eq(testEmail('jed.bartlet', PINTS_SLUG), 'jed.bartlet@pints.greendot.invalid', 'a character’s address')
  ok(undeliverable(testEmail('cj.cregg', PINTS_SLUG)), 'every character’s address is one the guard refuses')

  section('One sender for Resend — lib/sendEmail.ts')
  const files = sources(['app', 'lib'])
  const sends = files.filter(f => /\.emails\.send\(/.test(read(f)))
  eq(sends.map(f => f.split(path.sep).join('/')), ['lib/sendEmail.ts'], 'only lib/sendEmail.ts sends through Resend')
  const resends = files.filter(f => /new Resend\(/.test(read(f))).map(f => f.split(path.sep).join('/')).sort()
  eq(resends, ['app/admin/EmailCount.tsx', 'lib/sendEmail.ts'], 'Resend is made only by the sender and the admin’s count (which only lists)')
  const sender = read('lib/sendEmail.ts')
  ok(sender.indexOf('undeliverable(email.to)') > -1 && sender.indexOf('undeliverable(email.to)') < sender.indexOf('.emails.send('),
    'the sender asks the guard before Resend')
  for (const f of ['app/api/club/store.ts', 'app/api/event/resetStore.ts', 'app/api/trip-confirmation/route.ts']) {
    ok(/from '@\/lib\/sendEmail'/.test(read(f)), `${f} sends through lib/sendEmail.ts`)
  }
  const confirm = read('app/api/trip-confirmation/route.ts')
  ok(confirm.indexOf('undeliverable(leadEmail)') > -1 && confirm.indexOf('undeliverable(leadEmail)') < confirm.indexOf("update({ confirmation_sent_at"),
    'a demo lead email is turned away before the confirmation is claimed')

  section('No demo address is handed to Supabase to send a code (D308)')
  const client = read('lib/accountClient.ts')
  for (const fn of ['sendCode', 'sendForgotCode']) {
    const body = client.slice(client.indexOf(`export async function ${fn}(`))
    const guard = body.indexOf('undeliverable(email)')
    const firstCall = Math.min(...['phoneIdentity()', 'updateUser', 'codeForExisting'].map(s => { const i = body.indexOf(s); return i < 0 ? Infinity : i }))
    ok(guard > -1 && guard < firstCall, `${fn} refuses a demo address before anything is asked`)
  }
  const otpCallers = files.filter(f => /signInWithOtp\(|resetPasswordForEmail\(|inviteUserByEmail\(/.test(read(f))).map(f => f.split(path.sep).join('/'))
  eq(otpCallers, ['lib/accountClient.ts'], 'Supabase is asked to email a code from one file only')
}

// ─── The keep-list and the wipe's rules (D311, D314) ────────────

function ruleTests() {
  section('The keep-list')
  eq(readKeepList(' Ross \n@dave, ross\n\nniamh '), ['ross', 'dave', 'niamh'], 'trimmed, lower case, an @ dropped, no repeats')
  eq(readKeepList(''), [], 'empty is empty')

  section('Which list rows a wipe takes')
  const rows: WipeRow[] = [
    { id: 'r-ross', userId: 'u-ross' }, { id: 'r-dave', userId: 'u-dave' },
    { id: 'r-jed', userId: 'u-jed' }, { id: 'r-unlinked', userId: null },
  ]
  const plan = rowsToWipe(rows, new Set(['u-ross', 'u-dave', 'u-jed']), new Set(['u-jed']))
  eq(plan.kept, ['r-ross', 'r-dave'], 'the keep-list’s own rows stay')
  eq(plan.wipe, ['r-jed', 'r-unlinked'], 'a character goes even if typed into the keep-list; an unlinked row goes')
  eq(rowsToWipe(rows, new Set(), new Set()).kept, [], 'an empty keep-list keeps nobody')

  section('Confirming')
  ok(wipeConfirmed(' pints golf club ', 'Pints Golf Club'), 'the club’s name, case and spaces aside')
  ok(!wipeConfirmed('Pints', 'Pints Golf Club'), 'not part of it')

  section('Nothing outside changed')
  eq(outsideUnchanged({ trips: 10, players: 40 }, { trips: 10, players: 40 }), { same: true, changed: [] }, 'the same counts')
  eq(outsideUnchanged({ trips: 10, players: 40 }, { trips: 10, players: 41 }).changed, ['players'], 'a moved count is named')

  section('Platform figures (D316)')
  ok(!countsOnPlatform('t1', new Set(['t1'])), 'a test club’s trip is not counted')
  ok(countsOnPlatform('t2', new Set(['t1'])), 'any other trip is')
  ok(CLUB_TABLES.every(t => t.startsWith('club_') || t.startsWith('feed_') || t.startsWith('test_')), 'the wipe’s tables are the club’s own')
}

// ─── The wipe on a stand-in store ───────────────────────────────

interface Fake {
  club: TestClub | null | 'not_ready'
  keep: { userId: string; username: string }[]
  fictional: string[]
  rows: WipeRow[]
  events: string[]
  /** Rows outside the club — the wipe must never change these. */
  outside: Counts
  deletedEvents: string[]
  deletedRows: string[]
  deletedAccounts: string[]
  clubRowsCleared: string[]
}

function fake(over: Partial<Fake> = {}): { f: Fake; store: WipeStore } {
  const f: Fake = {
    club: { id: 'pints', name: 'Pints Golf Club', slug: 'pints-golf-club', isTest: true },
    keep: [{ userId: 'u-ross', username: 'ross' }],
    fictional: ['u-jed', 'u-cj'],
    rows: [{ id: 'r-ross', userId: 'u-ross' }, { id: 'r-jed', userId: 'u-jed' }, { id: 'r-cj', userId: 'u-cj' }, { id: 'r-old', userId: null }],
    events: ['e1', 'e2', 'e3'],
    outside: { trips: 50, players: 400, club_members: 120 },
    deletedEvents: [], deletedRows: [], deletedAccounts: [], clubRowsCleared: [],
    ...over,
  }
  const store: WipeStore = {
    async club() { return f.club },
    async keepList() { return f.keep },
    async fictionalIds() { return f.fictional.filter(id => !f.deletedAccounts.includes(id)) },
    async listRows() { return f.rows.filter(r => !f.deletedRows.includes(r.id)) },
    async eventIds() { return f.events.filter(e => !f.deletedEvents.includes(e)) },
    async clubRowCounts() { return { club_events: 4 } },
    async outsideCounts() { return { ...f.outside } },
    async deleteEvent(id) { f.deletedEvents.push(id); return null },
    async deleteClubRows(id) { f.clubRowsCleared.push(id) },
    async deleteListRows(ids) { f.deletedRows.push(...ids) },
    async deleteAccount(id) { f.deletedAccounts.push(id) },
  }
  return { f, store }
}

async function wipeTests() {
  section('Wiping a test club')
  {
    const { f, store } = fake()
    const r = await runWipe(store, 'pints', 'Pints Golf Club', Date.now() + 60_000)
    ok(r.ok && r.done, 'done in one press')
    eq(f.deletedEvents, ['e1', 'e2', 'e3'], 'every event under the club')
    eq(f.clubRowsCleared, ['pints'], 'the club’s own rows')
    eq(f.deletedRows.sort(), ['r-cj', 'r-jed', 'r-old'], 'every list row but the keep-list’s')
    ok(!f.deletedRows.includes('r-ross'), 'Ross’s own row stays')
    eq(f.deletedAccounts.sort(), ['u-cj', 'u-jed'], 'the fictional accounts')
    ok(!f.deletedAccounts.includes('u-ross'), 'a keep-list account is never deleted')
    ok(r.ok && r.changed.length === 0, 'nothing outside changed')
  }
  {
    const { f, store } = fake({ fictional: ['u-jed', 'u-ross'] })
    await runWipe(store, 'pints', 'Pints Golf Club', Date.now() + 60_000)
    ok(!f.deletedAccounts.includes('u-ross'), 'even marked fictional by mistake, a keep-list account is never deleted (D314)')
  }

  section('Refused')
  {
    const { f, store } = fake({ club: { id: 'lahinch', name: 'Lahinch', slug: 'lahinch', isTest: false } })
    const r = await runWipe(store, 'lahinch', 'Lahinch', Date.now() + 60_000)
    ok(!r.ok && /not a test club/.test(r.error), 'a club that is not a test club')
    ok(f.deletedEvents.length + f.deletedRows.length + f.deletedAccounts.length + f.clubRowsCleared.length === 0, 'and nothing touched')
    const p = await previewWipe(store, 'lahinch')
    ok(!p.ok, 'not even counted')
  }
  {
    const { f, store } = fake()
    const r = await runWipe(store, 'pints', 'Pints', Date.now() + 60_000)
    ok(!r.ok && /Type Pints Golf Club/.test(r.error), 'the name not typed exactly')
    ok(f.deletedEvents.length === 0, 'and nothing touched')
  }
  {
    const { store } = fake({ club: 'not_ready' })
    const r = await runWipe(store, 'pints', 'x', Date.now() + 60_000)
    ok(!r.ok && r.error === TEST_CLUB_NOT_READY, 'before migration 103: not set up yet')
  }

  section('Cut short, pressed again')
  {
    const { f, store } = fake()
    let t = 0
    const clock = () => (t += 10)
    const first = await runWipe(store, 'pints', 'Pints Golf Club', 25, clock)
    ok(first.ok && !first.done, 'stops at the deadline and says so')
    ok(f.deletedEvents.length > 0 && f.deletedEvents.length < 3, 'partway through the events')
    eq(f.deletedRows, [], 'the list untouched until the events are gone')
    const second = await runWipe(store, 'pints', 'Pints Golf Club', Date.now() + 60_000)
    ok(second.ok && second.done, 'the second press finishes')
    eq(f.deletedEvents.sort(), ['e1', 'e2', 'e3'], 'every event once')
  }

  section('The preview')
  {
    const { f, store } = fake()
    const p = await previewWipe(store, 'pints')
    ok(p.ok, 'counted')
    if (p.ok) {
      eq([p.preview.events, p.preview.listRows, p.preview.keptRows, p.preview.fictionalAccounts], [3, 3, 1, 2], 'events, rows going, rows kept, characters')
      eq(p.preview.keep, [{ userId: 'u-ross', username: 'ross', onList: true }], 'the keep-list, on the list')
    }
    ok(f.deletedEvents.length + f.deletedRows.length === 0, 'reads only')
  }
}

// ─── The wiring ─────────────────────────────────────────────────

function wiringTests() {
  section('Migration 103')
  const m = read('supabase/migrations/20260101000103_test_club.sql')
  ok(/ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false/.test(m), 'clubs.is_test, off by default')
  ok(m.includes(`WHERE slug = '${PINTS_SLUG}'`), 'Pints switched on, by its address')
  for (const t of ['test_accounts', 'test_club_keep', 'test_week_loads']) {
    ok(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`).test(m), `${t} closed to phones`)
  }
  ok(/-- UNDO/.test(m), 'it carries its undo')

  section('Platform figures (D316)')
  ok(/testTripIds\(db\)/.test(read('app/admin/trips/page.tsx')), 'the admin’s Trips page leaves test events out of its counts')
  ok(/isTestTrip\(admin, tripId\)/.test(read('app/api/golf-ireland/sync.ts')), 'Golf Ireland never reads a test club’s league')

  section('The admin page')
  ok(read('app/admin/AdminShell.tsx').includes("href: '/admin/test-club'"), 'Test club is a tab')
  const actions = read('app/admin/test-club/actions.ts')
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map(x => x[1])
  ok(exported.length >= 3 && exported.every(fn => {
    const body = actions.slice(actions.indexOf(`export async function ${fn}(`)).split(/\nexport /)[0]
    const gate = body.indexOf('if (!(await requireAdmin()))')
    return gate > -1 && gate < body.indexOf('createAdminClient()')
  }), 'every action asks requireAdmin() before it reads anything')
  ok(!/^'use server'/.test(read('app/admin/accounts.ts')), 'findAccount lives outside a server-action file (so it is no request anybody can make)')
}

// ─── The characters and the reseed (D309–D311, D315) ────────────

function castTests() {
  section('The characters (D309)')
  const deny = readDenyList(read('data/test-club/deny-list.txt'))
  ok(deny.length >= 10 && !deny.some(d => d.startsWith('#')), 'the deny-list reads, comments skipped')
  const r = readCharacters(JSON.parse(read('data/test-club/characters.json')), deny)
  ok(r.ok, `characters.json reads and passes the deny-list${r.ok ? '' : `: ${r.error}`}`)
  const cast: Character[] = r.ok ? r.cast : []
  eq(cast.length, 11, 'eleven characters (Ross’s amendment)')
  for (const c of cast) {
    ok(usernameIssue(c.username) === null, `${c.name}: a username the site itself accepts`)
    ok(undeliverable(testEmail(c.username, PINTS_SLUG)), `${c.name}: an address nothing is sent to`)
  }
  ok(cast.some(c => c.handicap < 0), 'a plus handicap among them (stored below zero)')
  eq(cast.filter(c => c.gender === 'F').length, 4, 'four women, for the ladies’ competitions')
  eq(cast.filter(c => c.clubhouse && c.officer).map(c => c.key), ['cj'], 'CJ is the office — never Ross’s name on the log')
  ok(cast.every(c => MEMBERSHIPS.some(m => m.name === c.membership)), 'every membership is one the reseed makes')
  ok(MEMBERSHIPS.some(m => m.junior) && MEMBERSHIPS.some(m => m.name === DEFAULT_MEMBERSHIP), 'a Junior membership, and the keep-list’s default')
  ok(TEST_LABELS.length >= 2 && TEST_LABELS.length <= 3, 'two or three labels')

  section('The deny-list catches a real name (D309)')
  eq(deniedName('Martin Sheen', deny), 'Martin Sheen', 'a real name, whole')
  eq(deniedName('Sir martin  sheen jr', deny), 'Martin Sheen', 'case and spacing aside, inside a longer name')
  eq(deniedName('Martina Sheener', deny), null, 'never part of a word')
  const planted = readCharacters({ characters: [{ ...cast[0], name: 'Rory McIlroy' }] }, deny)
  ok(!planted.ok && /real person/.test(planted.error), 'a character given a real name is refused')
  const clash = readCharacters({ characters: [cast[0], { ...cast[1], username: cast[0]?.username }] }, deny)
  ok(!clash.ok, 'two characters with one username are refused')

  section('Numbers on the list')
  eq([memberNumber(0), memberNumber(10)], ['T01', 'T11'], 'T01… — never a real member’s')

  section('The coming week’s casual tee times')
  const plan = casualPlan(cast, '2026-11-24')
  eq(JSON.stringify(plan), JSON.stringify(casualPlan(cast, '2026-11-24')), 'the same every reseed')
  ok(plan.length >= 5 && plan.every(p => p.who.length >= 2 && p.who.length <= 3), 'twos and threes, most days')
  ok(plan.every(p => p.day > '2026-11-24' && p.day <= '2026-12-01'), 'the next seven days')
  ok(plan.every(p => p.time >= '08:30' && p.time <= '14:00'), 'a daytime wish, never before half eight')
  const sat = plan.filter(p => new Date(`${p.day}T12:00:00Z`).getUTCDay() === 6)
  ok(sat.every(p => p.who.every(k => cast.find(c => c.key === k)?.membership !== '6 Day')), 'a 6 Day member never on a Saturday')
  ok(plan.every(p => { const seen = plan.filter(q => q.day === p.day).flatMap(q => q.who); return new Set(seen).size === seen.length }), 'nobody twice in a day')
  ok(plan.every(p => p.who.every(k => cast.some(c => c.key === k))), 'characters only — never a real member (D314)')

  section('A club keeps its owner through a wipe')
  const rows = rowsToWipe([{ id: 'r-owner', userId: 'u-ross', owner: true }, { id: 'r-x', userId: 'u-x' }], new Set(), new Set())
  eq(rows.kept, ['r-owner'], 'the owner’s row stays, keep-list or not')
}

function seedWiringTests() {
  section('The reseed (D310, D311)')
  const seed = read('app/admin/test-club/seed.ts')
  ok(/createUser\(\{[\s\S]*?email_confirm: true/.test(seed), 'accounts are made with the email already confirmed')
  ok(/testEmail\(c\.username, club\.slug\)/.test(seed), 'on the .invalid domain')
  ok(/password: testPassword\(\)!/.test(seed), 'made with the shared password')
  ok(!/updateUserById/.test(seed), 'a reseed never resets a password — that ends the account’s sessions, and with them every token held')
  const calls = read('app/admin/test-club/characterCalls.ts')
  ok(/getUser\(held\.token\)/.test(calls), 'a token kept from an earlier press is checked before it is used')
  ok(/updateUserById\(account\.id, \{ password \}\)/.test(calls) && calls.indexOf('updateUserById') > calls.indexOf('passwordSignIn(email, password)'), 'a password changed in Vercel is brought into line only when the sign-in is refused')
  ok(/club_tee_bookings'\)\.select\('id'\)/.test(seed) && seed.indexOf("from('club_tee_bookings')") < seed.indexOf('characterToken(testEmail(first.username'), 'casual times already booked are found without signing in')
  ok(/if \(!testPassword\(\)\) throw/.test(seed), 'refused without TEST_CLUB_PASSWORD')
  ok(!/sendEmail|signInWithOtp|inviteUserByEmail|generateLink/.test(seed), 'sends nothing')
  ok(/callAs\(teeTimesRoute/.test(seed), 'tee times are booked through the club’s own route, as the character')
  ok(/process\.env\.TEST_CLUB_PASSWORD/.test(read('app/admin/test-club/characterCalls.ts')), 'characters sign in with TEST_CLUB_PASSWORD')
  const actions = read('app/admin/test-club/actions.ts')
  ok(/data\/test-club\/characters\.json/.test(actions), 'the reseed reads the committed cast')

  section('The Demo pill and the Fictional filter (D315)')
  ok(LIST_FILTERS.some(f => f.key === 'fictional' && f.label === 'Fictional'), 'Fictional is a filter')
  ok(/case 'fictional': q = live\(\)\.in\('user_id'/.test(read('app/api/club/store.ts')), 'it finds the club’s characters')
  ok(/f\.key !== 'fictional' \|\| fictional/.test(read('app/clubhouse/[slug]/members/MembersGrid.tsx')), 'offered only where the club has characters')
  for (const f of ['app/clubhouse/[slug]/members/MembersGrid.tsx', 'app/club/[slug]/ClubTeeTimes.tsx', 'app/clubhouse/[slug]/tee-sheet/TeeSheet.tsx', 'app/club/[slug]/comp/[code]/CompTeeSheet.tsx']) {
    ok(/<DemoPill/.test(read(f)), `${f.split('/').slice(-1)[0]} draws the Demo pill`)
  }
  const pill = read('app/components/DemoPill.tsx')
  ok(/t-label/.test(pill) && /bg-tint/.test(pill) && /text-bark/.test(pill), 'the pill: t-label, the tint, bark text')
}

// ─── The season and its cards (D311, D312) ──────────────────────

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5]
const SIS = [7, 1, 15, 11, 3, 13, 17, 5, 9, 8, 16, 2, 10, 4, 14, 18, 6, 12]
const HOLES = PARS.map((par, i) => ({ number: i + 1, par, si: SIS[i] }))
const points = (card: { hole: number; gross: number }[], ch: number) =>
  card.reduce((t, h) => t + holePoints(h.gross, PARS[h.hole - 1], SIS[h.hole - 1], ch), 0)
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

function cardTests() {
  section('A card follows handicap and form (D312)')
  const card = makeCard({ holes: HOLES, courseHcp: 14, form: 'steady', seed: 'a' })
  eq(card.map(h => h.hole), HOLES.map(h => h.number), 'eighteen holes, in order')
  eq(JSON.stringify(card), JSON.stringify(makeCard({ holes: HOLES, courseHcp: 14, form: 'steady', seed: 'a' })), 'the same seed, the same card — a week loaded twice changes nothing')
  ok(JSON.stringify(card) !== JSON.stringify(makeCard({ holes: HOLES, courseHcp: 14, form: 'steady', seed: 'b' })), 'another seed, another card')
  const many = (ch: number, form: Parameters<typeof makeCard>[0]['form']) => Array.from({ length: 150 }, (_, i) => points(makeCard({ holes: HOLES, courseHcp: ch, form, seed: `m${i}` }), ch))
  const scratch = median(many(0, 'steady')), mid = median(many(14, 'steady')), high = median(many(32, 'steady'))
  ok(scratch >= 33 && scratch <= 37, `a scratch golfer about 35 points (${scratch})`)
  ok(mid >= 30 && mid <= 35, `a 14 handicap about 33 (${mid})`)
  ok(high >= 27 && high <= 33, `a 32 handicap about 31 (${high})`)
  ok(median(many(14, 'hot')) > median(many(14, 'poor')) + 3, 'hot beats poor by a distance')
  const wild = many(3, 'wild'), steady = many(3, 'steady')
  const spread = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.9)] - s[Math.floor(s.length * 0.1)] }
  ok(spread(wild) > spread(steady) * 1.5, 'wild form swings (Jed)')
  eq(targetOver(10, 4, seeded('x')), 4, 'a number form is exact')
  const plus = makeCard({ holes: HOLES, courseHcp: -1, form: 0, seed: 'p' })
  eq(plus.reduce((t, h) => t + h.gross, 0), 71, 'a plus 1 playing to handicap breaks par by one — they give a shot back (on SI 18)')
  eq(plus.find(h => h.hole === 16)?.gross, 2, 'the shot goes back on the stroke index 18 hole')
  const all = Array.from({ length: 300 }, (_, i) => makeCard({ holes: HOLES, courseHcp: 36, form: 'awful', seed: `w${i}` })).flat()
  ok(all.every(h => h.gross >= 2 && h.gross <= PARS[h.hole - 1] + 2 + 4), 'never below two, never more than four over nett par on a hole')
  const set = makeCard({ holes: HOLES, courseHcp: 3, form: 'awful', seed: 's', set: [{ hole: 18, gross: 4 }] })
  eq(set.find(h => h.hole === 18)?.gross, 4, 'a set piece is what the card says — Jed’s 4 on 18')

  section('The season the reseed plays (D311)')
  const cast = (readCharacters(JSON.parse(read('data/test-club/characters.json')), []) as { ok: true; cast: Character[] }).cast
  const plan = seasonPlan(cast, '2026-11-24')
  eq(plan.length, 8, 'eight competitions')
  ok(plan.every(p => p.day < '2026-11-24' && p.day >= '2026-09-29'), 'all in the eight weeks before today')
  ok(plan.every((p, i) => i === 0 || plan[i - 1].day <= p.day), 'in date order')
  eq(new Set(plan.map(p => p.key)).size, 8, 'each with its own key')
  ok(plan.every(p => p.certify), 'all certified, so Results and Golfer of the Year have a season')
  const sats = plan.filter(p => new Date(`${p.day}T12:00:00Z`).getUTCDay() === 6)
  eq(sats.length, 6, 'six Saturdays')
  ok(sats.every(p => !p.groups.flat().includes('elizabeth')), 'a 6 Day member never on a Saturday')
  const ladies = plan.find(p => p.entry?.genders?.[0] === 'F')
  ok(!!ladies && ladies.groups.flat().every(k => cast.find(c => c.key === k)?.gender === 'F'), 'a ladies’ competition, women only')
  const seniors = plan.find(p => p.entry?.membership === 'Senior')
  ok(!!seniors && seniors.groups.flat().every(k => cast.find(c => c.key === k)?.membership === 'Senior'), 'a seniors’ competition, Senior members only')
  ok(plan.some(p => p.set?.some(x => x.who === 'jed' && x.hole === 18 && x.gross === 4)), 'Jed’s suspicious 4 on 18 is in it')
  ok(plan.every(p => p.groups.every(g => g.length >= 2 && g.length <= 4)), 'groups of two to four, nobody alone')
  ok(plan.every(p => p.groups.flat().every(k => k in p.players)), 'every player has a form')
  ok(plan.every(p => p.groups.flat().every(k => cast.some(c => c.key === k))), 'characters only (D314)')
  eq(JSON.stringify(seasonPlan(cast, '2026-11-24')), JSON.stringify(plan), 'the same season every reseed')
  for (let n = 1; n <= 13; n++) {
    const g = groupsOf(Array.from({ length: n }, (_, i) => `p${i}`))
    ok(g.flat().length === n && g.every(x => x.length >= Math.min(2, n) && x.length <= 4), `${n} players: everybody in a group of two to four`)
  }
  eq(groupsOf(['a', 'b', 'c', 'd', 'e']).map(g => g.length), [3, 2], 'five: a three and a two')
  eq(groupsOf(['a', 'b', 'c', 'd', 'e', 'f', 'g']).map(g => g.length), [4, 3], 'seven: a four and a three')
  eq(groupsOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']).map(g => g.length), [3, 3, 3], 'nine: three threes')

  section('Playing a competition goes through the club’s own rules')
  const play = read('app/admin/test-club/play.ts')
  for (const fn of ['runNewCompetition', 'runBooking', 'runSign', 'runCertify']) ok(new RegExp(`await ${fn}\\(`).test(play), `${fn} — the route’s own rules`)
  ok(!/from\('scores'\)/.test(play), 'never writes the signed scores itself — finalising does')
  ok(/action: 'approve'/.test(play) && /action: 'mark'/.test(play), 'each player approves and each marker marks, on their own account')
  ok(/here\[\(i \+ 1\) % here\.length\]/.test(play), 'a card is marked by the next in the group — never the player')
  ok(/from: 'clubhouse'/.test(play), 'made from the Clubhouse, as the office makes them')
}

function banterTests() {
  section('The season’s banter (D313)')
  const cast = (readCharacters(JSON.parse(read('data/test-club/characters.json')), []) as { ok: true; cast: Character[] }).cast
  const deny = readDenyList(read('data/test-club/deny-list.txt'))
  const plan = seasonPlan(cast, '2026-11-24')
  const file = JSON.parse(read('data/test-club/season-banter.json')) as { competitions: Record<string, Banter> }
  eq(Object.keys(file.competitions).sort(), plan.map(p => p.key).sort(), 'banter for every competition of the season, and none else')
  for (const p of plan) {
    const b = file.competitions[p.key]
    const why = banterIssue(b, cast, p.groups.flat())
    ok(why === null, `${p.name}: every status by a player, every comment on a card that exists${why ? ` — ${why}` : ''}`)
  }
  const all = Object.values(file.competitions).flatMap(b => [...Object.values(b.statuses ?? {}), ...(b.comments ?? []).map(c => c.text)])
  ok(all.every(t => deniedName(t, deny) === null), 'no real living person named in any line')
  ok(all.length >= 80, `plenty of it (${all.length} lines)`)
  const jedEighteen = file.competitions['season-03'].comments ?? []
  ok(jedEighteen.some(c => c.on === 'jed' && c.by === 'cj' && /18/.test(c.text)), 'CJ calls out Jed’s 4 on 18')
  ok(Object.values(file.competitions).every(b => (b.comments ?? []).filter(c => c.by === 'tom').every(t => (b.comments ?? []).some(r => r.on === t.on && r.by !== 'tom' && (b.comments ?? []).indexOf(r) > (b.comments ?? []).indexOf(t)))), 'Old Tom is always answered on the same card, after him')

  section('Checking a competition’s banter')
  const players = ['jed', 'cj']
  ok(banterIssue({ statuses: { tom: 'x' } }, cast, players) !== null, 'a status for somebody who did not play is refused')
  ok(banterIssue({ comments: [{ on: 'tom', by: 'cj', text: 'x' }] }, cast, players) !== null, 'a comment on a card that does not exist is refused')
  ok(banterIssue({ comments: [{ on: 'jed', by: 'nobody', text: 'x' }] }, cast, players) !== null, 'a comment by somebody who is not a character is refused')
  ok(banterIssue({ statuses: { jed: 'x'.repeat(141) } }, cast, players) !== null, 'a status over 140 characters is refused')
  ok(banterIssue({ comments: [{ on: 'jed', by: 'cj', text: 'x'.repeat(281) }] }, cast, players) !== null, 'a comment over 280 characters is refused')

  section('Dots')
  const keys = plan[0].groups.flat()
  const dots = dotPlan(cast, keys, plan[0].key)
  ok(dots.every(d => d.by !== d.on), 'nobody dots their own card')
  ok(dots.every(d => keys.includes(d.on)), 'only cards in the competition')
  eq(dots.filter(d => d.by === 'jed').length, keys.filter(k => k !== 'jed').length, 'Jed (every card) dots every other card')
  eq(dots.filter(d => d.by === 'don').length, 0, 'Don (low) dots nothing')
  eq(JSON.stringify(dotPlan(cast, keys, plan[0].key)), JSON.stringify(dots), 'the same every time')

  section('Posted through the feed’s own route')
  const banter = read('app/admin/test-club/banter.ts')
  for (const a of ['card.status', 'comment', 'dot']) ok(new RegExp(`action: '${a.replace('.', '\\.')}'`).test(banter), `${a} through /api/feed, as the character`)
  ok(!/\.insert\(/.test(banter) && !/\.upsert\(/.test(banter), 'never writes a feed row itself — only dates a comment to the afternoon')
  ok(/filter\('data->>text', 'eq'/.test(banter) && /from\('feed_dots'\)/.test(banter), 'a comment or dot already there is not posted twice')
}

async function main() {
  guardTests()
  castTests()
  seedWiringTests()
  cardTests()
  banterTests()
  ruleTests()
  await wipeTests()
  wiringTests()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { console.log(failures.map(f => `  ✗ ${f}`).join('\n')); process.exit(1) }
}
main()
