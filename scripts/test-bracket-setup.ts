/**
 * Bracket setup tests. Run with: npm run test:bracket-setup
 *
 * Two halves. The rules in lib/bracketSetup.ts are checked directly — the
 * sizes and their rounds, what a deadline may be, which questions are still
 * open, and that storage round-trips whole or not at all. Then the wiring:
 * the form stands behind the organiser PIN and events-only check, the saved
 * column is never named in a page's main select, and every write is scoped
 * to its trip.
 */

import fs from 'fs'
import {
  BRACKET_SIZES, BRACKET_MODES, PLAYER_ENTRIES, SEEDINGS, TOURNAMENT_FORMATS,
  type BracketSetup,
  roundsFor, bracketRoundNames, parseBracketSize, describeSize,
  normalizeEventCode, validEventCode, validDeadline, deadlinesIssue,
  unansweredSetup, isCompleteSetup, parseBracketSetup, describeSetup,
} from '../lib/bracketSetup'

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

// ─── Sizes and their rounds ────────────────────────────────────

section('Four sizes, each a power of two, each knowing its rounds')
{
  eq([...BRACKET_SIZES], [16, 32, 64, 128], 'the four sizes, in order')
  eq(roundsFor(16), 4, '16 players is 4 rounds')
  eq(roundsFor(32), 5, '32 is 5')
  eq(roundsFor(64), 6, '64 is 6')
  eq(roundsFor(128), 7, '128 is 7')

  eq(bracketRoundNames(16),
    ['Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'],
    'round names come from lib/matchplay.ts, first round first')
  eq(bracketRoundNames(128)[0], 'Round of 128', 'the big draw starts at 128')
  eq(bracketRoundNames(128).at(-1), 'Final', 'and every draw ends at the Final')

  eq(parseBracketSize(32), 32, 'a real size parses')
  eq(parseBracketSize('64'), 64, 'even as a stored string')
  eq(parseBracketSize(8), null, 'below the floor is refused')
  eq(parseBracketSize(256), null, 'above the ceiling too')
  eq(parseBracketSize(24), null, 'and anything that is not a power of two on the list')

  ok(describeSize(32).includes('32') && describeSize(32).includes('5'),
    'the size describes itself with its round count')
}

// ─── The qualifying event code ─────────────────────────────────

section('A qualifying code is held to the shape every trip code has')
{
  eq(normalizeEventCode(' gx7k2p '), 'GX7K2P', 'upper-cased and de-spaced')
  eq(normalizeEventCode(null), '', 'null is empty, never a crash')
  ok(validEventCode('GX7K2P'), 'six alphanumerics pass')
  ok(!validEventCode('GX7K2'), 'five do not')
  ok(!validEventCode('GX7K2PP'), 'seven do not')
  ok(!validEventCode('GX-K2P'), 'punctuation does not')
  ok(!validEventCode(''), 'empty does not')
}

// ─── Deadlines ─────────────────────────────────────────────────

section('A deadline is a real date, and the rounds cannot run backwards')
{
  ok(validDeadline('2026-09-01'), 'a plain date passes')
  ok(!validDeadline('2026-9-1'), 'unpadded is refused')
  ok(!validDeadline('2026-02-30'), 'a date that does not exist is refused')
  ok(!validDeadline('tomorrow'), 'words are refused')
  ok(!validDeadline(undefined), 'absent is refused')

  const four = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']
  eq(deadlinesIssue(four, 16), null, 'a full, ordered set is fine')
  eq(deadlinesIssue(['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01'], 16),
    null, 'rounds may share a day — a weekend settles two')
  ok(deadlinesIssue(four.slice(0, 3), 16)!.includes('Final'),
    'a missing round is named by its round, not its index')
  ok(deadlinesIssue(['2026-09-08', '2026-09-01', '2026-09-15', '2026-09-22'], 16)!
    .includes('cannot close before'),
    'a round closing before the one feeding it is refused')
  ok(deadlinesIssue([], 16) !== null, 'no deadlines at all is not a pass')
}

// ─── The open questions ────────────────────────────────────────

section('The form cannot finish until every question is answered')
{
  eq(unansweredSetup({}), ['League or match play'], 'the format comes first')
  eq(unansweredSetup({ format: 'league' }), ['League is not built yet'],
    'league is a dead end, not a path with more questions')

  const missing = unansweredSetup({ format: 'match_play' })
  eq(missing, ['Strict or relaxed', 'How big the bracket is', 'How players get in'],
    'match play opens the mode, size and entry questions — deadlines wait for a size')

  ok(unansweredSetup({
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
  }).some(q => q.includes('deadline')), 'a size brings its deadlines with it')

  ok(unansweredSetup({
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
    qualifying: { eventCode: 'BAD', seeding: 'seeded' },
  }).some(q => q.includes('qualifying')), 'an attached qualifier must carry a real code')

  const done: Partial<BracketSetup> = {
    format: 'match_play', mode: 'relaxed', size: 16, entry: 'self_join',
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'],
    finalized: false,
  }
  eq(unansweredSetup(done), [], 'a full setup has nothing open')
  ok(isCompleteSetup(done), 'and is complete')
  ok(!isCompleteSetup({ ...done, finalized: undefined }),
    'finalisation is an answer too — open is a choice, not a default')
}

// ─── Storage ───────────────────────────────────────────────────

section('Storage round-trips whole or not at all')
{
  const setup: BracketSetup = {
    format: 'match_play', mode: 'strict', size: 32, entry: 'self_join',
    qualifying: { eventCode: 'QX7K2P', seeding: 'seeded' },
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
    finalized: true,
  }
  eq(parseBracketSetup(JSON.parse(JSON.stringify(setup))), setup,
    'a complete setup reads back byte-for-byte')

  eq(parseBracketSetup(null), null, 'null is no setup — the un-migrated column')
  eq(parseBracketSetup('match_play'), null, 'a bare string is refused')
  eq(parseBracketSetup([]), null, 'so is an array')
  eq(parseBracketSetup({ format: 'league' }), null,
    'a stored league setup is refused until league is built')
  eq(parseBracketSetup({ ...setup, size: 24 }), null, 'a size off the list drops the lot')
  eq(parseBracketSetup({ ...setup, mode: 'chaotic' }), null, 'an unknown mode too')
  eq(parseBracketSetup({ ...setup, deadlines: setup.deadlines.slice(0, 4) }), null,
    'deadlines that no longer cover the rounds drop the lot — never half an answer')
  eq(parseBracketSetup({ ...setup, qualifying: { eventCode: 'QX7K2P' } }), null,
    'a qualifier without its seeding is refused')
  eq(parseBracketSetup({ ...setup, qualifying: { eventCode: 'short', seeding: 'seeded' } }),
    null, 'a qualifier with a broken code is refused')

  const noQual = parseBracketSetup({ ...setup, qualifying: undefined })
  ok(noQual !== null && !('qualifying' in noQual!),
    'no qualifying event is a normal setup, and the key stays off the object')

  const open = parseBracketSetup({ ...setup, finalized: 'yes' })
  eq(open?.finalized, false, 'finalized is exactly true or it is open')

  const trimmed = parseBracketSetup({
    ...setup,
    deadlines: [...setup.deadlines, '2026-10-06'],
  })
  eq(trimmed?.deadlines.length, 5, 'a spare deadline beyond the rounds is trimmed')
}

// ─── Naming ────────────────────────────────────────────────────

section('The organiser card says the setup in one line')
{
  const line = describeSetup({
    format: 'match_play', mode: 'relaxed', size: 32, entry: 'self_join',
    qualifying: { eventCode: 'QX7K2P', seeding: 'seeded' },
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'],
    finalized: false,
  })
  ok(line.includes('Match play'), 'the format leads')
  ok(line.includes('relaxed'), 'the mode is in it')
  ok(line.includes('32'), 'so is the size')
  ok(line.includes('QX7K2P'), 'and the qualifier it seeds off')
  ok(line.includes('open'), 'and whether it is still open')

  ok(describeSetup({
    format: 'match_play', mode: 'strict', size: 16, entry: 'organiser',
    deadlines: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'],
    finalized: true,
  }).includes('finalised'), 'a finalised setup says so')
}

// ─── The form offers what the model knows ──────────────────────

section('Every option the form offers is one the model can read back')
{
  ok(TOURNAMENT_FORMATS.some(f => f.key === 'league' && !f.built),
    'league is named and marked unbuilt — the second format the model anticipates')
  ok(TOURNAMENT_FORMATS.some(f => f.key === 'match_play' && f.built),
    'match play is named and built')
  eq(BRACKET_MODES.map(m => m.key), ['strict', 'relaxed'], 'the two modes')
  eq(PLAYER_ENTRIES.map(e => e.key), ['organiser', 'self_join'], 'the two entries')
  eq(SEEDINGS.map(s => s.key), ['random', 'seeded'], 'the two seedings')
}

// ─── Wiring ────────────────────────────────────────────────────

section('The form stands where it should and writes only what it owns')
{
  const page = read('app/trip/[tripCode]/organiser/bracket/page.tsx')
  ok(page.includes('PasscodeGate'), 'the bracket page stands behind the organiser PIN')
  ok(page.includes('isEvent'), 'and is events-only, like the rest of the organiser area')

  // The fail-soft rule the `kind` read established: a page's main select
  // never names a column a migration might not have added yet.
  const mainSelect = page.match(/select\('id, trip_code[^']*'\)/)?.[0] ?? ''
  ok(!mainSelect.includes('bracket_setup'),
    'the main trip select never names bracket_setup — the page must survive an un-migrated database')
  ok(page.includes("select('bracket_setup')"),
    'the setup rides in its own query, whose failure costs only the prefill')

  const form = read('app/trip/[tripCode]/organiser/bracket/BracketSetupForm.tsx')
  ok(form.includes(".eq('id', tripId)"), 'the save is scoped to its trip')
  ok(!form.includes('service_role') && !form.includes('SERVICE_ROLE'),
    'no service key anywhere near the browser')

  const organiser = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiser.includes('/organiser/bracket'), 'the organiser area is the door in')

  const organiserPage = read('app/trip/[tripCode]/organiser/page.tsx')
  const organiserTripSelect = organiserPage.match(/select\('id, trip_code[^']*'\)/)?.[0] ?? ''
  ok(!organiserTripSelect.includes('bracket_setup'),
    'the organiser page keeps bracket_setup out of its main select too')

  const migration = read('supabase/migrations/20260101000047_bracket_setup.sql')
  ok(migration.includes('ADD COLUMN IF NOT EXISTS bracket_setup jsonb'),
    'migration 047 adds the one jsonb column, idempotently')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
