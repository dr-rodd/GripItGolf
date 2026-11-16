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
  clubAssetUrl, clubEventWhen, clubImageIssue, groupClubEvents, irishToday, oneClubIssue, publicClubEvents, type ClubEvent,
} from '../lib/clubs'
import { FEATURES, mayUseFeature } from '../lib/tiers'
import type { SeasonRow } from '../lib/cardSummary'
import type { AuthUser } from '../lib/account'
import type { AttemptWindow, Membership } from '../lib/membership'
import { inviteHash, runClub, runUpload, type ClubRecord, type ClubStore, type ImageWork, type MemberRecord, type RowPatch } from '../app/api/club/club'
import { CLUB_GROUNDS, cleanHex, clubColours, clubStyle, contrast, deltaE } from '../lib/clubColour'
import { EMAIL_PAID_LINE, countSince, emailCountLine, irishMidnight } from '../lib/emailCount'
import { runEntry, withOwner, type EntryStore, type EntryTrip } from '../app/api/entry/entry'
import { runDoor, runEventClub, runSetAdminPin, type ActionStore } from '../app/api/event/actions'
import { compPhase, sectionLive, sectionWaitLine, shortWhen, showsTopThree, summaryLine, type CompFacts } from '../lib/compPhase'
import { barOf, compHome, compSectionHref, compsBack, sectionOfView, SECTION_LABEL, SECTION_ORDER } from '../lib/clubBar'
import { bookingIssue, compBoard, compFormIssue, compPermissions, compTeeRules, readCompForm, withdrawIssue, type CompForm } from '../lib/clubComp'
import { runNewCompetition, type CompetitionStore } from '../app/api/club/competition'
import { runBooking, type BookingStore, type Booked, type CompPlayer } from '../app/api/club/booking'
import type { CreateStore } from '../app/api/trip/create/create'
import { mergeGrant } from '../lib/membership'
import { cardScoreRows, nrGross, type CommitHole } from '../lib/cardCommit'
import { runSign, signedOff, type CardHole, type NewSignature, type Signature, type SignPlayer, type SignStore } from '../app/api/card/sign'
import type { SavedScore } from '../lib/liveScores'
import { irishDay, mayCertifyNow, playerStates, runCertify, type CertifyStore, type DayChange } from '../app/api/card/certify'
import { writeRoundSummaries, type SummaryDeps } from '../app/api/stats/summaries'
import { parseLeaderboards } from '../lib/leaderboards'
import { RESERVED_CLUB_SLUGS } from '../lib/clubs'
import { hashPin as hashPinForDoor, unheldPin, entryToken } from '../lib/pinHash'
import { verifyPin } from '../lib/pinHash'
import { INDEX_MAX, INDEX_MIN, indexLabel, linkPlan, readIndex, sameIndex } from '../lib/handicapIndex'
import { linkIndex, listIndexes, setIndex, severIndex, type HandicapStore } from '../app/api/handicaps/handicaps'

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
  handicaps?: HandicapStore
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
  // Stage (e1)
  events = new Map<string, ClubEvent[]>()
  linked = new Map<string, string[]>()
  stored = new Map<string, Uint8Array>()
  assetBase() { return 'https://ref.supabase.co' }
  async clubBySlug(slug: string) { return [...this.clubs.values()].find(c => c.slug === slug) ?? null }
  async updateClub(clubId: string, patch: Partial<{ colour: string | null; crest_path: string | null; art_path: string | null; art_dark_path: string | null; home_course_id: string | null }>) {
    const c = this.clubs.get(clubId)!
    this.clubs.set(clubId, {
      ...c,
      ...('home_course_id' in patch ? { homeCourseId: patch.home_course_id } : {}),
      ...('colour' in patch ? { colour: patch.colour } : {}),
      ...('crest_path' in patch ? { crestPath: patch.crest_path } : {}),
      ...('art_path' in patch ? { artPath: patch.art_path } : {}),
      ...('art_dark_path' in patch ? { artDarkPath: patch.art_dark_path } : {}),
    })
  }
  async clubEvents(clubId: string) { return this.events.get(clubId) ?? [] }
  async entries(userId: string, codes: string[]) { return (this.linked.get(userId) ?? []).filter(c => codes.includes(c)) }
  season: SeasonRow[] = []
  async seasonRows() { return { rows: this.season, courses: { c1: 'Lahinch Old' } } }
  async outsideEvents(_u: string, exclude: string[]) { return [{ code: 'TRIP01', name: 'Lads’ trip', kind: 'trip' as const, startDate: '2026-12-01', endDate: '2026-12-03', access: null }].filter(e => !exclude.includes(e.code)) }
  async topScores(codes: string[]): Promise<Record<string, { name: string; points: number }>> { return codes.includes('OLDMED') ? { OLDMED: { name: 'Ann Lee', points: 39 } } : {} }
  async putImage(path: string, bytes: Uint8Array) { this.stored.set(path, bytes) }
  async removeImage(path: string) { this.stored.delete(path) }
}

const member = (id: string, email: string): AuthUser => ({ id, isAnonymous: false, email, emailConfirmed: true })

/** The code a stand-in emailed, read off the email's text. */
const codeIn = (text: string) => /([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(text)?.[1] ?? ''

async function routeTests() {
  const s = new Stand()
  const ross = member('ross', 'ross@x.ie'), dave = member('dave', 'dave@x.ie'), ann = member('ann', 'ann@x.ie')
  const eve = member('eve', 'eve@x.ie'), fay = member('fay', 'fay@x.ie')
  ;[ross, dave, ann, eve, fay].forEach(u => s.add(u))
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
  const again = await ask('tok-eve', 'create', { name: 'Lahinch Golf Club', yourName: 'Eve' })
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
  const other = await ask('tok-fay', 'create', { name: 'Ballybunion', yourName: 'Fay' })
  const otherId = other.status === 200 ? other.body.club!.id : ''
  await ask('tok-fay', 'add', { clubId: otherId, rows: [{ name: 'Ann Lee', guiNumber: '3110002', email: 'ann@x.ie' }, { name: 'Dave Byrne', email: 'dave@x.ie' }] })
  const annOther = (await s.rows(otherId)).find(r => r.name === 'Ann Lee')!
  await ask('tok-fay', 'invite', { clubId: otherId, memberId: annOther.id })
  const annCode = codeIn(s.sent.at(-1)!.text)
  eq((await ask('tok-ann', 'link', { code: annCode })).status, 409, 'a GUI number already linked to another account is held for the club')
  ok(!s.list.get(annOther.id)!.userId, '…never quietly moved')

  section('One club per account (D145, D150)')
  const daveOther = (await s.rows(otherId)).find(r => r.name === 'Dave Byrne')!
  await ask('tok-fay', 'invite', { clubId: otherId, memberId: daveOther.id })
  const second = await ask('tok-dave', 'link', { code: codeIn(s.sent.at(-1)!.text) })
  eq(second.status, 409, 'linking a second club is refused')
  ok(second.status === 409 && /Lahinch Golf Club’s list/.test(second.body.error), '…naming the club the account is on')
  ok(!s.list.get(daveOther.id)!.userId, '…and nothing is linked')
  const setUp = await ask('tok-dave', 'create', { name: 'Doonbeg', yourName: 'Dave' })
  ok(setUp.status === 409 && /Lahinch Golf Club’s list/.test(setUp.body.error), 'setting up a second club is refused the same way')

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


// ─── Stage (e1): the club page, its look, one club per account ─

function lookTests() {
  section('A club’s colour, readable by day and at night (D118, D125)')
  const css = read('app/globals.css')
  const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
  const dark = css.slice(css.indexOf('html.dark {'), css.indexOf('}', css.indexOf('html.dark {')))
  const hex = (block: string, name: string) => block.match(new RegExp(`--gd-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()
  eq([hex(light, 'cream'), hex(light, 'surface'), hex(light, 'accent'), hex(light, 'accent-deep')],
    [CLUB_GROUNDS.light.page, CLUB_GROUNDS.light.card, CLUB_GROUNDS.light.accent, CLUB_GROUNDS.light.accentDeep], 'the rule reads the stylesheet’s own day values')
  eq([hex(dark, 'cream'), hex(dark, 'surface'), hex(dark, 'accent'), hex(dark, 'accent-deep'), hex(dark, 'ink')],
    [CLUB_GROUNDS.dark.page, CLUB_GROUNDS.dark.card, CLUB_GROUNDS.dark.accent, CLUB_GROUNDS.dark.accentDeep, CLUB_GROUNDS.dark.text], '…and its night ones')
  const awkward = {
    white: '#FFFFFF', black: '#000000', yellow: '#FFE100', 'near-emerald': '#0A9D56', 'club green': '#1F7A3D',
    'near-gold': '#D4A02A', 'red beside side-a': '#C62F3A', 'pale mint': '#88C9A1', navy: '#1B2A4A', claret: '#7A1F2B',
  }
  for (const [what, h] of Object.entries(awkward)) {
    const c = clubColours(h)!
    for (const mode of ['light', 'dark'] as const) {
      const g = CLUB_GROUNDS[mode], v = c[mode]
      ok(contrast(v.club, g.page) >= 3 && contrast(v.club, g.card) >= 3, `${what}, ${mode}: the mark clears 3:1 on the page and a card`)
      ok(contrast(v.deep, g.page) >= 4.5 && contrast(v.deep, g.card) >= 4.5, `${what}, ${mode}: its words clear 4.5:1`)
      ok(contrast(v.on, v.club) >= 4.5, `${what}, ${mode}: words on it clear 4.5:1`)
      ok(deltaE(v.club, g.accent) >= 20 && deltaE(v.club, g.accentDeep) >= 20, `${what}, ${mode}: never passes for the emerald`)
    }
  }
  const navy = clubColours('#1B2A4A')!
  eq(navy.light.club, '#1B2A4A', 'a colour that already clears is kept as chosen')
  ok(clubColours('#FFE100')!.adjusted, '…one that does not is adjusted, and says so')
  eq(clubColours('not a colour'), null, 'no colour: the house look')
  eq(cleanHex('1f7a3d'), '#1F7A3D', 'typed without its #, or in lower case')
  const style = clubStyle(clubColours('#1F7A3D'))
  ok(Object.keys(style).every(k => /^--gd-(club|club-deep|on-club)-[ld]$/.test(k)) && Object.values(style).every(v => /^#[0-9A-F]{6}$/.test(v)),
    'the wrapper’s style carries only checked hex, only to the club’s own tokens')

  section('The club’s tokens stay in club space (D125)')
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = [...code.matchAll(/(?:^|\n)\s*(?:html\.dark )?\[data-club\] \{([^}]*)\}/g)].map(m => m[1])
  ok(blocks.length === 3, 'a [data-club] block for day, for night and for paper')
  ok(blocks.every(b => b.split(';').map(d => d.trim()).filter(Boolean).every(d => /^--gd-(club|club-deep|on-club|club-tint):/.test(d))),
    '…each declaring only the club’s own tokens')
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? (d.name === 'node_modules' || d.name.startsWith('.') ? [] : files(p)) : /\.(ts|tsx)$/.test(d.name) ? [p] : []
  })
  const users = [...files('app'), ...files('lib')].filter(f => /\b(text|bg|ring|border|fill|stroke)-(club|on-club|club-deep|club-tint)\b/.test(read(f)))
  ok(users.length > 0 && users.every(f => f.startsWith(`app${path.sep}club${path.sep}`) || f.startsWith('app/club/')), 'the club colour is used only on a club’s own pages (app/club/)')
  for (const f of ['lib/resultTone.ts', 'lib/matchSides.ts', 'lib/teamColors.ts', 'app/components/ui.tsx']) {
    ok(!/club/i.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), `${f} never speaks the club colour — it is no result, side, team, button or pill of the kit`)
  }

  section('A club’s crest and art (D126, D155, D156)')
  const img = (w: number, h: number, format = 'jpeg', bytes = 1000) => ({ width: w, height: h, format, bytes })
  eq(clubImageIssue('art', img(1600, 900)), null, 'landscape art 1600 wide will do')
  ok(clubImageIssue('art', img(1000, 600)) !== null, 'art narrower than 1170 is refused')
  ok(clubImageIssue('art', img(1200, 1600)) !== null, 'portrait art is refused')
  ok(clubImageIssue('crest', img(64, 64)) !== null, 'a tiny crest is refused')
  eq(clubImageIssue('crest', img(600, 600, 'png')), null, 'a square PNG crest will do')
  ok(clubImageIssue('art', img(1600, 900, 'heif')) !== null, 'a format the server cannot read is refused in words')
  ok(clubImageIssue('art', img(1600, 900, 'jpeg', 5 * 1024 * 1024)) !== null, 'over 4 MB is refused before it is read')
  eq(clubAssetUrl('https://ref.supabase.co', 'abc-123/art-x9z.webp'), 'https://ref.supabase.co/storage/v1/object/public/club-assets/abc-123/art-x9z.webp', 'an image is read from the public bucket')
  eq(clubAssetUrl('https://ref.supabase.co', '../secret.png'), null, '…and only by a path the server made')
  ok(read('package.json').includes('"sharp": "0.34.5"'), 'sharp is a real dependency (D156)')
  ok(/runtime = 'nodejs'/.test(read('app/api/club/upload/route.ts')), 'uploads resize on the server')

  section('The public face shows guests-welcome events only (D158)')
  const ev = (code: string, access: ClubEvent['access'], startDate: string | null, endDate = startDate): ClubEvent =>
    ({ code, name: code, kind: 'tournament', startDate, endDate, access })
  const today = '2026-11-15'
  const all = [ev('OPEN01', 'anyone', '2026-11-20'), ev('CLOSE1', 'admins', '2026-11-20'), ev('PINNED', 'pin', '2026-11-16'), ev('OLDONE', 'anyone', '2026-10-01')]
  eq(publicClubEvents(all, today).map(e => e.code), ['OPEN01'], 'only an "Anyone in the event" event still to come — never the calendar')
  eq(clubEventWhen(ev('X', null, '2026-11-14', '2026-11-16'), today), 'now', 'a multi-day event spanning today is on now')
  const groups = groupClubEvents(all, today)
  eq([groups.now.length, groups.upcoming.map(e => e.code), groups.past.map(e => e.code)], [0, ['PINNED', 'CLOSE1', 'OPEN01'], ['OLDONE']], 'Comps: upcoming soonest first, results apart')
  eq(irishToday(new Date('2026-06-30T23:30:00Z')), '2026-07-01', 'the club pages’ clock is Irish (summer time)')
  ok(/publicClubEvents\(events, irishToday/.test(read('app/club/[slug]/face.ts')) && !/events,\s*$|events: events/m.test(read('app/club/[slug]/face.ts')),
    'the page’s HTML is handed the public events alone')
  ok(/if \(!club \|\| !club\.verifiedAt\) return null/.test(read('app/club/[slug]/face.ts')) && /notFound\(\)/.test(read('app/club/[slug]/page.tsx')),
    'an unverified or unknown club is not found')

  section('One club per account, said by name (D150)')
  eq(oneClubIssue('Lahinch'), 'Your account is on Lahinch’s list. One club per account for now.', 'the refusal names the club')
  ok(read('supabase/migrations/20260101000086_clubs.sql').includes('uq_club_members_user   ON club_members(club_id, user_id)'),
    'the tables still hold one row per account per club — more clubs need no migration')

  section('Today’s emails on /admin (D160)')
  const since = irishMidnight(new Date('2026-11-15T15:00:00Z'))
  eq(since, '2026-11-15T00:00:00.000Z', 'today began at midnight in Ireland (winter: UTC)')
  eq(irishMidnight(new Date('2026-07-01T10:00:00Z')), '2026-06-30T23:00:00.000Z', '…an hour earlier in summer')
  eq(countSince(['2026-11-15T14:00:00Z', '2026-11-15T01:00:00Z', '2026-11-14T23:00:00Z', '2026-11-14T22:00:00Z'], since), { today: 2, reachedPast: true }, 'counted up to midnight, then stopped')
  ok(/time for Resend’s paid plan/.test(emailCountLine(EMAIL_PAID_LINE + 1)) && !/paid/.test(emailCountLine(EMAIL_PAID_LINE)), 'past 50 a day it says to move to the paid plan (D111)')
  ok(/<EmailCount \/>/.test(read('app/admin/trips/page.tsx')), '…on /admin’s landing section')
}

async function pageRouteTests() {
  const s = new Stand()
  const ross = member('ross', 'ross@x.ie'), dave = member('dave', 'dave@x.ie'), ann = member('ann', 'ann@x.ie')
  ;[ross, dave, ann].forEach(u => s.add(u))
  const ask = (tok: string, action: string, body: Record<string, unknown> = {}) => runClub({ token: tok, action, address: 'a', ...body }, s, NOW)
  const made = await ask('tok-ross', 'create', { name: 'Portmarnock', yourName: 'Ross' })
  const clubId = made.status === 200 ? made.body.club!.id : ''
  await ask('tok-ross', 'add', { clubId, rows: [{ name: 'Dave', email: 'dave@x.ie' }] })
  const daveRow = (await s.rows(clubId)).find(r => r.name === 'Dave')!
  s.list.set(daveRow.id, { ...daveRow, userId: 'dave' })
  s.events.set(clubId, [
    { code: 'OPEN01', name: 'Open day', kind: 'tournament', startDate: '2026-11-20', endDate: '2026-11-20', access: 'anyone' },
    { code: 'MEDAL1', name: 'Monthly medal', kind: 'tournament', startDate: '2026-11-22', endDate: '2026-11-22', access: 'admins' },
  ])
  s.linked.set('dave', ['MEDAL1'])

  section('The members home: only for somebody on a verified club’s list (D157)')
  eq((await ask('tok-dave', 'home', { slug: 'portmarnock' })).status, 404, 'an unverified club has no page')
  s.clubs.set(clubId, { ...s.clubs.get(clubId)!, verifiedAt: NOW.toISOString() })
  const home = await ask('tok-dave', 'home', { slug: 'portmarnock' })
  ok(home.status === 200 && home.body.events?.length === 2 && home.body.club?.role === 'member', 'a member on the list sees every club event')
  eq(home.status === 200 ? home.body.entries : null, ['MEDAL1'], '…and their own entries among them')
  ok(home.status === 200 && home.body.me?.name === 'Dave', '…greeted by the name on the club’s list')
  ok(home.status === 200 && home.body.outside?.[0]?.code === 'TRIP01', '…with their events outside the club')
  eq((await ask('tok-ann', 'home', { slug: 'portmarnock' })).status, 403, 'anybody else is not on the list — their page stays the public face')
  eq((await ask('tok-ross', 'home', { slug: 'nowhere' })).status, 404, 'an unknown club: not found')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, removedAt: NOW.toISOString(), userId: null })
  eq((await ask('tok-dave', 'home', { slug: 'portmarnock' })).status, 403, 'taken off the list, the members home closes on the next ask')

  section('The club’s look is its owners’ and admins’')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, removedAt: null, userId: 'dave' })
  eq((await ask('tok-dave', 'colour', { clubId, colour: '#1F7A3D' })).status, 403, 'a member cannot change the colour')
  const coloured = await ask('tok-ross', 'colour', { clubId, colour: '1f7a3d' })
  ok(coloured.status === 200 && coloured.body.club?.colour === '#1F7A3D', 'an owner sets it, tidied')
  eq((await ask('tok-ross', 'colour', { clubId, colour: 'green' })).status, 400, 'a colour that is not one is refused')

  const work: ImageWork = {
    async inspect(b) { return b[0] === 1 ? { format: 'jpeg', width: 1600, height: 900 } : b[0] === 2 ? { format: 'jpeg', width: 900, height: 1600 } : null },
    async prepare(_k, b) { return new Uint8Array([9, ...b]) },
  }
  const up = (tok: string, kind: string, bytes: Uint8Array | null) => runUpload({ token: tok, clubId, kind, bytes }, s, work)
  eq((await up('tok-dave', 'art', new Uint8Array([1]))).status, 403, 'a member cannot upload')
  eq((await up('tok-ross', 'art', new Uint8Array([2]))).status, 400, 'portrait art is refused, in words')
  eq((await up('tok-ross', 'art', new Uint8Array([3]))).status, 400, 'something that is not an image is refused')
  const first = await up('tok-ross', 'art', new Uint8Array([1]))
  const firstPath = s.clubs.get(clubId)!.artPath!
  ok(first.status === 200 && /^c\d+\/art-[a-z0-9]+\.webp$/.test(firstPath) && s.stored.get(firstPath)?.[0] === 9, 'art is resized, kept as WebP under a fresh name')
  ok(first.status === 200 && first.body.club?.artUrl === `https://ref.supabase.co/storage/v1/object/public/club-assets/${firstPath}`, '…and read from the public bucket')
  await up('tok-ross', 'art', new Uint8Array([1, 1]))
  ok(!s.stored.has(firstPath) && s.clubs.get(clubId)!.artPath !== firstPath, 'a new one replaces it and the old is let go')
  await up('tok-ross', 'art', null)
  eq(s.clubs.get(clubId)!.artPath, null, 'taken off: back to the club’s name and colour')
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
  const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const askers = files.filter(f => /['"`]\/api\/club['"`]/.test(code(f)))
  eq(askers.sort(), ['lib/accountClient.ts'], 'one browser file asks /api/club')
  const eventCard = read('app/components/ClubEventCard.tsx')
  ok(!/@\/lib\/accountClient/.test(eventCard), 'the event’s club card talks through entryClient, like every event page')
  ok(/if \(!change && !\(await databaseReady\(\) && \(await phoneSession\(\)\)\?\.account\)\) return null/.test(read('lib/entryClient.ts')),
    'a phone with no account never asks about clubs at all')
  const entryStore = read('app/api/entry/store.ts')
  ok(/eventClub\(db, row\.id\)/.test(entryStore) && /select\('club_id, club_access'\)/.test(entryStore),
    'the event’s club is read in a query of its own, so nothing changes before 086')

  section('Stage (h): the club area, and the club’s events made from it (D144, D153)')
  const gate = read('app/dashboard/create/MemberGate.tsx')
  ok(/Whose event is this\?/.test(gate) && /status === 'verified' && mayAdminister\(k\.role\)/.test(gate),
    'the gate asks "Whose event is this?" of a verified club’s owners and admins only')
  ok(/EventClubContext\.Provider value=\{whose\.club\}/.test(gate), '  …and hands the answer to the wizard behind it')
  for (const f of ['CreateTripForm', 'CreateLeagueForm', 'CreateKnockoutForm', 'CreateRunForm'].map(n => `app/dashboard/create/${n}.tsx`)) {
    const form = read(f)
    ok(/const club = useEventClub\(\)/.test(form) && /clubId: club\?\.id \?\? null/.test(form) && /clubPinIssue\(club,/.test(form)
      && /<ClubPinNote club=\{club\} \/>/.test(form), `${f}: a club’s event sends its club, and its PIN is lent and optional`)
  }
  ok(/clubId: pins\.clubId/.test(read('lib/entryClient.ts')), 'the club goes beside the row, never a column (Q3)')
  const view = read('app/club/[slug]/ClubView.tsx')
  ok(/<CodeBox \/>/.test(view) && /href="\/create"/.test(view), 'the club area’s Home has the code box and Make an event')
  ok(/href=\{`\/club\/\$\{face\.slug\}\/list`\}/.test(view) && /href="\/home\?tab=events"/.test(view),
    'its Club tab holds the list (owners and admins) and Your events')
  ok(fs.existsSync('app/club/[slug]/list/page.tsx') && /notFound\(\)/.test(read('app/club/[slug]/list/page.tsx')),
    'the list lives under the club, a verified club only')
  ok(/window\.location\.replace\(state\.list \? `\/club\/\$\{state\.club\.slug\}\/list`/.test(read('app/account/club/ClubScreen.tsx')),
    '  …and the old address goes on there for a verified club')
  ok(/owner_id', userId/.test(read('app/api/club/store.ts')), 'a member’s own events include the ones they made (D144)')

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

// ─── Stage (d1): the handicap index, one value (D179) ──────────

class FakeHandicaps implements HandicapStore {
  accounts = new Map<string, number>()
  rows = new Map<string, number>()
  rowClub = new Map<string, string>()
  logs: { userId: string | null; memberId: string | null; oldIndex: number | null; newIndex: number | null; by: string | null; source: string; roundId?: string | null }[] = []
  async accountIndex(u: string) { return this.accounts.get(u) ?? null }
  async accountIndexes(us: string[]) { return new Map(us.filter(u => this.accounts.has(u)).map(u => [u, this.accounts.get(u)!])) }
  async setAccountIndex(u: string, v: number | null) { if (v === null) this.accounts.delete(u); else this.accounts.set(u, v) }
  async rowIndex(m: string) { return this.rows.get(m) ?? null }
  async rowIndexesOf(c: string) { return new Map([...this.rows].filter(([m]) => (this.rowClub.get(m) ?? c) === c)) }
  async setRowIndex(m: string, v: number | null) { if (v === null) this.rows.delete(m); else this.rows.set(m, v) }
  async log(e: FakeHandicaps['logs'][number]) { this.logs.push(e) }
}

async function handicapTests() {
  section('The handicap index: what may be stored (D179)')
  eq(readIndex('14.2'), { ok: true, value: 14.2 }, 'an ordinary index')
  eq(readIndex('+1.5'), { ok: true, value: -1.5 }, 'a plus index is stored negative, as every handicap here')
  eq(readIndex(''), { ok: true, value: null }, 'an empty box takes it off')
  eq(readIndex(null), { ok: true, value: null }, '…as null does')
  ok(!readIndex('abc').ok && !readIndex('55').ok && !readIndex('+11').ok, 'nonsense and an index out of range are refused')
  eq([INDEX_MIN, INDEX_MAX], [-10, 54], 'the range: +10 to 54')
  eq(readIndex(14.26), { ok: true, value: 14.3 }, 'kept to one decimal, as the column holds it')
  ok(sameIndex(14.2, 14.2) && !sameIndex(14.2, null) && sameIndex(null, null), 'the same to the decimal; null only equals null')
  eq([indexLabel(-1.5), indexLabel(null)], ['+1.5', 'Not set'], 'written as people write it')

  section('Linking a list row with its own index (D179)')
  eq(linkPlan(null, 14.2, 'Lahinch'), { setAccount: 14.2, clearRow: true, note: null }, 'the account has none: it takes the row\'s')
  eq(linkPlan(13.8, 13.8, 'Lahinch'), { setAccount: undefined, clearRow: true, note: null }, 'the same: only the row\'s copy goes')
  const differ = linkPlan(13.8, 14.2, 'Lahinch')
  ok(differ.setAccount === undefined && differ.clearRow && /Lahinch had 14\.2 for you; your Green Dot index 13\.8 stands/.test(differ.note ?? ''),
    'they differ: the account\'s stands, the row\'s goes, and it is said once')
  eq(linkPlan(13.8, null, 'Lahinch'), { setAccount: undefined, clearRow: false, note: null }, 'the row has none: nothing to do')

  section('The one writer logs every change (D179)')
  const h = new FakeHandicaps()
  const first = await setIndex(h, { userId: 'ross' }, 14.2, 'ross', 'me')
  ok(first.changed && h.accounts.get('ross') === 14.2, 'an account\'s index set')
  eq(h.logs[0], { userId: 'ross', memberId: null, oldIndex: null, newIndex: 14.2, by: 'ross', source: 'me', roundId: null }, '…and logged: whose, old, new, by whom, from where')
  const same = await setIndex(h, { userId: 'ross' }, 14.2, 'ross', 'me')
  ok(!same.changed && h.logs.length === 1, 'the same value again writes nothing and logs nothing')
  await setIndex(h, { memberId: 'row-ann' }, 22, 'ross', 'list')
  ok(h.rows.get('row-ann') === 22 && h.logs[1].memberId === 'row-ann' && h.logs[1].userId === null, 'an unlinked row holds its own, logged against the row')

  h.rows.set('row-dave', 14.2)
  h.accounts.set('dave', 13.8)
  const note = await linkIndex(h, 'dave', 'row-dave', 'Lahinch')
  ok(h.accounts.get('dave') === 13.8 && !h.rows.has('row-dave') && !!note, 'linking keeps the account\'s, clears the row\'s, and says so')
  ok(h.logs.some(l => l.memberId === 'row-dave' && l.oldIndex === 14.2 && l.newIndex === null && l.source === 'link'), '…the row\'s copy going is logged')
  h.rows.set('row-eve', 9.1)
  await linkIndex(h, 'eve', 'row-eve', 'Lahinch')
  ok(h.accounts.get('eve') === 9.1 && !h.rows.has('row-eve'), 'an account with none takes the row\'s')
  await severIndex(h, 'dave', 'row-dave', 'ross')
  ok(h.rows.get('row-dave') === 13.8 && h.logs.at(-1)?.source === 'unlink', 'cut from the list, the row keeps a copy, logged')

  h.rowClub.set('row-ann', 'c1'); h.rowClub.set('row-dave', 'c2')
  const shown = await listIndexes(h, 'c1', [{ id: 'row-ann', userId: null }, { id: 'row-eve', userId: 'eve' }, { id: 'row-x', userId: null }])
  eq([...shown], [['row-ann', 22], ['row-eve', 9.1], ['row-x', null]], 'the list: an unlinked row\'s own, a linked row\'s account\'s, else none')

  section('The club\'s list sets the one index (D179)')
  const st = new Stand()
  const ross = member('ross', 'ross@x.ie'), dave = member('dave', 'dave@x.ie')
  ;[ross, dave].forEach(u => st.add(u))
  st.handicaps = new FakeHandicaps()
  const ask = (tok: string, action: string, body: Record<string, unknown> = {}) => runClub({ token: tok, action, address: 'a', ...body }, st, st.clock)
  const made = await ask('tok-ross', 'create', { name: 'Index GC', yourName: 'Ross' })
  const clubId = made.status === 200 ? made.body.club!.id : ''
  await ask('tok-ross', 'add', { clubId, rows: [{ name: 'Dave Byrne', email: 'dave@x.ie' }, { name: 'Ann Lee' }] })
  const listed = await ask('tok-ross', 'members', { clubId })
  const annRow = listed.status === 200 ? listed.body.list!.find(r => r.name === 'Ann Lee')! : null
  const set = await ask('tok-ross', 'update', { clubId, memberId: annRow?.id, handicapIndex: '18.4' })
  ok(set.status === 200 && set.body.list?.find(r => r.id === annRow?.id)?.handicapIndex === 18.4, 'an admin sets an unlinked row\'s index, and the list shows it')
  eq((await ask('tok-ross', 'update', { clubId, memberId: annRow?.id, handicapIndex: '99' })).status, 400, 'an index out of range is refused')
  const rossRow = [...st.list.values()].find(r => r.userId === 'ross')!
  await ask('tok-ross', 'update', { clubId, memberId: rossRow.id, handicapIndex: '+0.4' })
  ok((st.handicaps as FakeHandicaps).accounts.get('ross') === -0.4, 'a linked row\'s is the account\'s own: changed there')
  const rossLog = (st.handicaps as FakeHandicaps).logs.at(-1)
  ok(rossLog?.userId === 'ross' && rossLog.source === 'list' && rossLog.by === 'ross', '…logged as the list\'s, by whom')
  const home = await ask('tok-ross', 'home-course', { clubId, courseId: 'course-1' })
  ok(home.status === 200 && home.body.club?.homeCourseId === 'course-1', 'the club\'s home course is set (D161)')
  eq((await ask('tok-dave', 'home-course', { clubId, courseId: 'course-1' })).status, 403, '…by its owners and admins only')
}

// ─── Stage (d1): the competition's groundwork ──────────────────

async function competitionTests() {
  section('Where a competition stands (D169–D172, lib/compPhase.ts)')
  const H = 3_600_000
  const at = Date.parse('2026-11-22T08:00:00Z')
  const f = (o: Partial<CompFacts> = {}): CompFacts => ({
    bookingOpensAt: at - 48 * H, firstTeeAt: at, booked: 0, finished: 0, cardsStarted: false, certifiedAt: null, ...o,
  })
  eq(compPhase(f(), at - 72 * H), 'announced', 'before booking opens: Announced')
  eq(compPhase(f(), at - 24 * H), 'booking', 'from the opening: Booking open')
  eq(compPhase(f({ bookingOpensAt: null }), at - 72 * H), 'booking', 'no opening set: open from the start')
  eq(compPhase(f({ booked: 8 }), at), 'in_play', 'from the first tee time: In play')
  eq(compPhase(f({ booked: 8, cardsStarted: true }), at - H), 'in_play', '…or from the first card started')
  eq(compPhase(f({ booked: 8, finished: 7 }), at + 8 * H), 'in_play', 'one card not yet accounted for: still In play, however late')
  eq(compPhase(f({ booked: 8, finished: 8 }), at + 8 * H), 'awaiting', 'every booked player signed or No return: Awaiting sign-off')
  eq(compPhase(f({ booked: 8, finished: 8, certifiedAt: '2026-11-22T18:00:00Z' }), at + 9 * H), 'certified', 'certified: Certified')
  ok(!sectionLive('tee', 'announced') && sectionLive('tee', 'booking') && !sectionLive('scoring', 'booking')
    && sectionLive('scoring', 'in_play') && sectionLive('board', 'certified'), 'the bar\'s sections go live by phase (D181)')
  ok(/^Booking opens .*(November).*/.test(sectionWaitLine('tee', at - 48 * H)) && /first tee time/.test(sectionWaitLine('scoring', at)),
    'a section not yet live says when it starts, Irish time')

  section('A club competition\'s door: the club\'s list, never a PIN box (D164)')
  const code = 'COMP01'
  const publicHash = await hashPinForDoor(unheldPin(), code)
  const door: Partial<ActionStore> = {
    async tripByCode(c: string) { return c === code ? { id: 't1', code, publicHash } as never : null },
    async userFromToken(t: string) { return t.startsWith('tok-') ? t.slice(4) : null },
    async clubMember(_trip: string, userId: string) { return userId === 'dave' },
  }
  const ask = (token: string | null, pin: string | null = null) => runDoor({ code, pin, address: 'a', token }, door as ActionStore, NOW)
  const member = await ask('tok-dave')
  ok(member.status === 200 && member.cookie === entryToken(publicHash, code), 'a signed-in member on the club\'s list goes through, with no PIN')
  eq((await ask('tok-eve')).status, 403, 'an account not on the list is refused')
  eq((await ask(null)).status, 403, 'a phone with no account is refused — the PIN is nobody\'s')
  const enter = read('app/enter/[tripCode]/page.tsx')
  ok(/if \(trip\.competition === 'club'\) redirect\(`\/club\/comp\/\$\{tripCode\}`\)/.test(enter)
    && enter.indexOf("trip.competition === 'club'") < enter.indexOf('<EntryGate'),
    'the event\'s own door sends a competition on before any PIN box is drawn')
  const byCode = read('app/club/comp/[code]/page.tsx')
  ok(/t\.competition !== 'club'/.test(byCode) && /verified_at/.test(byCode) && /redirect\(section \? compSectionHref\(c\.slug, code, section\) : compHome\(c\.slug, code\)\)/.test(byCode),
    '/club/comp/<code> finds a verified club\'s competition and goes on to it; anything else is not found')
  ok(RESERVED_CLUB_SLUGS.includes('comp'), 'no club may have the address "comp"')
  eq(nextSlug('comp', []), 'comp-2', '…a club named Comp gets comp-2')
  ok(/club_member_id/.test(read('app/api/club/store.ts')) && /in\('club_member_id', memberIds\)/.test(read('app/api/club/store.ts')),
    '"You\'re in" reads a player made from your place on the list (D163)')

  section('Migration 089')
  const sql = read('supabase/migrations/20260101000089_club_competitions_groundwork.sql')
  ok(/clubs ADD COLUMN IF NOT EXISTS home_course_id/.test(sql) && /club_members ADD COLUMN IF NOT EXISTS handicap_index/.test(sql)
    && /players ADD COLUMN IF NOT EXISTS club_member_id/.test(sql) && /trips ADD COLUMN IF NOT EXISTS competition/.test(sql),
    'the four columns')
  ok(/GRANT SELECT \(competition\) ON public\.trips TO authenticated/.test(sql), 'the new trips column granted by name, as 071 needs')
  ok(/uq_players_club_member ON players\(trip_id, club_member_id\) WHERE club_member_id IS NOT NULL/.test(sql), 'one player per list row per event')
  for (const t of ['account_handicaps', 'handicap_changes']) {
    ok(new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).test(sql) && new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`).test(sql),
      `${t}: server only`)
  }
  ok(/-- ─── Undo/.test(sql) && /DROP TABLE IF EXISTS handicap_changes/.test(sql), 'with its undo')
}

// ─── Stage (d2): the competition in the club area ──────────────

async function competitionD2Tests() {
  section('A competition from the short form (D162, lib/clubComp.ts)')
  const form: CompForm = {
    name: 'November Medal', date: '2026-11-22', courseId: 'course-1', scoring: 'stableford', allowance: 95, watch: 'members',
    first: '08:00', interval: 10, perTime: 4, times: 20, opens: { daysBefore: 7, time: '20:00' },
  }
  eq(compFormIssue(form, '2026-11-16'), null, 'a whole form passes')
  ok(!!compFormIssue({ ...form, name: '' }, '2026-11-16') && !!compFormIssue({ ...form, date: '2026-11-01' }, '2026-11-16')
    && !!compFormIssue({ ...form, perTime: 5 }, '2026-11-16') && !!compFormIssue({ ...form, allowance: 40 }, '2026-11-16'),
    'no name, a day gone, five a time, a 40% allowance: each refused in a sentence')
  eq(compTeeRules(form), { batches: [{ start: '08:00', interval: 10, count: 20, ends: 'count' }], groupSize: 4, opens: { daysBefore: 7, time: '20:00' } },
    'its tee sheet: one run of times, opening when asked')
  eq(compBoard('r1', form), { id: 'lb-primary', audience: 'individual', competition: 'league', scoring: 'stableford', combine: 'total',
    roundIds: ['r1'], tieBreak: 'countback', clubCompetition: true, handicapAllowance: 95 }, 'its one board: individual, its round, countback (D182)')
  const parsed = parseLeaderboards([compBoard('r1', form)])[0]
  ok(parsed.tieBreak === 'countback' && parsed.clubCompetition === true, 'the board keeps its countback when read back')
  const older = parseLeaderboards([{ ...compBoard('r1', form), clubCompetition: undefined }])[0]
  ok(older.tieBreak === undefined, '…and a totals board without the mark still drops a stored countback — no board read before changes')
  ok(compPermissions().edit_handicaps === false && compPermissions().edit_tee_sheet === true, 'the handicap is the account\'s, never the event\'s (D179)')
  eq(readCompForm({ name: '  A   B ', watch: 'guests' })?.name, 'A B', 'answers read and tidied')

  section('Booking rules (D173)')
  const rules = compTeeRules(form)
  const t8 = Date.parse('2026-11-22T08:00:00Z')
  const base = { rules, date: '2026-11-22', slot: 0, taken: 0, adding: 1, admin: false }
  eq(bookingIssue({ ...base, now: t8 - 10 * 86_400_000 }), 'Booking is not open yet.', 'before the opening: refused')
  eq(bookingIssue({ ...base, admin: true, now: t8 - 10 * 86_400_000 }), null, '…but the club\'s admins may place people early')
  eq(bookingIssue({ ...base, now: t8 - 3_600_000 }), null, 'open: a booking goes in')
  eq(bookingIssue({ ...base, taken: 3, adding: 2, now: t8 - 3_600_000 }), 'That tee time has one place left.', 'no more than the time holds')
  eq(bookingIssue({ ...base, now: t8 + 60_000 }), 'That tee time has gone.', 'never after the time')
  eq(withdrawIssue({ date: '2026-11-22', clock: '08:00', mine: false, bookedByMe: false, admin: false, now: t8 - 1 }) !== null, true, 'somebody else\'s booking: not yours to take off')
  eq(withdrawIssue({ date: '2026-11-22', clock: '08:00', mine: true, bookedByMe: false, admin: false, now: t8 - 1 }), null, 'your own: yes, until the time')

  section('Making the competition (/api/club/competition)')
  const madeRows: Record<string, unknown>[] = []
  const pins: { admin: unknown; public: unknown; clubId: unknown }[] = []
  const created: Record<string, unknown>[] = []
  const createStand: CreateStore = {
    async userFromToken(t) { return t.slice(4) },
    async isMember() { return true },
    async insertTrip(row) { madeRows.push(row); return { id: 'trip-1' } },
    async writeMembership() {},
    async writeLeadEmail() {},
    async deleteTrip() { madeRows.pop() },
    async adminClubs(u) { return u === 'ross' ? [{ id: 'c1', name: 'Lahinch' }] : [] },
    async setEventClub(_t, clubId, access) { pins.push({ admin: null, public: null, clubId: `${clubId}:${access}` }) },
  }
  const verified = { id: 'c1', slug: 'lahinch', name: 'Lahinch', verifiedAt: NOW.toISOString(), refusedAt: null }
  const compStore = (role: 'owner' | 'admin' | 'member'): CompetitionStore => ({
    async userFromToken(t) { return member(t.slice(4), `${t.slice(4)}@x.ie`) },
    async clubsOf() { return [{ club: verified, row: { id: 'row', clubId: 'c1', name: 'Ross', memberNumber: null, guiNumber: null, email: null, role, userId: 'ross', removedAt: null, onBoards: true } }] },
    create: createStand,
    async insertItem(row) { created.push({ item: row }); return 'item-1' },
    async insertRound(row) { created.push({ round: row }) },
    async deleteTrip() {},
    newCode: () => 'COMP01',
    newId: () => 'round-1',
  })
  eq((await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form }, compStore('member'), NOW)).status, 403, 'a plain member cannot make one')
  const ok1 = await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form }, compStore('admin'), NOW)
  ok(ok1.status === 200 && ok1.body.ok && ok1.body.code === 'COMP01' && ok1.body.slug === 'lahinch', 'an admin makes one')
  const row = madeRows[0] as Record<string, unknown>
  ok(row.competition === 'club' && row.kind === 'tournament' && row.start_date === '2026-11-22' && row.end_date === '2026-11-22',
    '…a tournament of one day, marked a club competition')
  ok(!('settings_passcode_hash' in row) || String(row.settings_passcode_hash).startsWith('s1$'), '…locked to the club\'s admins with a PIN nobody holds')
  ok(String(row.public_passcode_hash ?? '').startsWith('s1$'), '…and members only: the door\'s PIN nobody holds (D164)')
  eq(pins[0]?.clubId, 'c1:admins', '…under the club, Club admins only')
  const round = (created.find(c => 'round' in c) as { round: Record<string, unknown> }).round
  ok(round.start_format === 'tee_sheet' && round.scheduled_date === '2026-11-22' && JSON.stringify(round.tee_sheet) === JSON.stringify(rules),
    '…its round on the tee sheet from the start, the rules written at once')
  madeRows.length = 0
  await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: { ...form, watch: 'guests' } }, compStore('admin'), NOW)
  ok(!madeRows[0]?.public_passcode_hash, 'guests can watch: no door (D184)')

  section('Booking from the club\'s list (/api/club/booking)')
  const listRow = (id: string, name: string, userId: string | null, role: 'owner' | 'admin' | 'member' = 'member') =>
    ({ id, clubId: 'c1', name, memberNumber: null, guiNumber: null, email: null, role, userId, removedAt: null, onBoards: true })
  const rows = [listRow('r-ross', 'Ross', 'ross'), listRow('r-dave', 'Dave', 'dave'), listRow('r-ann', 'Ann', null), listRow('r-adm', 'Admin', 'adm', 'admin')]
  let ps: CompPlayer[] = []
  let bs: Booked[] = []
  const links: string[] = []
  const indexSets: string[] = []
  const bstore: BookingStore = {
    async userFromToken(t) { return member(t.slice(4), `${t.slice(4)}@x.ie`) },
    async competition(c) { return c === 'COMP01' ? { tripId: 't1', code: 'COMP01', clubId: 'c1', roundId: 'rd', date: '2026-11-22', rules, publicHash: 's1$x$y$fp' } : null },
    async myRow(_c, u) { return rows.find(r => r.userId === u) ?? null },
    async rowsByIds(_c, ids) { return rows.filter(r => ids.includes(r.id)) },
    async searchRows(_c, q) { return rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())).map(r => ({ id: r.id, name: r.name, linked: !!r.userId })) },
    async indexOf(r) { return r.id === 'r-ross' ? 14.2 : null },
    async players() { return ps },
    async bookings() { return bs },
    async insertPlayer(r) { const id = `p-${r.club_member_id}`; ps.push({ id, clubMemberId: r.club_member_id }); return id },
    async insertBookings(rs) { if (rs.some(r => bs.some(b => b.playerId === r.player_id))) return 'clash'; bs.push(...rs.map(r => ({ playerId: r.player_id, slot: r.slot_index, bookedBy: r.booked_by }))); return 'ok' },
    async deleteBookings(_r, ids) { bs = bs.filter(b => !ids.includes(b.playerId)) },
    async deletePlayerIfUnplayed(id) { ps = ps.filter(p => p.id !== id) },
    async linkAccount(u, _t, p) { links.push(`${u}:${p}`) },
    doorToken: () => 'door-token',
    async setIndexFromCard(r, v, by) { indexSets.push(`${r.id}:${v}:${by}`) },
  }
  const open = new Date(t8 - 3_600_000)
  const book = (tok: string, body: Record<string, unknown>, now = open) => runBooking({ token: tok, action: 'book', code: 'COMP01', ...body }, bstore, now)
  eq((await runBooking({ token: 'tok-eve', action: 'state', code: 'COMP01' }, bstore, open)).status, 403, 'somebody not on the list is refused')
  const st = await runBooking({ token: 'tok-ross', action: 'state', code: 'COMP01' }, bstore, open)
  ok(st.status === 200 && st.door?.value === 'door-token', 'a member on the list is handed the door\'s way through (D164)')
  const mine = await book('tok-ross', { slot: 0, memberIds: ['r-ross', 'r-dave'] })
  ok(mine.status === 200 && mine.body.ok && mine.body.myPlayerId === 'p-r-ross', 'Ross books himself and Dave in one go')
  ok(ps.length === 2 && bs.every(b => b.slot === 0 && b.bookedBy === 'p-r-ross'), '…a player made for each list row, booked by Ross')
  ok(links.includes('ross:p-r-ross'), '…Ross\'s account linked to his own player (D134)')
  const ann = await book('tok-ross', { slot: 1, memberIds: ['r-ann'] })
  ok(ann.status === 409 && !ann.body.ok && /needs a Green Dot account/.test(ann.body.error), 'Ann has no account: every player needs their own (D94, amended)')
  eq((await book('tok-dave', { slot: 1, memberIds: ['r-dave'] })).status, 409, 'Dave has a time already: refused')
  eq((await book('tok-ross', { slot: 0, memberIds: ['r-adm'] }, new Date(t8 + 60_000))).status, 409, 'after the time has gone: refused')
  const names = await runBooking({ token: 'tok-ross', action: 'names', code: 'COMP01', q: 'an' }, bstore, open)
  ok(names.status === 200 && names.body.names?.find(n => n.id === 'r-ann')?.linked === false, 'the partner search says who has no account')
  eq((await runBooking({ token: 'tok-adm', action: 'withdraw', code: 'COMP01', memberId: 'r-dave' }, bstore, open)).status, 200, 'an admin takes anybody off')
  ok(!bs.some(b => b.playerId === 'p-r-dave') && !ps.some(p => p.id === 'p-r-dave'), '…the booking and its unplayed player gone')
  eq((await runBooking({ token: 'tok-dave', action: 'withdraw', code: 'COMP01', memberId: 'r-ross' }, bstore, open)).status, 403, 'Dave may not take Ross off — not his booking')
  const idx = await runBooking({ token: 'tok-ross', action: 'index', code: 'COMP01', playerId: 'p-r-ross', index: '13.9' }, bstore, open)
  ok(idx.status === 200 && indexSets[0] === 'r-ross:13.9:ross', 'the start sheet changes the one index, by the member starting the card (D179)')

  section('Every member watches; only the tee sheet plays (D184; Ross, 16 Nov 2026)')
  eq(mergeGrant(null, { watchOnly: true, playerId: 'p1' }, NOW).role, 'spectator', 'somebody not playing watches only, whatever they claim')
  eq(mergeGrant({ role: 'player', playerId: 'p1', organiserUntil: null }, { watchOnly: true }, NOW).role, 'player', '…and off a competition nobody is lowered')
  const lowered = mergeGrant({ role: 'player', playerId: 'p1', organiserUntil: '2026-11-15T20:00:00Z' }, { watchOnly: true, exact: true }, NOW)
  ok(lowered.role === 'spectator' && lowered.playerId === null && Date.parse(lowered.organiserUntil ?? '') === Date.parse('2026-11-15T20:00:00Z'),
    'on a competition a player taken off the sheet is a spectator again — the organiser\'s hours untouched')
  const raised = mergeGrant({ role: 'guest', playerId: null, organiserUntil: null }, { playerId: 'p9', exact: true }, NOW)
  ok(raised.role === 'player' && raised.playerId === 'p9', '…and a booked player is their booked player')
  const ent: Membership[] = []
  const entryStore = (booked: string | null, admins: string[] = []): EntryStore => ({
    async userFromToken(t) { return t.slice(4) },
    async tripByCode() { return { id: 't1', code: 'COMP01', endDate: null, adminHash: 's1$x$y$fp', publicHash: null, openEnded: false, clubId: 'c1', clubName: 'Rosses', clubAdminIds: admins, competition: true } },
    async claimedPlayer() { return true },
    async readMembership() { return ent[ent.length - 1] ?? null },
    async bookedPlayer() { return booked },
    async writeMembership(_u, _t, m) { ent.push(m) },
    async readAttempts() { return new Map() },
    async writeAttempt() {},
    async upgradePin() {},
  })
  const enter = (store: EntryStore, playerId: string | null = null) => runEntry({ token: 'tok-dave', code: 'COMP01', playerId, address: 'a' }, store, NOW)
  const watching = await enter(entryStore(null), '00000000-0000-4000-8000-000000000001')
  ok(watching.status === 200 && watching.body.ok && watching.body.role === 'spectator' && watching.body.readOnly, 'a member not on the tee sheet watches — reads, never writes')
  const playing = await enter(entryStore('p-dave'))
  ok(playing.status === 200 && playing.body.ok && playing.body.role === 'player' && ent[ent.length - 1].playerId === 'p-dave', 'a member on the tee sheet plays, as their booked player')
  const withdrawn = await enter(entryStore(null))
  ok(withdrawn.status === 200 && withdrawn.body.ok && withdrawn.body.role === 'spectator', '…and watches again once taken off it')
  ent.length = 0
  const adminIn = await enter(entryStore(null, ['dave']))
  ok(adminIn.status === 200 && adminIn.body.ok && adminIn.body.role !== 'spectator', 'the club\'s admins are never made spectators')
  const entry = read('app/api/entry/entry.ts')
  ok(!/@\/app\/api\/club\//.test(entry) && !/@\/lib\/account/.test(entry), '…without the entry route naming the club route or an account (D94\'s guard)')
  const idxOff = await runBooking({ token: 'tok-dave', action: 'index', code: 'COMP01', playerId: 'p-r-ross', index: '12' }, bstore, open)
  eq(idxOff.status, 403, 'a member not on the tee sheet starts no card — the start sheet\'s index refused')
  const stateRoss = await runBooking({ token: 'tok-ross', action: 'state', code: 'COMP01' }, bstore, open)
  ok(stateRoss.status === 200 && stateRoss.body.ok && stateRoss.body.booked === true, 'the booking answer says whether this member is on the sheet')
  ok(/memberDoor\(tripCode\)/.test(read('app/enter/[tripCode]/EntryGate.tsx')) && /storedAccountSession\(\)/.test(read('lib/entryClient.ts')),
    'every club event\'s PIN door lets a signed-in member of the club straight through')

  section('Never a PIN box on a competition; its addresses lead into the club')
  for (const f of ['app/components/OrganiserLock.tsx', 'app/components/InlineUnlock.tsx']) {
    ok(/useCompetitionClub\(tripCode\)/.test(read(f)) && /competitionLockLine\(competition\)/.test(read(f)), `${f}: a competition says who runs it, no PIN box`)
  }
  const lock = read('app/components/OrganiserLock.tsx')
  ok(/open && !unlocked && !competition && !forgot && \(\s*<form/.test(lock), '…the padlock\'s PIN form is drawn only off a competition')
  ok(/if \(competition\) return <p/.test(read('app/components/InlineUnlock.tsx')), '…and the in-place prompt draws none either')
  ok(/if \(data && competition\) redirect\(`\/club\/comp\/\$\{data\.trip_code\}`\)/.test(read('app/[code]/page.tsx')), 'the short link goes into the club')
  ok(/if \(trip && competition\) redirect\(`\/club\/comp\//.test(read('app/golf/[root]/[tripCode]/page.tsx')), 'the event\'s home goes into the club')
  ok(/competitionBack/.test(read('app/golf/[root]/[tripCode]/scoring/[roundNumber]/page.tsx')), 'the card\'s back arrow returns to the competition')
  const cleanup = read('app/api/cleanup/route.ts')
  ok(/eq\("competition", "club"\)/.test(cleanup) && /filter\(c => !held\.has\(c\.round_id\)\)/.test(cleanup) && /filter\(a => !held\.has\(a\.round_id\)\)/.test(cleanup),
    'the nightly cleanup closes and deletes nothing on a competition')
  ok(/competition && tripCode && \(\s*<IndexConfirm/.test(read('app/scoring/LiveScoringFlow.tsx')), 'the start sheet confirms each index on a competition only')
  ok(!/@\/lib\/account/.test(read('app/scoring/IndexConfirm.tsx')), '…through the phone\'s own sign-in, never the account code')
  ok(/placeClass\(row\.place, provisional\)/.test(read('app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient.tsx'))
    && /provisional=\{provisional\}/.test(read('app/club/[slug]/comp/[code]/CompBoard.tsx')), 'no gold before Certify (D171)')
  const compRead = read('app/club/[slug]/comp/[code]/read.ts')
  ok(compRead.indexOf('entryAllowed(') < compRead.indexOf('readCompSheet(') && /return \{ \.\.\.base, door: true as const \}/.test(compRead)
    && /page\.door \? \(/.test(read('app/club/[slug]/comp/[code]/CompShell.tsx')) && /<CompDoor /.test(read('app/club/[slug]/comp/[code]/CompShell.tsx')),
    'the competition pages read nothing of the competition without the door')
  for (const f of ['page.tsx', 'tee-times/page.tsx', 'scoring/page.tsx', 'leaderboard/page.tsx', 'section.tsx']) {
    ok(!/ClubTabBar|CompBar/.test(read(`app/club/[slug]/comp/[code]/${f}`)), `…and ${f} draws no bar of its own (D180 amended)`)
  }
}

async function competitionD3Tests() {
  section('A card\'s score rows, one rule for the phone and the server (lib/cardCommit.ts)')
  const holes: CommitHole[] = Array.from({ length: 18 }, (_, i) => ({ id: `h${i + 1}`, hole_number: i + 1, par: i % 3 === 0 ? 3 : 4, stroke_index: i + 1 }))
  const card = { 0: { a: { gross: 3, isNR: false, stableford: 2, putts: 5, fairway: null } }, 1: { a: { gross: null, isNR: true, stableford: 0, putts: null, fairway: 'left' as const } } }
  const out = cardScoreRows(card, holes, [{ id: 'a', gender: 'M', playingHcp: 18 }], 'rd')
  eq(out.length, 18, 'every hole is written for every player')
  ok(out[0].gross_score === 3 && out[0].putts === null && !out[0].no_return, 'more putts than shots is dropped, the gross kept')
  ok(out[1].no_return && out[1].gross_score === nrGross(4, 2, 18) && out[1].fairway_hit === 'left', 'a pick-up is net double bogey off the full handicap, its fairway kept')
  ok(out[5].no_return && out[5].gross_score === nrGross(4, 6, 18) && out[5].fairway_hit === null, 'a hole with nothing on it is a no return')
  const flow = read('app/scoring/LiveScoringFlow.tsx')
  ok(/const scoreRows = cardScoreRows\(finalCard, courseHoles,/.test(flow) && !/function nrGross/.test(flow),
    'the phone\'s commit writes through the same rule — no second copy')
  ok(/if \(competition && tripCode\) \{[\s\S]*signCompetitionCard\(tripCode/.test(flow) && flow.indexOf('signCompetitionCard(tripCode') < flow.indexOf('upsert(scoreRows'),
    'a competition card is signed on the server, before the phone would write any score')
  ok(!/@\/lib\/account/.test(read('app/scoring/MarkerPicker.tsx')) && !/@\/lib\/account/.test(flow), '…through the phone\'s own sign-in, never the account code')

  section('Signing a competition card: the player\'s approval and a marker\'s (D176–D178, amended)')
  const row = (id: string, name: string, userId: string | null, role: 'owner' | 'admin' | 'member' = 'member') =>
    ({ id, clubId: 'c1', name, memberNumber: null, guiNumber: null, email: null, role, userId, removedAt: null, onBoards: true })
  const rows = [row('r-ross', 'Ross', 'ross'), row('r-dave', 'Dave', 'dave'), row('r-sean', 'Seán', 'sean'), row('r-ann', 'Ann', null), row('r-adm', 'Admin', 'adm', 'admin'), row('r-eve', 'Eve', 'eve')]
  const players: SignPlayer[] = [
    { id: 'p-ross', clubMemberId: 'r-ross', name: 'Ross', gender: 'M' },
    { id: 'p-dave', clubMemberId: 'r-dave', name: 'Dave', gender: 'M' },
  ]
  const rules = { batches: [{ start: '08:00', interval: 10, count: 4, ends: 'count' as const }], groupSize: 4 }
  let sigs: (Signature & { sentBack?: boolean })[] = []
  let scoreRows: { player_id: string }[] = []
  const committed = new Map<string, boolean>()
  let liveStatus = 'active'
  const saved: SavedScore[] = ['p-ross', 'p-dave'].flatMap(p => Array.from({ length: 18 }, (_, i) => ({ player_id: p, hole_number: i + 1, gross_score: 5, stableford_points: 1 })))
  let ready = true
  const store: SignStore = {
    async userFromToken(t) { return member(t.slice(4), `${t.slice(4)}@x.ie`) },
    async competition(c) { return c === 'COMP01' ? { tripId: 't1', code: 'COMP01', clubId: 'c1', roundId: 'rd', date: '2026-11-22', rules, publicHash: null } : null },
    async myRow(_c, u) { return rows.find(r => r.userId === u) ?? null },
    async rowsByIds(_c, ids) { return rows.filter(r => ids.includes(r.id)) },
    async players() { return players },
    async bookings() { return [{ playerId: 'p-ross', slot: 0, bookedBy: 'p-ross' }, { playerId: 'p-dave', slot: 0, bookedBy: 'p-ross' }] },
    async liveCard(id) { return id === 'lr1' ? { id, roundId: 'rd', status: liveStatus, playerIds: ['p-ross', 'p-dave'] } : null },
    async signatures() { return ready ? sigs.filter(x => !x.sentBack) : null },
    async holes() { return holes },
    async playingHcps(_r, ids) { return new Map(ids.map(id => [id, 10])) },
    async liveScores(_r, ids) { return saved.filter(x => ids.includes(x.player_id)) },
    async upsertScores(r) { scoreRows = [...scoreRows.filter(x => !r.some(y => y.player_id === x.player_id)), ...r] },
    async markCommitted(_r, ids, c) { for (const id of ids) committed.set(id, c) },
    async insertSignatures(r: NewSignature[]) {
      if (r.some(n => sigs.some(x => !x.sentBack && x.playerId === n.player_id))) return 'clash'
      sigs.push(...r.map((n, i) => ({ id: `s${sigs.length + i}`, playerId: n.player_id, liveRoundId: n.live_round_id, finalisedBy: n.finalised_by, finalisedAt: n.finalised_at,
        approvedBy: n.approved_by, approvedAt: n.approved_at, markerMemberId: n.marker_member_id, markedBy: n.marked_by, markedAt: n.marked_at, markedAs: n.marked_as })))
      return 'ok'
    },
    async updateSignature(id, patch) {
      const x = sigs.find(y => y.id === id)!
      if (patch.approved_at !== undefined) { x.approvedAt = patch.approved_at; x.approvedBy = patch.approved_by ?? null }
      if (patch.marked_at !== undefined) { x.markedAt = patch.marked_at; x.markedBy = patch.marked_by ?? null; x.markedAs = (patch.marked_as as 'marker' | 'admin') ?? null }
      if (patch.marker_member_id !== undefined) x.markerMemberId = patch.marker_member_id
      if (patch.sent_back_at) x.sentBack = true
    },
    async finaliseCard() { liveStatus = 'finalised' },
    async reopenCard() { liveStatus = 'active' },
    async deleteScores(_r, p) { scoreRows = scoreRows.filter(x => x.player_id !== p) },
    async card(): Promise<CardHole[]> { return [] },
  }
  const sign = (tok: string, action: string, body: Record<string, unknown> = {}) => runSign({ token: tok, action, code: 'COMP01', ...body }, store, NOW)
  const sigOf = (p: string) => sigs.find(x => x.playerId === p && !x.sentBack)!

  ready = false
  const early = await sign('tok-ross', 'finalise', { liveRoundId: 'lr1', markers: {} })
  ok(early.status === 503 && !early.body.ok && /not set up yet/.test(early.body.error), 'before migration 090 the server says so, and writes nothing')
  ready = true
  eq((await sign('tok-eve', 'finalise', { liveRoundId: 'lr1', markers: { 'p-ross': { playerId: 'p-dave' }, 'p-dave': { playerId: 'p-ross' } } })).status, 403,
    'a member not on the tee sheet signs no card')
  const self = await sign('tok-ross', 'finalise', { liveRoundId: 'lr1', markers: { 'p-ross': { memberId: 'r-ross' }, 'p-dave': { playerId: 'p-ross' } } })
  ok(self.status === 400 && !self.body.ok && /own card/.test(self.body.error), 'a player never marks their own card')
  const noAcct = await sign('tok-ross', 'finalise', { liveRoundId: 'lr1', markers: { 'p-ross': { memberId: 'r-ann' }, 'p-dave': { playerId: 'p-ross' } } })
  ok(noAcct.status === 400 && !noAcct.body.ok && /needs a Green Dot account/.test(noAcct.body.error), 'a marker needs their own account')
  ok(scoreRows.length === 0 && sigs.length === 0, '…a refused finalise writes nothing')

  const fin = await sign('tok-ross', 'finalise', { liveRoundId: 'lr1', markers: { 'p-ross': { playerId: 'p-dave' }, 'p-dave': { playerId: 'p-ross' } } })
  ok(fin.status === 200 && scoreRows.length === 36 && committed.get('p-dave') === true && liveStatus === 'finalised', 'Ross finalises the two-ball: both cards\' scores written by the server, the card closed')
  ok(!!sigOf('p-ross').approvedAt && !sigOf('p-ross').markedAt, '…Ross\'s own card approved by his finalise, waiting for Dave to mark it')
  ok(!sigOf('p-dave').approvedAt && sigOf('p-dave').markedAs === 'marker', '…Dave\'s marked by Ross, who scored it, waiting for Dave\'s own approval')
  ok(fin.status === 200 && fin.body.ok && JSON.stringify(fin.body.waiting) === JSON.stringify(['p-ross', 'p-dave']), '…both waiting on somebody')
  const again = await sign('tok-ross', 'finalise', { liveRoundId: 'lr1', markers: {} })
  ok(again.status === 200 && sigs.length === 2, 'finalising again rewrites nobody already signed')

  const davesList = await sign('tok-dave', 'list')
  ok(davesList.status === 200 && davesList.body.ok && davesList.body.items?.length === 2
    && davesList.body.items.some(i => i.mine && i.canApprove) && davesList.body.items.some(i => !i.mine && i.canMark), 'Dave\'s Cards to sign: his own to approve, Ross\'s to mark')
  eq((await sign('tok-ross', 'approve', { playerId: 'p-dave' })).status, 403, 'only Dave approves Dave\'s card, on his own account')
  eq((await sign('tok-sean', 'mark', { playerId: 'p-ross' })).status, 403, 'somebody not chosen, and not an admin, marks nothing')
  eq((await sign('tok-dave', 'approve', { playerId: 'p-dave' })).status, 200, 'Dave approves his card')
  ok(signedOff(sigOf('p-dave')), '…which is final: approved and marked')
  eq((await sign('tok-dave', 'send_back', { playerId: 'p-dave' })).status, 409, 'a card signed by both is not sent back — reopening is (d4)\'s')

  const back = await sign('tok-dave', 'send_back', { playerId: 'p-ross' })
  ok(back.status === 200 && !scoreRows.some(x => x.player_id === 'p-ross') && committed.get('p-ross') === false && liveStatus === 'active',
    'Dave, the marker, sends Ross\'s card back: its scores off and the card open again')
  ok(sigs.filter(x => x.playerId === 'p-ross').length === 1 && sigs[0].sentBack === true, '…the signature kept, closed')
  const refin = await sign('tok-ross', 'finalise', { liveRoundId: 'lr1', markers: { 'p-ross': { memberId: 'r-sean' }, 'p-dave': { playerId: 'p-ross' } } })
  ok(refin.status === 200 && sigs.length === 3 && sigOf('p-ross').markerMemberId === 'r-sean' && signedOff(sigOf('p-dave')),
    'finalised again: a fresh signature for Ross with a new marker, Dave\'s final card left alone')
  eq((await sign('tok-adm', 'approve', { playerId: 'p-ross' })).status, 403, 'an admin never approves for the player')
  const adm = await sign('tok-adm', 'mark', { playerId: 'p-ross' })
  ok(adm.status === 200 && sigOf('p-ross').markedAs === 'admin' && signedOff(sigOf('p-ross')), 'an admin signs as marker on any card (D178)')
  eq((await sign('tok-ross', 'marker', { playerId: 'p-ross', marker: { playerId: 'p-dave' } })).status, 409, 'a card marked keeps its marker')

  section('Migration 090, and who reads the signatures')
  const m090 = read('supabase/migrations/20260101000090_card_signatures.sql')
  ok(/CREATE TABLE IF NOT EXISTS card_signatures/.test(m090) && /REVOKE ALL ON public\.card_signatures FROM anon, authenticated/.test(m090)
    && /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.card_signatures TO service_role/.test(m090), 'card_signatures is server only, its grants in the file')
  ok(/uq_card_signatures_open ON card_signatures\(round_id, player_id\) WHERE sent_back_at IS NULL/.test(m090), '…one open signature a player a round')
  ok(/t\.competition IS DISTINCT FROM 'club'/.test(m090) && (m090.match(/phone_score_rounds\(\)\)\)/g) ?? []).length >= 4,
    'phones keep writing scores everywhere but a club competition')
  ok(/PASTE THIS AFTER THE DEPLOY/.test(m090) && /-- ─── Undo/.test(m090) && /writable_rounds\(\)\)\);\n--   DROP POLICY|WITH CHECK \(round_id IN \(SELECT public\.writable_rounds\(\)\)\);/.test(m090), '…pasted after the deploy, with its undo back to 079')
  const page = read('app/club/[slug]/comp/[code]/read.ts') + read('app/club/[slug]/comp/[code]/section.tsx')
  ok(/finished: new Set\(\[\.\.\.sheet\.final, \.\.\.sheet\.noReturns\]/.test(page), 'scoring closes once every booked card is final — approved and marked — or No return')
  ok(/<CompPlay code=\{code\}/.test(page) && /<CardsToSign code=\{code\} \/>/.test(page), 'the Scoring section: the card for the players on the sheet, and Cards to sign')
  ok(/m\.toSign\.length > 0/.test(read('app/club/[slug]/ClubView.tsx')), 'Cards to sign leads the club Home (D177)')
  ok(/notes=\{notes\}/.test(read('app/club/[slug]/comp/[code]/CompBoard.tsx')) && /notes\?\.\[row\.id\] \?\? row\.subLabel/.test(read('app/golf/[root]/[tripCode]/leaderboard/TripLeaderboardClient.tsx')),
    'the board says "To be signed" under a card still waiting')
  ok(/competition \? \(/.test(read('app/scoring/[slug]/CourseDashboardClient.tsx')), 'a competition card is never unfinalised from a phone — it is sent back')
}

async function competitionD4Tests() {
  section('Who is accounted for, and when the results may be certified (D172)')
  const st = playerStates({
    booked: ['a', 'b', 'c', 'd', 'e'],
    noReturns: ['e'],
    signatures: [{ playerId: 'a', approvedAt: 'x', markedAt: 'x' }, { playerId: 'b', approvedAt: null, markedAt: 'x' }],
    cards: [{ id: 'lr1', status: 'active', playerIds: ['c', 'z'] }, { id: 'lr0', status: 'closed', playerIds: ['d'] }],
  })
  eq([...st.values()].map(x => x.state).join(','), 'final,waiting,on_course,none,no_return', 'final, waiting, on the course, nothing yet, No return')
  ok(st.get('c')?.liveRoundId === 'lr1' && st.get('d')?.liveRoundId === null, '…an open card is the one to void; a voided card is no card')
  ok(!mayCertifyNow(st.values()), 'not certifiable while anybody is not accounted for')
  ok(mayCertifyNow([{ state: 'final' }, { state: 'no_return' }]) && !mayCertifyNow([]), '…certifiable once every booked player is signed or No return — and never with nobody booked')
  const day = irishDay('2026-07-04')
  ok(day?.from === '2026-07-03T23:00:00.000Z' && day?.to === '2026-07-04T23:00:00.000Z', 'the day\'s handicap changes are read on the Irish day (summer time)')
  ok(irishDay('2026-11-22')?.from === '2026-11-22T00:00:00.000Z', '…and in winter')

  section('No return, void, Certify, Reopen (stage (d4), /api/card/certify)')
  const row = (id: string, name: string, userId: string | null, role: 'owner' | 'admin' | 'member' = 'member') =>
    ({ id, clubId: 'c1', name, memberNumber: null, guiNumber: null, email: null, role, userId, removedAt: null, onBoards: true })
  const rows = [row('r-ross', 'Ross', 'ross'), row('r-dave', 'Dave', 'dave'), row('r-ann', 'Ann', 'ann'), row('r-adm', 'Admin', 'adm', 'admin')]
  const players: SignPlayer[] = [
    { id: 'p-ross', clubMemberId: 'r-ross', name: 'Ross', gender: 'M' },
    { id: 'p-dave', clubMemberId: 'r-dave', name: 'Dave', gender: 'M' },
    { id: 'p-ann', clubMemberId: 'r-ann', name: 'Ann', gender: 'F' },
  ]
  const rules = { batches: [{ start: '08:00', interval: 10, count: 4, ends: 'count' as const }], groupSize: 4 }
  let ready = true
  let certifiedAt: string | null = null
  let nrs: string[] = []
  const log: string[] = []
  let cards = [{ id: 'lr1', roundId: 'rd', status: 'active', playerIds: ['p-ann'] }]
  let sigs: Signature[] = [
    { id: 's1', playerId: 'p-ross', liveRoundId: 'lr0', finalisedBy: 'ross', finalisedAt: 'x', approvedBy: 'ross', approvedAt: 'x', markerMemberId: 'r-dave', markedBy: 'dave', markedAt: 'x', markedAs: 'marker' },
    { id: 's2', playerId: 'p-dave', liveRoundId: 'lr0', finalisedBy: 'ross', finalisedAt: 'x', approvedBy: null, approvedAt: null, markerMemberId: 'r-ross', markedBy: 'ross', markedAt: 'x', markedAs: 'marker' },
  ]
  const changes: DayChange[] = [{ userId: 'dave', memberId: null, oldIndex: 12.1, newIndex: 11.4, at: '2026-11-22T08:05:00Z', by: 'ross', source: 'start_sheet' }]
  const cstore: CertifyStore = {
    async userFromToken(t) { return member(t.slice(4), `${t.slice(4)}@x.ie`) },
    async competition(c) { return c === 'COMP01' ? { tripId: 't1', code: 'COMP01', clubId: 'c1', roundId: 'rd', date: '2026-11-22', rules, publicHash: null } : null },
    async myRow(_c, u) { return rows.find(r => r.userId === u) ?? null },
    async rowsByIds(_c, ids) { return rows.filter(r => ids.includes(r.id)) },
    async rowsByAccounts(_c, ids) { return rows.filter(r => r.userId && ids.includes(r.userId)) },
    async players() { return players },
    async bookings() { return players.map((p, i) => ({ playerId: p.id, slot: i, bookedBy: p.id })) },
    async liveCards() { return cards },
    async signatures() { return sigs },
    async roundLock() { return { ready, certifiedAt, noReturns: nrs } },
    async dayChanges() { return changes },
    async insertNoReturn(_r, p) { nrs = [...nrs, p] },
    async deleteNoReturn(_r, p) { nrs = nrs.filter(x => x !== p) },
    async voidCard(id) { cards = cards.map(c => (c.id === id ? { ...c, status: 'closed' } : c)); log.push(`void:${id}`) },
    async setCertified(_r, at) { certifiedAt = at },
    async logCertification(_r, a, by) { log.push(`${a}:${by}`) },
    async writeSummaries() { log.push('summaries') },
    async dropSummaries() { log.push('drop') },
  }
  const cert = (tok: string, action: string, body: Record<string, unknown> = {}) => runCertify({ token: tok, action, code: 'COMP01', ...body }, cstore, NOW)

  eq((await cert('tok-ross', 'state')).status, 403, 'only the club\'s owners and admins run the results')
  ready = false
  const early = await cert('tok-adm', 'state')
  ok(early.status === 503 && !early.body.ok && /not set up yet/.test(early.body.error), 'before migration 091 the server says so')
  ready = true
  const s0 = await cert('tok-adm', 'state')
  ok(s0.status === 200 && s0.body.ok && s0.body.mayCertify === false && s0.body.players?.find(p => p.name === 'Ann')?.state === 'on_course', 'Ann\'s card is still open: no certifying yet')
  ok(s0.status === 200 && s0.body.ok && s0.body.changes?.[0]?.name === 'Dave' && s0.body.changes[0].by === 'Ross' && s0.body.changes[0].newIndex === 11.4,
    'the day\'s index changes listed: whose, old and new, when, by whom (D179)')
  const nrOpen = await cert('tok-adm', 'no_return', { playerId: 'p-ann' })
  ok(nrOpen.status === 409 && !nrOpen.body.ok && /void it first/.test(nrOpen.body.error), 'an open card is signed or voided before a No return')
  eq((await cert('tok-adm', 'void', { liveRoundId: 'lr1' })).status, 200, 'an admin voids Ann\'s open card')
  eq((await cert('tok-adm', 'void', { liveRoundId: 'lr1' })).status, 409, '…a card no longer being scored is not voided again')
  eq((await cert('tok-adm', 'no_return', { playerId: 'p-ann' })).status, 200, 'then marks her No return')
  const early2 = await cert('tok-adm', 'certify')
  ok(early2.status === 409 && !early2.body.ok && /Dave/.test(early2.body.error), 'Dave\'s card still waits on his approval: not certified yet, and it says whose')
  sigs = sigs.map(x => (x.playerId === 'p-dave' ? { ...x, approvedAt: 'y', approvedBy: 'dave' } : x))
  const done = await cert('tok-adm', 'certify')
  ok(done.status === 200 && !!certifiedAt && log.includes('certify:adm') && log.includes('summaries'), 'certified: the round locked, logged, the season fed')
  ok((await cert('tok-adm', 'undo_no_return', { playerId: 'p-ann' })).status === 409 && nrs.includes('p-ann'), 'a certified round\'s No returns stand')
  const signAfter = await runSign({ token: 'tok-dave', action: 'send_back', code: 'COMP01', playerId: 'p-ross' }, {
    ...({} as SignStore),
    userFromToken: cstore.userFromToken, competition: cstore.competition, myRow: cstore.myRow, rowsByIds: cstore.rowsByIds,
    players: cstore.players, signatures: cstore.signatures, roundLock: cstore.roundLock,
  } as SignStore, NOW)
  eq(signAfter.status, 409, 'no card is signed, sent back or changed once certified')
  const re = await cert('tok-adm', 'reopen')
  ok(re.status === 200 && certifiedAt === null && log.includes('reopen:adm') && log.includes('drop'), 'reopened: unlocked, logged, the round out of the season')

  section('The season is fed by certified rounds only')
  const written: string[] = []
  const removed: string[] = []
  const deps = (held: boolean): SummaryDeps => ({
    async readRound() { return { tripId: 't1', roundId: 'rd', courseId: null, playedOn: null, stats: [], teeOf: new Map() } },
    async verifiedClubOf() { return 'c1' },
    async upsert(r) { written.push(...r.map(x => x.player_id)) },
    async removeOthers(r, keep) { removed.push(`${r}:${keep.length}`) },
    held: async () => held,
  })
  const heldOut = await writeRoundSummaries('COMP01', 'rd', deps(true), NOW)
  ok('written' in heldOut && heldOut.written === 0 && removed.includes('rd:0'), 'a competition round not yet certified writes no summaries and lets any go')
  ok(/heldRounds\(db, \[\.\.\.signed\]/.test(read('app/api/stats/store.ts')), '…and the nightly backstop never counts it as owed')

  section('Migration 091, and every writer respecting the lock')
  const m091 = read('supabase/migrations/20260101000091_certify_and_no_return.sql')
  ok(/ADD COLUMN IF NOT EXISTS certified_at timestamptz NULL/.test(m091), 'rounds.certified_at')
  for (const t of ['round_certifications', 'round_no_returns']) {
    ok(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated`).test(m091) && new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${t} TO service_role`).test(m091),
      `${t} is server only, its grants in the file`)
  }
  ok(/r\.trip_id IN \(SELECT public\.writable_trips\(\)\) AND r\.certified_at IS NULL/.test(m091), 'writable_rounds() locks a certified round to every phone')
  ok(/PASTE THIS AFTER THE DEPLOY, WITH NO COMPETITION CARD OPEN/.test(m091) && /--     SELECT r\.id FROM public\.rounds r WHERE r\.trip_id IN \(SELECT public\.writable_trips\(\)\)\n/.test(m091),
    '…pasted after the deploy, its undo 079\'s function word for word')
  ok(/certifiedRounds\(supabaseAdmin/.test(read('app/api/card-check/apply/route.ts')), 'a card check never re-tells a certified round')
  ok(/certifiedRounds\(db, \[roundId\]\)/.test(read('app/admin/live/actions.ts')), '/admin never voids a card on a certified round')
  const page = read('app/club/[slug]/comp/[code]/read.ts') + read('app/club/[slug]/comp/[code]/section.tsx')
  ok(/certifiedAt: sheet\.certifiedAt/.test(page) && /\.\.\.sheet\.noReturns/.test(page), 'the page\'s phase reads the certification and counts No returns as accounted for')
  ok(/phase === 'certified' && <h1 className="t-h1 text-ink mt-6">Results<\/h1>/.test(page) && /No return: /.test(page), 'certified, the board is the Results; No returns listed under it')
  ok(/<CompAdmin code=\{code\} \/>/.test(page), 'the Scoring section carries the admins\' Results card')
  ok(/round_no_returns/.test(read('app/api/club/store.ts')) && /certifiedAt: certifiedOf\.get/.test(read('app/api/club/store.ts')), 'Comps rows read Awaiting sign-off and Certified')
}

async function competitionBarTests() {
  section('The competition bar and the Summary (D180 amended, D186–D190)')
  eq(barOf('/club/lahinch', 'lahinch'), { set: 'club' }, 'the club page wears the club set')
  eq(barOf('/club/lahinch/', 'lahinch'), { set: 'club' }, '…a trailing slash too')
  eq(barOf('/club/lahinch/comp/ab12cd', 'lahinch'), { set: 'comp', code: 'AB12CD', active: 'summary' }, 'a competition\'s own address is its Summary (D186)')
  eq(barOf('/club/lahinch/comp/AB12CD/tee-times', 'lahinch'), { set: 'comp', code: 'AB12CD', active: 'tee' }, '…tee-times lights Tee times')
  eq(barOf('/club/lahinch/comp/AB12CD/scoring', 'lahinch'), { set: 'comp', code: 'AB12CD', active: 'scoring' }, '…scoring lights Scoring')
  eq(barOf('/club/lahinch/comp/AB12CD/leaderboard', 'lahinch'), { set: 'comp', code: 'AB12CD', active: 'board' }, '…leaderboard lights Leaderboard')
  eq(barOf('/club/lahinch/list', 'lahinch'), null, 'the list has no footer')
  eq(barOf('/club/lahinch/comp/AB12CD/elsewhere', 'lahinch'), null, '…nor an address that is no section')
  eq(barOf('/club/other/comp/AB12CD', 'lahinch'), null, '…nor another club\'s address')
  eq(compSectionHref('lahinch', 'ab12cd', 'board'), '/club/lahinch/comp/AB12CD/leaderboard', 'a section\'s address')
  eq(compHome('lahinch', 'ab12cd'), '/club/lahinch/comp/AB12CD', 'the Summary\'s')
  eq(compsBack('lahinch'), '/club/lahinch?tab=comps', 'Comps from a competition goes back to the club\'s Comps (Ross, 16 Nov)')
  eq([sectionOfView('tee'), sectionOfView('scoring'), sectionOfView('board'), sectionOfView('x'), sectionOfView(undefined)], ['tee', 'scoring', 'board', null, null],
    'an old ?view= names its section')
  eq(SECTION_ORDER.map(s => SECTION_LABEL[s]), ['Tee times', 'Scoring', 'Leaderboard'], 'the three, in Board, Stats and Club\'s slots (D180)')

  const at = Date.UTC(2026, 10, 19, 19, 0)
  eq(shortWhen(at), 'Thu 19 Nov, 7:00 pm', 'the Summary says when the short way, Irish time')
  eq(summaryLine('announced', { bookingOpensAt: at, firstTee: null }), 'Booking opens Thu 19 Nov, 7:00 pm', 'announced: when booking opens, no button')
  ok(/^Provisional/.test(summaryLine('awaiting', { bookingOpensAt: null, firstTee: null })), 'awaiting sign-off: provisional')
  eq(['announced', 'booking', 'in_play', 'awaiting', 'certified'].map(p => showsTopThree(p as never)), [false, false, true, true, true], 'the top three while there are cards')

  const layout = read('app/club/[slug]/layout.tsx')
  ok(/<ClubBarProvider>/.test(layout) && /<ClubTabBar slug=\{slug\} \/>/.test(layout) && /data-club style=\{look/.test(layout),
    'the club\'s layout draws the one footer, in the club\'s colour (D180 amended)')
  ok(!/cookies\(\)|revalidate|force-dynamic/.test(layout), '…reading nothing that would make the club page per visit')
  ok(!/ClubTabBar/.test(read('app/club/[slug]/ClubView.tsx').replace(/import[^\n]*\n/g, '')), 'the club page draws no bar of its own')
  ok(!fs.existsSync('app/club/[slug]/comp/[code]/CompBar.tsx'), 'the four-slot bar is gone')
  const bar = read('app/club/[slug]/ClubTabBar.tsx')
  ok(/barOf\(pathname/.test(bar) && /usePathname\(\)/.test(bar), 'which set is the address\'s, so the server draws it for anybody')
  ok(/data-set=\{comp \? 'comp' : 'club'\}/.test(bar) && /club-bar-kids/.test(bar) && /club-bar-own/.test(bar), 'one bar, both sets')
  ok(/club-bar-tray bg-club-tint/.test(bar), 'the tray in the club\'s tint (D188)')
  ok(/IconChevronLeft[^\n]*club-bar-icon-back/.test(bar), 'Comps wears a back chevron in a competition (D188)')
  ok(/compSectionHref\(slug, live\.code, 'board'\)/.test(bar) && /phase === 'in_play'/.test(bar), 'Board opens an in-play competition\'s leaderboard (D189)')
  ok(!/\b(bg|text|border|ring)-(accent|emerald)/.test(bar), 'no emerald in the bar')
  const css = read('app/globals.css')
  const inline = css.match(/@theme inline \{([^}]*)\}/)?.[1] ?? ''
  ok(['club', 'club-deep', 'on-club', 'club-tint'].every(n => new RegExp(`--color-${n}:\\s*var\\(--gd-${n}\\)`).test(inline))
    && !/--color-club/.test(css.replace(/@theme inline \{[^}]*\}/, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'the club tokens are inline, so a class reads the wrapper\'s colour, not :root\'s bark')
  ok(/\.club-bar\[data-set="comp"\] \.club-bar-kid \{[^}]*transition: transform 280ms var\(--gd-ease\) calc\(\(var\(--k\) - 1\) \* 40ms\)/.test(css),
    'the three slide out on the putt curve, 280ms, 40ms apart')
  ok(/\.club-bar-kids \{[^}]*overflow: hidden/.test(css) && !/\.club-bar-kid \{[^}]*opacity/.test(css.split('@media (prefers-reduced-motion')[0]),
    '…from behind Comps, at full opacity (Ross, 16 Nov)')
  ok(/\.club-bar\[data-set="comp"\] \.club-bar-own \{[^}]*transition: opacity 120ms ease-out/.test(css), 'Board, Stats and Club fade in 120ms')
  ok(/\.club-bar-kid \{\s*transform: translateX\(calc\(var\(--k\) \* -100%\)\);[^}]*transition: transform 200ms ease-out/.test(css), 'leaving, the reverse in 200ms, no stagger')
  ok(/prefers-reduced-motion: reduce\) \{\s*\/\*[^*]*\*\/\s*\.club-bar-kid \{\s*transform: none !important;/.test(css), 'Reduce Motion: a cross-fade, no travel')
  ok(/body:has\(\[data-no-club-bar\]\) \.club-bar \{ display: none; \}/.test(css) && /<NoBar \/>/.test(read('app/club/[slug]/comp/[code]/CompShell.tsx')),
    'the members-only door shows no footer, in the server\'s HTML')
  const summary = read('app/club/[slug]/comp/[code]/page.tsx')
  ok(/if \(asked\) redirect\(compSectionHref/.test(summary), 'an old ?view= on the Summary goes on to its section')
  ok(/<CompManage code=\{code\} \/>/.test(summary), 'Manage competition on the Summary for owners and admins')
  ok(/const gold = certified && r\.place === 1/.test(summary), 'gold only for the certified winner')
  const action = read('app/club/[slug]/comp/[code]/CompSummaryAction.tsx')
  ok(/Book a tee time/.test(action) && /Start your card/.test(action) && /Certify result/.test(action) && /See the results/.test(action),
    'the phase\'s one action')
  ok((action.match(/<ButtonLink /g) ?? []).length - (action.match(/variant="secondary"/g) ?? []).length === 3, '…one emerald button each, Change and See the results secondary')
  ok(/\/club\/comp\/\$\{tripCode\.toUpperCase\(\)\}\?view=scoring/.test(read('app/golf/[root]/[tripCode]/scoring/[roundNumber]/page.tsx')),
    'the card\'s back arrow returns to Scoring (D190), through the code\'s door')
}

/** D198: preload, then be snappy — inside a competition the tabs answer at the tap. */
function snappyTests() {
  section('Preload, then be snappy (D198)')
  const ctx = read('app/club/[slug]/ClubBarContext.tsx')
  ok(/addEventListener\('click', onClick, true\)/.test(ctx) && /setGoing\(url\.pathname\)/.test(ctx), 'a tap into the club area is noted from the touch, ahead of the link')
  ok(/useEffect\(\(\) => \{ setGoing\(null\) \}, \[pathname\]\)/.test(ctx), '…and let go once the new page is on screen')
  ok(/barOf\(going \?\? pathname/.test(read('app/club/[slug]/ClubTabBar.tsx')), 'so the footer lights the tab and slides its set at the tap')
  const shell = read('app/club/[slug]/comp/[code]/CompShell.tsx')
  ok(/<CompAhead slug=\{slug\} code=\{code\} renderedAt=\{Date\.now\(\)\} \/>/.test(shell) && !/door[^\n]*CompAhead/.test(shell), 'every open competition page fetches the other three ahead — never behind the door')
  const ahead = read('app/club/[slug]/comp/[code]/CompAhead.tsx')
  ok(/for \(const s of SECTION_ORDER\) prefetchWhole/.test(ahead) && /prefetchWhole\(router, compHome/.test(ahead), '…the Summary and all three sections, whole')
  ok(/if \(refreshed\.current\) return/.test(ahead) && /router\.refresh\(\)/.test(ahead), 'a page drawn from a copy asks again behind it, once')
  ok(/prefetchWhole\(router, clubEventHref/.test(read('app/club/[slug]/ClubView.tsx')) && /\.slice\(0, 4\)/.test(read('app/club/[slug]/ClubView.tsx')),
    'the club page fetches at most four unfinished competitions ahead')
  const client = read('lib/accountClient.ts')
  ok(/if \(action === 'state'\) return kept\(`booking:/.test(client) && /if \(r\.ok\) forgetKept\(code\)/.test(client), 'a competition\'s reads are shared and kept; a change forgets them')
  for (const f of ['CompManage', 'CompSummaryAction', 'CompTeeSheet', 'CompSigning', 'CompAdmin']) {
    ok(/useState[^\n]*\(\(\) =>[\s\S]{0,60}peekKept/.test(read(`app/club/[slug]/comp/[code]/${f}.tsx`)), `  ${f} draws from the kept answer first`)
  }
  ok(fs.existsSync('app/club/[slug]/comp/[code]/loading.tsx'), 'a page not fetched ahead lands on a stand-in at once')
  ok(JSON.parse(read('vercel.json')).regions?.[0] === 'dub1', 'the functions run in Dublin, beside the database (D196)')
}

async function main() {
  ruleTests()
  await routeTests()
  await eventTests()
  lookTests()
  await pageRouteTests()
  await handicapTests()
  await competitionTests()
  await competitionD2Tests()
  await competitionD3Tests()
  await competitionD4Tests()
  await competitionBarTests()
  snappyTests()
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
