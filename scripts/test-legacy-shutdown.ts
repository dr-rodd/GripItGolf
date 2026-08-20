/**
 * The legacy single-trip screens stay shut. Run with: npm run test:legacy
 *
 * The Donegal Masters fork's standalone screens never learned that trips
 * exist: they read — and some wrote — across every trip in the database at
 * once. One of them erased a live trip's committed scores while a different
 * trip was meant to be the target (August 2026): "Clear All Live Data"
 * collected every card ever opened on a *course* and deleted the committed
 * scores behind the lot, across every trip that had played there.
 *
 * Three things must stay true, and this suite greps for each:
 *
 *   · every legacy route redirects to the front door and mounts nothing
 *   · the platform-wide reset modal (delete every score in the database,
 *     password in the client bundle) stays deleted
 *   · the shared scoring dashboard's void is scoped to its round and goes
 *     through lib/scorecardVoid — never by course, never its own deletes
 */

import fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const section = (n: string) => console.log(`\n${n}`)

// ─── The legacy island is shut ─────────────────────────────────

const LEGACY_PAGES = [
  'app/scoring/page.tsx',
  'app/scoring/[slug]/page.tsx',
  'app/score-entry/page.tsx',
  'app/leaderboard/page.tsx',
  'app/leaderboard/individual/page.tsx',
  'app/live/page.tsx',
  'app/teams/page.tsx',
  'app/tee-times/page.tsx',
  'app/scorecard/[playerId]/page.tsx',
]

section('Every legacy route is a redirect and nothing more')
for (const page of LEGACY_PAGES) {
  const src = fs.readFileSync(page, 'utf-8')
  const name = page.replace('app/', '/').replace('/page.tsx', '') || '/'
  ok(src.includes("redirect('/')"), `${name} redirects to the front door`)
  ok(!src.includes('supabase'), `  …and no longer queries anything`)
  ok(!/import\s+\w+Client/.test(src) && !/import\s+\w+Form/.test(src),
    `  …and mounts no client component`)
}

section('The platform-wide reset modal stays deleted')
{
  ok(!fs.existsSync('app/components/SettingsModal.tsx'),
    'SettingsModal (Reset All Scores, across every trip) does not exist')
  ok(!fs.existsSync('app/components/SettingsButton.tsx'),
    'and nothing is left to mount it')
}

// ─── The shared dashboard voids its round, never its course ────

section('The scoring dashboard\'s void is scoped to the round')
{
  const src = fs.readFileSync('app/scoring/[slug]/CourseDashboardClient.tsx', 'utf-8')
  const fn = src.slice(
    src.indexOf('async function voidLiveSession'),
    src.indexOf('\n  }', src.indexOf('async function voidLiveSession')),
  )

  ok(fn.includes('.eq("round_id", roundId)'),
    'voidLiveSession collects cards by round id')
  ok(!fn.includes('.eq("course_id"'),
    '  …never by course — a course is shared between trips')
  ok(fn.includes('if (!roundId)'),
    '  …and refuses outright when it does not know its round')
  ok(fn.includes('voidScorecardData('),
    '  …and voids each card through lib/scorecardVoid, the one void path')

  // The wholesale deletes are gone from the whole file: committed scores
  // and handicap snapshots are only ever erased inside lib/scorecardVoid,
  // scoped to one card's own players.
  ok(!src.includes('from("scores").delete()'),
    'the dashboard writes no scores delete of its own')
  ok(!src.includes('from("round_handicaps").delete()'),
    'nor a round_handicaps delete')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
