// Events at /event/, trips at /trip/ (Ross, 8 Nov 2026) — one route tree,
// `app/trip/[tripCode]`, served at both (lib/tripPaths.ts, proxy.ts).
//
// What would quietly undo it: a link written as `/trip/${code}` again, which
// still works for an event (the layout redirects it) but costs a round trip
// and shows /trip/ in the address bar until it does. So the scan at the foot
// fails on any hand-built trip address outside the few places that are the
// rule itself.

import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { PATH_HEADER, ROOT_HEADER, insideTrip, rerooted, rootOf, rootOfPath, tripBase } from '../lib/tripPaths'
import { proxy, config } from '../proxy'

let passed = 0
let failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function eq<T>(a: T, b: T, label: string) {
  const same = JSON.stringify(a) === JSON.stringify(b)
  ok(same, same ? label : `${label} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`)
}
function section(name: string) { console.log(`\n${name}`) }

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

section('Where a trip and an event live')
{
  eq([rootOf('tournament'), rootOf(null), rootOf(undefined), rootOf('trip')], ['event', 'trip', 'trip', 'trip'],
    'an event (a tournament) lives under /event/, anything else golf under /trip/')
  eq([tripBase('GX7K2P', 'tournament'), tripBase('GX7K2P', null)], ['/event/GX7K2P', '/trip/GX7K2P'], 'its home address')
  eq([rootOfPath('/trip/GX7K2P/scoring'), rootOfPath('/event/GX7K2P'), rootOfPath('/run/GX7K2P'), rootOfPath('/tripod')],
    ['trip', 'event', null, null], 'which root an address asks for')
  eq(rerooted('/trip/GX7K2P/teesheet?round=r1&edit=2', 'event'), '/event/GX7K2P/teesheet?round=r1&edit=2',
    'an old link moved to the other root keeps the rest of itself')
  eq([rerooted('/event/GX7K2P', 'trip'), rerooted('/run/GX7K2P', 'event')], ['/trip/GX7K2P', '/run/GX7K2P'],
    '  …a bare home too; a run challenge is never moved')
  ok(insideTrip('/event/GX7K2P/teams', 'GX7K2P') && insideTrip('/trip/GX7K2P/teams', 'GX7K2P')
    && !insideTrip('/trip/OTHER1/teams', 'GX7K2P') && !insideTrip('https://evil.example/', 'GX7K2P'),
    'a back link is trusted only inside this trip or event, under either root')
}

section('proxy.ts: /event/ served from the trip pages, and both say what was asked')
{
  ok(config.matcher.includes('/event/:path+') && config.matcher.includes('/trip/:path+') && config.matcher.length === 2,
    'it runs on the two roots and nowhere else')
  const ev = proxy(new NextRequest('https://greendot.live/event/GX7K2P/scoring?round=r1&_rsc=abc'))
  const rewrite = ev.headers.get('x-middleware-rewrite') ?? ''
  ok(new URL(rewrite).pathname === '/trip/GX7K2P/scoring', 'an /event/ address is served from the trip tree')
  const passed1 = (name: string) => ev.headers.get(`x-middleware-request-${name}`)
  eq([passed1(ROOT_HEADER), passed1(PATH_HEADER)], ['event', '/event/GX7K2P/scoring?round=r1'],
    '  …telling the layout it was asked for as an event, at that address — the router\'s own _rsc left out')
  const tr = proxy(new NextRequest('https://greendot.live/trip/GX7K2P'))
  ok(!tr.headers.get('x-middleware-rewrite') && tr.headers.get(`x-middleware-request-${ROOT_HEADER}`) === 'trip',
    'a /trip/ address goes on as it is, saying so')
}

section('The trip layout puts a wrong root right; every page and link reads the right one')
{
  const layout = read('app/trip/[tripCode]/layout.tsx')
  ok(/if \(asked && path && asked !== want\) redirect\(rerooted\(path, want\)\)/.test(layout),
    'the layout sends an event\'s old /trip/ link to /event/, and a trip\'s /event/ link to /trip/')
  ok(layout.includes('<TripBaseProvider base={base}>') && layout.includes('base={base}'),
    '  …and hands the right home to the tab bar and every component under it')
  const kind = read('app/trip/[tripCode]/kind.ts')
  ok(/export const fetchTripBase = cache\(/.test(kind) && kind.includes('get(ROOT_HEADER)'),
    'a server page learns its home from what was asked, which the layout has already put right — no query')
  ok(read('app/[code]/page.tsx').includes('tripBase(data.trip_code, kind)'), 'the short link sends a code straight to its root')
  ok(read('app/api/trip-confirmation/route.ts').includes('tripBase(trip.trip_code, kindResult.data?.kind)'),
    'the confirmation email links an event at /event/')
  ok(read('app/enter/[tripCode]/page.tsx').includes('tripBase(tripCode, trip.kind)'), 'the public PIN door lets an event in at /event/')
}

section('No trip address is built by hand')
{
  // The rule itself, and the two fallbacks that only ever stand in for it.
  const allowed = new Set([
    'lib/tripPaths.ts',
    'app/trip/[tripCode]/TripBase.tsx',
    'app/components/TabBar.tsx',
    'app/actions/revalidate.ts',
  ])
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name)
      if (f.isDirectory()) { if (!['node_modules', '.next'].includes(f.name)) walk(p) }
      else if (/\.tsx?$/.test(f.name)) files.push(p)
    }
  }
  walk(path.join(root, 'app')); walk(path.join(root, 'lib'))
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const handBuilt = files
    .map(f => path.relative(root, f))
    .filter(f => !allowed.has(f) && /[`'"]\/trip\/\$\{/.test(strip(read(f))))
  for (const f of handBuilt) console.log(`    ${f}`)
  ok(handBuilt.length === 0, 'every link to a trip or event comes through tripBase, useTripBase or fetchTripBase')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
