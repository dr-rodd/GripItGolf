/**
 * Reading past Supabase's 1,000-row cap. Run with: npm run test:all-rows
 *
 * PostgREST stops a select at the project's Max rows and says nothing, so a
 * leaderboard, a run board or the nightly scorecard cleanup read in one go
 * is quietly short once an event is big enough. `lib/allRows.ts` reads in
 * pages; `lib/scoreReads.ts` holds the golf tables' orders and keys. Both
 * are exercised for real here against a fake table that enforces a cap of
 * its own — down to a cap of one row — and that can be written to while it
 * is being read, which is the case paging gets wrong. The structural checks
 * at the bottom are for what a behaviour test cannot see: that the screens
 * actually go through these, and that no new read sneaks round them.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  readAllRows, PAGE_ROWS, PARALLEL_PAGES, MAX_ROWS, type RangeableQuery,
} from '../lib/allRows'
import {
  readScores, readLiveScores, readRoundHandicaps, roundsWithScores,
} from '../lib/scoreReads'
import type { SupabaseClient } from '@supabase/supabase-js'

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
const read = (p: string) => readFileSync(p, 'utf-8')

// ─── A table that stops at a cap, as PostgREST does ────────────

type Row = { id: string }
const rowsOf = (n: number, prefix = 'r') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(6, '0')}` }))

type Fake = {
  query: () => RangeableQuery
  calls: [number, number][]
  maxInFlight: () => number
}

/**
 * `rows` is the table in query order. `cap` is the server's Max rows.
 * `beforeCall(i, rows)` runs as request i arrives — a write landing then.
 * `failOn` fails that request; `count` overrides (or with null, omits) it.
 */
function fakeTable(rows: Row[], opts: {
  cap?: number
  beforeCall?: (i: number, rows: Row[]) => void
  failOn?: number
  count?: number | null
} = {}): Fake {
  const cap = opts.cap ?? PAGE_ROWS
  const calls: [number, number][] = []
  let inFlight = 0, most = 0
  return {
    calls,
    maxInFlight: () => most,
    query: () => ({
      range(from: number, to: number) {
        const i = calls.length
        calls.push([from, to])
        opts.beforeCall?.(i, rows)
        // The answer is fixed now, as one SQL statement's would be.
        const data = rows.slice(from, Math.min(to + 1, from + cap)).map(r => ({ ...r }))
        const count = opts.count === undefined ? rows.length : opts.count
        inFlight++
        most = Math.max(most, inFlight)
        return new Promise(resolve => setTimeout(() => {
          inFlight--
          resolve(opts.failOn === i
            ? { data: null, error: { message: `page ${i} failed` }, count: null }
            : { data, error: null, count })
        }, 1))
      },
    }),
  }
}

const byId = (r: Row) => r.id
const ids = (rows: Row[] | null) => (rows ?? []).map(r => r.id)

async function run() {

// ─── The usual case costs what it always did ───────────────────

section('Under a page: one request, as before')
{
  const t = fakeTable(rowsOf(864))
  const got = await readAllRows<Row>(t.query, byId)
  eq(got.error, null, 'no error')
  eq(ids(got.data), ids(rowsOf(864)), 'every row, in the order asked for')
  eq(t.calls, [[0, PAGE_ROWS - 1]], 'exactly one request — a small trip pays nothing for this')

  const empty = fakeTable([])
  const none = await readAllRows<Row>(empty.query, byId)
  eq(none.data, [], 'an empty table is an empty list, not an error')
  eq(empty.calls.length, 1, 'and one request')

  const exact = fakeTable(rowsOf(PAGE_ROWS))
  await readAllRows<Row>(exact.query, byId)
  eq(exact.calls.length, 1, 'exactly a page is still one request')
}

// ─── Past the cap ──────────────────────────────────────────────

section('Past the cap: every row, the rest of the pages together')
{
  const rows = rowsOf(2500)
  const t = fakeTable(rows)
  const got = await readAllRows<Row>(t.query, byId)
  eq(got.data?.length, 2500, '2,500 rows come back 2,500, not 1,000')
  eq(ids(got.data), ids(rows), 'in order, none twice, none missing')
  eq(t.calls, [[0, 999], [1000, 1999], [2000, 2999]], 'pages abut exactly: no overlap, no gap')
  ok(t.maxInFlight() === 2, 'the two remaining pages went out together, not one after another')
}

section('A lower Max rows: the page is what the server sent')
{
  const rows = rowsOf(10)
  const t = fakeTable(rows, { cap: 3 })
  const got = await readAllRows<Row>(t.query, byId)
  eq(ids(got.data), ids(rows), 'a project capped at 3 still gets all 10')
  eq(t.calls, [[0, 999], [3, 5], [6, 8], [9, 11]],
    'after the first answer, pages are the size the server actually sends')

  const one = fakeTable(rowsOf(7), { cap: 1 })
  eq(ids((await readAllRows<Row>(one.query, byId)).data), ids(rowsOf(7)), 'even a cap of one row')
}

section('Many pages queue politely')
{
  const t = fakeTable(rowsOf(20), { cap: 1 })
  const got = await readAllRows<Row>(t.query, byId)
  eq(got.data?.length, 20, 'twenty one-row pages, all read')
  eq(t.maxInFlight(), PARALLEL_PAGES, `never more than ${PARALLEL_PAGES} pages in flight`)
}

// ─── A short read is a failed read ─────────────────────────────

section('Any page failing fails the read')
{
  const t = fakeTable(rowsOf(2500), { failOn: 2 })
  const got = await readAllRows<Row>(t.query, byId)
  eq(got.data, null, 'a page failing gives no rows at all — never the pages that worked')
  eq(got.error?.message, 'page 2 failed', 'and the error that failed it')

  const first = fakeTable(rowsOf(10), { failOn: 0 })
  const g2 = await readAllRows<Row>(first.query, byId)
  eq([g2.data, g2.error?.message], [null, 'page 0 failed'], 'the first page failing, likewise')
  eq(first.calls.length, 1, 'and nothing more is asked')
}

section('A query that forgot to ask for the count')
{
  const t = fakeTable(rowsOf(10), { count: null })
  const got = await readAllRows<Row>(t.query, byId)
  eq(got.data, null, 'refused, even when the rows happen to be complete')
  ok(/count: 'exact'/.test(got.error?.message ?? ''), 'and it says what is missing')
}

section('A read far bigger than anything here is refused, not taken')
{
  const t = fakeTable(rowsOf(5), { cap: 1, count: MAX_ROWS + 1 })
  const got = await readAllRows<Row>(t.query, byId)
  eq(got.data, null, `more than ${MAX_ROWS} rows is refused`)
  eq(t.calls.length, 1, 'before a single further page is asked for')
  ok(/ceiling/.test(got.error?.message ?? ''), 'and says why')

  const odd = fakeTable(rowsOf(5), { cap: 0 })
  eq((await readAllRows<Row>(odd.query, byId)).data, null,
    'a first page that is empty while the count says otherwise is a failure')
}

// ─── Written to while it is being read ─────────────────────────

section('A run logged between pages')
{
  // A row that sorts first arrives as the later pages are asked for: every
  // later page shifts one along, and the row at the boundary comes twice.
  let added = false
  const rows = rowsOf(10)
  const t = fakeTable(rows, {
    cap: 3,
    beforeCall: (i, r) => { if (i === 1 && !added) { added = true; r.unshift({ id: 'a-new' }) } },
  })
  const got = await readAllRows<Row>(t.query, byId)
  const got_ = ids(got.data)
  eq(new Set(got_).size, got_.length, 'nothing comes back twice')
  eq(got_.length, 11, 'the new row and all ten old ones')
  ok(got_.includes('a-new'), 'including the one that arrived mid-read')
  ok(t.calls.length > 4, 'the count moved, so the read was taken again')
}

section('A run deleted between pages')
{
  // The other way: a row before the boundary goes, every later page shifts
  // back one, and the row at the boundary is skipped — while the deleted one
  // is still in the first page. Only a second read gets this right.
  let gone = false
  const rows = rowsOf(10)
  const t = fakeTable(rows, {
    cap: 3,
    beforeCall: (i, r) => { if (i === 1 && !gone) { gone = true; r.splice(0, 1) } },
  })
  const got = await readAllRows<Row>(t.query, byId)
  eq(ids(got.data), ids(rowsOf(10).slice(1)),
    'the deleted run is gone and the one at the page boundary is not lost')
}

section('A run logged and another deleted, both between pages')
{
  // The count comes out the same, so only the rows themselves can say the
  // table moved: one arrives first, the last one goes, and the row at a page
  // boundary is handed back twice while another is never handed back.
  let done = false
  const t = fakeTable(rowsOf(10), {
    cap: 3,
    beforeCall: (i, r) => { if (i === 1 && !done) { done = true; r.unshift({ id: 'a-new' }); r.pop() } },
  })
  const got = await readAllRows<Row>(t.query, byId)
  eq(ids(got.data), ['a-new', ...ids(rowsOf(9))], 'read again, and right: the new run in, the deleted one out')
}

section('A table that never holds still')
{
  let n = 0
  const t = fakeTable(rowsOf(10), {
    cap: 3,
    beforeCall: (i, r) => { if (i > 0) r.unshift({ id: `w${n++}` }) },
  })
  const got = await readAllRows<Row>(t.query, byId)
  const got_ = ids(got.data)
  ok(got.error === null, 'it still answers')
  eq(new Set(got_).size, got_.length, 'with no row twice')
  ok(t.calls.length <= 2 * (1 + Math.ceil(30 / 3)), 'after at most two reads — it does not chase the writes')
}

// ─── The golf tables' orders are their unique keys ─────────────

section('Each golf table is ordered by, and keyed on, its UNIQUE constraint')
{
  type Call = { table: string; select?: [string, unknown]; ins: [string, unknown][]; orders: string[] }
  const log: Call[] = []
  const client = {
    from(table: string) {
      const call: Call = { table, ins: [], orders: [] }
      log.push(call)
      const b = {
        select(cols: string, opts?: unknown) { call.select = [cols, opts]; return b },
        in(col: string, v: unknown) { call.ins.push([col, v]); return b },
        eq(col: string, v: unknown) { call.ins.push([col, v]); return b },
        order(col: string) { call.orders.push(col); return b },
        range: () => Promise.resolve({ data: [], error: null, count: 0 }),
      }
      return b
    },
  } as unknown as SupabaseClient

  const uniqueOf = (file: string, table: string) => {
    const sql = read(`supabase/migrations/${file}`)
    const at = sql.search(new RegExp(`create table ${table} \\(`, 'i'))
    const body = sql.slice(at, sql.indexOf(');', at))
    const m = body.match(/unique\s*\(([^)]+)\)/i)
    return (m?.[1] ?? '').split(',').map(s => s.trim())
  }

  await readScores(client, 'player_id, round_id, hole_id', ['r1', 'r2'])
  await readLiveScores(client, 'player_id, round_id, hole_number', ['r1'])
  await readRoundHandicaps(client, 'round_id, player_id', ['r1'])
  const [scores, live, hcps] = log

  eq(scores.orders, uniqueOf('20260101000000_initial_schema.sql', 'scores'),
    'scores: ordered by (round_id, player_id, hole_id), its UNIQUE')
  eq(live.orders, uniqueOf('20260101000003_full_schema_v2.sql', 'live_scores'),
    'live_scores: ordered by (player_id, round_id, hole_number), its UNIQUE')
  eq(hcps.orders, uniqueOf('20260101000000_initial_schema.sql', 'round_handicaps'),
    'round_handicaps: ordered by (round_id, player_id), its UNIQUE')
  ok(log.every(c => (c.select?.[1] as { count?: string })?.count === 'exact'),
    'every one asks for the exact count')
  eq(scores.ins, [['round_id', ['r1', 'r2']]], 'and is scoped to the rounds asked for')
  eq([scores.table, live.table, hcps.table], ['scores', 'live_scores', 'round_handicaps'],
    'each reads its own table')
}

section('Two scores differing only in the hole are two rows')
{
  // A key that dropped a column would collapse a player's eighteen holes
  // into one whenever a read was de-duplicated.
  const pages = [
    [{ round_id: 'r', player_id: 'p', hole_id: 'h1' }],
    [{ round_id: 'r', player_id: 'p', hole_id: 'h2' }],
  ]
  let i = 0
  const client = {
    from: () => {
      const b = {
        select: () => b, in: () => b, order: () => b,
        range: () => Promise.resolve({ data: pages[i++] ?? [], error: null, count: 2 }),
      }
      return b
    },
  } as unknown as SupabaseClient
  const got = await readScores(client, 'round_id, player_id, hole_id', ['r'])
  eq(got.data?.length, 2, 'both holes kept')
}

section('Which rounds have scores — a failed count locks, never unlocks')
{
  const client = {
    from: () => {
      let id = ''
      const b = {
        select: () => b,
        eq: (_c: string, v: string) => { id = v; return b },
        then: (res: (v: unknown) => void) => res(
          id === 'played' ? { count: 54, error: null }
          : id === 'broken' ? { count: null, error: { message: 'no' } }
          : { count: 0, error: null }),
      }
      return b
    },
  } as unknown as SupabaseClient
  const got = await roundsWithScores(client, ['played', 'fresh', 'broken'])
  eq([...got.data].sort(), ['broken', 'played'],
    'a played round is locked, an unplayed one open, and one that could not be counted locked')
  eq(got.error?.message, 'no', 'with the failure handed back to log')
}

// ─── The screens go through it ─────────────────────────────────

section('No trip-wide score read goes round lib/scoreReads.ts')
{
  const files: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(f)) files.push(p)
    }
  }
  walk('app'); walk('lib')

  // `app/live/` is the legacy single-trip island, shut and redirecting
  // (test:legacy) — nothing there renders.
  // A header-only count (`head: true`) brings no rows back, so has no cap.
  const raw = /from\(\s*['"](scores|live_scores|round_handicaps)['"]\s*\)\s*\.select\((?![^)]*head:\s*true)[^)]*\)\s*\.in\(\s*['"]round_id/
  const offenders = files.filter(f =>
    f !== join('lib', 'scoreReads.ts') && !f.startsWith(join('app', 'live')) && raw.test(read(f)))
  eq(offenders, [], 'no select of scores, live_scores or round_handicaps across rounds outside scoreReads')

  // Every readAllRows call asks for the count and orders its rows.
  for (const f of files.filter(f => f !== join('lib', 'allRows.ts'))) {
    const src = read(f)
    let at = src.indexOf('readAllRows<')
    while (at !== -1) {
      const call = src.slice(at, at + 600)
      ok(/count: ['"]exact['"]/.test(call), `${f}: a readAllRows call asks for the exact count`)
      ok(/\.order\(/.test(call), `${f}: a readAllRows call orders its rows`)
      at = src.indexOf('readAllRows<', at + 1)
    }
  }

  const screens = [
    'app/trip/[tripCode]/leaderboard/page.tsx',
    'app/trip/[tripCode]/matchplay/page.tsx',
    'lib/hubStanding.ts',
  ]
  for (const s of screens) {
    const src = read(s)
    ok(/readScores</.test(src) && /readLiveScores</.test(src) && /readRoundHandicaps</.test(src),
      `${s} reads scores, live scores and handicaps whole`)
  }
  ok(/readScores</.test(read('app/trip/[tripCode]/export/page.tsx')), 'the export page reads its scores whole')
  ok(/readLiveScores</.test(read('app/scoring/LiveLeaderboardPanel.tsx')), 'the in-play board reads its round whole')
  ok(/readLiveScores</.test(read('app/scoring/[slug]/CourseDashboardClient.tsx')),
    'the scorecard list reads its holes whole')

  const setup = read('app/trip/[tripCode]/setup/page.tsx')
  ok(/roundsWithScores\(/.test(setup), 'Trip Setup counts per round which rounds are played')
  ok(!/from\('scores'\)\.select\('round_id'\)/.test(setup), 'and no longer reads every score to find out')
}

section('The whole-table jobs and the runs read in pages')
{
  for (const f of ['app/api/cleanup/route.ts', 'app/admin/live/page.tsx']) {
    const src = read(f)
    eq((src.match(/readAllRows</g) ?? []).length, 3, `${f}: all three live tables read in pages`)
    ok(!/from\(['"]live_scores['"]\)\.select\([^)]*\),/.test(src), `${f}: no bare select of live_scores left`)
  }

  const runs = read('app/run/[tripCode]/runs.ts')
  ok(/readAllRows</.test(runs), 'the runs read pages')
  ok(/\.order\('id'/.test(runs), 'and ends its order on id, so it is total')

  // The only other runs select is one runner's own Strava runs, which is
  // bounded by a person, not by the challenge.
  const strava = read('lib/stravaApi.ts')
  const sel = strava.indexOf(".select('strava_activity_id, run_date')")
  ok(sel !== -1 && strava.slice(sel, sel + 200).includes(".eq('player_id'"),
    "stravaApi's runs select is scoped to one runner")

  ok(/readAllRows</.test(read('app/components/usePlatformCourses.ts')), 'the course catalogue reads in pages')
  ok(/readAllRows</.test(read('app/trip/[tripCode]/teesheet/page.tsx')), 'the tee sheet reads its seats in pages')
}

// ─── Report ────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(56))
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}

}

run()
