/**
 * The server's event reader. Run with: npm run test:event-reader
 *
 * Row-level security, stage 2 (lib/eventReader.ts). Two halves:
 *
 *   · the reader itself, run against a stand-in database that records every
 *     query it is sent — each table fixed to the one event, the id and the
 *     round ids read once and early, reads only, unknown tables refused;
 *   · the wiring, by reading the source — no server page reads on the
 *     browser's key any more, no browser file can reach the reader, and every
 *     table a server page names is one the reader knows how to fix.
 */

import fs from 'fs'
import { makeEventReader, scopeOf, SCOPES, type Reads } from '../lib/eventReader'
import { legacyPinHash as hashPasscode } from '../lib/pinHash'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key'
import { ATTEMPT_LIMITS, type AttemptWindow } from '../lib/membership'
import { runSeed, type SeedDeps, type SeedTrip } from '../app/api/event/seed/seed'

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

// ─── A stand-in database ───────────────────────────────────────

type Sent = { table: string; calls: [string, unknown[]][] }
type Answer = { data: unknown; error: unknown; count?: number | null }

/** Records every query the reader sends; `answer` decides what comes back. */
function standIn(answer: (q: Sent) => Answer) {
  const sent: Sent[] = []
  const admin = {
    from(table: string) {
      const q: Sent = { table, calls: [] }
      const builder: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            sent.push(q)
            const a = answer(q)
            return (ok: (v: Answer) => unknown) => Promise.resolve(a).then(ok)
          }
          if (typeof prop !== 'string') return undefined
          return (...args: unknown[]) => { q.calls.push([prop, args]); return builder }
        },
      })
      return builder
    },
  } as unknown as Reads
  return { admin, sent }
}

const TRIP = 'trip-aaaa', OTHER_ROUNDS = ['r9']
const filtersOf = (q: Sent) => q.calls.filter(([m]) => m === 'eq' || m === 'in').map(([m, a]) => `${m}:${String(a[0])}=${JSON.stringify(a[1])}`)

/** A small world: the event GX7K2P, two rounds. */
function world(opts: { roundsFail?: boolean; noEvent?: boolean } = {}) {
  return standIn(q => {
    if (q.table === 'trips') {
      if (opts.noEvent) return { data: null, error: null }
      const wantsId = (q.calls[0]?.[1][0] as string).split(',').map(s => s.trim()).some(c => c === 'id' || c === '*')
      return { data: wantsId ? { id: TRIP, kind: 'tournament' } : { kind: 'tournament' }, error: null }
    }
    if (q.table === 'rounds' && filtersOf(q).some(f => f.startsWith('eq:trips.trip_code'))) {
      if (opts.roundsFail) return { data: null, error: { message: 'down' } }
      return { data: [{ id: 'r1' }, { id: 'r2' }], error: null }
    }
    return { data: [], error: null, count: 0 }
  })
}

async function readerTests() {
  section('Every query is fixed to the one event')
  {
    const { admin, sent } = world()
    const db = makeEventReader('GX7K2P', admin)
    const trip = await db.from('trips').select('id, kind').eq('trip_code', 'GX7K2P').single()
    eq((trip.data as { id: string }).id, TRIP, 'the trip reads as it always did')
    ok(filtersOf(sent.find(q => q.table === 'trips')!).includes('eq:trip_code="GX7K2P"'), 'trips: fixed to the code')

    await db.from('players').select('id, name').eq('trip_id', 'someone-elses-trip')
    const players = sent.find(q => q.table === 'players')!
    ok(filtersOf(players).includes(`eq:trip_id="${TRIP}"`), 'a trip table: fixed to this event\'s id')
    ok(filtersOf(players).includes('eq:trip_id="someone-elses-trip"'),
      '  …and a page asking for another event\'s rows only narrows that to nothing — both filters stand')
    eq(sent.filter(q => q.table === 'trips').length, 1, '  …the id taken from the trip already read: no second lookup')

    await db.from('scores').select('player_id, round_id').in('round_id', OTHER_ROUNDS)
    const scores = sent.find(q => q.table === 'scores')!
    ok(filtersOf(scores).includes('in:round_id=["r1","r2"]'), 'a round table: fixed to this event\'s rounds')
    ok(filtersOf(scores).includes('in:round_id=["r9"]'), '  …alongside whatever the page asked')
    const lookups = sent.filter(q => q.table === 'rounds')
    eq(lookups.length, 1, 'the round ids are read once')
    ok(lookups[0].calls[0][1][0] === 'id, trips!inner(trip_code)' && filtersOf(lookups[0]).includes('eq:trips.trip_code="GX7K2P"'),
      '  …by the code, so they need not wait for the id')
    ok(sent.indexOf(lookups[0]) < sent.indexOf(players), '  …started with the page\'s first query, not after it')

    await db.from('live_scores').select('hole_number')
    eq(sent.filter(q => q.table === 'rounds').length, 1, '  …and shared by every later round table')

    await db.from('courses').select('id, name').in('id', ['c1'])
    eq(filtersOf(sent.find(q => q.table === 'courses')!), ['in:id=["c1"]'], 'the platform\'s course tables are read as they are')
  }

  section('The id when the page did not read it')
  {
    const { admin, sent } = world()
    const db = makeEventReader('GX7K2P', admin)
    await db.from('trips').select('kind').single()
    await db.from('teams').select('id')
    const trips = sent.filter(q => q.table === 'trips')
    eq(trips.length, 2, 'a trips read without the id: one lookup of it')
    eq(trips[1].calls[0][1][0], 'id', '  …asking for the id alone')
    ok(filtersOf(sent.find(q => q.table === 'teams')!).includes(`eq:trip_id="${TRIP}"`), '  …and the trip table fixed to it')
    await db.from('players').select('id')
    eq(sent.filter(q => q.table === 'trips').length, 2, '  …once: the next trip table needs no other')
  }

  section('An event that does not exist, or will not read')
  {
    const { admin, sent } = world({ noEvent: true })
    const db = makeEventReader('NOPE42', admin)
    const players = await db.from('players').select('id')
    eq(players.data, [], 'a trip table for no event: nothing, quietly')
    ok(!sent.some(q => q.table === 'players'), '  …and never asked of the database unfiltered')
    const one = await db.from('players').select('id').eq('id', 'x').maybeSingle()
    eq(one.data, null, '  …a single row asked for: null')
  }
  {
    const { admin, sent } = world({ roundsFail: true })
    const db = makeEventReader('GX7K2P', admin)
    const scores = await db.from('scores').select('round_id')
    ok(scores.error !== null && scores.data === null, 'the round ids unreadable: the round table answers with an error, as a failed read does')
    ok(!sent.some(q => q.table === 'scores'), '  …never sent without its filter')
  }

  section('Reads only, known tables only')
  {
    const { admin } = world()
    const db = makeEventReader('GX7K2P', admin)
    for (const w of ['insert', 'update', 'upsert', 'delete'] as const) {
      let threw = false
      try { (db.from('players') as unknown as Record<string, () => unknown>)[w]() } catch { threw = true }
      ok(threw, `.${w}() throws`)
    }
    let threw = false
    try { db.from('weather_cache') } catch (e) { threw = String(e).includes('SCOPES') }
    ok(threw, 'a table the reader does not know is refused, saying where to add it')
    let refused = false
    await Promise.resolve((db.from('players') as unknown as { eq: (...a: unknown[]) => PromiseLike<unknown> }).eq('trip_id', TRIP))
      .then(() => undefined, () => { refused = true })
    ok(refused, 'a query that does not start with select() is refused')
    const q = db.from('players').select('id')
    await q
    let late = false
    try { (q as unknown as { eq: (...a: unknown[]) => unknown }).eq('id', 'x') } catch { late = true }
    ok(late, 'nothing can be added to a query once it has run')
  }

  section('Every table the reader knows is fixed somehow')
  {
    for (const [table, scope] of Object.entries(SCOPES)) {
      ok(['trip-row', 'trip', 'round', 'platform'].includes(scope), `${table}: ${scope}`)
    }
    eq(scopeOf('runs'), null, 'runs are not the reader\'s — closed to everybody but their own server code')
    eq(scopeOf('player_contacts'), null, 'nor player contacts')
  }
}

// ─── Seeding from another event, on the server ────────────────

async function seedTests() {
  const NOW = new Date('2026-11-10T09:00:00Z')
  const ADMIN = '4321', PUBLIC = '1111'
  async function deps(trip: Partial<SeedTrip> = {}) {
    const t: SeedTrip = { id: 'T1', name: 'Summer 2026', kind: 'tournament', adminHash: await hashPasscode(ADMIN), publicHash: null, ...trip }
    const attempts = new Map<string, AttemptWindow>()
    let playersRead = 0
    const d: SeedDeps = {
      async trip(code) { return code === 'OLDKO1' ? t : null },
      async players() { playersRead++; return [{ id: 'p1', name: 'Ross', handicap: 12, gender: 'M' }] },
      attempts: {
        async readAttempts(keys) { return new Map(keys.filter(k => attempts.has(k)).map(k => [k, attempts.get(k)!])) },
        async writeAttempt(key, _t, w) { attempts.set(key, w) },
        async upgradePin() { /* re-stored on the server; nothing to see here */ },
      },
    }
    return { t, d, attempts, reads: () => playersRead }
  }
  const at = { address: '203.0.113.7' }

  section('Seeding from another event: read and checked on the server')
  {
    const { d } = await deps()
    eq((await runSeed({ ...at, code: 'bad' }, d, NOW)).status, 400, 'not a code')
    eq((await runSeed({ ...at, code: 'NOPE42' }, d, NOW)).status, 404, 'no such event')
    const out = await runSeed({ ...at, code: 'oldko1' }, d, NOW)
    eq(out.status, 200, 'an open event is found, any case')
    const body = out.body as { players?: unknown[]; adminLocked?: boolean }
    eq([body.players?.length, body.adminLocked], [1, true], '  …its players, and that it asks an organiser PIN')
    ok(!JSON.stringify(out.body).includes(await hashPasscode(ADMIN)), '  …never the PIN\'s hash')
  }
  {
    const { d } = await deps({ kind: 'run' })
    eq((await runSeed({ ...at, code: 'OLDKO1' }, d, NOW)).status, 422, 'a run challenge is refused, saying why')
  }
  {
    const pub = await hashPasscode(PUBLIC)
    const { d, attempts, reads } = await deps({ publicHash: pub })
    const ask = await runSeed({ ...at, code: 'OLDKO1' }, d, NOW)
    eq(ask.body, { needsPublicPin: true, name: 'Summer 2026' }, 'a public-PIN event asks for it')
    eq(reads(), 0, '  …and hands over no players until it is given')
    eq((await runSeed({ ...at, code: 'OLDKO1', publicPin: '2222' }, d, NOW)).status, 403, 'a wrong public PIN is refused')
    eq(attempts.size, 2, '  …and counted under /api/entry\'s retry limit')
    ok(!JSON.stringify((await runSeed({ ...at, code: 'OLDKO1', publicPin: '2222' }, d, NOW)).body).includes(pub), '  …the hash never in an answer')
    eq((await runSeed({ ...at, code: 'OLDKO1', publicPin: PUBLIC }, d, NOW)).status, 200, 'the right public PIN hands the field over')
    const admin = await runSeed({ ...at, code: 'OLDKO1', adminPin: ADMIN }, d, NOW)
    eq((admin.body as { adminOk?: boolean }).adminOk, true, 'the organiser PIN is checked, and opens the public door too')
    eq((await runSeed({ ...at, code: 'OLDKO1', adminPin: '0000', publicPin: PUBLIC }, d, NOW)).status, 403, 'a wrong organiser PIN is refused')
    for (let i = 0; i < ATTEMPT_LIMITS.address.max; i++) await runSeed({ ...at, code: 'OLDKO1', adminPin: '0000' }, d, NOW)
    eq((await runSeed({ ...at, code: 'OLDKO1', adminPin: ADMIN }, d, NOW)).status, 429, 'and the retry limit holds here as at the door')
  }
}

// ─── The wiring ────────────────────────────────────────────────

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? files(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : [])
}
const isClient = (src: string) => /^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*\s*['"]use client['"]/.test(src)

/**
 * Modules that import the browser's key and are not client files: stores the
 * browser runs (their writes are the browser's). Each read one a server page
 * calls takes a client, and the server hands it the reader.
 */
const BROWSER_STORES = new Set([
  'lib/teamMembers.ts', 'lib/matchplayStore.ts', 'lib/leagueRoundStore.ts', 'lib/roundHandicaps.ts',
  'lib/itineraryStore.ts', 'lib/scorecardVoid.ts', 'app/golf/[root]/[tripCode]/teams/teamWrites.ts',
])

function wiringTests() {
  const all = [...files('app'), ...files('lib')]

  section('No server page reads on the browser\'s key')
  for (const f of all) {
    const src = read(f)
    if (isClient(src)) continue
    if (!/from ['"](@\/lib\/supabase|\.\/supabase)['"]/.test(src)) continue
    ok(BROWSER_STORES.has(f), `${f} imports the browser's key — only the browser's own stores may`)
  }
  ok(!/from ['"]\.\/supabase['"]/.test(read('lib/hubStanding.ts')), 'the hub\'s standing reads through the reader it is handed')

  section('The browser cannot reach the reader')
  for (const f of all) {
    const src = read(f)
    if (!isClient(src)) continue
    ok(!/from ['"]@\/lib\/(eventReader|supabase-admin)['"]/.test(src) || /import type/.test(src.match(/.*lib\/eventReader.*/)?.[0] ?? ''),
      `${f} does not import the reader or the service role`)
  }

  section('Every table a server page reads is one the reader knows')
  for (const f of all) {
    const src = read(f)
    if (isClient(src) || !/\b(eventReader|Reads)\b/.test(src) || f === 'lib/eventReader.ts') continue
    for (const m of src.matchAll(/\bdb\s*\.from\(\s*([^)]*)\)/g)) {
      const arg = m[1].trim()
      const lit = /^['"]([a-z_]+)['"]$/.exec(arg)?.[1]
      if (lit) ok(scopeOf(lit) !== null, `${f}: "${lit}" is in SCOPES`)
      else ok(f.endsWith('scoring/page.tsx') && arg === 'table', `${f}: a table named at run time (${arg}) is one checked here`)
    }
  }
  section('A phone that has entered nothing asks the server about a code')
  for (const [f, route] of [['app/Landing.tsx', '/api/event/find'], ['app/join/JoinForm.tsx', '/api/event/find'], ['app/dashboard/create/SeedFromEvent.tsx', '/api/event/seed']]) {
    const src = read(f)
    ok(src.includes(route) && !/lib\/supabase['"]/.test(src), `${f} asks ${route}, not the database`)
    ok(!/passcode_hash|hashPasscode/.test(src) || f !== 'app/dashboard/create/SeedFromEvent.tsx', `  …and holds no PIN hash`)
  }
  ok(!/adminHash/.test(read('lib/fieldSeed.ts')), 'the seed keeps whether there is an organiser PIN, not its hash')

  ok(/table: 'scores' \| 'live_scores'/.test(read('app/golf/[root]/[tripCode]/scoring/page.tsx')),
    '  …the Scoring tab\'s one is scores or live_scores, both round tables')

  section('Helpers the browser shares are handed the reader on the server')
  for (const f of all) {
    const src = read(f)
    if (isClient(src) || BROWSER_STORES.has(f)) continue
    for (const m of src.matchAll(/\b(fetchMemberships|fetchEntrants)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      if (src.slice(Math.max(0, m.index! - 30), m.index!).includes('function')) continue
      ok(/,\s*(db|admin)\s*$/.test(m[2]), `${f}: ${m[1]}(…) is handed a client, never left on the browser's`)
    }
  }
}

async function main() {
  await readerTests()
  await seedTests()
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
