/**
 * Support-link tests. Run with: npm run test:support
 *
 * The whole feature is one optional link, so what matters is the "optional"
 * half: with NEXT_PUBLIC_DONATION_URL unset, or set to something that is not
 * a usable address, nothing renders at all. No gap, no placeholder, no broken
 * href — the app is exactly as it was before the variable existed.
 *
 * The href is also checked before it is rendered. It is our own environment
 * variable rather than user input, but an href is one of the few places a bad
 * string becomes executable, and it costs nothing to refuse one.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { sanitiseDonationUrl } from '../lib/donation'

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

const REVOLUT = 'https://checkout.revolut.com/pay/9eab73e4-3a41-48bc-9df5-cfef05dcd477'

// ─── What counts as a link ─────────────────────────────────────

section('A real payment address is kept')
{
  eq(sanitiseDonationUrl(REVOLUT), REVOLUT, 'the Revolut link passes through unchanged')
  eq(sanitiseDonationUrl(`  ${REVOLUT}  `), REVOLUT, 'with surrounding whitespace trimmed')
  ok(sanitiseDonationUrl('https://example.com/pay') !== null, 'any https address is fine')
  ok(sanitiseDonationUrl('https://example.com/pay?amount=5') !== null,
    'query strings survive, in case the link ever carries one')
}

section('Nothing configured means no link')
{
  eq(sanitiseDonationUrl(undefined), null, 'an unset variable gives nothing')
  eq(sanitiseDonationUrl(null), null, 'so does null')
  eq(sanitiseDonationUrl(''), null, 'so does an empty string')
  eq(sanitiseDonationUrl('   '), null, 'so does whitespace')
}

section('Anything that is not a usable address gives nothing')
{
  eq(sanitiseDonationUrl('not a url'), null, 'plain text is refused')
  eq(sanitiseDonationUrl('checkout.revolut.com/pay/abc'), null,
    'an address with no scheme is refused rather than guessed at')

  // The one that actually matters: an href is executable
  eq(sanitiseDonationUrl('javascript:alert(1)'), null, 'a javascript: URL is refused')
  eq(sanitiseDonationUrl('JavaScript:alert(1)'), null, 'however it is capitalised')
  eq(sanitiseDonationUrl('data:text/html,<script>alert(1)</script>'), null,
    'so is a data: URL')
  eq(sanitiseDonationUrl('vbscript:msgbox(1)'), null, 'and anything else exotic')
  eq(sanitiseDonationUrl('file:///etc/passwd'), null, 'and a file: URL')
}

// ─── The component ─────────────────────────────────────────────
//
// The module reads process.env when it loads, so each case sets the variable
// and imports fresh. require() is used deliberately — a static import would
// be hoisted above the assignment and read the wrong value.

function renderWith(url: string | undefined): string {
  if (url === undefined) delete process.env.NEXT_PUBLIC_DONATION_URL
  else process.env.NEXT_PUBLIC_DONATION_URL = url
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  delete require.cache[require.resolve('../app/components/SupportLink')]
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  delete require.cache[require.resolve('../lib/donation')]
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Mod = require('../app/components/SupportLink')
  return renderToStaticMarkup(React.createElement(Mod.default))
}

section('With an address set, the link is there')
{
  const html = renderWith(REVOLUT)

  ok(html.includes(REVOLUT), 'it points at the configured address')
  ok(html.includes('target="_blank"'), 'and opens in a new tab')
  // noopener stops the payment page reaching back into ours; noreferrer keeps
  // our URL out of its logs. Both, not either.
  ok(html.includes('noopener'), 'with noopener')
  ok(html.includes('noreferrer'), 'and noreferrer')

  ok(html.includes('Enjoy the app?'), 'the invitation is shown')
  ok(html.includes('grow the game'), 'in full')
  ok(html.includes('green dots'), 'and the button says what it says')
  ok(html.includes('🟢'), 'green dot and all')
}

section('It is a link, not an interruption')
{
  const html = renderWith(REVOLUT)

  // "not a popup, not a modal, not anything that interrupts"
  ok(html.startsWith('<div'), 'it is a plain block in the page flow')
  ok(!html.includes('fixed'), 'nothing is pinned to the viewport')
  ok(!html.includes('position:'), 'and nothing is positioned out of the flow')
  ok(!html.includes('z-'), 'it sits above nothing')
  ok(!html.includes('<dialog'), 'it is not a dialog')
  ok(!html.includes('<button'), 'and not a button that could be mistaken for an action')
  ok(html.includes('<a '), 'just an anchor')
}

section('With nothing configured, nothing renders')
{
  eq(renderWith(undefined), '', 'an unset variable renders absolutely nothing')
  eq(renderWith(''), '', 'so does an empty one')
  eq(renderWith('   '), '', 'so does whitespace')
  eq(renderWith('not a url'), '', 'so does a value that is not an address')

  // The important one: a dangerous value must not render a link either
  eq(renderWith('javascript:alert(1)'), '', 'and a javascript: URL renders nothing at all')
}

section('It never renders an empty shell')
{
  // A wrapper with padding but no link would leave a gap at the foot of the
  // page — the feature has to disappear completely, not merely go blank.
  for (const bad of ['', '   ', 'nope', 'javascript:alert(1)']) {
    const html = renderWith(bad)
    ok(!html.includes('Enjoy the app?'), `"${bad}" leaves no invitation behind`)
    ok(!html.includes('<div'), `"${bad}" leaves no wrapper behind either`)
  }
}

// Leave the environment as it was found
delete process.env.NEXT_PUBLIC_DONATION_URL

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
