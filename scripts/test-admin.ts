/**
 * Admin and lead-email tests. Run with: npm run test:admin
 *
 * Three things, each with a different reason for existing:
 *
 *   · the email field is optional, so what is asserted is mostly that bad
 *     input produces null rather than an error — it must never be able to
 *     stop a trip being created
 *   · trip status is derived from three columns that each mean something
 *     else, so the combination is worth pinning
 *   · the admin session is the only real lock in this codebase. A forgeable
 *     cookie would expose every organiser's email address, so the signing is
 *     tested adversarially: tampered payloads, swapped secrets, stripped
 *     signatures, expired tokens.
 */

import { looksLikeEmail, normaliseEmail, emailWarning, MAX_EMAIL } from '../lib/email'
import { tripState, todayString } from '../lib/tripStatus'
import {
  signSession, verifySession, newSession, passwordMatches, SESSION_HOURS,
} from '../lib/adminAuth'

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

// ─── The optional email ────────────────────────────────────────

section('An address is recognised')
{
  for (const good of [
    'ross@example.com',
    'ross.grady@example.co.uk',
    'ross+golf@example.com',
    'r@ex.ie',
    "o'brien@example.com",
  ]) {
    ok(looksLikeEmail(good), `"${good}" is an address`)
  }
}

section('Anything else is not, and that is not an error')
{
  for (const bad of [
    'ross',              // no @
    'ross@',             // nothing after it
    '@example.com',      // nothing before it
    'ross@example',      // no dot in the domain
    'ross@example.',     // nothing after the dot
    'ross@example.c',    // a one-letter tail
    'ross @example.com', // a space
    'ross@@example.com', // two @
    'ross..g@example.com', // consecutive dots
    'ross.@example.com', // a dot against the @
    'a@b.c',             // too short to be anything
  ]) {
    ok(!looksLikeEmail(bad), `"${bad}" is not an address`)
    // The important half: it comes back as null, not as a thrown error
    eq(normaliseEmail(bad), null, `"${bad}" stores as nothing`)
  }

  ok(!looksLikeEmail('r'.repeat(MAX_EMAIL) + '@example.com'), 'an over-long address is refused')
}

section('Nothing given is nothing stored')
{
  eq(normaliseEmail(''), null, 'an empty string is nothing')
  eq(normaliseEmail('   '), null, 'so is whitespace')
  eq(normaliseEmail(null), null, 'so is null')
  eq(normaliseEmail(undefined), null, 'so is undefined')
}

section('A stored address is tidied first')
{
  eq(normaliseEmail('  Ross@Example.COM  '), 'ross@example.com',
    'trimmed and lowercased, so the same person reads as the same person')
  eq(normaliseEmail('ROSS@EXAMPLE.COM'), normaliseEmail('ross@example.com'),
    'however it was typed')
}

section('The warning waits until it is a mistake')
{
  eq(emailWarning(''), null, 'an empty field is not a mistake')
  eq(emailWarning('ross'), null, 'nor is a field being typed into')
  eq(emailWarning('ross@'), null, 'nor one stopped at the @')
  eq(emailWarning('ross@example.com'), null, 'and a good address says nothing')

  ok(emailWarning('ross@example')?.includes('will not be saved') === true,
    'a domain with no dot is flagged, and says what happens')
  ok(emailWarning('ross @example.com') !== null, 'so is one with a space in it')
}

// ─── Trip status ───────────────────────────────────────────────

const TODAY = '2026-07-30'

section('A trip in setup is in setup')
{
  // Whatever the dates say: the organiser has not opened scoring
  eq(tripState({ setup_status: 'draft' }, TODAY).key, 'draft', 'a draft trip is in setup')
  eq(tripState({ setup_status: 'draft', start_date: '2020-01-01', end_date: '2020-01-05' }, TODAY).key,
    'draft', 'even with dates long past')
  eq(tripState({ setup_status: 'draft' }, TODAY).label, 'In setup', 'and says so')
}

section('A live trip is placed by its dates')
{
  const live = (start: string | null, end: string | null) =>
    tripState({ setup_status: 'live', start_date: start, end_date: end }, TODAY).key

  eq(live('2026-08-10', '2026-08-14'), 'upcoming', 'starting later is upcoming')
  eq(live('2026-07-28', '2026-08-02'), 'active', 'started and not finished is playing')
  eq(live('2026-07-01', '2026-07-05'), 'completed', 'finished is completed')

  // The edges, which is where a naive comparison goes wrong
  eq(live('2026-07-30', '2026-08-02'), 'active', 'a trip starting today is playing, not upcoming')
  eq(live('2026-07-25', '2026-07-30'), 'active', 'and one ending today is still playing')
  eq(live('2026-07-25', '2026-07-29'), 'completed', 'it completes the day after it ends')

  // Missing dates are common — nothing forces them at creation
  eq(live(null, null), 'active', 'a live trip with no dates is playing')
  eq(live(null, '2026-07-01'), 'completed', 'an end date alone is enough to complete it')
  eq(live('2026-08-10', null), 'upcoming', 'and a start date alone is enough to postpone it')
}

section('Trips from before the lifecycle column read as live')
{
  // Migration 010 marked them all live; rows read without the column are the
  // same thing, and must not come back as drafts
  eq(tripState({ start_date: '2026-07-01', end_date: '2026-07-05' }, TODAY).key, 'completed',
    'a missing setup_status is live, not draft')
  eq(tripState({ setup_status: null }, TODAY).key, 'active', 'and so is an explicit null')
}

section('Open means somebody is still doing something')
{
  eq(tripState({ setup_status: 'draft' }, TODAY).open, true, 'a trip in setup is open')
  eq(tripState({ setup_status: 'live', start_date: '2026-08-10' }, TODAY).open, true,
    'an upcoming one is open')
  eq(tripState({ setup_status: 'live', end_date: '2026-07-01' }, TODAY).open, false,
    'a completed one is not')
}

section('Today is a plain date, not a moment')
{
  eq(todayString(new Date(2026, 6, 30, 23, 45)), '2026-07-30',
    'late in the evening is still that day')
  eq(todayString(new Date(2026, 0, 5, 0, 1)), '2026-01-05',
    'and single digits are padded')
}

// ─── The admin session ─────────────────────────────────────────

const SECRET = 'correct-horse-battery-staple'
const NOW = 1_800_000_000_000

section('The password is compared without leaking it')
{
  ok(passwordMatches('hunter2', 'hunter2'), 'the right password matches')
  ok(!passwordMatches('hunter3', 'hunter2'), 'a wrong one does not')
  ok(!passwordMatches('hunter', 'hunter2'), 'nor does a prefix of it')
  ok(!passwordMatches('hunter2extra', 'hunter2'), 'nor does it with more on the end')
  ok(!passwordMatches('', 'hunter2'), 'nor an empty guess')

  // With nothing configured, nothing gets in. An unset variable is what a
  // misconfigured deploy looks like, and it must not read as "no lock".
  ok(!passwordMatches('anything', null), 'no configured password lets nobody in')
  ok(!passwordMatches('', null), 'not even an empty guess')
}

section('A session token is accepted only when it is genuinely ours')
{
  const token = newSession(NOW, SECRET)
  ok(verifySession(token, SECRET, NOW), 'a fresh token verifies')
  ok(verifySession(token, SECRET, NOW + SESSION_HOURS * 3600_000 - 1000),
    'and still does just before it expires')
}

section('A forged or tampered token does not')
{
  const token = newSession(NOW, SECRET)
  const [exp, sig] = token.split('.')

  // The whole point: a cookie anyone could type must not work
  ok(!verifySession('1', SECRET, NOW), 'a bare "1" is not a session')
  ok(!verifySession('admin', SECRET, NOW), 'nor is the word admin')
  ok(!verifySession('', SECRET, NOW), 'nor an empty string')
  ok(!verifySession(null, SECRET, NOW), 'nor a missing cookie')
  ok(!verifySession(undefined, SECRET, NOW), 'nor an undefined one')

  // Extending your own session by editing the expiry
  const later = String(Number(exp) + 10_000_000)
  ok(!verifySession(`${later}.${sig}`, SECRET, NOW),
    'moving the expiry breaks the signature')

  // Dropping the signature entirely
  ok(!verifySession(exp, SECRET, NOW), 'a payload with no signature is refused')
  ok(!verifySession(`${exp}.`, SECRET, NOW), 'so is an empty signature')
  ok(!verifySession(`.${sig}`, SECRET, NOW), 'and so is a missing payload')

  // Signature from a different secret — i.e. someone else's deployment
  ok(!verifySession(signSession(NOW + 3600_000, 'a-different-password'), SECRET, NOW),
    'a token signed with another password is refused')

  // Changing the password logs everyone out, which is the point of signing
  // with it: it doubles as a revoke.
  ok(!verifySession(token, 'the-password-was-changed', NOW),
    'and an old token stops working once the password changes')

  // Nothing verifies against no secret
  ok(!verifySession(token, null, NOW), 'with no password configured, nothing verifies')

  // A signature of the right shape but the wrong content
  const wrong = sig.split('').reverse().join('')
  ok(!verifySession(`${exp}.${wrong}`, SECRET, NOW), 'a scrambled signature is refused')

  // Non-numeric payloads must not slip past the expiry check
  ok(!verifySession('abc.' + sig, SECRET, NOW), 'a non-numeric expiry is refused')
  ok(!verifySession('-1.' + sig, SECRET, NOW), 'so is a negative one')
}

section('A session expires')
{
  const token = newSession(NOW, SECRET)
  ok(!verifySession(token, SECRET, NOW + SESSION_HOURS * 3600_000 + 1),
    'a token past its expiry is refused, signature and all')

  const stale = signSession(NOW - 1000, SECRET)
  ok(!verifySession(stale, SECRET, NOW), 'and one that was already expired never worked')

  // Exactly at the boundary, refuse. An off-by-one that stays logged in is
  // the wrong direction to be wrong in.
  const at = signSession(NOW, SECRET)
  ok(!verifySession(at, SECRET, NOW), 'expiring exactly now counts as expired')
}

section('The session is a sensible length')
{
  ok(SESSION_HOURS > 0, 'a session lasts some time')
  ok(SESSION_HOURS <= 24, 'but not more than a day — a borrowed phone stops working')
}

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) console.log(`✓ all ${passed} checks passed`)
else {
  console.log(`✗ ${failed} of ${passed + failed} checks failed:`)
  for (const f of failures) console.log(`   · ${f}`)
  process.exitCode = 1
}
