/**
 * A person's account, stage (a). Run with: npm run test:account
 *
 * Three halves:
 *
 *   · the rules in lib/account.ts — the email, the code, what an account is,
 *     and moving a phone's events onto one without lowering anything;
 *   · /api/account's logic (app/api/account/account.ts) against a stand-in
 *     store — the ticket, the merge, deleting, and every refusal;
 *   · **nobody needs an account** — read off the source: only
 *     lib/accountClient.ts asks Supabase for an email code, only the account
 *     page imports it, no trip, scoring, join or run file names it, the
 *     account route is the only one that reads an account, and nothing links
 *     to the page until ACCOUNTS_LINKED is switched on.
 */

import fs from 'fs'
import path from 'path'
import {
  ACCOUNTS_LINKED, ACCOUNT_PATH, ACCOUNT_WORDS, CODE_LENGTH, MERGE_TICKET_MS, PASSWORD_MAX, PASSWORD_MIN,
  RESERVED_USERNAMES, SIGN_IN_FAILED, SIGN_IN_LIMITS, USERNAME_CHECK_LIMIT, codeDigits, codeIssue, credentialsRefused,
  emailIssue, isAccount, mergeMemberships, normaliseEmail, normaliseUsername, passwordIssue, signInRoute, usernameIssue,
  type AuthUser,
} from '../lib/account'
import { attemptKey, readTicket, runAccount, type AccountStore } from '../app/api/account/account'
import type { AttemptWindow } from '../lib/membership'
import { sealJson } from '../lib/signedState'
import type { Membership } from '../lib/membership'

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

// ─── The rules ─────────────────────────────────────────────────

function ruleTests() {
  section('The email and the code')
  eq(normaliseEmail('  Ross@Example.IE '), 'ross@example.ie', 'an email is kept trimmed and lower case')
  eq(emailIssue('ross@example.ie'), null, 'a plain address will do')
  ok(emailIssue('') !== null && emailIssue('ross') !== null && emailIssue('ross@example') !== null, '…an empty, bare or domainless one will not')
  eq(CODE_LENGTH, 6, 'the code is six digits')
  eq(codeDigits(' 12-34 567 '), '123456', 'only digits are kept, never more than a code')
  eq(codeIssue('123456'), null, 'six digits will do')
  ok(codeIssue('12345') !== null, '…five will not')

  section('What an account is')
  const u = (over: Partial<AuthUser>): AuthUser => ({ id: 'u', isAnonymous: false, email: 'a@b.ie', emailConfirmed: true, ...over })
  ok(isAccount(u({})), 'an email a code has confirmed is an account')
  ok(!isAccount(u({ isAnonymous: true })), 'a phone is not, even with an email waiting')
  ok(!isAccount(u({ emailConfirmed: false })), 'an unconfirmed email is not')
  ok(!isAccount(u({ email: null })) && !isAccount(null), 'nor no email, nor nobody')

  section('Moving a phone’s events onto an account never lowers anything')
  const m = (role: Membership['role'], playerId: string | null, organiserUntil: string | null): Membership => ({ role, playerId, organiserUntil })
  eq(mergeMemberships(null, m('player', 'p1', null)), m('player', 'p1', null), 'an event the account had not entered comes across whole')
  eq(mergeMemberships(m('guest', null, null), m('player', 'p1', null)).role, 'player', 'the higher field role wins')
  eq(mergeMemberships(m('player', 'p1', null), m('guest', null, null)).role, 'player', '…whichever side has it')
  eq(mergeMemberships(m('guest', null, '2026-11-14T10:00:00.000Z'), m('guest', null, '2026-11-14T12:00:00.000Z')).organiserUntil,
    '2026-11-14T12:00:00.000Z', 'the later organiser grant is kept')
  eq(mergeMemberships(m('guest', null, '2026-11-14T12:00:00.000Z'), m('guest', null, null)).organiserUntil,
    '2026-11-14T12:00:00.000Z', '…and never cleared by a phone without one')
  eq(mergeMemberships(m('player', 'mine', null), m('player', 'phone', null)).playerId, 'mine', 'two claims: the account’s own stays')
  eq(mergeMemberships(m('guest', null, null), m('player', 'phone', null)).playerId, 'phone', 'one claim: kept')

  section('Usernames (D130)')
  eq(usernameIssue('Ross.OG'), null, 'letters, numbers and dots will do — capitals are folded')
  eq(normaliseUsername('  Ross.OG '), 'ross.og', '…kept trimmed and lower case')
  eq(usernameIssue('ross_og_1'), null, 'underscores and digits will do')
  ok(usernameIssue('ro') !== null && usernameIssue('a'.repeat(21)) !== null, 'fewer than 3 or more than 20 will not')
  eq(usernameIssue('abc'), null, '…3 is enough')
  eq(usernameIssue('a'.repeat(20)), null, '…and 20 is not too many')
  ok(usernameIssue('ross@og') === 'A username can’t have an @ in it.', 'an @ is refused, so a username can never pass for an email')
  ok(usernameIssue('.ross') !== null && usernameIssue('ross.') !== null, 'no dot at either end')
  ok(usernameIssue('ross og') !== null && usernameIssue('ross-og') !== null && usernameIssue('rossé') !== null, 'spaces, hyphens and accents refused')
  for (const r of ['admin', 'greendot', 'support', 'root', 'help', 'Admin', 'green.dot', 'green_dot', 'greendotlive']) {
    eq(usernameIssue(r), 'That username isn’t available.', `reserved: ${r}`)
  }
  ok(RESERVED_USERNAMES.every(r => r === r.toLowerCase()), 'the reserved list is lower case, compared after folding')
  eq(usernameIssue(''), 'Choose a username.', 'empty asks for one')

  section('Passwords (D131)')
  eq(PASSWORD_MIN, 8, 'at least 8')
  eq(PASSWORD_MAX, 72, 'at most 72 (bcrypt reads no further)')
  ok(passwordIssue('1234567') !== null, '7 is too short')
  eq(passwordIssue('12345678'), null, '8 of anything will do — no other rule')
  eq(passwordIssue('aaaaaaaa'), null, '…not even a mix of kinds')
  ok(passwordIssue('x'.repeat(73)) !== null, '73 is too long')
  ok(passwordIssue('é'.repeat(40)) !== null, '…counted in bytes, as bcrypt counts')

  section('Signing in: one field, an @ means email (D132)')
  eq(signInRoute('Ross@Example.ie '), { kind: 'email', email: 'ross@example.ie' }, 'an @ is an email')
  eq(signInRoute(' Ross.OG'), { kind: 'username', username: 'ross.og' }, 'anything else a username')
  eq(SIGN_IN_FAILED, 'Wrong username, email or password', 'the one message for every failure')

  section('Juniors (D108)')
  ok(credentialsRefused({ junior: true }), 'a junior profile is refused a username and a password')
  ok(!credentialsRefused({ junior: false }) && !credentialsRefused({}), '…anybody else is not')

  section('The words (D133): a Green Dot member, never a bare member')
  const screen = read('app/account/AccountScreen.tsx')
  const wordsSrc = read('lib/account.ts').slice(read('lib/account.ts').indexOf('export const ACCOUNT_WORDS'))
  const strings = [...(screen + wordsSrc).matchAll(/(['"`])((?:(?!\1).)*?)\1/g)].map(m => m[2])
  const bare = strings.filter(t => /\bmembers?\b/i.test(t) && !/Green Dot members?\b/.test(t))
  eq(bare, [], 'no screen word says member without Green Dot before it')
  ok(Object.values(ACCOUNT_WORDS).some(w => typeof w === 'string' && w.includes('Green Dot member')), 'the words say Green Dot member')
}

// ─── The route ─────────────────────────────────────────────────

class Stand implements AccountStore {
  users = new Map<string, AuthUser>()
  tokens = new Map<string, string>()
  rows = new Map<string, Membership>() // `${user}|${trip}`
  deleted: string[] = []
  usernames = new Map<string, string>() // user → username
  passwords = new Map<string, string>() // email → password
  attempts = new Map<string, AttemptWindow>()
  signIns: string[] = []
  add(user: AuthUser, token: string) { this.users.set(user.id, user); this.tokens.set(token, user.id) }
  async usernameOf(id: string) { return this.usernames.get(id) ?? null }
  async userIdByUsername(u: string) { return [...this.usernames].find(([, n]) => n === u)?.[0] ?? null }
  async setUsername(id: string, u: string): Promise<'ok' | 'taken'> {
    if ([...this.usernames].some(([k, n]) => n === u && k !== id)) return 'taken'
    this.usernames.set(id, u); return 'ok'
  }
  async hasPassword(id: string) { const e = this.users.get(id)?.email; return !!e && this.passwords.has(e) }
  async passwordSignIn(email: string, password: string) {
    this.signIns.push(email)
    if (this.passwords.get(email) !== password) return null
    const u = [...this.users.values()].find(x => x.email === email)
    return u ? { userId: u.id, accessToken: `at-${u.id}`, refreshToken: `rt-${u.id}` } : null
  }
  async readAttempts(keys: string[]) { return new Map(keys.filter(k => this.attempts.has(k)).map(k => [k, this.attempts.get(k)!])) }
  async writeAttempt(key: string, w: AttemptWindow) { this.attempts.set(key, w) }
  async userFromToken(t: string) { const id = this.tokens.get(t); return id ? this.users.get(id) ?? null : null }
  async userById(id: string) { return this.users.get(id) ?? null }
  async membershipsOf(userId: string) {
    return [...this.rows].filter(([k]) => k.startsWith(`${userId}|`)).map(([k, m]) => ({ tripId: k.split('|')[1], m }))
  }
  async readMembership(userId: string, tripId: string) { return this.rows.get(`${userId}|${tripId}`) ?? null }
  async writeMembership(userId: string, tripId: string, m: Membership) { this.rows.set(`${userId}|${tripId}`, m) }
  async deleteUser(id: string) {
    this.deleted.push(id)
    this.users.delete(id)
    this.usernames.delete(id)
    for (const k of [...this.rows.keys()]) if (k.startsWith(`${id}|`)) this.rows.delete(k) // ON DELETE CASCADE
  }
  ticketSecret() { return 'test-ticket-secret' }
}

async function routeTests() {
  const now = new Date('2026-11-14T12:00:00Z')
  const phone: AuthUser = { id: 'phone', isAnonymous: true, email: null, emailConfirmed: false }
  const account: AuthUser = { id: 'acct', isAnonymous: false, email: 'a@b.ie', emailConfirmed: true }
  const other: AuthUser = { id: 'other', isAnonymous: false, email: 'o@b.ie', emailConfirmed: true }
  const fresh = () => {
    const s = new Stand()
    s.add(phone, 'tp'); s.add(account, 'ta'); s.add(other, 'to')
    s.rows.set('phone|T1', { role: 'player', playerId: 'p1', organiserUntil: '2026-11-14T20:00:00.000Z' })
    s.rows.set('phone|T2', { role: 'guest', playerId: null, organiserUntil: null })
    s.rows.set('acct|T2', { role: 'player', playerId: 'p9', organiserUntil: null })
    s.rows.set('other|T1', { role: 'guest', playerId: null, organiserUntil: null })
    return s
  }

  section('The ticket: only a phone, sealed, fifteen minutes')
  {
    const s = fresh()
    eq((await runAccount({ token: null, action: 'ticket' }, s, now)).status, 401, 'no token, no ticket')
    eq((await runAccount({ token: 'ta', action: 'ticket' }, s, now)).status, 409, 'an account asks for none')
    const t = await runAccount({ token: 'tp', action: 'ticket' }, s, now)
    eq(t.status, 200, 'a phone gets one')
    const ticket = t.status === 200 ? t.body.ticket! : ''
    eq(readTicket(ticket, s.ticketSecret(), now.getTime()), 'phone', '…naming that phone')
    eq(readTicket(ticket, s.ticketSecret(), now.getTime() + MERGE_TICKET_MS + 1), null, '…and nothing once its time is up')
    eq(readTicket(ticket, 'another secret', now.getTime()), null, '…nor under another key')
    eq(readTicket(ticket.slice(0, -2) + 'xx', s.ticketSecret(), now.getTime()), null, '…nor tampered with')
  }

  section('The merge: this phone’s events onto the account, then the phone forgotten')
  {
    const s = fresh()
    const t = await runAccount({ token: 'tp', action: 'ticket' }, s, now)
    const ticket = t.status === 200 ? t.body.ticket! : ''
    eq((await runAccount({ token: 'tp', action: 'merge', ticket }, s, now)).status, 403, 'a phone cannot merge into itself as an account')
    eq((await runAccount({ token: 'ta', action: 'merge', ticket: 'nonsense' }, s, now)).status, 400, 'a bad ticket moves nothing')
    eq(s.rows.size, 4, '  …nothing moved')
    const r = await runAccount({ token: 'ta', action: 'merge', ticket }, s, now)
    eq(r.status === 200 && r.body.moved, 2, 'both events moved')
    eq(s.rows.get('acct|T1'), { role: 'player', playerId: 'p1', organiserUntil: '2026-11-14T20:00:00.000Z' }, 'an event the account lacked arrives whole, organiser hours and all')
    eq(s.rows.get('acct|T2'), { role: 'player', playerId: 'p9', organiserUntil: null }, 'an event it had keeps its own claim')
    ok(s.deleted.includes('phone') && !s.users.has('phone'), 'the phone’s old identity is deleted')
    ok(![...s.rows.keys()].some(k => k.startsWith('phone|')), '  …its rows with it, after they were copied')
    eq(s.rows.get('other|T1'), { role: 'guest', playerId: null, organiserUntil: null }, 'nobody else’s row is touched')
    const again = await runAccount({ token: 'ta', action: 'merge', ticket }, s, now)
    eq(again.status === 200 && again.body.moved, 0, 'asked twice, the second finds nothing to move')
  }
  {
    const s = fresh()
    const forged = sealJson({ a: 'other', e: now.getTime() + 60_000 }, s.ticketSecret())
    const r = await runAccount({ token: 'ta', action: 'merge', ticket: forged }, s, now)
    eq(r.status === 200 && r.body.moved, 0, 'a ticket naming another account moves nothing of theirs')
    ok(s.users.has('other') && s.rows.has('other|T1'), '  …and deletes nothing')
    s.users.set('acct', { ...account, emailConfirmed: false })
    eq((await runAccount({ token: 'ta', action: 'merge', ticket: forged }, s, now)).status, 403, 'an email not yet confirmed cannot take a phone’s events')
  }

  section('Deleting an account')
  {
    const s = fresh()
    eq((await runAccount({ token: 'tp', action: 'delete' }, s, now)).status, 403, 'a phone with no account has nothing to delete')
    ok(s.users.has('phone'), '  …and keeps its identity')
    eq((await runAccount({ token: 'ta', action: 'delete' }, s, now)).status, 200, 'an account deletes itself')
    ok(!s.users.has('acct') && !s.rows.has('acct|T2'), '  …its record of its events with it')
    eq((await runAccount({ token: 'to', action: 'what' }, s, now)).status, 400, 'anything else is refused')
  }

  await signInTests(now, fresh, phone, account, other)
}

async function signInTests(
  now: Date, fresh: () => Stand, phone: AuthUser, account: AuthUser, other: AuthUser,
) {
  const signIn = (s: Stand, identifier: string, password: string, token: string | null = 'tp', address = '1.2.3.4') =>
    runAccount({ token, action: 'sign-in', identifier, password, address }, s, now)
  const ready = () => {
    const s = fresh()
    s.usernames.set('acct', 'ross.og')
    s.passwords.set('a@b.ie', 'right-password')
    return s
  }

  section('Usernames on the server')
  {
    const s = ready()
    const st = await runAccount({ token: 'ta', action: 'status' }, s, now)
    eq(st.status === 200 && [st.body.username, st.body.hasPassword], ['ross.og', true], 'status: the username and that a password is set')
    eq((await runAccount({ token: 'tp', action: 'status' }, s, now)).status, 403, '  …a phone with no account has none')
    const taken = await runAccount({ token: 'to', action: 'username-check', username: 'Ross.OG', address: '9' }, s, now)
    eq(taken.status === 200 && taken.body.result, 'taken', 'a username another account has is taken, ignoring case')
    const mine = await runAccount({ token: 'ta', action: 'username-check', username: 'ross.og', address: '9' }, s, now)
    eq(mine.status === 200 && mine.body.result, 'free', '  …your own is not')
    const bad = await runAccount({ token: 'to', action: 'username-check', username: 'admin', address: '9' }, s, now)
    eq(bad.status === 200 && bad.body.result, 'invalid', 'a reserved name is invalid')
    eq((await runAccount({ token: 'to', action: 'set-username', username: 'ross.og' }, s, now)).status, 409, 'setting a taken name is refused')
    eq((await runAccount({ token: 'to', action: 'set-username', username: 'Other_1' }, s, now)).status, 200, 'a free one is saved')
    eq(s.usernames.get('other'), 'other_1', '  …lower case')
    eq((await runAccount({ token: 'to', action: 'set-username', username: 'Other.2' }, s, now)).status, 200, 'and can be changed')
    eq((await runAccount({ token: 'tp', action: 'set-username', username: 'phoneuser' }, s, now)).status, 403, 'a phone with no account gets none')
    s.users.set('other', { ...other, junior: true })
    eq((await runAccount({ token: 'to', action: 'set-username', username: 'kid.one' }, s, now)).status, 403, 'a junior profile is refused a username (D108)')
  }
  {
    const s = ready()
    let last = null as Awaited<ReturnType<typeof runAccount>> | null
    for (let i = 0; i <= USERNAME_CHECK_LIMIT.max; i++) {
      last = await runAccount({ token: 'to', action: 'username-check', username: `name${i}`, address: '5.5.5.5' }, s, now)
    }
    eq(last?.status, 429, `username checks are limited: ${USERNAME_CHECK_LIMIT.max} an address, then refused`)
    const elsewhere = await runAccount({ token: 'to', action: 'username-check', username: 'nameX', address: '6.6.6.6' }, s, now)
    eq(elsewhere.status, 200, '  …per address')
    ok(![...s.attempts.keys()].some(k => k.includes('5.5.5.5')), '  …and the address is only ever kept hashed')
  }

  section('Signing in: one answer to every failure (D132)')
  {
    const s = ready()
    const failures = [
      await signIn(s, 'ross.og', 'wrong-password'),
      await signIn(s, 'nobody.here', 'right-password'),
      await signIn(s, 'a@b.ie', 'wrong-password'),
      await signIn(s, 'nobody@b.ie', 'right-password'),
      await signIn(s, 'ross.og', ''),
      await signIn(s, '', 'right-password'),
      await signIn(s, 'ad', 'right-password'),
    ]
    for (const f of failures) eq([f.status, f.body.ok === false && f.body.error], [401, SIGN_IN_FAILED], '  a failure reads the same')
  }
  {
    const s = ready()
    const r = await signIn(s, 'Ross.OG', 'right-password')
    eq(r.status, 200, 'the username and the right password sign in')
    eq(r.status === 200 && r.body.session, { access_token: 'at-acct', refresh_token: 'rt-acct' }, '  …and hand back the session for the phone')
    ok(!JSON.stringify(r.body).includes('a@b.ie'), '  …and never the email behind the username')
    eq(r.status === 200 && r.body.moved, 2, '  …with the phone’s own events moved across, as the code path moves them')
    ok(!s.users.has('phone') && s.rows.has('acct|T1'), '  …the phone’s old identity forgotten once they are')
    const byEmail = await signIn(ready(), 'A@B.ie', 'right-password')
    eq(byEmail.status, 200, 'the email and the right password sign in too')
    const noPhone = await signIn(ready(), 'ross.og', 'right-password', null)
    eq(noPhone.status === 200 && noPhone.body.moved, 0, 'a phone with no identity of its own still signs in, moving nothing')
  }
  {
    const s = ready()
    s.users.set('acct', { ...account, junior: true })
    eq((await signIn(s, 'ross.og', 'right-password')).status, 401, 'a junior profile never signs in with a password (D108)')
  }
  {
    const s = ready()
    // An account signed in on this phone already is never moved or deleted.
    const r = await signIn(s, 'ross.og', 'right-password', 'to')
    eq(r.status === 200 && r.body.moved, 0, 'signing in on a phone already holding another account moves nothing of theirs')
    ok(s.users.has('other'), '  …and deletes nothing')
  }

  section('Signing in: wrong tries limited, as the PIN is')
  {
    const s = ready()
    for (let i = 0; i < SIGN_IN_LIMITS.address.max; i++) await signIn(s, `guess${i}`, 'wrong-password', 'tp', '7.7.7.7')
    const blocked = await signIn(s, 'ross.og', 'right-password', 'tp', '7.7.7.7')
    eq(blocked.status, 429, `${SIGN_IN_LIMITS.address.max} wrong from one address, then even the right password waits`)
    eq((await signIn(s, 'ross.og', 'right-password', 'tp', '8.8.8.8')).status, 200, '  …another address is not held up')
  }
  {
    const s = ready()
    for (let i = 0; i < SIGN_IN_LIMITS.name.max; i++) await signIn(s, 'ross.og', 'wrong-password', 'tp', `10.0.0.${i}`)
    eq((await signIn(s, 'ross.og', 'right-password', 'tp', '10.0.1.1')).status, 429,
      `${SIGN_IN_LIMITS.name.max} wrong at one name from anywhere, then that name waits`)
    for (let i = 0; i < SIGN_IN_LIMITS.name.max; i++) await signIn(s, 'nobody.at.all', 'x-wrong-pass', 'tp', `10.1.0.${i}`)
    eq((await signIn(s, 'nobody.at.all', 'x-wrong-pass', 'tp', '10.1.1.1')).status, 429,
      '  …counted the same for a name nobody has, so the count says nothing')
    ok(![...s.attempts.keys()].some(k => /ross|10\.0\./.test(k)), '  …the names and addresses only ever kept hashed')
    eq(attemptKey('signin-name', 'ross.og'), attemptKey('signin-name', 'ross.og'), '  …the same name always the same key')
  }
}

// ─── Nobody needs an account ───────────────────────────────────

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return []
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : []
  })
}

function wiringTests() {
  const files = [...walk('app'), ...walk('lib')]
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  section('Nobody needs an account to join, play, score or watch')
  const askers = files.filter(f => /\.(updateUser|signInWithOtp|verifyOtp|setSession)\(/.test(strip(read(f))))
  eq(askers, ['lib/accountClient.ts'], 'one browser file talks to Supabase’s sign-in for accounts')
  const passwordCheckers = files.filter(f => /\.signInWithPassword\(/.test(strip(read(f))))
  eq(passwordCheckers, ['app/api/account/store.ts'], 'a password is checked in one place, on the server')
  ok(!/from\('account_usernames'\)/.test(files.filter(f => /^['"]use client['"]/m.test(read(f))).map(read).join('\n')),
    'no browser file reads the usernames table')
  const importers = files.filter(f => /from ['"]@\/lib\/accountClient['"]|from ['"]\.\/accountClient['"]/.test(read(f)))
  eq(importers, ['app/account/AccountScreen.tsx'], 'only the account page imports it')
  const reached = files.filter(f => f.startsWith('app/api/')
    && /^import (?!type )[^\n]*from ['"](@\/app\/api\/account\/account|\.\/account)['"]/m.test(read(f)))
  eq(reached.sort(), ['app/api/account/route.ts'], 'only /api/account runs the account logic')
  const accountWords = files.filter(f => /isAccount\(/.test(strip(read(f))) && !/^(lib\/account\.ts|app\/api\/account\/)/.test(f))
  eq(accountWords, [], 'nothing outside the account’s own files asks whether a phone has an account')
  for (const dir of ['app/golf', 'app/run', 'app/scoring', 'app/join', 'app/enter', 'app/api/entry', 'app/api/trip']) {
    if (!fs.existsSync(dir)) continue
    const hits = walk(dir).filter(f => /@\/lib\/account(Client)?['"]/.test(read(f)))
    eq(hits, [], `${dir} names no account`)
  }
  const client = read('lib/accountClient.ts')
  ok(!/signInAnonymously\(/.test(client), 'the account page never makes a phone identity of its own — it borrows entryClient’s one')
  ok(/shouldCreateUser: false/.test(client), 'signing in to an existing account never makes one')
  ok(/type: pending\.mode === 'upgrade' \? 'email_change' : 'email'/.test(client), 'the upgrade confirms the email on the phone’s own identity')
  ok(!/throw\b/.test(strip(client)), 'the browser half never throws')

  section('The page is not linked until it has been tried')
  ok(ACCOUNTS_LINKED === false || ACCOUNTS_LINKED === true, 'the switch exists')
  const linkers = files.filter(f => !f.startsWith('app/account/') && new RegExp(`['"\`]${ACCOUNT_PATH}['"\`?#]`).test(strip(read(f))) && f !== 'lib/account.ts')
  if (!ACCOUNTS_LINKED) eq(linkers, [], 'while ACCOUNTS_LINKED is off, nothing points at /account')
  ok(/robots: \{ index: false/.test(read('app/account/page.tsx')), 'the page is not indexed')

  section('The privacy notice covers it before it opens')
  const notice = read('app/privacy/page.tsx')
  ok(notice.includes('title="Accounts"'), 'an Accounts section')
  ok(/never need an account/.test(notice), '…saying nobody needs one')
  ok(/Delete my account/.test(notice) && /Delete my account/.test(read('app/account/AccountScreen.tsx')),
    '…and how to delete it, in the page’s own words')
  ok(!/There are no accounts/.test(notice), 'the old “no accounts” line is gone')
}

async function main() {
  ruleTests()
  await routeTests()
  wiringTests()
  console.log(`\n${'─'.repeat(56)}`)
  if (failed > 0) {
    console.log(`✗ ${failed} failed, ${passed} passed`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`✓ all ${passed} checks passed`)
}
void main()
