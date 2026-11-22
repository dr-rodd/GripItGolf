/**
 * Clubs (stage (c)): the rules in lib/clubs.ts, the club route on a
 * stand-in database, a club's admins running its events (withOwner and
 * runEventClub), migration 086's SQL, and the wiring — above all that
 * nobody needs a club, or an account, to join, play, score or watch (D94).
 *
 *   npx tsx scripts/test-clubs.ts
 */
import fs from 'fs'
import * as copy from '../lib/clubHomeCopy'
import path from 'path'
import {
  INVITE_LENGTH, cleanRow, clubNameIssue, clubSlug, formatInviteCode, inviteCodeFrom, inviteCodeIssue, inviteEmail,
  listRowIssue, maskNumber, nextSlug, normaliseInviteCode,
  parseClubAccess, parseMemberList, planList, type ClubRole, type ListRow,
  clubAssetUrl, clubEventWhen, clubImageIssue, groupClubEvents, irishToday, publicClubEvents, type ClubEvent,
} from '../lib/clubs'
import {
  LAST_OWNER, clubMay, credentialChangeIssue, credentialLine, credentialsOf, removeIssue, storedRole, withChange,
  type Credentials,
  PLAYS_FOLLOWS_MEMBERSHIP, playsByMembership,
} from '../lib/clubMay'
import { FEATURES, mayUseFeature } from '../lib/tiers'
import type { SeasonRow } from '../lib/cardSummary'
import type { AuthUser } from '../lib/account'
import type { AttemptWindow, Membership } from '../lib/membership'
import type { ListQuery } from '../app/api/club/clubhouse'
import { clubEventDates, clubEventLive, seasonLongOf } from '../lib/clubs'
import { asRow, type RowRow } from '../app/api/club/rows'
import { clubCourses, matchPlace, placeFields, placeLine, placeOf, roomNameIssue, seasonPlaceLine, type ClubPlaces } from '../lib/clubLocations'
import { ELSEWHERE, dayLayout, lanesOf } from '../lib/clubDay'
import { NO_YOURS, dayWord, matchTier, mondayOf, parseDay, periodRange, quietLine, searchEvents, whatsOn, yoursIn, type YoursFacts } from '../lib/clubOverview'
import { COLUMN_DEFAULTS, COLUMN_MAX, COLUMN_MIN, clampWidth, fitWidth, readWidths, writeWidths } from '../lib/gridColumns'
import { MAX_COPIES, eventsOn, formatLine, linkable, monthGrid, noteAsSeason, seasonType, stepMonth, weeklyFrom, type SeasonEvent } from '../lib/clubhouse'
import { EVENT_TYPES, memberSees, noteIssue, noteTimeLine, readClubNote, readHiddenTypes, readMemberHidden, type ClubEventType, type ClubNote } from '../lib/clubEvents'
import { compFormFrom } from '../lib/clubComp'
import { failWords, runChangeCompetition, runCopyCompetition, runReadCompetition, type CompChange, type CompNow } from '../app/api/club/competition'
import { applyPreset, formFromPreset, planIssue, presetIssue, readPreset, resolvePlan, type TeePlan } from '../lib/clubPresets'
import { CALENDAR_COLUMNS, CALENDAR_FORMAT, calendarPrompt, calendarTemplate, readCalendarFile, readCalendarRow, rowRecipe, type CalendarCells, type CalendarContext } from '../lib/calendarImport'
import { runCalendarImport, type ImportStore } from '../app/api/club/calendarImport'
import { parseTeeRules } from '../lib/teeSheet'
import { describeTime } from '../lib/itinerary'
import { runTeeTimes, type StoredBooking, type TeeComp, type TeeTimesStore } from '../app/api/club/teeTimes'
import { DEFAULT_CASUAL, casualDay, type CasualSettings, type TeeCategory, type TeeDayBody } from '../lib/clubTeeSheet'
import { LIST_FILTERS, PAGE_SIZE, STAFF_NAME, cleanSearch, clubhouseHref, listCsv, needsYou, pageLine, sectionAt, standingOf, type ListCounts } from '../lib/clubhouse'
import { runAwards, eligiblePeople, AwardsNotReady, type Award, type AwardsStore } from '../app/api/club/awards'
import { awardIssue, awardStanding, bracketStages, defaultAwardRules, myStandingLine, placePoints, placeWords, readAwardRules, readPointsTable, type AwardResult } from '../lib/clubAward'
import { inviteHash, linkDetails, provisionClub, runClub, runUpload, type ActivityEntry, type ClubRecord, type ClubStore, type ImageWork, type MemberRecord, type RowPatch } from '../app/api/club/club'
import { CLUB_GROUNDS, cleanHex, clubColours, clubStyle, contrast, deltaE } from '../lib/clubColour'
import { EMAIL_PAID_LINE, countSince, emailCountLine, irishMidnight } from '../lib/emailCount'
import { runEntry, withOwner, type EntryStore, type EntryTrip } from '../app/api/entry/entry'
import { runDoor, runEventClub, runSetAdminPin, type ActionStore } from '../app/api/event/actions'
import { notEligibleLine } from '../lib/clubMembership'
import { compPhase, sectionLive, sectionWaitLine, shortWhen, showsTopThree, summaryLine, type CompFacts } from '../lib/compPhase'
import { barOf, clubPathOf, clubSwitch, compHome, compSectionHref, compsBack, sectionOfView, SECTION_LABEL, SECTION_ORDER } from '../lib/clubBar'
import { clubCompRoot, isTripRoot, tripHomeAt } from '../lib/tripPaths'
import { bookingIssue, compBoard, compFormIssue, compPermissions, compTeeRules, planSheetChange, readCompForm, withdrawIssue, type CompForm, type SheetBooking } from '../lib/clubComp'
import { runNewCompetition, type CompetitionStore } from '../app/api/club/competition'
import { runBooking, type BookingStore, type Booked, type CompPlayer } from '../app/api/club/booking'
import type { CreateStore } from '../app/api/trip/create/create'
import { runNewMatchPlay } from '../app/api/club/competition'
import { runMatchPlayEntry, type Entrant, type MatchPlayEntryStore } from '../app/api/club/matchPlayEntry'
import type { MatchPlayComp } from '../app/api/club/matchPlayStore'
import {
  matchPlayBoard, matchPlayFormIssue, matchPlayKeyDates, matchPlayLine, matchPlayPhase, matchPlayRules, matchPlaySeed,
  readClubMatchPlay, readMatchPlayForm, type MatchPlayForm,
  enterIssue, overCap, withdrawEntryIssue, drawDueNow,
  myClubMatch, overdueMatches, filterOverdue, roundInPlayLine,
  joinIssue, mayTakeOutOfPair, drawnPairs, partnerName, enteredWithLine, type PairEntry,
  qualifiedField, qualifiedDrawPlan,
} from '../lib/clubMatchPlay'
import { parseBracketSetup } from '../lib/bracketSetup'
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
import {
  ageBandLine, ageCountedOn, ageOn, birthRange, categoryCodeFrom, categoryIssue, entryLine, entryRefusal, entryRulesIssue, playsOn,
  readAgeDate, readBirthDate, readEntryRules, readGender, refusalWords, resolveExtras, uniqueCode, daysLine,
  type Category, type EntryRules, type Gender, type RowExtras,
} from '../lib/clubMembership'
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

  section('Credentials as ticks: lib/clubMay.ts (D208, D219, D220)')
  const C = (o: Partial<Credentials> = {}): Credentials => ({ owner: false, playsHere: true, officer: false, clubhouse: false, ...o })
  const owner = C({ owner: true, officer: true, clubhouse: true }), office = C({ clubhouse: true, playsHere: false })
  const officer = C({ officer: true }), both = C({ officer: true, clubhouse: true }), plain0 = C()
  eq(credentialsOf({ role: 'owner' }), owner, 'before 092: an owner holds everything but is never forced to play… (plays here by default)')
  eq(credentialsOf({ role: 'admin' }), both, '…today’s admins are Officer and Clubhouse')
  eq(credentialsOf({ role: 'member' }), plain0, '…and members Plays here alone')
  eq(credentialsOf({ role: 'owner', officer: false, clubhouse: false, playsHere: false }), C({ owner: true, officer: true, clubhouse: true, playsHere: false }),
    'an owner holds Officer and Clubhouse whatever is stored — Plays here is theirs to have or not')
  eq(credentialsOf({ role: 'member', officer: true, clubhouse: false, playsHere: false }), C({ officer: true, playsHere: false }), 'after 092 the ticks are read as stored')
  eq([storedRole(owner), storedRole(both), storedRole(officer), storedRole(office), storedRole(plain0)], ['owner', 'admin', 'member', 'member', 'member'] as ClubRole[],
    'the role kept beside the ticks: admin only with both, so a rollback fails safe')
  eq(withChange(plain0, { owner: true }), C({ owner: true, officer: true, clubhouse: true }), 'Owner brings Officer and Clubhouse with it')
  ok(clubMay('run_events', { row: officer }) && clubMay('run_events', { row: owner }) && !clubMay('run_events', { row: office }) && !clubMay('run_events', { row: plain0 }),
    'Officers (owners too) run the club’s events on the phone; Clubhouse alone does not')
  ok(clubMay('keep_list', { row: office }) && clubMay('open_clubhouse', { row: both }) && !clubMay('keep_list', { row: officer }),
    'Clubhouse keeps the list and opens the office, with or without Officer; Officer alone does not')
  ok(clubMay('grant_officer', { row: office }) && clubMay('grant_plays_here', { row: office }) && !clubMay('grant_clubhouse', { row: office }),
    'Clubhouse gives Plays here and Officer — never Clubhouse')
  ok(clubMay('grant_clubhouse', { row: owner }) && clubMay('grant_owner', { row: owner }), 'an owner gives Clubhouse and makes owners')
  ok(clubMay('grant_clubhouse', { row: null, staff: true }) && clubMay('keep_list', { row: null, staff: true }) && !clubMay('run_events', { row: null, staff: true }),
    'Green Dot staff do what Clubhouse and Owner do, at any club — never an Officer’s on-the-day work')
  ok(!clubMay('play', { row: office }) && clubMay('play', { row: plain0 }) && !clubMay('see_members_home', { row: null }), 'no Plays here: in no field (D209)')
  const t = (c: Credentials, removed = false) => ({ credentials: c, removed })
  eq(credentialChangeIssue({ row: office }, t(plain0), { officer: true }, 1), null, 'the office makes an Officer')
  ok(/Only an owner or Green Dot/.test(credentialChangeIssue({ row: office }, t(plain0), { clubhouse: true }, 1) ?? ''), '…but cannot give Clubhouse')
  ok(/Only someone with Clubhouse/.test(credentialChangeIssue({ row: officer }, t(plain0), { officer: true }, 1) ?? ''), 'an Officer gives no ticks')
  eq(credentialChangeIssue({ row: owner }, t(owner), { owner: false }, 1), LAST_OWNER, 'the last owner keeps Owner')
  eq(credentialChangeIssue({ row: owner }, t(owner), { owner: false }, 2), null, '…one of two may give it up')
  ok(/Take Owner off first/.test(credentialChangeIssue({ row: owner }, t(owner), { clubhouse: false }, 2) ?? ''), 'an owner’s Clubhouse is held')
  eq(credentialChangeIssue({ row: owner }, t(owner), { playsHere: false }, 1), PLAYS_FOLLOWS_MEMBERSHIP, 'Plays here is no tick: it follows the membership (D275)')
  eq(removeIssue({ row: office }, t(plain0), 1), null, 'the office takes a member off')
  ok(removeIssue({ row: office }, t(both), 1) !== null && removeIssue({ row: office }, t(owner), 2) !== null, '…never somebody with Clubhouse, or an owner')
  eq(removeIssue({ row: owner }, t(owner), 1), LAST_OWNER, 'the last owner cannot be taken off')
  eq(credentialLine(plain0, 'Lahinch'), 'Lahinch member', 'never a bare "member" on screen (D133)')
  eq([credentialLine(owner, 'L'), credentialLine(both, 'L'), credentialLine(office, 'L')], ['Owner', 'Clubhouse · Officer', 'Clubhouse · Doesn’t play here'],
    'what a row holds, said short')

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
  const upd = (id: string) => { const u = plan.updates.find(x => x.id === id); return u && { id: u.id, patch: u.patch, restore: u.restore } }
  eq(upd('r1'), { id: 'r1', patch: { name: 'Ross O’Grady', email: 'new@x.ie' }, restore: false }, 'found by GUI number: brought up to date')
  eq(upd('r2'), { id: 'r2', patch: {}, restore: true }, 'a removed row on the new list comes back')
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
      .map(row => ({ club: this.clubs.get(row.clubId)!, row })).sort((a, b) => a.club.name.localeCompare(b.club.name))
  }
  async slugsLike(base: string) { return [...this.clubs.values()].map(c => c.slug).filter(s => s.startsWith(base)) }
  async createClub(c: { slug: string; name: string; createdBy: string; verified?: boolean }, owner: { name: string; email: string | null; userId: string }) {
    const club = { id: `c${++this.n}`, slug: c.slug, name: c.name, verifiedAt: c.verified ? NOW.toISOString() : null, refusedAt: null, createdBy: c.createdBy }
    this.clubs.set(club.id, club)
    const id = `m${++this.n}`
    this.list.set(id, { id, clubId: club.id, name: owner.name, memberNumber: null, guiNumber: null, email: owner.email, role: 'owner', userId: owner.userId, removedAt: null, onBoards: true })
    return club
  }
  async club(id: string) { return this.clubs.get(id) ?? null }
  async rows(clubId: string) { return [...this.list.values()].filter(r => r.clubId === clubId).sort((a, b) => a.name.localeCompare(b.name)) }
  async insertRows(clubId: string, rows: ListRow[], extras?: RowExtras[]) {
    for (const [i, r] of rows.entries()) {
      const id = `m${++this.n}`
      const x = extras?.[i] ?? {}
      this.list.set(id, { id, clubId, name: r.name, memberNumber: r.memberNumber, guiNumber: r.guiNumber, email: r.email, role: 'member', userId: null, removedAt: null, onBoards: true,
        ...(x.categoryId !== undefined ? { categoryId: x.categoryId } : {}), ...(x.gender !== undefined ? { gender: x.gender } : {}), ...(x.birthDate !== undefined ? { birthDate: x.birthDate } : {}) })
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
      ...(p.officer !== undefined ? { officer: p.officer } : {}),
      ...(p.clubhouse !== undefined ? { clubhouse: p.clubhouse } : {}),
      ...(p.category_id !== undefined ? { categoryId: p.category_id } : {}),
      ...(p.gender !== undefined ? { gender: p.gender } : {}),
      ...(p.birth_date !== undefined ? { birthDate: p.birth_date } : {}),
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
  unlinkedCodes = new Set<string>()
  async clubEvents(clubId: string) { return (this.events.get(clubId) ?? []).filter(e => !this.unlinkedCodes.has(e.code)) }
  async setEventLink(clubId: string, code: string, unlinked: boolean) {
    const e = (this.events.get(clubId) ?? []).find(x => x.code === code)
    if (!e) return 'not_found' as const
    if (e.competition) return 'competition' as const
    if (unlinked) this.unlinkedCodes.add(code); else this.unlinkedCodes.delete(code)
    return 'ok' as const
  }
  async entries(userId: string, codes: string[]) { return (this.linked.get(userId) ?? []).filter(c => codes.includes(c)) }
  season: SeasonRow[] = []
  async seasonRows() { return { rows: this.season, courses: { c1: 'Lahinch Old' } } }
  async outsideEvents(_u: string, exclude: string[]) { return [{ code: 'TRIP01', name: 'Lads’ trip', kind: 'trip' as const, startDate: '2026-12-01', endDate: '2026-12-03', access: null }].filter(e => !exclude.includes(e.code)) }
  async topScores(codes: string[]): Promise<Record<string, { name: string; points: number }>> { return codes.includes('OLDMED') ? { OLDMED: { name: 'Ann Lee', points: 39 } } : {} }
  async putImage(path: string, bytes: Uint8Array) { this.stored.set(path, bytes) }
  async removeImage(path: string) { this.stored.delete(path) }
  activity: ActivityEntry[] = []
  async logActivity(entries: ActivityEntry[]) { this.activity.push(...entries) }
  // Stage (k1), the Clubhouse
  staff = new Set<string>()
  invitedAt = new Map<string, string>()
  async rowOf(clubId: string, userId: string) { return [...this.list.values()].find(r => r.clubId === clubId && r.userId === userId && !r.removedAt) ?? null }
  async isStaff(userId: string) { return this.staff.has(userId) }
  async searchClubs(q: string) { return [...this.clubs.values()].filter(c => c.verifiedAt && c.name.toLowerCase().includes(q.toLowerCase())) }
  async markInvited(id: string, at: string) { this.invitedAt.set(id, at) }
  async listPage(clubId: string, o: ListQuery) {
    const q = o.q.toLowerCase()
    const all = [...this.list.values()].filter(r => r.clubId === clubId)
      .filter(r => !q || [r.name, r.email, r.memberNumber, r.guiNumber].some(v => (v ?? '').toLowerCase().includes(q)))
      .filter(r => {
        const c = credentialsOf(r), live = !r.removedAt, inv = this.invitedAt.has(r.id)
        switch (o.filter) {
          case 'off': return !live
          case 'joined': return live && !!r.userId
          case 'invited': return live && !r.userId && inv
          case 'not_invited': return live && !r.userId && !inv
          case 'officer': return live && c.officer
          case 'clubhouse': return live && c.clubhouse
          default: return live
        }
      })
      .sort((a, b) => String(a[o.sort] ?? '').localeCompare(String(b[o.sort] ?? '')) * (o.desc ? -1 : 1))
    return { rows: all.slice(o.page * o.size, o.page * o.size + o.size).map(r => ({ ...r, invitedAt: this.invitedAt.get(r.id) ?? null, ownIndex: null })), total: all.length }
  }
  // Stage (m): memberships and a person's details.
  cats = new Map<string, Category>()
  details = new Map<string, { gender: Gender | null; birthDate: string | null }>()
  async categories(clubId: string) { return [...this.cats.values()].filter(c => (c as Category & { clubId?: string }).clubId === clubId) }
  async categoryCounts(clubId: string) {
    const m = new Map<string, number>()
    for (const r of this.list.values()) if (r.clubId === clubId && !r.removedAt && r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1)
    return m
  }
  async saveCategory(clubId: string, c: { id?: string; name: string; code: string; days: number[]; position: number }) {
    const id = c.id ?? `cat${++this.n}`
    this.cats.set(id, { id, name: c.name, code: c.code, days: c.days, clubId } as Category)
    return id
  }
  async deleteCategory(_clubId: string, id: string) {
    this.cats.delete(id)
    for (const r of this.list.values()) if (r.categoryId === id) this.list.set(r.id, { ...r, categoryId: null })
  }
  // Stage c1 (095): the club's own events, what it shows, what a member asks to see.
  notesOf = new Map<string, ClubNote[]>()
  hiddenOf = new Map<string, ClubEventType[]>()
  memberHiddenOf = new Map<string, ClubEventType[]>()
  async seasonEvents(clubId: string): Promise<SeasonEvent[]> {
    return (this.events.get(clubId) ?? []).map(e => ({ code: e.code, name: e.name, kind: e.kind, type: e.competition ? 'COMP' as const : 'GOLF' as const, startDate: e.startDate, endDate: e.endDate, competition: e.competition ? { phase: 'announced' as const, courseName: null, scoring: 'stableford' as const, allowance: 100, booked: 0, capacity: 0, membersOnly: true } : null, ...(this.unlinkedCodes.has(e.code) ? { unlinked: true as const } : {}) }))
  }
  async notes(clubId: string, opts: { from?: string; membersOnly?: boolean } = {}) {
    return (this.notesOf.get(clubId) ?? []).filter(n => !opts.membersOnly || n.visibility === 'members').filter(n => !opts.from || (n.endsOn ?? n.startsOn) >= opts.from)
  }
  async saveNote(clubId: string, n: Omit<ClubNote, 'id'> & { id: string | null }) {
    const list = this.notesOf.get(clubId) ?? []
    const id = n.id ?? `note${++this.n}`
    this.notesOf.set(clubId, [...list.filter(x => x.id !== id), { ...n, id }])
    return id
  }
  async deleteNote(clubId: string, id: string) { this.notesOf.set(clubId, (this.notesOf.get(clubId) ?? []).filter(n => n.id !== id)) }
  async clubHidden(clubId: string) { return this.hiddenOf.get(clubId) ?? [] }
  async setClubHidden(clubId: string, t: ClubEventType[]) { this.hiddenOf.set(clubId, t) }
  async memberHidden(userId: string) { return this.memberHiddenOf.get(userId) ?? [] }
  async accountDetails(userId: string) { return this.details.get(userId) ?? null }
  async saveDetails(userId: string, patch: { gender?: Gender | null; birthDate?: string | null }) {
    const was = this.details.get(userId) ?? { gender: null, birthDate: null }
    const next = { gender: patch.gender !== undefined ? patch.gender : was.gender, birthDate: patch.birthDate !== undefined ? patch.birthDate : was.birthDate }
    this.details.set(userId, next)
    for (const r of this.list.values()) if (r.userId === userId) this.list.set(r.id, { ...r, gender: next.gender, birthDate: next.birthDate })
  }
  async listCounts(clubId: string): Promise<ListCounts> {
    const rows = [...this.list.values()].filter(r => r.clubId === clubId)
    const live = rows.filter(r => !r.removedAt)
    const joined = live.filter(r => r.userId).length
    return {
      onList: live.length, joined, invited: live.filter(r => !r.userId && this.invitedAt.has(r.id)).length, notJoined: live.length - joined,
      off: rows.length - live.length,
      officer: live.filter(r => credentialsOf(r).officer).length, clubhouse: live.filter(r => credentialsOf(r).clubhouse).length,
      noEmail: live.filter(r => !r.userId && !r.email).length,
    }
  }
}

const member = (id: string, email: string): AuthUser => ({ id, isAnonymous: false, email, emailConfirmed: true })

/**
 * A club set up the way Green Dot does it — from /admin, for a named owner
 * (Ross, 17 Nov 2026: a member can no longer). Answers in the shape the old
 * member's `create` did, so a section reads the club it made the same way.
 */
async function setUpClub(s: Stand, tok: string, body: { name: string; yourName?: string }, verified = false) {
  const user = await s.userFromToken(tok)
  const out = await provisionClub(s, { name: body.name, owner: { userId: user!.id, email: user!.email, name: body.yourName ?? '' }, verified })
  if (!out.ok) return { status: 400, body: { ok: false as const, error: out.error, club: undefined as undefined } }
  const mine = await runClub({ token: tok, action: 'mine', address: 'a' }, s, s.clock)
  return { status: 200, body: { ok: true as const, error: '', club: mine.status === 200 ? mine.body.clubs?.find(c => c.id === out.club.id) : undefined } }
}

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

  section('Setting up a club is Green Dot\'s, from /admin — never a member\'s (Ross, 17 Nov 2026)')
  eq((await ask('tok-ross', 'create', { name: 'Lahinch Golf Club', yourName: 'Ross' })).status, 403, 'a Green Dot member asking to set up a club is refused')
  eq(s.clubs.size, 0, '…and no club was made')
  eq((await setUpClub(s, 'tok-ross', { name: 'Lahinch Golf Club' })).status, 400, 'the owner\'s name is asked for')
  eq((await setUpClub(s, 'tok-ross', { name: 'x', yourName: 'Ross' })).status, 400, '…and a real club name')
  const verifiedClub = await setUpClub(s, 'tok-ross', { name: 'Test Club', yourName: 'Ross' }, true)
  ok(verifiedClub.status === 200 && verifiedClub.body.club?.status === 'verified' && verifiedClub.body.club.credentials.owner, 'a club the admin makes is verified at once, its owner the account named')
  for (const [id, c] of s.clubs) if (c.slug === 'test-club') { s.clubs.delete(id); for (const [mid, r] of s.list) if (r.clubId === id) s.list.delete(mid) }
  const made = await setUpClub(s, 'tok-ross', { name: 'Lahinch Golf Club', yourName: 'Ross O’Grady' })
  ok(made.status === 200 && made.body.ok && made.body.club?.status === 'pending' && made.body.club.credentials.owner,
    'made (here unverified), its named owner the first owner on the list')
  const clubId = made.status === 200 ? made.body.club!.id : ''
  const again = await setUpClub(s, 'tok-eve', { name: 'Lahinch Golf Club', yourName: 'Eve' })
  ok(again.status === 200 && again.body.club?.slug === 'lahinch-golf-club-2', 'a second club of the same name gets its own address')

  section('The list is its Clubhouse holders’')
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
  const daveHere = mine.status === 200 ? mine.body.clubs?.find(c => c.id === clubId)?.credentials : undefined
  ok(!!daveHere && daveHere.playsHere && !daveHere.officer && !daveHere.clubhouse && !daveHere.owner, 'the club is in Dave’s list: plays here, nothing more')
  eq((await ask('tok-dave', 'members', { clubId })).status, 403, 'a member does not see the list')

  section('One GUI number to one account')
  const annRow = list.find(r => r.name === 'Ann Lee')!
  // Ann's row gets Dave's GUI number by mistake: Ann's code must not link a number Dave holds.
  s.list.set(annRow.id, { ...s.list.get(annRow.id)!, guiNumber: '3110002X' })
  const other = await setUpClub(s, 'tok-fay', { name: 'Ballybunion', yourName: 'Fay' })
  const otherId = other.status === 200 ? other.body.club!.id : ''
  await ask('tok-fay', 'add', { clubId: otherId, rows: [{ name: 'Ann Lee', guiNumber: '3110002', email: 'ann@x.ie' }, { name: 'Dave Byrne', email: 'dave@x.ie' }] })
  const annOther = (await s.rows(otherId)).find(r => r.name === 'Ann Lee')!
  await ask('tok-fay', 'invite', { clubId: otherId, memberId: annOther.id })
  const annCode = codeIn(s.sent.at(-1)!.text)
  eq((await ask('tok-ann', 'link', { code: annCode })).status, 409, 'a GUI number already linked to another account is held for the club')
  ok(!s.list.get(annOther.id)!.userId, '…never quietly moved')

  section('Many clubs per account (D218, D223; D145 and D150 retired)')
  const daveOther = (await s.rows(otherId)).find(r => r.name === 'Dave Byrne')!
  await ask('tok-fay', 'invite', { clubId: otherId, memberId: daveOther.id })
  const second = await ask('tok-dave', 'link', { code: codeIn(s.sent.at(-1)!.text) })
  ok(second.status === 200 && s.list.get(daveOther.id)!.userId === 'dave', 'a second club links')
  const both2 = await ask('tok-dave', 'mine')
  eq(both2.status === 200 ? both2.body.clubs?.map(c => c.name) : null, ['Ballybunion', 'Lahinch Golf Club'], '…and both are the account’s, by name')
  const setUp = await setUpClub(s, 'tok-dave', { name: 'Doonbeg', yourName: 'Dave' })
  ok(setUp.status === 200 && !!setUp.body.club?.credentials.owner, 'an account may own several clubs')
  // Undo the extra clubs for the sections that follow.
  s.list.set(daveOther.id, { ...s.list.get(daveOther.id)!, userId: null })
  for (const [id, r] of s.list) if (r.userId === 'dave' && r.clubId !== clubId) s.list.delete(id)

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

  section('A club always has an owner; ticks given by whoever clubMay says')
  const rossRow = [...s.list.values()].find(r => r.clubId === clubId && r.userId === 'ross')!
  eq((await ask('tok-ross', 'remove', { clubId, memberId: rossRow.id })).status, 409, 'the only owner cannot be taken off')
  eq((await ask('tok-ross', 'update', { clubId, memberId: rossRow.id, owner: false })).status, 409, '…or give up Owner')
  eq((await ask('tok-ross', 'update', { clubId, memberId: rossRow.id, clubhouse: false })).status, 409, '…or Clubhouse while an owner')
  eq((await ask('tok-ross', 'update', { clubId, memberId: rossRow.id, playsHere: false })).status, 409, 'Plays here is not ticked by hand: it follows the membership (D275)')
  eq(credentialsOf(s.list.get(rossRow.id)!).playsHere, true, '…and nothing changed')
  eq((await ask('tok-ross', 'update', { clubId, memberId: daveRow.id, officer: 'yes' })).status, 400, 'a tick is on or off')
  await ask('tok-ross', 'update', { clubId, memberId: daveRow.id, clubhouse: true })
  eq([s.list.get(daveRow.id)!.clubhouse, s.list.get(daveRow.id)!.role], [true, 'member' as ClubRole], 'an owner gives Clubhouse — the role stays member until Officer joins it')
  await ask('tok-ross', 'update', { clubId, memberId: daveRow.id, officer: true })
  eq(s.list.get(daveRow.id)!.role, 'admin' as ClubRole, '…both held: the role mirrors admin')
  ok(s.activity.some(a => a.action === 'credentials' && a.memberId === daveRow.id && JSON.stringify(a.changes.clubhouse) === '[false,true]' && a.byUser === 'ross'),
    'every change of ticks is logged: who, which row, before and after (D210)')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, userId: 'dave' })
  eq((await ask('tok-dave', 'update', { clubId, memberId: rossRow.id, owner: false })).status, 403, 'Clubhouse cannot touch an owner')
  eq((await ask('tok-dave', 'remove', { clubId, memberId: rossRow.id })).status, 403, '…or take an owner off')
  const annL = [...s.list.values()].find(r => r.clubId === clubId && r.name === 'Ann Lee')!
  eq((await ask('tok-dave', 'update', { clubId, memberId: annL.id, officer: true })).status, 200, 'Clubhouse makes an Officer')
  eq((await ask('tok-dave', 'update', { clubId, memberId: annL.id, clubhouse: true })).status, 403, '…but never gives Clubhouse')
  await ask('tok-dave', 'update', { clubId, memberId: annL.id, officer: false })
  await ask('tok-ross', 'update', { clubId, memberId: daveRow.id, officer: false, clubhouse: false })
  eq(s.list.get(daveRow.id)!.role, 'member' as ClubRole, 'ticks taken away: plain again')
  const listed = await ask('tok-ross', 'members', { clubId, whole: true })
  ok(listed.status === 200 && JSON.stringify(listed.body.list).includes('3110002'), 'the Clubhouse sees the numbers in full, asked for by name')
  const dl = await ask('tok-dave', 'members', { clubId, whole: true })
  eq(dl.status, 403, '…and nobody without Clubhouse sees the list at all')

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
  ok(users.length > 0 && users.every(f => /^app[\\/]club(house)?[\\/]/.test(f)), 'the club colour is used only on a club’s own pages (app/club/, and the Clubhouse’s identity, app/clubhouse/)')
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

  section('Many clubs per account needed no migration (D223)')
  ok(read('supabase/migrations/20260101000086_clubs.sql').includes('uq_club_members_user   ON club_members(club_id, user_id)'),
    'the tables hold one row per account per club — any number of clubs')
  ok(!/oneClubIssue|One club per account/.test(read('lib/clubs.ts') + read('app/api/club/club.ts')), 'the one-club refusal is gone')

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
  const made = await setUpClub(s, 'tok-ross', { name: 'Portmarnock', yourName: 'Ross' })
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
  ok(home.status === 200 && home.body.events?.length === 2 && home.body.club?.credentials.playsHere === true && !home.body.club.credentials.officer, 'a member on the list sees every club event')
  eq(home.status === 200 ? home.body.entries : null, ['MEDAL1'], '…and their own entries among them')
  ok(home.status === 200 && home.body.me?.name === 'Dave', '…greeted by the name on the club’s list')
  ok(home.status === 200 && home.body.outside?.[0]?.code === 'TRIP01', '…with their events outside the club')
  eq((await ask('tok-ann', 'home', { slug: 'portmarnock' })).status, 403, 'anybody else is not on the list — their page stays the public face')
  eq((await ask('tok-ross', 'home', { slug: 'nowhere' })).status, 404, 'an unknown club: not found')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, removedAt: NOW.toISOString(), userId: null })
  eq((await ask('tok-dave', 'home', { slug: 'portmarnock' })).status, 403, 'taken off the list, the members home closes on the next ask')

  section('The members home in two waves (D195)')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, removedAt: null, userId: 'dave' })
  const before = await ask('tok-dave', 'home', { slug: 'portmarnock' })
  const calls: string[] = []
  const fast: ClubStore = Object.assign(Object.create(Object.getPrototypeOf(s)), s, {
    readerFromToken: async (t: string) => { calls.push('reader'); return s.userFromToken(t) },
    userFromToken: async (t: string) => { calls.push('auth'); return s.userFromToken(t) },
    rows: async (id: string) => { calls.push('rows'); return s.rows(id) },
    club: async (id: string) => { calls.push('club'); return s.club(id) },
    clubEvents: async (id: string) => { calls.push('events'); return s.clubEvents(id) },
    clubHome: async (slug: string, userId: string) => {
      calls.push('first')
      const club = await s.clubBySlug(slug)
      const row = club ? (await s.rows(club.id)).find(r => r.userId === userId && !r.removedAt) ?? null : null
      const events = club ? (await s.clubEvents(club.id)).map(e => (e.code === 'MEDAL1' ? { ...e, competition: { phase: 'announced' as const, membersOnly: true } } : e)) : []
      return { club, row, events, comps: [{ tripId: 't-medal', code: 'MEDAL1' }] }
    },
    compPhases: async () => { calls.push('phases'); return new Map([['MEDAL1', 'booking' as const]]) },
  })
  const two = await runClub({ token: 'tok-dave', action: 'home', address: 'a', slug: 'portmarnock' }, fast, NOW)
  ok(calls[0] === 'reader' && !calls.includes('auth'), 'the home’s token checked by the local reader, never a round trip to Auth')
  ok(calls.includes('first') && !calls.includes('rows') && !calls.includes('club') && !calls.includes('events'),
    'the club, this account’s row and the events in one first wave — never the whole list, never the club read twice')
  ok(two.status === 200 && before.status === 200 && two.body.entries?.join() === before.body.entries?.join() && two.body.me?.name === before.body.me?.name
    && two.body.events?.length === before.body.events?.length, '…answering what the reads one by one answered')
  eq(two.status === 200 ? two.body.events?.find(e => e.code === 'MEDAL1')?.competition?.phase : null, 'booking', 'a competition’s phase arrives in the second wave')
  const fellBack = await runClub({ token: 'tok-dave', action: 'home', address: 'a', slug: 'portmarnock' },
    Object.assign(Object.create(Object.getPrototypeOf(s)), s, { clubHome: async () => null }), NOW)
  ok(fellBack.status === 200 && fellBack.body.events?.length === 2, 'a first wave that could not be read whole falls back to the reads one by one')
  calls.length = 0
  await runClub({ token: 'tok-dave', action: 'colour', address: 'a', clubId, colour: '#1F7A3D' }, fast, NOW)
  ok(calls[0] === 'auth' && !calls.includes('reader'), 'anything that changes a club still asks Auth')
  ok(/readerFromToken: token => userFromClaims\(db, token\)/.test(read('app/api/club/store.ts')) && /getClaims\(token\)/.test(read('app/api/account/store.ts')),
    'the local reader is supabase-js’s own signature check')
  s.list.set(daveRow.id, { ...s.list.get(daveRow.id)!, removedAt: NOW.toISOString(), userId: null })

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
  ok(/Whose event is this\?/.test(gate) && /status === 'verified' && clubMay\('run_events', \{ row: k\.credentials \}\)/.test(gate),
    'the gate asks "Whose event is this?" of a verified club’s Officers only — one answer each club they run (D218)')
  ok(/EventClubContext\.Provider value=\{whose\.club\}/.test(gate), '  …and hands the answer to the wizard behind it')
  for (const f of ['CreateTripForm', 'CreateLeagueForm', 'CreateKnockoutForm', 'CreateRunForm'].map(n => `app/dashboard/create/${n}.tsx`)) {
    const form = read(f)
    ok(/const club = useEventClub\(\)/.test(form) && /clubId: club\?\.id \?\? null/.test(form) && /clubPinIssue\(club,/.test(form)
      && /<ClubPinNote club=\{club\} \/>/.test(form), `${f}: a club’s event sends its club, and its PIN is lent and optional`)
  }
  ok(/clubId: pins\.clubId/.test(read('lib/entryClient.ts')), 'the club goes beside the row, never a column (Q3)')
  const view = read('app/club/[slug]/ClubView.tsx')
  ok(/<CodeBox \/>/.test(view) && /href="\/create"/.test(view), 'the club area’s Home has the code box and Make an event')
  ok(/href=\{`\/clubhouse\/\$\{face\.slug\}`\}/.test(view) && /clubMay\('open_clubhouse'/.test(view) && /href="\/home\?tab=events"/.test(view),
    'its Club tab holds the way into the Clubhouse (Clubhouse holders) and Your events')
  ok(/redirect\(`\/club\/\$\{slug\}`\)/.test(read('app/club/[slug]/list/page.tsx')) && !/redirect\(`\/clubhouse/.test(read('app/club/[slug]/list/page.tsx')),
    'the old list address no longer sends anybody into the Clubhouse (Ross, 17 Nov 2026) — the club\'s own page, whose Club tab offers it to those who hold it')
  ok(/window\.location\.replace\(state\.list \? `\/clubhouse\/\$\{state\.club\.slug\}\/members`/.test(read('app/account/club/ClubScreen.tsx')),
    '  …as does /account/club for a verified club')
  ok(!/owner_id', userId/.test(read('app/api/club/store.ts').split('async outsideEvents')[1].split('async topScores')[0]), 'Other events are the ones a member plays in, not ones they made (D278)')

  section('Stage (k0): one rule for what a club’s people may do (lib/clubMay.ts)')
  const serverFiles = [...walk('app/api'), ...walk('app/club'), ...walk('app/account'), ...walk('app/dashboard'), ...walk('app/clubhouse'), ...walk('app/home')]
  const inline = serverFiles.filter(f => /mayAdminister|mayChangeRoles|role === 'admin'|\.in\('role', \['owner', 'admin'\]\)|role IN \('owner', 'admin'\)/.test(code(f)))
  eq(inline, [], 'nothing checks a role inline: clubMay answers, and the stores’ pre-092 fallback reads LEGACY_RUNNING_ROLES')
  for (const f of ['app/api/club/competition.ts', 'app/api/club/booking.ts', 'app/api/card/sign.ts', 'app/api/card/certify.ts']) {
    ok(/clubMay\('run_events'/.test(read(f)), `${f}: Officers run competitions`)
  }
  const es = read('app/api/entry/store.ts')
  ok((es.match(/q\.eq\('officer', true\) : q\.in\('role', LEGACY_RUNNING_ROLES\)/g) ?? []).length === 2, 'a club event’s organisers, and the clubs an account runs, are its Officers (092; the old roles before it)')
  ok(/\.map\(asRow\)\.filter\(r => r\.playsHere !== false\)/.test(read('app/api/club/bookingStore.ts')), 'the partner search offers only those who play here — by their membership (D275)')
  const rowsTs = read('app/api/club/rows.ts')
  ok(/e\.code === '42703' \|\| e\.code === 'PGRST204'/.test(rowsTs) && /ticksMissingAt = Date\.now\(\)/.test(rowsTs), 'before 092 the ticks are read off the role, and asked for again a minute later')
  ok(/seasonHere = season\.rows\.filter\(r => !r\.club_id \|\| r\.club_id === clubId\)/.test(read('app/api/club/club.ts')), 'season stats are per club: this club’s rounds and the account’s own (D223)')

  section('MO3: Comps length and speed (D282)')
  {
    const view = read('app/club/[slug]/ClubView.tsx')
    ok(/g\.upcoming\.filter\(e => soon\(e\.startDate\)\)/.test(view) && /href=\{`\/club\/\$\{slug\}\/comps`\}/.test(view) && /results: past\.slice\(0, resultsShown\)/.test(view),
      'Comps’ Upcoming is the next two weeks with See all; Results ten at a time')
    ok(/input\.whole !== true/.test(read('app/api/club/club.ts')) && /whole: true/.test(view), 'the home carries the next two weeks; the whole season only when asked')
    const frame = read('app/club/[slug]/comp/[code]/(frame)/layout.tsx'), shell = read('app/club/[slug]/comp/[code]/CompShell.tsx')
    ok(/<ClubHeader face=\{clubFace\} members \/>/.test(frame) && !/<main/.test(shell) && !/TripHeader/.test(read('app/club/[slug]/comp/[code]/(frame)/loading.tsx')),
      'a competition’s frame is its layout’s, kept between pages; the loading screen only the page’s own part (M3)')
    const tt = read('app/api/club/teeTimes.ts')
    ok(/const early = reading \? dayReads\(/.test(tt) && /readerFromToken/.test(tt), 'a day’s tee sheet starts its reads beside the sign-in check, checked locally')
    ok(/trips!inner\(id, trip_code, name, start_date, competition, rounds\(/.test(read('app/api/club/teeTimesStore.ts')), '…the day’s competitions in one read')
    ok(/live_player_locks\(live_round_id, player_id\)/.test(read('app/api/club/bookingStore.ts')) && /trip_private\(club_id, clubs\(verified_at\)\)/.test(read('app/api/club/bookingStore.ts')),
      'a competition and its sheet in fewer reads one after another')
    ok(/prefetchTeeDay\(clubIdNow\)/.test(view), 'today’s casual sheet asked for ahead of the tab')
  }

  section('MO2: what counts as Live now (D281)')
  {
    // 21 Nov 2026 is winter: Irish time is UTC.
    const at = (t: string) => new Date(`2026-11-21T${t}:00Z`)
    const comp = (phase: import('../lib/compPhase').CompPhase) => ({ startDate: '2026-11-21', endDate: '2026-11-21', competition: { phase, membersOnly: true } })
    ok(!clubEventLive(comp('booking'), at('07:30')) && clubEventLive(comp('in_play'), at('10:00')) && !clubEventLive(comp('awaiting'), at('15:00')),
      'a one-day competition is live only while in play — not before its first tee, not once every card is in')
    const twoDay = { startDate: '2026-11-20', endDate: '2026-11-21' }
    ok(clubEventLive({ ...twoDay, endDate: '2026-11-22' }, at('21:00')), 'a two-day event the evening between its days, day 1 done: still live')
    const opens = { startDate: '2026-11-21', endDate: '2026-11-22', liveFrom: at('09:00').getTime() }
    ok(!clubEventLive(opens, at('08:00')) && clubEventLive(opens, at('09:00')), '…live from its first tee time on day 1')
    ok(!clubEventLive({ startDate: '2026-11-01', endDate: '2026-11-20' }, at('12:00')), '…and gone once its last day is over')
    ok(seasonLongOf({ kind: 'tournament', startDate: '2026-11-01', endDate: '2026-11-07', setup: { format: 'league', schedule: 'series' } }), 'a league over weeks is season-long by its shape, however short')
    ok(seasonLongOf({ kind: 'tournament', startDate: '2026-11-01', endDate: '2026-12-01', setup: { format: 'match_play', schedule: 'continuous' } }) && seasonLongOf({ kind: 'run', startDate: null, endDate: null }),
      '…a knockout over weeks and a run challenge too')
    ok(seasonLongOf({ kind: 'trip', startDate: '2026-11-01', endDate: '2026-11-20', setup: null }) && !seasonLongOf({ kind: 'tournament', startDate: '2026-11-20', endDate: '2026-11-23', setup: { format: 'league', schedule: 'standalone' } }),
      '…anything over 14 days is; a four-day open is not')
    ok(!clubEventLive({ ...twoDay, seasonLong: true }, at('12:00')) && !clubEventLive({ ...comp('in_play'), competition: { phase: 'in_play', membersOnly: true, matchPlay: true } }, at('12:00')),
      'a season-long event and a match play are never live')
    ok(/clubEventLive\(e, now\)/.test(read('app/club/[slug]/ClubView.tsx')), 'Home’s Live now reads the rule')
  }

  section('Stage (k0): many clubs, the header moves between them (D218, D223)')
  eq(clubSwitch([{ slug: 'pints', name: 'Pints', toSign: 0 }], 'pints'), null, 'one club: nothing changes')
  const three = [{ slug: 'a', name: 'A', toSign: 0 }, { slug: 'b', name: 'B', toSign: 2 }, { slug: 'c', name: 'C', toSign: 0 }]
  const sw = clubSwitch(three, 'c')
  ok(sw?.clubs.length === 3 && sw.clubs[2].here && sw.clubs[1].dot && sw.dot, 'the picker lists every club, this one ticked, a dot where a card waits (D280)')
  eq(clubSwitch(three, 'b')?.dot, false, '…no dot for this club’s own cards — they lead its Home')
  const view0 = read('app/club/[slug]/ClubView.tsx')
  ok(/aria-haspopup="listbox"/.test(view0) && !/switcher\.next/.test(view0), 'the club name opens a list to choose from, never a tap that cycles (D280)')
  ok(/w-2 h-2 rounded-full bg-accent ring-2 ring-accent-tint/.test(view0), 'the dot: 8px emerald on an emerald-tint ring, on the crest')
  ok(/if \(!doc\.startViewTransition \|\| reducedMotion\(\)\) \{ go\(\); return \}/.test(view0), 'Reduce Motion, or no view transitions: an immediate swap')
  const cssK = read('app/globals.css')
  ok(/\.club-header:has\(\.club-switch:active\) \{ transform: scale\(0\.97\); \}/.test(cssK) && /view-transition-new\(root\) \{ animation-duration: 200ms; animation-timing-function: ease-out; \}/.test(cssK),
    'the header presses to 97%, the page cross-fades in 200ms ease-out')
  ok(/rememberTier\(\{ kind: 'club', slug, others: all\.filter/.test(view0), 'the hint moves first, so the next club opens as a member’s (D197)')

  section('Stage (k0): the Clubhouse, its own tree (D212)')
  ok(fs.existsSync('app/clubhouse/page.tsx') && fs.existsSync('app/clubhouse/[slug]/page.tsx'), 'greendot.live/clubhouse and /clubhouse/<club> (Ross, 16 Nov 2026: one address for every sport)')
  const lean = [...walk('app/club'), ...walk('app/home'), 'app/account/club/ClubScreen.tsx'].filter(f => /from ['"](@\/app\/clubhouse|\.\.?\/[^'"]*clubhouse)/.test(read(f)))
  eq(lean, [], 'nothing in the members app imports the Clubhouse — members’ pages get no heavier')
  const door = read('app/clubhouse/Door.tsx'), room = read('app/clubhouse/[slug]/ClubhouseShell.tsx'), none = read('app/clubhouse/NoAccess.tsx')
  ok(/accountLink\('\/clubhouse'\)/.test(door) && /accountLink\(window\.location\.pathname/.test(room), 'signed out: the site’s own sign-in, and back — no second password')
  ok(/You haven’t been given access to the Clubhouse\./.test(none) && /Your club’s office can grant it\./.test(none) && /variant="secondary"/.test(none),
    'without it: one card, the way back secondary — no emerald')
  ok(/clubMay\('open_clubhouse'/.test(read('app/clubhouse/clubhouseClient.ts')) && /askClub\('clubhouse', \{ slug: face\.slug \}\)/.test(room),
    'with it: the shell, asked once at the door')
  ok(!/isTripRoot|app\/golf/.test(door + room), 'not under /golf: the trip tree is untouched')

  section('Stage (k1): the Clubhouse’s screens (D202, D207, D212, D222)')
  for (const s of ['page.tsx', 'members/page.tsx', 'events/page.tsx', 'calendar/page.tsx', 'settings/page.tsx']) {
    ok(fs.existsSync(`app/clubhouse/[slug]/${s}`), `  /clubhouse/<club>/${s.replace(/\/?page\.tsx$/, '') || '(Overview)'}`)
  }
  ok(/<ShellContext\.Provider/.test(room) && /lg:w-60/.test(room) && /max-w-\[1200px\]/.test(room), 'one shell for every section: a 240 sidebar, content up to 1200')
  ok(!/club-art|<Art /.test(room + read('app/clubhouse/[slug]/members/MembersGrid.tsx')), 'no art behind a table (D217)')
  const gridSrc = read('app/clubhouse/[slug]/members/MembersGrid.tsx')
  ok(/askClub\('page'/.test(gridSrc) && /askClub\('bulk'/.test(gridSrc) && /askClub\('export'/.test(gridSrc), 'the grid reads a page at a time and changes the ticked rows together')
  ok(/e\.key === '\/'/.test(gridSrc) && /e\.key\.toLowerCase\(\) === 'z'/.test(gridSrc) && /e\.key === 'Tab'/.test(gridSrc), 'keys: / to search, Ctrl+Z to undo, Enter, Escape and Tab in a cell')
  ok(/md:hidden/.test(gridSrc) && /md:hidden flex items-center gap-3/.test(gridSrc), 'a phone gets one column, its rows ticked to change together (D202 amended, D264)')
  {
    // D264 (Ross, 20 Nov 2026): the Clubhouse works on a phone — nothing in it tells a phone to go to a computer.
    const officeFiles = walk('app/clubhouse').filter(f => f.endsWith('.tsx'))
    const sendsAway = officeFiles.filter(f => /on a computer/i.test(read(f)))
    ok(sendsAway.length === 0, `no Clubhouse screen sends a phone to a computer (D264)${sendsAway.length ? `: ${sendsAway.join(', ')}` : ''}`)
    const sheets = ['app/clubhouse/[slug]/tee-sheet/TeeSheet.tsx', 'app/clubhouse/[slug]/events/[code]/CompOffice.tsx']
    ok(sheets.every(f => /<SheetRow /.test(read(f)) && !/<table/.test(read(f))), 'both Clubhouse tee sheets lay each time out through SheetRow, two by two on a phone (D264)')
    ok(/@media \(hover: hover\) \{ \.ch-hover:hover/.test(read('app/globals.css')), 'the Clubhouse hover tint follows a pointer that hovers, never a tapped finger (D264)')
  }
  ok(/xlsx\?\|numbers\|ods/.test(read('app/clubhouse/[slug]/members/PasteSheet.tsx')), 'a spreadsheet’s own file is asked for as CSV — no library')
  ok(/ClubLook club=\{club\}/.test(read('app/clubhouse/[slug]/settings/ClubSettings.tsx')) && /ClubHomeCourse/.test(read('app/clubhouse/[slug]/settings/ClubSettings.tsx')), 'Club settings: the look and the home course, moved as they are')
  ok(/Green Dot staff/.test(room) && /\?find=1/.test(room), 'staff see that they are staff, and find another club')

  section('Stage (k2): Competitions and Calendar (D214, D215)')
  eq(weeklyFrom('2026-11-21', 3), ['2026-11-21', '2026-11-28', '2026-12-05'], 'Repeat weekly: every seventh day')
  eq(weeklyFrom('2026-11-21', 40).length, MAX_COPIES, `…at most ${MAX_COPIES} at once`)
  const nov = monthGrid(2026, 11)
  eq([nov[0][6], nov[0][5], nov.at(-1)![0]], ['2026-11-01', null, '2026-11-30'], 'a month from Monday: 1 Nov 2026 a Sunday, the 30th a Monday')
  const evs: SeasonEvent[] = [{ code: 'A', name: 'Week', kind: 'tournament', startDate: '2026-11-03', endDate: '2026-11-05', competition: null }]
  eq([eventsOn(evs, '2026-11-04').length, eventsOn(evs, '2026-11-06').length], [1, 0], 'an event shows on every day it runs')
  eq(stepMonth(2026, 12, 1), [2027, 1], 'December into January')
  const stored = { name: 'Monthly Medal', date: '2026-11-21', courseId: 'c1', board: { scoring: 'strokes', handicapAllowance: 95 }, membersOnly: true,
    teeSheet: compTeeRules({ batches: [{ start: '08:00', interval: 10, perTime: 4, times: 12 }], opens: { daysBefore: 7, time: '20:00' } }) }
  const back = compFormFrom(stored)
  eq(back && { ...back }, { name: 'Monthly Medal', date: '2026-11-21', courseId: 'c1', scoring: 'strokes', allowance: 95, watch: 'members', batches: [{ start: '08:00', interval: 10, perTime: 4, times: 12 }], opens: { daysBefore: 7, time: '20:00' }, entry: null },
    'a competition reads back into the form it was made from — what a copy is made of')
  eq(compFormFrom({ ...stored, entry: { genders: ['F'], minAge: 50 } })?.entry, { genders: ['F'], minAge: 50 }, '…its entry rules with it (stage (m))')
  eq(compFormFrom({ ...stored, teeSheet: { batches: [{ start: '08:00', interval: 10, count: 4 }, { start: '13:00', interval: 15, count: 4, groupSize: 3 }], groupSize: 4 } })?.batches,
    [{ start: '08:00', interval: 10, perTime: 4, times: 4 }, { start: '13:00', interval: 15, perTime: 3, times: 4 }],
    '…any sheet copies now, each run with its own players a time (Ross, 17 Nov 2026)')
  eq(compFormFrom({ ...stored, teeSheet: { batches: [] } }), null, '…and a sheet that does not read is never guessed at')
  eq(formatLine({ scoring: 'stableford', allowance: 95 }), 'Stableford · 95%', 'the format as the table says it')
  const compsSrc = read('app/clubhouse/[slug]/events/Events.tsx')
  ok(/may\('keep_calendar'\)/.test(compsSrc) && /<CopyPanel /.test(compsSrc) && /copyCompetition\(/.test(read('app/clubhouse/[slug]/events/CopyPanel.tsx')), 'Copy is the Clubhouse’s (Ross, 17 Nov 2026: Clubhouse is its own level)')
  ok(/makeOne\(store, input\.token, mine\.club\.id, form, now, who\.club\)/.test(read('app/api/club/competition.ts')), 'a copy is made exactly as New competition makes one')



  section('Migration 092')
  const m92 = read('supabase/migrations/20260101000092_club_credentials.sql')
  const b92 = m92.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  ok(/plays_here boolean NOT NULL DEFAULT true/.test(b92) && /officer\s+boolean NOT NULL DEFAULT false/.test(b92) && /clubhouse\s+boolean NOT NULL DEFAULT false/.test(b92),
    'three ticks: everyone plays here, nobody else ticked by default')
  ok(/UPDATE club_members SET officer = true, clubhouse = true WHERE role IN \('owner', 'admin'\)/.test(b92), 'today’s owners and admins: Officer and Clubhouse')
  ok(/IF NEW\.role = 'owner' THEN\s+NEW\.officer := true;\s+NEW\.clubhouse := true;/.test(b92) && !/NEW\.plays_here/.test(b92), 'an owner always holds Officer and Clubhouse — never forced to play')
  const fn92 = b92.slice(b92.indexOf('CREATE OR REPLACE FUNCTION public.account_trips()'))
  ok(/AND cm\.officer/.test(fn92) && !/role IN/.test(fn92.slice(0, fn92.indexOf('$$;'))), 'a club’s Officers organise its events')
  ok(/ALTER TABLE club_activity ENABLE ROW LEVEL SECURITY/.test(b92) && /REVOKE ALL ON public\.club_activity FROM anon, authenticated/.test(b92), 'the activity log: server only')
  ok(/-- ─── Undo/.test(m92) && /-- ─── Did it land\?/.test(m92) && /PASTE THIS AFTER THE DEPLOY/.test(m92), 'with its undo, its check, and when to paste it')

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
  const made = await setUpClub(st, 'tok-ross', { name: 'Index GC', yourName: 'Ross' })
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
  eq(compPhase(f(), at - 72 * H), 'announced', 'before booking opens: Scheduled')
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
  eq(notEligibleLine('This is a ladies’ competition.'), 'This is a ladies’ competition — you’re not eligible to book on this tee sheet.', 'a refused member is told the reason first (D279)')
  eq(notEligibleLine('Your club hasn’t recorded your gender — ask the club to add it.'), 'Your club hasn’t recorded your gender — ask the club to add it. So you can’t book on this tee sheet.', '…a refusal with its own dash keeps its words')
  ok(/!refused \|\| !!me\.admin/.test(read('app/club/[slug]/comp/[code]/CompTeeSheet.tsx')) && /bookNote/.test(read('app/club/[slug]/ClubTeeTimes.tsx')), 'no Book for a refused member, Officers keep it; the casual sheet says why (D279)')
  eq(sectionWaitLine('board', at), 'This competition hasn’t started yet.', 'the leaderboard before play says only that it has not started (D278)')

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
    batches: [{ start: '08:00', interval: 10, perTime: 4, times: 20 }], opens: { daysBefore: 7, time: '20:00' },
  }
  eq(compFormIssue(form, '2026-11-16'), null, 'a whole form passes')
  ok(!!compFormIssue({ ...form, name: '' }, '2026-11-16') && !!compFormIssue({ ...form, date: '2026-11-01' }, '2026-11-16')
    && !!compFormIssue({ ...form, batches: [{ ...form.batches[0], perTime: 5 }] }, '2026-11-16') && !!compFormIssue({ ...form, allowance: 40 }, '2026-11-16'),
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
  eq(readCompForm({ first: '08:00', interval: 10, perTime: 4, times: 20 })?.batches, [{ start: '08:00', interval: 10, perTime: 4, times: 20 }],
    'a form from before runs (first, interval, perTime, times) reads as one run')
  const twoRuns: CompForm = { ...form, batches: [{ start: '08:00', interval: 10, perTime: 3, times: 30 }, { start: '13:00', interval: 15, perTime: 4, times: 8 }] }
  eq(compFormIssue(twoRuns, '2026-11-16'), null, 'threes at ten until one, then fours at fifteen: a whole form')
  eq(compTeeRules(twoRuns).batches[1], { start: '13:00', interval: 15, count: 8, ends: 'count', groupSize: 4 }, '…the second run says its own players a time')
  ok(!!compFormIssue({ ...form, batches: [{ start: '08:00', interval: 10, perTime: 4, times: 30 }, { start: '12:00', interval: 10, perTime: 4, times: 4 }] }, '2026-11-16'),
    'a run that starts before the one before has finished is refused')
  const tr = compTeeRules(twoRuns)
  eq(bookingIssue({ rules: tr, date: '2026-11-22', slot: 30, taken: 3, adding: 1, admin: true, now: 0 }), null, 'a fourball time takes a fourth')
  eq(bookingIssue({ rules: tr, date: '2026-11-22', slot: 29, taken: 3, adding: 1, admin: true, now: 0 }), 'That tee time is full.', '…a three-ball time does not')

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
    async club(id) { return id === 'c1' ? verified : null },
    async rowOf() { return { id: 'row', clubId: 'c1', name: 'Ross', memberNumber: null, guiNumber: null, email: null, role, userId: 'ross', removedAt: null, onBoards: true } },
    async isStaff() { return false },
    create: createStand,
    async insertItem(row) { created.push({ item: row }); return 'item-1' },
    async insertRound(row) { created.push({ round: row }) },
    async deleteTrip() {},
    newCode: () => 'COMP01',
    newId: () => 'round-1',
  })
  eq((await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form, from: 'clubhouse' }, compStore('member'), NOW)).status, 403, 'a plain member cannot make one')
  eq((await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form }, compStore('admin'), NOW)).status, 403, 'the members app makes none (D278)')
  const ok1 = await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form, from: 'clubhouse' }, compStore('admin'), NOW)
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
  await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: { ...form, watch: 'guests' }, from: 'clubhouse' }, compStore('admin'), NOW)
  ok(!madeRows[0]?.public_passcode_hash, 'guests can watch: no door (D184)')
  const ladies = { ...form, entry: { genders: ['F'], minAge: 50 } }
  const noColumn = await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: ladies, from: 'clubhouse' }, compStore('admin'), NOW)
  ok(noColumn.status === 503 && !noColumn.body.ok && /Who may enter isn’t set up yet/.test(noColumn.body.error), 'entry rules with nowhere to keep them make no competition (before 094)')
  const keptRules: unknown[] = []
  const withRules = await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: ladies, from: 'clubhouse' }, { ...compStore('admin'), async setEntryRules(_t, r) { keptRules.push(r) } }, NOW)
  ok(withRules.status === 200 && JSON.stringify(keptRules[0]) === JSON.stringify({ genders: ['F'], minAge: 50 }), '…and with somewhere, the ladies’ over-50s are kept')
  const badCat = await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: { ...form, entry: { categories: ['gone'] } }, from: 'clubhouse' }, { ...compStore('admin'), async categories() { return [] }, async setEntryRules() {} }, NOW)
  eq(badCat.status, 400, 'a membership not the club’s is refused')

  section('Booking from the club\'s list (/api/club/booking)')
  const listRow = (id: string, name: string, userId: string | null, role: 'owner' | 'admin' | 'member' = 'member') =>
    ({ id, clubId: 'c1', name, memberNumber: null, guiNumber: null, email: null, role, userId, removedAt: null, onBoards: true })
  const rows: MemberRecord[] = [listRow('r-ross', 'Ross', 'ross'), listRow('r-dave', 'Dave', 'dave'), listRow('r-ann', 'Ann', null), listRow('r-adm', 'Admin', 'adm', 'admin'),
    { ...listRow('r-off', 'Office', 'off'), playsHere: false, clubhouse: true, officer: false },
    { ...listRow('r-ofc', 'Officer', 'ofc'), playsHere: true, clubhouse: false, officer: true }]
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
  const office = await book('tok-ross', { slot: 1, memberIds: ['r-off'] })
  ok(office.status === 409 && !office.body.ok && /membership doesn’t play at the club/.test(office.body.error), 'somebody who does not play here is in no field (D209)')
  eq((await book('tok-dave', { slot: 1, memberIds: ['r-dave'] })).status, 409, 'Dave has a time already: refused')
  eq((await book('tok-ross', { slot: 0, memberIds: ['r-adm'] }, new Date(t8 + 60_000))).status, 409, 'after the time has gone: refused')
  const names = await runBooking({ token: 'tok-ross', action: 'names', code: 'COMP01', q: 'an' }, bstore, open)
  ok(names.status === 200 && names.body.names?.find(n => n.id === 'r-ann')?.linked === false, 'the partner search says who has no account')
  eq((await runBooking({ token: 'tok-adm', action: 'withdraw', code: 'COMP01', memberId: 'r-dave' }, bstore, open)).status, 200, 'an admin takes anybody off')
  ok(!bs.some(b => b.playerId === 'p-r-dave') && !ps.some(p => p.id === 'p-r-dave'), '…the booking and its unplayed player gone')
  eq((await runBooking({ token: 'tok-dave', action: 'withdraw', code: 'COMP01', memberId: 'r-ross' }, bstore, open)).status, 403, 'Dave may not take Ross off — not his booking')
  const offState = await runBooking({ token: 'tok-off', action: 'state', code: 'COMP01' }, bstore, open)
  const ofcState = await runBooking({ token: 'tok-ofc', action: 'state', code: 'COMP01' }, bstore, open)
  ok(offState.status === 200 && offState.body.ok && offState.body.admin === false && ofcState.status === 200 && ofcState.body.ok && ofcState.body.admin === true,
    'an Officer runs the competition on the phone; Clubhouse alone does not (D219)')
  const idx = await runBooking({ token: 'tok-ross', action: 'index', code: 'COMP01', playerId: 'p-r-ross', index: '13.9' }, bstore, open)
  ok(idx.status === 200 && indexSets[0] === 'r-ross:13.9:ross', 'the start sheet changes the one index, by the member starting the card (D179)')

  section('The Clubhouse keeps a competition\'s tee sheet — never through the members app (Ross, 17 Nov 2026)')
  {
    const logged: ActivityEntry[] = []
    let certifiedAt: string | null = null
    const ostore: BookingStore = {
      ...bstore,
      async isStaff(u) { return u === 'staff' },
      async officeSheet() {
        return {
          seats: bs.map(b => ({ playerId: b.playerId, rowId: ps.find(p => p.id === b.playerId)?.clubMemberId ?? null, name: rows.find(r => `p-${r.id}` === b.playerId)?.name ?? '?', handicap: null, slot: b.slot, bookedBy: b.bookedBy })),
          started: [], certifiedAt, courseName: 'Lahinch', place: null,
        }
      },
      async moveBookings(_r, ids, slot) { bs = bs.map(b => (ids.includes(b.playerId) ? { ...b, slot } : b)) },
      async logActivity(e) { logged.push(...e) },
    }
    const office = (tok: string, action: string, body: Record<string, unknown> = {}) => runBooking({ token: tok, action: `office.${action}`, code: 'COMP01', ...body }, ostore, open)
    eq((await office('tok-ofc', 'sheet')).status, 403, 'an Officer without Clubhouse has no office view (Clubhouse is its own level)')
    eq((await office('tok-dave', 'sheet')).status, 403, '…nor a member')
    const view = await office('tok-off', 'sheet')
    const vb = view.body as unknown as { slots?: { seats: { name: string }[] }[]; comp?: { courseName: string } }
    ok(view.status === 200 && vb.slots?.[0]?.seats.some(x => x.name === 'Ross') === true && vb.comp?.courseName === 'Lahinch', 'Clubhouse reads every time and who is on it')
    eq(view.status === 200 ? view.door : 'x', null, '…handing out no members-app door')
    eq((await office('tok-off', 'book', { slot: 1, memberIds: ['r-dave', 'r-adm'] })).status, 200, 'Clubhouse books two onto a time')
    ok(bs.filter(b => b.slot === 1).length === 2 && bs.filter(b => b.slot === 1).every(b => b.bookedBy === null), '…booked by the office, nobody\'s player')
    eq((await office('tok-off', 'move', { memberIds: ['r-dave'], slot: 2 })).status, 200, 'Clubhouse moves Dave to another time')
    eq(bs.find(b => b.playerId === 'p-r-dave')?.slot, 2, '…and there he is')
    eq((await office('tok-off', 'move', { memberIds: ['r-dave'], slot: 99 })).status, 409, '…never to a time not on the sheet')
    eq((await office('tok-off', 'withdraw', { memberIds: ['r-adm'] })).status, 200, 'Clubhouse takes somebody off')
    ok(!bs.some(b => b.playerId === 'p-r-adm'), '…gone')
    ok(['comp.book', 'comp.move', 'comp.withdraw'].every(a => logged.some(x => x.action === a && x.byName === 'Office')), 'every office change on the club\'s activity log')
    eq((await runBooking({ token: 'tok-staff', action: 'office.sheet', code: 'COMP01' }, ostore, open)).status, 200, 'Green Dot staff keep it too')
    certifiedAt = NOW.toISOString()
    eq((await office('tok-off', 'move', { memberIds: ['r-dave'], slot: 3 })).status, 409, 'nothing changes once the results are certified')
    bs = bs.filter(b => b.playerId !== 'p-r-dave'); ps = ps.filter(p => p.id !== 'p-r-dave')
  }

  section('Who may enter, at booking (stage (m))')
  const keptPs = ps, keptBs = bs
  ps = []; bs = []
  const sat = '2026-11-21'
  const cats6: Category[] = [{ id: 'six', name: '6 Day', code: '6DAY', days: [0, 1, 2, 3, 4, 6] }, { id: 'jun', name: 'Junior', code: 'JUN', days: [0, 1, 2, 3, 4, 5, 6] }]
  rows.push({ ...listRow('r-liz', 'Liz', 'liz'), gender: 'F', birthDate: '1970-03-01', categoryId: 'six' })
  rows.find(r => r.id === 'r-ross')!.gender = 'M'
  const overrides: ActivityEntry[] = []
  const madePlayers: { gender: string }[] = []
  const estore = (entry: EntryRules | null): BookingStore => ({
    ...bstore,
    async competition(c) { return c === 'COMP01' ? { tripId: 't1', code: 'COMP01', clubId: 'c1', roundId: 'rd', date: sat, rules, publicHash: null, entry } : null },
    async searchRows(_c, q) { return rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())).map(r => ({ id: r.id, name: r.name, linked: !!r.userId, gender: r.gender, birthDate: r.birthDate, categoryId: r.categoryId })) },
    async insertPlayer(r) { madePlayers.push({ gender: r.gender }); const id = `p-${r.club_member_id}`; ps.push({ id, clubMemberId: r.club_member_id }); return id },
    async memberships() { return { categories: cats6, ageDate: '01-01' } },
    async logActivity(e) { overrides.push(...e) },
  })
  const satOpen = new Date(Date.parse(`${sat}T07:00:00Z`))
  const ebook = (st: BookingStore, tok: string, ids: string[], extra: Record<string, unknown> = {}) => runBooking({ token: tok, action: 'book', code: 'COMP01', slot: 0, memberIds: ids, ...extra }, st, satOpen)
  const lizSat = await ebook(estore({ genders: ['F'] }), 'tok-liz', ['r-liz'])
  ok(lizSat.status === 409 && !lizSat.body.ok && /Saturday isn’t one of your playing days/.test(lizSat.body.error), 'a 6-day lady cannot book the ladies’ Saturday competition')
  const lizTicked = await ebook(estore({ genders: ['F'], categories: ['six'] }), 'tok-liz', ['r-liz'])
  ok(lizTicked.status === 200 && madePlayers.at(-1)?.gender === 'F', '…unless the competition ticks 6 Day — and her player is made a woman, for the ladies’ tees')
  ps = []; bs = []
  const rossLadies = await ebook(estore({ genders: ['F'] }), 'tok-ross', ['r-ross'])
  ok(rossLadies.status === 409 && !rossLadies.body.ok && /ladies’ competition/.test(rossLadies.body.error) && !rossLadies.body.anyway, 'a man cannot book a ladies’ competition — and is not offered Book anyway')
  const daveNone = await ebook(estore({ genders: ['M'] }), 'tok-ross', ['r-dave'])
  ok(daveNone.status === 409 && !daveNone.body.ok && /hasn’t recorded Dave’s gender/.test(daveNone.body.error), 'no gender recorded blocks a men’s competition')
  const junior = await ebook(estore({ categories: ['jun'] }), 'tok-ross', ['r-ross'])
  ok(junior.status === 409 && !junior.body.ok && /Junior members/.test(junior.body.error), 'a full man may not book a junior competition')
  const ofcTry = await ebook(estore({ categories: ['jun'] }), 'tok-ofc', ['r-ross'])
  ok(ofcTry.status === 409 && !ofcTry.body.ok && ofcTry.body.anyway === true, 'an Officer is told why, and offered Book anyway')
  const ofcAnyway = await ebook(estore({ categories: ['jun'] }), 'tok-ofc', ['r-ross'], { anyway: true })
  ok(ofcAnyway.status === 200 && overrides.some(o => o.action === 'booking.override' && o.memberId === 'r-ross'), '…and booking anyway is logged')
  eq((await ebook(estore({ categories: ['jun'] }), 'tok-ross', ['r-dave'], { anyway: true })).status, 409, 'a member cannot book anyway')
  const lizState = await runBooking({ token: 'tok-liz', action: 'state', code: 'COMP01' }, estore({ genders: ['F'] }), satOpen)
  ok(lizState.status === 200 && lizState.body.ok && lizState.body.entry === 'Ladies’' && /Saturday/.test(lizState.body.myRefusal ?? ''), 'the sheet says who may enter, and why this member may not')
  const nm = await runBooking({ token: 'tok-ross', action: 'names', code: 'COMP01', q: 'liz' }, estore({ genders: ['M'] }), satOpen)
  ok(nm.status === 200 && nm.body.ok && /men’s competition/.test(nm.body.names?.[0]?.why ?? ''), 'the partner search greys who may not enter, with why')
  eq((await ebook(estore(null), 'tok-ross', ['r-dave'])).status, 200, 'no rules: everybody, as before')
  ps = keptPs; bs = keptBs

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
  for (const f of ['(frame)/page.tsx', '(frame)/tee-times/page.tsx', '(frame)/scoring/page.tsx', '(frame)/leaderboard/page.tsx', 'section.tsx']) {
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
  {
    const bar = read('app/club/[slug]/ClubTabBar.tsx'), ctx = read('app/club/[slug]/ClubBarContext.tsx')
    ok(/if \(comp\) \{\s*e\.preventDefault\(\)/.test(bar) && /router\.push\(to\)/.test(bar) && /window\.location\.assign\(to\)/.test(bar),
      'leaving a competition by Comps or Home is asked for outright, and made whole if it never lands (D280, M6)')
    ok(/data-keep-set/.test(bar) && /hasAttribute\('data-keep-set'\)/.test(ctx), '…the bar keeps its set until the address has left the competition')
    const view = read('app/club/[slug]/ClubView.tsx'), me = read('app/club/[slug]/me/YourPage.tsx')
    ok(/href=\{members \? `\/club\/\$\{face\.slug\}\/me`/.test(view) && /HandicapIndexCard/.test(me) && /YourDetailsCard/.test(me) && /ClubEventTypesCard/.test(me) && /href="\/account"/.test(me),
      'the account icon opens Your page in the club: handicap, details, what you see, account (D280, M2)')
    ok(/clubMay\('open_clubhouse'/.test(view) && /label="Your page"/.test(view), 'the Club tab reaches Your page; the Clubhouse row only with Clubhouse (M5)')
    ok(/BackButton href=\{back\}/.test(read('app/account/AccountScreen.tsx')) && /homeHref\(\)/.test(read('app/home/HomeScreen.tsx')),
      'back from /account and Home on /home go to a club member’s club, never /home (D280, M3–M4)')
  }
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
  ok(/key: 'tee', label: 'Tee times'/.test(bar) && !/label: 'Board'/.test(bar), 'Tee times holds Board\'s old place (Ross, 17 Nov 2026)')
  ok(/Live now[\s\S]*Open the leaderboard/.test(read('app/club/[slug]/ClubView.tsx')), '…and Board\'s job, the competition in play, is on Comps')
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
  const summary = read('app/club/[slug]/comp/[code]/(frame)/page.tsx')
  ok(/if \(asked\) redirect\(compSectionHref/.test(summary), 'an old ?view= on the Summary goes on to its section')
  ok(/<CompManage slug=\{slug\} code=\{code\} \/>/.test(summary) && /compHome\(slug, code\)\}\/organiser/.test(read('app/club/[slug]/comp/[code]/CompManage.tsx')),
    'Manage competition on the Summary for owners and admins, inside the club (D284)')
  ok(/const gold = certified && r\.place === 1/.test(summary), 'gold only for the certified winner')
  const action = read('app/club/[slug]/comp/[code]/CompSummaryAction.tsx')
  ok(/Book a tee time/.test(action) && /Start your card/.test(action) && /Certify result/.test(action) && /See the results/.test(action),
    'the phase\'s one action')
  ok((action.match(/<ButtonLink /g) ?? []).length - (action.match(/variant="secondary"/g) ?? []).length === 3, '…one emerald button each, Change and See the results secondary')
  ok(/\? `\$\{tripHome\}\/scoring` : null/.test(read('app/golf/[root]/[tripCode]/scoring/[roundNumber]/page.tsx')),
    'the card\'s back arrow returns to Scoring (D190), inside the club (D284)')
}

/** D198: preload, then be snappy — inside a competition the tabs answer at the tap. */
function locationsTests() {
  console.log('\nClub locations and the day view (D277)')
  const names = new Map([['old', 'Lahinch Golf Club -- Old Course'], ['castle', 'Lahinch Golf Club -- Castle Course'], ['away', 'Doonbeg']])
  const one = clubCourses({ homeCourseId: 'old', added: [], used: ['old'], names })
  eq(one.map(c => `${c.label}:${c.courseId}`), ['Course:old'], 'a one-course club’s course is simply "Course", listed unasked')
  const two = clubCourses({ homeCourseId: 'old', added: [{ id: 'l1', courseId: 'castle', position: 0 }], used: ['away', 'old', 'nameless'], names })
  eq(two.map(c => `${c.label}:${c.courseId}:${c.locationId}`), ['Course 1:old:null', 'Course 2:castle:l1', 'Course 3:away:null'],
    'Course 1 the home course, then those added, then those competitions use — each once, an unnamed one left out')
  eq(clubCourses({ homeCourseId: null, added: [], used: [], names }), [], 'no home course and no competitions: no course yet')
  const rooms = [{ id: 'r1', name: 'Bar', position: 0 }, { id: 'r2', name: 'Function room', position: 1 }]
  eq([roomNameIssue('', rooms), roomNameIssue('bar', rooms), roomNameIssue('Bar', rooms, 'r1'), roomNameIssue('Locker room', rooms)],
    ['Give the place a name.', 'The club already has bar.', null, null], 'a room’s name: given, and the club’s once ignoring case (renaming itself is fine)')
  const P1: ClubPlaces = { courses: one, rooms, ready: true }
  const P2: ClubPlaces = { courses: two, rooms, ready: true }
  const ev = (o: Partial<ClubNote>): ClubNote => ({ id: 'n', ref: null, title: 'X', type: 'SOCIAL', startsOn: '2026-11-21', endsOn: null, startTime: null, endTime: null, place: null, notes: null, visibility: 'members', blocksSheet: false, ...o })
  eq(placeLine(placeOf(ev({ type: 'GOLF' }), P1)), 'Course', 'a golf event in a one-course club is on the course — nobody chose it')
  eq(placeLine(placeOf(ev({ type: 'GOLF', locationCourseId: 'castle' }), P2)), 'Course 2 · Castle Course', 'with two courses, the one it names')
  eq(placeLine(placeOf(ev({ type: 'COURSE' }), P2)), 'Course 1 · Old Course', '…else Course 1')
  eq(placeLine(placeOf(ev({ locationId: 'r2' }), P1)), 'Function room', 'a dinner in its room')
  eq(placeLine(placeOf(ev({ place: 'The Strand Hotel' }), P1)), 'The Strand Hotel', 'Other: its free text')
  eq(placeLine(placeOf(ev({ locationId: 'gone', place: null }), P1)), null, 'a room no longer there: nowhere in particular')
  eq([matchPlace('The Bar', P2), matchPlace('function  room', P2), matchPlace('Course 2', P2), matchPlace('Castle Course', P2), matchPlace('Doonbeg', P2), matchPlace('the course', P1), matchPlace('the course', P2), matchPlace('Hotel', P2)],
    [{ locationId: 'r1' }, { locationId: 'r2' }, { courseId: 'castle' }, { courseId: 'castle' }, { courseId: 'away' }, { courseId: 'old' }, null, null],
    'an imported Where matched by name — "the", case and spaces aside; "the course" only where there is one')
  eq(placeFields('GOLF', 'Old Course', P2), { locationId: null, locationCourseId: null, place: null, kept: false }, 'imported golf on Course 1 is stored as no course')
  eq(placeFields('GOLF', 'Castle', P2).locationCourseId, null, '…a part of a name that is not one stays text')
  eq(placeFields('SOCIAL', 'Bar', P2), { locationId: 'r1', locationCourseId: null, place: null, kept: false }, 'a social event in the bar')
  eq(placeFields('SOCIAL', 'Strand Hotel', P2), { locationId: null, locationCourseId: null, place: 'Strand Hotel', kept: true }, 'somewhere else: kept as text, and the preview says so')
  eq(placeFields('SOCIAL', 'Strand Hotel', { ...P2, rooms: [] }).kept, false, '…said only where the club has rooms it could have been')
  eq(placeFields('SOCIAL', 'Course 2', P2).locationCourseId, null, 'a social event is never put on a course')
  eq([seasonPlaceLine({ competition: { courseId: 'old', courseName: 'x' } }, P1), seasonPlaceLine({ competition: { courseId: 'castle', courseName: 'x' } }, P2), seasonPlaceLine({ competition: { courseName: 'Doonbeg' } }, { ...P1, courses: [] })],
    ['Course', 'Course 2 · Castle Course', 'Doonbeg'], 'Events’ Location: a one-course club says "Course"; two say which (D272 kept)')
  // The day view.
  eq(lanesOf([{ key: 'a', from: 540, to: 600 }, { key: 'b', from: 570, to: 660 }, { key: 'c', from: 600, to: 630 }, { key: 'd', from: 700, to: 720 }]).map(x => `${x.key}${x.lane}/${x.lanes}`),
    ['a0/2', 'b1/2', 'c0/2', 'd0/1'], 'overlaps side by side: each the first lane free, a run of overlaps sharing its count')
  const D = '2026-11-21'
  const comp = (code: string, first: string, last: string, courseId: string): SeasonEvent => ({ code, name: `Comp ${code}`, kind: 'tournament', startDate: D, endDate: D,
    competition: { phase: 'booking', courseName: null, courseId, firstTee: first, lastTee: last, scoring: 'stableford', allowance: 95, booked: 30, capacity: 72, membersOnly: true } })
  const note = (id: string, o: Partial<ClubNote>): SeasonEvent => noteAsSeason(ev({ id, title: `Event ${id}`, ...o }))
  const day = dayLayout([comp('MED', '08:00', '10:30', 'old'), note('dinner', { startTime: '19:30', locationId: 'r2' })], D, P1)
  eq(day.columns.map(c => `${c.kind}:${c.label}`), ['course:Course', 'room:Bar', 'room:Function room'], 'a column a location: the course first, then the rooms in order')
  eq(day.blocks.map(b => `${b.column}:${b.title}:${b.from}-${b.to}`), ['course:old:Comp MED:480-630', 'room:r2:Event dinner:1170-1230'],
    'a day with a competition and a dinner: two blocks in two columns — first tee to last, and an hour for a dinner with no end (M3)')
  eq([day.from, day.to, day.hours.length], [420, 1320, 16], 'the window 07:00 to 22:00')
  const busy = dayLayout([
    comp('EARLY', '06:10', '06:10', 'old'), note('a', { startTime: '12:00', endTime: '14:00', locationId: 'r1' }), note('b', { startTime: '13:00', endTime: '15:00', locationId: 'r1' }),
    note('c', { startTime: '20:00', endTime: '23:30', place: 'Strand Hotel' }), note('d', { endsOn: '2026-11-23', type: 'COURSE' }), note('e', { locationId: 'r2', visibility: 'office', type: 'BUSINESS' }),
    { ...comp('MP', '', '', 'old'), competition: { ...comp('MP', '', '', 'old').competition!, firstTee: null, lastTee: null, matchPlay: { format: 'singles', cap: null, entered: 4, keyDates: [D] } } },
  ], D, P1)
  eq(busy.blocks.filter(b => b.column === 'room:r1').map(b => `${b.lane}/${b.lanes}`), ['0/2', '1/2'], 'two in the bar at once: side by side')
  eq(busy.blocks.find(b => b.key.endsWith('EARLY'))?.to, 370 + 30, 'one tee time still shows as half an hour')
  eq([busy.from, busy.to], [360, 1440], 'the window widened to the hour for 06:10 and a night out till 23:30')
  ok(busy.columns.some(c => c.key === ELSEWHERE) && busy.blocks.some(b => b.column === ELSEWHERE && b.sub?.includes('Strand Hotel')), 'Other goes in an Elsewhere column, drawn only when needed')
  ok(!day.columns.some(c => c.key === ELSEWHERE), '…and not otherwise')
  eq(busy.allDay.map(b => `${b.column}:${b.key}`), ['course:old:ev-d', 'room:r2:ev-e'], 'over several days, or no start: all day, at the head of its column')
  ok(busy.allDay.find(b => b.key === 'ev-e')?.office === true, 'Office only says so (the Clubhouse alone sees the day view — M5)')
  ok(!busy.blocks.concat(busy.allDay).some(b => b.key.includes('MP')), 'a match play is no day’s booking')
  eq(dayLayout([], D, { courses: [], rooms: [], ready: false }).columns, [], 'no locations: no columns, and the page says where to add them')
  // Wiring.
  const m99 = read('supabase/migrations/20260101000099_club_locations.sql')
  ok(/CREATE TABLE IF NOT EXISTS club_locations/.test(m99) && /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.club_locations TO service_role/.test(m99) && /REVOKE ALL ON public\.club_locations FROM anon, authenticated/.test(m99)
    && /--\s+DROP TABLE IF EXISTS club_locations;/.test(m99), 'migration 099: server only, its undo beside it')
  ok(/missingPlaceCols/.test(read('app/api/club/notesStore.ts')) && /missing099/.test(read('app/api/club/locationsStore.ts')), 'fail-soft before 099: events read and save as they did')
  ok(/calendar'\)\}\/\$\{d\}/.test(read('app/clubhouse/[slug]/calendar/ClubCalendar.tsx')) && fs.existsSync(path.join(__dirname, '../app/clubhouse/[slug]/calendar/[day]/page.tsx')), 'a day on the Calendar opens the day view')
  ok(/bg-club-tint/.test(read('app/clubhouse/[slug]/calendar/[day]/DayView.tsx')) && /bg-accent-deep/.test(read('app/clubhouse/[slug]/calendar/[day]/DayView.tsx')), 'course columns in the club’s tint, the line at now in emerald (M4)')
  ok(/ITS PLACES/.test(calendarPrompt({ clubName: 'P', year: 2026, homeCourse: null, memberships: [], presets: [], places: ['Bar'] })), 'the import prompt lists the club’s places')
}

function overviewTests() {
  console.log('\nThe Overview as a control centre (D276)')
  eq(mondayOf('2026-11-21'), '2026-11-16', 'a Saturday’s Monday')
  eq(mondayOf('2026-11-16'), '2026-11-16', 'a Monday is its own')
  eq(mondayOf('2026-11-22'), '2026-11-16', 'Sunday ends the week')
  eq(periodRange('2026-11-21', 'today'), { from: '2026-11-21', to: '2026-11-21' }, 'Today is one day')
  eq(periodRange('2026-11-21', 'week'), { from: '2026-11-16', to: '2026-11-22' }, 'This week is Monday to Sunday')
  eq(dayWord('2026-11-21', '2026-11-21'), 'Today', 'today said so')
  eq(dayWord('2026-11-22', '2026-11-21'), 'Tomorrow', '…and tomorrow')
  eq(dayWord('2026-11-24', '2026-11-21'), 'Tue 24 Nov', 'any other day short')
  const T = '2026-11-21' // a Saturday
  eq(['today', 'tomorrow', 'sat', 'saturday', 'mon', 'sun', '21/11', '21/11/2026', '1/1', '21 nov', 'nov 21', '3rd dec', '2026-11-30', '31/2', 'medal', 'ma'].map(q => parseDay(q, T)),
    ['2026-11-21', '2026-11-22', '2026-11-21', '2026-11-21', '2026-11-23', '2026-11-22', '2026-11-21', '2026-11-21', '2027-01-01', '2026-11-21', '2026-11-21', '2026-12-03', '2026-11-30', null, null, null],
    'a date read off what was typed — a weekday the next one, a day and month without a year the next one; a name is no date')
  eq([matchTier('November Medal', 'nov'), matchTier('November Medal', 'medal'), matchTier('November Medal', 'dal'), matchTier('November Medal', 'cup')], [0, 1, 2, null], 'how a name matches: its start, a word’s start, anywhere, not at all')
  const ev = (code: string, name: string, date: string, extra: Partial<SeasonEvent> = {}): SeasonEvent =>
    ({ code, name, kind: 'tournament', startDate: date, endDate: date, competition: { phase: 'booking', courseName: null, scoring: 'stableford', allowance: 95, booked: 10, capacity: 40, membersOnly: true }, ...extra })
  const season = [
    ev('OCT', 'October Medal', '2026-10-17'), ev('NOV', 'November Medal', '2026-11-21'), ev('DEC', 'December Medal', '2026-12-19'),
    ev('SCR', 'Captain’s Medal Scramble', '2026-11-22'), ev('FB', 'Winter Fourball', '2026-11-18'),
  ]
  eq(searchEvents('medal', season, T).map(e => e.code), ['NOV', 'SCR', 'DEC', 'OCT'], '"medal": the medals, upcoming nearest first, past after — the medal today on top')
  eq(searchEvents('nov', season, T).map(e => e.code), ['NOV'], '…and Enter opens the first')
  const social: SeasonEvent = { code: 'ev-n1', name: 'Quiz night', kind: 'club', type: 'SOCIAL', startDate: '2026-11-19', endDate: '2026-11-19', competition: null,
    note: { id: 'n1', ref: null, title: 'Quiz night', type: 'SOCIAL', startsOn: '2026-11-19', endsOn: null, startTime: '20:00', endTime: null, place: 'Bar', notes: null, visibility: 'members', blocksSheet: false } }
  const mp = ev('MP', 'Club Singles', '2026-05-01', { endDate: '2026-12-31', competition: { phase: 'in_play', courseName: null, scoring: 'stableford', allowance: 100, booked: 0, capacity: 0, membersOnly: true, matchPlay: { format: 'singles', cap: 32, entered: 20, keyDates: ['2026-11-20'] } } })
  const all = [...season, social, mp]
  const day = whatsOn(all, T, T), week = whatsOn(all, '2026-11-16', '2026-11-22')
  eq([day.comps.map(o => o.event.code), day.events.map(o => o.event.code)], [['NOV'], []], 'today: the medal; a match play running for months is not on today')
  eq([week.comps.map(o => `${o.event.code}@${o.day}`), week.events.map(o => o.event.code)], [['FB@2026-11-18', 'MP@2026-11-20', 'NOV@2026-11-21', 'SCR@2026-11-22'], ['ev-n1']],
    'this week: every competition on its day — the match play on its play-by date — and the club’s quiz night')
  eq([quietLine('today', 4), quietLine('today', 0), quietLine('week', 0)], ['Nothing on today. This week: 4 events.', 'Nothing on today.', 'Nothing on this week.'], 'a quiet day says what the week holds')
  const facts: YoursFacts = {
    comps: [{ code: 'NOV', name: 'November Medal', date: T, time: '09:10', playing: true, bookedOthers: 1 }],
    casual: [{ date: '2026-11-18', time: '10:00', playing: false, bookedOthers: 2 }],
    entered: ['MP'], added: ['n1'], roles: [],
  }
  const base = '/clubhouse/pints'
  eq(yoursIn(facts, all, T, T, base).map(y => `${y.kind}:${y.title}:${y.why}`), ['playing:November Medal:You’re playing · you booked 1'], 'Yours today: the medal you are playing in')
  eq(yoursIn(facts, all, '2026-11-16', '2026-11-22', base).map(y => `${y.kind}:${y.date}:${y.href}`), [
    `booked:2026-11-18:${base}/tee-sheet?day=2026-11-18`, `added:2026-11-19:${base}/events?event=n1`, `entered:2026-11-20:${base}/events/MP`, `playing:2026-11-21:${base}/events/NOV`,
  ], 'Yours this week: a tee time you booked, the social event you added, your match play’s day and your medal — in date order')
  eq(yoursIn(facts, all, '2026-11-19', '2026-11-19', base).map(y => y.kind), ['added'], 'a social event this account added shows under Yours on its day (M4)')
  eq(yoursIn({ ...NO_YOURS, roles: [{ key: 'r1', date: T, time: '08:00', title: 'November Medal', role: 'Starter', href: `${base}/events/NOV` }] }, all, T, T, base).map(y => `${y.kind}:${y.why}`),
    ['role:Starter'], 'the shape for roles: a role shows as soon as something supplies one')
  eq(yoursIn(facts, all, '2026-12-01', '2026-12-07', base), [], 'nothing of yours outside the period')
  const ov = read('app/clubhouse/[slug]/Overview.tsx')
  ok(!/lg:grid-cols-3/.test(ov) && /columns-1 lg:columns-2/.test(ov) && /break-inside-avoid/.test(ov), 'no three equal cards: cards sized to what they hold, flowing in two columns (M1)')
  ok(/keepsSheet && teeShown/.test(ov) && /keepsList && data\?\.counts/.test(ov), 'a card the account may not use is not drawn')
  const search = read('app/clubhouse/[slug]/OverviewSearch.tsx')
  ok(/e\.key !== '\/'/.test(search) && /\?row=\$\{p\.id\}/.test(search) && /\?event=\$\{e\.note\.id\}/.test(search) && /calendar'\)\}\/\$\{day\}/.test(search), 'search: "/" focuses it; a member, a club event and a day each open in their own section')
  ok(/get\('row'\)/.test(read('app/clubhouse/[slug]/members/MembersGrid.tsx')) && /get\('event'\)/.test(read('app/clubhouse/[slug]/events/Events.tsx'))
    && /get\('day'\)/.test(read('app/clubhouse/[slug]/calendar/ClubCalendar.tsx')) && /get\('day'\)/.test(read('app/clubhouse/[slug]/tee-sheet/TeeSheet.tsx')), '…and each section opens on what it was handed')
}

function playsFollowsMembershipTests() {
  console.log('\nPlays here follows the membership (D275)')
  eq([playsByMembership(null), playsByMembership(undefined), playsByMembership([2]), playsByMembership([0, 1, 2, 3, 4, 5, 6]), playsByMembership([])],
    [true, true, true, true, false], 'no membership plays (until Ross decides); a membership plays when it plays some day')
  const base: RowRow = { id: 'r', club_id: 'c', name: 'Ann', member_number: null, gui_number: null, email: null, role: 'member', user_id: null, removed_at: null, on_boards: true, officer: false, clubhouse: false }
  const plays = (o: Partial<RowRow>) => clubMay('play', { row: credentialsOf(asRow({ ...base, ...o })) })
  ok(plays({}), 'before 094 (no membership read): everybody plays')
  ok(plays({ category_id: null, gender: null, birth_date: null, category: null }), 'no membership: plays (M3)')
  ok(plays({ category_id: 'six', category: { days: [1, 2, 3, 4, 5, 6] } }), 'a 6 Day membership plays')
  ok(plays({ category_id: 'six', category: [{ days: [1] }] }), '…read as an embedded list too')
  ok(!plays({ category_id: 'social', category: { days: [] } }), 'a membership that plays no day: does not play')
  ok(plays({ category_id: 'gone', category: null }), 'a membership no longer there: plays')
  // M2: wherever the old tick and the membership agreed, the answer is the same.
  const seeded: { tick: boolean; row: Partial<RowRow> }[] = [
    { tick: true, row: { category_id: null, category: null } },
    { tick: true, row: { category_id: 'full', category: { days: [0, 1, 2, 3, 4, 5, 6] } } },
    { tick: true, row: { category_id: 'six', category: { days: [1, 2, 3, 4, 5, 6] } } },
    { tick: false, row: { category_id: 'social', category: { days: [] } } },
  ]
  eq(seeded.map(x => plays({ ...x.row, plays_here: !x.tick } as Partial<RowRow>)), seeded.map(x => x.tick),
    'a seeded club: every row whose tick agreed with its membership answers as before — the stored tick is no longer read')
  // Where they disagreed, the membership wins — the two cases the plan lists for Pints.
  ok(plays({ category_id: 'full', category: { days: [0, 1, 2, 3, 4, 5, 6] }, plays_here: false } as Partial<RowRow>), 'tick off, membership plays: now plays')
  ok(!plays({ category_id: 'social', category: { days: [] }, plays_here: true } as Partial<RowRow>), 'tick on, membership plays no day: no longer plays')
  const rowsTs = read('app/api/club/rows.ts')
  ok(!/plays_here/.test(rowsTs.match(/const TICK_COLS = '[^']*'/)?.[0] ?? 'plays_here') && /club_categories\(days\)/.test(rowsTs), 'the list is read with the membership’s days, never plays_here')
  ok(/PGRST200/.test(rowsTs) && /club_categories/.test(rowsTs.match(/missingSet[\s\S]{0,200}/)?.[0] ?? ''), '…and fail-soft before 094')
  for (const f of ['app/api/club/club.ts', 'app/api/club/clubhouse.ts', 'app/api/club/bookingStore.ts', 'app/api/club/store.ts'])
    ok(!/plays_here: |'plays_here'/.test(read(f).replace(/\/\/.*$/gm, '').replace(/RowPatch = Partial<\{[\s\S]*?\}>/, '').replace(/\['plays_here',[^\]]*\]/, '')), `${f}: plays_here neither read nor written`)
  const clubhouseFiles: string[] = []
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.tsx?$/.test(e.name)) clubhouseFiles.push(f) } }
  walk(path.join(__dirname, '../app/clubhouse'))
  const m98 = read('supabase/migrations/20260101000098_drop_plays_here.sql')
  ok(/^ALTER TABLE club_members DROP COLUMN IF EXISTS plays_here;$/m.test(m98) && /--\s+ALTER TABLE club_members ADD COLUMN IF NOT EXISTS plays_here boolean NOT NULL DEFAULT true;/.test(m98),
    'migration 098 drops plays_here, its undo written beside it')
  eq(clubhouseFiles.filter(f => /Plays here|plays here/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(path.join(__dirname, '..'), f)), [], 'no Plays here in the Clubhouse (M1)')
}

function teeEmbedTests() {
  console.log('\nA competition read into Edit (D274)')
  // Migration 065 gave tee_assignments a second key to players (booked_by), so an
  // unhinted players(...) embed is ambiguous and PostgREST refuses the whole read —
  // which is how every competition's Edit failed with "Could not make the competition".
  const mig = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260101000065_tee_booked_by.sql'), 'utf8')
  ok(/booked_by uuid REFERENCES players\(id\)/.test(mig), 'tee_assignments has two keys to players (player_id, booked_by)')
  const files: string[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(f) }
      else if (/\.tsx?$/.test(e.name)) files.push(f)
    }
  }
  walk(path.join(__dirname, '../app')); walk(path.join(__dirname, '../lib'))
  const bad = files.filter(f => /from\('tee_assignments'\)[^;]{0,400}[\s,'(]players\(/.test(fs.readFileSync(f, 'utf8')))
  eq(bad.map(f => path.relative(path.join(__dirname, '..'), f)), [], 'no tee_assignments read embeds players without naming the key')
  const route = fs.readFileSync(path.join(__dirname, '../app/api/club/competition/route.ts'), 'utf8')
  ok(route.includes('players!player_id(name, club_member_id)'), 'the competition read names player_id')
  eq([failWords('read'), failWords('change'), failWords('copy'), failWords(undefined)],
    ['Could not open the competition — try again.', 'Could not change the competition — try again.', 'Could not copy the competition — try again.', 'Could not make the competition — try again.'],
    'a fault says what was being done')
}

function gridColumnTests() {
  console.log('\nMembers grid columns (D273)')
  eq(readWidths(null), COLUMN_DEFAULTS, 'nothing remembered: the defaults')
  eq(readWidths('not json'), COLUMN_DEFAULTS, 'a broken memory is the defaults')
  eq(readWidths('[1,2]'), COLUMN_DEFAULTS, 'an array is no memory')
  const r = readWidths(JSON.stringify({ email: 300, name: 5, gender: 9999, birthDate: 'wide', bogus: 100 }))
  eq([r.email, r.name, r.gender, r.birthDate], [300, COLUMN_MIN, COLUMN_MAX, COLUMN_DEFAULTS.birthDate], 'remembered widths are clamped and bad ones dropped')
  eq(writeWidths({ ...COLUMN_DEFAULTS, email: 300 }), '{"email":300}', 'only a changed column is kept')
  eq(readWidths(writeWidths({ ...COLUMN_DEFAULTS, categoryId: 333 })).categoryId, 333, 'what is written reads back')
  eq([clampWidth(NaN), clampWidth(1), clampWidth(10000), clampWidth(200.4)], [COLUMN_MIN, COLUMN_MIN, COLUMN_MAX, 200], 'clamp')
  eq(fitWidth([100, 180, 90]), 204, 'a fit is the widest text plus padding')
  eq(fitWidth([]), COLUMN_MIN, 'an empty page fits the minimum')
  const grid = fs.readFileSync(path.join(__dirname, '../app/clubhouse/[slug]/members/MembersGrid.tsx'), 'utf8')
  ok(/aria-label=\{`Details for \$\{r\.name\}`\}/.test(grid) && grid.includes('IconDots'), 'Details is an ellipsis button named for the person')
  ok(grid.includes('COLUMN_STORAGE_KEY') && /localStorage[\s\S]{0,200}catch/.test(grid), 'widths are kept in localStorage inside try/catch')
}

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
  ok(fs.existsSync('app/club/[slug]/comp/[code]/(frame)/loading.tsx'), 'a page not fetched ahead lands on a stand-in at once')
  ok(JSON.parse(read('vercel.json')).regions?.[0] === 'dub1', 'the functions run in Dublin, beside the database (D196)')

  section('The club home from the last copy (D193, D194, D197)')
  const kept = new Map<string, string>()
  const w = { localStorage: {
    getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v) }, removeItem: (k: string) => { kept.delete(k) },
    key: (i: number) => [...kept.keys()][i] ?? null, get length() { return kept.size },
  } }
  ;(globalThis as unknown as { window: unknown }).window = w
  kept.set('sb-x-auth-token', JSON.stringify({ user: { id: 'acct', is_anonymous: false, email: 'a@b.ie' } }))
  const m = { clubId: 'c1', homeCourseId: null, role: 'member' as const, name: 'Ross', events: [], entries: [], season: [], courses: {}, outside: [], tops: {},
    toSign: [{ code: 'AB12CD', name: 'Medal', count: 1 }] }
  copy.keepClubHome('lahinch', m)
  ok([...kept.keys()].includes('gd.clubhome.v1:acct:lahinch') && !/AB12CD/.test(kept.get('gd.clubhome.v1:acct:lahinch')!), 'kept by account and club, versioned — never the cards to sign')
  const back = copy.readClubHome('lahinch')
  eq([back?.name, back?.toSign, back?.fromCopy], ['Ross', [], true], 'read back as a copy, its live parts empty')
  kept.set('sb-x-auth-token', JSON.stringify({ user: { id: 'other', is_anonymous: false, email: 'c@d.ie' } }))
  eq(copy.readClubHome('lahinch'), null, 'another account signed in on this phone draws nothing from it')
  kept.set('sb-x-auth-token', JSON.stringify({ user: { id: 'acct', is_anonymous: false, email: 'a@b.ie' } }))
  copy.forgetClubHome('lahinch')
  eq(copy.readClubHome('lahinch'), null, 'not on the list: the copy goes')
  copy.keepClubHome('lahinch', m); copy.keepClubHome('ballybunion', m)
  copy.forgetAllClubHomes()
  ok(![...kept.keys()].some(k => k.startsWith('gd.clubhome')), 'signed out or deleted: every copy goes')
  delete (globalThis as unknown as { window?: unknown }).window
  eq((read('lib/accountClient.ts').match(/forgetAllClubHomes\(\)/g) ?? []).length, 2, '…on signing out and on deleting')
  const view = read('app/club/[slug]/ClubView.tsx')
  ok(/<div className="club-public-face"><PublicFace face=\{face\} \/><\/div>/.test(view) && /<MembersWait \/>/.test(view), 'the public face and the stand-in are both in the HTML, the mark choosing')
  ok(/setMembers\(m => \(m && m\.slug === face\.slug \? m : readClubHome\(face\.slug\)\)\)/.test(view), 'a hinted phone draws its copy before the first paint of the page — never another club’s (D223)')
  ok(/!m\.fromCopy && live\.length > 0/.test(view) && /club-fresh-in/.test(view), 'Live now never from the copy; the live parts fade in')
  ok(/forgetClubHome\(face\.slug\)\s*\n\s*if \(clubs\.includes\(face\.slug\)\)/.test(view) && /router\.replace\(`\/club\/\$\{rest\[0\]\}`\)/.test(view)
    && /window\.location\.replace\('\/home'\)/.test(view) && /return\n\s*\}\n\s*notClubMember\(\)/.test(view),
    'taken off the list: the copy goes, and the phone moves to its next club, else the personal page; a visitor sees the public face (D223)')
  ok(/if \(storedAccountSession\(\)\) \{ setLost\(true\); return \}/.test(view) && /Could not reach Green Dot — try again\./.test(view), 'a lost signal keeps what is on screen, with Try again')
  const sheet = read('app/globals.css')
  ok(/html\[data-club-member\] \.club-public-face \{ display: none; \}/.test(sheet), 'the public face is never drawn for a hinted phone (D197)')
  ok(/\.club-member-wait, \.club-bar\.club-bar-wait \{ display: none; \}/.test(sheet), '…and the stand-in is never drawn for anybody else')
  ok(/\.club-fresh-in \{ animation: clubFreshIn 160ms ease-out both; \}/.test(sheet) && /prefers-reduced-motion: reduce\) \{ \.club-fresh-in \{ animation: none; \} \}/.test(sheet),
    'the fade is 160ms ease-out, and none under Reduce Motion')
}

async function clubhouseTests() {
  section('Stage (k1): the Clubhouse’s rules (lib/clubhouse.ts)')
  eq([standingOf({ linked: true, removed: false, invitedAt: null }), standingOf({ linked: false, removed: false, invitedAt: 'x' }),
    standingOf({ linked: false, removed: false, invitedAt: null }), standingOf({ linked: true, removed: true, invitedAt: null })],
    ['joined', 'invited', 'not_invited', 'off'], 'Joined, Invited, Not invited, Taken off')
  eq(cleanSearch('  O’Neill, (Seán)%_ '), 'O’Neill Seán', 'a search loses what the database reads as its own')
  eq([pageLine(0, 0), pageLine(0, 12), pageLine(1, 312)], ['Nobody', '12 people', '51–100 of 312'], 'where the page stands')
  eq(PAGE_SIZE, 50, '50 rows a page (D207)')
  eq(LIST_FILTERS.map(f => f.key).length, 7, 'seven ways to narrow the list — Plays here follows the membership now (D275)')
  eq([clubhouseHref('pints'), clubhouseHref('pints', 'members'), sectionAt('/clubhouse/pints/members', 'pints'), sectionAt('/clubhouse/pints', 'pints')],
    ['/clubhouse/pints', '/clubhouse/pints/members', 'members', 'overview'], 'the sections’ addresses')
  const csv = listCsv([{ id: '1', name: '=HYPERLINK("x")', email: 'a@b.ie', memberNumber: '12', guiNumber: '3110002', handicapIndex: -1.5,
    credentials: { owner: false, playsHere: true, officer: true, clubhouse: false }, linked: true, removed: false, invitedAt: null, onBoards: true, gender: 'M', birthDate: '1980-04-03', categoryId: null }])
  ok(csv.startsWith('Name,Email,Member number,GUI number,Gender,Date of birth,Category,Handicap index,Standing,Officer,Clubhouse\r\n') && csv.includes(`"'=HYPERLINK(""x"")"`) && csv.includes('3110002') && csv.includes(',+1.5,'),
    'the download: headed for pasting back, numbers whole, a plus index as +, a formula defused')
  const pasted = parseMemberList(csv)
  ok(pasted.rows.length === 1 && pasted.rows[0].guiNumber === '3110002' && pasted.rows[0].email === 'a@b.ie', '…and pasting it back reads it')
  ok(pasted.rows[0].gender === 'Male' && pasted.rows[0].birthDate === '03/04/1980', '…its gender and date of birth with it')
  const counts: ListCounts = { onList: 10, joined: 4, invited: 2, notJoined: 6, off: 1, officer: 2, clubhouse: 1, noEmail: 1 }
  const needs = needsYou({ base: '/clubhouse/p', counts, phases: [{ code: 'AB12CD', name: 'Medal', phase: 'awaiting' }], clubSlug: 'p', officer: true })
  eq(needs.map(n => n.key), ['certify-AB12CD', 'not-invited', 'no-email'], 'Needs you: a competition to certify, people never sent a code, people with no email')
  ok(/3 people have an email and no code yet/.test(needs[1].line), '…counted: six not joined, two invited, one with no email')
  eq(needsYou({ base: '/c', counts: { ...counts, notJoined: 0, noEmail: 0 }, phases: [], clubSlug: 'p', officer: false }), [], '…and nothing when nothing needs the office')

  section('Stage (k1): the Clubhouse on the server (/api/club)')
  const s = new Stand()
  const ross = member('ross', 'ross@x.ie'), dave = member('dave', 'dave@x.ie'), gd = member('gd', 'staff@greendot.live'), eve = member('eve', 'eve@x.ie')
  ;[ross, dave, gd, eve].forEach(u => s.add(u))
  const ask = (tok: string, action: string, body: Record<string, unknown> = {}) => runClub({ token: tok, action, address: 'a', ...body }, s, s.clock)
  const made = await setUpClub(s, 'tok-ross', { name: 'Pints Golf Club', yourName: 'Ross' })
  const clubId = made.status === 200 ? made.body.club!.id : ''
  s.clubs.set(clubId, { ...s.clubs.get(clubId)!, verifiedAt: NOW.toISOString() })
  await ask('tok-ross', 'add', { clubId, rows: Array.from({ length: 60 }, (_, i) => ({ name: `Player ${String(i).padStart(2, '0')}`, guiNumber: `31100${String(i).padStart(2, '0')}`, email: i % 10 === 0 ? '' : `p${i}@x.ie` })) })
  const daveRow = [...s.list.values()].find(r => r.name === 'Player 01')!
  s.list.set(daveRow.id, { ...daveRow, userId: 'dave' })
  const door = await ask('tok-ross', 'clubhouse', { slug: 'pints-golf-club' })
  ok(door.status === 200 && door.body.club?.credentials.clubhouse === true && door.body.club.staff === false, 'the owner opens the Clubhouse')
  eq((await ask('tok-dave', 'clubhouse', { slug: 'pints-golf-club' })).status, 403, 'a plain member is told they have no access')
  eq((await ask('tok-gd', 'clubhouse', { slug: 'pints-golf-club' })).status, 403, '…as is anybody not staff')
  s.staff.add('gd')
  const staffDoor = await ask('tok-gd', 'clubhouse', { slug: 'pints-golf-club' })
  ok(staffDoor.status === 200 && staffDoor.body.club?.staff === true && staffDoor.body.me?.name === STAFF_NAME, 'Green Dot staff open any club (D222)')
  ok(s.activity.some(a => a.action === 'staff.open' && a.byStaff && a.byName === STAFF_NAME), '…and the club’s log says "Green Dot staff" was in')
  const found = await ask('tok-gd', 'find', { q: 'pints' })
  ok(found.status === 200 && found.body.clubs?.[0]?.slug === 'pints-golf-club', '…finding it by search')
  eq((await ask('tok-ross', 'find', { q: 'pints' })).status, 403, 'only staff search for clubs')
  const p0 = await ask('tok-ross', 'page', { clubId })
  ok(p0.status === 200 && p0.body.grid?.length === 50 && p0.body.total === 61, '50 a page, the total beside them')
  ok(p0.status === 200 && !!p0.body.grid?.some(r => r.guiNumber === '3110002'), '…numbers whole in the Clubhouse')
  eq((await ask('tok-dave', 'export', { clubId })).status, 403, 'nobody without Clubhouse downloads the list')
  eq((await ask('tok-dave', 'page', { clubId })).status, 403, '…or reads a page of it')
  const p1 = await ask('tok-ross', 'page', { clubId, page: 1 })
  eq(p1.status === 200 ? p1.body.grid?.length : -1, 11, 'the second page holds the rest')
  const found2 = await ask('tok-ross', 'page', { clubId, q: '3110045' })
  eq(found2.status === 200 ? found2.body.grid?.map(r => r.name) : null, ['Player 45'], 'search reads the numbers too')
  const joined = await ask('tok-ross', 'page', { clubId, filter: 'joined' })
  eq(joined.status === 200 ? joined.body.grid?.map(r => r.name).sort() : null, ['Player 01', 'Ross'], 'filtered on the server: joined')
  const desc = await ask('tok-ross', 'page', { clubId, sort: 'name', desc: true })
  eq(desc.status === 200 ? desc.body.grid?.[0]?.name : null, 'Ross', 'ordered by a column, either way')
  const ov = await ask('tok-ross', 'overview', { clubId })
  ok(ov.status === 200 && ov.body.counts?.onList === 61 && ov.body.counts.joined === 2 && ov.body.counts.noEmail === 6, 'the Overview’s counts')
  ok(ov.status === 200 && (ov.body.needs ?? []).some(n => n.key === 'not-invited'), '…and what needs the office')
  ok(ov.status === 200 && ov.body.today === irishToday(s.clock) && JSON.stringify(ov.body.yours) === JSON.stringify(NO_YOURS), 'D276: the Overview says its day, and nothing is yours before the store can say (fail-soft)')
  const asked: unknown[] = []
  const withYours = Object.assign(Object.create(Object.getPrototypeOf(s)), s, {
    async yoursFacts(clubId: string, rowId: string | null, userId: string, from: string, to: string): Promise<YoursFacts> {
      asked.push({ clubId, rowId, userId, from, to })
      return { ...NO_YOURS, added: ['n1'] }
    },
  })
  const ov2 = await runClub({ token: 'tok-ross', action: 'overview', address: 'a', clubId }, withYours, s.clock)
  const rossList = [...s.list.values()].find(r => r.clubId === clubId && r.userId === 'ross')!
  const wk = periodRange(irishToday(s.clock), 'week')
  ok(ov2.status === 200 && ov2.body.yours?.added[0] === 'n1' && JSON.stringify(asked[0]) === JSON.stringify({ clubId, rowId: rossList.id, userId: 'ross', from: wk.from, to: wk.to }),
    '…and asks for this account’s own row, Monday to Sunday of the week the day is in')
  const ids = (p0.status === 200 ? p0.body.grid ?? [] : []).filter(r => /Player 0[2-4]/.test(r.name)).map(r => r.id)
  const officers = await ask('tok-ross', 'bulk', { clubId, memberIds: ids, op: 'tick', key: 'officer', value: true })
  ok(officers.status === 200 && officers.body.done === 3 && ids.every(id => s.list.get(id)!.officer === true), 'ticked rows made Officers in one go')
  ok(s.activity.filter(a => a.action === 'credentials' && a.batchId).length === 3, '…each logged, under one batch')
  const noCh = await ask('tok-ross', 'bulk', { clubId, memberIds: ids, op: 'tick', key: 'clubhouse', value: true })
  ok(noCh.status === 200 && noCh.body.done === 3, 'an owner gives Clubhouse in bulk')
  const staffCh = await ask('tok-gd', 'bulk', { clubId, memberIds: [daveRow.id], op: 'tick', key: 'clubhouse', value: true })
  ok(staffCh.status === 200 && staffCh.body.done === 1, 'staff give Clubhouse too')
  ok(s.activity.some(a => a.memberId === daveRow.id && a.byStaff && a.byName === STAFF_NAME), '…shown to the club as Green Dot staff')
  const p2 = ids[0]
  s.list.set(p2, { ...s.list.get(p2)!, userId: 'eve' })
  const office = await ask('tok-eve', 'bulk', { clubId, memberIds: [daveRow.id], op: 'tick', key: 'clubhouse', value: false })
  ok(office.status === 200 && !!office.body.failed?.[0]?.why.startsWith('Only an owner'), 'Clubhouse cannot take Clubhouse away — said by name, the rest done')
  const sent = await ask('tok-ross', 'bulk', { clubId, memberIds: ids.slice(1), op: 'invite' })
  ok(sent.status === 200 && sent.body.done === 2 && ids.slice(1).every(id => s.invitedAt.has(id)), 'codes emailed to the ticked, each marked Invited (093)')
  const csvOut = await ask('tok-ross', 'export', { clubId })
  ok(csvOut.status === 200 && (csvOut.body.csv ?? '').split('\r\n').length === 63 && s.activity.some(a => a.action === 'list.download'), 'the download: every row, logged')
  const slim = await ask('tok-ross', 'update', { clubId, memberId: ids[2], name: 'Seán Byrne', slim: true })
  ok(slim.status === 200 && !slim.body.list && s.list.get(ids[2])!.name === 'Seán Byrne', 'a cell changed in place answers without the whole list')
  const staffEdit = await ask('tok-gd', 'update', { clubId, memberId: ids[2], email: 'sean@x.ie', slim: true })
  ok(staffEdit.status === 200 && s.list.get(ids[2])!.email === 'sean@x.ie', 'staff change a row at a club not theirs')
}

async function awardTests() {
  section('Golfer of the Year (stage 6, P14)')
  const r0 = defaultAwardRules()
  eq(placePoints(r0.points, 1), 25, '1st: 25')
  eq(placePoints(r0.points, 2, 2), 18, 'two level for 2nd share 2nd’s and 3rd’s — 20 and 16 make 18 each')
  eq(placePoints(r0.points, 15), 1, '15th: 1')
  eq(placePoints(r0.points, 16), 0, 'past the table: nothing')
  eq([placeWords(1, 1), placeWords(2, 1), placeWords(3, 1), placeWords(11, 1), placeWords(22, 1), placeWords(4, 2)], ['1st', '2nd', '3rd', '11th', '22nd', 'T4'], 'places as members read them')
  eq(readPointsTable('25, 20 16'), [25, 20, 16], 'a points table typed as a list')
  eq(readPointsTable('25, x'), null, '…a figure that will not read refuses it')
  const stages = bracketStages([
    { roundNumber: 1, sideA: 'a', sideB: 'b', winner: 'a' }, { roundNumber: 1, sideA: 'c', sideB: 'd', winner: 'd' },
    { roundNumber: 1, sideA: 'e', sideB: 'f', winner: 'e' }, { roundNumber: 1, sideA: 'g', sideB: 'h', winner: null },
    { roundNumber: 2, sideA: 'a', sideB: 'd', winner: 'a' }, { roundNumber: 2, sideA: 'e', sideB: null, winner: null },
    { roundNumber: 3, sideA: 'a', sideB: null, winner: null },
  ])
  eq(Object.fromEntries(stages), { b: 'quarter', c: 'quarter', f: 'quarter', d: 'semi' }, 'stages arrive as each round is decided — quarter-finalists and a semi-finalist out so far, the Final still to play')
  const final = bracketStages([{ roundNumber: 1, sideA: 'a', sideB: 'b', winner: 'b' }])
  eq(Object.fromEntries(final), { b: 'winner', a: 'runnerUp' }, 'a Final decided: winner and runner-up')

  const results: AwardResult[] = [
    { code: 'MEDAL1', name: 'Spring Medal', date: '2027-04-04', kind: 'stroke', finishers: [{ rowId: 'ra', place: 1, tied: 1 }, { rowId: 'rb', place: 2, tied: 2 }, { rowId: 'rc', place: 2, tied: 2 }] },
    { code: 'MAJOR1', name: 'Captain’s Prize', date: '2027-06-01', kind: 'stroke', finishers: [{ rowId: 'rc', place: 1, tied: 1 }, { rowId: 'ra', place: 2, tied: 1 }] },
    { code: 'MATCH1', name: 'Singles', date: '2027-08-01', kind: 'matchplay', stages: [{ rowId: 'rb', stage: 'winner' }, { rowId: 'ra', stage: 'semi' }] },
  ]
  const people = [{ rowId: 'ra', name: 'Ann' }, { rowId: 'rb', name: 'Bob' }, { rowId: 'rc', name: 'Cat' }]
  const plain = awardStanding(r0, results, people)
  eq(plain.map(r => [r.name, r.total]), [['Ann', 53], ['Bob', 43], ['Cat', 43]], 'every result counts: Ann 25 + 20 + 8; Bob 18 + 25; Cat 18 + 25')
  eq(plain.map(r => r.place), [1, 2, 2], 'level players share a place')
  const major = awardStanding({ ...r0, weights: { MAJOR1: 2 } }, results, people)
  eq(major.map(r => [r.name, r.total]), [['Ann', 73], ['Cat', 68], ['Bob', 43]], 'a Major counts double — Ann 25 + 40 + 8, Cat 18 + 50: the table re-told at once')
  eq(awardStanding({ ...r0, weights: { MAJOR1: 0 } }, results, people).find(r => r.name === 'Cat')?.total, 18, '×0 leaves a competition out')
  const best1 = awardStanding({ ...r0, bestOf: 1 }, results, people)
  ok(best1.find(r => r.name === 'Ann')!.total === 25 && best1.find(r => r.name === 'Ann')!.lines.filter(l => !l.counts).length === 2, 'best 1: one result counts, the rest shown and struck through')
  eq(awardStanding({ ...r0, kinds: { stroke: true, matchPlay: false } }, results, people).find(r => r.name === 'Bob')?.total, 18, 'match play switched off: Bob’s win counts for nothing')
  eq(awardStanding(r0, results, people.filter(p => p.rowId !== 'rc')).map(r => r.name), ['Ann', 'Bob'], 'somebody the award’s rules leave out is not listed')
  eq(myStandingLine(plain, 'rb'), 'You’re T2, 10 behind', 'your line, behind')
  eq(myStandingLine(plain, 'ra'), 'You lead by 10', '…leading')
  eq(myStandingLine(plain, 'zz'), null, '…nothing yet')
  eq(readAwardRules({ points: [10, 'x'], bestOf: 0, weights: { MEDAL1: 3, BAD: 2 } }), { ...r0 }, 'bad stored answers go back to their defaults, never the award refused')
  ok(!!awardIssue({ name: '', year: 2027, rules: r0 }) && !!awardIssue({ name: 'G', year: 2027, rules: { ...r0, kinds: { stroke: false, matchPlay: false } } }) && awardIssue({ name: 'Golfer of the Year', year: 2027, rules: r0 }) === null,
    'an award needs a name and something to count')

  const row = (id: string, name: string, userId: string | null, extra: Partial<MemberRecord> = {}): MemberRecord =>
    ({ id, clubId: 'c1', name, memberNumber: null, guiNumber: null, email: null, role: 'member', userId, removedAt: null, onBoards: true, playsHere: true, officer: false, clubhouse: false, ...extra })
  const rows = [row('ra', 'Ann', 'ann', { gender: 'F' }), row('rb', 'Bob', 'bob', { gender: 'M' }), row('rc', 'Cat', null, { gender: 'F' }), row('rd', 'Dan', null, { playsHere: false }), row('rh', 'Hub', 'hub', { clubhouse: true })]
  eq(eligiblePeople(rows, { ...r0, entry: { genders: ['F'] } }, 2027, { categories: [], ageDate: '01-01' }).map(p => p.name), ['Ann', 'Cat'], 'the ladies’ award: the ladies who play here')
  eq(eligiblePeople(rows, r0, 2027, { categories: [], ageDate: '01-01' }).map(p => p.name), ['Ann', 'Bob', 'Cat', 'Hub'], 'nobody who doesn’t play here')

  const saved: Award[] = []
  const logged: ActivityEntry[] = []
  const pints = { id: 'c1', slug: 'pints', name: 'Pints', verifiedAt: NOW.toISOString(), refusedAt: null } as unknown as ClubRecord
  const store = (ready = true): AwardsStore => ({
    async userFromToken(t) { const u = t.slice(4); return ['ann', 'bob', 'hub', 'out'].includes(u) ? member(u, `${u}@x.ie`) : null },
    async club(id) { return id === 'c1' ? pints : null },
    async rowOf(_c, u) { return rows.find(r => r.userId === u) ?? null },
    async awards(_c, year) { if (!ready) throw new AwardsNotReady(); return saved.filter(a => a.year === year) },
    async saveAward(a) { if (!ready) throw new AwardsNotReady(); const id = a.id ?? `aw${saved.length + 1}`; const i = saved.findIndex(x => x.id === id); const v = { ...a, id }; if (i >= 0) saved[i] = v; else saved.push(v); return id },
    async deleteAward(_c, id) { const i = saved.findIndex(a => a.id === id); if (i >= 0) saved.splice(i, 1) },
    async yearResults() { return results },
    async rows() { return rows },
    async logActivity(e) { logged.push(...e) },
  })
  const go = (who: string, action: string, extra: Record<string, unknown> = {}, s = store()) => runAwards({ token: `tok-${who}`, action, clubId: 'c1', year: 2027, ...extra }, s, NOW)
  eq((await go('ann', 'save', { name: 'Golfer of the Year', rules: r0 })).status, 403, 'a member does not make awards')
  const made = await go('hub', 'save', { name: '  Golfer  of the Year ', rules: { ...r0, weights: { MAJOR1: 2 } } })
  ok(made.status === 200 && made.body.ok && saved[0]?.name === 'Golfer of the Year' && logged.some(l => l.action === 'award.add'), 'the Clubhouse makes one, logged')
  const st = await go('bob', 'standing', { id: saved[0].id })
  ok(st.status === 200 && st.body.ok && st.body.standing?.[0]?.name === 'Ann' && st.body.myRowId === 'rb', 'a member reads the table')
  const mine = await go('bob', 'mine', { year: undefined }, store())
  ok(mine.status === 200 && mine.body.ok && Array.isArray(mine.body.mine), 'a member’s own line for this year')
  eq((await go('out', 'list')).status, 403, 'somebody not on the list reads nothing')
  const early = await go('hub', 'list', {}, store(false))
  ok(early.status === 200 && early.body.ok && early.body.ready === false, 'before migration 097: "not set up yet", never an error')
  eq((await go('hub', 'save', { name: 'X', rules: r0 }, store(false))).status, 503, '…and nothing saved')
  ok((await go('hub', 'delete', { id: saved[0].id })).status === 200 && saved.length === 0 && logged.some(l => l.action === 'award.delete'), 'deleted, logged — no result touched')
}

async function matchPlayTests() {
  section('A club match play (Ross, 17 Nov 2026; D264–D271, lib/clubMatchPlay.ts)')
  const today = '2026-11-15'
  const form: MatchPlayForm = {
    name: 'Captain’s Prize Matchplay', format: 'fourball', allowance: 90, watch: 'members', entry: null,
    field: 'entries', closes: { date: '2027-03-31', time: '20:00' }, qualifier: null, maxField: 16,
    draw: { when: 'auto', date: null, time: null, seeding: 'handicap' },
    deadlines: ['2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31'],
    venue: 'home', tie: 'extra', handicap: 'on_day',
  }
  eq(matchPlayFormIssue(form, NOW, today), null, 'a whole form passes: fourball, 16 pairs, four play-by dates')
  ok(/each of the 4 rounds/.test(matchPlayFormIssue({ ...form, deadlines: form.deadlines.slice(1) }, NOW, today) ?? ''), 'a field of 16 needs four dates')
  eq(matchPlayFormIssue({ ...form, maxField: null, deadlines: ['2027-07-31'] }, NOW, today), null, 'no limit (D264): the Final alone is enough')
  ok(!!matchPlayFormIssue({ ...form, maxField: null, deadlines: [] }, NOW, today), '…but not no dates at all')
  ok(/before the draw/.test(matchPlayFormIssue({ ...form, deadlines: ['2027-03-01', ...form.deadlines.slice(1)] }, NOW, today) ?? ''),
    'a round due before entries close and the draw is refused')
  ok(/cannot be due before the Quarter/.test(matchPlayFormIssue({ ...form, deadlines: ['2027-04-30', '2027-06-30', '2027-05-31', '2027-07-31'] }, NOW, today) ?? ''),
    'deadlines never run backwards')
  ok(!!matchPlayFormIssue({ ...form, closes: { date: '2026-11-01', time: '20:00' } }, NOW, today), 'entries closing in the past are refused')
  ok(/before entries close/.test(matchPlayFormIssue({ ...form, draw: { when: 'date', date: '2027-03-30', time: '20:00', seeding: 'random' } }, NOW, today) ?? ''),
    'a dated draw before entries close is refused (D265)')
  eq(matchPlayFormIssue({ ...form, draw: { when: 'manual', date: null, time: null, seeding: 'random' } }, NOW, today), null, 'a draw by hand passes (D265)')
  ok(!!matchPlayFormIssue({ ...form, allowance: 5 }, NOW, today), 'an allowance under 10% is refused')
  const qual: MatchPlayForm = { ...form, format: 'singles', allowance: 100, field: 'qualifier', closes: null, qualifier: { code: 'MEDAL1', qualify: 16 }, draw: { when: 'auto', date: null, time: null, seeding: 'qualifier' } }
  eq(matchPlayFormIssue(qual, NOW, today), null, 'a qualifier: the top 16 of a club competition, seeded by its finish')
  ok(!!matchPlayFormIssue({ ...qual, qualifier: { code: 'MEDAL1', qualify: 12 } }, NOW, today), '…12 qualifying is no bracket')
  ok(!!matchPlayFormIssue({ ...qual, qualifier: { code: 'MEDAL1', qualify: 32 } }, NOW, today), '…nor more than the biggest field')
  ok(/singles/.test(matchPlayFormIssue({ ...qual, format: 'fourball' }, NOW, today) ?? ''), '…and a pairs match play cannot qualify from a singles competition (stage 5)')
  eq(readMatchPlayForm({ name: '  A   B ', maxField: null })?.name, 'A B', 'answers read and tidied')
  eq(readMatchPlayForm({ maxField: null })?.maxField, null, '…no limit reads as null')

  eq(matchPlayBoard(form), { id: 'lb-matchplay', audience: 'team', competition: 'matchplay', teamSet: 'set-2', handicapAllowance: 90 },
    'a fourball draw: pairs, on a sheet of their own, 90%')
  eq(matchPlayBoard({ format: 'singles', allowance: 100 }), { id: 'lb-matchplay', audience: 'individual', competition: 'matchplay' }, 'singles at 100%: the plain draw')
  eq(parseLeaderboards([matchPlayBoard(form)])[0].handicapAllowance, 90, 'a draw keeps its allowance when read back')
  eq(parseLeaderboards([{ id: 'lb-matchplay', audience: 'individual', competition: 'matchplay' }])[0].handicapAllowance, undefined, '…and a draw stored before reads exactly as it did')

  const seed = matchPlaySeed(form)
  const setup = parseBracketSetup(seed)
  ok(setup?.schedule === 'continuous' && setup.entry === 'self_join' && setup.deadlines?.length === 4, 'stored as the platform’s continuous knockout: members enter themselves, four deadlines')
  eq(setup?.draw, { when: 'date', on: '2027-03-31', at: '20:00', seeding: 'handicap' }, '…the draw made when entries close, seeded by handicap — the draw job reads it as ever')
  eq(parseBracketSetup(matchPlaySeed({ ...form, draw: { when: 'manual', date: null, time: null, seeding: 'random' } }))?.draw, { when: 'later' }, 'a draw by hand waits')
  eq(parseBracketSetup(matchPlaySeed(qual))?.qualifying, { eventCode: 'MEDAL1', seeding: 'seeded' }, 'a qualifier rides in the knockout’s own qualifying key')
  const back = readClubMatchPlay(seed)
  ok(!!back && back.format === 'fourball' && back.maxField === 16 && back.closes?.time === '20:00' && back.drawOn?.date === '2027-03-31', 'read back whole')
  eq(readClubMatchPlay({ format: 'match_play', schedule: 'continuous' }), null, 'a knockout that is not a club’s is not one')
  eq(matchPlayKeyDates(back!), ['2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31'], 'its calendar marks: entries closing and the draw, then each play-by date')

  eq(matchPlayPhase(back!, { drawn: false, won: false }, NOW), 'entries', 'before entries close: open')
  eq(matchPlayPhase(back!, { drawn: false, won: false }, new Date('2027-04-01T00:00:00Z')), 'draw_pending', 'after: closed, waiting for the draw')
  eq(matchPlayPhase(back!, { drawn: true, won: false }, NOW), 'in_play', 'drawn: in play')
  eq(matchPlayPhase(readClubMatchPlay(matchPlaySeed(qual))!, { drawn: false, won: false }, NOW), 'qualifier', 'a qualifier’s field waits for it')
  eq(matchPlayLine(back!, 'entries'), `Entries close ${clubEventDates('2027-03-31', '2027-03-31')}, 8:00 pm`, 'the line says when entries close, Irish time')
  const rules = matchPlayRules(back!, { allowance: 90 })
  ok(rules.lines[0].value === 'Fourball match play · 90% handicap' && rules.lines.some(l => l.value === 'Your index on the day you play'),
    'the rules as members read them, the handicap on the day (D269)')
  eq(rules.deadlines.map(d => d.round), ['Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'], '…each play-by date under its round')

  section('Making a club match play (/api/club/competition matchplay.new)')
  const rows: Record<string, unknown>[] = []
  const pints = { id: 'c1', slug: 'pints', name: 'Pints', verifiedAt: NOW.toISOString(), refusedAt: null }
  const rossRow = (clubhouse: boolean): MemberRecord => ({ id: 'row', clubId: 'c1', name: 'Ross', memberNumber: null, guiNumber: null, email: null, role: 'member', userId: 'ross', removedAt: null, onBoards: true, playsHere: true, officer: true, clubhouse })
  const logged: ActivityEntry[] = []
  const store = (clubhouse: boolean, extra: Partial<CompetitionStore> = {}): CompetitionStore => ({
    async userFromToken(t) { return t === 'tok-ross' ? member('ross', 'ross@x.ie') : null },
    async clubsOf() { return [{ club: pints, row: rossRow(clubhouse) }] },
    async club(id) { return id === 'c1' ? pints : null },
    async rowOf() { return rossRow(clubhouse) },
    async isStaff() { return false },
    create: {
      async userFromToken(t) { return t.slice(4) },
      async isMember() { return true },
      async insertTrip(row) { rows.push(row); return { id: 'trip-mp' } },
      async writeMembership() {},
      async writeLeadEmail() {},
      async deleteTrip() { rows.pop() },
      async adminClubs() { return [] },
      async setEventClub() {},
    },
    async insertItem() { throw new Error('a match play has no golf item') },
    async insertRound() { throw new Error('a match play has no round') },
    async deleteTrip() {},
    newCode: () => 'MATCH1',
    newId: () => 'id',
    async logActivity(e) { logged.push(...e) },
    async compSource(code) { return code === 'MEDAL1' ? { clubId: 'c1', name: 'Spring Medal', date: '2027-04-10', courseId: 'k', board: null, teeSheet: null, membersOnly: true } : null },
    ...extra,
  })
  eq((await runNewMatchPlay({ token: 'tok-ross', clubId: 'c1', form }, store(false), NOW)).status, 403, 'an Officer without Clubhouse makes none — it is the office’s')
  const made = await runNewMatchPlay({ token: 'tok-ross', clubId: 'c1', form }, store(true), NOW)
  ok(made.status === 200 && made.body.ok && made.body.code === 'MATCH1', 'Clubhouse makes one')
  const row = rows[0]
  ok(row.competition === 'club' && row.kind === 'tournament' && row.start_date === today && row.end_date === '2027-07-31',
    '…a club competition from today to the Final’s play-by date, with no golf item or round')
  ok(String(row.public_passcode_hash ?? '').startsWith('s1$'), '…members only (D164)')
  ok((row.event_permissions as Record<string, unknown>).score_matches === false, '…a match is scored by its players and the Officers, not anybody with the code')
  ok(logged.some(l => l.action === 'competition.add'), '…logged')
  const badQual = await runNewMatchPlay({ token: 'tok-ross', clubId: 'c1', form: { ...qual, qualifier: { code: 'OTHER1', qualify: 16 } } }, store(true), NOW)
  ok(badQual.status === 400 && !badQual.body.ok && /club’s own/.test(badQual.body.error), 'a qualifier not the club’s own is refused')
  const lateQual = await runNewMatchPlay({ token: 'tok-ross', clubId: 'c1', form: { ...qual, deadlines: ['2027-04-05', ...qual.deadlines.slice(1)] } }, store(true), NOW)
  ok(lateQual.status === 400 && !lateQual.body.ok && /before the first round/.test(lateQual.body.error), '…as is one played after the first round is due')
  eq((await runNewMatchPlay({ token: 'tok-ross', clubId: 'c1', form: qual }, store(true), NOW)).status, 200, 'the club’s own Spring Medal qualifies them')

  section('Entering a club match play (stage 2, /api/club/matchplay)')
  const open = readClubMatchPlay(matchPlaySeed({ ...form, format: 'singles', maxField: 16, deadlines: ['2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31'] }))!
  const beforeClose = NOW
  const afterClose = new Date('2027-04-01T00:00:00Z')
  eq(enterIssue(open, { now: beforeClose, drawn: false, entered: 3, admin: false }), null, 'singles, before the close, room left: anybody may enter')
  ok(/closed/.test(enterIssue(open, { now: afterClose, drawn: false, entered: 3, admin: false }) ?? ''), 'after the close: refused')
  eq(enterIssue(open, { now: afterClose, drawn: false, entered: 3, admin: true }), null, '…but an Officer may still put somebody in until the draw')
  ok(/full — 16 of 16/.test(enterIssue(open, { now: beforeClose, drawn: false, entered: 16, admin: true }) ?? ''), 'never past the biggest field, the Clubhouse included')
  ok(/draw is made/.test(enterIssue(open, { now: beforeClose, drawn: true, entered: 3, admin: true }) ?? ''), 'never once drawn')
  eq(enterIssue(back!, { now: beforeClose, drawn: false, entered: 0, admin: false }), null, 'a fourball takes entries (stage 4, partners)')
  eq(withdrawEntryIssue(open, { now: beforeClose, drawn: false, mine: true, admin: false }), null, 'you take yourself out until the close')
  ok(!!withdrawEntryIssue(open, { now: afterClose, drawn: false, mine: true, admin: false }) && withdrawEntryIssue(open, { now: afterClose, drawn: false, mine: false, admin: true }) === null,
    'after it only an Officer takes anybody out, until the draw')
  ok(!!withdrawEntryIssue(open, { now: beforeClose, drawn: false, mine: false, admin: false }), 'never somebody else, as a member')
  eq(overCap([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2), ['c'], 'two on the last place at once: the later entry is taken back')

  const mpComp: MatchPlayComp = {
    tripId: 'trip-mp', code: 'MATCH1', name: 'Club Singles', clubId: 'c1', publicHash: 's1$x', setup: open, allowance: 100,
    entryLine: null, entry: null, entered: 0, drawn: false, won: false, qualifierName: null, endDate: '2027-07-31',
  }
  const listRow2 = (id: string, name: string, userId: string, extra: Partial<MemberRecord> = {}): MemberRecord =>
    ({ id, clubId: 'c1', name, memberNumber: null, guiNumber: null, email: null, role: 'member', userId, removedAt: null, onBoards: true, playsHere: true, officer: false, clubhouse: false, ...extra })
  const listed: Record<string, MemberRecord> = {
    ross: listRow2('r-ross', 'Ross', 'ross'), dave: listRow2('r-dave', 'Dave', 'dave', { gender: 'M' }), ann: listRow2('r-ann', 'Ann', 'ann', { gender: 'F' }),
    off: listRow2('r-off', 'Officer', 'off', { officer: true }), nope: listRow2('r-nope', 'Sam', 'nope', { playsHere: false }),
  }
  const entryStore = (comp: MatchPlayComp, field: Entrant[], extra: Partial<MatchPlayEntryStore> = {}): MatchPlayEntryStore => ({
    async userFromToken(t) { return listed[t.slice(4)] ? member(t.slice(4), `${t.slice(4)}@x.ie`) : null },
    async matchPlay(code) { return code === comp.code ? comp : null },
    async myRow(_c, u) { return listed[u] ?? null },
    async rowsByIds(_c, ids) { return Object.values(listed).filter(r => ids.includes(r.id)) },
    async indexOf() { return 12.4 },
    async entrants() { return [...field] },
    async insertPlayer(r) { if (field.some(e => e.rowId === r.club_member_id)) return 'clash'; field.push({ playerId: `p-${r.club_member_id}`, rowId: r.club_member_id, name: r.name }); return `p-${r.club_member_id}` },
    async deletePlayer(_t, id) { const i = field.findIndex(e => e.playerId === id); if (i >= 0) field.splice(i, 1) },
    async linkAccount() {},
    doorToken: (h, c) => (h ? `door-${c}` : null),
    ...extra,
  })
  const field: Entrant[] = []
  const st = entryStore(mpComp, field)
  const go = (who: string, action: string, extra: Record<string, unknown> = {}, now = NOW, s = st) => runMatchPlayEntry({ token: `tok-${who}`, action, code: 'MATCH1', ...extra }, s, now)
  const s0 = await go('ross', 'state')
  ok(s0.status === 200 && s0.body.ok && s0.body.entrants.length === 0 && s0.door?.value === 'door-MATCH1', 'state: nobody in yet, and the members-only door opened for a member')
  const e1 = await go('ross', 'enter')
  ok(e1.status === 200 && e1.body.ok && e1.body.myPlayerId === 'p-r-ross' && field.length === 1, 'Ross enters: his player made from his place on the list')
  ok((await go('ross', 'enter')).status === 200 && field.length === 1, 'entering twice changes nothing')
  eq((await go('nope', 'enter')).status, 409, 'somebody not ticked as playing here is refused (D209)')
  eq((await go('stranger', 'state')).status, 403, 'somebody not on the list is refused')
  const ladies = entryStore({ ...mpComp, entry: { genders: ['F'] } }, [])
  const dl = await go('dave', 'enter', {}, NOW, ladies)
  ok(dl.status === 409 && !dl.body.ok && dl.body.error.length > 0, 'a ladies’ match play refuses Dave in a sentence')
  eq((await go('ann', 'enter', {}, NOW, ladies)).status, 200, '…and lets Ann in')
  eq((await go('dave', 'enter', {}, afterClose)).status, 409, 'after the close nobody enters themselves')
  eq((await go('dave', 'withdraw', { memberId: 'r-ross' })).status, 403, 'Dave cannot take Ross out')
  eq((await go('ross', 'withdraw', {}, afterClose)).status, 403, 'Ross cannot take himself out after the close…')
  eq((await go('off', 'withdraw', { memberId: 'r-ross' }, afterClose)).status, 403, '…nor can an Officer — taking somebody out is the Clubhouse’s alone (Ross, 18 Nov 2026)')
  field.splice(0, field.length)
  const full: Entrant[] = Array.from({ length: 15 }, (_, i) => ({ playerId: `p${i}`, rowId: `x${i}`, name: `P${i}` }))
  const race = entryStore(mpComp, full, {
    async insertPlayer(r) { full.push({ playerId: 'p-race', rowId: 'x-race', name: 'Racer' }, { playerId: `p-${r.club_member_id}`, rowId: r.club_member_id, name: r.name }); return `p-${r.club_member_id}` },
  })
  const late = await go('dave', 'enter', {}, NOW, race)
  ok(late.status === 409 && !late.body.ok && /just filled/.test(late.body.error) && !full.some(e => e.rowId === 'r-dave'),
    'the last place taken by somebody else a moment before: Dave’s entry is taken back')
  const logged2: ActivityEntry[] = []
  const office = entryStore(mpComp, [{ playerId: 'p-ann', rowId: 'r-ann', name: 'Ann' }], { async logActivity(e) { logged2.push(...e) }, async isStaff(u) { return u === 'stf' } })
  eq((await go('off', 'office.withdraw', { memberId: 'r-ann' }, NOW, office)).status, 403, 'the Clubhouse’s take-out is refused to an Officer without Clubhouse')
  listed.stf = listRow2('r-stf', 'Staff', 'stf', { clubhouse: true })
  const ow = await go('stf', 'office.withdraw', { memberId: 'r-ann' }, NOW, office)
  ok(ow.status === 200 && logged2.some(l => l.action === 'comp.withdraw' && l.memberName === 'Ann'), 'the Clubhouse takes an entry out, logged')
  const os = await go('stf', 'office.state', {}, NOW, entryStore(mpComp, [{ playerId: 'p-dave', rowId: 'r-dave', name: 'Dave' }], { async isStaff() { return false } }))
  ok(os.status === 200 && os.body.ok && os.body.entrants.map(e => e.name).join() === 'Dave', 'the Clubhouse reads who has entered')
  ok(drawDueNow(open, 'draw_pending', afterClose) && !drawDueNow(open, 'draw_pending', NOW) && !drawDueNow({ ...open, drawWhen: 'manual' }, 'draw_pending', afterClose),
    'the draw is due once entries close — never one the club makes by hand')

  section('Partners — a Fourball or Foursomes entry (stage 4)')
  {
    const four = readClubMatchPlay(matchPlaySeed({ ...form, format: 'foursomes', maxField: 16, deadlines: ['2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31'] }))!
    eq(matchPlayBoard({ format: 'foursomes', allowance: 50 }).teamFormat, 'foursomes', 'a foursomes draw is one ball a side on the card')
    eq(matchPlayBoard({ format: 'fourball', allowance: 90 }).teamFormat, undefined, '…a fourball, better ball as every pairs draw always was')
    eq(parseLeaderboards([matchPlayBoard({ format: 'foursomes', allowance: 50 })])[0]?.teamFormat, 'foursomes', 'foursomes survives being read back')
    const lone: PairEntry = { teamId: 't1', members: [{ playerId: 'p1', rowId: 'r1', name: 'Ross', addedBy: 'p1' }] }
    const whole: PairEntry = { teamId: 't2', members: [{ playerId: 'p2', rowId: 'r2', name: 'Dave', addedBy: 'p2' }, { playerId: 'p3', rowId: 'r3', name: 'Ann', addedBy: 'p2' }] }
    eq(joinIssue(lone, 'r9'), null, 'a pair one short may be joined')
    ok(!!joinIssue(whole, 'r9') && !!joinIssue(lone, 'r1') && !!joinIssue(null, 'r9'), '…never a whole pair, your own, or one taken out')
    ok(mayTakeOutOfPair(whole, 'p2', 'p3') && mayTakeOutOfPair(whole, 'p3', 'p3') && !mayTakeOutOfPair(whole, 'p3', 'p2'),
      'you take out yourself and a partner you put in — never the one who put you in')
    eq(drawnPairs([lone, whole]).map(p => p.teamId), ['t2'], 'a pair still looking for a partner is not drawn')
    eq(partnerName(whole, 'r3'), 'Dave', 'the partner sees who they are entered with')
    eq(enteredWithLine('Dave'), 'Entered with Dave', '"Entered with Dave"')
    eq(enteredWithLine(null), 'Entered — looking for a partner', '…or still looking')

    const pmp: MatchPlayComp = { ...mpComp, code: 'PAIRS1', setup: four, allowance: 50 }
    const pField: Entrant[] = []
    const pairsHeld: PairEntry[] = []
    listed.tom = listRow2('r-tom', 'Tom', 'tom')
    listed.nolink = listRow2('r-nolink', 'Una', '', { userId: null })
    const pst = entryStore(pmp, pField, {
      async pairs() { return pairsHeld.map(p => ({ ...p, members: p.members.filter(m => pField.some(f => f.playerId === m.playerId)) })) },
      async makePair(_t, _n, members) { const id = `team-${pairsHeld.length + 1}`; pairsHeld.push({ teamId: id, members: members.map(m => ({ playerId: m.playerId, rowId: pField.find(f => f.playerId === m.playerId)?.rowId ?? null, name: pField.find(f => f.playerId === m.playerId)?.name ?? '', addedBy: m.addedBy })) }); return id },
      async addToPair(_t, teamId, playerId, addedBy) { const p = pairsHeld.find(x => x.teamId === teamId)!; const f = pField.find(x => x.playerId === playerId)!; p.members.push({ playerId, rowId: f.rowId, name: f.name, addedBy }) },
      async renamePair() {},
      async deletePair(_t, teamId) { const i = pairsHeld.findIndex(p => p.teamId === teamId); if (i >= 0) pairsHeld.splice(i, 1) },
      async searchRows(_c, q) { return Object.values(listed).filter(r => r.name.toLowerCase().includes(q.toLowerCase())).map(r => ({ id: r.id, name: r.name, linked: !!r.userId, gender: r.gender, birthDate: r.birthDate, categoryId: r.categoryId })) },
    })
    const pgo = (who: string, action: string, extra: Record<string, unknown> = {}, now = NOW) => runMatchPlayEntry({ token: `tok-${who}`, action, code: 'PAIRS1', ...extra }, pst, now)
    const withDave = await pgo('ross', 'enter', { partnerRowId: 'r-dave' })
    ok(withDave.status === 200 && withDave.body.ok && withDave.body.partner === 'Dave' && withDave.body.partnerRowId === 'r-dave' && pairsHeld[0].members.length === 2,
      'Ross enters with Dave: one pair, Dave in it, Ross may take him out')
    const daveSees = await pgo('dave', 'state')
    ok(daveSees.status === 200 && daveSees.body.ok && daveSees.body.partner === 'Ross' && !daveSees.body.partnerRowId && daveSees.body.mySide === pairsHeld[0].teamId,
      'Dave sees "Entered with Ross" without accepting, and cannot take Ross out')
    eq((await pgo('ann', 'enter', { partnerRowId: 'r-dave' })).status, 409, 'Dave cannot be picked twice')
    eq((await pgo('ann', 'enter', { partnerRowId: 'r-nolink' })).status, 409, 'a partner with no Green Dot account cannot be picked')
    const alone = await pgo('ann', 'enter')
    ok(alone.status === 200 && alone.body.ok && alone.body.partner === null && pairsHeld.length === 2, 'Ann enters on her own, looking for a partner')
    const tomSees = await pgo('tom', 'state')
    ok(tomSees.status === 200 && tomSees.body.ok && tomSees.body.mayJoin === true && tomSees.body.pairs?.length === 2, 'Tom may join a pair still looking')
    eq((await pgo('tom', 'join', { teamId: pairsHeld[0].teamId })).status, 409, '…not a whole pair')
    const joined = await pgo('tom', 'join', { teamId: pairsHeld[1].teamId })
    ok(joined.status === 200 && joined.body.ok && joined.body.partner === 'Ann' && pairsHeld[1].members.length === 2, 'Tom joins Ann')
    const names2 = await pgo('ross', 'names', { q: 'a' })
    eq(names2.status, 200, 'names asks for two letters…')
    const found = await pgo('ross', 'names', { q: 'un' })
    ok(found.status === 200 && found.body.ok && !!found.body.names?.some(n => n.name === 'Una' && /Green Dot/.test(n.why ?? '')), '…and says why Una cannot be picked')
    eq((await pgo('ann', 'withdraw', { memberId: 'r-tom' })).status, 403, 'Ann cannot take out Tom, who put himself in')
    const daveOut = await pgo('ross', 'withdraw', { memberId: 'r-dave' })
    ok(daveOut.status === 200 && daveOut.body.ok && daveOut.body.partner === null && (await pst.pairs!('trip-mp'))[0].members.length === 1, 'Ross takes Dave out: Ross is looking again')
    const rossOut = await pgo('ross', 'withdraw')
    ok(rossOut.status === 200 && pairsHeld.length === 1, 'Ross takes himself out: the pair with nobody left goes')
    const tight: MatchPlayComp = { ...pmp, setup: { ...four, maxField: 16 } }
    const fullPairs: PairEntry[] = Array.from({ length: 16 }, (_, i) => ({ teamId: `f${i}`, members: [{ playerId: `fp${i}`, rowId: `fr${i}`, name: `F${i}`, addedBy: null }] }))
    const fullSt = entryStore(tight, [], { async pairs() { return fullPairs }, async makePair() { return 'x' }, async addToPair() {}, async renamePair() {}, async deletePair() {} })
    const fullAnswer = await runMatchPlayEntry({ token: 'tok-dave', action: 'state', code: 'PAIRS1' }, fullSt, NOW)
    ok(fullAnswer.status === 200 && fullAnswer.body.ok && /full/.test(fullAnswer.body.closed ?? '') && fullAnswer.body.mayJoin === true,
      'sixteen pairs of sixteen: no new pair, but joining one still looking takes no place')
  }

  {
    const door = read('app/club/[slug]/comp/[code]/CompDoor.tsx')
    ok(/matchPlay \? await askMatchPlay\('state'/.test(door) && /matchPlay=\{page\.kind === 'matchplay'\}/.test(read('app/club/[slug]/comp/[code]/CompShell.tsx')),
      'a match play’s members-only door is opened by its own route — the booking route knows no match play (it said “No such competition”)')
  }

  {
    const bar = read('app/club/[slug]/ClubTabBar.tsx')
    ok(/setAttribute\(CLUB_MEMBER_ATTR/.test(bar) && /data-no-club-bar/.test(bar),
      'inside an open competition the footer marks this phone a member, so Comps brings the club footer back at once even from a direct link (never on the members-only door)')
  }

  section('A qualifier’s field (stage 5, P8)')
  {
    const qm = readClubMatchPlay(matchPlaySeed({ ...qual, maxField: 16, deadlines: ['2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31'] }))!
    const finish = [{ playerId: 'a', rowId: 'ra' }, { playerId: 'b', rowId: 'rb' }, { playerId: 'c', rowId: null }, { playerId: 'd', rowId: 'rd' }, { playerId: 'e', rowId: 'ra' }, { playerId: 'f', rowId: 'rf' }]
    eq(qualifiedField(finish, new Set(['ra', 'rd', 'rf']), 2).map(p => p.playerId), ['a', 'd'],
      'the top finishers still on the list and playing here, in the Results’ own order — somebody off the list passed over')
    eq(qualifiedField(finish, new Set(['ra', 'rb', 'rd', 'rf']), 8).map(p => p.playerId), ['a', 'b', 'd', 'f'], '…a row once, and fewer than asked when fewer finished')
    eq(qualifiedDrawPlan(qm, ['a', 'd'], '2027-04-05'), { when: 'date', on: '2027-04-05', at: '00:00', seeding: 'order', order: ['a', 'd'] },
      'on the results: drawn at once, seeded by the finish')
    eq(qualifiedDrawPlan({ ...qm, seeding: 'random' }, ['a', 'd'], '2027-04-05'), { when: 'date', on: '2027-04-05', at: '00:00', seeding: 'random' }, '…or at random')
    eq(qualifiedDrawPlan({ ...qm, drawWhen: 'date', drawOn: { date: '2027-04-10', time: '19:00' } }, ['a'], '2027-04-05').on, '2027-04-10', 'on a date: that day')
    eq(qualifiedDrawPlan({ ...qm, drawWhen: 'manual' }, ['a'], '2027-04-05'), { when: 'later' }, 'by hand: the club makes it')
    eq(matchPlayPhase(qm, { drawn: false, won: false }, NOW), 'qualifier', 'waiting on the qualifier')
    eq(matchPlayPhase({ ...qm, fieldAt: NOW.toISOString() }, { drawn: false, won: false }, NOW), 'draw_pending', 'the field made: waiting on the draw')
    ok(!drawDueNow(qm, 'qualifier', NOW) && drawDueNow(qm, 'qualifier', NOW, { qualifierCertified: true }), 'due the moment the qualifier is certified')
    ok(/once its results are certified/.test(matchPlayLine(qm, 'qualifier', { qualifierName: 'Spring Medal', qualifierDate: '2027-04-04' })) &&
      matchPlayLine(qm, 'qualifier', { qualifierName: 'Spring Medal', qualifierDate: '2027-04-04' }).includes(clubEventDates('2027-04-04', '2027-04-04')),
      '"The top 16 from the Spring Medal, Sun 4 Apr — once its results are certified"')
    const certify = read('app/api/card/certify.ts')
    ok(/afterCertified\?\.|store\.afterCertified/.test(certify), 'certifying a competition asks its match plays to make their field')
    const due = read('app/api/match/dueDraws.ts')
    ok(/makeQualifiedField/.test(due) && /bracket_setup->club->>field', 'qualifier'/.test(due), 'the draw job makes a qualifier’s field first, and the night looks for one waiting')
  }

  section('The draw in the club area (stage 3, D266, D271)')
  const r16 = (id: string, a: string | null, b: string | null, winner: string | null = null, round = 1) =>
    ({ id, roundNumber: round, roundName: round === 1 ? 'Quarter-Final' : round === 2 ? 'Semi-Final' : 'Final', sideA: a, sideB: b, winner, result: winner ? '3&2' : null, deadline: round === 1 ? '2027-04-30' : round === 2 ? '2027-05-31' : '2027-06-30' })
  const names = { ross: 'Ross', dave: 'Dave', ann: 'Ann', sam: 'Sam' }
  eq(myClubMatch({ code: 'C', name: 'Singles' }, [r16('m1', 'ross', 'dave'), r16('m2', 'ann', 'sam')], 'ross', names),
    { code: 'C', name: 'Singles', matchId: 'm1', roundName: 'Quarter-Final', opponent: 'Dave', playBy: '2027-04-30', state: 'next', result: null }, 'your next match: the round, the opponent, the play-by date')
  eq(myClubMatch({ code: 'C', name: 'Singles' }, [r16('m1', 'ross', 'dave', 'ross'), r16('s1', 'ross', null, null, 2)], 'ross', names)?.opponent, null, 'through, the next opponent still to be decided')
  const beaten = myClubMatch({ code: 'C', name: 'Singles' }, [r16('m1', 'ross', 'dave', 'dave')], 'ross', names)
  ok(beaten?.state === 'out' && beaten.opponent === 'Dave' && beaten.result === '3&2', 'beaten: out, by whom and by how much')
  eq(myClubMatch({ code: 'C', name: 'Singles' }, [r16('m1', 'ann', 'sam')], 'ross', names), null, 'not in the draw: nothing')
  eq(roundInPlayLine([{ roundName: 'Quarter-Final', deadline: '2027-04-30', played: 1, total: 4 }], '2027-04-01'), `Quarter-Final · play by ${clubEventDates('2027-04-30', '2027-04-30')}`, 'the round in play and its date')
  ok(/was due/.test(roundInPlayLine([{ roundName: 'Quarter-Final', deadline: '2027-04-30', played: 1, total: 4 }], '2027-05-02')), '…past it, "was due"')
  const rounds = [{ roundNumber: 1, roundName: 'Quarter-Final', deadline: '2027-04-30', matches: [
    { id: 'a', sideA: 'ross', sideB: 'dave', aIsBye: false, bIsBye: false, winner: null },
    { id: 'b', sideA: 'ann', sideB: 'sam', aIsBye: false, bIsBye: false, winner: 'ann' },
    { id: 'c', sideA: 'ann', sideB: null, aIsBye: false, bIsBye: true, winner: null },
  ] }, { roundNumber: 2, roundName: 'Semi-Final', deadline: '2027-05-31', matches: [{ id: 'd', sideA: 'ann', sideB: null, aIsBye: false, bIsBye: false, winner: null }] }]
  const overdue = overdueMatches(rounds, names, '2027-05-10')
  eq(overdue.map(m => [m.id, m.daysOver, m.sideA, m.sideB]), [['a', 10, 'Ross', 'Dave']], 'overdue: a match with both sides and no result past its date — not a result, a bye, or a match still waiting on the one before')
  eq(filterOverdue(overdue, { round: null, minDays: 14 }).length, 0, 'the office filters by how overdue (D271)')
  eq(filterOverdue(overdue, { round: 2, minDays: 0 }).length, 0, '…and by round')
  const nOverdue = needsYou({ base: '/clubhouse/pints', counts: { joined: 0, invited: 0, notJoined: 0, noEmail: 0, removed: 0, officers: 0, clubhouse: 0, total: 0 } as unknown as ListCounts, phases: [], clubSlug: 'pints', officer: false, overdue: [{ code: 'MATCH1', name: 'Club Singles', count: 3 }] })
  ok(nOverdue.some(n => n.href === '/clubhouse/pints/events/MATCH1' && /3 matches are past the play-by date\. An Officer decides them\./.test(n.line)), 'Needs you: a match play’s overdue matches, on the Clubhouse’s own page (D271)')
}

async function copyTests() {
  section('Copy to another date, Repeat weekly — the Clubhouse’s (stage (k2); Ross, 17 Nov 2026)')
  const stored = { name: 'Monthly Medal', date: '2026-11-21', courseId: 'c1', board: { scoring: 'strokes', handicapAllowance: 95 }, membersOnly: true,
    teeSheet: compTeeRules({ batches: [{ start: '08:00', interval: 10, perTime: 4, times: 12 }], opens: { daysBefore: 7, time: '20:00' } }) }
  const copies: { date: string }[] = []
  const pints = { id: 'c1', slug: 'pints', name: 'Pints', verifiedAt: NOW.toISOString(), refusedAt: null }
  const rossRow = (officer: boolean, clubhouse: boolean): MemberRecord => ({ id: 'row', clubId: 'c1', name: 'Ross', memberNumber: null, guiNumber: null, email: null, role: 'member', userId: 'ross', removedAt: null, onBoards: true, playsHere: true, officer, clubhouse })
  const compStore2 = (officer: boolean, clubhouse: boolean, extra: Partial<CompetitionStore> = {}): CompetitionStore => ({
    async userFromToken(t) { return t === 'tok-ross' ? member('ross', 'ross@x.ie') : null },
    async clubsOf() { return [{ club: pints, row: rossRow(officer, clubhouse) }] },
    async club(id) { return id === 'c1' ? pints : null },
    async rowOf() { return rossRow(officer, clubhouse) },
    async isStaff() { return false },
    create: {} as CreateStore,
    async insertItem() { return 'item' },
    async insertRound(r) { copies.push({ date: String(r.scheduled_date) }) },
    async deleteTrip() {},
    newCode: () => `C${copies.length}XXXX`.slice(0, 6),
    newId: () => `id-${copies.length}`,
    async compSource(code) { return code === 'MEDAL1' ? { clubId: 'c1', ...stored } : null },
    ...extra,
  })
  const officerOnly = await runCopyCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', dates: ['2026-11-28'] }, compStore2(true, false), NOW)
  eq(officerOnly.status, 403, 'an Officer without Clubhouse copies nothing here — Clubhouse is its own level (Ross, 17 Nov 2026)')
  const past = await runCopyCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', dates: ['2026-01-01'] }, compStore2(false, true), NOW)
  ok(past.status === 200 && past.body.ok && past.body.made.length === 0 && /from today/.test(past.body.refused[0]?.why ?? ''), 'Clubhouse copies; a past date is refused by name')
  eq((await runCopyCompetition({ token: 'tok-ross', clubId: 'c1', code: 'NOPE01', dates: ['2026-11-28'] }, compStore2(false, true), NOW)).status, 404, 'a competition not of this club: not found')

  section('Stage c1, M7: presets (lib/clubPresets.ts)')
  const plan: TeePlan = { batches: [{ start: { kind: 'sunrise' }, end: { kind: 'sunset', minus: 270 }, interval: 10, perTime: 4 }], opens: { daysBefore: 7, time: '20:00' } }
  const r1 = resolvePlan(plan, { sunrise: '08:38', sunset: '16:08' })
  eq(r1.ok && r1.batches, [{ start: '08:40', interval: 10, perTime: 4, times: 18 }], 'sunrise to 4h30 before sunset in midwinter: 08:40 to 11:30 at ten (sunset 16:08)')
  const r2 = resolvePlan(plan, { sunrise: '08:38', sunset: '12:30' })
  ok(!r2.ok && /no tee times between sunrise/.test(r2.why), 'a day with no time between them makes no sheet, and says why')
  const split: TeePlan = { batches: [{ start: { kind: 'clock', at: '08:00' }, end: { kind: 'clock', at: '12:50' }, interval: 10, perTime: 3 }, { start: { kind: 'clock', at: '13:00' }, end: { kind: 'count', n: 8 }, interval: 15, perTime: 4 }], opens: null }
  const r3 = resolvePlan(split, { sunrise: null, sunset: null })
  eq(r3.ok && r3.batches.map(b => [b.start, b.times, b.perTime]), [['08:00', 30, 3], ['13:00', 8, 4]], 'threes at ten until one, then fours at fifteen — no sun needed')
  ok(!!planIssue({ ...split, batches: [split.batches[0], { ...split.batches[1], start: { kind: 'sunrise' } }] }), 'only the first run can start at sunrise')
  const p0 = readPreset({ name: 'Saturday men’s comp', scoring: 'stableford', allowance: 95, plan, entry: { genders: ['M'] } })
  eq([p0.code, presetIssue(p0, [])], ['SMC', null], 'a preset’s code is made from its name; a whole preset passes')
  ok(!!presetIssue(p0, [{ code: 'SMC', name: 'Other' }]), 'a code another preset uses is refused')
  const made = formFromPreset(p0, { date: '2026-12-19', courseId: 'c1', sun: { sunrise: '08:38', sunset: '16:08' } })
  ok(made.ok && made.form.entry?.genders?.[0] === 'M' && made.form.batches[0].start === '08:40' && made.form.opens?.daysBefore === 7,
    'a competition from a preset: its entry rules, tee times for that day’s sun and booking opening copied in')
  const laid = applyPreset({ name: 'Christmas Hamper', date: '', courseId: 'c1', scoring: 'strokes', allowance: 100, watch: 'members', batches: [{ start: '09:00', interval: 10, perTime: 4, times: 4 }], opens: null, entry: null }, p0, null)
  ok(laid.form.name === 'Christmas Hamper' && laid.form.scoring === 'stableford' && laid.form.batches[0].start === '09:00' && laid.why === null,
    'a preset laid on before the day is chosen keeps the name typed and waits for the day for its times')

  section('Stage c1, M11: a tee sheet changed after the fact (planSheetChange)')
  const was = compTeeRules({ batches: [{ start: '08:00', interval: 10, perTime: 4, times: 6 }], opens: null })
  const bk = (name: string, slot: number, refused: string | null = null): SheetBooking => ({ playerId: `p-${name}`, name, slot, refused })
  const later = compTeeRules({ batches: [{ start: '07:30', interval: 10, perTime: 4, times: 9 }], opens: null })
  const kept = planSheetChange({ before: was, after: later, bookings: [bk('Ann', 0), bk('Bob', 2)] })
  eq(kept.ok && kept.moves, [{ playerId: 'p-Ann', slot: 3 }, { playerId: 'p-Bob', slot: 5 }], 'three earlier times added: everybody keeps their clock, their slot number follows')
  const gone = planSheetChange({ before: was, after: compTeeRules({ batches: [{ start: '08:00', interval: 15, perTime: 4, times: 6 }], opens: null }), bookings: [bk('Ann', 0), bk('Bob', 1)] })
  ok(!gone.ok && gone.problems.length === 1 && gone.problems[0].name === 'Bob' && /8:10 am/.test(gone.problems[0].why), 'a time that has gone: refused, the member named')
  const smaller = planSheetChange({ before: was, after: compTeeRules({ batches: [{ start: '08:00', interval: 10, perTime: 3, times: 6 }], opens: null }), bookings: ['A', 'B', 'C', 'D'].map(n => bk(n, 0)) })
  ok(!smaller.ok && smaller.problems.length === 4 && /now takes 3, and 4 are booked/.test(smaller.problems[0].why), 'a group made smaller than its booking: refused, each named')
  const out = planSheetChange({ before: was, after: was, bookings: [bk('Ann', 0, 'Ann is not in a ladies’ competition.')] })
  ok(!out.ok && out.problems[0].why === 'Ann is not in a ladies’ competition.', 'a member who may no longer enter: refused with why')

  section('Stage c1, M10–M11: competitions made and changed in the Clubhouse (/api/club/competition)')
  eq((await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: {}, from: 'clubhouse' }, compStore2(true, false), NOW)).status, 403,
    'New competition in the Clubhouse: refused to an Officer without Clubhouse')
  eq((await runNewCompetition({ token: 'tok-ross', clubId: 'c1', form: {}, from: 'clubhouse' }, compStore2(false, true), NOW)).status, 400,
    '…let through to Clubhouse, which then has to fill it in')
  const now0: CompNow = {
    tripId: 't1', roundId: 'r1', itemId: 'i1', clubId: 'c1', code: 'MEDAL1', name: 'Monthly Medal', date: '2026-11-21', courseId: 'c1', rules: was,
    leaderboards: [compBoard('r1', { scoring: 'stableford', allowance: 95 })], entry: null, membersOnly: true, started: false, certified: false,
    bookings: [{ playerId: 'p-ann', rowId: 'row-ann', name: 'Ann Byrne', slot: 1 }, { playerId: 'p-bob', rowId: 'row-bob', name: 'Bob Kenny', slot: 1 }],
  }
  const rowsOf: MemberRecord[] = [
    { ...rossRow(false, false), id: 'row-ann', name: 'Ann Byrne', userId: 'ann', gender: 'F' },
    { ...rossRow(false, false), id: 'row-bob', name: 'Bob Kenny', userId: 'bob', gender: 'M' },
  ]
  let applied: CompChange | null = null
  const editStore = (over: Partial<CompNow> = {}, anyway: string[] = []) => compStore2(false, true, {
    async compNow(code) { return code === 'MEDAL1' ? { ...now0, ...over } : null },
    async rowsByIds() { return rowsOf },
    async ageDate() { return '01-01' },
    async overrides() { return new Set(anyway) },
    async applyChange(_c, ch) { applied = ch },
  })
  const form0 = compFormFrom({ name: 'Monthly Medal', date: '2026-11-21', courseId: 'c1', board: { scoring: 'stableford', handicapAllowance: 95 }, teeSheet: was, membersOnly: true })!
  const earlier = { ...form0, batches: [{ start: '07:40', interval: 10, perTime: 4, times: 8 }] }
  const ch1 = await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: earlier }, editStore(), NOW)
  ok(ch1.status === 200 && JSON.stringify(applied!.moves) === JSON.stringify([{ playerId: 'p-ann', slot: 3 }, { playerId: 'p-bob', slot: 3 }]),
    'two earlier times: the change is made and both bookings stay at 8:10')
  applied = null
  const ladies = { ...form0, entry: { genders: ['F' as const] } }
  const ch2 = await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: ladies }, editStore(), NOW)
  ok(ch2.status === 409 && !ch2.body.ok && ch2.body.problems?.length === 1 && ch2.body.problems[0].name === 'Bob Kenny' && applied === null,
    'made ladies’ only with a man booked: refused, Bob named, nothing written')
  eq((await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: ladies }, editStore({}, ['row-bob']), NOW)).status, 200,
    '…but kept when an Officer booked him anyway (D231)')
  eq((await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: earlier }, editStore({ started: true }), NOW)).status, 409, 'never once a card has started')
  eq((await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: earlier }, compStore2(true, false, { async compNow() { return now0 } }), NOW)).status, 403,
    'an Officer without Clubhouse changes nothing here')
  const read1 = await runReadCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1' }, editStore())
  ok(read1.status === 200 && read1.body.ok && read1.body.booked === 2 && read1.body.form.batches[0].times === 6, 'a competition read back into the panel, with how many are booked')
  // D274: Edit changes who can watch too — it used to be forced back to what was set when made.
  applied = null
  const guests = await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: { ...form0, watch: 'guests' } }, editStore(), NOW)
  ok(guests.status === 200 && (applied as CompChange | null)?.membersOnly === false, 'Edit: a members-only competition opened to guests')
  applied = null
  await runChangeCompetition({ token: 'tok-ross', clubId: 'c1', code: 'MEDAL1', form: form0 }, editStore({ membersOnly: false }), NOW)
  ok((applied as CompChange | null)?.membersOnly === true, 'Edit: a guests-can-watch competition made members only')
  const events = fs.readFileSync(path.join(__dirname, '../app/clubhouse/[slug]/events/Events.tsx'), 'utf8')
  ok(!/>Change</.test(events) && !/>Copy</.test(events) && (events.match(/>Edit</g) ?? []).length === 2, 'Events: one Edit a row, wide and narrow — no Change, no Copy')
  const panel = fs.readFileSync(path.join(__dirname, '../app/clubhouse/[slug]/events/CompPanel.tsx'), 'utf8')
  const footer = panel.slice(panel.indexOf('</fieldset>'))
  ok(/onClick=\{onCopy\}[^>]*secondary[^>]*>Copy</.test(footer), 'Edit: Copy is the footer’s secondary button, outside the locked fieldset')
  ok(panel.includes('A card has started, so the competition can’t be changed.') && panel.includes('The results are certified, so nothing can change.'), 'Edit: a locked competition still says why')
  ok(!/\{!code && \(\s*<div>\s*<p className=\{FIELD_LABEL\}>Who can watch/.test(panel), 'Edit: who can watch is shown when editing')
}

function membershipRuleTests() {
  section('Stage (m): memberships, gender and age (lib/clubMembership.ts)')
  eq(['M', 'male', 'Female', 'f', 'Lady', 'n/a', 'N/A', '', 'Q'].map(readGender), ['M', 'M', 'F', 'F', 'F', null, null, undefined, 'bad'],
    'gender read from a cell: Male, Female, N/A clears, empty changes nothing, anything else refused')
  const today = '2026-11-17'
  const b = (raw: string) => { const r = readBirthDate(raw, today); return r.ok ? r.value : 'bad' }
  eq([b('03/04/1980'), b('3/4/1980'), b('1980-04-03'), b('n/a'), b(''), b('03/04/80'), b('31/02/1980'), b('01/01/2030'), b('01/01/1900')],
    ['1980-04-03', '1980-04-03', '1980-04-03', null, undefined, 'bad', 'bad', 'bad', 'bad'],
    'a date of birth: day first, a four-digit year, N/A clears, never in the future or 110 years gone')
  eq([readAgeDate(null), readAgeDate('02-01'), readAgeDate('13-01'), readAgeDate('xx')], ['01-01', '02-01', '01-01', '01-01'], 'the age date: 1 January unless the club says otherwise')
  eq([ageCountedOn('2026-11-17', '01-01'), ageCountedOn('2026-01-15', '02-01'), ageCountedOn('2026-02-01', '02-01')], ['2026-01-01', '2025-02-01', '2026-02-01'],
    'ages count on the most recent age date on or before the day')
  eq([ageOn('2008-06-10', '2026-01-01'), ageOn('2008-01-01', '2026-01-01'), ageOn('2008-01-02', '2026-01-01')], [17, 18, 17], 'age on a day')
  eq(birthRange('2026-01-01', 18, 25), { latest: '2008-01-01', earliest: '2000-01-01' }, 'an age band as a range of birth dates, for the filter')
  const six: Category = { id: 'six', name: '6 Day', code: '6DAY', days: [0, 1, 2, 3, 4, 6] }
  const full: Category = { id: 'full', name: 'Full', code: 'FULL', days: [0, 1, 2, 3, 4, 5, 6] }
  const junior: Category = { id: 'jun', name: 'Junior', code: 'JUN', days: [0, 1, 2, 3, 4, 5, 6] }
  const cats = [full, six, junior]
  ok(playsOn(six, '2026-11-20') && !playsOn(six, '2026-11-21'), 'a 6-day member plays Friday, not Saturday')
  eq([daysLine([0, 1, 2, 3, 4, 5, 6]), daysLine([0, 1, 2, 3, 4, 6]), daysLine([0, 1, 2, 3, 4])], ['Every day', '6 days: not Saturday', '5 days: not Saturday or Sunday'], 'the days as words')
  eq([categoryCodeFrom('6 Day Ladies'), categoryCodeFrom('Full'), uniqueCode('FULL', ['FULL', 'FULL2'])], ['6DAYLADIES', 'FULL', 'FULL3'], 'a code for the spreadsheet, unique in the club')
  ok(categoryIssue({ name: 'Full', code: 'F2', days: [0] }, cats) !== null && categoryIssue({ name: 'Senior', code: 'FULL', days: [0] }, cats) !== null
    && categoryIssue({ name: 'Senior', code: 'SEN', days: [] }, cats) !== null && categoryIssue({ name: 'Senior', code: 'SEN', days: [0] }, cats) === null,
    'a membership: a name and a code of its own, at least one day')
  eq(readEntryRules({ genders: ['M', 'F'], categories: [], minAge: 'x' }), null, 'both genders ticked is no filter; nothing set is no rules')
  eq(readEntryRules({ genders: ['F', 'F'], categories: ['six', 'six'], minAge: 50 }), { genders: ['F'], categories: ['six'], minAge: 50 }, 'rules cleaned')
  eq(entryRulesIssue({ categories: ['gone'] }, ['full']) !== null && entryRulesIssue({ minAge: 30, maxAge: 20 }, []) !== null, true, 'a membership not the club’s, or a band upside down, refused')
  eq([ageBandLine(50), ageBandLine(undefined, 17), ageBandLine(18, 25)], ['Aged 50 and over', 'Under 18', 'Aged 18 to 25'], 'an age band as words')
  eq(entryLine({ genders: ['F'], categories: ['full', 'six'], minAge: 50 }, cats), 'Ladies’ · Full and 6 Day members · Aged 50 and over', 'who may enter, said short')
  const saturday = '2026-11-21'
  const man = { gender: 'M' as Gender, birthDate: '1980-04-03', categoryId: 'full' }
  const woman6 = { gender: 'F' as Gender, birthDate: '1975-01-01', categoryId: 'six' }
  const enter = (rules: Parameters<typeof readEntryRules>[0], person: typeof man, day = saturday) =>
    entryRefusal({ rules: readEntryRules(rules), person, category: cats.find(c => c.id === person.categoryId) ?? null, day, ageDate: '01-01', categories: cats })?.code ?? null
  eq(enter({ genders: ['M'] }, man), null, 'a full man enters the men’s Saturday competition')
  eq(enter({ genders: ['M'] }, woman6), 'gender', '…a woman does not')
  eq(enter({ genders: ['F'] }, woman6), 'day', 'a 6-day lady cannot play a ladies’ competition on Saturday')
  eq(enter({ genders: ['F'] }, woman6, '2026-11-20'), null, '…but can on Friday')
  eq(enter({ genders: ['F'], categories: ['six'] }, woman6), null, 'a membership ticked on the competition enters whatever its days say (Ross)')
  eq(enter({ categories: ['jun'] }, man), 'category', 'a full man may not book a junior competition, even on Saturday')
  eq(enter({ genders: ['M'] }, { ...man, gender: null as unknown as Gender }), 'no_gender', 'no gender recorded blocks a men’s competition')
  eq(enter(null, { ...man, categoryId: null as unknown as string }), null, 'no membership plays any day')
  eq(enter({ minAge: 50 }, man), 'age', 'a 46-year-old is not a senior')
  eq(enter({ minAge: 50 }, { ...man, birthDate: null as unknown as string }), 'no_birth', '…and no date of birth blocks an age band')
  eq(enter({ minAge: 50 }, woman6, '2026-11-20'), null, '…a 51-year-old is')
  ok(/ask the club/.test(refusalWords({ code: 'no_gender' })) && /Saturday isn’t one of Dave’s/.test(refusalWords({ code: 'day', day: 'Saturday' }, 'Dave')),
    'refusals in a sentence, to the person or about them')
  const x = (row: Record<string, string>) => resolveExtras(row, cats, today)
  eq(x({ gender: 'Female', birthDate: '01/02/1990', category: '6day' }), { ok: true, extras: { gender: 'F', birthDate: '1990-02-01', categoryId: 'six' } }, 'a pasted row’s three cells read against the club')
  eq(x({ category: 'N/A' }), { ok: true, extras: { categoryId: null } }, '…N/A clears a membership')
  ok(!x({ category: 'GOLD' }).ok && !x({ gender: 'Q' }).ok && !x({ birthDate: '99/99/1990' }).ok, '…an unknown code, gender or date refuses the row, said before saving')
  const parsed = parseMemberList('Name,Gender,DOB,Membership type\r\nAnn Byrne,F,01/02/1990,6DAY\r\n')
  ok(parsed.rows[0]?.gender === 'F' && parsed.rows[0]?.birthDate === '01/02/1990' && parsed.rows[0]?.category === '6DAY', 'a list’s Gender, DOB and Membership type columns are read')
}

async function membershipRouteTests() {
  section('Stage (m): memberships on the server (/api/club)')
  const s = new Stand()
  const ross = member('ross', 'ross@x.ie'), ann = member('ann', 'ann@x.ie')
  ;[ross, ann].forEach(u => s.add(u))
  const ask = (tok: string, action: string, body: Record<string, unknown> = {}) => runClub({ token: tok, action, address: 'a', ...body }, s, s.clock)
  const made = await setUpClub(s, 'tok-ross', { name: 'Pints Golf Club', yourName: 'Ross' })
  const clubId = made.status === 200 ? made.body.club!.id : ''
  s.clubs.set(clubId, { ...s.clubs.get(clubId)!, verifiedAt: NOW.toISOString() })
  const sixId = await s.saveCategory(clubId, { name: '6 Day', code: '6DAY', days: [0, 1, 2, 3, 4, 6], position: 0 })
  const r1 = await ask('tok-ross', 'add', { clubId, rows: [{ name: 'Ann Byrne', email: 'ann@x.ie', gender: 'F', birthDate: '01/02/1970', category: '6day' }, { name: 'Bad Row', gender: 'Q' }] })
  const annRow = [...s.list.values()].find(r => r.name === 'Ann Byrne')!
  ok(r1.status === 200 && annRow.gender === 'F' && annRow.birthDate === '1970-02-01' && annRow.categoryId === sixId, 'a pasted row brings its gender, date of birth and membership')
  ok(r1.status === 200 && (r1.body.skipped ?? []).some((k: { why: string }) => /isn’t a gender/.test(k.why)), '…a row with a bad cell is set aside with why')
  // Linking: the account has nothing yet, so the row's details fill it.
  s.list.set(annRow.id, { ...annRow, userId: 'ann' })
  await linkDetails(s, 'ann', s.list.get(annRow.id)!)
  eq(s.details.get('ann'), { gender: 'F', birthDate: '1970-02-01' }, 'linking: the row’s details fill an empty account')
  // A second club's row for Ann carries the same value once changed (one value everywhere).
  const otherClub = await setUpClub(s, 'tok-ross', { name: 'Lahinch', yourName: 'Ross' })
  const otherId = otherClub.status === 200 ? otherClub.body.club!.id : ''
  await ask('tok-ross', 'add', { clubId: otherId, rows: [{ name: 'Ann Byrne', email: 'ann@x.ie' }] })
  const annThere = [...s.list.values()].find(r => r.clubId === otherId && r.name === 'Ann Byrne')!
  s.list.set(annThere.id, { ...annThere, userId: 'ann' })
  const upd = await ask('tok-ross', 'update', { clubId, memberId: annRow.id, birthDate: '02/02/1970' })
  ok(upd.status === 200 && s.details.get('ann')?.birthDate === '1970-02-02' && s.list.get(annThere.id)?.birthDate === '1970-02-02',
    'a club changes a linked person’s date of birth: the account and every list row of theirs carry it')
  eq((await ask('tok-ross', 'update', { clubId, memberId: annRow.id, birthDate: '2099-01-01' })).status, 400, 'a date of birth in the future is refused')
  eq((await ask('tok-ann', 'update', { clubId, memberId: annRow.id, gender: 'M' })).status, 403, 'a member cannot change their own gender — the club sets it')
}

// ─── Stage c1: the club's own events, who sees them (M1–M6) ───────────

async function calendarTests() {
  section('Stage c1: the club’s own events (lib/clubEvents.ts)')
  const base = { title: 'AGM', type: 'BUSINESS', startsOn: '2026-12-02', startTime: '20:00', endTime: '22:00', visibility: 'office' }
  eq(noteIssue(readClubNote(base)), null, 'an AGM, Office only: kept')
  eq(noteIssue(readClubNote({ ...base, type: 'GOLF' })), 'Golf events are always shown to members — anything that touches the golf is.', 'Office only is never for golf (Ross, 17 Nov 2026)')
  ok(!!noteIssue(readClubNote({ ...base, type: 'COURSE' })), '…nor a course closure')
  ok(!!noteIssue(readClubNote({ ...base, endTime: '19:00' })) && !!noteIssue(readClubNote({ ...base, startsOn: '2026-02-30' })) && !!noteIssue(readClubNote({ ...base, title: '' })),
    'an end before the start, a day that does not exist, no title: each said')
  eq(readHiddenTypes(['SOCIAL', 'GOLF', 'COURSE', 'X']), ['SOCIAL'], 'a club can never hide golf from its members')
  eq(readMemberHidden(['COMP', 'SOCIAL', 'GOLF']), ['GOLF', 'SOCIAL'], 'a member can turn off anything but competitions')
  const social: Pick<ClubNote, 'type' | 'visibility'> = { type: 'SOCIAL', visibility: 'members' }
  ok(memberSees(social, []) && !memberSees({ ...social, visibility: 'office' }, []) && !memberSees(social, ['SOCIAL']) && !memberSees(social, [], ['SOCIAL']),
    'a member sees a Members event of a type the club shows and they want — never an Office only one')
  eq(noteTimeLine({ startTime: '19:30', endTime: '22:00' }), '7:30 pm to 10:00 pm', 'the times as the sheet says them')
  eq(seasonType({ kind: 'trip', competition: null }), 'GOLF', 'an event under the club that is not a competition reads as Golf')
  eq(EVENT_TYPES.map(t => t.code), ['COMP', 'GOLF', 'SOCIAL', 'BUSINESS', 'SPORT', 'COURSE', 'MISC'], 'the seven types, in the calendar file’s codes')

  section('Stage c1: who sees what, decided on the server (M3, M4)')
  const s = new Stand()
  const ross = member('ross', 'ross@x.ie'), ann = member('ann', 'ann@x.ie'), ollie = member('ollie', 'ollie@x.ie')
  ;[ross, ann, ollie].forEach(u => s.add(u))
  const ask = (tok: string, action: string, body: Record<string, unknown> = {}) => runClub({ token: tok, action, address: 'a', ...body }, s, s.clock)
  const made = await setUpClub(s, 'tok-ross', { name: 'Pints Golf Club', yourName: 'Ross' })
  const clubId = made.status === 200 ? made.body.club!.id : ''
  s.clubs.set(clubId, { ...s.clubs.get(clubId)!, verifiedAt: NOW.toISOString() })
  await ask('tok-ross', 'add', { clubId, rows: [{ name: 'Ann Byrne', email: 'ann@x.ie' }, { name: 'Ollie Officer', email: 'ollie@x.ie' }] })
  for (const r of s.list.values()) {
    if (r.name === 'Ann Byrne') s.list.set(r.id, { ...r, userId: 'ann' })
    if (r.name === 'Ollie Officer') s.list.set(r.id, { ...r, userId: 'ollie', officer: true, clubhouse: false })
  }
  const agm = await ask('tok-ross', 'event.save', { clubId, event: { title: 'AGM', type: 'BUSINESS', startsOn: '2026-12-02', visibility: 'office' } })
  const quiz = await ask('tok-ross', 'event.save', { clubId, event: { title: 'Quiz night', type: 'SOCIAL', startsOn: '2026-12-04', startTime: '20:00' } })
  const shut = await ask('tok-ross', 'event.save', { clubId, event: { title: 'Course closed', type: 'COURSE', startsOn: '2026-12-08', visibility: 'office' } })
  ok(agm.status === 200 && quiz.status === 200, 'Clubhouse adds an AGM (Office only) and a quiz night')
  eq(shut.status, 400, '…and is refused a course closure kept from the members')
  eq((await ask('tok-ollie', 'event.save', { clubId, event: { title: 'Mine', type: 'SOCIAL', startsOn: '2026-12-09' } })).status, 403, 'an Officer without Clubhouse keeps no calendar here (Ross: Clubhouse is its own level)')
  const seasonOf = await ask('tok-ross', 'season', { clubId })
  ok(seasonOf.status === 200 && (seasonOf.body.calendar ?? []).some(e => e.name === 'AGM' && e.note?.visibility === 'office'), 'the AGM is on the Clubhouse’s Events and Calendar')
  eq((await ask('tok-ollie', 'season', { clubId })).status, 403, 'an Officer without Clubhouse gets no season — and so no Office only event')
  const homeOllie = await ask('tok-ollie', 'home', { slug: 'pints-golf-club' })
  const homeAnn = await ask('tok-ann', 'home', { slug: 'pints-golf-club' })
  const titles = (o: Awaited<ReturnType<typeof ask>>) => (o.status === 200 ? (o.body.notes ?? []).map(n => n.title) : ['refused'])
  eq(titles(homeOllie), ['Quiz night'], 'the members home for an Officer without Clubhouse: the quiz, never the AGM (M3)')
  eq(titles(homeAnn), ['Quiz night'], '…the same for any member')
  ok(!JSON.stringify(homeOllie.body).includes('AGM'), '…not a word of it anywhere in the answer')
  eq((await ask('tok-ross', 'event-types', { clubId, hidden: ['GOLF'] })).status, 400, 'a club cannot stop showing golf to its members')
  eq((await ask('tok-ross', 'event-types', { clubId, hidden: ['SOCIAL'] })).status, 200, 'Club settings: Social not shown to members (M4)')
  eq(titles(await ask('tok-ann', 'home', { slug: 'pints-golf-club' })), [], '…and the quiz leaves the members home')
  await ask('tok-ross', 'event-types', { clubId, hidden: [] })
  s.memberHiddenOf.set('ann', ['SOCIAL'])
  eq(titles(await ask('tok-ann', 'home', { slug: 'pints-golf-club' })), [], 'a member who turned Social off does not see it (M5)…')
  eq(titles(await ask('tok-ollie', 'home', { slug: 'pints-golf-club' })), ['Quiz night'], '…while everybody else still does')
  const quizId = quiz.status === 200 ? quiz.body.noteId! : ''
  eq((await ask('tok-ross', 'event.delete', { clubId, id: quizId })).status, 200, 'an event deleted from its panel')
  ok(s.activity.some(a => a.action === 'event.add') && s.activity.some(a => a.action === 'event.delete') && s.activity.some(a => a.action === 'events.shown'), 'each change on the club’s activity log')
  // D285 (Ross, 22 Nov 2026): an event that opens outside the members app, unlinked and linked.
  s.events.set(clubId, [
    { code: 'OUT001', name: 'Captain’s Day', kind: 'tournament', startDate: '2026-11-20', endDate: '2026-11-20', access: 'admins' },
    { code: 'COMP01', name: 'Saturday Stableford', kind: 'tournament', startDate: '2026-11-21', endDate: '2026-11-21', access: 'admins', competition: { phase: 'announced', membersOnly: true } },
  ])
  const codesOf = (o: Awaited<ReturnType<typeof ask>>) => (o.status === 200 ? (o.body.events ?? []).map(e => e.code) : ['refused'])
  eq(codesOf(await ask('tok-ann', 'home', { slug: 'pints-golf-club' })).sort(), ['COMP01', 'OUT001'], 'linked, a standalone event is in the members’ home')
  eq((await ask('tok-ross', 'event.link', { clubId, code: 'OUT001', linked: false })).status, 200, 'the Clubhouse unlinks it')
  eq(codesOf(await ask('tok-ann', 'home', { slug: 'pints-golf-club' })), ['COMP01'], '…and it leaves every member’s list')
  const seasonU = await ask('tok-ross', 'season', { clubId })
  ok(seasonU.status === 200 && (seasonU.body.calendar ?? []).some(e => e.code === 'OUT001' && e.unlinked === true), '…while the Clubhouse still reads it, marked unlinked')
  ok(s.activity.some(a => a.action === 'event.unlink'), '…on the activity log')
  eq((await ask('tok-ollie', 'event.link', { clubId, code: 'OUT001', linked: true })).status, 403, 'an Officer without Clubhouse cannot link or unlink')
  eq((await ask('tok-ross', 'event.link', { clubId, code: 'COMP01', linked: false })).status, 400, 'a competition is the club’s and never unlinks')
  eq((await ask('tok-ross', 'event.link', { clubId, code: 'NOPE99', linked: false })).status, 404, 'an event that is not the club’s is refused')
  eq((await ask('tok-ross', 'event.link', { clubId, code: 'OUT001', linked: true })).status, 200, 'a tap links it again')
  eq(codesOf(await ask('tok-ann', 'home', { slug: 'pints-golf-club' })).sort(), ['COMP01', 'OUT001'], '…and members see it again')
  ok(s.activity.some(a => a.action === 'event.link'), '…on the log too')
  const accountSrc = read('app/api/account/account.ts')
  ok(/input\.action === 'event-types'/.test(accountSrc) && /readMemberHidden\(input\.hidden\)/.test(accountSrc), '“From my clubs, show me” is kept on the account')
  ok(read('app/club/[slug]/ClubView.tsx').includes('<ClubEventTypesCard') && read('app/home/HomeScreen.tsx').includes('<ClubEventTypesCard'), '…on the club’s Club tab and Me')
  ok(read('next.config.ts').includes('/clubhouse/:slug/competitions'), 'the Clubhouse’s old Competitions address goes on to Events')
}


// ─── Stage c2: a calendar imported (M12–M16) ─────────────────────────

async function importTests() {
  section('Stage c2: the calendar file (lib/calendarImport.ts)')
  const ctx: CalendarContext = {
    clubName: 'Pints Golf Club', year: 2027, homeCourse: 'Pints — Old Course',
    memberships: [{ id: 'cat-full', code: 'FULL', name: 'Full', days: [0, 1, 2, 3, 4, 5, 6] }, { id: 'cat-six', code: '6DAY', name: '6 Day', days: [0, 1, 2, 3, 4, 6] }],
    presets: [{ code: 'SMC', name: 'Saturday men’s comp', usedFor: 'Saturday singles', isDefault: true, plan: { batches: [{ start: { kind: 'clock', at: '08:00' }, end: { kind: 'count', n: 12 }, interval: 10, perTime: 4 }], opens: { daysBefore: 7, time: '20:00' } } }],
  }
  const prompt = calendarPrompt(ctx)
  ok(prompt.includes(CALENDAR_FORMAT) && prompt.includes(CALENDAR_COLUMNS.join(',')) && prompt.includes('- FULL: Full (plays every day)') && prompt.includes('- 6DAY: 6 Day (plays Monday, Tuesday, Wednesday, Thursday, Friday, Sunday)'),
    'the prompt is written from the club: the stamp, the header, its memberships and their days')
  ok(prompt.includes('- SMC: Saturday men’s comp (the default) — used for Saturday singles') && prompt.includes('Home course: Pints — Old Course') && prompt.includes('Season: 2027'),
    '…its presets with what they are for, its home course, the season')
  ok(/Answer with the CSV only, in one code block/.test(prompt) && /Never invent a membership, a preset or a date/.test(prompt) && /COMP only for singles Stableford or strokeplay/.test(prompt)
    && /Blank means the preset's memberships, or with none, whoever's membership plays that day/.test(prompt) && /blank Start and End mean the preset's tee times/.test(prompt) && /fill in Check/.test(prompt),
    '…and the rules: the CSV alone, never invent, doubt in Check, COMP only for singles, blanks meaning the preset')
  const tpl = calendarTemplate(ctx)
  eq(tpl.split('\r\n').filter(Boolean).length, 4, 'the blank template: the stamp, the header and two example rows')
  const read1 = readCalendarFile(tpl)
  ok(read1.ok && read1.rows.length === 2 && read1.rows[0].cells.Type === 'COMP', '…which reads back')
  const v2 = readCalendarFile(tpl.replace('format v1', 'format v2'))
  ok(!v2.ok && /v2.*reads v1.*Copy the prompt/.test(v2.why), 'a file from another version is refused, with what to do')
  ok(!readCalendarFile('Date,Title\n2027-01-01,x').ok, 'a file with other columns is refused')
  const fenced = '```csv\n' + tpl.split('\r\n').slice(1).join('\n') + '\n```'
  ok(readCalendarFile(fenced).ok, 'a chatbot’s answer pasted with its code block, and no stamp, still reads by its header')
  const quoted = readCalendarFile(`${CALENDAR_FORMAT}\n${CALENDAR_COLUMNS.join(',')}\nQ1,2027-02-05,,20:00,,Quiz night,SOCIAL,MEMBERS,,,,,,,,"Bar, upstairs","Teams of 4, ""fun""",`)
  ok(quoted.ok && quoted.rows[0].cells.Where === 'Bar, upstairs' && quoted.rows[0].cells.Notes === 'Teams of 4, "fun"', 'a quoted cell keeps its commas and quotes')
  const row = (cells: CalendarCells) => readCalendarRow(5, cells, ctx)
  const comp = row({ Ref: 'M1', Date: '2027-04-17', Title: 'April Medal', Type: 'COMP', Memberships: 'FULL|GOLD', Preset: 'XYZ', Gender: 'Q' })
  eq(comp.bad.map(b => b.column), ['Memberships', 'Gender', 'Preset'], 'an unknown membership, gender or preset is a bad cell, each with why (M15)')
  eq(row({ Date: '2027-04-17', Title: 'Interclub', Type: 'GOLF', Visibility: 'OFFICE' }).bad.map(b => b.column), ['Visibility'], 'golf is never Office only')
  eq(row({ Date: '2027-04-17', Title: 'Medal', Type: 'COMP', Start: 'SUNRISE', End: 'SUNSET' }).bad, [], 'a competition may start at SUNRISE and end at SUNSET')
  eq(row({ Date: '2027-04-17', Title: 'Medal', Type: 'COMP' }).comp?.preset, 'SMC', 'a blank Preset is the club’s default')
  const recipe = rowRecipe(row({ Date: '2027-04-17', Title: 'Medal', Type: 'COMP', Start: '07:30', End: '09:00', Gender: 'F', Allowance: '90' }), { scoring: 'stableford', allowance: 95, entry: { categories: ['cat-full'] }, plan: ctx.presets[0].plan })
  ok(recipe.allowance === 90 && JSON.stringify(recipe.entry) === JSON.stringify({ categories: ['cat-full'], genders: ['F'] })
    && JSON.stringify(recipe.plan.batches) === JSON.stringify([{ start: { kind: 'clock', at: '07:30' }, end: { kind: 'clock', at: '09:00' }, interval: 10, perTime: 4 }]),
    'the row’s own values override the preset’s; Start and End make one run at its interval and players a time')

  section('Stage c2: importing (/api/club/competition)')
  const pints = { id: 'c1', slug: 'pints', name: 'Pints Golf Club', verifiedAt: NOW.toISOString(), refusedAt: null, homeCourseId: 'course-1' }
  type Made = { tripId: string; code: string; name: string; date: string; ref: string | null; sheet: unknown; entry: unknown; boards: unknown[] }
  const made: Made[] = []
  const notes: ClubNote[] = []
  const log: ActivityEntry[] = []
  let n = 0
  const create: CreateStore = {
    async userFromToken(t) { return t.slice(4) }, async isMember() { return true },
    async insertTrip(r) { made.push({ tripId: `trip-${++n}`, code: String(r.trip_code), name: String(r.name), date: String(r.start_date), ref: null, sheet: null, entry: null, boards: r.leaderboards as unknown[] }); return { id: `trip-${n}` } },
    async writeMembership() {}, async writeLeadEmail() {}, async deleteTrip() { made.pop() },
    async setEventClub() {},
  }
  const store: ImportStore = {
    async userFromToken(t) { return t === 'tok-ross' ? member('ross', 'ross@x.ie') : null },
    async clubsOf() { return [] },
    async club(id) { return id === 'c1' ? pints : null },
    async rowOf() { return { id: 'row', clubId: 'c1', name: 'Ross', memberNumber: null, guiNumber: null, email: null, role: 'member', userId: 'ross', removedAt: null, onBoards: true, playsHere: true, officer: false, clubhouse: true } },
    async isStaff() { return false },
    create,
    async insertItem() { return 'item' },
    async insertRound(r) { const m = made.find(x => x.tripId === r.trip_id)!; m.sheet = r.tee_sheet; m.date = String(r.scheduled_date) },
    async deleteTrip() {},
    newCode: () => `IMP${String(n + 1).padStart(3, '0')}`,
    newId: () => `round-${n + 1}`,
    async setEntryRules(tripId, r) { made.find(x => x.tripId === tripId)!.entry = r },
    async setImportRef(tripId, ref) { made.find(x => x.tripId === tripId)!.ref = ref },
    async categories() { return [{ id: 'cat-full', name: 'Full', code: 'FULL', days: [0, 1, 2, 3, 4, 5, 6] }] },
    async presets() { return [{ id: 'p1', code: 'SMC', name: 'Saturday men’s comp', usedFor: null, scoring: 'stableford', allowance: 95, entry: { genders: ['M'] }, plan: ctx.presets[0].plan, isDefault: true }] },
    async notes() { return notes },
    async saveNote(_c, note, by) { const id = note.id ?? `note-${notes.length + 1}`; const i = notes.findIndex(x => x.id === id); const kept = { ...note, id }; if (i >= 0) notes[i] = kept; else notes.push(kept); ok(by.batch !== undefined, ''); return id },
    async course() { return { name: 'Pints — Old Course', lat: 53.35, lng: -6.26 } },
    async clubComps() {
      return made.map(m => ({ code: m.code, ref: m.ref, name: m.name, date: m.date,
        form: compFormFrom({ name: m.name, date: m.date, courseId: 'course-1', board: (m.boards[0] as { scoring?: unknown; handicapAllowance?: unknown }) ?? null, teeSheet: m.sheet, membersOnly: true, entry: m.entry }) }))
    },
    async compNow(code) {
      const m = made.find(x => x.code === code)
      return m ? { tripId: m.tripId, roundId: 'r', itemId: null, clubId: 'c1', code: m.code, name: m.name, date: m.date, courseId: 'course-1', rules: parseTeeRules(m.sheet)!, leaderboards: m.boards, entry: m.entry, membersOnly: true, started: false, certified: false, bookings: [] } : null
    },
    async applyChange(c, ch) { const m = made.find(x => x.code === c.code)!; m.name = ch.name; m.date = ch.date; m.sheet = ch.teeSheet; m.entry = ch.entry; m.boards = ch.leaderboards },
    async logActivity(e) { log.push(...e) },
  }
  const file = [CALENDAR_FORMAT, CALENDAR_COLUMNS.join(','),
    'MED-0417,2027-04-17,,,,April Medal,COMP,MEMBERS,FULL,,,,STROKES,,SMC,,,',
    'AGM,2027-03-05,,20:00,22:00,AGM,BUSINESS,OFFICE,,,,,,,,Lounge,,',
    'IC-1,2027-05-01,,10:00,,Interclub v Lahinch,GOLF,MEMBERS,,,,,,,,,,Is this home or away?',
    'BAD-1,2027-05-08,,,,Bad one,COMP,MEMBERS,GOLD,,,,,,,,,',
    'SUN-1,2027-12-18,,SUNRISE,15:00,Christmas Hamper,COMP,MEMBERS,,,,,,,,,,',
  ].join('\n')
  const parsed = readCalendarFile(file)
  const rows = parsed.ok ? parsed.rows : []
  const ask = (action: string, body: Record<string, unknown> = {}) => runCalendarImport({ token: 'tok-ross', action, clubId: 'c1', ...body }, store, NOW)
  const pr = await ask('import.prompt', { year: 2027 })
  ok(pr.status === 200 && pr.body.ok && !!pr.body.prompt?.includes('- FULL: Full') && !!pr.body.template, 'the prompt and template come from the club as it stands')
  eq((await runCalendarImport({ token: 'tok-ross', action: 'import.prompt', clubId: 'c1' }, { ...store, async rowOf() { return { id: 'row', clubId: 'c1', name: 'Ollie', memberNumber: null, guiNumber: null, email: null, role: 'member', userId: 'ross', removedAt: null, onBoards: true, playsHere: true, officer: true, clubhouse: false } } }, NOW)).status, 403,
    'an Officer without Clubhouse imports nothing')
  const pv = await ask('import.preview', { rows })
  const st = pv.status === 200 ? (pv.body.rows ?? []).map(r => r.status) : []
  eq(st, ['new', 'new', 'new', 'bad', 'new'], 'the preview: new rows, and one with an unknown membership that cannot come in (M15)')
  eq(made.length + notes.length, 0, '…and nothing saved by looking')
  const batch = '0b0e4a3c-9d2f-4c11-8a5e-3f1d2c3b4a5d'
  const run1 = await ask('import.rows', { rows, batch, confirmed: [] })
  const out1 = run1.status === 200 ? (run1.body.done ?? []).map(d => d.outcome) : []
  eq(out1, ['made', 'made', 'skipped', 'failed', 'made'], 'imported: a competition and the AGM made, the unsure interclub skipped until ticked, the bad row failed — the rest carry on (M16)')
  ok(made[0].ref === 'MED-0417' && JSON.stringify(made[0].entry) === JSON.stringify({ genders: ['M'], categories: ['cat-full'] }) && (made[0].boards[0] as { scoring?: string }).scoring === 'strokes',
    '…the competition through New competition’s own path, its Ref kept, the preset’s men’s with the row’s Full and Strokes')
  ok(notes[0]?.visibility === 'office' && notes[0]?.ref === 'AGM', '…the AGM Office only, its Ref kept')
  ok(log.length === 5 && log.every(l => l.batchId === batch && l.action === 'calendar.import'), 'one batch id, a line per row, on the club’s activity log')
  const run2 = await ask('import.rows', { rows, batch: '1b0e4a3c-9d2f-4c11-8a5e-3f1d2c3b4a5d', confirmed: [5] })
  const out2 = run2.status === 200 ? (run2.body.done ?? []).map(d => d.outcome) : []
  eq(out2, ['same', 'same', 'made', 'failed', 'same'], 'the same file again changes nothing — and the interclub, now ticked, comes in')
  const changedFile = file.replace('MED-0417,2027-04-17,,,,April Medal', 'MED-0417,2027-04-17,,,,April Monthly Medal').replace('SUN-1,2027-12-18,,SUNRISE,15:00', 'SUN-1,2027-12-18,,SUNRISE,08:00')
  const r3 = readCalendarFile(changedFile)
  const pv3 = await ask('import.preview', { rows: r3.ok ? r3.rows : [] })
  const sun = pv3.status === 200 ? pv3.body.rows?.[4] : undefined
  ok(pv3.status === 200 && pv3.body.rows?.[0].status === 'changed' && sun?.status === 'same' && /no tee times between sunrise/.test(sun?.sheetWhy ?? ''),
    'matched by Ref: a new title is a change; a sheet that cannot be made on the new times is said, the rest the same')
  const before = JSON.stringify(made.find(m => m.ref === null && m.name === 'Christmas Hamper')?.sheet ?? made[made.length - 1].sheet)
  const run3 = await ask('import.rows', { rows: r3.ok ? r3.rows : [], batch: '2b0e4a3c-9d2f-4c11-8a5e-3f1d2c3b4a5d', confirmed: [5] })
  const hamper = run3.status === 200 ? run3.body.done?.[4] : undefined
  ok(made[0].name === 'April Monthly Medal' && hamper?.outcome === 'same' && /^Tee sheet kept/.test(hamper.why ?? '') && JSON.stringify(made[made.length - 1].sheet) === before,
    '…an existing competition whose new sheet cannot be made keeps its old one, and says so (M16)')
  const pv4 = await ask('import.preview', { rows: (r3.ok ? r3.rows : []).slice(0, 1) })
  ok(pv4.status === 200 && (pv4.body.notInFile ?? []).length === 0, 'a file of one day lists nothing else of that day as Not in this file')
  const wide = readCalendarFile([CALENDAR_FORMAT, CALENDAR_COLUMNS.join(','), 'X1,2027-01-01,,,,New Year Swim,SPORT,MEMBERS,,,,,,,,,,', 'X2,2027-12-31,,,,Eve,SOCIAL,MEMBERS,,,,,,,,,,'].join('\n'))
  const pv5 = await ask('import.preview', { rows: wide.ok ? wide.rows : [] })
  ok(pv5.status === 200 && (pv5.body.notInFile ?? []).some(x => x.name === 'April Monthly Medal') && made.length === 2, '…a file across the year lists what it does not mention — shown, never acted on')
}


// ─── The casual tee sheet (Ross, 17 Nov 2026) ─────────────────────

async function teeTimesTests() {
  section('The casual tee sheet on the server (app/api/club/teeTimes.ts)')
  const CLUB = 'c1'
  const club: ClubRecord = { id: CLUB, slug: 'pints', name: 'Pints', verifiedAt: NOW.toISOString(), refusedAt: null, homeCourseId: 'course-1' }
  const row = (id: string, name: string, userId: string | null, o: Partial<MemberRecord> = {}): MemberRecord => ({
    id, clubId: CLUB, name, memberNumber: null, guiNumber: null, email: null, role: 'member', userId, removedAt: null, onBoards: true,
    playsHere: true, officer: false, clubhouse: false, categoryId: 'full', gender: 'M', birthDate: null, ...o,
  })
  const rows = [
    row('r-ross', 'Ross', 'ross', { clubhouse: true, officer: true }),
    row('r-ann', 'Ann', 'ann', { gender: 'F' }),
    row('r-dave', 'Dave', 'dave', { categoryId: 'five' }),
    row('r-sean', 'Seán', 'sean', { categoryId: 'social' }),
  ]
  const cats: TeeCategory[] = [
    { id: 'full', name: 'Full', code: 'FULL', days: [0, 1, 2, 3, 4, 5, 6], booksTeeTimes: true },
    { id: 'five', name: 'Five day', code: 'FIVE', days: [0, 1, 2, 3, 4], booksTeeTimes: true },
    { id: 'social', name: 'Social', code: 'SOC', days: [0, 1, 2, 3, 4, 5, 6], booksTeeTimes: false },
  ]
  let ready = true
  let settings: CasualSettings = { ...DEFAULT_CASUAL }
  let bookings: StoredBooking[] = []
  const activity: ActivityEntry[] = []
  let n = 0
  const SAT = '2026-11-21'
  const place = { lat: 53.35, lng: -6.26 }
  const times = casualDay(SAT, place, DEFAULT_CASUAL).times
  const comp: TeeComp = { code: 'MEDAL1', name: 'Saturday Medal', date: SAT, courseId: 'course-1', clocks: [times[3], times[4], times[5]], entry: { genders: ['M'] }, certified: false }
  const away: TeeComp = { ...comp, code: 'AWAY1', name: 'Away day', courseId: 'course-2', clocks: [times[8], times[9]] }
  const outing: ClubNote = { id: 'n1', ref: null, title: 'Corporate outing: Acme', type: 'GOLF', startsOn: SAT, endsOn: null, startTime: times[10], endTime: times[12], place: null, notes: 'Shotgun start', visibility: 'members', blocksSheet: true }
  const store: TeeTimesStore = {
    async userFromToken(t) { const id = t.replace('tok-', ''); return id === 'nobody' ? null : member(id, `${id}@x.ie`) },
    async club(id) { return id === CLUB ? club : null },
    async rowOf(_c, userId) { return rows.find(r => r.userId === userId) ?? null },
    async isStaff(userId) { return userId === 'staff' },
    async settings() { return { settings, ready } },
    async saveSettings(_c, x) { settings = x },
    async place() { return place },
    async categories() { return cats },
    async setBooks(_c, id, books) { cats.find(c => c.id === id)!.booksTeeTimes = books },
    async bookings(_c, from, to) { return ready ? bookings.filter(b => b.date >= from && b.date <= to) : null },
    async insertBookings(rs) {
      if (rs.some(r => bookings.some(b => b.date === r.play_on && b.time === r.tee_time && (b.seat === r.seat || (r.member_id && b.memberId === r.member_id))))) return 'clash'
      for (const r of rs) bookings.push({ id: `b${++n}`, date: r.play_on, time: r.tee_time, seat: r.seat, memberId: r.member_id, guestName: r.guest_name, bookedBy: r.booked_by })
      return 'ok'
    },
    async deleteBookings(_c, ids) { bookings = bookings.filter(b => !ids.includes(b.id)) },
    async moveBookings(_c, moves) { for (const m of moves) Object.assign(bookings.find(b => b.id === m.id)!, { date: m.date, time: m.time, seat: m.seat }); return 'ok' },
    async rowsByIds(_c, ids) { return rows.filter(r => ids.includes(r.id)) },
    async searchRows(_c, q) { return rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())) },
    async comps(_c, from, to) { return [comp, away].filter(c => c.date >= from && c.date <= to) },
    async blocks(_c, from, to) { return [outing].filter(o => o.startsOn >= from && o.startsOn <= to) },
    async ageDate() { return '01-01' },
    async logActivity(e) { activity.push(...e) },
  }
  const now = new Date('2026-11-18T10:00:00Z')
  const ask = (who: string, action: string, body: Record<string, unknown> = {}) => runTeeTimes({ token: `tok-${who}`, action, clubId: CLUB, date: SAT, ...body }, store, now)
  const dayOf = async (who: string) => { const o = await ask(who, 'day'); return o.status === 200 ? o.body as TeeDayBody : null }

  const d = await dayOf('ross')
  ok(!!d && d.times.length === times.length && d.times[0] === times[0], 'a member reads the day: sunrise to an hour before sunset')
  eq(d?.overlays.map(o => `${o.kind}:${o.title}`), ['competition:Saturday Medal', 'block:Corporate outing: Acme'], 'the home course\'s competition and the outing overlay it — never a competition on another course')
  eq(d?.overlays[0].bookHref, '/club/pints/comp/MEDAL1/tee-times', 'a member who may enter the competition gets its tee sheet from the overlay')
  eq((await dayOf('ann'))?.overlays[0].bookHref, null, '…one who may not (a men\'s competition) gets no Book')
  eq((await ask('nobody', 'day')).status, 403, 'nobody signed in reads nothing')
  eq((await ask('stranger', 'day')).status, 403, 'somebody not on the list reads nothing')
  eq((await ask('ross', 'day', { date: '2027-03-01' })).status, 400, 'a member looks four weeks ahead at most')

  const book = (who: string, time: string, people: unknown[]) => ask(who, 'book', { time, people })
  eq((await book('ann', times[0], [{ memberId: 'r-ann' }, { guestName: 'Pat' }])).status, 200, 'Ann books herself and a guest')
  eq((await book('ross', times[0], [{ memberId: 'r-ross' }, { memberId: 'r-dave' }])).body, { ok: false, error: 'Sat 21 Nov isn’t one of Dave’s playing days.' }, 'a five-day member is refused on a Saturday, by name')
  eq((await book('ross', times[0], [{ memberId: 'r-ross' }, { guestName: 'A' }, { guestName: 'B' }])).body, { ok: false, error: `Only 2 places left at ${describeTime(times[0])}.` }, 'guests take places like anybody')
  eq((await book('sean', times[1], [{ memberId: 'r-sean' }])).body, { ok: false, error: 'Your membership doesn’t book tee times.' }, 'a social membership books no tee times')
  eq((await book('ross', times[4], [{ memberId: 'r-ross' }])).status, 409, 'nobody books under the competition')
  eq((await book('ross', times[11], [{ memberId: 'r-ross' }])).status, 409, '…or the outing')
  eq((await book('ann', times[1], [{ memberId: 'r-ann' }])).body, { ok: false, error: `You already have a tee time that day (${describeTime(times[0])}).` }, 'one tee time a member a day')
  const early = await runTeeTimes({ token: 'tok-ross', action: 'book', clubId: CLUB, date: SAT, time: times[1], people: [{ memberId: 'r-ross' }] }, store, new Date('2026-11-13T10:00:00Z'))
  eq(early.body, { ok: false, error: 'Booking opens Sat 14 Nov at 7:00 pm.' }, 'not before booking opens')

  const ann = await dayOf('ann')
  const pat = ann?.bookings.find(b => b.name === 'Pat')
  ok(!!pat && pat.guestOf === 'Ann' && pat.mayCancel && pat.mine, 'Ann\'s guest reads "Guest of Ann", hers to take off')
  const forRoss = (await dayOf('ross'))?.bookings.find(b => b.name === 'Ann')
  ok(!!forRoss && !forRoss.mayCancel && !forRoss.mine, '…never Ross\'s, on the members app')
  eq((await ask('ross', 'cancel', { id: forRoss!.id })).status, 403, 'a member cannot take somebody else off')
  const annSelf = ann!.bookings.find(b => b.name === 'Ann')!
  eq((await ask('ann', 'cancel', { id: annSelf.id })).status, 200, 'Ann takes herself off…')
  eq(bookings.length, 0, '…and the guest she brought goes with her')
  ok(!activity.length, 'a member\'s own booking is not the office\'s log')

  section('The Clubhouse keeps the tee sheet')
  eq((await ask('ann', 'office.day')).status, 403, 'a member without Clubhouse has no office')
  const od = await ask('ross', 'office.day')
  const week = od.status === 200 ? (od.body as TeeDayBody).week ?? [] : []
  ok(week.length === 7 && week[0].date === '2026-11-16' && week[5].date === SAT && week[5].overlays === 2, 'the birdseye: the week Monday first, each day\'s places and overlays')
  eq((await ask('ross', 'office.book', { time: times[1], people: [{ memberId: 'r-dave' }, { memberId: 'r-sean' }, { guestName: 'Visitor' }] })).status, 200, 'the office books anybody — a five-day member on a Saturday, a social member, a guest')
  eq((await ask('ross', 'office.book', { time: times[11], people: [{ memberId: 'r-ann' }] })).status, 409, '…never under the outing')
  const visitor = bookings.find(b => b.guestName === 'Visitor')!
  eq(visitor.bookedBy, 'r-dave', 'a guest the office books is the first member\'s in the booking')
  const dave = bookings.find(b => b.memberId === 'r-dave')!
  eq((await ask('ross', 'office.move', { ids: [dave.id], time: times[2] })).status, 200, 'the office moves a booking to another time')
  eq(bookings.find(b => b.id === dave.id)!.time, times[2], '…and there it is')
  eq((await ask('ross', 'office.move', { ids: [dave.id], time: times[3] })).status, 409, '…never under the competition')
  eq((await ask('ross', 'office.remove', { ids: [visitor.id] })).status, 200, 'the office takes anybody off')
  ok(['teesheet.book', 'teesheet.move', 'teesheet.remove'].every(a => activity.some(x => x.action === a && x.byName === 'Ross')), 'every office change on the club\'s activity log, by name')
  const staffAsk = await runTeeTimes({ token: 'tok-staff', action: 'office.remove', clubId: CLUB, date: SAT, ids: [dave.id] }, store, now)
  ok(staffAsk.status === 200 && activity.some(a => a.byStaff && a.byName === STAFF_NAME), 'Green Dot staff keep it too, logged as staff')

  eq((await ask('ross', 'office.settings', { settings: { interval: 3 } })).status, 400, 'settings checked: five to thirty minutes')
  eq((await ask('ross', 'office.settings', { settings: { interval: 8, perDay: 2 } })).status, 200, 'the office sets eight minutes apart and two a day')
  eq([settings.interval, settings.perDay], [8, 2], '…kept')
  eq((await ask('ross', 'office.settings', { books: [{ id: 'social', books: true }] })).status, 200, 'and lets the social membership book')
  eq((await book('sean', casualDay(SAT, place, settings).times[0], [{ memberId: 'r-sean' }])).status, 200, '…so Seán books')
  eq((await ask('ann', 'office.settings', { settings: { interval: 12 } })).status, 403, 'a member sets nothing')

  ready = false
  eq((await dayOf('ross'))?.ready, false, 'before 096 the sheet says it is not set up yet')
  eq((await book('ross', times[0], [{ memberId: 'r-ross' }])).status, 503, '…and books nothing')
  ready = true

  section('The casual tee sheet\'s wiring')
  const route = read('app/api/club/tee-times/route.ts')
  ok(route.includes('teeTimesStore(createAdminClient())'), 'one route, on the service role')
  const mig = read('supabase/migrations/20260101000096_club_tee_sheet.sql')
  ok(/uq_club_tee_bookings_seat/.test(mig) && /REVOKE ALL ON public\.club_tee_bookings FROM anon, authenticated/.test(mig), '096: one place a seat, closed to phones')
  ok(/ck_club_events_block CHECK \(NOT blocks_tee_sheet OR \(type IN \('GOLF', 'COURSE'\)/.test(mig), '096: only a Golf or Course event takes the sheet, in the database too')
  ok(read('lib/clubMay.ts').includes("case 'keep_tee_sheet':"), 'keeping the tee sheet is the Clubhouse\'s act')
  {
    const walkCh = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walkCh(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [])
    const out = walkCh('app/clubhouse').filter(f => !f.endsWith('ClubhouseShell.tsx')).filter(f => /href=\{?`\/club\/|'\/club\/\$\{/.test(read(f)))
    eq(out, [], 'nothing in the Clubhouse links into the members app but the shell\'s own "The members app" (Ross, 17 Nov 2026)')
    ok(/events\/\$\{e\.code\}/.test(read('lib/clubhouse.ts')) && !/\/club\/\$\{o\.clubSlug\}/.test(read('lib/clubhouse.ts')), 'a competition opens on the Clubhouse\'s own page, from Events, the Calendar and Needs you')
  }
  {
    // No link or redirect into the Clubhouse from anywhere but the two places that ask the account first (Ross, 17 Nov 2026).
    const walkApp = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['clubhouse', 'admin', 'api'].includes(e.name) && d === 'app' ? [] : walkApp(path.join(d, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [])
    const linking = walkApp('app').filter(f => /[`'"]\/clubhouse/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))
    eq(linking.sort(), ['app/account/club/ClubScreen.tsx', 'app/club/[slug]/ClubView.tsx'], 'only two places outside the Clubhouse mention it at all')
    ok(/clubMay\('open_clubhouse', \{ row: m\.credentials[^}]*\}\) && \(\s*<ListRow href=\{`\/clubhouse\//.test(read('app/club/[slug]/ClubView.tsx')), '…the Club tab\'s link only for an account that holds Clubhouse')
    ok(/clubMay\('keep_list'/.test(read('app/account/club/ClubScreen.tsx')) && /state\.list \? `\/clubhouse/.test(read('app/account/club/ClubScreen.tsx')), '…and the list\'s way in only for one that may keep the list')
    ok(!read('app/account/clubs/ClubsScreen.tsx').includes("askClub('create'") && !read('app/account/clubs/ClubsScreen.tsx').includes('Set up the club'), 'members have no Set up your club')
    ok(/makeClub/.test(read('app/admin/clubs/actions.ts')) && /requireAdmin\(\)/.test(read('app/admin/clubs/actions.ts').slice(read('app/admin/clubs/actions.ts').indexOf('export async function makeClub'))) && /provisionClub/.test(read('app/admin/clubs/actions.ts')), 'clubs are set up from /admin, behind the admin session')
  }
  eq(sectionAt('/clubhouse/pints/tee-sheet', 'pints'), 'teesheet', 'the Clubhouse has a Tee sheet section')
  const ts = read('app/clubhouse/[slug]/tee-sheet/TeeSheet.tsx')
  ok(['office.day', 'office.book', 'office.move', 'office.remove', 'office.settings'].every(a => ts.includes(`'${a}'`)), '…which books, moves, takes off and sets, all through the server')
  ok(/Takes the tee sheet/.test(read('app/clubhouse/[slug]/events/EventPanel.tsx')) && /blocksSheet: blockable && blocks/.test(read('app/clubhouse/[slug]/events/EventPanel.tsx')), 'a Golf or Course event is ticked to take the tee sheet — a block booking')
}

async function main() {
  await teeTimesTests()
  ruleTests()
  await importTests()
  await calendarTests()
  await clubhouseTests()
  membershipRuleTests()
  await membershipRouteTests()
  await copyTests()
  await matchPlayTests()
  await awardTests()
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
  locationsTests()
  overviewTests()
  playsFollowsMembershipTests()
  teeEmbedTests()
  gridColumnTests()
  snappyTests()
  wiringTests()
  unlinkTests()
  insideClubTests()
  console.log(`\n${'─'.repeat(56)}`)
  if (failed > 0) {
    console.log(`✗ ${failed} failed, ${passed} passed`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`✓ all ${passed} checks passed`)
}

function unlinkTests() {
  section('D285: an event outside the members app, linked or unlinked')
  ok(linkable({ kind: 'tournament', competition: null }) && linkable({ kind: 'run', competition: null }), 'a standalone event is linkable')
  ok(!linkable({ kind: 'tournament', competition: { phase: 'announced', courseName: null, scoring: 'stableford', allowance: 100, booked: 0, capacity: 0, membersOnly: true } }) && !linkable({ kind: 'club', competition: null }),
    '…a competition and the club’s own events never')
  const ev = (code: string, unlinked?: true): SeasonEvent => ({ code, name: code, kind: 'tournament', startDate: '2026-11-20', endDate: '2026-11-20', competition: null, ...(unlinked ? { unlinked } : {}) })
  eq(whatsOn([ev('A'), ev('B', true)], '2026-11-20', '2026-11-20').events.map(o => o.event.code), ['A'], 'an unlinked event is not "on" in the Overview')
  const store = read('app/api/club/store.ts')
  ok(/club_unlinked_at/.test(store) && /withUnlinked/.test(store), 'the reads: members never, the Clubhouse’s season with the flag')
  ok(/readClubEvents\(db, clubId, \{ withUnlinked: true \}\)/.test(store), 'only the season reads the unlinked')
  ok(/hiddenCodes\.has\(t\.trip_code\)/.test(store), 'nor does Other events list one the club unlinked')
  ok(/club_unlinked_at timestamptz NULL/.test(read('supabase/migrations/20260101000100_club_event_unlinked.sql')), 'migration 100 adds the column')
  const card = read('app/components/ClubEventCard.tsx'), acts = read('app/api/event/actions.ts')
  ok(/change\(\{ linked: view\.unlinked \}/.test(card) && /typeof input\.linked === 'boolean'/.test(acts) && /!trip\.competition/.test(acts), 'the event’s own card links and unlinks it — never a competition')
  ok(/<LinkToggle/.test(read('app/clubhouse/[slug]/events/Events.tsx')) && /askClub\('event\.link'/.test(read('app/clubhouse/[slug]/events/LinkToggle.tsx')), 'the Clubhouse’s status place is the chain-link, tapped')
}

function insideClubTests() {
  section('MS3: a club competition played inside the club (D284)')
  const C = '/club/pints/comp/AB12CD'
  eq(barOf(`${C}/scoring/1`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'scoring' }, 'the scorecard lights Scoring')
  eq(barOf(`${C}/match/m-1`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'scoring' }, 'a match lights Scoring (Matches)')
  eq(barOf(`${C}/match/m-1/card`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'scoring' }, '…and its card')
  eq(barOf(`${C}/matchplay`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'board' }, 'the bracket lights Leaderboard (Draw)')
  eq(barOf(`${C}/organiser`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'summary' }, 'Manage keeps the competition footer')
  eq(barOf(`${C}/organiser/bracket`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'summary' }, '…its pages too')
  eq(barOf(`${C}/setup`, 'pints'), { set: 'comp', code: 'AB12CD', active: 'summary' }, '…and Trip Setup')
  eq(barOf(`${C}/round/1`, 'pints'), null, 'a screen the club does not mount wears no footer')
  eq(clubPathOf('match/m-1/card'), 'match/m-1/card', 'a mounted path is kept')
  eq(clubPathOf('/scoring/1/'), 'scoring/1', '…cleaned of its slashes')
  eq(clubPathOf('leaderboard'), 'leaderboard', 'a section is a mounted path')
  eq(clubPathOf('../../admin'), null, 'anything else is refused')
  eq(clubPathOf('https://evil.example'), null, '…an address elsewhere too')
  eq(clubPathOf(undefined), null, 'nothing asked, nothing')
  eq(tripHomeAt(clubCompRoot('pints'), 'ab12cd'), '/club/pints/comp/AB12CD', 'a page handed the club root builds club links')
  ok(!isTripRoot(clubCompRoot('pints')), '…and the club root is never an event route')
  eq(tripHomeAt('event', 'AB12CD'), '/golf/event/AB12CD', 'the event\'s own address is unchanged')

  // Every path the club mounts has its page there, drawn through the door.
  const play = 'app/club/[slug]/comp/[code]/(play)'
  for (const p of ['scoring/[roundNumber]', 'match/[matchId]', 'match/[matchId]/card', 'matchplay', 'organiser', 'organiser/tags', 'organiser/days', 'organiser/sessions', 'organiser/bracket', 'setup', 'setup/sessions', 'teesheet/[roundId]/setup']) {
    const src = read(`${play}/${p}/page.tsx`)
    ok(/inClub\(params/.test(src), `the club mounts ${p}, behind the competition's door`)
  }
  ok(/<EnsureMember/.test(read(`${play}/layout.tsx`)) && /TripBaseProvider base=\{compHome/.test(read(`${play}/layout.tsx`)),
    'the club\'s screens enter the phone in the event and link inside the club')
  ok(/if \(gate\.door\)/.test(read(`${play}/inClub.tsx`)), 'without the door, only the door')

  // The event's own address of each sends a competition into the club.
  const ev = 'app/golf/[root]/[tripCode]'
  for (const [f, to] of [['scoring/[roundNumber]', 'scoring/${roundNumber}'], ['scoring', "'scoring'"], ['leaderboard', "'leaderboard'"], ['teesheet', "'tee-times'"],
    ['match/[matchId]', 'match/${matchId}'], ['match/[matchId]/card', 'match/${matchId}/card'], ['matchplay', "'matchplay'"],
    ['organiser', "'organiser'"], ['organiser/tags', "'organiser/tags'"], ['organiser/days', "'organiser/days'"], ['organiser/sessions', "'organiser/sessions'"],
    ['organiser/bracket', "'organiser/bracket'"], ['setup', "'setup'"], ['teesheet/[roundId]/setup', 'teesheet/${roundId}/setup']] as const) {
    ok(read(`${ev}/${f}/page.tsx`).includes(`intoClub(root, tripCode, ${to.startsWith("'") ? to : '`' + to + '`'})`), `the event's ${f} sends a competition into the club`)
  }
  ok(/clubPathOf\(to\)/.test(read('app/club/comp/[code]/page.tsx')), '/club/comp/<code> carries the screen asked for, checked')

  // Nothing in the club area builds an event address for a competition.
  const clubFiles = (function walk(d: string): string[] {
    return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [])
  })('app/club')
  const builders = clubFiles.filter(f => /tripBase\(/.test(fs.readFileSync(f, 'utf8'))).map(f => f.split(path.sep).join('/')).sort()
  eq(builders, ['app/club/[slug]/ClubView.tsx', 'app/club/[slug]/comp/[code]/(play)/[...rest]/page.tsx'],
    'only an outside event (Other events) and the not-mounted fallback build an event address')
  ok(/e\.competition \? compSectionHref/.test(read('app/club/[slug]/ClubView.tsx')), '…the outside event never a competition')
}

void main()
