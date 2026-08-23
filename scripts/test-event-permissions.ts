/**
 * Event permission tests. Run with: npm run test:event-permissions
 *
 * Two halves. The rules in lib/eventPermissions.ts are checked directly —
 * the registry, the conservative defaults, the fail-soft parse, and the
 * one rule that matters most: trips are untouched. Then the wiring: the
 * three event creation doors ask the collaboration question, the admin
 * page edits the same answers scoped to its trip, the participant screens
 * actually gate, and the confirmation email gains the organiser block
 * without ever carrying the PIN.
 */

import fs from 'fs'
import {
  EVENT_PERMISSIONS, type EventPermissions,
  defaultPermissions, parseEventPermissions, allowsParticipant,
  storedPermissions, describePermissions,
} from '../lib/eventPermissions'
import { confirmationHtml, confirmationText } from '../lib/confirmationEmail'

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

// ─── The registry ──────────────────────────────────────────────

section('Three seeded permissions, conservative by default')
{
  eq(EVENT_PERMISSIONS.map(p => p.key),
    ['add_courses', 'add_players', 'edit_scores', 'edit_tee_sheet'],
    'the three seeded keys, and the tee sheet — the promised one-line addition')
  ok(EVENT_PERMISSIONS.every(p => p.dflt === false),
    'every default is off — the organiser opts in')
  ok(EVENT_PERMISSIONS.every(p => p.label.startsWith('Participants can')),
    'labels are plain language, said from the field\'s side')
  ok(EVENT_PERMISSIONS.every(p => p.hint.length > 0), 'each explains itself')
}

section('Adding a fourth permission is one line, structurally')
{
  // Defaults and parsing both walk the registry rather than naming keys, so
  // a new entry needs nothing but its own line. Pinned as code shape,
  // because that is where a restructure would show first.
  const lib = read('lib/eventPermissions.ts')
  ok(lib.includes('EVENT_PERMISSIONS.map(p => [p.key, p.dflt])'),
    'the defaults derive from the registry')
  ok(lib.includes('for (const p of EVENT_PERMISSIONS)'),
    'the parser walks the registry')
  eq(Object.keys(defaultPermissions()), EVENT_PERMISSIONS.map(p => p.key),
    'and the default map is exactly the registry, in order')

  const toggles = read('app/components/EventPermissionToggles.tsx')
  ok(toggles.includes('EVENT_PERMISSIONS.map(p =>'),
    'the toggles render the registry — a new permission appears untouched')
}

// ─── Reading what is stored ────────────────────────────────────

section('Storage reads whole, falls soft, and never nulls')
{
  eq(parseEventPermissions(null), defaultPermissions(),
    'the un-migrated column is an event at its defaults')
  eq(parseEventPermissions('open sesame'), defaultPermissions(), 'junk is defaults')
  eq(parseEventPermissions([]), defaultPermissions(), 'an array is defaults')

  const stored = { add_players: true, edit_scores: 'yes', mystery: true }
  const parsed = parseEventPermissions(stored)
  eq(parsed.add_players, true, 'a real boolean is honoured')
  eq(parsed.edit_scores, false, 'a non-boolean falls to the default')
  eq(parsed.add_courses, false, 'an absent key falls to the default')
  ok(!('mystery' in parsed), 'an unknown key is not carried')

  const full: EventPermissions = {
    add_courses: true, add_players: false, edit_scores: true, edit_tee_sheet: false,
  }
  eq(parseEventPermissions(JSON.parse(JSON.stringify(full))), full,
    'a full map reads back whole')
}

section('Creation writes only what differs from the defaults')
{
  eq(storedPermissions(defaultPermissions()), null,
    'nothing opened writes nothing — creation lands before migration 049')
  const opened = { ...defaultPermissions(), add_players: true }
  eq(storedPermissions(opened), opened, 'one toggle flipped writes the map')
}

// ─── Trips are untouched ───────────────────────────────────────

section('The gate opens for anything that is not an event')
{
  const locked = { add_courses: false, add_players: false, edit_scores: false }
  ok(allowsParticipant('trip', locked, 'add_players'),
    'a trip is open whatever the column holds')
  ok(allowsParticipant(undefined, locked, 'add_players'),
    'so is an un-migrated database, which cannot hold an event')
  ok(allowsParticipant(null, locked, 'edit_scores'), 'and an explicit null')

  ok(!allowsParticipant('tournament', null, 'add_players'),
    'an event with nothing stored answers its conservative default')
  ok(allowsParticipant('tournament', { add_players: true }, 'add_players'),
    'and its organiser\'s yes is a yes')
  ok(!allowsParticipant('tournament', { add_players: true }, 'edit_scores'),
    'one permission never speaks for another')
}

section('The admin card sums it up')
{
  ok(describePermissions(defaultPermissions()).includes('Organiser-run'),
    'all off reads as organiser-run')
  ok(describePermissions({
    add_courses: true, add_players: true, edit_scores: false, edit_tee_sheet: false,
  }).includes('2 of 4'), 'partial says the count')
}

// ─── Wiring: creation asks ─────────────────────────────────────

section('Every event door asks how collaborative, and writes only real answers')
{
  for (const f of [
    'app/dashboard/create/CreateLeagueForm.tsx',
    'app/dashboard/create/CreateKnockoutForm.tsx',
    'app/dashboard/create/CreateTripForm.tsx',
  ]) {
    const src = read(f)
    ok(src.includes('How collaborative should this event be?'),
      `${f.split('/').pop()} asks the question`)
    ok(src.includes('<EventPermissionToggles'),
      '  …with the shared toggles, never a second copy')
    ok(src.includes('storedPermissions(perms)'),
      '  …and writes only when a toggle was flipped')
  }
  // The trip wizard serves trips too, and a trip is never asked.
  const tripForm = read('app/dashboard/create/CreateTripForm.tsx')
  ok(tripForm.includes('{isTournament && (\n              <div className="mt-8 pt-6 border-t border-bark/12">\n                <p className="text-ink/80 text-[13px] uppercase tracking-wider mb-2">\n                  How collaborative should this event be?')
    || /isTournament && \([\s\S]{0,400}How collaborative/.test(tripForm),
    'the trip wizard only asks through the tournament door')
  ok(tripForm.includes('isTournament && storedPermissions(perms)'),
    'and only writes for an event')
}

// ─── Wiring: the admin page ────────────────────────────────────

section('The organiser page is the admin portal')
{
  const page = read('app/trip/[tripCode]/organiser/page.tsx')
  ok(page.includes('parseEventPermissions'), 'it reads the stored answers')
  ok(page.includes("select('event_permissions')"),
    'in their own query — the fail-soft rule, never the main select')
  ok(page.includes("{ count: 'exact', head: true }"),
    'the overview counts in headers, not bodies')

  const client = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(client.includes('<EventPermissionToggles'), 'the same toggles, editable')
  ok(/update\(\{ event_permissions: next \}\)[\s\S]{0,80}\.eq\('id', tripId\)/.test(client),
    'saves scoped to the trip')
  ok(client.includes('setPerms(prev)'), 'and reverts when the save is refused')
  ok(client.indexOf('bird') < client.indexOf('Participants'),
    'the overview stands above the levers')
}

// ─── Wiring: the gates actually gate ───────────────────────────

section('A participant\'s screens change to match')
{
  const playersPage = read('app/trip/[tripCode]/players/page.tsx')
  ok(playersPage.includes("'add_players'"), 'the players page asks add_players')
  ok(playersPage.includes('allowsParticipant('), 'through the one gate helper')
  const playersClient = read('app/trip/[tripCode]/players/PlayersClient.tsx')
  ok(playersClient.includes('{!canAddPlayers ?'),
    'off, the add form is not rendered — nothing to see or reach')
  ok(playersClient.includes('ask them to put you on the list'),
    'and the screen says why, calmly')

  const scoringPage = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(scoringPage.includes("'edit_scores'"), 'the scoring page asks edit_scores')
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  ok(flow.includes('{allowScoreEdits && ('),
    'off, Edit Scorecard is not rendered')
  ok(flow.includes('allowScoreEdits = true'),
    'and the default is open — the legacy route and every trip unchanged')
}

// ─── Wiring: the email ─────────────────────────────────────────

section('The event email carries the admin link, never the PIN')
{
  const details = {
    tripName: 'Winter League', dates: null,
    tripUrl: 'https://greendot.live/trip/GX7K2P', tripCode: 'GX7K2P',
  }
  const eventDetails = { ...details, adminUrl: 'https://greendot.live/trip/GX7K2P/organiser' }

  const html = confirmationHtml(eventDetails)
  ok(html.includes(eventDetails.adminUrl), 'the admin link is in the message')
  ok(html.includes('keep this email'), 'and labelled to keep')
  ok(html.includes('cannot be recovered'), 'with the PIN reminder spelled out')
  ok(html.includes('Event code:'), 'an event calls its code an event code')

  const text = confirmationText(eventDetails)
  ok(text.includes(eventDetails.adminUrl), 'the text version carries the link too')
  ok(text.includes('KEEP THIS EMAIL'), 'and the label')

  const tripHtml = confirmationHtml(details)
  ok(!tripHtml.includes('organiser'), 'a trip\'s message has no organiser block')
  ok(tripHtml.includes('Trip code:'), 'and keeps its own wording')

  // The PIN itself can never be in the message, because the words never
  // receive it: hashed on the organiser's device, unknown to the server.
  const lib = read('lib/confirmationEmail.ts')
  ok(!/passcode|password|pinValue/i.test(lib.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/PIN/g, '')),
    'the email module has no password field to leak')

  const route = read('app/api/trip-confirmation/route.ts')
  ok(route.includes('to: trip.lead_email'),
    'the recipient is the stored address, on the service role')
  ok(!/body\?\.(email|to|address)/.test(route),
    'and never anything from the request payload')
  ok(route.includes(".is('confirmation_sent_at', null)"),
    'the send-claim survives — one email per event, ever')
  ok(route.includes('isEvent(kindResult.data?.kind)'),
    'the organiser block rides only on a real event, read fail-soft')
}

section('Migration 049 is the one column the model promised')
{
  const sql = read('supabase/migrations/20260101000049_event_permissions.sql')
  ok(/ADD COLUMN IF NOT EXISTS event_permissions jsonb/.test(sql),
    'one jsonb column, idempotently')
  ok(sql.includes('lib/eventPermissions.ts'),
    'pointing at the registry as the only copy of the keys')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
