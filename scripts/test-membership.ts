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
  ATTEMPT_KEEP_HOURS, ATTEMPT_LIMITS, FORGET_RULE, ORGANISER_MS, afterFailure, attemptBlocked, entryStamp, fieldReadOnlyFrom,
  isMember, mayWrite, mergeGrant, needsEntry, roleOf,
  type AttemptWindow, type EventFacts, type Membership,
} from '../lib/membership'
import { legacyPinHash as hashPasscode, entryToken, hashPin, verifyPin } from '../lib/pinHash'
import { runEntry, type EntryStore, type EntryTrip } from '../app/api/entry/entry'
import { runDoor, runExtend, runPlayTogether, runSetAdminPin, runSetPublicPin, type ActionStore } from '../app/api/event/actions'
import { closeOrganiser, fieldOpenEnded, mayChangeEvent } from '../lib/membership'
import { SaveStepError, runAskReset, runCheckReset, runSaveReset, resetTokenHash, type ResetStore, type ResetTrip, type ResetRow } from '../app/api/event/pinReset'
import { RESET_LINK_MINUTES, newPinIssue } from '../lib/pinReset'

// The door's token and a re-stored PIN are keyed by the server's secret.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key'

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
  const t: EntryTrip = { id: 'trip-1', code: 'GX7K2P', endDate: null, adminHash: await hashPasscode(ADMIN), publicHash: null, openEnded: false, ...trip }
  const cols: Record<string, unknown> = { leaderboards: [{ id: 'b1', competition: 'league' }], event_permissions: {} }
  const members = new Map<string, Membership>()
  const attempts = new Map<string, AttemptWindow>()
  const claimed = new Set([`trip-1:${P1}`])
  const lead: { id: string | null } = { id: P1 }
  const store: EntryStore = {
    async userFromToken(token) { return token.startsWith('tok-') ? token.slice(4) : null },
    async tripByCode(code) { return code === 'GX7K2P' ? t : null },
    async claimedPlayer(tripId, playerId) { return claimed.has(`${tripId}:${playerId}`) },
    async readMembership(u, tr) { return members.get(`${u}:${tr}`) ?? null },
    async writeMembership(u, tr, m) { members.set(`${u}:${tr}`, m) },
    async readAttempts(keys) { return new Map(keys.filter(k => attempts.has(k)).map(k => [k, attempts.get(k)!])) },
    async writeAttempt(key, _tr, w) { attempts.set(key, w) },
    async upgradePin(_tr, kind, hash) { if (kind === 'admin') t.adminHash = hash; else t.publicHash = hash },
  }
  const actions: ActionStore = {
    ...store,
    async tripColumns() { return cols },
    async updateTrip(_tr, patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'public_passcode_hash') t.publicHash = v as string | null
        else if (k === 'settings_passcode_hash') t.adminHash = v as string | null
        else if (k === 'end_date') t.endDate = v as string | null
        else cols[k] = v
      }
    },
    async leadPlayerId() { return lead.id },
    async endOrganisers(tr) {
      for (const [k, m] of members) if (k.endsWith(`:${tr}`)) members.set(k, { ...m, organiserUntil: null })
    },
  }
  return { t, members, attempts, store, actions, cols, lead }
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
    ok(ensure.includes('useEffect') && ensure.includes('void ensureMember(tripCode)') && ensure.includes('return null'),
      'EnsureMember runs after paint, never awaited by the page, and draws nothing')

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
    ok(/if \(r\.body\.organiser === true\) void unlockWithPin\(code, pin\)\s*else void enterEvent\(code, \{ publicPin: pin \}\)/.test(read('lib/entryClient.ts')),
      'the public PIN door enters with whichever PIN it was given')
    // Stage 4 (D64): an unlock is only ever the server's answer, remembered.
    const unlockers = files('app').filter(f => /\brememberUnlock\(/.test(read(f)))
    eq(unlockers, [], 'no screen remembers an unlock of its own — only lib/entryClient.ts, with what the server said')
    const lock = read('app/components/OrganiserLock.tsx')
    ok(lock.includes('lockShut(tripCode)') && !lock.includes('forgetUnlock('), 'shutting the padlock tells the server (D61)')
    ok(/settleOrganiser\(code\)/.test(read('lib/entryClient.ts')), 'a page load checks a remembered unlock against the server, and tells a shut padlock it missed')
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
    eq(writers.sort(), ['app/api/account/store.ts', 'app/api/entry/store.ts', 'app/api/event/resetStore.ts', 'app/api/trip/create/route.ts'],
      'four files name the table: the entry route\'s store, creation (the maker\'s own membership), a PIN reset ending every phone\'s organiser access, and an account taking a phone\'s events across (stage (a))')
    ok(read('app/api/trip/create/route.ts').includes('createAdminClient()'), '  …both on the service role')
    ok(read('app/api/entry/route.ts').includes('serviceStore(createAdminClient())') || /serviceStore\(db\)/.test(read('app/api/entry/route.ts')),
      '  …built on the service role by the route')
  }

  section('Forgetting anonymous phones: one rule, counted first, deleted only when switched on')
  {
    const sql = read('supabase/migrations/20260101000069_forget_anonymous_phones.sql')
    const code = sql.replace(/--[^\n]*/g, '')
    ok(/u\.is_anonymous IS TRUE/.test(code) && (code.match(/is_anonymous IS TRUE/g) ?? []).length >= 2,
      'only anonymous phones, in the rule and again in the delete')
    ok(/interval '7 days'/.test(code) && /NOT EXISTS \(SELECT 1 FROM public\.trip_members/.test(code),
      '  (1) in no event and made more than 7 days ago')
    ok(/interval '90 days'/.test(code) && /auth\.sessions/.test(code), '  (2) unseen for 90 days, sessions included')
    ok(/end_date IS NULL OR t\.end_date >= \(as_of AT TIME ZONE 'Europe\/Dublin'\)::date - 30/.test(code),
      '  …with no event open: none without an end date, none ended within 30 days')
    ok(/SECURITY DEFINER[\s\S]*SET search_path = ''[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = ''/.test(code),
      'both functions run as their owner with an empty search path')
    for (const fn of ['anonymous_phones_to_forget(timestamptz)', 'forget_anonymous_phones(integer)']) {
      ok(code.includes(`REVOKE ALL ON FUNCTION public.${fn}`) && /FROM PUBLIC, anon, authenticated/.test(code),
        `${fn}: closed to every phone`)
      ok(code.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`), `  …the server's alone`)
    }
    ok(/LIMIT max_rows/.test(code), 'a night forgets a bounded number')

    const route = read('app/api/cleanup/route.ts')
    ok(/rpc\("anonymous_phones_to_forget"/.test(route), 'the job counts when it is not deleting')
    ok(/deleting: FORGET_ANONYMOUS_PHONES && !dryRun/.test(route) && /if \(anonymousPhones\.deleting/.test(route),
      '  …and deletes only with the switch on, never on a dry run')
    ok(/FORGET_ANONYMOUS_PHONES = true/.test(read('lib/membership.ts')), 'the switch is on (Ross, 11 Nov 2026, after the dry-run count)')
    ok(/anonymous_phones_to_forget\(\)/.test(read('scripts/rls-check.sql')), 'scripts/rls-check.sql has the dry-run count, off the same function')

    // 081: lighter. The sessions lookup only for open-ended events, one call, weekly.
    const lite = read('supabase/migrations/20260101000081_forget_phones_lighter.sql').replace(/--[^\n]*/g, '')
    ok(/interval '7 days'/.test(lite) && /interval '90 days'/.test(lite) && lite.includes(`::date - ${FORGET_RULE.afterEventDays}`),
      '081 keeps the three numbers FORGET_RULE prints')
    ok(!/WITH anon AS/.test(lite) && /t\.end_date IS NULL/.test(lite) && /'add_rounds' = 'true'/.test(lite),
      '081 asks the sessions only where an event is open-ended (no end date, or an ad hoc series adding rounds)')
    ok(/t\.end_date IS NOT NULL\s+AND t\.end_date >= /.test(lite), '  …and an event with an end date closes 30 days after it, no last-seen test')
    ok((lite.match(/is_anonymous IS TRUE/g) ?? []).length >= 3, '  …only anonymous phones, in both rules and the delete')
    ok(lite.includes('REVOKE ALL ON FUNCTION public.forget_anonymous_phones') && lite.includes('GRANT EXECUTE ON FUNCTION public.forget_anonymous_phones'),
      '  …both functions stay the server\'s alone')
    ok(/getUTCDay\(\) === FORGET_WEEKDAY/.test(route) && /FORGET_WEEKDAY = 0/.test(read('lib/membership.ts')), 'the forgetting step runs weekly, not nightly')
    ok(!/rpc\("anonymous_phones_to_forget"[\s\S]*rpc\("forget_anonymous_phones"/.test(route.replace(/\/\/[^\n]*/g,'')) || /if \(anonymousPhones\.deleting\) \{[\s\S]*\} else \{[\s\S]*anonymous_phones_to_forget/.test(route),
      '  …one call: the delete, or the count, never both')

    // The privacy notice prints FORGET_RULE; the SQL is what runs. One rule.
    ok(code.includes(`interval '${FORGET_RULE.noEventDays} days'`), `069 forgets a phone with no event after ${FORGET_RULE.noEventDays} days, as FORGET_RULE says`)
    ok(code.includes(`interval '${FORGET_RULE.unseenDays} days'`), `069 forgets a phone unseen ${FORGET_RULE.unseenDays} days, as FORGET_RULE says`)
    ok(code.includes(`::date - ${FORGET_RULE.afterEventDays})`), `069 waits ${FORGET_RULE.afterEventDays} days after the last event ends, as FORGET_RULE says`)
  }

  section('The privacy notice prints the rules, never types them')
  {
    const notice = read('app/privacy/page.tsx')
    for (const name of ['ATTEMPT_LIMITS', 'ATTEMPT_KEEP_HOURS', 'FORGET_RULE', 'FORGET_ANONYMOUS_PHONES', 'ORGANISER_HOURS']) {
      ok(new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '@/lib/membership'`).test(notice), `the notice imports ${name}`)
    }
    ok(/FORGET_ANONYMOUS_PHONES\s*\?/.test(notice), 'the notice says deletion is coming until the switch is on')
    ok(!/PIN is never sent to\s+us/.test(notice), 'the notice no longer says a PIN never reaches the server (/api/entry checks it)')
    ok(!/settings, for the\s+session/.test(notice), 'the notice no longer says an unlock lasts the session')
    ok(/ATTEMPT_KEEP_HOURS \* 60 \* 60 \* 1000/.test(read('app/api/cleanup/route.ts')), 'the nightly job clears wrong-PIN counts on ATTEMPT_KEEP_HOURS')
    ok(ATTEMPT_KEEP_HOURS * 2 >= 24 && (ATTEMPT_KEEP_HOURS * 2) % 24 === 0, 'twice the keep (a nightly job) is whole days, as the notice prints it')
  }

  section('The realtime question has its query')
  {
    ok(/pg_publication_tables[\s\S]*supabase_realtime[\s\S]*live_scores/.test(read('scripts/rls-check.sql')),
      'scripts/rls-check.sql asks whether live_scores is on the realtime channel')
  }
}

async function stageFourTests() {
  section('Stage 4: who changes the event (D65, D66) and the cap (D59)')
  {
    const pin = { adminPinSet: true, endDate: null }
    const open = { adminPinSet: false, endDate: null }
    const guest: Membership = { role: 'guest', playerId: null, organiserUntil: null }
    const organiser: Membership = { ...guest, organiserUntil: new Date(NOW.getTime() + 3_600_000).toISOString() }
    ok(!mayChangeEvent(guest, pin, NOW), 'a guest on an event with a PIN may not change the event')
    ok(mayChangeEvent(organiser, pin, NOW), '  …the organiser with the PIN may')
    ok(mayChangeEvent(guest, open, NOW), 'on an event with no PIN every member may, as now')
    ok(!mayChangeEvent({ ...guest, role: 'spectator' }, open, NOW), '  …but never a spectator')
    ok(!mayChangeEvent(guest, { ...open, endDate: '2026-09-01' }, NOW), '  …nor the field of an event read-only for 30 days past its end')
    eq(closeOrganiser(organiser).organiserUntil, null, 'shutting the padlock ends the twelve hours (D61)')
    eq(closeOrganiser(organiser).role, 'guest', '  …and leaves the phone what it was in the field')

    const series = (over: Record<string, unknown> = {}, perms: Record<string, unknown> = { add_rounds: true }) =>
      fieldOpenEnded({ kind: 'tournament', bracketSetup: { format: 'league', schedule: 'series', entry: 'organiser', ...over }, eventPermissions: perms })
    ok(series(), 'an ad hoc series whose field may add rounds is open-ended')
    ok(!series({}, { add_rounds: false }), '  …not once the organiser turns add_rounds off')
    ok(!series({ repeat: { every: 1, unit: 'week' } }), '  …nor a recurring series, made whole at creation')
    ok(!series({ schedule: 'continuous' }), '  …nor a continuous league')
    ok(!series({}, { add_rounds: 'true' }), '  …and a permission that is not a real true counts for nothing, as in the SQL')
    ok(!fieldOpenEnded({ kind: null, bracketSetup: null, eventPermissions: null }), '  …nor a trip')
    const ended = { adminPinSet: true, endDate: '2026-09-01' }
    ok(!mayWrite(guest, ended, NOW), 'the field of an event that ended in September reads only in November')
    ok(mayWrite(guest, { ...ended, openEnded: true }, NOW), '  …unless it is an open-ended series')
  }

  section('/api/entry: peek and close (D64, D61)')
  {
    const { store, members } = await world()
    await runEntry({ ...base, adminPin: ADMIN }, store, NOW)
    const peek = await runEntry({ ...base, peek: true }, store, NOW)
    eq(peek.body.ok && peek.body.role, 'organiser', 'peek says what the phone is')
    ok(peek.body.ok && !!peek.body.organiserUntil, '  …and when the twelve hours end')
    ok(!JSON.stringify(peek.body).match(/hash|[0-9a-f]{64}|s1\$/), '  …and nothing about the PIN')
    const shut = await runEntry({ ...base, close: true }, store, NOW)
    eq(shut.body.ok && shut.body.role, 'guest', 'close drops the phone back to what it was')
    eq(members.get('u1:trip-1')?.organiserUntil, null, '  …on the server')
    const stranger = await runEntry({ ...base, token: 'tok-u9', peek: true }, store, NOW)
    eq(stranger.body.ok && stranger.body.role, null, 'peek enters nobody')
    ok(!members.has('u9:trip-1'), '  …and writes nothing')
  }

  section('PINs stored salted and slow, upgraded on the next right PIN (D64)')
  {
    const { store, t } = await world()
    ok(/^[0-9a-f]{64}$/.test(t.adminHash!), 'an event made before stage 4 holds the plain hash')
    await runEntry({ ...base, adminPin: '0000' }, store, NOW)
    ok(/^[0-9a-f]{64}$/.test(t.adminHash!), '  …a wrong PIN changes nothing')
    await runEntry({ ...base, adminPin: ADMIN }, store, NOW)
    ok(t.adminHash!.startsWith('s1$'), '  …the right one re-stores it salted and slow, silently')
    ok((await verifyPin(ADMIN, t.adminHash)).ok, '  …and it still opens')
    const again = await runEntry({ ...base, token: 'tok-u2', adminPin: ADMIN }, store, NOW)
    eq(again.body.ok && again.body.role, 'organiser', '  …from any phone')
  }

  section('The door: the public PIN checked on the server, its cookie set there')
  {
    const { actions, t } = await world({ publicHash: await hashPasscode(PUBLIC) })
    const at = { code: 'gx7k2p', address: '203.0.113.9' }
    const ok1 = await runDoor({ ...at, pin: PUBLIC }, actions, NOW)
    eq(ok1.status, 200, 'the public PIN opens the door')
    ok(ok1.status === 200 && ok1.cookie === entryToken(t.publicHash!, 'GX7K2P') && ok1.cookie !== t.publicHash,
      '  …with a server-keyed token for a cookie, never the hash')
    ok(ok1.status === 200 && !ok1.body.organiser, '  …as the field')
    const asAdmin = await runDoor({ ...at, pin: ADMIN }, actions, NOW)
    ok(asAdmin.status === 200 && asAdmin.body.organiser, 'the admin PIN opens it too, and says so')
    eq((await runDoor({ ...at, pin: '9999' }, actions, NOW)).status, 403, 'a wrong PIN does not')
    for (let i = 0; i < 12; i++) await runDoor({ ...at, pin: '9999' }, actions, NOW)
    eq((await runDoor({ ...at, pin: PUBLIC }, actions, NOW)).status, 429, '  …and the door has the retry limit')
    const upgraded = await hashPin(PUBLIC, 'GX7K2P')
    ok(ok1.status === 200 && entryToken(upgraded, 'GX7K2P') === ok1.cookie, 'a PIN re-stored salted and slow keeps the same door token — nobody is sent back to the door')
  }

  section('The public PIN set, changed and taken off through the server (D65)')
  {
    const { actions, t } = await world()
    const ask = { token: 'tok-u1', code: 'GX7K2P', address: '203.0.113.10' }
    eq((await runSetPublicPin({ ...ask, adminPin: null, pin: '5678' }, actions, NOW)).status, 403, 'it asks for the admin PIN')
    eq((await runSetPublicPin({ ...ask, adminPin: '0000', pin: '5678' }, actions, NOW)).status, 403, '  …the right one')
    eq((await runSetPublicPin({ ...ask, adminPin: ADMIN, pin: ADMIN }, actions, NOW)).status, 400, 'the admin PIN itself is refused as the public one')
    eq((await runSetPublicPin({ ...ask, adminPin: ADMIN, pin: '12' }, actions, NOW)).status, 400, '  …and a PIN too short')
    const set = await runSetPublicPin({ ...ask, adminPin: ADMIN, pin: '5678' }, actions, NOW)
    eq(set.status, 200, 'with the admin PIN it is set')
    ok(t.publicHash!.startsWith('s1$') && (await verifyPin('5678', t.publicHash)).ok, '  …stored salted and slow')
    ok(set.status === 200 && set.cookie === entryToken(t.publicHash!, 'GX7K2P'), '  …and this phone let straight back in')
    eq((await runSetPublicPin({ ...ask, adminPin: ADMIN, pin: null }, actions, NOW)).status, 200, 'and taken off')
    eq(t.publicHash, null, '  …gone')
    const { actions: noPin } = await world({ adminHash: null })
    eq((await runSetPublicPin({ ...ask, token: 'tok-u5', adminPin: null, pin: '5678' }, noPin, NOW)).status, 403,
      'with no admin PIN, a phone that is not a member may not')
  }

  section('An ad hoc series\' end moved on by the field (D59, D65)')
  {
    const { store, actions, t } = await world({ endDate: '2026-11-01' })
    await runEntry(base, store, NOW)
    const ask = { token: 'tok-u1', code: 'GX7K2P' }
    eq((await runExtend({ ...ask, date: '2026-11-20' }, actions, NOW)).status, 403, 'a guest may not move an event\'s end')
    t.openEnded = true
    eq((await runExtend({ ...ask, date: '2026-11-20' }, actions, NOW)).status, 200, '  …but may when the field adds rounds')
    eq(t.endDate, '2026-11-20', '  …and the end moves on')
    await runExtend({ ...ask, date: '2026-11-05' }, actions, NOW)
    eq(t.endDate, '2026-11-20', '  …only ever later')
    eq((await runExtend({ ...ask, date: '2031-01-01' }, actions, NOW)).status, 400, '  …and never years ahead')
  }

  section('"Do players play in their teams?", answered through the server')
  {
    const { store, actions, cols } = await world()
    await runEntry(base, store, NOW)
    const ask = { token: 'tok-u1', code: 'GX7K2P', boardId: 'b1', together: false }
    eq((await runPlayTogether(ask, actions, NOW)).status, 403, 'a guest may not, while only the organiser opens sheets')
    cols.event_permissions = { set_tee_sheets: true }
    eq((await runPlayTogether(ask, actions, NOW)).status, 200, '  …may while anyone may open the sheets')
    eq(((cols.leaderboards as { teeTeams?: string }[])[0]).teeTeams, 'separate', '  …and the answer lands on that board')
    eq((await runPlayTogether({ ...ask, boardId: 'nope' }, actions, NOW)).status, 404, '  …and only on a board that exists')
  }
}

// ─── The organiser PIN / a trip's passcode, after creation ─────

async function adminPinTests() {
  section('The organiser PIN, or a trip\'s passcode, set, changed or taken off (trips on the events\' model)')
  const ask = (w: Awaited<ReturnType<typeof world>>, currentPin: string | null, pin: string | null, token = 'tok-u1') =>
    runSetAdminPin({ token, code: 'GX7K2P', currentPin, pin, address: '203.0.113.9' }, w.actions, NOW)
  {
    const w = await world()
    w.members.set('u2:trip-1', { role: 'player', playerId: P2, organiserUntil: later(HOUR).toISOString() })
    eq((await ask(w, null, '5678')).status, 403, 'a trip with a passcode asks for the current one')
    eq((await ask(w, '9999', '5678')).status, 403, '  …and refuses a wrong one')
    eq((await ask(w, ADMIN, '12')).status, 400, 'a new one must be 4 to 8 digits')
    const done = await ask(w, ADMIN, '5678')
    eq(done.status, 200, 'the right current passcode changes it')
    ok(!!w.t.adminHash && (await verifyPin('5678', w.t.adminHash)).ok && !(await verifyPin(ADMIN, w.t.adminHash)).ok,
      '  …stored salted and slow, the old one no longer opening it')
    eq(w.members.get('u2:trip-1')?.organiserUntil, null, '  …every other phone is organiser no longer')
    eq(w.members.get('u1:trip-1')?.organiserUntil, later(ORGANISER_MS).toISOString(), '  …and this phone is, for twelve hours')
    eq((await ask(w, '5678', null)).status, 200, 'a trip\'s passcode can be taken off')
    eq(w.t.adminHash, null, '  …and then the trip is anybody\'s to change, as the database has it')
  }
  {
    const w = await world({ adminHash: null })
    eq((await ask(w, null, '2468', 'tok-stranger')).status, 403, 'with none set, a phone that is not in the trip cannot set one')
    await runEntry(base, w.store, NOW)
    eq((await ask(w, null, '2468')).status, 200, '  …a member can: on a trip with no passcode every member is the organiser')
  }
  {
    // A legacy trip, finished more than 30 days ago, with no passcode: past
    // the cap nobody may change it — so only the lead player's phone may set
    // the first passcode, which makes it the organiser again.
    const w = await world({ adminHash: null, endDate: '2026-08-20' })
    w.members.set('u1:trip-1', { role: 'guest', playerId: null, organiserUntil: null })
    w.members.set('u2:trip-1', { role: 'player', playerId: P1, organiserUntil: null })
    w.members.set('u3:trip-1', { role: 'player', playerId: P2, organiserUntil: null })
    eq((await ask(w, null, '2468')).status, 403, 'past the 30-day cap, a guest cannot set the first passcode')
    eq((await ask(w, null, '2468', 'tok-u3')).status, 403, '  …nor a player who is not the lead player')
    eq((await ask(w, null, '2468', 'tok-u2')).status, 200, '  …the phone holding the lead player\'s name can')
    ok(!!w.t.adminHash, '  …and it is set')
    eq(w.members.get('u2:trip-1')?.organiserUntil, later(ORGANISER_MS).toISOString(), '  …that phone the organiser, uncapped, for twelve hours')
    const again = await world({ adminHash: null, endDate: '2026-08-20' })
    again.lead.id = null
    again.members.set('u2:trip-1', { role: 'player', playerId: P1, organiserUntil: null })
    eq((await ask(again, null, '2468', 'tok-u2')).status, 403, 'a trip with no lead player marked stays as it is')
  }
  {
    const w = await world()
    w.cols.kind = 'tournament'
    eq((await ask(w, ADMIN, null)).status, 400, 'an event\'s organiser PIN cannot be taken off')
    ok(!!w.t.adminHash, '  …and is still there')
  }
  {
    const w = await world({ publicHash: await hashPin(PUBLIC, 'GX7K2P') })
    eq((await ask(w, ADMIN, PUBLIC)).status, 400, 'the new organiser PIN cannot be the public PIN')
  }

  section('Trips wear the padlock, on the events\' model')
  const setup = read('app/golf/[root]/[tripCode]/setup/TripSetupClient.tsx')
  ok(/<OrganiserLock /.test(setup), 'Trip Setup carries the padlock in its header')
  ok(!/gig-owner|edit_permission|editPermission|isOwner/.test(setup), '  …and no longer reads the phone-that-made-it flag, or "who can edit"')
  ok(/<AdminPinCard /.test(setup), '  …where "Lead player only" is the passcode, set through the server')
  for (const f of ['app/dashboard/create/CreateTripForm.tsx', 'app/dashboard/create/CreateKnockoutForm.tsx', 'app/dashboard/create/CreateLeagueForm.tsx']) {
    ok(!/gig-owner/.test(read(f)), `${f} no longer marks the phone that made it`)
  }
  ok(!/isEvent\([^)]*\)\s*&&\s*setupRow\?\.settings_passcode_hash/.test(read('app/golf/[root]/[tripCode]/matchplay/page.tsx')),
    'a trip\'s bracket wears the padlock too, not only an event\'s')
  ok(/<AdminPinCard /.test(read('app/golf/[root]/[tripCode]/organiser/page.tsx')) && /<AdminPinCard /.test(read('app/run/[tripCode]/organiser/RunOrganiserClient.tsx')),
    'an event\'s and a challenge\'s organiser areas change their PIN the same way')
}

// ─── Forgot PIN (D67) ──────────────────────────────────────────

async function forgotPinTests() {
  section('Forgot PIN: a link emailed, once, for thirty minutes (D67)')
  const ADDRESS = 'organiser@example.com'
  const trips: ResetTrip[] = [
    { id: 'T1', code: 'RESET1', name: 'Autumn Open', kind: 'tournament', email: ADDRESS, publicHash: await hashPin('4321', 'RESET1') },
    { id: 'T2', code: 'NOMAIL', name: 'No Mail Cup', kind: 'tournament', email: null, publicHash: null },
  ]
  const resets = new Map<string, ResetRow & { createdAt: string }>()
  const members = new Map<string, Membership>()
  const attempts = new Map<string, AttemptWindow>()
  const sent: { to: string; text: string; html: string }[] = []
  let adminHash: string | null = null
  let sendWorks = true
  let failAt: string | null = null
  const store: ResetStore = {
    async userFromToken(t) { return t.startsWith('tok-') ? t.slice(4) : null },
    async tripByCode(code) { return trips.find(t => t.code === code) ?? null },
    async tripById(id) { return trips.find(t => t.id === id) ?? null },
    async countResets(tripId, since) { return [...resets.values()].filter(r => r.tripId === tripId && r.createdAt >= since).length },
    async insertReset(r) { resets.set(r.tokenHash, { tripId: r.tripId, expiresAt: r.expiresAt, usedAt: null, createdAt: clock.toISOString() }) },
    async findReset(h) { const r = resets.get(h); return r ? { tripId: r.tripId, expiresAt: r.expiresAt, usedAt: r.usedAt } : null },
    async claimReset(h, now) {
      const r = resets.get(h)
      if (!r || r.usedAt || r.expiresAt <= now) return false
      r.usedAt = now
      return true
    },
    async releaseReset(h) { const r = resets.get(h); if (r) r.usedAt = null },
    async setAdminHash(_t, h) { if (failAt === 'store-pin') throw new Error('db down'); adminHash = h },
    async endOrganisers(tripId) {
      if (failAt === 'end-organisers') throw new Error('db down')
      for (const [k, m] of members) if (k.endsWith(`|${tripId}`)) members.set(k, { ...m, organiserUntil: null })
    },
    async readMembership(u, t) { return members.get(`${u}|${t}`) ?? null },
    async writeMembership(u, t, m) { members.set(`${u}|${t}`, m) },
    async readAttempts(keys) { return new Map(keys.flatMap(k => (attempts.has(k) ? [[k, attempts.get(k)!] as const] : []))) },
    async writeAttempt(k, _t, w) { attempts.set(k, w) },
    async sendEmail(to, _subject, html, text) { if (!sendWorks) throw new Error('down'); sent.push({ to, text, html }); return true },
  }
  let clock = NOW
  const ask = (code: string, address = '1.1.1.1') => runAskReset({ code, address, origin: 'https://greendot.live' }, store, clock)
  const tokenIn = (text: string) => /\/reset-pin\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? ''

  const first = await ask('RESET1')
  eq(first.body, { ok: true, result: 'sent' }, 'asking says Sent')
  ok(!JSON.stringify(first).includes(ADDRESS), '  …and never carries the address')
  eq(sent.length, 1, '  …and one email went')
  eq(sent[0]?.to, ADDRESS, '  …to the address the event was made with')
  const token = tokenIn(sent[0]?.text ?? '')
  ok(token.length >= 32, '  …carrying a long random token')
  ok(!resets.has(token) && resets.has(resetTokenHash(token)), 'only the token\'s hash is stored')
  eq(resets.get(resetTokenHash(token))?.expiresAt, later(RESET_LINK_MINUTES * 60_000).toISOString(), 'the link works for thirty minutes')
  ok(!sent[0].text.match(/\b4321\b/), 'the email holds no PIN')

  const none = await ask('NOMAIL')
  eq(none.body, { ok: true, result: 'none', support: 'support@greendot.live' }, 'an event with no address says so and names the support address')
  eq((await ask('NOPE99')).status, 404, 'an unknown code is no event')

  sendWorks = false
  eq((await ask('RESET1', '2.2.2.2')).body, { ok: true, result: 'sent' }, 'a send that fails still says Sent')
  sendWorks = true
  await ask('RESET1', '3.3.3.3')
  const before = sent.length
  eq((await ask('RESET1', '4.4.4.4')).body, { ok: true, result: 'sent' }, 'a fourth ask in the hour is sent too')
  eq(sent.length, before + 1, '  …no cap per event: the email goes')
  clock = later(61 * 60_000)
  for (let i = 0; i < 10; i++) await ask('RESET1', '5.5.5.5')
  const capped = sent.length
  clock = later(62 * 60_000)
  resets.clear()
  eq((await ask('RESET1', '5.5.5.5')).body, { ok: true, result: 'sent' }, 'past ten from one network it still says Sent')
  eq(sent.length, capped, '  …and sends nothing')
  clock = NOW

  // A fresh link, then the reset itself.
  resets.clear(); attempts.clear(); sent.length = 0
  await ask('RESET1')
  const link = tokenIn(sent[0].text)
  const check = await runCheckReset({ resetToken: link }, store, NOW)
  eq(check.body, { ok: true, eventName: 'Autumn Open', code: 'RESET1', isTrip: false, hasPublicPin: true }, 'the page checks the link: the event, and nothing used up')
  ok(!JSON.stringify(check).includes(ADDRESS), '  …never the address')

  members.set('other|T1', { role: 'player', playerId: P1, organiserUntil: later(HOUR).toISOString() })
  members.set('third|T9', { role: 'guest', playerId: null, organiserUntil: later(HOUR).toISOString() })
  const save = (pin: string, again = pin, resetToken = link, token: string | null = 'tok-me') =>
    runSaveReset({ token, resetToken, pin, again }, store, NOW)

  eq((await save('12', '12')).status, 400, 'too short is refused')
  eq((await save('1234', '1235')).status, 400, 'two PINs that differ are refused')
  eq((await save('4321')).status, 400, 'the public PIN is refused')
  eq((await save('5678', '5678', link, null)).status, 401, 'a phone not signed in is refused')
  eq(adminHash, null, '  …and none of those changed anything')

  const done = await save('5678')
  eq(done.status, 200, 'the new PIN saves')
  ok(!!adminHash && (await verifyPin('5678', adminHash)).ok && !(adminHash as string).includes('5678'), '  …stored salted and slow, never as typed')
  eq(members.get('other|T1')?.organiserUntil, null, '  …every other phone in the event is organiser no longer')
  eq(members.get('third|T9')?.organiserUntil, later(HOUR).toISOString(), '  …another event\'s phones untouched')
  eq(members.get('me|T1')?.organiserUntil, later(ORGANISER_MS).toISOString(), '  …and this phone is organiser for twelve hours')
  if (done.status === 200) {
    eq(done.body.home, '/golf/event/RESET1', '  …landing on the event’s home page')
    ok(!!done.cookie, '  …past the event\'s public PIN too')
  }
  eq((await save('9999')).status, 410, 'the same link refuses a second use')
  eq((await runCheckReset({ resetToken: link }, store, NOW)).status, 410, '  …and the page says it has been used')

  resets.clear(); sent.length = 0; attempts.clear()
  await ask('RESET1')
  const late = tokenIn(sent[0].text)
  eq((await runCheckReset({ resetToken: late }, store, later(RESET_LINK_MINUTES * 60_000 + 1))).status, 410, 'a link past thirty minutes has expired')
  // A save that fails after the link was spent gives the link back and says where.
  {
    const again = await ask('RESET1', '9.9.9.9')
    ok(again.status === 200, 'a fresh link is asked for')
    const t2 = tokenIn(sent[sent.length - 1].text)
    failAt = 'end-organisers'
    let caught: unknown = null
    try { await runSaveReset({ token: 'tok-me', resetToken: t2, pin: '2468', again: '2468' }, store, clock) } catch (e) { caught = e }
    ok(caught instanceof SaveStepError && caught.step === 'end-organisers', 'a failing save names the step it was on')
    eq((await runCheckReset({ resetToken: t2 }, store, clock)).status, 200, '  …and the link is given back, still good for another try')
    failAt = null
    eq((await runSaveReset({ token: 'tok-me', resetToken: t2, pin: '2468', again: '2468' }, store, clock)).status, 200, '  …and the second try saves')
  }
  eq((await runSaveReset({ token: 'tok-me', resetToken: late, pin: '2468', again: '2468' }, store, later(RESET_LINK_MINUTES * 60_000 + 1))).status, 410,
    '  …and saves nothing')
  eq((await runCheckReset({ resetToken: 'made-up-token-made-up-token-made-up' }, store, NOW)).status, 410, 'a made-up link is no link')

  eq(newPinIssue('123', '123'), 'Use 4 to 8 digits.', 'the reset page\'s words: length')
  eq(newPinIssue('1234', '4321'), 'The two PINs don’t match.', '  …and two that differ')

  section('Forgot PIN: the address never reaches a browser (D67)')
  const clientFiles = ['app/components/ForgotPin.tsx', 'app/components/OrganiserLock.tsx', 'app/components/InlineUnlock.tsx',
    'app/golf/[root]/[tripCode]/setup/PasscodeGate.tsx', 'app/reset-pin/[token]/ResetPinForm.tsx', 'app/reset-pin/[token]/page.tsx', 'lib/pinReset.ts']
  for (const f of clientFiles) ok(!/lead_email|leadEmail|\.email\b/.test(read(f)), `${f} names no event address`)
  const entryClient = read('lib/entryClient.ts')
  const resetHalf = entryClient.slice(entryClient.indexOf('Forgot PIN (D67)'))
  ok(resetHalf.length > 100 && !/email\b(?!\s+(the|a|was))/i.test(resetHalf.replace(/\/\/.*$|\*.*$/gm, '')), 'lib/entryClient.ts\'s reset half reads no address')
  ok(/linkOrigin/.test(read('app/api/event/forgot/route.ts')) && !/headers\.get\('host'\)/.test(read('app/api/event/forgot/route.ts')),
    'the emailed link\'s origin is fixed, never the request\'s Host')
  ok(/pin_resets/.test(read('app/api/cleanup/route.ts')), 'the nightly cleanup deletes old links')
}

async function main() {
  await routeTests()
  await stageFourTests()
  await forgotPinTests()
  await adminPinTests()
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
