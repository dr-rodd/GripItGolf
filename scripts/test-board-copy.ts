/**
 * The golf leaderboard's shared server copy (lib/sharedCopy.ts, and its one
 * user, app/golf/[root]/[tripCode]/leaderboard/boardCopy.ts).
 *
 * A fake clock and a counting fake reader: how many times the database is
 * read is the whole point of the copy, so it is what these count.
 */
import fs from 'fs'
import { makeCopyKeeper } from '../lib/sharedCopy'

let passed = 0
let failed = 0
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.log(`  ✗ ${msg}`) }
}
function eq<T>(a: T, b: T, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`)
}
function section(name: string) { console.log(`\n${name}`) }
const read = (p: string) => fs.readFileSync(p, 'utf-8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const SECONDS = 10

/** A database that counts its reads, answers with a version number, and can be told to fail. */
function fakeDb() {
  const db = {
    reads: 0,
    version: 1,
    fail: false,
    read: (event: string) => async () => {
      db.reads++
      if (db.fail) throw new Error('database unavailable')
      return `${event} v${db.version}`
    },
  }
  return db
}

function fakeClock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, pass: (s: number) => { c.t += s * 1000 } }
  return c
}

function keeper(clock: ReturnType<typeof fakeClock>) {
  return makeCopyKeeper<string>({ maxAgeMs: SECONDS * 1000, holdMs: 10 * 60_000, now: clock.now })
}

async function main() {
  section('Two looks inside the window are one read')
  {
    const clock = fakeClock(), db = fakeDb(), k = keeper(clock)
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v1', 'the first look reads')
    db.version = 2
    clock.pass(9)
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v1', 'a look nine seconds later is shown the copy')
    eq(db.reads, 1, '  …and the database was read once')
  }

  section('A look after the window reads exactly once, and shows what it read')
  {
    const clock = fakeClock(), db = fakeDb(), k = keeper(clock)
    await k.look('GX7K2P', db.read('GX7K2P'))
    db.version = 2
    clock.pass(SECONDS)
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v2', 'a look at ten seconds is shown the new data, never the old copy')
    eq(db.reads, 2, '  …one read for that look, no second one behind it')
    clock.pass(3)
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v2', 'that read became the copy')
    eq(db.reads, 2, '  …so the look after it reads nothing')
    eq(k.held('GX7K2P')?.at, clock.t - 3000, 'the copy is stamped when its read started')
  }

  section('Looks that arrive while a read is out share it')
  {
    const clock = fakeClock(), db = fakeDb(), k = keeper(clock)
    const looks = await Promise.all(Array.from({ length: 100 }, () => k.look('GX7K2P', db.read('GX7K2P'))))
    ok(looks.every(l => l === 'GX7K2P v1'), 'a hundred phones at once all see the board')
    eq(db.reads, 1, '  …from one read')
  }

  section('A failed read is never kept')
  {
    const clock = fakeClock(), db = fakeDb(), k = keeper(clock)
    db.fail = true
    let threw = false
    try { await k.look('GX7K2P', db.read('GX7K2P')) } catch { threw = true }
    ok(threw, 'with no copy to fall back on, the failure is the answer — never an empty board')
    ok(k.held('GX7K2P') === undefined, '  …and nothing is held')
    db.fail = false
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v1', 'the next look reads again, at once')
    eq(db.reads, 2, '  …one read each')

    clock.pass(SECONDS)
    db.fail = true
    db.version = 2
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v1', 'with a copy held, a failed read shows the board it had')
    eq(k.held('GX7K2P')?.at, clock.t - SECONDS * 1000, '  …without making that copy any younger')
    db.fail = false
    eq(await k.look('GX7K2P', db.read('GX7K2P')), 'GX7K2P v2', '  …so the very next look reads again')
    eq(db.reads, 4, '  …and it was one read')

    const strict = makeCopyKeeper<string>({
      maxAgeMs: SECONDS * 1000, holdMs: 60_000, now: clock.now, fallBackOn: e => !String(e).includes('gone'),
    })
    await strict.look('GX7K2P', db.read('GX7K2P'))
    clock.pass(SECONDS)
    let gone = false
    try { await strict.look('GX7K2P', async () => { throw new Error('gone') }) } catch { gone = true }
    ok(gone, 'a failure the caller will not cover (an event no longer there) is never answered with the old copy')
  }

  section('Two events never share a copy')
  {
    const clock = fakeClock(), db = fakeDb(), k = keeper(clock)
    eq(await k.look('AAAAAA', db.read('AAAAAA')), 'AAAAAA v1', 'one event')
    eq(await k.look('BBBBBB', db.read('BBBBBB')), 'BBBBBB v1', 'another, read for itself rather than handed the first')
    eq(await k.look('AAAAAA', db.read('AAAAAA')), 'AAAAAA v1', 'and the first keeps its own')
    eq(db.reads, 2, '  …one read each')
  }

  section('A copy nobody looks at is let go')
  {
    const clock = fakeClock(), db = fakeDb(), k = keeper(clock)
    await k.look('AAAAAA', db.read('AAAAAA'))
    clock.pass(11 * 60)
    await k.look('BBBBBB', db.read('BBBBBB'))
    ok(k.held('AAAAAA') === undefined && k.held('BBBBBB') !== undefined, 'after ten minutes it is swept by the next read')
  }

  section('The leaderboard page reads through the copy, and only through it')
  {
    const copy = stripComments(read('app/golf/[root]/[tripCode]/leaderboard/boardCopy.ts'))
    const page = stripComments(read('app/golf/[root]/[tripCode]/leaderboard/page.tsx'))
    ok(/export const GOLF_BOARD_SECONDS = 10\b/.test(copy), 'GOLF_BOARD_SECONDS is ten, named once')
    ok(copy.includes('maxAgeMs: GOLF_BOARD_SECONDS * 1000'), '  …and is what the copy ages by')
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : [])
    const elsewhere = [...walk('app'), ...walk('lib')].filter(f => !f.endsWith('leaderboard/boardCopy.ts') && /GOLF_BOARD_SECONDS\s*=/.test(read(f)))
    eq(elsewhere, [], '  …with no second copy of the figure')
    ok(copy.includes('eventReader(tripCode)'), 'the copy is read through eventReader, so it only ever holds that event\'s rows')
    ok(copy.includes('keeper.look(tripCode, () => readBoard(tripCode))'), 'one copy per event, keyed by its code')
    ok(/fallBackOn: e => !\(e instanceof NoSuchBoard\)/.test(copy), 'an event that is not there is never shown from an old copy')
    ok(!/\.from\(|readScores<|readAllRows|eventReader|createAdminClient/.test(page), 'the page itself reads nothing')
    ok(page.includes('const copy = await boardCopy(tripCode)') && page.includes('if (!copy) notFound()'),
      'an unknown code is notFound, as it always was')
    ok(page.includes('if (copy.bracket) redirect(`${tripHome}/matchplay`)'), 'a knockout event still opens its bracket')
    ok(!/cookies\(|currentPlayer|headers\(/.test(copy), 'nothing about who is looking goes in the copy')
    ok(!/unstable_cache/.test(read('lib/sharedCopy.ts').replace(/\/\*[\s\S]*?\*\//g, '')),
      'not built on unstable_cache, which shows a stale copy while it refreshes behind')
    const poller = read('app/components/Poller.tsx')
    ok(poller.includes('const LIVE_MS = 15_000') && poller.includes('const IDLE_MS = 180_000'),
      'the poller is unchanged: fifteen seconds live, three minutes idle')
  }

  console.log(`\n${'─'.repeat(56)}`)
  if (failed === 0) console.log(`✓ all ${passed} checks passed`)
  else { console.log(`✗ ${failed} of ${passed + failed} checks failed`); process.exit(1) }
}

main()
