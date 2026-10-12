/**
 * Strava sync tests. Run with: npm run test:strava
 *
 * lib/stravaApi.ts is the half of the Strava work that writes and deletes,
 * and it cannot be tried against Strava from the build container. So this
 * runs it for real against two stand-ins: an in-memory database that
 * answers the same query chains Supabase does (select, eq, neq, in,
 * maybeSingle, upsert on a conflict key, update, delete), and a fake Strava
 * that answers the four endpoints the code calls.
 *
 * What it pins is what would hurt if it went wrong: a sync writes the
 * challenge's runs and removes only the Strava runs it looked for; a webhook
 * touches only the athlete it names; a refused token refresh deletes
 * nothing; Disconnect takes only that runner's Strava runs in that
 * challenge, keeps their typed-in runs, and forgets the tokens only when the
 * account feeds nothing else; revoking on Strava forgets everything.
 */

import {
  syncLink, handleWebhook, disconnectRunner, accessToken,
} from '../lib/stravaApi'
import type { StravaConfig } from '../lib/strava'

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

// ─── A database that answers Supabase's query chains ───────────

type Row = Record<string, unknown>
type Db = Record<string, Row[]>

const KEYS: Record<string, string[]> = {
  strava_athletes: ['athlete_id'],
  strava_links: ['player_id'],
}

function fakeAdmin(db: Db) {
  return {
    from(table: string) {
      db[table] ??= []
      const filters: ((r: Row) => boolean)[] = []
      let op: 'select' | 'update' | 'delete' | 'upsert' = 'select'
      let payload: Row | Row[] | null = null
      let conflict: string[] = KEYS[table] ?? ['id']
      let countOnly = false

      const rows = () => db[table].filter(r => filters.every(f => f(r)))
      const run = () => {
        if (op === 'update') { for (const r of rows()) Object.assign(r, payload); return { data: null, error: null } }
        if (op === 'delete') { const gone = rows(); db[table] = db[table].filter(r => !gone.includes(r)); return { data: gone, error: null } }
        if (op === 'upsert') {
          for (const p of ([] as Row[]).concat(payload as Row | Row[])) {
            const hit = db[table].find(r => conflict.every(k => r[k] === p[k]))
            if (hit) Object.assign(hit, p)
            else db[table].push({ ...p })
          }
          return { data: null, error: null }
        }
        const found = rows()
        return countOnly ? { data: null, count: found.length, error: null } : { data: found, error: null }
      }

      const chain: Record<string, unknown> = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (opts?.head) countOnly = true; return chain },
        eq(col: string, v: unknown) { filters.push(r => r[col] === v); return chain },
        neq(col: string, v: unknown) { filters.push(r => r[col] !== v); return chain },
        in(col: string, vs: unknown[]) { filters.push(r => vs.includes(r[col])); return chain },
        order() { return chain },
        limit() { return chain },
        update(p: Row) { op = 'update'; payload = p; return chain },
        delete() { op = 'delete'; return chain },
        upsert(p: Row | Row[], o?: { onConflict?: string }) {
          op = 'upsert'; payload = p
          if (o?.onConflict) conflict = o.onConflict.split(',')
          return chain
        },
        maybeSingle() { const r = run() as { data: Row[] | null }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }) },
        single() { const r = run() as { data: Row[] | null }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }) },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej) },
      }
      return chain
    },
  } as never
}

// ─── A Strava that answers the four endpoints ──────────────────

type Fake = {
  activities: Row[]
  one: Record<number, { status: number; body?: Row }>
  refresh: number
  /** Which field Strava names when it refuses a refresh: the client, or the runner's token. */
  refreshRefuses: 'Application' | 'RefreshToken'
  /** What GET /athlete answers — 401 once a runner has really revoked access. */
  athlete: number
  calls: string[]
}
let strava: Fake
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  strava.calls.push(`${init?.method ?? 'GET'} ${url.replace(/\?.*/, '')}`)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (url.includes('/oauth/token')) {
    return strava.refresh === 200
      ? json(200, { access_token: 'new-access', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 21600 })
      : json(strava.refresh, { message: 'Bad Request', errors: [{ resource: strava.refreshRefuses, field: 'x', code: 'invalid' }] })
  }
  if (url.includes('/oauth/deauthorize')) return json(200, {})
  if (url.includes('/athlete/activities')) return json(200, strava.activities)
  if (/\/athlete$/.test(url)) return json(strava.athlete, { id: 42 })
  const m = url.match(/\/activities\/(\d+)$/)
  if (m) {
    const r = strava.one[Number(m[1])] ?? { status: 404 }
    return json(r.status, r.body ?? { message: 'Record Not Found' })
  }
  return json(404, {})
}) as typeof fetch

// ─── Fixtures ──────────────────────────────────────────────────

const cfg: StravaConfig = { clientId: '1', clientSecret: 'secret', verifyToken: 'v' }
const later = () => new Date(Date.now() + 3 * 3600_000).toISOString()
const act = (id: number, date: string, sport = 'Run', km = 5) =>
  ({ id, sport_type: sport, start_date_local: `${date}T07:00:00Z`, distance: km * 1000, moving_time: 1500 })

function world(): Db {
  return {
    trips: [
      { id: 'T1', start_date: '2026-11-01', end_date: '2026-11-30', kind: 'run' },
      { id: 'T2', start_date: '2026-11-01', end_date: '2026-11-30', kind: 'run' },
    ],
    strava_athletes: [
      { athlete_id: 42, access_token: 'a42', refresh_token: 'r42', expires_at: later() },
      { athlete_id: 77, access_token: 'a77', refresh_token: 'r77', expires_at: later() },
    ],
    strava_links: [
      { player_id: 'P1', trip_id: 'T1', athlete_id: 42, last_synced_at: null },
      { player_id: 'P9', trip_id: 'T2', athlete_id: 42, last_synced_at: null },   // same athlete, another challenge
      { player_id: 'P2', trip_id: 'T1', athlete_id: 77, last_synced_at: null },
    ],
    runs: [
      { id: 'm1', trip_id: 'T1', player_id: 'P1', source: 'manual', strava_activity_id: null, run_date: '2026-11-02' },
      { id: 's1', trip_id: 'T1', player_id: 'P1', source: 'strava', strava_activity_id: 100, run_date: '2026-11-03' },
      { id: 's2', trip_id: 'T1', player_id: 'P1', source: 'strava', strava_activity_id: 101, run_date: '2026-11-04' },
      { id: 's9', trip_id: 'T2', player_id: 'P9', source: 'strava', strava_activity_id: 100, run_date: '2026-11-03' },
      { id: 's3', trip_id: 'T1', player_id: 'P2', source: 'strava', strava_activity_id: 200, run_date: '2026-11-03' },
    ],
  }
}
const ids = (db: Db) => db.runs.map(r => r.id).sort()
const fresh = (): Fake => ({ activities: [], one: {}, refresh: 200, refreshRefuses: 'Application', athlete: 200, calls: [] })

;(async () => {
  section('A sync writes the challenge\'s runs and removes only what it looked for')
  {
    const db = world()
    strava = fresh()
    strava.activities = [act(100, '2026-11-03', 'Run', 6), act(102, '2026-11-06'), act(103, '2026-10-20'), act(104, '2026-11-07', 'Ride')]
    const written = await syncLink(fakeAdmin(db), cfg, { player_id: 'P1', trip_id: 'T1', athlete_id: 42 })
    eq(written, 2, 'two activities inside the challenge written')
    const p1 = db.runs.filter(r => r.player_id === 'P1' && r.trip_id === 'T1')
    ok(p1.some(r => r.strava_activity_id === 102 && r.source === 'strava'), 'the new run arrives as a Strava run')
    eq(p1.find(r => r.strava_activity_id === 100)?.distance_m, 6000, 'the edited distance is updated in place, not duplicated')
    eq(p1.filter(r => r.strava_activity_id === 100).length, 1, '  …once')
    ok(!p1.some(r => r.strava_activity_id === 101), 'the run Strava no longer lists is removed')
    ok(p1.some(r => r.id === 'm1'), 'the typed-in run is untouched')
    ok(db.runs.some(r => r.id === 's9') && db.runs.some(r => r.id === 's3'),
      'other challenges and other runners are untouched')
    ok(!!db.strava_links.find(l => l.player_id === 'P1')?.last_synced_at, 'and the link says when it was checked')
  }

  section('A refused token refresh deletes nothing')
  {
    const db = world()
    db.strava_athletes[0].expires_at = new Date(Date.now() - 60_000).toISOString()
    strava = fresh()
    strava.refresh = 401
    const before = ids(db)
    eq(await accessToken(fakeAdmin(db), cfg, 42), null, 'no usable token — a passing failure')
    eq(await syncLink(fakeAdmin(db), cfg, { player_id: 'P1', trip_id: 'T1', athlete_id: 42 }), null, 'the sync stops')
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'refresh-activity', athleteId: 42, activityId: 100 })
    eq(ids(db), before, 'every run is still there — a wrong key must never wipe the boards')
    eq(db.strava_athletes.length, 2, 'and nobody is forgotten')
  }

  section('A token about to run out is refreshed and stored')
  {
    const db = world()
    db.strava_athletes[0].expires_at = new Date(Date.now() + 60_000).toISOString()
    strava = fresh()
    eq(await accessToken(fakeAdmin(db), cfg, 42), 'new-access', 'the fresh token is used')
    eq(db.strava_athletes[0].refresh_token, 'new-refresh', 'and the new refresh token is kept — Strava rotates them')
  }

  section('Webhook events touch only the athlete they name')
  {
    let db = world()
    strava = fresh()
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'delete-activity', athleteId: 42, activityId: 100 })
    eq(ids(db), ['m1', 's2', 's3'], 'a deleted activity leaves every challenge that athlete feeds, and nothing else')

    db = world()
    strava = fresh()
    strava.one[105] = { status: 200, body: act(105, '2026-11-08', 'TrailRun', 10) }
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'refresh-activity', athleteId: 42, activityId: 105 })
    eq(db.runs.filter(r => r.strava_activity_id === 105).map(r => [r.trip_id, r.player_id, r.activity]).sort(),
      [['T1', 'P1', 'trail_run'], ['T2', 'P9', 'trail_run']], 'a new activity lands in both of that athlete\'s challenges')

    db = world()
    strava = fresh()
    strava.one[100] = { status: 404 }
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'refresh-activity', athleteId: 42, activityId: 100 })
    ok(!db.runs.some(r => r.strava_activity_id === 100), 'an activity gone or made private (404) leaves the boards')

    db = world()
    strava = fresh()
    strava.one[100] = { status: 500 }
    const before = ids(db)
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'refresh-activity', athleteId: 42, activityId: 100 })
    eq(ids(db), before, 'but Strava having a bad moment (500) removes nothing — the nightly sync tries again')

    db = world()
    strava = fresh()
    strava.one[100] = { status: 200, body: act(100, '2026-11-03', 'Ride') }
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'refresh-activity', athleteId: 42, activityId: 100 })
    ok(!db.runs.some(r => r.strava_activity_id === 100), 'a run re-typed as a ride leaves the boards')
  }

  section('Forged webhook events cannot erase anybody')
  {
    let db = world()
    strava = fresh()
    strava.one[100] = { status: 200, body: act(100, '2026-11-03') }
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'delete-activity', athleteId: 42, activityId: 100 })
    ok(db.runs.filter(r => r.strava_activity_id === 100).length === 2,
      'a "deleted" event for a run Strava still has keeps it — the delete is checked, not believed')

    db = world()
    strava = fresh()   // the runner's token still works: GET /athlete answers 200
    const before = ids(db)
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'deauthorize', athleteId: 42 })
    eq(ids(db), before, 'a "revoked" event Strava does not confirm erases nothing')
    eq(db.strava_athletes.length, 2, '  …and forgets nobody')

    db = world()
    db.strava_athletes[0].expires_at = new Date(Date.now() - 60_000).toISOString()
    strava = fresh()
    strava.refresh = 401
    strava.refreshRefuses = 'Application'   // our key is wrong, not their access
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'deauthorize', athleteId: 42 })
    eq(ids(db), before, 'nor does one we cannot check because our own key is refused')
  }

  section('Revoking on Strava, once Strava confirms it, forgets the athlete everywhere')
  {
    let db = world()
    strava = fresh()
    strava.refreshRefuses = 'RefreshToken'
    db.strava_athletes[0].expires_at = new Date(Date.now() - 60_000).toISOString()
    strava.refresh = 400
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'deauthorize', athleteId: 42 })
    eq(ids(db), ['m1', 's3'], 'confirmed by Strava refusing their refresh token by name: their Strava runs go')

    db = world()
    strava = fresh()
    strava.athlete = 401
    await handleWebhook(fakeAdmin(db), cfg, { kind: 'deauthorize', athleteId: 42 })
    eq(ids(db), ['m1', 's3'], 'every Strava run of theirs, in every challenge, is gone; typed-in runs stay')
    eq(db.strava_athletes.map(a => a.athlete_id), [77], 'their tokens are gone')
    ok(!strava.calls.some(c => c.includes('deauthorize')), 'and Strava is not asked to revoke what it already revoked')
  }

  section('Disconnect takes only this runner\'s Strava runs in this challenge')
  {
    const db = world()
    strava = fresh()
    await disconnectRunner(fakeAdmin(db), cfg, 'P1', 'T1')
    eq(ids(db), ['m1', 's3', 's9'], 'their Strava runs here go; typed-in runs, other challenges and other runners stay')
    ok(!db.strava_links.some(l => l.player_id === 'P1'), 'the link here goes')
    eq(db.strava_athletes.map(a => a.athlete_id).sort(), [42, 77],
      'the tokens stay — the same Strava account still feeds another challenge')
    ok(!strava.calls.some(c => c.includes('deauthorize')), '  …so Strava is not told to revoke')

    strava = fresh()
    await disconnectRunner(fakeAdmin(db), cfg, 'P9', 'T2')
    eq(db.strava_athletes.map(a => a.athlete_id), [77], 'disconnecting the last link forgets the tokens')
    ok(strava.calls.some(c => c === 'POST https://www.strava.com/oauth/deauthorize'), '  …and tells Strava to revoke')
  }

  globalThis.fetch = realFetch
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  · ${f}`)
    process.exit(1)
  }
})()
