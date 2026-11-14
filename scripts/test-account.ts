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
  ACCOUNTS_LINKED, ACCOUNT_PATH, CODE_LENGTH, MERGE_TICKET_MS, codeDigits, codeIssue, emailIssue, isAccount,
  mergeMemberships, normaliseEmail, type AuthUser,
} from '../lib/account'
import { readTicket, runAccount, type AccountStore } from '../app/api/account/account'
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
}

// ─── The route ─────────────────────────────────────────────────

class Stand implements AccountStore {
  users = new Map<string, AuthUser>()
  tokens = new Map<string, string>()
  rows = new Map<string, Membership>() // `${user}|${trip}`
  deleted: string[] = []
  add(user: AuthUser, token: string) { this.users.set(user.id, user); this.tokens.set(token, user.id) }
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
  const askers = files.filter(f => /\.(updateUser|signInWithOtp|verifyOtp)\(/.test(strip(read(f))))
  eq(askers, ['lib/accountClient.ts'], 'one file asks Supabase for an email code')
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
