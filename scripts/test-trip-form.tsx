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
import DateField from '../app/components/DateField'
import CreateTripForm from '../app/dashboard/create/CreateTripForm'
import TripSetupClient from '../app/trip/[tripCode]/setup/TripSetupClient'
import { MIN_ROUNDS, MAX_ROUNDS, roundCountError, isRoundCountValid } from '../lib/tripLimits'
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

const courses = [
  { id: 'c1', name: 'Ballyliffin Old' },
  { id: 'c2', name: 'Portsalon' },
]
const formHtml = renderToStaticMarkup(
  React.createElement(CreateTripForm, { courses })
)

section('Rounds control')
{
  ok(formHtml.includes('Number of rounds'), 'the control is labelled')
  ok(formHtml.includes('aria-label="Add a round"'), 'there is an add button')
  ok(formHtml.includes('>+<'), 'and it shows a plus')

  // Presets run 1..MAX_ROUNDS — no hardcoded 7 any more
  for (let n = MIN_ROUNDS; n <= MAX_ROUNDS; n++) {
    ok(formHtml.includes(`>${n}<`), `preset ${n} is offered`)
  }

  // The row has a fixed number of equal columns that can shrink
  ok(formHtml.includes('repeat(7, minmax(0, 1fr))'),
    'the rounds row uses shrinkable equal columns')
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
  const html = renderToStaticMarkup(
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
  ok(html.includes('type="date"'), 'setup renders date fields')
  ok(html.includes('min-width:0'), 'with the same shrink fix')
  ok(html.includes('repeat(2, minmax(0, 1fr))'), 'and the same two-column row')
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
    const fields  = (src.match(/placeholder="(Handicap|HCP)/g) ?? []).length
    const keypads = (src.match(/inputMode="decimal"/g) ?? []).length
    const name = f.split('/').pop()
    ok(fields > 0, `${name} has a handicap field`)
    ok(keypads >= fields, `${name}: every handicap field asks for the decimal keypad`)
  }
  // A handicap carries a decimal, so the whole-number keypad would be wrong
  const create = require('fs').readFileSync(files[0], 'utf-8')
  ok(!/inputMode="numeric"[\s\S]{0,80}placeholder="Handicap"/.test(create),
    'not the whole-number keypad, since handicaps have a decimal')
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
    ok(source.includes('Lock trip settings'), 'the option is on the form')
    ok(source.includes('label="Lock trip settings"'), 'as a labelled switch')
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
    ok(/anyone\s+with your trip code could lock you out/.test(source),
      'and explains why it cannot be changed later')
    ok(source.includes('Write it down'), 'and tells you to keep it')
  }

  // ─── Trip code display ─────────────────────────────────────────

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
