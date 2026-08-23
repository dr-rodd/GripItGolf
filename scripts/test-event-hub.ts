/**
 * Event Hub tests. Run with: npm run test:event-hub
 *
 * Two halves. The rules in lib/eventHub.ts are checked directly — what
 * counts as an event, what survives of a typed notice, how a start is
 * described. Then the wiring: the hub only wears event clothes for a
 * tournament, the organiser area stands behind the PIN, and every write the
 * organiser can make is scoped to its trip.
 */

import fs from 'fs'
import {
  isEvent, normalizeNotice, MAX_NOTICE,
  parseStartFormat, describeStart, START_FORMAT_LABEL,
} from '../lib/eventHub'

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

// ─── What counts as an event ───────────────────────────────────

section('An event is a tournament, and nothing else is')
{
  ok(isEvent('tournament'), 'a tournament is an event')
  ok(!isEvent('trip'), 'a trip is not')
  // The fail-soft that lets the code deploy before migration 046 has run:
  // no column, no kind, no Event Hub — and no error.
  ok(!isEvent(undefined), 'an un-migrated database reads as a trip')
  ok(!isEvent(null), 'so does an explicit null')
  ok(!isEvent('Tournament'), 'the stored value is exact, not fuzzy')
}

// ─── Notices ───────────────────────────────────────────────────

section('A notice is cleaned the way the description is cleaned')
{
  eq(normalizeNotice('  Carts on the path today.  '),
    'Carts on the path today.', 'trimmed at both ends')
  eq(normalizeNotice(''), null, 'blank is null')
  eq(normalizeNotice('   \n  '), null, 'whitespace alone is null')
  eq(normalizeNotice(null), null, 'null stays null')
  eq(normalizeNotice(undefined), null, 'undefined is null')
  eq(normalizeNotice('a\r\nb'), 'a\nb', 'Windows newlines fold to plain ones')
  eq(normalizeNotice('a\n\n\n\nb'), 'a\n\nb', 'runs of blank lines fold to one break')

  const long = normalizeNotice('x'.repeat(MAX_NOTICE + 100))
  eq(long!.length, MAX_NOTICE, 'a paste is capped at the notice limit')
  ok(MAX_NOTICE < 500, 'and the notice cap is tighter than the description cap')
}

// ─── Start formats ─────────────────────────────────────────────

section('A start format is one of two words')
{
  eq(parseStartFormat('shotgun'), 'shotgun', 'shotgun parses')
  eq(parseStartFormat('tee_sheet'), 'tee_sheet', 'tee sheet parses')
  eq(parseStartFormat(null), null, 'null is no choice')
  eq(parseStartFormat(''), null, 'so is empty')
  eq(parseStartFormat('scramble'), null, 'and so is anything else')
  eq(parseStartFormat('SHOTGUN'), null, 'the stored value is exact')

  eq(START_FORMAT_LABEL.shotgun, 'Shotgun start', 'shotgun is named for a person')
  eq(START_FORMAT_LABEL.tee_sheet, 'Tee sheet', 'and so is the sheet')
}

section('The schedule line reads like the rest of the schedule')
{
  eq(describeStart(null, '09:30'), null, 'no format, no line — the tee-time wording stands')
  eq(describeStart(undefined, '09:30'), null, 'undefined the same')
  // The clock goes through describeTime, the same formatter every other
  // time on the schedule uses — "9:30 am", never a bare "09:30".
  eq(describeStart('shotgun', '09:30'), 'Shotgun start 9:30 am', 'a morning shotgun')
  eq(describeStart('shotgun', '13:05'), 'Shotgun start 1:05 pm', 'an afternoon one')
  eq(describeStart('shotgun', null), 'Shotgun start', 'a shotgun with no time yet still says so')
  eq(describeStart('tee_sheet', '09:30'), 'Tee sheet',
    'a tee sheet names itself and holds the times for the sheet to come')
}

// ─── The migration behind all of it ────────────────────────────

section('Migration 046 carries the three changes')
{
  const sql = read('supabase/migrations/20260101000046_events.sql')
  ok(/ALTER TABLE trips ADD COLUMN IF NOT EXISTS kind/.test(sql), 'trips.kind is added')
  ok(/CHECK \(kind IN \('trip', 'tournament'\)\)/.test(sql), 'and constrained to the two kinds')
  ok(/ALTER TABLE rounds ADD COLUMN IF NOT EXISTS start_format/.test(sql), 'rounds.start_format is added')
  ok(/'shotgun', 'tee_sheet'/.test(sql), 'with the two formats')
  ok(/CREATE TABLE IF NOT EXISTS event_messages/.test(sql), 'event_messages exists')
  ok(/ON DELETE CASCADE/.test(sql), 'and a deleted trip takes its notices with it')
}

// ─── The hub wears the right clothes ───────────────────────────

section('The hub is the Event Hub only for a tournament')
{
  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes('isEventKind(trip.kind)'),
    'the hub asks lib/eventHub what it is, off the row it already has')
  // The rounds query must not name start_format on a database that has no
  // such column — and a database that has none has no tournaments either.
  ok(hub.includes("${isEvent ? ', start_format' : ''}"),
    'start_format is only selected for an event')
  ok(/from\('event_messages'\)[\s\S]{0,120}\.eq\('trip_id', trip\.id\)/.test(hub),
    'notices are fetched scoped to the trip')
  ok(/\.\.\.\(isEvent \? \[\{\s*key: 'notices'/.test(hub),
    'and the Notices section exists only on an event')
  ok(hub.includes("isEvent ? 'Schedule' : 'Your Itinerary'"),
    'an event has a Schedule where a trip has Your Itinerary')
  ok(hub.includes('startLines={startLines}'),
    'the start lines reach the schedule tiles')

  const itin = read('app/trip/[tripCode]/Itinerary.tsx')
  ok(itin.includes('startLines?.[item.id] ?? detail'),
    'a chosen start overrides the tee-time line, and nothing else changes')
}

// ─── The organiser area ────────────────────────────────────────

section('The organiser area stands behind the one PIN')
{
  const page = read('app/trip/[tripCode]/organiser/page.tsx')
  ok(page.includes('<PasscodeGate'), 'the gate stands in front')
  ok(page.includes('title="Organiser area"'), 'wearing the organiser\'s words')
  ok(page.includes('!isEvent(trip.kind)'), 'a trip is pointed to Trip Setup instead')
  ok(page.includes("export const dynamic = 'force-dynamic'"),
    'the page is dynamic like every trip route')

  const client = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  // Every write the organiser can make names its trip. The count is the
  // check: post has the insert's trip_id, and remove, format and time all
  // filter by it.
  ok(/insert\(\{ trip_id: tripId, body \}\)/.test(client),
    'a posted notice belongs to its trip')
  const scoped = (client.match(/\.eq\('trip_id', tripId\)/g) ?? []).length
  ok(scoped >= 3, `every other write filters by trip_id (${scoped} of 3)`)
  ok(client.includes('normalizeNotice(draft)'),
    'a notice is normalised before it is judged or posted')
  ok(client.includes('window.confirm'),
    'taking a notice down is deliberate, never one tap')
  ok(/patchRound\(round\.id, \{ startFormat: prev \}\)/.test(client),
    'a refused start format is put back, not left looking saved')
  ok(/patchRound\(round\.id, \{ teeTime: prev \}\)/.test(client),
    'and so is a refused time')

  const panel = read('app/trip/[tripCode]/NoticesPanel.tsx')
  ok(panel.includes('/organiser'), 'the hub links into the organiser area')
  ok(/mounted &&/.test(panel),
    'timestamps wait for the reader\'s own clock rather than hydrating UTC')
}

// ─── The field never sees how the sausage is made ──────────────

section('An event hides Trip Setup from the field')
{
  // An event drops Trip Setup and gains the tee sheet in its place, so both
  // bars are five tabs and the grid never changes shape.
  const bar = read('app/components/TabBar.tsx')
  ok(bar.includes("ITEMS.filter(i => i.key !== 'settings')"),
    'an event\'s tab bar drops Trip Setup')
  ok(bar.includes("ITEMS.filter(i => i.key !== 'teesheet')"),
    'and a trip\'s drops the tee sheet — five tabs either way')
  ok(bar.includes('grid grid-cols-5'), 'on one five-column grid')

  const layout = read('app/trip/[tripCode]/layout.tsx')
  ok(layout.includes('isEvent={isEvent(kind)}'),
    'the layout decides, being the one place that knows before first paint')
  ok(layout.includes('fetchTripKind'), 'off the shared kind lookup')

  // The lookup is one copy, cached per request, and fails soft — a named
  // `kind` inside a page's own select would break that page on a database
  // that has not run migration 046.
  const kindSrc = read('app/trip/[tripCode]/kind.ts')
  ok(kindSrc.includes('cache(') && kindSrc.includes("select('kind')"),
    'the kind lookup is one cached column, asked once per request')

  const scoring = read('app/trip/[tripCode]/scoring/page.tsx')
  ok(scoring.includes('fetchTripKind') && /\{!event && \(\s*<AddRound/.test(scoring),
    'the scoring picker offers no add-round on an event')

  const roundPage = read('app/trip/[tripCode]/round/[roundNumber]/page.tsx')
  ok(/\{!event && \(\s*<CasualToggle/.test(roundPage),
    'nor does an event round offer the casual switch')

  const teams = read('app/trip/[tripCode]/teams/page.tsx')
  ok(teams.includes('<PasscodeGate') && teams.includes('title="Organisers only"'),
    'and the teams screen stands behind the PIN on an event')

  const organiser = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(/href=\{`\/trip\/\$\{tripCode\}\/setup`\}/.test(organiser),
    'the organiser area is the one door left into setup')

  const setup = read('app/trip/[tripCode]/setup/page.tsx')
  ok(setup.includes("title: 'Organisers only'"),
    'and setup\'s own gate speaks to the organiser on an event')
}

// ─── Creation seals the kind and the PIN ───────────────────────

section('A tournament is created as one, with its PIN')
{
  const src = read('app/dashboard/create/CreateTripForm.tsx')
  ok(src.includes("if (isTournament) tripRow.kind = 'tournament'"),
    'the kind is written only for a tournament, so trips still create before 046')
  ok(src.includes('const lockOn = isTournament || lockSettings'),
    'a tournament always sets the PIN; a trip still chooses')
  ok(src.includes('Organiser PIN'), 'and the form calls it what the organiser will')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
