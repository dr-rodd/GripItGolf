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
        formats: { individual_stableford: true },
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

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
