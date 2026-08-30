/**
 * Trip creation form tests. Run with: npm run test:trip-form
 *
 * Two things here. The round limit is policy the form has to enforce, so it is
 * checked directly. The date fields have a habit of pushing past the right
 * edge of the page, so the markup that prevents it is asserted rather than
 * eyeballed — a two-column row of dates must be able to shrink.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import fs from 'fs'
import DateField from '../app/components/DateField'
import CreateTripForm from '../app/dashboard/create/CreateTripForm'
import TripSetupClient from '../app/trip/[tripCode]/setup/TripSetupClient'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  MIN_ROUNDS, MAX_ROUNDS, roundCountError, isRoundCountValid,
  MAX_TRIP_DESCRIPTION, normalizeDescription,
} from '../lib/tripLimits'
import Toggle from '../app/components/Toggle'
import { parseFormats } from '../lib/formats'
import {
  MIN_PASSCODE, MAX_PASSCODE, passcodeError, isPasscodeValid,
  hashPasscode, verifyPasscode, isLocked,
} from '../lib/passcode'

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

/**
 * A server render of a client component that asks for the router.
 *
 * Trip Settings calls `router.refresh()` after moving the trip's dates — the
 * rounds are re-dated in the same breath and every screen that reads them is
 * server-rendered. `useRouter` throws outside the context Next would provide,
 * so the tests give it a stub; nothing here navigates, so it only has to
 * exist. Same shape as the one in test-branding.tsx.
 */
const stubRouter = {
  push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
}
function renderWithRouter(el: React.ReactElement): string {
  return renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: stubRouter as never }, el)
  )
}

// ─── Round limit ───────────────────────────────────────────────

section('Round count limit')
{
  for (let n = MIN_ROUNDS; n <= MAX_ROUNDS; n++) {
    eq(roundCountError(n), null, `${n} rounds is allowed`)
    ok(isRoundCountValid(n), `${n} rounds passes validation`)
  }

  ok(roundCountError(MAX_ROUNDS + 1) !== null, `${MAX_ROUNDS + 1} rounds is refused`)
  ok(roundCountError(MAX_ROUNDS + 1)!.includes(String(MAX_ROUNDS)),
    'the message names the limit rather than just refusing')
  ok(roundCountError(20) !== null, '20 rounds is refused')
  ok(roundCountError(99) !== null, '99 rounds is refused')
  ok(!isRoundCountValid(7), 'seven does not pass validation')

  ok(roundCountError(0) !== null, 'zero rounds is refused')
  ok(roundCountError(-3) !== null, 'a negative count is refused')
  ok(roundCountError(2.5) !== null, 'a fractional count is refused')
  ok(roundCountError(NaN) !== null, 'NaN is refused')

  // The limit is policy, so the message should read as a choice, not a fault
  ok(/at most/.test(roundCountError(9)!), 'the wording describes a cap')
}

// ─── The form renders the control ──────────────────────────────

// The form fetches its own courses now, so the route can stay static and be
// prefetched whole. Nothing to hand in.
const formHtml = renderToStaticMarkup(
  React.createElement(CreateTripForm)
)

section('The itinerary replaces the rounds picker')
{
  // Rounds are no longer chosen by number. A round exists because a golf
  // item was added to a day, so the running order is the thing being built.
  ok(!formHtml.includes('Number of rounds'), 'there is no rounds counter any more')
  ok(!/Add (a )?round/.test(formHtml), 'nor an add-a-round control')

  const labels = formHtml.match(/Step \d of 3 — ([^<]+)/)
  ok(labels !== null, 'the wizard says which step it is on')

  const src = fs.readFileSync('app/dashboard/create/CreateTripForm.tsx', 'utf-8')
  ok(src.includes("'Trip details', 'Itinerary', 'Players'"),
    'and step two is the itinerary')
  ok(src.includes('<ItineraryBuilder'), 'which renders the builder')

  // Creation used to carry its own field-for-field copy of the row mapping,
  // beside the one in itinerarySync. The two had to be edited together every
  // time a kind gained a column — and a kind gaining a column is exactly what
  // happens. One helper now, so a new column reaches both writers at once.
  ok(src.includes('toItemRow(tripId, item)'),
    'and writes its itinerary rows through the shared mapping')
  ok(!/stay_name: item\.kind === 'stay'/.test(src),
    '  …rather than a second copy of it')

  // A new trip plays for nothing until its lead player says otherwise.
  // Writing `DEFAULT_FORMATS` here is what put a Stableford board on every
  // trip ever made on this platform: it names a competition, and
  // `trips.leaderboards` defaults to an empty array, which the compat layer
  // reads as "old trip, use the flags".
  ok(src.includes('NO_FORMATS'), 'a new trip is created with nothing switched on')
  // Comments stripped: the note at the call site explains what the defaults
  // used to do here and why they went, and a prose mention of them would
  // match the check that they are gone.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  ok(!/DEFAULT_FORMATS/.test(code), '  …and not with the defaults, which name one')

  // Leaderboards are offered at creation now — the same picker the league
  // wizard embeds and Trip Setup runs, one grid, one copy — but a trip may
  // skip them: nothing chosen writes nothing, so a skipped trip is
  // byte-for-byte the trip this wizard always made, and the phantom-board
  // rule above still holds for it.
  ok(src.includes('<LeaderboardSetup'), 'the leaderboard picker is offered at creation')
  ok(src.includes('if (boards.length > 0) tripRow.leaderboards = boards'),
    '  …written only when boards were actually built')
  ok(src.includes('const step3Valid = !passcodeIssue && !duplicateIssue'),
    '  …and never required — the way forward does not wait on a board')

  // A trip with no golf has nothing to score, so it cannot move on. It is a
  // reason rather than a disabled button now — an empty Tuesday should not
  // grey out the way forward, so the check happens once, at the end.
  ok(src.includes('plannedGolf.length === 0'), 'a trip needs at least one round')
  ok(src.includes('roundCountError(plannedGolf.length)'),
    'and the cap on rounds still applies, counted from the golf items')
  ok(src.includes('blockedReason={itineraryBlocked}'),
    'with the reason handed to the builder, which owns the button')
  ok(!/step === 2 && !step2Valid/.test(src),
    'and the form no longer greys its own button on step two')

  // The golf items are what the rounds table is built from
  ok(src.includes('plannedGolf.map'), 'rounds are written from the golf items')
  ok(src.includes('itinerary_item_id'), 'and each round remembers the item that made it')
  ok(src.includes("from('itinerary_items')"), 'with the itinerary saved alongside')
}

// ─── The itinerary's own footer ────────────────────────────────

section('The way forward is pinned under the add buttons')
{
  // Two buttons fighting for the bottom of the screen was the glitch: the
  // builder pins its own, so the form must not also render one on step two.
  const src = fs.readFileSync('app/dashboard/create/CreateTripForm.tsx', 'utf-8')
  ok(src.includes('{step !== 2 && ('), 'the form hides its CTA on the itinerary step')

  const b = fs.readFileSync('app/components/ItineraryBuilder.tsx', 'utf-8')

  // Continue walks the days, and only becomes the way out on the last one
  ok(b.includes('Proceed to Add Players'),
    'the last day offers the way out of the itinerary')
  ok(/Continue to Day \$\{openDay \+ 2\}/.test(b),
    'and every other day continues to the next one')
  ok(b.includes('lastDay ? onContinue() : setOpenDay(d => d + 1)'),
    'so the button walks the trip rather than leaving it early')

  // An empty day is a normal day. Only a problem with the whole trip stops it
  ok(b.includes('disabled={lastDay && !!blockedReason}'),
    'and is never disabled by a day with nothing planned on it')

  // The add buttons carry the extra height, and sit above it
  ok(b.indexOf('min-h-[64px]') < b.indexOf('min-h-[52px]'),
    'the add buttons are taller, and come first')
}

// ─── A single day wears a different face ───────────────────────

section('A single-day event has no Day 1 and golf leads it')
{
  const b = fs.readFileSync('app/components/ItineraryBuilder.tsx', 'utf-8')

  // One day needs no day picker — a strip with one chip saying "Day 1" is
  // exactly the redundancy this mode removes.
  ok(b.includes('const singleDay = days === 1'), 'one day is its own mode')
  ok(b.includes('{days > 1 && ('), 'and the day strip only exists past one day')
  ok(b.includes("? 'The day'"),
    'a dateless single day never falls back to saying Day 1')

  // Golf is the main event: the big Set Venue button lives in the day
  // itself, not as one of four equal squares at the bottom.
  ok(b.includes('Set Venue'), 'the big move is Set Venue')
  ok(b.includes('+ Add another round'),
    'and once golf is set, a second round stays reachable — a 36-hole day is a real day')

  // Everything else shares one button, and the sheet asks what kind it is.
  ok(b.includes('function KindSwitch'), 'one sheet, a kind chosen inside it')
  ok(b.includes('<KindSwitch current="stay"')
    && b.includes('<KindSwitch current="travel"')
    && b.includes('<KindSwitch current="activity"'),
    'all three non-golf sheets carry the switch')
  ok(b.includes('grid-cols-4'), 'while multi-day keeps its four buttons, unchanged')

  // The golf tile says when the course gives the day back — five hours from
  // the last tee time — so an activity timed inside the window reads as
  // deliberate. The rule itself lives in lib/itinerary.ts, one copy.
  ok(b.includes('golfUntil(item)'), 'the golf tile shows its window')
  ok(!/\b270\b/.test(b) && !b.includes('* 60 * 5'),
    '  …and never re-derives the span for itself')
}

// ─── Teams are settings' business, not creation's ──────────────

section('Creation does not ask about teams')
{
  // Whether a trip has teams at all follows from the leaderboards it runs,
  // and those are chosen in settings. Asking here as well gave the same
  // question two answers, and the creation one was the one nothing read.
  const src = fs.readFileSync('app/dashboard/create/CreateTripForm.tsx', 'utf-8')

  ok(!src.includes('Use teams?'), 'no use-teams toggle')
  ok(!src.includes('Number of teams'), 'no team count')
  ok(!src.includes("from('teams')"), 'and no teams are written')
  ok(!/teamIndex/.test(src), 'a player is not put in a team here')
  ok(src.includes('team_id: null'), 'everyone starts unassigned')

  // Three steps, and the third is the last one
  ok(src.includes("useState<1 | 2 | 3 | 'done'>(1)"), 'the wizard is three steps')
  ok(src.includes('const isFinalStep = stepNum === 3'), 'and finishes on the third')
  ok(!/step === 4/.test(src), 'there is no fourth step left behind')

  // The progress bar has to agree with the steps, or it stalls short of full
  const bar = src.match(/\{\[([\d, ]+)\]\.map\(s =>/)
  eq(bar?.[1], '1, 2, 3', 'the progress bar has one segment per step')
}

// ─── Date fields stay inside their container ───────────────────

section('Date fields cannot overflow')
{
  const html = renderToStaticMarkup(
    React.createElement(DateField, { label: 'Start date', value: '', onChange: () => {} })
  )

  ok(html.includes('type="date"'), 'renders a date input')
  ok(html.includes('Start date'), 'renders its label')

  // Grid and flex children default to min-width:auto and refuse to shrink.
  // Both the wrapper and the input need min-width:0 or a two-column row of
  // dates pushes past the right edge.
  ok(html.includes('min-w-0'), 'the wrapper can shrink below its content')
  ok(html.includes('min-width:0'), 'so can the input')
  ok(html.includes('max-width:100%'), 'and it cannot exceed its container')
  ok(html.includes('w-full'), 'it fills the space it is given')

  // iOS sizes the native control to its own preference unless this is off
  ok(html.includes('-webkit-appearance:none') || html.includes('WebkitAppearance'),
    'the native control sizing is overridden for iOS')

  // Dark scheme, or the picker text is invisible on this background
  ok(html.includes('color-scheme:dark'), 'the picker renders light-on-dark')

  ok(html.includes('disabled'), 'a disabled state is supported')
}

section('Start and end dates share one row')
{
  // Two equal columns, explicitly shrinkable
  ok(formHtml.includes('repeat(2, minmax(0, 1fr))'),
    'the date pair is a two-column grid that can shrink')
  ok(formHtml.includes('Start date') && formHtml.includes('End date'),
    'both dates are present')

  // The old stacking behaviour is gone — they sit side by side at every width
  ok(!formHtml.includes('grid-cols-1 sm:grid-cols-2'),
    'they no longer stack on narrow screens')

  // Every date input on the page carries the shrink fix. Step 1 shows the
  // trip's start and end; the per-round date lives on step 2, which is not
  // rendered until you get there.
  const dateInputs = (formHtml.match(/type="date"/g) ?? []).length
  const shrinkable = (formHtml.match(/min-width:0/g) ?? []).length
  eq(dateInputs, 2, 'step 1 shows the start and end dates')
  ok(shrinkable >= dateInputs, 'every one of them can shrink')
}

section('The trip setup page uses the same field')
{
  const html = renderWithRouter(
    React.createElement(TripSetupClient, {
      trip: {
        id: 't1', trip_code: 'ABC123', name: 'Test Trip',
        start_date: '2026-05-01', end_date: '2026-05-04',
        formats: parseFormats({ individual: { stableford: true } }),
        team_scoring: { mode: 'better_ball', countingScores: 2, aggregateFinish: 0, aggregateHoles: 18 },
        setup_status: 'draft', edit_permission: 'everyone',
      },
      teams: [], players: [], rounds: [],
    } as never)
  )
  // The trip's name and dates moved behind the gear in the header. They are
  // set once at creation and hardly touched again, so they were taking the
  // first screenful away from the thing the page is for.
  ok(!html.includes('type="date"'), 'setup does not put date fields on the page itself')
  ok(html.includes('Trip Settings'), 'it offers them behind a named row')

  const src = fs.readFileSync('app/trip/[tripCode]/setup/TripSetupClient.tsx', 'utf-8')
  ok(src.includes('<DateField'), 'and still uses the shared date field inside the sheet')
  ok(src.includes("repeat(2, minmax(0, 1fr))"), 'in the same two-column row')
  ok(src.includes('setDetailsOpen'), 'which the gear opens and closes')
}

// ─── The trip, and the golf ────────────────────────────────────
//
// Two kinds of question live on the settings screen, and a bare gear in the
// corner named neither of them. What the trip *is* — name, dates, running
// order, who may change it — sits behind the row; how the golf is *played*
// is everything below it. The row has to say so, or the split is guesswork.
//
// The row used to say "The non-golf trip details", which stopped being true
// when the drawer gained the stats switch: that one is about what the
// scorecard asks for. The load-bearing half was never the "non-golf" claim
// but the **pointer downwards** — it is what stops somebody hunting in the
// drawer for the leaderboards — so that is what is pinned now.

section('The gear says what is behind it')
{
  const html = renderWithRouter(
    React.createElement(TripSetupClient, {
      trip: {
        id: 't1', trip_code: 'ABC123', name: 'Test Trip',
        start_date: '2026-05-01', end_date: '2026-05-04',
        formats: parseFormats({ individual: { stableford: true } }),
        team_scoring: { mode: 'better_ball', countingScores: 2, aggregateFinish: 0, aggregateHoles: 18 },
        setup_status: 'draft', edit_permission: 'everyone',
      },
      teams: [], players: [], rounds: [],
    } as never)
  )

  ok(/leaderboards are below/i.test(html),
    'the row draws the line between the trip and the golf')
  ok(!/non-golf/i.test(html),
    '  …without claiming nothing behind it touches the golf, which it now does')

  // Who can edit followed the name and the dates in. It is a fact about the
  // trip rather than about the golf — it decides who may open any of this —
  // so it belongs with them, and it is closed until the row is tapped.
  ok(!html.includes('Who can edit'), 'who can edit is not on the page body')
  const src = fs.readFileSync('app/trip/[tripCode]/setup/TripSetupClient.tsx', 'utf-8')
  const sheet = src.slice(src.indexOf('{detailsOpen && ('), src.indexOf('{itineraryOpen && ('))
  ok(sheet.includes('Who can edit'), 'it is inside the details sheet')
  ok(sheet.includes('savePermission'), 'and still saves from there')

  // Track stats is in the drawer alongside it, and saves the same way —
  // optimistically, reverting on a refusal, through the shared `saveTrip`.
  ok(sheet.includes('Track stats'), 'track stats is in the drawer too')
  ok(sheet.includes('saveTrackStats'), '  …and saves from there')
  ok(/track_stats: next/.test(src), '  …writing the column the card reads')
  ok(/setTrackStats\(prev\)/.test(src), '  …and putting the switch back if the write is refused')
  ok(!html.includes('Track stats'), 'and it is not on the page body either')

  // The read-only round list is gone. The itinerary behind this same row is
  // that list and editable, and the hub prints it a third time.
  ok(!/>Rounds</.test(src), 'settings no longer restates the rounds')
}

// ─── Settings asks each question exactly once ──────────────────

section('The old decision tree is gone from settings')
{
  const src = fs.readFileSync('app/trip/[tripCode]/setup/TripSetupClient.tsx', 'utf-8')

  // Seven of its eight cards asked what the leaderboard cards now ask
  // properly — who competes, league or matchplay, scoring, discard, the
  // prize table, the draw format, team scoring. Every one was answered into
  // a model nothing downstream read.
  ok(!/\{steps\.map\(step =>/.test(src),
    'settings no longer renders the old question tree')
  ok(!src.includes('Next up —'), 'nor its "what is left" note')

  // The one question it asked that the leaderboards do not: who is on which
  // team. That stays, and is driven by the boards rather than the old flags.
  ok(src.includes('needsTeams(boards)'), 'teams are still picked, off the boards')
  ok(src.includes('needsPairings(boards)'), 'and a pairs draw still fixes them at two')

  // The leaderboard section is the only place a competition is chosen
  ok(src.includes('<LeaderboardSetup'), 'the leaderboard cards are the one question area')
}

// ─── Toggle ────────────────────────────────────────────────────

section('Toggle knob is positioned, not translated')
{
  const off = renderToStaticMarkup(
    React.createElement(Toggle, { checked: false, onChange: () => {}, label: 'Use teams' })
  )
  const on = renderToStaticMarkup(
    React.createElement(Toggle, { checked: true, onChange: () => {}, label: 'Use teams' })
  )

  // The old version relied on an absolute element's static position plus a
  // transform, which left the knob outside the track and stopping halfway
  ok(!off.includes('translate-x'), 'the knob is not moved with a transform')
  ok(off.includes('left:4px'), 'at rest it sits inside the left edge of the track')
  ok(on.includes('left:24px'), 'switched on it sits inside the right edge')

  // 48 wide, 20 knob, 4 inset → travel is 48-20-4 = 24, and it stays inside
  ok(off.includes('width:48px') && off.includes('height:28px'), 'the track has a fixed size')
  ok(off.includes('width:20px') && off.includes('height:20px'), 'so does the knob')
  ok(off.includes('top:4px'), 'and it is centred vertically')

  ok(on.includes('aria-checked="true"'), 'it reports its state to assistive tech')
  ok(off.includes('aria-checked="false"'), 'in both directions')
  ok(off.includes('role="switch"'), 'and identifies as a switch')
  ok(off.includes('type="button"'), 'without submitting any form it sits in')
}

// ─── Handicap keypad ───────────────────────────────────────────

section('Handicap inputs bring up a keypad')
{
  // Handicap fields live on step 4 and in trip setup, neither of which appears
  // in step 1's markup, so the source is what to check.
  const files = [
    'app/dashboard/create/CreateTripForm.tsx',
    'app/trip/[tripCode]/setup/TripSetupClient.tsx',
    'app/trip/[tripCode]/players/PlayersClient.tsx',
  ]
  for (const f of files) {
    const src = require('fs').readFileSync(f, 'utf-8')
    const fields = (src.match(/placeholder="(Handicap|HCP)/g) ?? []).length
    const shared = (src.match(/<HandicapField/g) ?? []).length
    const name = f.split('/').pop()
    ok(fields > 0, `${name} has a handicap field`)
    // Every one of them is the shared field, and the field is the only place
    // that knows how to reconcile the keypad with the sign. This has been
    // broken in both directions: a decimal keypad is right for 14.2 and has
    // no plus on it, and the text keyboard that fixed that made everybody
    // type two digits on a QWERTY. `min="0"` refused a plus outright.
    ok(shared >= fields, `${name}: every handicap field is the shared one`)
    ok(!/placeholder="Handicap[\s\S]{0,200}min="0"/.test(src),
      `  …none of them refuses anything better than scratch`)
  }

  // A player row is read far more often than it is edited, and it used to
  // carry five live controls at all times — name box, handicap box, M, F and
  // a team dropdown — which was most of a phone screen for four players with
  // nothing on it saying which were worth touching.
  const setupSrc = require('fs').readFileSync(files[1], 'utf-8')
  ok(/setEditingId\(player\.id\)/.test(setupSrc),
    'a closed player row opens for editing rather than being editable always')
  ok(/const editing = editingId === player\.id && canEdit/.test(setupSrc),
    '  …and cannot open for a device that may not change the trip')
  // Closing writes nothing — every field saves as it is left — so one row at
  // a time can never cost an edit.
  ok(/onClick=\{\(\) => setEditingId\(null\)\}/.test(setupSrc),
    'and closes without a save of its own')

  // The open row is laid out like the add-player form under it: the field
  // stretches, the buttons finish at the right-hand edge.
  ok(/rowClassName="flex-1 min-w-0"/.test(setupSrc),
    'the open handicap field stretches like the one in the add form')

  // The sign is a control, so it has to be reachable and it has to save.
  const field = require('fs').readFileSync('app/components/HandicapField.tsx', 'utf-8')
  ok(/aria-pressed=\{plus\}/.test(field), 'the plus button says whether it is on')
  ok(/aria-label=/.test(field), '  …and is named for a screen reader')
  // A click blurs the input first, so the blur carries the pre-toggle text.
  // Without its own commit the toggle would look right and save nothing.
  ok(/onClick=\{\(\) => set\([\s\S]*?, true\)\}/.test(field),
    'and commits on its own rather than relying on the blur it causes')

  // A plus handicap has to survive being typed
  const setup = require('fs').readFileSync(files[1], 'utf-8')
  ok(setup.includes('parseHandicap('), 'a handicap is read with parseHandicap, not parseFloat')
  ok(!/parseFloat\((newHandicap|e\.target\.value)\)/.test(setup),
    '  …because parseFloat("+1") is 1, and stores a plus one as an ordinary one')
}

// ─── Passcode ──────────────────────────────────────────────────

section('Passcode rules')
{
  eq(passcodeError('1234'), null, 'four digits is fine')
  eq(passcodeError('12345678'), null, 'eight digits is fine')
  ok(isPasscodeValid('4821'), 'a typical code passes')

  ok(passcodeError('') !== null, 'empty is refused')
  ok(passcodeError('123') !== null, 'three digits is too short')
  ok(passcodeError('123456789') !== null, 'nine digits is too long')
  ok(passcodeError('12a4') !== null, 'letters are refused')
  ok(passcodeError('12 4') !== null, 'spaces are refused')
  ok(passcodeError('-123') !== null, 'a sign is refused')

  ok(passcodeError('123')!.includes(String(MIN_PASSCODE)), 'the message names the minimum')
  ok(passcodeError('123456789')!.includes(String(MAX_PASSCODE)), 'and the maximum')
  ok(/numbers only/i.test(passcodeError('abcd')!), 'and explains why letters fail')
}

// Hashing is async, and CJS output has no top-level await
async function main() {
  section('Hashing')
  {
    const hash = await hashPasscode('4821')
    eq(hash.length, 64, 'a SHA-256 digest is 64 hex characters')
    ok(/^[0-9a-f]{64}$/.test(hash), 'and is lower-case hex, matching the column constraint')
    ok(!hash.includes('4821'), 'the passcode itself does not appear in the hash')

    eq(await hashPasscode('4821'), hash, 'the same code always hashes the same')
    ok(await hashPasscode('4822') !== hash, 'a different code hashes differently')

    ok(await verifyPasscode('4821', hash), 'the right code verifies')
    ok(!(await verifyPasscode('4822', hash)), 'a wrong code does not')
    ok(!(await verifyPasscode('', hash)), 'nor does an empty one')

    // No passcode set means settings are simply open
    ok(await verifyPasscode('', null), 'with no passcode set, anything passes')
    ok(await verifyPasscode('9999', null), 'because there is nothing to check')

    ok(isLocked(hash), 'a trip with a hash is locked')
    ok(!isLocked(null), 'a trip without one is not')
    ok(!isLocked(''), 'and neither is an empty string')
    ok(!isLocked(undefined), 'nor a missing value')
  }

  section('The lock is offered at creation, with its warning')
  {
    // The lock sits on step 4, so it is not in step 1's markup
    const source = require('fs').readFileSync(
      'app/dashboard/create/CreateTripForm.tsx', 'utf-8')
    // The wording follows the door the wizard was opened through — "Lock
    // trip settings" on a trip, "Lock event settings" on a tournament.
    ok(source.includes('Lock {noun} settings'), 'the option is on the form')
    ok(source.includes('label={`Lock ${noun} settings`}'), 'as a labelled switch')
    ok(source.includes('tripRow.settings_passcode_hash = passcodeHash'),
      'and the hash is stored on the trip')
    // Sent only when a passcode exists: a database that has not had that
    // column added yet must still be able to create ordinary trips.
    ok(source.includes('if (passcodeHash) tripRow.settings_passcode_hash'),
      'but only when one was actually set')
    ok(source.includes('describeError'),
      'and a failed insert reports what the database actually said')
    ok(source.includes('hashPasscode(passcode)'),
      'hashed on the device, so the code itself is never sent')
    ok(source.includes('This can only be set now'),
      'the warning states it is a one-time choice')
    // The reason it cannot be handed over later was cut in the copy review;
    // what the warning still has to do is say that it cannot.
    ok(/no way to add, change or remove your passcode later/.test(source),
      'and states it cannot be changed later')
    ok(source.includes('Write it down'), 'and tells you to keep it')
  }

  // ─── Trip code display ─────────────────────────────────────────

  section('The trip description is normalised, never trusted raw')
  {
    eq(normalizeDescription('  Five rounds. Loser buys dinner.  '),
      'Five rounds. Loser buys dinner.', 'trimmed at both ends')
    eq(normalizeDescription(''), null, 'blank is null')
    eq(normalizeDescription('   \n  '), null, 'whitespace alone is null')
    eq(normalizeDescription(null), null, 'null stays null')
    eq(normalizeDescription(undefined), null, 'undefined is null')
    eq(normalizeDescription('a\r\nb'), 'a\nb', 'Windows newlines fold to plain ones')
    eq(normalizeDescription('a\n\n\n\nb'), 'a\n\nb', 'runs of blank lines fold to one paragraph break')
    const long = normalizeDescription('x'.repeat(MAX_TRIP_DESCRIPTION + 100))
    eq(long!.length, MAX_TRIP_DESCRIPTION, 'a paste is capped at the same limit the box types to')

    // Both forms write through the same normaliser — the cap and the
    // fold are one rule, not a per-screen convention.
    const createSrc = require('fs').readFileSync('app/dashboard/create/CreateTripForm.tsx', 'utf-8')
    ok(createSrc.includes('normalizeDescription(description)'),
      'creation writes the normalised description')
    ok(createSrc.includes('MAX_TRIP_DESCRIPTION'),
      'and the box caps typing at the shared limit')
    const setupSrc = require('fs').readFileSync('app/trip/[tripCode]/setup/TripSetupClient.tsx', 'utf-8')
    ok(setupSrc.includes('normalizeDescription(description)'),
      'trip settings writes the normalised description')
    ok(setupSrc.includes('MAX_TRIP_DESCRIPTION'),
      'with the same cap on the box')

    // …and the box opens with what is already stored in it. The drawer
    // rendered a textarea seeded from `trip.description` while the page
    // building that prop never included the column, so Trip Settings opened
    // blank on every trip that had a description and the only way to change
    // one was to type it out again.
    const setupPage = require('fs').readFileSync('app/trip/[tripCode]/setup/page.tsx', 'utf-8')
    ok(/description:\s*trip\.description/.test(setupPage),
      'the setup page hands the stored description down to the settings drawer')

    // The hub shows it clamped: three lines, the browser’s own ellipsis,
    // and the paragraph as the tap that opens the rest.
    const hubSrc = require('fs').readFileSync('app/trip/[tripCode]/TripDescription.tsx', 'utf-8')
    ok(hubSrc.includes('line-clamp-3'), 'the hub clamps to three lines')
    ok(hubSrc.includes('aria-expanded'), 'the toggle says which state it is in')

    // Whether it is tappable at all is a measurement, and one taken on
    // mount alone was wrong often enough to read as a dead tap: the display
    // face swaps in afterwards, and the paragraph's width can change
    // without the window's. Both are re-asked.
    ok(hubSrc.includes('ResizeObserver'),
      'the clip is re-measured when the paragraph itself resizes')
    ok(hubSrc.includes('document.fonts'),
      '  …and again once the display face has loaded')
    // The paragraph moves from a div into a button the moment it becomes
    // tappable, so React builds a new node. Held in state, the effect
    // re-runs on it; held in a ref, the observer watches a detached one.
    ok(!hubSrc.includes('useRef'),
      'the paragraph is held in state, so the observer follows it into the button')
    const hubPage = require('fs').readFileSync('app/trip/[tripCode]/page.tsx', 'utf-8')
    ok(hubPage.includes('<TripDescription'), 'the hub renders the description')
    ok(hubPage.indexOf('<TripDescription') > hubPage.indexOf('<TripCountdown'),
      'under the countdown, where it belongs')
  }

  section('The composite-card number boxes can be seen and cannot balloon')
  {
    const setup = require('fs').readFileSync(
      'app/components/LeaderboardSetup.tsx', 'utf-8')

    // Both keypads shared a row with their chips and were squeezed to a
    // sliver — the number being typed was invisible, and a number typed
    // blind is how "the last 18" got stored on a real trip. Each now sits
    // on a row of its own, sized to the two digits it can hold — and sized
    // with max-w, not w-*: FIELD carries w-full, two width utilities are a
    // stylesheet-order coin toss, and w-full won it in production, which is
    // how the box came to span the whole card.
    const boxes = setup.match(/max-w-\[4\.5rem\] flex-none text-center text-lg tabular-nums/g) ?? []
    eq(boxes.length, 2, 'the counting and finish keypads are two-digit boxes on their own rows')
    ok(!/\$\{FIELD\} w-\d+ flex-none/.test(setup),
      'sized by max-w — a w-* beside FIELD\'s own w-full is a coin toss it loses')
    ok(!/\$\{FIELD\} flex-1 min-w-0 tabular-nums/.test(
      setup.slice(setup.indexOf('function CountingScoresPicker'))),
      'and neither is a flex sliver beside its chips any more')

    // A blur used to round any figure to the nearest legal value, so a
    // doubled digit — "33" — stored an 18-hole finish: every hole open to
    // everyone, which reads as the counting setting being ignored. An
    // out-of-range number now goes back to what the board holds.
    const finish = setup.slice(setup.indexOf('function GrandstandFinishPicker'),
                               setup.indexOf('function RoundLinks'))
    ok(!/Math\.min\(18, Math\.round/.test(finish),
      'an out-of-range finish is never rounded into a real one')
    ok(finish.includes('setText(String(value > 0 ? value : 3))'),
      'it reverts to the stored answer instead')
    const counting = setup.slice(setup.indexOf('function CountingScoresPicker'),
                                 setup.indexOf('function GrandstandFinishPicker'))
    ok(!/Math\.min\(MAX_COUNTING_SCORES, Math\.round/.test(counting),
      'and the same for the counting box')
    ok(counting.includes('setText(String(value))'),
      'which also reverts rather than inventing an answer')
  }

  section('The generated trip code fits its box')
  {
    const source = require('fs').readFileSync(
      'app/dashboard/create/CreateTripForm.tsx', 'utf-8')

    // Letter-spacing adds a gap after the final character too, which pushed the
    // code past the right edge. Characters are laid out with a gap instead.
    ok(!source.includes("text-6xl text-[#C9A84C] tracking-[0.2em]"),
      'the code no longer uses trailing letter-spacing at a fixed huge size')
    ok(source.includes("resultCode.split('')"),
      'it is laid out character by character')
    ok(source.includes('clamp('),
      'and scales with the viewport rather than a fixed size')
  }

  console.log(`\n${'─'.repeat(56)}`)
  if (failed === 0) console.log(`✓ all ${passed} checks passed`)
  else {
    console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
    for (const f of failures) console.log(`   · ${f}`)
    process.exitCode = 1
  }
}

main()
