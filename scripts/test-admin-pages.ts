/**
 * The admin area's structure. Run with: npm run test:admin-pages
 *
 * lib/adminAuth.ts is tested adversarially by test:admin — the crypto is
 * covered there. What that suite cannot see is whether the pages and actions
 * actually ask it. These are structural checks against the source, in the
 * test-scorecard-void style, each one guarding a specific way of getting the
 * area wrong:
 *
 *   · a page that queries before (or without) checking the cookie, so a
 *     failed login still touches the data
 *   · an action that mutates without re-verifying — the cookie gate on the
 *     page is no protection at all for the action, which is its own request
 *   · an admin file importing the anon client, which works today and breaks
 *     the day row-level security lands
 *   · the Donegal Masters settings page coming back — it called the
 *     service-role client from the browser and deleted across every trip
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const section = (n: string) => console.log(`\n${n}`)

const read = (p: string) => readFileSync(p, 'utf-8')

/** Every file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...filesUnder(p))
    else out.push(p)
  }
  return out
}

const adminFiles = filesUnder('app/admin')
const pages = adminFiles.filter(p => p.endsWith('page.tsx'))
const actionFiles = adminFiles.filter(p => p.endsWith('actions.ts'))

// ─── Every page gates before it fetches ────────────────────────

section('Every admin page checks the cookie before touching data')
{
  ok(pages.length >= 2, 'the admin pages are where this expects them')

  for (const p of pages) {
    const src = read(p)
    const isRedirect = src.includes("redirect('/admin") && !src.includes('createAdminClient')
    if (isRedirect) { ok(true, `${p} is a bare redirect — nothing to gate`); continue }

    const gate = src.indexOf('requireAdmin()')
    const query = src.indexOf('createAdminClient()')
    ok(gate >= 0, `${p} calls requireAdmin()`)
    ok(src.includes('<AdminLogin />'), `${p} falls back to the login screen`)
    if (query >= 0) {
      ok(gate >= 0 && gate < query,
        `${p} verifies the session before it creates a client`)
    }
  }
}

// ─── Every action re-verifies ──────────────────────────────────

section('Every admin action re-verifies the session before mutating')
{
  // login/logout are the two that legitimately run without a session.
  const exempt = new Set(['login', 'logout'])

  for (const p of actionFiles) {
    const src = read(p)
    const names = [...src.matchAll(/export async function (\w+)\(/g)].map(m => m[1])
    for (const name of names) {
      if (exempt.has(name)) continue
      const start = src.indexOf(`export async function ${name}(`)
      const next = src.indexOf('\nexport ', start + 1)
      const fn = src.slice(start, next < 0 ? src.length : next)

      const gate = fn.indexOf('requireAdmin()')
      ok(gate >= 0, `${p} · ${name} calls requireAdmin()`)
      const db = fn.indexOf('createAdminClient()')
      if (db >= 0) {
        ok(gate >= 0 && gate < db,
          `${p} · ${name} verifies before it creates a client`)
      }
    }
  }
  ok(true, `${actionFiles.length} action file(s) scanned`)
}

// ─── The right client ──────────────────────────────────────────

section('Admin reads and writes use the service-role client')
{
  // The anon client works for now, and stops working the day RLS lands. The
  // password already answered who is asking, so the service role is correct.
  for (const p of [...pages, ...actionFiles]) {
    const src = read(p)
    ok(!src.includes("from '@/lib/supabase'"),
      `${p} does not import the anon client`)
  }
}

// ─── The course editor plays by the directory's rules ──────────

section('The course editor validates with lib/courseDirectory, not its own copies')
{
  const p = 'app/admin/courses/[id]/actions.ts'
  if (existsSync(p)) {
    const src = read(p)
    // The comments are allowed to talk about the rules; the code is not
    // allowed to restate them.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const name of ['courseNameError', 'countyError', 'websiteError', 'normalizeWebsite', 'teeDraftError', 'parseTeeDraft']) {
      ok(code.includes(name), `${name} comes from the shared module`)
    }
    ok(code.includes("from '@/lib/courseDirectory'"), 'imported, not restated')
    ok(!code.includes('TEE_COLUMN_RANGE'),
      'the ranges are not read directly — teeDraftError already applies them')
    ok(!/\b(55|155)\b.*slope|slope.*\b(55|155)\b/.test(code),
      'no literal slope bounds — one copy, in lib/cardCheck.ts')
    ok(!code.includes('slug'),
      'a rename never touches the slug — scoring URLs and the directory hold it')
    ok(!code.includes("from('holes')"),
      'holes are never written here — the scorecard photo check is the one writer')
  } else {
    ok(false, `${p} exists`)
  }
}

// ─── Trip delete clears the restricts in order ─────────────────

section('deleteTrip clears every RESTRICT before the cascade')
{
  // The schema guards the live tables with ON DELETE RESTRICT, so the order
  // is not style — a step out of place and the delete stops halfway with the
  // trip half-gone. Structural, like the void checks: the failure needs a
  // database to demonstrate, but the order is visible in the source.
  const src = read('lib/tripDelete.ts')
  const fn = src.slice(src.indexOf('export async function deleteTrip'))

  const reads = fn.indexOf(".from('rounds').select")
  const composite = fn.indexOf("from('composite_holes')")
  const teeTimes = fn.indexOf("from('tee_times')")
  const liveRounds = fn.indexOf("from('live_rounds')")
  const rounds = fn.indexOf("\n  const rounds = await db")
  const tees = fn.indexOf("from('tees')")
  const trip = fn.indexOf("from('trips')")

  ok([reads, composite, teeTimes, liveRounds, rounds, tees, trip].every(i => i >= 0),
    'all seven steps are present')
  ok(reads < composite,
    'the rounds and courses are read before anything is deleted')
  ok(composite < liveRounds && teeTimes < liveRounds,
    'composite scorecards and tee times go before the scoring sessions')
  ok(liveRounds < rounds,
    'the scoring sessions go before the rounds — live_rounds.round_id is RESTRICT')
  ok(rounds < tees,
    'the rounds go before the tees — rounds.tee_id is RESTRICT')
  ok(tees < trip,
    'the tees go before the trip — tees.course_id holds any trip-scoped course')
  ok(fn.lastIndexOf("from('trips')") === trip && fn.slice(trip).includes('.delete()'),
    'the trip itself is the last delete, so a failure part-way leaves it listed')

  // Scoped, always: by this trip's id or its rounds' ids, never a bare table.
  const deletes = [...fn.matchAll(/\.delete\(\)/g)].map(m =>
    fn.slice(m.index, m.index + 120),
  )
  ok(deletes.length >= 6 && deletes.every(d => /\.(eq|in)\(/.test(d)),
    'every delete is scoped by an .eq or .in — no bare table deletes')
}

// ─── The gate itself ───────────────────────────────────────────

section('The gate is the thin thing it claims to be')
{
  const gate = read('app/admin/adminGate.ts')
  ok(gate.includes('verifySession('), 'requireAdmin defers to lib/adminAuth')
  ok(gate.includes('ADMIN_COOKIE'), 'and reads the one cookie')
  ok(!gate.includes('createAdminClient'), 'and touches no data itself')

  const auth = read('lib/adminAuth.ts')
  ok(!auth.includes('next/headers'),
    'lib/adminAuth stays pure — no Next imports, so test:admin keeps working')
}

// ─── The login still sets the cookie safely ────────────────────

section('Login sets the cookie the way the gate expects')
{
  const actions = read('app/admin/actions.ts')
  ok(actions.includes('httpOnly: true'), 'httpOnly — never readable from JavaScript')
  ok(actions.includes("path: '/admin'"), 'scoped to the admin routes')
  ok(actions.includes('newSession('), 'signed, not a bare flag')
}

// ─── The dead settings page stays dead ─────────────────────────

section('The Donegal Masters settings page stays deleted')
{
  // It hardcoded a password in the bundle and called the service-role client
  // from a "use client" file to run unscoped cross-trip deletes. It only ever
  // failed to work because the key is not NEXT_PUBLIC_. Nothing may bring it
  // back.
  ok(!existsSync('app/settings'), 'app/settings does not exist')

  // And nothing outside the server imports the admin client. A "use client"
  // file with this import is the same mistake starting again.
  const offenders: string[] = []
  for (const dir of ['app', 'lib']) {
    for (const p of filesUnder(dir)) {
      if (!/\.(ts|tsx)$/.test(p)) continue
      const src = read(p)
      if (src.includes("'use client'") && src.includes('supabase-admin')) offenders.push(p)
    }
  }
  ok(offenders.length === 0,
    `no client component imports the service-role client${offenders.length ? ` (${offenders.join(', ')})` : ''}`)
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} failed`)
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
