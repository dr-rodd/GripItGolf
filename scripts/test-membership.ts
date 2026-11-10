/**
 * Who a phone is in an event. Run with: npm run test:membership
 *
 * Row-level security, stage 1. Three halves:
 *
 *   · the rules in lib/membership.ts — the four roles, the twelve hours,
 *     the read-only cap thirty days after the end, never lowering a phone,
 *     the PIN retry windows;
 *   · /api/entry's logic (app/api/entry/entry.ts) run against a stand-in
 *     store — every refusal, every grant, the retry limit across addresses;
 *   · the wiring, by reading the source: every way into an event reaches
 *     the route, nobody signs in before migration 068 is in, and nothing in
 *     the browser writes trip_members.
 */

import fs from 'fs'
import {
  ATTEMPT_LIMITS, ORGANISER_MS, afterFailure, attemptBlocked, entryStamp, fieldReadOnlyFrom,
  isMember, mayWrite, mergeGrant, needsEntry, roleOf,
  type AttemptWindow, type EventFacts, type Membership,
} from '../lib/membership'
import { hashPasscode } from '../lib/passcode'
import { runEntry, type EntryStore, type EntryTrip } from '../app/api/entry/entry'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)
const read = (p: string) => fs.readFileSync(p, 'utf-8')

const NOW = new Date('2026-11-10T09:00:00Z')
const later = (ms: number) => new Date(NOW.getTime() + ms)
const HOUR = 60 * 60 * 1000
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const locked: EventFacts = { adminPinSet: true, endDate: null }
const open: EventFacts = { adminPinSet: false, endDate: null }

// ─── The rules ─────────────────────────────────────────────────

section('Entering: guest with the code, player with a name, organiser with the PIN')
{
  const guest = mergeGrant(null, {}, NOW)
  eq(guest, { role: 'guest', playerId: null, organiserUntil: null }, 'the code alone makes a guest')
  const player = mergeGrant(null, { playerId: P1 }, NOW)
  eq([player.role, player.playerId], ['player', P1], 'a claimed name makes a player, and says which')
  const org = mergeGrant(null, { organiser: true }, NOW)
  eq(org.organiserUntil, later(ORGANISER_MS).toISOString(), 'the PIN makes an organiser for twelve hours from now')
  eq(org.role, 'guest', '  …and organiser is not stored as the field role')
  ok(ORGANISER_MS === 12 * HOUR, 'twelve hours, fixed')
}

section('Never lowers a phone')
{
  const player: Membership = { role: 'player', playerId: P1, organiserUntil: null }
  eq(mergeGrant(player, {}, NOW), player, 'a player entering again without the cookie stays that player')
  const org = mergeGrant(null, { organiser: true }, NOW)
  eq(mergeGrant(org, {}, later(HOUR)).organiserUntil, org.organiserUntil, 'entering again without the PIN keeps the twelve hours where they were')
  eq(mergeGrant(org, { organiser: true }, later(HOUR)).organiserUntil, later(HOUR + ORGANISER_MS).toISOString(),
    'the PIN again starts a fresh twelve hours')
  eq(mergeGrant(player, { playerId: P2 }, NOW).playerId, P2, 'claiming a different name ("Not you?") moves to it')
  const spectator: Membership = { role: 'spectator', playerId: null, organiserUntil: null }
  eq(mergeGrant(spectator, {}, NOW).role, 'guest', 'the code lifts a spectator row to guest — entering with it is what a guest is')
}

section('What a row means now')
{
  eq(roleOf(null, locked, NOW), null, 'no row, no role')
  const org = mergeGrant(null, { organiser: true, playerId: P1 }, NOW)
  eq(roleOf(org, locked, later(ORGANISER_MS - 1)), 'organiser', 'organiser a moment before twelve hours')
  eq(roleOf(org, locked, later(ORGANISER_MS)), 'player', '  …and back to what it is in the field at twelve hours')
  eq(roleOf(mergeGrant(null, { organiser: true }, NOW), locked, later(ORGANISER_MS)), 'guest', '  …a guest, if it never claimed a name')
  eq(roleOf({ role: 'guest', playerId: null, organiserUntil: null }, open, NOW), 'organiser',
    'on an event with no PIN, every member is the organiser — as Trip Setup always was')
  eq(roleOf({ role: 'spectator', playerId: null, organiserUntil: null }, open, NOW), 'spectator', '  …never a spectator')
  ok(isMember('organiser') && isMember('player') && isMember('guest'), 'organiser, player and guest are members')
  ok(!isMember('spectator') && !isMember(null), '  …a spectator and nobody are not')
}

section('A finished event: the field reads only from thirty days after its end')
{
  // Summer time: midnight Irish time is 23:00 UTC the day before.
  eq(fieldReadOnlyFrom('2026-08-20')?.toISOString(), '2026-09-19T23:00:00.000Z',
    'ended 20 August: writable through 19 September, read-only from midnight Irish time')
  // Winter: Irish time is UTC.
  eq(fieldReadOnlyFrom('2026-12-01')?.toISOString(), '2027-01-01T00:00:00.000Z', 'ended 1 December: read-only from 1 January')
  eq(fieldReadOnlyFrom(null), null, 'no end date, no cap — an ongoing league stays open')
  eq(fieldReadOnlyFrom('not a date'), null, '  …nor for an end date that does not read')

  const ended: EventFacts = { adminPinSet: true, endDate: '2026-08-20' }
  const guest: Membership = { role: 'guest', playerId: null, organiserUntil: null }
  const before = new Date('2026-09-19T22:59:00Z'), after = new Date('2026-09-19T23:00:00Z')
  ok(mayWrite(guest, ended, before), 'the field writes on the thirtieth day')
  ok(!mayWrite(guest, ended, after), '  …and reads only from the next midnight')
  ok(!mayWrite({ role: 'player', playerId: P1, organiserUntil: null }, ended, after), '  …a player too')
  const org = mergeGrant(guest, { organiser: true }, after)
  ok(mayWrite(org, ended, after), 'the organiser with the PIN is never capped')
  ok(!mayWrite(guest, { adminPinSet: false, endDate: '2026-08-20' }, after),
    'an event with no PIN caps everybody — there is no organiser with a PIN to exempt')
  ok(!mayWrite({ role: 'spectator', playerId: null, organiserUntil: null }, locked, NOW), 'a spectator never writes')
  ok(!mayWrite(null, locked, NOW), 'nor does a phone with no row')
}

section('The PIN retry limit')
{
  const lim = ATTEMPT_LIMITS.address
  let w: AttemptWindow | null = null
  for (let i = 0; i < lim.max; i++) {
    ok(!attemptBlocked(w, lim, NOW), i === 0 ? 'open to start with' : `  open after ${i} wrong`)
    w = afterFailure(w, lim, NOW)
  }
  ok(attemptBlocked(w, lim, NOW), `shut after ${lim.max} wrong`)
  ok(!attemptBlocked(w, lim, later(lim.windowMs)), '  …and open again when the window runs out')
  eq(afterFailure(w, lim, later(lim.windowMs)), { failures: 1, windowStarted: later(lim.windowMs).toISOString() },
    '  …a wrong PIN then starting a new window')
  ok(ATTEMPT_LIMITS.event.max > ATTEMPT_LIMITS.address.max, 'the whole event allows more than one address')
}

section('Remembering an entry on the phone')
{
  const stamp = entryStamp('u1', P1)
  ok(!needsEntry(stamp, 'u1', P1), 'the same identity and player: no need to enter again')
  ok(needsEntry(stamp, 'u2', P1), 'a new identity (storage cleared, the home-screen app) enters again')
  ok(needsEntry(stamp, 'u1', P2), 'a name claimed since enters again')
  ok(needsEntry(entryStamp('u1', null), 'u1', P1), '  …including the first name claimed')
  ok(needsEntry(null, 'u1', null), 'never entered: enter')
}

// ─── /api/entry against a stand-in ─────────────────────────────

const ADMIN = '4321', PUBLIC = '1111'

async function world(trip: Partial<EntryTrip> = {}) {
  const t: EntryTrip = { id: 'trip-1', endDate: null, adminHash: await hashPasscode(ADMIN), publicHash: null, ...trip }
  const members = new Map<string, Membership>()
  const attempts = new Map<string, AttemptWindow>()
  const claimed = new Set([`trip-1:${P1}`])
  const store: EntryStore = {
    async userFromToken(token) { return token.startsWith('tok-') ? token.slice(4) : null },
    async tripByCode(code) { return code === 'GX7K2P' ? t : null },
    async claimedPlayer(tripId, playerId) { return claimed.has(`${tripId}:${playerId}`) },
    async readMembership(u, tr) { return members.get(`${u}:${tr}`) ?? null },
    async writeMembership(u, tr, m) { members.set(`${u}:${tr}`, m) },
    async readAttempts(keys) { return new Map(keys.filter(k => attempts.has(k)).map(k => [k, attempts.get(k)!])) },
    async writeAttempt(key, _tr, w) { attempts.set(key, w) },
  }
  return { t, members, attempts, store }
}
const base = { token: 'tok-u1', code: 'gx7k2p', address: '203.0.113.7' }

async function routeTests() {
  section('/api/entry: what it refuses')
  {
    const { store, members } = await world()
    eq((await runEntry({ ...base, code: '' }, store, NOW)).status, 400, 'no code')
    eq((await runEntry({ ...base, token: null }, store, NOW)).status, 401, 'no sign-in')
    eq((await runEntry({ ...base, token: 'forged' }, store, NOW)).status, 401, 'a token that is nobody')
    eq((await runEntry({ ...base, code: 'NOPE42' }, store, NOW)).status, 404, 'a code that is no event')
    eq(members.size, 0, '  …and none of those wrote anything')
  }

  section('/api/entry: what it grants')
  {
    const { store, members } = await world()
    const out = await runEntry(base, store, NOW)
    eq(out.status, 200, 'the code, any case, enters')
    eq(out.body.ok && out.body.role, 'guest', '  …as a guest')
    eq(members.get('u1:trip-1'), { role: 'guest', playerId: null, organiserUntil: null }, '  …and the row says so')

    await runEntry({ ...base, playerId: P1.toUpperCase() }, store, NOW)
    eq(members.get('u1:trip-1')?.playerId, P1, 'a claimed player of this event makes a player')
    await runEntry({ ...base, token: 'tok-u2', playerId: P2 }, store, NOW)
    eq(members.get('u2:trip-1')?.role, 'guest', 'a player who is not this event\'s claimed one is ignored, not refused')
    await runEntry(base, store, NOW)
    eq(members.get('u1:trip-1')?.role, 'player', 'entering again without the cookie keeps the player')

    const org = await runEntry({ ...base, adminPin: ADMIN }, store, NOW)
    eq(org.body.ok && org.body.role, 'organiser', 'the right admin PIN makes the organiser')
    eq(org.body.ok && org.body.organiserUntil, later(ORGANISER_MS).toISOString(), '  …for twelve hours')
    eq(members.get('u1:trip-1')?.playerId, P1, '  …and keeps the name it claimed')
  }

  section('/api/entry: the admin PIN, and its retry limit')
  {
    const { store, members, attempts } = await world()
    const wrong = await runEntry({ ...base, adminPin: '0000' }, store, NOW)
    eq(wrong.status, 403, 'a wrong admin PIN is refused')
    eq(members.size, 0, '  …writes no row')
    eq(attempts.size, 2, '  …and is counted twice: this address, and the whole event')
    ok([...attempts.keys()].every(k => !k.includes(base.address)), '  …the address hashed, never stored')

    for (let i = 1; i < ATTEMPT_LIMITS.address.max; i++) await runEntry({ ...base, adminPin: '0000' }, store, NOW)
    const shut = await runEntry({ ...base, adminPin: ADMIN }, store, NOW)
    eq(shut.status, 429, `after ${ATTEMPT_LIMITS.address.max} wrong from one address, even the right PIN waits`)
    eq((await runEntry({ ...base, address: '198.51.100.9', adminPin: ADMIN }, store, NOW)).status, 200,
      '  …but another address is not held up')
    eq((await runEntry({ ...base, adminPin: ADMIN }, store, later(ATTEMPT_LIMITS.address.windowMs))).status, 200,
      '  …and the first is let back in when the window runs out')
    eq((await runEntry({ ...base, token: 'tok-u9' }, store, NOW)).status, 200,
      'entering without a PIN is never held up by the limit')
  }
  {
    const { store } = await world()
    for (let i = 0; i < ATTEMPT_LIMITS.event.max; i++) {
      await runEntry({ ...base, address: `10.0.${Math.floor(i / 9)}.${i % 9}`, adminPin: '0000' }, store, NOW)
    }
    eq((await runEntry({ ...base, address: '192.0.2.1', adminPin: ADMIN }, store, NOW)).status, 429,
      `a guess spread over many addresses is shut after ${ATTEMPT_LIMITS.event.max} for the event`)
  }
  {
    const { store, members } = await world({ adminHash: null })
    const out = await runEntry({ ...base, adminPin: '9999' }, store, NOW)
    eq(out.status, 200, 'an event with no admin PIN has nothing to check against')
    eq(out.body.ok && out.body.role, 'organiser', '  …everybody in it is the organiser already')
    eq(members.get('u1:trip-1')?.organiserUntil, null, '  …so no twelve hours are stored')
  }

  section('/api/entry: the public PIN')
  {
    const pubHash = await hashPasscode(PUBLIC)
    const { store, members } = await world({ publicHash: pubHash })
    eq((await runEntry(base, store, NOW)).status, 403, 'a public-PIN event refuses the code alone')
    eq((await runEntry({ ...base, entryCookie: 'stale' }, store, NOW)).status, 403, '  …and a cookie for an old PIN')
    eq((await runEntry({ ...base, entryCookie: pubHash }, store, NOW)).status, 200, 'the door\'s cookie lets it in — the layout\'s own rule')
    eq((await runEntry({ ...base, token: 'tok-u2', publicPin: PUBLIC }, store, NOW)).status, 200, 'the public PIN lets it in')
    eq((await runEntry({ ...base, token: 'tok-u3', publicPin: '2222' }, store, NOW)).status, 403, 'a wrong public PIN is refused')
    const admin = await runEntry({ ...base, token: 'tok-u4', adminPin: ADMIN }, store, NOW)
    eq(admin.body.ok && admin.body.role, 'organiser', 'the admin PIN opens the door too')
    ok(!members.has('u3:trip-1'), 'the refused phone has no row')
  }

  section('/api/entry: a finished event says the field is read-only')
  {
    const { store } = await world({ endDate: '2026-09-01' })
    const guest = await runEntry(base, store, NOW)
    eq(guest.body.ok && guest.body.readOnly, true, 'a guest entering seventy days after the end reads only')
    const org = await runEntry({ ...base, adminPin: ADMIN }, store, NOW)
    eq(org.body.ok && org.body.readOnly, false, 'the organiser with the PIN does not')
  }
}

// ─── The wiring ────────────────────────────────────────────────

function wiringTests() {
  section('Every way into an event reaches the route')
  {
    const layout = read('app/golf/[root]/[tripCode]/layout.tsx')
    ok(layout.includes('<EnsureMember tripCode={tripCode} />'), 'the trip layout mounts EnsureMember')
    ok(layout.indexOf('redirect(`/enter/') >= 0 && layout.indexOf('redirect(`/enter/') < layout.indexOf('<EnsureMember'),
      '  …after the public PIN door, so only a phone let in is entered')
    ok(read('app/run/[tripCode]/layout.tsx').includes('<EnsureMember tripCode={tripCode} />'), 'the run layout mounts it too')

    const ensure = read('app/components/EnsureMember.tsx')
    ok(ensure.includes('useEffect') && /requestIdleCallback|setTimeout/.test(ensure) && ensure.includes('return null'),
      'EnsureMember runs after paint and draws nothing')

    // Every door that remembers an unlock or a claimed name on the phone
    // tells the server the same thing.
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
      d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : [])
    for (const f of files('app')) {
      const src = read(f)
      const calls = (src.match(/\b(rememberUnlock|rememberPlayer)\(/g) ?? []).length
      if (calls === 0) continue
      const enters = (src.match(/\benterEvent\(/g) ?? []).length
      ok(enters >= calls, `${f}: every rememberUnlock/rememberPlayer is followed by enterEvent (${calls} and ${enters})`)
    }
    ok(/enterEvent\(tripCode, asAdmin \? \{ adminPin: code \} : \{ publicPin: code \}\)/.test(read('app/enter/[tripCode]/EntryGate.tsx')),
      'the public PIN door enters with whichever PIN it was given')
  }

  section('Nobody is signed in before migration 068 is in')
  {
    const client = read('lib/entryClient.ts')
    const body = (name: string) => client.slice(client.indexOf(`function ${name}`), client.indexOf('\n}\n', client.indexOf(`function ${name}`)))
    for (const fn of ['post', 'ensureMember']) {
      const b = body(fn)
      ok(b.indexOf('await databaseReady()') >= 0 && b.indexOf('await databaseReady()') < b.indexOf('phoneSession()'),
        `${fn} asks whether the database is ready before signing anybody in`)
    }
    ok((client.match(/signInAnonymously\(/g) ?? []).length === 1 && body('phoneSession').includes('signInAnonymously('),
      'one place signs in, behind one shared promise')
    ok(!/throw\b/.test(client), 'the browser half never throws')

    const route = read('app/api/entry/route.ts')
    ok(/from\('entry_attempts'\)\.select/.test(route.slice(route.indexOf('export async function GET'))),
      'readiness is asked of entry_attempts')
    const sql = read('supabase/migrations/20260101000068_trip_members.sql')
    const code = sql.replace(/--[^\n]*/g, '')
    const created = [...code.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1])
    eq(created[created.length - 1], 'entry_attempts', '  …the last table 068 makes')
    for (const t of ['match_scores', 'match_concessions', 'session_matches', 'session_match_scores']) {
      const at = code.search(new RegExp(`ON public\\.${t}\\s+TO authenticated`))
      ok(at >= 0 && at < code.indexOf('CREATE TABLE'), `068 grants ${t} to signed-in phones before it makes any table`)
    }
    ok(sql.includes('Did it land?') && sql.includes('Undo'), '068 carries its check and its undo')
  }

  section('Only the server writes trip_members')
  {
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
      d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : [])
    const writers = [...files('app'), ...files('lib')].filter(f => read(f).includes("from('trip_members')"))
    eq(writers, ['app/api/entry/route.ts'], 'one file names the table, and it is the route')
    ok(read('app/api/entry/route.ts').includes('createAdminClient'), '  …on the service role')
  }

  section('The realtime question has its query')
  {
    ok(/pg_publication_tables[\s\S]*supabase_realtime[\s\S]*live_scores/.test(read('scripts/rls-check.sql')),
      'scripts/rls-check.sql asks whether live_scores is on the realtime channel')
  }
}

async function main() {
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
void main()
