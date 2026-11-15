/**
 * Clubs (stage (c)): the rules in lib/clubs.ts, the club route on a
 * stand-in database, a club's admins running its events (withOwner and
 * runEventClub), migration 086's SQL, and the wiring — above all that
 * nobody needs a club, or an account, to join, play, score or watch (D94).
 *
 *   npx tsx scripts/test-clubs.ts
 */
import fs from 'fs'
import path from 'path'
import {
  INVITE_LENGTH, cleanRow, clubNameIssue, clubSlug, formatInviteCode, inviteCodeFrom, inviteCodeIssue, inviteEmail,
  lastOwnerIssue, listRowIssue, maskNumber, mayAdminister, mayChangeRoles, nextSlug, normaliseInviteCode,
  parseClubAccess, parseMemberList, planList, roleWord, type ClubRole, type ListRow,
} from '../lib/clubs'
import { FEATURES, mayUseFeature } from '../lib/tiers'
import type { AuthUser } from '../lib/account'
import type { AttemptWindow, Membership } from '../lib/membership'
import { inviteHash, runClub, type ClubRecord, type ClubStore, type MemberRecord, type RowPatch } from '../app/api/club/club'
import { withOwner, type EntryTrip } from '../app/api/entry/entry'
import { runEventClub, runSetAdminPin, type ActionStore } from '../app/api/event/actions'
import { verifyPin } from '../lib/pinHash'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-key'

let passed = 0, failed = 0
const failures: string[] = []
function ok(c: boolean, label: string) {
  if (c) { passed++; return }
  failed++; failures.push(label); console.log(`  ✗ ${label}`)
}
function eq<T>(a: T, b: T, label: string) {
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) console.log(`    got      ${JSON.stringify(a)}\n    expected ${JSON.stringify(b)}`)
  ok(same, label)
}
function section(s: string) { console.log(`\n${s}`) }
const read = (f: string) => fs.readFileSync(f, 'utf8')
const NOW = new Date('2026-11-15T12:00:00Z')

// ─── The rules ─────────────────────────────────────────────────

function ruleTests() {
  section('A club’s name and address')
  eq(clubNameIssue('  '), 'Type the club’s name.', 'no name: asked for')
  eq(clubNameIssue('Royal Portrush Golf Club'), null, 'a real name will do')
  ok(clubNameIssue('x'.repeat(61)) !== null, 'too long: refused')
  eq(clubSlug('Royal Portrush G.C.'), 'royal-portrush-g-c', 'a slug from the name')
  eq(clubSlug("Seán's Golf Club"), 'seans-golf-club', '…accents and apostrophes forgiven')
  eq(nextSlug('lahinch', ['lahinch', 'lahinch-2']), 'lahinch-3', 'a name already taken gets a number')

  section('Who runs a club')
  ok(mayAdminister('owner') && mayAdminister('admin') && !mayAdminister('member') && !mayAdminister(null), 'owners and admins keep the list')
  ok(mayChangeRoles('owner') && !mayChangeRoles('admin'), 'only an owner changes roles')
  ok(lastOwnerIssue({ role: 'owner', removed: false }, { remove: true }, 1) !== null, 'the last owner cannot be taken off')
  ok(lastOwnerIssue({ role: 'owner', removed: false }, { role: 'admin' }, 1) !== null, '…or made an admin')
  eq(lastOwnerIssue({ role: 'owner', removed: false }, { remove: true }, 2), null, '…but one of two can')
  eq(lastOwnerIssue({ role: 'member', removed: false }, { remove: true }, 1), null, 'a member comes off whatever')
  eq(roleWord('member', 'Lahinch'), 'Lahinch member', 'never a bare "member" on screen (D133)')

  section('Reading a pasted list')
  const plain = parseMemberList('Ross O’Grady, 1042, 3110012345, Ross@Example.com\nDave Byrne\t1043\t\t')
  eq(plain.rows.length, 2, 'commas and tabs both read')
  eq(plain.rows[0], { name: 'Ross O’Grady', memberNumber: '1042', guiNumber: '3110012345', email: 'ross@example.com' }, '…name, member number, GUI number, email')
  eq(plain.rows[1].guiNumber, null, '…an empty cell is no number')
  const headed = parseMemberList('Surname,First name,Email,GUI No,Membership No\nByrne,Dave,dave@example.com,311 000 99,77')
  eq(headed.rows[0], { name: 'Dave Byrne', memberNumber: '77', guiNumber: '31100099', email: 'dave@example.com' }, 'a first line naming the columns is followed')
  const quoted = parseMemberList('"O\'Neill, Seán",12,,')
  eq(quoted.rows[0]?.name, "O'Neill, Seán", 'a quoted name keeps its comma')
  const bad = parseMemberList(',12\nAnn, 1, 2, not-an-email-but@\n')
  ok(bad.rows.length === 0 && bad.problems.length === 2, 'a line with no name, or a bad email, is a problem, never a row')
  eq(listRowIssue(cleanRow({ name: 'Ann', memberNumber: 'A<1' })), 'The member number has characters a number doesn’t.', 'a number must look like one')

  section('Adding a list to the list already there')
  const existing = [
    { id: 'r1', name: 'Ross', memberNumber: '1', guiNumber: 'G1', email: 'ross@x.ie', removed: false },
    { id: 'r2', name: 'Dave', memberNumber: '2', guiNumber: null, email: 'dave@x.ie', removed: true },
    { id: 'r3', name: 'Ann', memberNumber: null, guiNumber: null, email: 'ann@x.ie', removed: false },
  ]
  const row = (o: Partial<ListRow>): ListRow => cleanRow({ name: 'X', ...o })
  const plan = planList(existing, [
    row({ name: 'Ross O’Grady', guiNumber: 'G1', email: 'new@x.ie' }),
    row({ name: 'Dave', memberNumber: '2' }),
    row({ name: 'Ann', email: 'ann@x.ie' }),
    row({ name: 'Newcomer', guiNumber: 'G9' }),
    row({ name: 'Newcomer again', guiNumber: 'G9' }),
    row({ name: 'Crossed', guiNumber: 'G1', memberNumber: '2' }),
  ])
  eq(plan.updates.find(u => u.id === 'r1'), { id: 'r1', patch: { name: 'Ross O’Grady', email: 'new@x.ie' }, restore: false }, 'found by GUI number: brought up to date')
  eq(plan.updates.find(u => u.id === 'r2'), { id: 'r2', patch: {}, restore: true }, 'a removed row on the new list comes back')
  ok(!plan.updates.some(u => u.id === 'r3'), 'nothing new about a row: left alone')
  eq(plan.inserts.map(r => r.name), ['Newcomer'], 'a new person is added once')
  eq(plan.skipped.map(s => s.why), ['On the list twice.', 'On the list twice.'], 'the same number twice, or numbers pointing at two people, held back')
  const keep = planList(existing, [row({ name: 'Only one', guiNumber: 'G7' })])
  ok(keep.updates.length === 0 && keep.inserts.length === 1, 'nobody is taken off by being missing from a list')
  const crossed = planList(existing, [row({ name: 'Crossed', guiNumber: 'G1', memberNumber: '2' })])
  eq(crossed.skipped[0]?.why, 'Its numbers match two different people on the list.', 'a GUI number on one row and a member number on another: left for the club')
  eq(maskNumber('3110012345'), '•••••••345', 'numbers shown partly hidden')
  eq(maskNumber('12'), '••', '…a short one wholly')

  section('The code a club emails')
  const code = inviteCodeFrom(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 30, 31]))
  eq(code.length, INVITE_LENGTH, 'eight characters')
  ok(!/[01OIL]/.test(code), '…none that read as each other')
  eq(formatInviteCode('ABCDEFGH'), 'ABCD-EFGH', 'printed in two halves')
  eq(normaliseInviteCode(' abcd-efgh '), 'ABCDEFGH', 'typed any way, read the same')
  eq(inviteCodeIssue('abcd efgh'), null, '…and accepted')
  ok(inviteCodeIssue('ABC') !== null && inviteCodeIssue('ABCDEFG0') !== null, 'a short or impossible code is refused before it is checked')
  const mail = inviteEmail({ clubName: 'Lahinch', name: 'Ross', code: 'ABCDEFGH', site: 'https://greendot.live' })
  ok(mail.text.includes('ABCD-EFGH') && mail.html.includes('ABCD-EFGH'), 'the email carries the code')
  ok(!/href=/.test(mail.html), '…as text, never a link')
  const evil = inviteEmail({ clubName: '<b>x</b>', name: '<script>', code: 'ABCDEFGH', site: 's' })
  ok(!/<script>|<b>x/.test(evil.html), '…with the club’s and person’s words escaped')

  section('Who changes a club event (D138–D140)')
  eq(parseClubAccess('admins'), 'admins', 'admins only')
  eq(parseClubAccess('everyone'), null, 'anything else is no answer')

  section('The pro tier answers yes for everyone (D117)')
  ok(Object.values(FEATURES).every(f => f.tier === 'everyone'), 'every feature is everybody’s today')
  ok(mayUseFeature('stats_history', { clubMember: false, entitled: false }), '…so a phone with no club gets it')
}

// ─── The club route on a stand-in ──────────────────────────────

class Stand implements ClubStore {
  users = new Map<string, AuthUser>()
  clubs = new Map<string, ClubRecord & { createdBy: string }>()
  list = new Map<string, MemberRecord>()
  invites = new Map<string, { id: string; memberId: string; email: string; expiresAt: string; usedAt: string | null; createdAt: string }>()
  attempts = new Map<string, AttemptWindow>()
  sent: { to: string; text: string }[] = []
  emailWorks = true
  n = 0
  clock = NOW
  add(u: AuthUser) { this.users.set(`tok-${u.id}`, u) }
  async userFromToken(t: string) { return this.users.get(t) ?? null }
  async clubsOf(userId: string) {
    return [...this.list.values()].filter(r => r.userId === userId && !r.removedAt)
      .map(row => ({ club: this.clubs.get(row.clubId)!, row }))
  }
  async clubsMadeBy(userId: string) { return [...this.clubs.values()].filter(c => c.createdBy === userId).length }
  async slugsLike(base: string) { return [...this.clubs.values()].map(c => c.slug).filter(s => s.startsWith(base)) }
  async createClub(c: { slug: string; name: string; createdBy: string }, owner: { name: string; email: string | null; userId: string }) {
    const club = { id: `c${++this.n}`, slug: c.slug, name: c.name, verifiedAt: null, refusedAt: null, createdBy: c.createdBy }
    this.clubs.set(club.id, club)
    const id = `m${++this.n}`
    this.list.set(id, { id, clubId: club.id, name: owner.name, memberNumber: null, guiNumber: null, email: owner.email, role: 'owner', userId: owner.userId, removedAt: null, onBoards: true })
    return club
  }
  async club(id: string) { return this.clubs.get(id) ?? null }
  async rows(clubId: string) { return [...this.list.values()].filter(r => r.clubId === clubId).sort((a, b) => a.name.localeCompare(b.name)) }
  async insertRows(clubId: string, rows: ListRow[]) {
    for (const r of rows) {
      const id = `m${++this.n}`
      this.list.set(id, { id, clubId, ...r, role: 'member', userId: null, removedAt: null, onBoards: true })
    }
    return rows.length
  }
  async updateRow(id: string, p: RowPatch) {
    const r = this.list.get(id)!
    const next: MemberRecord = {
      ...r,
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.member_number !== undefined ? { memberNumber: p.member_number } : {}),
      ...(p.gui_number !== undefined ? { guiNumber: p.gui_number } : {}),
      ...(p.email !== undefined ? { email: p.email } : {}),
      ...(p.role !== undefined ? { role: p.role } : {}),
      ...(p.user_id !== undefined ? { userId: p.user_id } : {}),
      ...(p.removed_at !== undefined ? { removedAt: p.removed_at } : {}),
      ...(p.on_boards !== undefined ? { onBoards: p.on_boards } : {}),
    }
    const others = [...this.list.values()].filter(o => o.clubId === r.clubId && o.id !== id)
    if ((next.memberNumber && others.some(o => o.memberNumber === next.memberNumber))
      || (next.guiNumber && others.some(o => o.guiNumber === next.guiNumber))
      || (next.userId && others.some(o => o.userId === next.userId))) return 'clash' as const
    this.list.set(id, next)
    return 'ok' as const
  }
  async lastInviteAt(memberId: string) {
    const all = [...this.invites.values()].filter(i => i.memberId === memberId).map(i => i.createdAt).sort()
    return all.at(-1) ?? null
  }
  async saveInvite(i: { memberId: string; email: string; codeHash: string; expiresAt: string }) {
    this.invites.set(i.codeHash, { id: `i${++this.n}`, memberId: i.memberId, email: i.email, expiresAt: i.expiresAt, usedAt: null, createdAt: this.clock.toISOString() })
  }
  async sendEmail(to: string, _s: string, _h: string, text: string) {
    if (!this.emailWorks) return false
    this.sent.push({ to, text })
    return true
  }
  async inviteByHash(h: string) {
    const i = this.invites.get(h)
    return i ? { id: i.id, memberId: i.memberId, expiresAt: i.expiresAt, usedAt: i.usedAt } : null
  }
  async useInvite(id: string, at: string) {
    const i = [...this.invites.values()].find(x => x.id === id)
    if (!i || i.usedAt) return false
    i.usedAt = at
    return true
  }
  async row(id: string) { return this.list.get(id) ?? null }
  async guiHolders(gui: string) { return [...new Set([...this.list.values()].filter(r => r.guiNumber === gui && r.userId && !r.removedAt).map(r => r.userId!))] }
  async guisOf(userId: string) { return [...new Set([...this.list.values()].filter(r => r.userId === userId && r.guiNumber && !r.removedAt).map(r => r.guiNumber!))] }
  async readAttempts(keys: string[]) { return new Map(keys.filter(k => this.attempts.has(k)).map(k => [k, this.attempts.get(k)!])) }
  async writeAttempt(k: string, w: AttemptWindow) { this.attempts.set(k, w) }
  bytes = 0
  randomBytes(n: number) { this.bytes++; return new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7 + this.bytes * 13) % 256)) }
  siteOrigin() { return 'https://greendot.live' }
}

const member = (id: string, email: string): AuthUser => ({ id, isAnonymous: false, email, emailConfirmed: true })

/** The code a stand-in emailed, read off the email's text. */
const codeIn = (text: string) => /([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(text)?.[1] ?? ''

async function routeTests() {
  const s = new Stand()
  const ross = member('ross', 'ross@x.ie'), dave = member('dave', 'dave@x.ie'), ann = member('ann', 'ann@x.ie')
  ;[ross, dave, ann].forEach(u => s.add(u))
  s.users.set('tok-phone', { id: 'phone', isAnonymous: true, email: null, emailConfirmed: false })
  const ask = (tok: string, action: string, body: Record<string, unknown> = {}, address = 'addr-1') =>
    runClub({ token: tok, action, address, ...body }, s, s.clock)

  section('Only a Green Dot member reaches clubs')
  eq((await ask('', 'mine')).status, 401, 'no sign-in: refused')
  eq((await ask('tok-phone', 'mine')).status, 403, 'a phone with no account: refused')

  section('Setting up a club')
  eq((await ask('tok-ross', 'create', { name: 'Lahinch Golf Club' })).status, 400, 'your own name is asked for')
  const made = await ask('tok-ross', 'create', { name: 'Lahinch Golf Club', yourName: 'Ross O’Grady' })
  ok(made.status === 200 && made.body.ok && made.body.club?.status === 'pending' && made.body.club.role === 'owner',
    'made unverified, its maker the first owner')
  const clubId = made.status === 200 ? made.body.club!.id : ''
  const again = await ask('tok-dave', 'create', { name: 'Lahinch Golf Club', yourName: 'Dave' })
  ok(again.status === 200 && again.body.club?.slug === 'lahinch-golf-club-2', 'a second club of the same name gets its own address')

  section('The list is its owners’ and admins’')
  eq((await ask('tok-dave', 'members', { clubId })).status, 403, 'somebody not on the list sees nothing')
  const added = await ask('tok-ross', 'add', { clubId, rows: [
    { name: 'Dave Byrne', memberNumber: '2', guiNumber: '3110002', email: 'dave@x.ie' },
    { name: 'Ann Lee', guiNumber: '3110003', email: 'ann@x.ie' },
    { name: 'No Email' },
    { name: '' },
  ] })
  ok(added.status === 200 && added.body.added === 3 && added.body.skipped?.length === 1, 'rows added, a nameless one held back')
  const list = added.status === 200 ? added.body.list! : []
  const daveRow = list.find(r => r.name === 'Dave Byrne')!
  eq(daveRow.guiNumber, '••••002', 'numbers come back partly hidden, never whole')
  ok(!JSON.stringify(list).includes('3110002'), '…nowhere in the answer')
  const renewal = await ask('tok-ross', 'add', { clubId, rows: [{ name: 'David Byrne', guiNumber: '3110002' }] })
  ok(renewal.status === 200 && renewal.body.updated === 1 && renewal.body.added === 0, 'a renewal finds the row by GUI number and brings it up to date')

  section('A code to the email on the list, typed by the person')
  eq((await ask('tok-ross', 'invite', { clubId, memberId: list.find(r => r.name === 'No Email')!.id })).status, 400, 'no email: no code')
  const sent = await ask('tok-ross', 'invite', { clubId, memberId: daveRow.id })
  ok(sent.status === 200 && sent.body.sentTo === 'dave@x.ie' && s.sent.length === 1, 'a code goes to the address on the list')
  eq((await ask('tok-ross', 'invite', { clubId, memberId: daveRow.id })).status, 429, '…once a few minutes, however often it is tapped')
  const daveCode = codeIn(s.sent[0].text)
  ok(!JSON.stringify([...s.invites.keys()]).includes(daveCode.replace('-', '')), 'the code is kept only hashed')
  eq((await ask('tok-dave', 'link', { code: 'ABCD-EFGH' })).status, 403, 'a wrong code: refused')
  const linked = await ask('tok-dave', 'link', { code: daveCode.toLowerCase() })
  ok(linked.status === 200 && linked.body.club?.name === 'Lahinch Golf Club', 'the right code links the account, typed any way')
  eq((await ask('tok-ann', 'link', { code: daveCode })).status, 409, 'a code works once')
  const mine = await ask('tok-dave', 'mine')
  ok(mine.status === 200 && mine.body.clubs?.find(c => c.id === clubId)?.role === 'member', 'the club is in Dave’s list, as a member')
  eq((await ask('tok-dave', 'members', { clubId })).status, 403, 'a member does not see the list')

  section('One GUI number to one account')
  const annRow = list.find(r => r.name === 'Ann Lee')!
  // Ann's row gets Dave's GUI number by mistake: Ann's code must not link a number Dave holds.
  s.list.set(annRow.id, { ...s.list.get(annRow.id)!, guiNumber: '3110002X' })
  const other = await ask('tok-dave', 'create', { name: 'Ballybunion', yourName: 'Dave' })
  const otherId = other.status === 200 ? other.body.club!.id : ''
  await ask('tok-dave', 'add', { clubId: otherId, rows: [{ name: 'Ann Lee', guiNumber: '3110002', email: 'ann@x.ie' }] })
  const annOther = (await s.rows(otherId)).find(r => r.name === 'Ann Lee')!
  await ask('tok-dave', 'invite', { clubId: otherId, memberId: annOther.id })
  const annCode = codeIn(s.sent.at(-1)!.text)
  eq((await ask('tok-ann', 'link', { code: annCode })).status, 409, 'a GUI number already linked to another account is held for the club')
  ok(!s.list.get(annOther.id)!.userId, '…never quietly moved')

  section('Taking somebody off the list severs, never deletes')
  const removed = await ask('tok-ross', 'remove', { clubId, memberId: daveRow.id })
  ok(removed.status === 200 && s.list.get(daveRow.id)!.removedAt !== null && s.list.get(daveRow.id)!.userId === null,
    'the row stays, its link cut')
  const after = await ask('tok-dave', 'mine')
  ok(after.status === 200 && !after.body.clubs?.some(c => c.id === clubId), '…and the club is gone from Dave’s list on the next ask')
  ok(s.users.has('tok-dave'), '…his account untouched')
  await ask('tok-ross', 'update', { clubId, memberId: daveRow.id, onBoards: false })
  eq(s.list.get(daveRow.id)!.onBoards, false, 'the club chooses whether a removed member stays on its boards')
  await ask('tok-ross', 'restore', { clubId, memberId: daveRow.id })
  eq(s.list.get(daveRow.id)!.removedAt, null, 'put back on the list — to be linked again by a fresh code')

  section('A club always has an owner')
  const rossRow = [...s.list.values()].find(r => r.clubId === clubId && r.userId === 'ross')!
  eq((await ask('tok-ross', 'remove', { clubId, memberId: rossRow.id })).status, 409, 'the only owner cannot be taken off')
  eq((await ask('tok-ross', 'update', { clubId, memberId: rossRow.id, role: 'member' })).status, 409, '…or demoted')
  await ask('tok-ross', 'update', { clubId, memberId: daveRow.id, role: 'admin' })
  eq(s.list.get(daveRow.id)!.role, 'admin' as ClubRole, 'an owner makes an admin')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, userId: 'dave' })
  eq((await ask('tok-dave', 'update', { clubId, memberId: rossRow.id, role: 'member' })).status, 403, 'an admin cannot change roles')
  eq((await ask('tok-dave', 'remove', { clubId, memberId: rossRow.id })).status, 403, '…or take an owner off')

  section('Wrong codes are limited, as PINs are')
  for (let i = 0; i < 10; i++) await ask('tok-ann', 'link', { code: 'ZZZZ-ZZZZ' }, 'addr-9')
  eq((await ask('tok-ann', 'link', { code: annCode }, 'addr-9')).status, 429, 'ten wrong from one address: the next waits')
}

// ─── A club's admins run its events ────────────────────────────

async function eventTests() {
  section('A verified club’s owners and admins are its events’ organisers (D139)')
  const base: EntryTrip = { id: 't1', code: 'CLUB01', endDate: null, adminHash: 'h', publicHash: null, openEnded: false }
  const guest: Membership = { role: 'guest', playerId: null, organiserUntil: null }
  eq(withOwner(guest, { ...base, clubAdminIds: ['dave'] }, 'dave')?.owner, true, 'a club admin runs the club’s event')
  eq(withOwner(guest, { ...base, clubAdminIds: ['dave'] }, 'ann')?.owner, false, '…anybody else does not')
  eq(withOwner(guest, { ...base, ownerId: 'ross' }, 'ross')?.owner, true, 'the event’s owner still does')
  eq(withOwner(guest, base, 'ross')?.owner, false, 'an event outside a club: nothing changes')

  // A stand-in event, its members and its PIN.
  const members = new Map<string, Membership>()
  let trip: EntryTrip = { ...base }
  const cols: Record<string, unknown> = { kind: 'tournament' }
  let ended = 0
  const clubsRun: Record<string, { id: string; name: string }[]> = { dave: [{ id: 'c1', name: 'Lahinch' }] }
  const store: ActionStore = {
    async userFromToken(t) { return t.startsWith('tok-') ? t.slice(4) : null },
    async tripByCode(code) { return code === trip.code ? trip : null },
    async claimedPlayer() { return false },
    async readMembership(u) { return members.get(u) ?? null },
    async writeMembership(u, _t, m) { members.set(u, m) },
    async readAttempts() { return new Map() },
    async writeAttempt() {},
    async upgradePin() {},
    async tripColumns() { return cols },
    async updateTrip(_id, patch) {
      if ('settings_passcode_hash' in patch) trip = { ...trip, adminHash: (patch.settings_passcode_hash as string | null) }
    },
    async leadPlayerId() { return null },
    async endOrganisers() { ended++ },
    async adminClubs(u) { return clubsRun[u] ?? [] },
    async setEventClub(_id, clubId, access) {
      trip = { ...trip, clubId, clubName: clubId ? 'Lahinch' : null, clubAccess: access, clubAdminIds: clubId ? ['dave'] : [] }
    },
  }
  members.set('ross', { role: 'guest', playerId: null, organiserUntil: new Date(NOW.getTime() + 3600_000).toISOString() })
  members.set('dave', { role: 'guest', playerId: null, organiserUntil: null })
  members.set('ann', { role: 'guest', playerId: null, organiserUntil: null })
  const ask = (tok: string, body: Record<string, unknown> = {}) => runEventClub({ token: tok, code: 'CLUB01', ...body }, store, NOW)

  eq((await ask('tok-ann')).status, 403, 'only the organiser sees the event’s club')
  const ross = await ask('tok-ross')
  ok(ross.status === 200 && ross.body.club === null && ross.body.clubs.length === 0, 'an organiser who runs no club is offered none')
  eq((await ask('tok-ross', { clubId: 'c1' })).status, 403, '…and cannot put it under somebody else’s club')

  members.set('dave', { role: 'guest', playerId: null, organiserUntil: new Date(NOW.getTime() + 3600_000).toISOString() })
  const oldHash = trip.adminHash
  const put = await ask('tok-dave', { clubId: 'c1' })
  ok(put.status === 200 && put.body.club?.name === 'Lahinch' && put.body.access === 'admins' && put.body.runsClub, 'a club admin puts it under the club, admins only')
  ok(trip.adminHash !== oldHash && !!trip.adminHash, '…locked with a PIN nobody is given (D138), so every page locks')
  ok(ended > 0, '…and any PIN lent before stops working')

  members.set('dave', { role: 'guest', playerId: null, organiserUntil: null })
  ok((await ask('tok-dave')).status === 200, 'signed in, the club admin is its organiser with no PIN at all')
  eq((await ask('tok-ross', { access: 'anyone' })).status, 403, 'only the club’s own change who edits it')
  const lend = await ask('tok-dave', { access: 'pin', pin: '4821' })
  ok(lend.status === 200 && lend.body.access === 'pin' && (await verifyPin('4821', trip.adminHash!)).ok, 'admins and anyone with the PIN: a PIN to lend')
  const open = await ask('tok-dave', { access: 'anyone' })
  ok(open.status === 200 && trip.adminHash === null, 'anyone in the event: no PIN, as an open event is today (D140)')
  await ask('tok-dave', { access: 'admins' })
  ok(!!trip.adminHash && trip.clubAccess === 'admins', 'back to admins only: locked again')

  const pinNow = trip.adminHash
  const set = await runSetAdminPin({ token: 'tok-dave', code: 'CLUB01', currentPin: null, pin: '5555', address: 'a' }, store, NOW)
  ok(set.status === 200 && trip.adminHash !== pinNow, 'a club admin sets a PIN without the old one')
  eq(trip.clubAccess, 'pin', '…and the event now says a PIN is lent')

  members.set('helper', { role: 'guest', playerId: null, organiserUntil: new Date(NOW.getTime() + 3600_000).toISOString() })
  eq((await runEventClub({ token: 'tok-helper', code: 'CLUB01', clubId: null }, store, NOW)).status, 403,
    'a helper lent the PIN cannot take the event out of the club')
  const out = await ask('tok-dave', { clubId: null })
  ok(out.status === 200 && out.body.club === null && !trip.clubId, 'the club’s own take it out')
  ok(!!members.get('dave')?.organiserUntil, '…and stay its organiser for twelve hours to set a new PIN')
}

// ─── The SQL and the wiring ────────────────────────────────────

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return []
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : []
  })
}

function wiringTests() {
  section('Migration 086')
  const sql = read('supabase/migrations/20260101000086_clubs.sql')
  const body = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  for (const t of ['clubs', 'club_members', 'club_invites']) {
    ok(new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).test(body), `${t}: row-level security on`)
    ok(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`).test(body), `${t}: closed to phones by name`)
    ok(!new RegExp(`CREATE POLICY[^;]*ON ${t}\\b`).test(body), `${t}: no policy — server only`)
  }
  const fn = body.slice(body.indexOf('CREATE OR REPLACE FUNCTION public.account_trips()'))
  ok(/owner_id = \(SELECT auth\.uid\(\)\)/.test(fn), 'account_trips() keeps the event’s owner')
  ok(/verified_at IS NOT NULL/.test(fn) && /removed_at IS NULL/.test(fn) && /role IN \('owner', 'admin'\)/.test(fn),
    '…and adds a verified club’s owners and admins still on its list — never its members')
  ok(!/CREATE OR REPLACE FUNCTION public\.(writable|organiser)_trips/.test(body), 'writable_trips() and organiser_trips() are untouched — 085’s OR carries the clubs')
  ok(/user_id\s+uuid\s+NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/.test(body), 'an account deleted leaves its row on the club’s list')
  ok(/-- ─── Undo/.test(sql) && /-- ─── Did it land\?/.test(sql), 'with its undo and its check')
  ok(read('scripts/rls-check.sql').includes('migration 086'), 'rls-check.sql has a block for it')

  section('Nobody needs a club, or an account, to join, play, score or watch (D94)')
  const files = [...walk('app'), ...walk('lib')]
  for (const dir of ['app/golf', 'app/run', 'app/scoring', 'app/join', 'app/enter', 'app/api/entry', 'app/api/trip']) {
    if (!fs.existsSync(dir)) continue
    const hits = walk(dir).filter(f => /@\/lib\/tiers['"]|@\/app\/api\/club\//.test(read(f)))
    eq(hits, [], `${dir} never asks the pro tier or the club route`)
  }
  ok(!/clubAdminIds/.test(read('lib/membership.ts')), 'the membership rules are unchanged: a club admin is an owner, OR-ed in')
  const askers = files.filter(f => /['"`]\/api\/club['"`]/.test(read(f)))
  eq(askers.sort(), ['lib/accountClient.ts'], 'one browser file asks /api/club')
  const eventCard = read('app/components/ClubEventCard.tsx')
  ok(!/@\/lib\/accountClient/.test(eventCard), 'the event’s club card talks through entryClient, like every event page')
  ok(/if \(!change && !\(await databaseReady\(\) && \(await phoneSession\(\)\)\?\.account\)\) return null/.test(read('lib/entryClient.ts')),
    'a phone with no account never asks about clubs at all')
  const entryStore = read('app/api/entry/store.ts')
  ok(/eventClub\(db, row\.id\)/.test(entryStore) && /select\('club_id, club_access'\)/.test(entryStore),
    'the event’s club is read in a query of its own, so nothing changes before 086')

  section('Words (D133)')
  const screens = ['app/account/clubs/ClubsScreen.tsx', 'app/account/club/ClubScreen.tsx', 'app/components/ClubEventCard.tsx'].map(read).join('\n')
  const strings = [...screens.matchAll(/(['"`])((?:(?!\1).)*?)\1|>([^<>{}]+)</g)].map(m => m[2] ?? m[3] ?? '')
  // Code values ('member', 'members' as an action) and the field "Member number" are not words about people.
  const bare = strings.filter(t => /\bmembers?\b/i.test(t) && !/^members?$/.test(t) && !/Green Dot members?\b|Member number|\$\{/i.test(t))
  eq(bare, [], 'no screen word says member without whose')

  section('The privacy notice has its Clubs section in the same deploy')
  const notice = read('app/privacy/page.tsx')
  ok(notice.includes('title="Clubs"'), 'a Clubs section')
  ok(/GUI\) membership number/.test(notice) && /partly hidden/.test(notice) && /never touched by a club/.test(notice),
    '…saying what a list holds, that numbers are hidden, and that a club never touches an account')
  ok(/legitimate interest in running its\s+membership/.test(notice), '…and why it may be held')
}

async function main() {
  ruleTests()
  await routeTests()
  await eventTests()
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
