/**
 * Leaderboard name tests. Run with: npm run test:names
 *
 * lib/displayNames.ts is the one copy of what a board prints for a player:
 * their own nickname, or first name plus the start of the last, grown on
 * ties. The wiring matters as much as the rule — the nickname belongs to
 * the player in their preferences, not to whoever is arranging teams, and
 * the stored name never changes.
 */

import fs from 'fs'
import { MAX_NICKNAME, normalizeNickname, boardNames } from '../lib/displayNames'

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

/** Names (with optional nicknames) in, display names out, same order. */
const display = (...entries: { name: string; nick?: string }[]) => {
  const players = entries.map((e, i) => ({ id: `p${i}`, name: e.name, nickname: e.nick ?? null }))
  const map = boardNames(players)
  return players.map(p => map.get(p.id))
}
const n = (name: string, nick?: string) => ({ name, nick })

// ─── The nickname box ──────────────────────────────────────────

section('A typed nickname is cleaned, never trusted raw')
{
  eq(normalizeNickname('  Rossy  '), 'Rossy', 'trimmed at both ends')
  eq(normalizeNickname('Big   Dog'), 'Big Dog', 'inner whitespace folds')
  eq(normalizeNickname(''), null, 'blank means no nickname')
  eq(normalizeNickname('   '), null, 'so does whitespace alone')
  eq(normalizeNickname(null), null, 'null stays null')
  eq(normalizeNickname(undefined), null, 'undefined too')
  const long = normalizeNickname('x'.repeat(MAX_NICKNAME + 10))
  eq(long!.length, MAX_NICKNAME, 'a paste is capped at the box limit')
  ok(MAX_NICKNAME <= 12, 'and the limit is short — the point is saving space')
}

// ─── The default: first name and the start of the last ─────────

section('Without a nickname the board says first name and initial')
{
  eq(display(n('Ross Grady')), ['Ross G'], 'one player: first name and one letter')
  eq(display(n('Dave Smith'), n('Ross Grady')), ['Dave S', 'Ross G'],
    'the initial is always there, not only on ties')
  eq(display(n('Madonna')), ['Madonna'], 'a one-word name is already as short as it gets')
  eq(display(n('Ross van der Berg')), ['Ross v'],
    'everything after the first word is the surname')
}

section('Ties take more of the last name, together')
{
  eq(display(n('John Smith'), n('John Murphy')), ['John S', 'John M'],
    'one letter settles most ties')
  eq(display(n('John Smith'), n('John Smyth')), ['John Smi', 'John Smy'],
    'a shared start grows both names until they part ways')
  eq(display(n('Ross OGrady'), n('Ross OBrien')), ['Ross OG', 'Ross OB'],
    'grown together, so the clash reads evenly')
  eq(display(n('John Smith'), n('John Smith')), ['John Smith', 'John Smith'],
    'identical names print in full — the honest answer')
  eq(display(n('John Smith'), n('John Murphy'), n('Dave Ryan')),
    ['John S', 'John M', 'Dave R'],
    'a third player outside the clash is untouched by it')
}

section('A nickname wins, and stands outside the tie question')
{
  eq(display(n('Ross Grady', 'Big Dog'), n('Dave Smith')), ['Big Dog', 'Dave S'],
    'the nickname is what prints')
  eq(display(n('Ross Grady', 'Big Dog'), n('Ross Green')), ['Big Dog', 'Ross G'],
    'a nicknamed player causes no growth — their default is never shown')
  eq(display(n('Ross Grady', '   ')), ['Ross G'],
    'a blank nickname is no nickname, so the default stands')
}

// ─── The wiring ────────────────────────────────────────────────

section('The nickname belongs to the player, not to team selection')
{
  const teams = read('app/trip/[tripCode]/teams/TripTeamsClient.tsx')
  ok(!teams.includes('renamePlayer'), 'team selection no longer renames players')
  ok(!teams.includes('window.prompt'), '  …and carries no prompt for it')

  const prefs = read('app/components/PlayerSettings.tsx')
  ok(prefs.includes("select('nickname')"),
    'the preferences sheet reads the nickname on its own, fail-soft')
  ok(!prefs.includes("select('dark_mode, nickname')"),
    '  …never folded into the dark-mode read, which must survive migration 047 not having run')
  ok(prefs.includes('normalizeNickname'), 'and saves it through the normaliser')
  ok(/Save space on the leaderboard/.test(prefs), 'the ask says what it is for')
  ok(/player name doesn(&apos;|’|\x27)t\s+change/.test(prefs),
    '  …and promises the real name stays put')
}

section('The board prints the display name; the sheet keeps the full one')
{
  const page = read('app/trip/[tripCode]/leaderboard/page.tsx')
  ok(page.includes("select('id, nickname')"),
    'the page fetches nicknames on their own, fail-soft')

  const client = read('app/trip/[tripCode]/leaderboard/TripLeaderboardClient.tsx')
  ok(client.includes('boardNames('), 'the client asks lib/displayNames')
  ok(client.includes('boardNameById.get(row.id) ?? row.name'),
    'a player row prints its board name; a team row keeps its own')
  ok(client.includes('title={card.row.name}'),
    'the scorecard sheet keeps the full name — it has the room')

  const sql = read('supabase/migrations/20260101000047_player_nicknames.sql')
  ok(/ADD COLUMN IF NOT EXISTS nickname/.test(sql), 'migration 047 adds the column')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
