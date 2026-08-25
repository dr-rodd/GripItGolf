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

// ─── The default: the first name, alone ────────────────────────

section('Without a nickname the board says the first name, alone')
{
  eq(display(n('Ross Grady')), ['Ross'], 'no clash, no initial — shorter still')
  eq(display(n('Dave Smith'), n('Ross Grady')), ['Dave', 'Ross'],
    'different first names need nothing more')
  eq(display(n('Madonna')), ['Madonna'], 'a one-word name is already as short as it gets')
}

section('Only a duplicated first name reaches for the surname — together')
{
  eq(display(n('John Smith'), n('John Murphy')), ['John S', 'John M'],
    'one letter settles most ties')
  eq(display(n('John Smith'), n('John Smyth')), ['John Smi', 'John Smy'],
    'a shared start grows both names until they part ways')
  eq(display(n('John Smith'), n('John Smith')), ['John Smith', 'John Smith'],
    'identical names print in full — the honest answer')
  eq(display(n('John Smith'), n('John Murphy'), n('Dave Ryan')),
    ['John S', 'John M', 'Dave'],
    'a third player outside the clash is untouched by it')
}

section('Surnames are cut the way they are built')
{
  eq(display(n('Ross O’Grady'), n('Ross O’Brien')), ['Ross OG', 'Ross OB'],
    'an apostrophe name compacts — OG and OB, never a lone O’')
  eq(display(n("Ross O'Grady"), n('Ross Grady')), ['Ross OG', 'Ross G'],
    'straight apostrophes too, and the plain Grady stays a plain G')
  eq(display(n('John McDonald'), n('John Murphy')), ['John Mc', 'John Mu'],
    'Mc is one unit — never a bare M naming nobody')
  eq(display(n('John MacArthur'), n('John McDonald')), ['John Mac', 'John Mc'],
    'and Mac keeps its three, so the two read as the names they are')
  eq(display(n('John McDonald'), n('John McArthur')), ['John McD', 'John McA'],
    'two Mcs grow past the unit until they part ways')
}

section('A nickname wins, on every board, and stands outside the tie question')
{
  eq(display(n('Ross Grady', 'Big Dog'), n('Dave Smith')), ['Big Dog', 'Dave'],
    'the nickname is what prints')
  eq(display(n('Ross Grady', 'Big Dog'), n('Ross Green')), ['Big Dog', 'Ross'],
    'a nicknamed player causes no growth — their default is never shown')
  eq(display(n('Ross Grady', '   ')), ['Ross'],
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

section('Every leaderboard reads the same rule')
{
  // The in-play panel is a leaderboard: nicknames merged in by the page
  // that fetched its roster, printed through the one rule.
  const panel = read('app/scoring/LiveLeaderboardPanel.tsx')
  ok(panel.includes('boardNames('), 'the in-play panel asks lib/displayNames')
  ok(panel.includes('displayNameById.get(player.id) ?? player.name'),
    '  …and prints the board name, falling back to the real one')
  const scoringPage = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(scoringPage.includes("select('id, nickname')"),
    'the scoring page fetches nicknames on their own, fail-soft')

  // A round's result is a leaderboard too — and only rows that ARE a
  // player go through the rule; a team's name is nobody's to shorten.
  const roundPage = read('app/trip/[tripCode]/round/[roundNumber]/page.tsx')
  ok(roundPage.includes('nicknamesPromise'), 'the round result gets nicknames off the critical path')
  ok(roundPage.includes('r.playerIds.length === 1 && r.playerIds[0] === r.id'),
    '  …and shortens only player rows, never team names')

  // The matchplay tiles delegate rather than keeping a cousin of the rule.
  const entrants = read('lib/matchplayEntrants.ts')
  ok(entrants.includes('shortDisplayNames'), 'the bracket names come from the one copy')
  ok(!/lengthNeeded/.test(entrants), '  …the old cousin of the growth rule is gone')
  ok(entrants.includes('normalizeNickname(p.nickname) ?? firstName(p.name)'),
    'a nickname wins on a singles tile')
  ok(read('app/trip/[tripCode]/matchplay/page.tsx').includes("select('id, nickname')"),
    'the draw page fetches nicknames fail-soft')
  ok(read('lib/matchplayStore.ts').includes("select('id, nickname')"),
    'and so does the store behind the bracket')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
