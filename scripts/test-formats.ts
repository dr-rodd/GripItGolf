/**
 * Format wiring tests. Run with: npm run test:formats
 *
 * Covers the rules this phase depends on: formats are additive rather than a
 * single choice, matchplay is reached by a button rather than a leaderboard
 * tab, and the button's state depends on matchplay alone — never on what any
 * other format is doing.
 */

import {
  FORMATS, DEFAULT_FORMATS, parseFormats, enabledFormats, leaderboardTabs, isEnabled,
  type TripFormats,
} from '../lib/formats'
import { bracketBlockedReason, previewBracket, MIN_PLAYERS, MAX_BRACKET } from '../lib/matchplay'

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

/** The rule the leaderboard button uses. Mirrors TripLeaderboardClient. */
const matchplayButtonEnabled = (f: TripFormats) => isEnabled(f, 'individual_matchplay')

// ─── Additive, not exclusive ───────────────────────────────────

section('Formats are additive')
{
  const both: TripFormats = { individual_stableford: true, individual_matchplay: true }
  eq(enabledFormats(both).map(f => f.key),
    ['individual_stableford', 'individual_matchplay'],
    'stroke play and matchplay can both be on at once')

  const all: TripFormats = {
    individual_stableford: true, individual_strokes: true,
    individual_matchplay: true, teams: true,
  }
  eq(enabledFormats(all).length, 4, 'every format can be on simultaneously')

  // Turning one on must not turn another off
  const before: TripFormats = { individual_stableford: true }
  const after: TripFormats  = { ...before, individual_matchplay: true }
  ok(after.individual_stableford === true, 'enabling matchplay leaves stroke play on')
  eq(enabledFormats(after).length, 2, 'both remain enabled')

  // And turning one off leaves the rest alone
  const removed = { ...after }
  delete removed.individual_matchplay
  eq(enabledFormats(removed).map(f => f.key), ['individual_stableford'],
    'disabling matchplay leaves stroke play untouched')
}

section('Settings hold more than one format at a time')
{
  // Round-tripping through the database keeps every flag, not just the last
  const stored = { individual_stableford: true, individual_matchplay: true, teams: true }
  eq(enabledFormats(parseFormats(stored)).length, 3,
    'three formats survive a save and reload')
  eq(parseFormats(stored).individual_matchplay, true, 'matchplay flag survives')
  eq(parseFormats(stored).teams, true, 'teams flag survives')
}

// ─── Matchplay is a button, not a tab ──────────────────────────

section('Matchplay is routed, not tabbed')
{
  const mp = FORMATS.find(f => f.key === 'individual_matchplay')!
  eq(mp.dedicatedPage, true, 'matchplay is marked as having its own page')
  ok(FORMATS.filter(f => f.key !== 'individual_matchplay').every(f => !f.dedicatedPage),
    'no other format claims a dedicated page')

  const both: TripFormats = { individual_stableford: true, individual_matchplay: true }
  eq(leaderboardTabs(both).map(f => f.key), ['individual_stableford'],
    'matchplay does not appear as a leaderboard tab')
  ok(enabledFormats(both).some(f => f.key === 'individual_matchplay'),
    'but it is still an enabled format')

  const only: TripFormats = { individual_matchplay: true }
  eq(leaderboardTabs(only).length, 0, 'a matchplay-only trip has no tabs')
  ok(matchplayButtonEnabled(only), 'and its button is active')
}

// ─── The button depends on matchplay alone ─────────────────────

section('Button state is independent of other formats')
{
  // The stated edge case: stroke play enabled and in use, matchplay not on.
  const strokeOnly: TripFormats = { individual_stableford: true }
  ok(!matchplayButtonEnabled(strokeOnly),
    'stroke play enabled, matchplay off → button disabled')

  const strokesToo: TripFormats = { individual_stableford: true, individual_strokes: true }
  ok(!matchplayButtonEnabled(strokesToo),
    'two individual formats on, matchplay off → still disabled')

  const withTeams: TripFormats = { individual_stableford: true, teams: true }
  ok(!matchplayButtonEnabled(withTeams),
    'teams enabled, matchplay off → still disabled')

  // Only toggling matchplay itself changes it
  const enabled: TripFormats = { ...strokeOnly, individual_matchplay: true }
  ok(matchplayButtonEnabled(enabled),
    'toggling matchplay on activates the button')

  // Every combination of the other three leaves the button governed by matchplay
  const others = ['individual_stableford', 'individual_strokes', 'teams'] as const
  let independent = true
  for (let mask = 0; mask < 8; mask++) {
    const f: TripFormats = {}
    others.forEach((k, i) => { if (mask & (1 << i)) f[k] = true })
    if (matchplayButtonEnabled(f) !== false) independent = false
    if (matchplayButtonEnabled({ ...f, individual_matchplay: true }) !== true) independent = false
  }
  ok(independent,
    'across all 8 combinations of the other formats, only matchplay decides the button')
}

section('At least one format always survives')
{
  eq(parseFormats({}), DEFAULT_FORMATS, 'an empty object falls back to the default')
  eq(parseFormats(null), DEFAULT_FORMATS, 'null falls back to the default')
  eq(parseFormats({ nonsense: true }), DEFAULT_FORMATS, 'unknown keys fall back')
  eq(parseFormats({ individual_matchplay: true }).individual_matchplay, true,
    'a matchplay-only trip is preserved, not overridden by the fallback')
  ok(parseFormats({ individual_matchplay: true }).individual_stableford !== true,
    'and stroke play is not silently added to it')
}

// ─── Bracket preconditions shown in the panel ──────────────────

section('Bracket preconditions')
{
  eq(bracketBlockedReason(0), `Matchplay needs at least ${MIN_PLAYERS} players. This trip has 0.`,
    'zero players is blocked with a specific message')
  eq(bracketBlockedReason(1), `Matchplay needs at least ${MIN_PLAYERS} players. This trip has 1.`,
    'one player is blocked')
  eq(bracketBlockedReason(2), null, 'two players is allowed')
  eq(bracketBlockedReason(32), null, '32 players is allowed')
  ok(bracketBlockedReason(33)?.includes('up to 32') === true,
    '33 players is blocked with the limit named')

  eq(previewBracket(1), null, 'no preview below the minimum')
  eq(previewBracket(6)?.bracketSize, 8, '6 players previews a bracket of 8')
  eq(previewBracket(6)?.byeCount, 2, '6 players previews 2 byes')
  eq(previewBracket(6)?.roundNames, ['Quarter-Final', 'Semi-Final', 'Final'],
    '6 players previews the right rounds')
  eq(previewBracket(8)?.byeCount, 0, '8 players previews no byes')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
