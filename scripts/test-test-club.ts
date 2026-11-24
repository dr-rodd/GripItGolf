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

async function main() {
  guardTests()
  ruleTests()
  await wipeTests()
  wiringTests()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { console.log(failures.map(f => `  ✗ ${f}`).join('\n')); process.exit(1) }
}
main()
