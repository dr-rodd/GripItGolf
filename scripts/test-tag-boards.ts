/**
 * Tag tests. Run with: npm run test:tag-boards
 *
 * Two halves, like every suite here. The rules in lib/tagBoards.ts are
 * checked directly — what a tag is, who carries one, who does not, and the
 * card's summary line. Then the wiring: the portal writes through the one
 * membership writer so the coloured dots follow, the organiser dashboard
 * carries a door to it, and the field's own join face is gated on the
 * permission rather than left open.
 *
 * The load-bearing decision under all of it is that a tag is a team on the
 * MAIN sheet. That is what keeps `players.team_id` — and with it every dot
 * the platform already draws — true without a single query changing, so
 * the tests pin it as a decision rather than an implementation detail.
 */

import fs from 'fs'
import {
  TAG_SET, eventTags, tagOf, untaggedIds, describeTags,
} from '../lib/tagBoards'
import { MAIN_SET, type Membership, type TeamRow } from '../lib/teamSets'

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

// ─── Fixtures ──────────────────────────────────────────────────

const europe: TeamRow & { color: string } = { id: 'tag-eu', name: 'Europe', color: '#2563EB', team_set: MAIN_SET }
const usa: TeamRow & { color: string } = { id: 'tag-us', name: 'USA', color: '#DC2626', team_set: MAIN_SET }
// A pairing on another sheet — the thing a tag must never be confused with.
const pairing: TeamRow & { color: string } = { id: 'pair-1', name: 'Ross & Dave', color: '#16A34A', team_set: 'set-2' }

const teams = [europe, usa, pairing]

const memberships: Membership[] = [
  { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'ross' },
  { team_id: 'tag-eu', team_set: MAIN_SET, player_id: 'dave' },
  { team_id: 'tag-us', team_set: MAIN_SET, player_id: 'john' },
  // Ross is also in a pairing. One player, two sheets — the whole point.
  { team_id: 'pair-1', team_set: 'set-2', player_id: 'ross' },
  { team_id: 'pair-1', team_set: 'set-2', player_id: 'dave' },
]

// ─── The sheet a tag lives on ──────────────────────────────────

section('A tag is a team on the main sheet — the decision the dots rest on')
{
  eq(TAG_SET, MAIN_SET,
    'the tag sheet IS the main sheet, not a sheet beside it')

  // Said as code shape too: this is the property that keeps
  // players.team_id — and every coloured dot reading it — true.
  const writer = read('lib/teamMembers.ts')
  ok(writer.includes('if (teamSet === MAIN_SET)'),
    'the one membership writer mirrors to players.team_id on the main sheet')
  ok(/update\(\{ team_id: teamId \}\)/.test(writer),
    '  …so a tag assignment lands on the mirror by itself')

  const roster = read('app/trip/[tripCode]/scoring/[roundNumber]/page.tsx')
  ok(roster.includes('teams(name, color)'),
    'the live scoring roster still joins straight through that mirror')
  const panel = read('app/scoring/LiveLeaderboardPanel.tsx')
  ok(panel.includes('player.teams') && panel.includes('backgroundColor: player.teams.color'),
    'and the panel still draws the dot from it — nothing to rewire')
}

section('Tags are read off the rows, never a flag')
{
  eq(eventTags(teams).map(t => t.id), ['tag-eu', 'tag-us'],
    'a sheet away is not a tag, however team-like it looks')
  eq(eventTags(teams).map(t => t.color), ['#2563EB', '#DC2626'],
    'and the caller keeps its own richer row — colour included')
  eq(eventTags([]), [], 'an event with no tags simply has none')
  eq(eventTags([pairing]), [],
    'a trip running only a pairs draw has no tags either')
}

// ─── Who carries what ──────────────────────────────────────────

section('One tag per player, and the other sheets stay out of it')
{
  eq(tagOf(memberships, 'ross'), 'tag-eu', 'a tagged player answers their tag')
  eq(tagOf(memberships, 'john'), 'tag-us', 'and the other side answers theirs')
  eq(tagOf(memberships, 'nobody'), null, 'an untagged player answers null')
  ok(tagOf(memberships, 'ross') !== 'pair-1',
    'a pairing on another sheet is never mistaken for a tag')
}

section('Who still needs one')
{
  eq(untaggedIds(['ross', 'dave', 'john'], memberships), [],
    'a fully tagged field has nobody outstanding')
  eq(untaggedIds(['ross', 'mary', 'john', 'sean'], memberships), ['mary', 'sean'],
    'and an untagged one names them, in the order given')
  eq(untaggedIds([], memberships), [], 'an empty roster is not an outstanding list')
  eq(untaggedIds(['mary'], []), ['mary'],
    'with no memberships stored at all, everybody is untagged')
}

// ─── The card's line ───────────────────────────────────────────

section('The organiser card says where tagging stands')
{
  ok(describeTags(0, 0, 12).includes('No tags yet'),
    'nothing made yet reads as an invitation, not a count')
  ok(describeTags(2, 12, 12).includes('2 tags'), 'two tags say two')
  ok(describeTags(1, 3, 12).includes('1 tag ') || describeTags(1, 3, 12).includes('1 tag·')
    || /1 tag\b/.test(describeTags(1, 3, 12)), 'one tag is singular')
  ok(describeTags(2, 9, 12).includes('9 of 12'), 'and how far the tagging has got')
  ok(describeTags(2, 0, 0).includes('nobody on the roster'),
    'an event with tags but no field says so rather than dividing by nothing')
  ok(describeTags(2, 1, 1).includes('1 player'), 'a field of one is singular')
}

// ─── Wiring: the portal ────────────────────────────────────────

section('The portal writes through the one membership writer')
{
  const client = read('app/trip/[tripCode]/organiser/tags/TagPortalClient.tsx')
  ok(client.includes("setTeam(tripId, playerId, TAG_SET, tagId)"),
    'assignment goes through setTeam on the tag sheet — never a raw insert')
  ok(!/from\('team_members'\)/.test(client),
    'the portal never touches team_members itself')
  ok(client.includes('clearMirror('),
    'and removing a tag clears the mirror, as deleting teams always has')
  ok(client.includes('window.confirm('),
    'removing a tag is deliberate, never one tap')
  ok(client.includes('setMemberships(prev)') && client.includes('setTeams(prev)'),
    'every write is optimistic and reverts when refused')
  ok(client.includes('PRESET_COLORS'), 'tags colour from the one palette')

  const page = read('app/trip/[tripCode]/organiser/tags/page.tsx')
  ok(page.includes('isEvent(trip.kind)'), 'events only — a trip is pointed at Trip Setup')
  ok(page.includes('PasscodeGate'), 'behind the same organiser PIN as the rest of the area')
  ok(page.includes("select('event_permissions')"),
    'the permission rides in its own query — the fail-soft rule')
}

section('The palette is one copy, wherever a team comes from')
{
  const lib = read('lib/teamColors.ts')
  ok(lib.includes('#DC2626'), 'the twelve live in lib/teamColors.ts')
  const editor = read('app/trip/[tripCode]/teams/TripTeamsClient.tsx')
  ok(editor.includes("from '@/lib/teamColors'"),
    'the drag editor imports them rather than holding its own')
  ok(!/const PRESET_COLORS = \[/.test(editor),
    '  …and no longer declares a second copy')
}

// ─── Wiring: the doors ─────────────────────────────────────────

section('The organiser dashboard carries the door')
{
  const client = read('app/trip/[tripCode]/organiser/OrganiserClient.tsx')
  ok(client.includes('/organiser/tags'), 'a card links to the portal')
  ok(client.includes('Teams &amp; tags'), 'under the amalgamated heading')
  ok(client.includes('{tagsSummary}'), 'showing where tagging stands')

  const page = read('app/trip/[tripCode]/organiser/page.tsx')
  ok(page.includes('describeTags('), 'summarised on the server, through the one copy')
  ok(page.includes("{ count: 'exact', head: true }") && page.includes("eq('team_set', TAG_SET)"),
    'counted in headers, scoped to the tag sheet')
}

section('The field only picks its own tag when the organiser says so')
{
  const page = read('app/trip/[tripCode]/teams/page.tsx')
  ok(page.includes('assign_tag'), 'the teams screen reads the permission')
  ok(page.includes('tags.length > 0'),
    'and offers nothing until there are tags to pick from')
  ok(page.includes('selfPick || mayPickTag'),
    'either standing grant opens the join face — neither speaks for the other')

  const join = read('app/trip/[tripCode]/teams/TagJoinClient.tsx')
  ok(join.includes('setTeam(tripId, viewer.id, TAG_SET, tagId)'),
    'the field writes through the same one writer')
  ok(!/from\('teams'\)/.test(join),
    'and can never make, rename or remove a tag — only join one')
  ok(join.includes('viewerPlayerId'),
    'identity is the claim cookie, personalising and never authorising')
}

// ─── Trips are untouched ───────────────────────────────────────

section('Nothing here reaches a trip')
{
  const lib = read('lib/tagBoards.ts')
  ok(lib.includes('Pure.') && !/from '@\/lib\/supabase'/.test(lib),
    'the rules are pure — no I/O to leak into a trip screen')

  for (const f of [
    'app/trip/[tripCode]/teams/TripTeamsClient.tsx',
    'app/trip/[tripCode]/teams/TeamJoinClient.tsx',
  ]) {
    ok(!read(f).includes('tagBoards'),
      `${f.split('/').pop()} is untouched by tags`)
  }
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
