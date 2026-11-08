// Trips at /golf/trip/<code>, events at /golf/event/<code>, run challenges at
// /run/<code> (Ross, 8 Nov 2026) — one set of pages, `app/golf/[root]/[tripCode]`,
// for both golf addresses (lib/tripPaths.ts).
//
// What this holds, because each is how it would quietly go wrong:
//   * nothing runs in front of the pages to make an address work — the first
//     attempt did (a proxy.ts) and greendot.live refused connections;
//   * the old /trip/ and /event/ addresses keep arriving, through Next's own
//     redirects;
//   * no link is built by hand, so none can point at the wrong root.

import fs from 'fs'
import path from 'path'
import { insideTrip, isTripRoot, rehomed, rootOf, tripBase, tripHomeAt } from '../lib/tripPaths'
import nextConfig from '../next.config'

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
const exists = (p: string) => fs.existsSync(path.join(root, p))

async function main() {
  section('Where a trip and an event live')
  {
    eq([rootOf('tournament'), rootOf(null), rootOf(undefined), rootOf('trip')], ['event', 'trip', 'trip', 'trip'],
      'an event (a tournament) lives under /golf/event/, anything else golf under /golf/trip/')
    eq([tripBase('GX7K2P', 'tournament'), tripBase('GX7K2P', null)], ['/golf/event/GX7K2P', '/golf/trip/GX7K2P'], 'its home address')
    eq([tripHomeAt('event', 'GX7K2P'), tripHomeAt('trip', 'GX7K2P'), tripHomeAt('nonsense', 'GX7K2P')],
      ['/golf/event/GX7K2P', '/golf/trip/GX7K2P', '/golf/trip/GX7K2P'], 'a page\'s home from the root it was opened at')
    eq([isTripRoot('trip'), isTripRoot('event'), isTripRoot('run'), isTripRoot('')], [true, true, false, false],
      'only trip and event are roots under /golf/')
    eq(rehomed('/golf/trip/GX7K2P/teesheet', '/golf/event/GX7K2P'), '/golf/event/GX7K2P/teesheet',
      'an event opened at its trip address is moved onto its own, the rest kept')
    eq([rehomed('/golf/event/GX7K2P', '/golf/event/GX7K2P'), rehomed('/golf', '/golf/event/GX7K2P'), rehomed('/run/GX7K2P', '/golf/trip/GX7K2P')],
      [null, null, null], '  …and an address already right, or not a trip\'s at all, is left alone')
    ok(insideTrip('/golf/event/GX7K2P/teams', 'GX7K2P') && insideTrip('/golf/trip/GX7K2P/teams', 'GX7K2P')
      && !insideTrip('/golf/trip/OTHER1/teams', 'GX7K2P') && !insideTrip('https://evil.example/', 'GX7K2P'),
      'a back link is trusted only inside this trip or event, under either root')
  }

  section('Real pages, nothing in front of them')
  {
    ok(exists('app/golf/[root]/[tripCode]/layout.tsx') && exists('app/golf/[root]/[tripCode]/page.tsx') && !exists('app/trip'),
      'both golf addresses are one set of pages under app/golf/[root]/[tripCode]')
    ok(exists('app/golf/page.tsx'), '  …beside the golf doorway at /golf, unchanged')
    ok(!exists('proxy.ts') && !exists('middleware.ts') && !exists('src/proxy.ts') && !exists('src/middleware.ts'),
      'no proxy or middleware — one took greendot.live down on 8 Nov 2026')
    const cfg = nextConfig as { rewrites?: unknown; redirects?: () => Promise<{ source: string; destination: string; permanent: boolean }[]> }
    ok(!cfg.rewrites, '  …and no rewrite either')
    const redirects = await cfg.redirects!()
    eq(redirects.map(r => [r.source, r.destination, r.permanent]), [
      ['/trip/:code/:path*', '/golf/trip/:code/:path*', false],
      ['/event/:code/:path*', '/golf/event/:code/:path*', false],
    ], 'the old /trip/ and /event/ addresses are sent on by Next\'s own redirects, the rest kept, never cached for good')
    const layout = read('app/golf/[root]/[tripCode]/layout.tsx')
    ok(layout.includes('if (!isTripRoot(root)) notFound()'), 'anything under /golf/ but trip or event is no page')
    ok(layout.includes('<AddressFix base={base} />') && layout.includes('<TripBaseProvider base={base}>') && layout.includes('base={base}'),
      'the layout hands the right home to the tab bar and every component, and puts the address bar right in place')
    ok(!/redirect\((?!`\/run\/|`\/enter\/)/.test(layout), '  …redirecting only a run challenge and an event behind its public PIN, as before')
    const fix = read('app/golf/[root]/[tripCode]/TripBase.tsx')
    ok(fix.includes('window.history.replaceState(null, \'\', fixed + search + hash)') && !fix.includes('router.replace'),
      'putting the bar right rewrites what it says and loads nothing')
  }

  section('Every way in lands on the right address')
  {
    ok(read('app/[code]/page.tsx').includes('tripBase(data.trip_code, kind)'), 'the short link sends a code to /golf/trip/, /golf/event/ or /run/')
    ok(read('app/api/trip-confirmation/route.ts').includes('tripBase(trip.trip_code, kindResult.data?.kind)'), 'the confirmation email links its own address')
    ok(read('app/enter/[tripCode]/page.tsx').includes('tripBase(tripCode, trip.kind)'), 'the public PIN door lets an event in at its own address')
    ok(read('app/Landing.tsx').includes('depart(`/${data.trip_code}`)') && read('app/join/JoinForm.tsx').includes('router.push(`/${data.trip_code}`)'),
      'the landing page and Join go through the short link')
    for (const f of ['CreateTripForm', 'CreateKnockoutForm', 'CreateLeagueForm']) {
      ok(read(`app/dashboard/create/${f}.tsx`).includes('href={tripBase(resultCode'), `${f}: the new trip or event opens at its own address`)
    }
  }

  section('No trip address is built by hand')
  {
    // The rule itself, and the two fallbacks that only stand in for it.
    const allowed = new Set([
      'lib/tripPaths.ts',
      'app/golf/[root]/[tripCode]/TripBase.tsx',
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
      .filter(f => !allowed.has(f) && /[`'"](\/golf)?\/(trip|event)\/\$\{/.test(strip(read(f))))
    for (const f of handBuilt) console.log(`    ${f}`)
    ok(handBuilt.length === 0, 'every link to a trip or event comes through tripBase, useTripBase or tripHomeAt')
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
