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
  EVENT_PERMISSIONS, TEE_SHEET_PERMISSIONS, type EventPermissions,
  defaultPermissions, parseEventPermissions, allowsParticipant,
  storedPermissions, describePermissions, permissionsFor,
  COLLAB_STYLES, collabAdvice, collabStyleOf, withCollabStyle,
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
    ['add_courses', 'add_players', 'edit_scores', 'edit_tee_sheet', 'set_tee_sheets', 'assign_tag', 'add_rounds', 'set_venues', 'score_matches', 'edit_handicaps'],
    'the three seeded keys, then the tee sheet\'s two, the tag, a league\'s rounds and venues, scoring a match and handicaps — each the promised one-line addition')
  ok(EVENT_PERMISSIONS.every(p => p.dflt === (p.key === 'score_matches' || p.key === 'edit_tee_sheet' || p.key === 'edit_handicaps')),
    'every default is off — the organiser opts in — except scoring a match, open unless the organiser closes it, players booking their own tee times (Ross, 26 Oct 2026: the medium level is the default) and setting their own handicaps (Ross, 4 Nov 2026)')
  const hcp = EVENT_PERMISSIONS.find(p => p.key === 'edit_handicaps')!
  ok(!!hcp.offWarning?.includes('invite link') && hcp.offWarning.includes('start a round'),
    '  …switching that one off says what it costs: invite-link players need you, and no handicap means no round')
  ok(describePermissions(defaultPermissions(), permissionsFor(false)) === 'Organiser-run — players set their own handicaps.'
    && describePermissions(defaultPermissions(), permissionsFor(false, true)) === 'Organiser-run — anyone can score a match, and players set their own handicaps.',
    '  …and an event at its defaults is still organiser-run, the two open ones said by name')
  ok(!permissionsFor(false).some(p => p.key === 'score_matches') && permissionsFor(false, true).some(p => p.key === 'score_matches'),
    'only a match play event is asked who scores its matches')
  ok(EVENT_PERMISSIONS.filter(p => !p.teeSheet).every(p => p.label.startsWith('Participants can')),
    'labels are plain language, said from the field\'s side')
  eq(TEE_SHEET_PERMISSIONS.map(p => p.key), ['edit_tee_sheet', 'set_tee_sheets'],
    'the tee sheet\'s two are asked as the tee times question (Ross, 26 Oct 2026)…')
  ok(![false, true].some(series => [false, true].some(ko =>
    permissionsFor(series, ko).some(p => p.teeSheet))),
    '  …and never among the toggles as well')
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

  // The toggles render whichever registry they are handed — golf's unless
  // told otherwise (a run challenge hands in its own, lib/runChallenge.ts).
  const toggles = read('app/components/EventPermissionToggles.tsx')
  ok(toggles.includes('registry = EVENT_PERMISSIONS') && toggles.includes('registry.map(p =>'),
    'the toggles render the registry — golf\'s by default — so a new permission appears untouched')
}

section('Strict or relaxed, in one tap (Ross, 5 Nov 2026)')
{
  const ko = permissionsFor(false, true)
  eq(ko.map(p => p.key), ['add_courses', 'add_players', 'edit_scores', 'assign_tag', 'score_matches', 'edit_handicaps'],
    'the match play list, in the order creation asks it')
  const strict = withCollabStyle(defaultPermissions(), 'strict', ko)
  eq(ko.map(p => (strict[p.key] ? 'y' : 'n')).join(''), 'ynnyny', 'Strict is "ynnyny" down it, as Ross gave it')
  const relaxed = withCollabStyle(defaultPermissions(), 'relaxed', ko)
  ok(ko.every(p => relaxed[p.key]), 'Relaxed is every one on')
  eq([relaxed.edit_tee_sheet, relaxed.set_tee_sheets], [true, false], '  …the tee times question keeping its own answers')
  eq([collabStyleOf(strict, ko), collabStyleOf(relaxed, ko), collabStyleOf(defaultPermissions(), ko)], ['strict', 'relaxed', null],
    'the style is read off the answers — a mix of your own is neither')
  const league = permissionsFor(true)
  const strictLeague = withCollabStyle(defaultPermissions(), 'strict', league)
  eq([strictLeague.add_rounds, strictLeague.set_venues, strictLeague.edit_handicaps], [false, false, true],
    'a league answers it too: strict keeps its rounds and venues yours')
  eq(collabStyleOf(withCollabStyle(defaultPermissions(), 'relaxed', league), league), 'relaxed', '  …relaxed opens them')
  eq(collabAdvice('strict', ko), [
    COLLAB_STYLES[1].vibe,
    'Players can add a missing course, pick their own tag and set their own handicaps.',
    'Only you can add players to the field, fix a finished scorecard and score any match, with the PIN.',
    'Anything here can be changed later in the organiser area.',
  ], 'a style says what it means: the feel of it, what the field can do, what only you do')
  ok(collabAdvice('relaxed', ko).some(l => l.includes('the draw')) && !collabAdvice('relaxed', league).some(l => l.includes('the draw')),
    '  …the draw named only where there is one')
  ok(EVENT_PERMISSIONS.every(p => p.does.length > 0 && typeof p.strict === 'boolean'),
    'every permission says what it does and its strict answer — still one line each')
  const q = read('app/components/CollaborationQuestion.tsx')
  ok(q.includes('Show each setting') && q.includes('<EventPermissionToggles'), 'a switch shows each setting, through the one set of toggles')
  ok(read('lib/bracketSetup.ts').includes("BRACKET_MODES.find(m => m.key === r.mode)?.key ?? 'relaxed'"),
    "the bracket setup's own strict or relaxed starts on relaxed — a different question")
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
    set_tee_sheets: true, assign_tag: true, add_rounds: true, set_venues: false, score_matches: false,
    edit_handicaps: false,
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
  ok(describePermissions({ ...defaultPermissions(), score_matches: false }, permissionsFor(false)).includes('Organiser-run'),
    'all off reads as organiser-run — over the toggles asked, the tee times question being its own')
  ok(describePermissions(defaultPermissions(), permissionsFor(false, true)).includes('anyone can score'),
    '  …and a match play event at its defaults says its matches are open to score')
  const two = {
    add_courses: true, add_players: true, edit_scores: false, edit_tee_sheet: false,
    set_tee_sheets: false, assign_tag: false, add_rounds: false, set_venues: false, score_matches: false,
    edit_handicaps: false,
  }
  ok(describePermissions(two, permissionsFor(false)).includes('2 of 5'),
    'partial says the count, out of what this event is asked')
  ok(describePermissions(two, permissionsFor(true)).includes('2 of 7'),
    '  …which on a series includes its own')
}

section('A series-only permission is asked of a series alone')
{
  ok(!permissionsFor(false).some(p => p.key === 'add_rounds' || p.key === 'set_venues'),
    'a standalone event is never offered adding rounds or choosing venues')
  ok(permissionsFor(true).some(p => p.key === 'add_rounds')
    && permissionsFor(true).some(p => p.key === 'set_venues'),
    'a series is')
  eq(permissionsFor(true).map(p => p.key), EVENT_PERMISSIONS.filter(p => !p.knockoutOnly && !p.teeSheet).map(p => p.key),
    'a series is asked the whole registry but match play\'s and the tee times question\'s, in order')
  ok(!allowsParticipant('tournament', null, 'add_rounds')
    && !allowsParticipant('tournament', null, 'set_venues'),
    'off until the organiser opens it, like every other')

  const league = read('app/dashboard/create/CreateLeagueForm.tsx')
  ok(league.includes("registry={permissionsFor(schedule === 'series')}"),
    'the league wizard asks by its shape')
  const organiser = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(organiser.includes('registry={permRegistry}') && organiser.includes('describePermissions(perms, permRegistry)'),
    'and the organiser area edits and sums up the same list')
  ok(read('app/trip/[tripCode]/organiser/page.tsx').includes("series={leagueSetup?.schedule === 'series'}"),
    'told by the stored shape')
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
    ok(src.includes('<CollaborationQuestion'),
      '  …through the shared question — strict or relaxed, then the toggles — never a second copy')
    ok(/storedPermissions\((perms|finalPerms)\)/.test(src),
      '  …and writes only when a toggle was flipped')
  }
  // The trip wizard serves trips too, and a trip is never asked.
  const tripForm = read('app/dashboard/create/CreateTripForm.tsx')
  ok(tripForm.includes('{isTournament && (\n              <div className="mt-8 pt-6 border-t border-bark/12">\n                <p className="text-ink/80 text-[13px] uppercase tracking-wider mb-2">\n                  How collaborative should this event be?')
    || /isTournament && \([\s\S]{0,400}How collaborative/.test(tripForm),
    'the trip wizard only asks through the tournament door')
  ok(tripForm.includes('(isTournament || teeTimes) && storedPermissions(finalPerms)'),
    'and only writes for an event — or a trip\'s tee times answers')
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
  ok(client.includes('<CollaborationQuestion') && client.includes('settingsOpen'), 'the same question, editable, every setting showing')
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
  ok(playersClient.includes('Ask the event organiser to add you'),
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

section('The field is added to on the hub — by anyone, or behind the PIN')
{
  const hub = read('app/trip/[tripCode]/page.tsx')
  ok(hub.includes("title: isEvent ? 'The Field' : 'Players'"),
    'an event\'s players are its field; a trip\'s stay its players')
  ok(hub.includes("fieldMayAdd={allowsParticipant(trip.kind, tripRaw.event_permissions, 'add_players')}"),
    'adding is the field\'s exactly when add_players says so')
  ok(hub.includes('add={isEvent ? ('), 'and the door is an event\'s alone — a trip\'s hub is untouched')

  const door = read('app/trip/[tripCode]/AddToField.tsx')
  ok(door.includes('<InlineUnlock') && door.includes('hasUnlocked(tripCode)'),
    'otherwise the organiser\'s PIN is asked in place')
  ok(door.includes('readHandicapField(handicap)') && door.includes('if (hcp !== null)'),
    'a blank handicap is pending, never scratch, and gets no snapshot')
  ok(door.includes('syncRoundHandicaps(roundIds, data.id, hcp)'),
    'a given one is snapshotted onto every round that already exists')
  ok(door.includes('duplicateName(trimmed, players)') && door.includes('isDuplicateNameError(err)'),
    'and two people cannot share a name, checked before and refused after')
}

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

  // How organiser access works on a phone (Ross, 26 Oct 2026): the way in
  // from Settings, and how long it lasts — lib/passcode.ts's session.
  ok(html.includes('tap Settings, then Organiser area, and enter your PIN')
     && html.includes('organiser access on every page until the browser or app is closed'),
    'the message says how to run the event from a phone, and for how long')
  ok(read('lib/passcode.ts').includes('sessionStorage.setItem'),
    '  …which is the session the unlock is kept in, so the sentence stays true')

  const text = confirmationText(eventDetails)
  ok(text.includes(eventDetails.adminUrl), 'the text version carries the link too')
  ok(text.includes('KEEP THIS EMAIL'), 'and the label')
  ok(text.includes('tap Settings, then Organiser area'), '  …and the way in from a phone')

  const tripHtml = confirmationHtml(details)
  ok(!tripHtml.includes('organiser'), 'a trip\'s message has no organiser block')
  ok(!tripHtml.includes('Organiser area'), '  …nor the way into one')
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

section('Handicaps: the field\'s own, or the organiser\'s (Ross, 4 Nov 2026)')
{
  const page = read('app/trip/[tripCode]/players/page.tsx')
  const client = read('app/trip/[tripCode]/players/PlayersClient.tsx')
  ok(page.includes("askHandicap={!isEvent(kind) ? true : handicapsOpen ? 'pending' : false}") && page.includes('ownHandicap={handicapsOpen}')
    && page.includes("'edit_handicaps',"),
    'an event whose players set their own handicaps asks one of a name left without, and of somebody joining')
  ok(client.includes("askHandicap === 'pending' && isHandicapPending(player.handicap)")
    && client.includes('const handicap = ownHandicap ? parseHandicap(addHandicap) : null'),
    '  …and where the organiser keeps them, somebody joining comes in pending, never asked')
  const match = read('app/trip/[tripCode]/match/[matchId]/page.tsx')
  ok(match.includes("!underWay && allowsParticipant(kind, perms, 'edit_handicaps')") && match.includes("from('match_scores').select('match_id', { count: 'exact', head: true })"),
    'a player changes their own on their match page only while the field may, and until the card is under way')
  const add = read('app/trip/[tripCode]/AddToField.tsx')
  ok(add.includes('const maySetHandicap = fieldSetsHandicaps || unlocked || !isLocked(passcodeHash)'),
    'adding a name to the field gives its handicap only where the field may — or the organiser, with the PIN')
  const toggles = read('app/components/EventPermissionToggles.tsx')
  ok(toggles.includes('p.offWarning && !value[p.key]'), 'switched off, the toggle says what it costs')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
