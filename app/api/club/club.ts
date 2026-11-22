// The server's half of clubs (stage (c); lib/clubs.ts has the rules).
//
// Handed its store, so `test:clubs` runs every path against a stand-in
// (`store.ts` is the service-role store, `route.ts` the plumbing). Every ask
// carries the phone's Supabase token; **every action here needs a Green Dot
// member** — and nothing anybody needs to join, play, score or watch ever
// comes through here (D94).
//
// * `mine` — the clubs this account is on, its credentials in each.
// * `create` — **refused to everybody** (Ross, 17 Nov 2026): clubs are set up
//   by Green Dot from /admin (`provisionClub` below, the admin's action), its
//   owner a Green Dot account named there, verified at once.
// * `members` — the club's list, for its owners and admins: numbers shown
//   partly hidden, never whole.
// * `add` — rows typed or pasted, matched to the list by GUI number, then
//   member number, then email (`planList`); nobody is taken off by missing.
// * `update`, `remove`, `restore` — one row. Removing keeps the row and cuts
//   its link: the access it gave ends on the next page load. A club never
//   deletes an account. Credentials are ticks (lib/clubMay.ts decides who
//   gives which); a club keeps an owner. Every change is logged (092).
// * `invite` — a code emailed to the address on the row (kept only as a
//   hash, 14 days, one use).
// * `link` — the code typed by a signed-in member: their account joins that
//   row. One GUI number to one account: a clash is held for the club. An
//   account may be on many clubs' lists (D218, D223).

import { readIndex } from '@/lib/handicapIndex'
import { readBirthDate, resolveExtras } from '@/lib/clubMembership'
import { linkIndex, listIndexes, setIndex, severIndex, type HandicapStore } from '../handicaps/handicaps'
import { isAccount, type AuthUser } from '@/lib/account'
import { cleanHex } from '@/lib/clubColour'
import type { SeasonRow } from '@/lib/cardSummary'
import type { ListCounts, GridRow, Need, SeasonEvent } from '@/lib/clubhouse'
import type { Category, Gender, RowExtras } from '@/lib/clubMembership'
import { STAFF_NAME } from '@/lib/clubhouse'
import { memberSees, type ClubEventType, type ClubNote } from '@/lib/clubEvents'
import { isClubhouseAction, runClubhouse, type ClubhouseStore } from './clubhouse'
import { afterFailure, attemptBlocked, type AttemptWindow } from '@/lib/membership'
import { PLAYS_FOLLOWS_MEMBERSHIP } from '@/lib/clubMay'
import {
  clubMay, credentialChangeIssue, credentialsOf, removeIssue, storedRole, withChange,
  type Asker, type ClubAct, type Credentials, type CredentialKey,
} from '@/lib/clubMay'
import {
  INVITE_DAYS, INVITE_RESEND_MINUTES, INVITE_TRY_LIMIT, MAX_LIST_ROWS,
  clubNameIssue, clubSlug, clubStatus, cleanRow, inviteCodeFrom, inviteCodeIssue, inviteEmail,
  listRowIssue, maskNumber, nextSlug, normaliseClubName,
  planList, clubAssetUrl, clubImageIssue, IMAGE_COLUMN, CLUB_IMAGE_KINDS,
  clubEventWhen, irishToday,
  type ClubEvent, type ClubImageKind, type ClubRole, type ClubStatus, type ListRow, COMPS_DAYS_AHEAD, COMPS_RESULTS } from '@/lib/clubs'

export interface ClubRecord {
  id: string; slug: string; name: string; verifiedAt: string | null; refusedAt: string | null
  /** The look (086's colour and crest, 087's art) — absent before 087, or unset. */
  colour?: string | null
  crestPath?: string | null
  artPath?: string | null
  artDarkPath?: string | null
  /** Stage (d1), D161: the club's home course (089) — absent before it, or unset. */
  homeCourseId?: string | null
  /** Stage (m): the day each year ages are counted on, 'MM-DD' (094) — absent or null is 1 January. */
  ageDate?: string | null
}

export interface MemberRecord {
  id: string
  clubId: string
  name: string
  memberNumber: string | null
  guiNumber: string | null
  email: string | null
  role: ClubRole
  userId: string | null
  removedAt: string | null
  onBoards: boolean
  /** Migration 092's ticks — absent before it, read off the role (`credentialsOf`). */
  playsHere?: boolean
  officer?: boolean
  clubhouse?: boolean
  /** Migration 094: the row's membership, and the person's gender and date of birth (the account's, copied; or the row's own). */
  categoryId?: string | null
  gender?: Gender | null
  birthDate?: string | null
}

export type RowPatch = Partial<{
  name: string; member_number: string | null; gui_number: string | null; email: string | null
  role: ClubRole; user_id: string | null; linked_at: string | null; removed_at: string | null; on_boards: boolean
  officer: boolean; clubhouse: boolean
  category_id: string | null; gender: Gender | null; birth_date: string | null
}>

/** One line of the club's activity log (092, D210). */
export interface ActivityEntry {
  clubId: string
  byUser: string
  byName: string
  byStaff: boolean
  action: string
  memberId: string | null
  memberName: string | null
  changes: Record<string, [unknown, unknown]>
  batchId: string | null
}

/** The members home's first wave (D195): the club, this account's row, and its events — asked together. */
export interface ClubHomeFirst {
  club: ClubRecord | null
  row: MemberRecord | null
  /** The club's events, a competition's phase still to come (`compPhases`). */
  events: ClubEvent[]
  /** The competitions among them — kept on the server, never answered. */
  comps: { tripId: string; code: string }[]
}

export interface ClubStore extends ClubhouseStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** The read-only home's token check, local where the project's keys allow (D195). */
  readerFromToken?(token: string): Promise<AuthUser | null>
  /** The members home's first wave in one go — null to fall back to the reads one by one. */
  clubHome?(slug: string, userId: string): Promise<ClubHomeFirst | null>
  /** Each competition's phase, by code — in the second wave with everything else. */
  compPhases?(comps: { tripId: string; code: string }[]): Promise<Map<string, import('@/lib/compPhase').CompPhase>>
  /** Stage 3 (D266): this list row's place in each club match play — its next match, or how it ended. */
  myMatches?(rowId: string, codes: string[]): Promise<import('@/lib/clubMatchPlay').MyClubMatch[]>
  /** Stage 4: this row's partner in each pairs match play it entered — a name, or null while looking for one. */
  pairPartners?(rowId: string, codes: string[]): Promise<Record<string, string | null>>
  /** The rows this account is linked to and not removed from, with their clubs. */
  clubsOf(userId: string): Promise<{ club: ClubRecord; row: MemberRecord }[]>
  /** Slugs already taken that start with this one. */
  slugsLike(base: string): Promise<string[]>
  /** `verified`: the club is verified as it is made — Green Dot's own doing, from /admin. */
  createClub(c: { slug: string; name: string; createdBy: string; verified?: boolean }, owner: { name: string; email: string | null; userId: string }): Promise<ClubRecord>
  club(clubId: string): Promise<ClubRecord | null>
  /** Every row on a club's list, removed ones too. */
  rows(clubId: string): Promise<MemberRecord[]>
  insertRows(clubId: string, rows: ListRow[], extras?: RowExtras[]): Promise<number>
  /** 'clash' when a number is already another row's in this club. */
  updateRow(id: string, patch: RowPatch): Promise<'ok' | 'clash'>
  lastInviteAt(memberId: string): Promise<string | null>
  saveInvite(i: { memberId: string; email: string; codeHash: string; expiresAt: string }): Promise<void>
  /** False when email is not set up here. */
  sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean>
  inviteByHash(hash: string): Promise<{ id: string; memberId: string; expiresAt: string; usedAt: string | null } | null>
  /** Spent only if still unspent — false when another phone got there first. */
  useInvite(id: string, at: string): Promise<boolean>
  row(memberId: string): Promise<MemberRecord | null>
  /** Accounts linked to a row with this GUI number, any club. */
  guiHolders(gui: string): Promise<string[]>
  /** GUI numbers on rows linked to this account, any club. */
  guisOf(userId: string): Promise<string[]>
  readAttempts(keys: string[]): Promise<Map<string, AttemptWindow>>
  writeAttempt(key: string, w: AttemptWindow): Promise<void>
  randomBytes(n: number): Uint8Array
  /** greendot.live, or the preview's own address. */
  siteOrigin(): string

  // Stage (e1) — the club's page and its look (migration 087).
  /** Where stored images are read from: the Supabase project's address. */
  assetBase(): string | undefined
  clubBySlug(slug: string): Promise<ClubRecord | null>
  /** The club's look changed: its colour, or an image's stored path. */
  updateClub(clubId: string, patch: Partial<{ colour: string | null; crest_path: string | null; art_path: string | null; art_dark_path: string | null; home_course_id: string | null; age_date: string | null }>): Promise<void>
  /** Every event under the club, with who changes it. */
  clubEvents(clubId: string): Promise<ClubEvent[]>
  /** Of those events, the ones this account is linked to a player in (D134). */
  entries(userId: string, codes: string[]): Promise<string[]>
  /** Stage (f): this account's own card summaries for a year, and their courses' names. Empty before 088. */
  seasonRows(userId: string, year: number): Promise<{ rows: SeasonRow[]; courses: Record<string, string>; index?: import('@/lib/cardSummary').IndexPoint[] }>
  /** This account's events outside the club — in them or made them — on now or to come (D143's "Outside the club", D144). */
  outsideEvents(userId: string, excludeCodes: string[], clubId?: string): Promise<ClubEvent[]>
  /** The best club-round score in each of these finished events, by code — from the summaries. */
  topScores(codes: string[]): Promise<Record<string, { name: string; points: number }>>
  /** An image kept in the bucket; the old one let go. */
  putImage(path: string, bytes: Uint8Array): Promise<void>
  removeImage(path: string): Promise<void>

  /**
   * Stage (d3): the club's competitions with a card waiting on this list
   * row — its own to approve, or one it was chosen to mark. Empty before 090.
   */
  cardsToSign?(clubId: string, rowId: string, comps?: { tripId: string; code: string; name?: string }[]): Promise<{ code: string; name: string; count: number }[]>

  // Stage (d1) — the handicap index (D179) and the home course (D161), migration 089.
  handicaps?: HandicapStore
  /** Whether a course is one of the platform's. */
  courseExists?(courseId: string): Promise<boolean>

  // Stage (k0) — the activity log (092). Fail-soft: never in the way of a change.
  logActivity?(entries: ActivityEntry[]): Promise<void>

  // Stage (m) — memberships, and a person's gender and date of birth (094).
  categories?(clubId: string): Promise<Category[]>
  categoryCounts?(clubId: string): Promise<Map<string, number>>
  /** The category's id, or 'clash' when its name or code is another's. */
  saveCategory?(clubId: string, c: { id?: string; name: string; code: string; days: number[]; position: number }): Promise<string>
  deleteCategory?(clubId: string, id: string): Promise<void>
  accountDetails?(userId: string): Promise<{ gender: Gender | null; birthDate: string | null } | null>
  /** One value everywhere: the account's, copied onto every list row of theirs. */
  saveDetails?(userId: string, patch: { gender?: Gender | null; birthDate?: string | null }): Promise<void>
}

/** Reading and resizing an uploaded image (sharp, on the server — D156), handed in so tests need no images. */
export interface ImageWork {
  /** Format and size as the photo stands, turned upright. Null when it is not an image at all. */
  inspect(bytes: Uint8Array): Promise<{ format: string | null; width: number; height: number } | null>
  /** Resized and turned to WebP: art 1600 wide, a crest 512 across. */
  prepare(kind: ClubImageKind, bytes: Uint8Array): Promise<Uint8Array>
}

export interface ClubSummary {
  id: string; slug: string; name: string; status: ClubStatus
  /** This account's ticks at the club (lib/clubMay.ts) — what a screen draws from. */
  credentials: Credentials
  /** Stage (k1), D222: the asker is Green Dot staff, in the Clubhouse. */
  staff?: boolean
  colour: string | null
  /** D161: the club's home course, or null. */
  homeCourseId: string | null
  crestUrl: string | null
  artUrl: string | null
  artDarkUrl: string | null
}

export interface ListEntry {
  id: string
  name: string
  memberNumber: string | null
  guiNumber: string | null
  email: string | null
  credentials: Credentials
  linked: boolean
  removed: boolean
  onBoards: boolean
  /** D179: the one index — a linked row's account's, an unlinked row's own. */
  handicapIndex: number | null
}

export type ClubBody = {
  ok: true
  clubs?: ClubSummary[]
  club?: ClubSummary
  list?: ListEntry[]
  added?: number
  updated?: number
  skipped?: { name: string; why: string }[]
  sentTo?: string
  /** The members home (D159): every event under the club, and this account's entries among them. */
  events?: ClubEvent[]
  /** MO3 (D282): how many upcoming and past events the club has in all — the home carries only the next two weeks and the latest results. */
  /** MO4 (D283): the account's index after each change this year. */
  indexTrend?: import('@/lib/cardSummary').IndexPoint[]
  more?: { upcoming: number; past: number }
  whole?: boolean
  entries?: string[]
  /** The name on the club's list, for the greeting. */
  me?: { name: string }
  /** Stage (f): the account's own rounds this year (D143), with their courses. */
  season?: SeasonRow[]
  courses?: Record<string, string>
  outside?: ClubEvent[]
  tops?: Record<string, { name: string; points: number }>
  toSign?: { code: string; name: string; count: number }[]
  /** Stage 3 (D266): the member's matches in the club's match plays. */
  matches?: import('@/lib/clubMatchPlay').MyClubMatch[]
  /** D179: said once on linking, when the club's index differed from the account's. */
  note?: string
  /**
   * The members home (D218, D223): every verified club this account is on,
   * by name, and how many cards wait on it at each of the others — the
   * header's next club and its dot. Only asked for an account on more than one.
   */
  myClubs?: { slug: string; name: string; toSign: number; crestUrl?: string | null }[]
  /** Stage (k1), the Clubhouse: a page of the list and its total, the counts, competitions by phase, the Alerts, a bulk change's outcome, the file. */
  grid?: GridRow[]
  total?: number
  counts?: ListCounts
  byPhase?: Record<string, number>
  needs?: Need[]
  /** D276: the Overview's day (Irish) and what this account is in this week. */
  today?: string
  yours?: import('@/lib/clubOverview').YoursFacts
  /** D277: the club's courses and rooms. */
  places?: import('@/lib/clubLocations').ClubPlaces
  done?: number
  failed?: { name: string; why: string }[]
  csv?: string
  /** Stage (k2): every event under the club, with a competition's facts. */
  calendar?: SeasonEvent[]
  /** Stage c1 (095): whether the club's own events can be kept yet, the types it does not show its members, and an event just kept. */
  notesReady?: boolean
  hiddenTypes?: import('@/lib/clubEvents').ClubEventType[]
  noteId?: string
  /** D285: after Link or Unlink — the event's state. */
  unlinked?: boolean
  /** Stage c1, M7: the club's event presets, and whether they can be kept yet (095). */
  presets?: import('@/lib/clubPresets').Preset[]
  presetsReady?: boolean
  /** Stage c1: the members home's club events — only those this member may see (`memberSees`). */
  notes?: import('@/lib/clubEvents').ClubNote[]
  /** Stage (m): the club's memberships with their head counts, and its age date ('MM-DD'). */
  categories?: (Category & { count: number })[]
  ageDate?: string
}

export type ClubOutcome =
  | { status: 200; body: ClubBody }
  | { status: 400 | 401 | 403 | 404 | 409 | 429 | 503; body: { ok: false; error: string } }

type FailStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503
const fail = (status: FailStatus, error: string): ClubOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const TOO_MANY = 'Too many tries — wait a few minutes and try again.'
const NOT_ON = 'Only someone with Clubhouse keeps the club’s list.'
const NOT_LOOK = 'Only someone with Clubhouse changes the club’s look.'
const TICKS_LATER = 'The ticks aren’t set up yet — try again later.'
const PEOPLE_LATER = 'Memberships, genders and dates of birth aren’t set up yet — try again later.'

/**
 * The club's own events a member sees on the members home (M3–M6): Members
 * events only, of a type the club shows, not one this member has turned
 * off — from today on (a few days back, so a week-long event in hand
 * stays). Filtered here on the server: an Office only event never leaves it.
 */
async function membersNotes(store: ClubStore, clubId: string, userId: string, today: string): Promise<ClubNote[]> {
  if (!store.notes) return []
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
  const [notes, clubHidden, mine] = await Promise.all([
    store.notes(clubId, { from, membersOnly: true }),
    store.clubHidden ? store.clubHidden(clubId).catch(() => []) : Promise.resolve([]),
    store.memberHidden ? store.memberHidden(userId).catch(() => []) : Promise.resolve([]),
  ])
  return (notes ?? []).filter(n => memberSees(n, clubHidden, mine))
}

export { inviteHash, inviteTryKey } from './invites'
import { inviteHash, inviteTryKey } from './invites'

let assetBase: string | undefined

const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
function summary(club: ClubRecord, row: MemberRecord | Credentials): ClubSummary {
  return {
    id: club.id, slug: club.slug, name: club.name, status: clubStatus(club),
    credentials: 'role' in row ? credentialsOf(row) : row,
    colour: cleanHex(club.colour),
    homeCourseId: club.homeCourseId ?? null,
    crestUrl: clubAssetUrl(assetBase, club.crestPath ?? null),
    artUrl: clubAssetUrl(assetBase, club.artPath ?? null),
    artDarkUrl: clubAssetUrl(assetBase, club.artDarkPath ?? null),
  }
}

/**
 * A row as the screen reads it. Numbers partly hidden on the phone; whole in
 * the Clubhouse (Ross, 16 Nov 2026), asked for there by someone with it.
 */
function entry(r: MemberRecord, index: number | null = null, whole = false): ListEntry {
  const shown = (n: string | null) => (whole ? n : maskNumber(n))
  return {
    id: r.id, name: r.name,
    memberNumber: shown(r.memberNumber), guiNumber: shown(r.guiNumber), email: r.email,
    credentials: credentialsOf(r), linked: !!r.userId, removed: !!r.removedAt, onBoards: r.onBoards, handicapIndex: index,
  }
}

/** A club's list as the screen reads it, each row with its one index (D179). */
async function listOf(store: ClubStore, rows: MemberRecord[], whole = false): Promise<ListEntry[]> {
  if (!store.handicaps) return rows.map(r => entry(r, null, whole))
  const clubId = rows[0]?.clubId
  const indexes = clubId ? await listIndexes(store.handicaps, clubId, rows).catch(() => new Map<string, number | null>()) : new Map()
  return rows.map(r => entry(r, indexes.get(r.id) ?? null, whole))
}

/** Who is asking, as clubMay reads them: their row's ticks (not taken off). Staff are asked for where they may act (stage (k1)). */
function askerOf(row: MemberRecord | null | undefined): Asker {
  return { row: row && !row.removedAt ? credentialsOf(row) : null, staff: false }
}

/** What somebody holds who is on no row here — Green Dot staff, at a club not theirs. */
const NO_CREDENTIALS: Credentials = { owner: false, playsHere: false, officer: false, clubhouse: false }

const may = (act: ClubAct, row: MemberRecord | null | undefined) => clubMay(act, askerOf(row))

/** The log, fail-soft: a change is never undone for want of its line. */
async function logged(store: ClubStore, entries: ActivityEntry[]) {
  if (!store.logActivity || entries.length === 0) return
  await store.logActivity(entries).catch(e => console.error('club activity not logged:', e))
}

/** The fields of a row as the log keeps them — numbers as the screen shows them. */
function loggable(r: MemberRecord): Record<string, unknown> {
  const c = credentialsOf(r)
  return {
    name: r.name, memberNumber: maskNumber(r.memberNumber), guiNumber: maskNumber(r.guiNumber), email: r.email,
    onBoards: r.onBoards, playsHere: c.playsHere, officer: c.officer, clubhouse: c.clubhouse, owner: c.owner,
    // Stage (m): the log keeps that the gender or date of birth changed, never what it was.
    gender: r.gender ? 'set' : null, birthDate: r.birthDate ? 'set' : null, categoryId: r.categoryId ?? null,
  }
}

/**
 * A person's gender and date of birth changed from a club's list: one value
 * everywhere (Ross, 17 Nov 2026) — a linked row's go to the account and
 * every list row of theirs; a row nobody has linked holds its own.
 */
export async function setDetails(store: ClubStore, row: MemberRecord, patch: { gender?: Gender | null; birthDate?: string | null }) {
  if (patch.gender === undefined && patch.birthDate === undefined) return
  if (row.userId && store.saveDetails) return store.saveDetails(row.userId, patch)
  const p: RowPatch = {}
  if (patch.gender !== undefined) p.gender = patch.gender
  if (patch.birthDate !== undefined) p.birth_date = patch.birthDate
  await store.updateRow(row.id, p)
}

/**
 * A row just linked to an account (stage (m)): the account's gender and date
 * of birth stand where it has them, the row's fill what it lacks — and then
 * every list row of theirs carries the result (D179's rule for the index).
 */
export async function linkDetails(store: ClubStore, userId: string, row: MemberRecord) {
  if (!store.accountDetails || !store.saveDetails) return
  const acct = await store.accountDetails(userId)
  const gender = acct?.gender ?? row.gender ?? null
  const birthDate = acct?.birthDate ?? row.birthDate ?? null
  if (gender === null && birthDate === null) return
  await store.saveDetails(userId, { gender, birthDate })
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {}
  for (const k of Object.keys(after)) if (before[k] !== after[k]) out[k] = [before[k] ?? null, after[k] ?? null]
  return out
}

function asRows(v: unknown): ListRow[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_LIST_ROWS) return null
  return v.map(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return cleanRow({
      name: str(o.name), memberNumber: str(o.memberNumber), guiNumber: str(o.guiNumber), email: str(o.email),
      gender: str(o.gender), birthDate: str(o.birthDate), category: str(o.category),
    })
  })
}

/** A uuid from random bytes — the log's batch id, so a pasted list's lines read as one change. */
function uuidFrom(b: Uint8Array): string {
  const h = [...b.slice(0, 16)].map((x, i) => ((i === 6 ? (x & 0x0f) | 0x40 : i === 8 ? (x & 0x3f) | 0x80 : x)).toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/**
 * Every verified club this account is on (D218, D223), by name, with the
 * cards waiting on it at each club but this one — the header's next club and
 * its dot. Null when there is only the one, so nothing more is asked.
 */
async function otherClubs(store: ClubStore, userId: string, here: string): Promise<{ slug: string; name: string; toSign: number; crestUrl: string | null }[] | null> {
  const mine = (await store.clubsOf(userId)).filter(x => !!x.club.verifiedAt)
  if (mine.length < 2) return null
  const counts = await Promise.all(mine.map(x => (x.club.id === here || !store.cardsToSign
    ? Promise.resolve(0)
    : store.cardsToSign(x.club.id, x.row.id).then(l => l.reduce((n, c) => n + c.count, 0)).catch(() => 0))))
  // MO1, M1 (D280): the picker draws each club's crest.
  return mine.map((x, i) => ({ slug: x.club.slug, name: x.club.name, toSign: counts[i], crestUrl: clubAssetUrl(assetBase ?? store.assetBase(), x.club.crestPath ?? null) }))
}

/**
 * Setting up a club — **Green Dot's own act, from /admin** (Ross, 17 Nov
 * 2026; a member can no longer do it): a name, the Green Dot account that
 * owns it (named by the admin, so it goes on the list as its first owner,
 * linked from the start) and, for a club the admin makes, verified at once.
 * The address is the name's, made unique. Handed the store so `test:clubs`
 * runs it on the stand-in.
 */
export async function provisionClub(
  store: Pick<ClubStore, 'slugsLike' | 'createClub'>,
  input: { name: string; owner: { userId: string; email: string | null; name: string }; verified: boolean },
): Promise<{ ok: true; club: ClubRecord } | { ok: false; error: string }> {
  const issue = clubNameIssue(input.name)
  if (issue) return { ok: false, error: issue }
  const ownerName = normaliseClubName(input.owner.name)
  if (!ownerName) return { ok: false, error: 'Give the owner’s name as it goes on the club’s list.' }
  const name = normaliseClubName(input.name)
  const base = clubSlug(name)
  const slug = nextSlug(base, await store.slugsLike(base))
  const club = await store.createClub(
    { slug, name, createdBy: input.owner.userId, verified: input.verified },
    { name: ownerName.slice(0, 80), email: input.owner.email, userId: input.owner.userId },
  )
  return { ok: true, club }
}

export async function runClub(
  input: Record<string, unknown> & { token: string | null; action: unknown; address?: string },
  store: ClubStore,
  now: Date,
): Promise<ClubOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  // The members home only reads: its token may be checked locally (D195).
  const user = await (input.action === 'home' && store.readerFromToken ? store.readerFromToken(input.token) : store.userFromToken(input.token))
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  assetBase = store.assetBase()

  if (input.action === 'mine') {
    const mine = await store.clubsOf(user.id)
    return { status: 200, body: { ok: true, clubs: mine.map(x => summary(x.club, x.row)) } }
  }

  // Clubs are Green Dot's to set up, from /admin — never a member's (Ross, 17 Nov 2026).
  if (input.action === 'create') return fail(403, 'Clubs are set up by Green Dot. Write to us to have yours added.')

  if (input.action === 'link') return runLink(input, user, store, now)

  // The members home (D157, D159): only for somebody on a verified club's
  // list, linked and not removed. Anybody else is answered "not on the
  // list", and their page stays the public face.
  if (input.action === 'home') {
    // D195: the club, this account's row and the club's events in one wave
    // (`clubHome`), then everything else — phases included — in a second.
    // A store without it, or a first wave that could not be read whole,
    // takes the reads one by one as before.
    const slug = str(input.slug)
    const first = store.clubHome ? await store.clubHome(slug, user.id).catch(() => null) : null
    let club: ClubRecord | null, mineRow: MemberRecord | null | undefined, events: ClubEvent[]
    if (first) {
      ({ club, row: mineRow } = first)
      events = first.events
    } else {
      club = await store.clubBySlug(slug)
      if (!club || !club.verifiedAt) return fail(404, 'No such club.')
      mineRow = (await store.rows(club.id)).find(r => r.userId === user.id && !r.removedAt)
      events = mineRow ? await store.clubEvents(club.id) : []
    }
    if (!club || !club.verifiedAt) return fail(404, 'No such club.')
    if (!mineRow) return fail(403, 'You’re not on this club’s list.')
    const row = mineRow
    const today = irishToday(now)
    const past = events.filter(e => clubEventWhen(e, today) === 'past').map(e => e.code)
    const comps = events.some(e => e.competition)
    const compList = first?.comps.map(c => ({ ...c, name: events.find(e => e.code === c.code)?.name })) ?? undefined
    const clubId = club.id
    const matchCodes = events.filter(e => e.competition?.matchPlay).map(e => e.code)
    const [entries, season, outside, tops, toSign, phases, myClubs, notes, matches, partners] = await Promise.all([
      events.length ? store.entries(user.id, events.map(e => e.code)) : Promise.resolve([]),
      store.seasonRows(user.id, Number(today.slice(0, 4))),
      store.outsideEvents(user.id, events.map(e => e.code), club.id),
      past.length ? store.topScores(past) : Promise.resolve({}),
      comps && store.cardsToSign ? store.cardsToSign(club.id, row.id, compList).catch(() => []) : Promise.resolve([]),
      first?.comps.length && store.compPhases ? store.compPhases(first.comps).catch(() => null) : Promise.resolve(null),
      otherClubs(store, user.id, clubId).catch(() => null),
      // Stage c1, M3–M6: the club's own events this member may see — in this
      // wave, beside everything else, never a third.
      membersNotes(store, clubId, user.id, today).catch(() => [] as ClubNote[]),
      // Stage 3 (D266): this member's matches, for Comps' Matches and Home.
      matchCodes.length && store.myMatches ? store.myMatches(row.id, matchCodes).catch(() => []) : Promise.resolve([]),
      // Stage 4: "Entered with Dave" on a pairs match play.
      matchCodes.length && store.pairPartners ? store.pairPartners(row.id, matchCodes).catch(() => ({})) : Promise.resolve({}),
    ])
    if (phases) {
      events = events.map(e => (e.competition ? { ...e, competition: { ...e.competition, phase: phases.get(e.code) ?? e.competition.phase } } : e))
    }
    // MO3 (D282): the home carries what Home and Comps show — on now, the
    // next two weeks, everything this member entered, the latest results and
    // the match plays — and the whole season only when asked (`whole`, See all).
    const more = { upcoming: 0, past: 0 }
    if (input.whole !== true) {
      const last = addDaysIso(today, COMPS_DAYS_AHEAD - 1)
      const recent = new Set(events.filter(e => clubEventWhen(e, today) === 'past')
        .sort((a, b) => (b.endDate ?? b.startDate ?? '').localeCompare(a.endDate ?? a.startDate ?? '')).slice(0, COMPS_RESULTS).map(e => e.code))
      const kept = events.filter(e => {
        const when = clubEventWhen(e, today)
        if (entries.includes(e.code) || e.competition?.matchPlay || when === 'now') return true
        if (when === 'upcoming') return !!e.startDate && e.startDate <= last
        return recent.has(e.code)
      })
      more.upcoming = events.filter(e => clubEventWhen(e, today) === 'upcoming').length
      more.past = events.filter(e => clubEventWhen(e, today) === 'past').length
      events = kept
    }
    // D161: the home course, for New competition's first answer (089) — in
    // the first wave's club already; read again only on the old path.
    const full = first ? null : may('run_events', row) ? await store.club(club.id).catch(() => null) : null
    const mineRowName = row.name
    // Season stats are per club (D223): this club's rounds and the
    // account's own rounds outside any club — never another club's.
    const seasonHere = season.rows.filter(r => !r.club_id || r.club_id === clubId)
    return {
      status: 200,
      body: {
        ok: true, club: summary(full ?? club, row), events, entries, me: { name: mineRowName },
        ...(input.whole === true ? { whole: true } : { more }),
        season: seasonHere, courses: season.courses, ...(season.index?.length ? { indexTrend: season.index } : {}), outside, tops, toSign, notes,
        ...(matches.length ? { matches } : {}),
        ...(Object.keys(partners).length ? { partners } : {}),
        ...(myClubs && myClubs.length > 1 ? { myClubs } : {}),
      },
    }
  }

  // Stage (k1): the Clubhouse's own reads and bulk changes.
  if (isClubhouseAction(input.action)) return runClubhouse(input, user, store, now, summary)

  // ─── Everything below is one club's, its Clubhouse holders' and Green Dot staff's ───
  const clubId = str(input.clubId)
  if (!clubId) return fail(400, 'Which club?')
  const club = await store.club(clubId)
  if (!club) return fail(404, 'No such club.')
  const rows = await store.rows(clubId)
  const mine = rows.find(r => r.userId === user.id && !r.removedAt) ?? null
  // D222: Green Dot staff reach any club's list from the Clubhouse.
  const staff = !mine && store.isStaff ? await store.isStaff(user.id).catch(() => false) : false
  if (!mine && !staff) return fail(403, 'You’re not on this club’s list.')
  const held = mine ?? NO_CREDENTIALS

  if (input.action === 'club') {
    return { status: 200, body: { ok: true, club: { ...summary(club, held), ...(staff ? { staff } : {}) } } }
  }
  const asker: Asker = { row: mine ? credentialsOf(mine) : null, staff }
  const look = input.action === 'home-course' || input.action === 'colour'
  if (!clubMay(look ? 'set_look' : 'keep_list', asker)) return fail(403, look ? NOT_LOOK : NOT_ON)
  const owners = rows.filter(r => credentialsOf(r).owner && !r.removedAt).length
  // Whole numbers for the Clubhouse (Ross, 16 Nov 2026) — asked for by name, its holders only.
  const whole = input.whole === true && clubMay('open_clubhouse', asker)
  const me = { ...summary(club, held), ...(staff ? { staff } : {}) }
  const slim = input.slim === true
  const fresh = async (): Promise<ClubOutcome> => ({ status: 200, body: { ok: true, club: me, list: await listOf(store, await store.rows(clubId), whole) } })
  const line = (action: string, target: MemberRecord | null, changes: Record<string, [unknown, unknown]>, batchId: string | null = null): ActivityEntry => ({
    clubId, byUser: user.id, byName: mine?.name ?? STAFF_NAME, byStaff: !mine, action,
    memberId: target?.id ?? null, memberName: target?.name ?? null, changes, batchId,
  })

  if (input.action === 'members') return { status: 200, body: { ok: true, club: me, list: await listOf(store, rows, whole) } }

  // D161: the club's home course — new competitions default to it. A course
  // without a card can be chosen; the screen asks for its photo there.
  if (input.action === 'home-course') {
    const courseId = input.courseId === null || input.courseId === '' ? null : str(input.courseId)
    if (courseId && store.courseExists && !(await store.courseExists(courseId))) return fail(404, 'No such course.')
    try {
      await store.updateClub(clubId, { home_course_id: courseId })
    } catch {
      return fail(503, 'Could not save the home course — try again.')
    }
    await logged(store, [line('home_course', null, { homeCourseId: [club.homeCourseId ?? null, courseId] })])
    return { status: 200, body: { ok: true, club: { ...summary({ ...club, homeCourseId: courseId }, held), ...(staff ? { staff } : {}) } } }
  }

  if (input.action === 'colour') {
    const colour = input.colour === null || input.colour === '' ? null : cleanHex(input.colour)
    if (input.colour && !colour) return fail(400, 'Choose a colour.')
    await store.updateClub(clubId, { colour })
    await logged(store, [line('look', null, { colour: [club.colour ?? null, colour] })])
    const after = await store.club(clubId)
    return { status: 200, body: { ok: true, club: { ...summary(after ?? club, held), ...(staff ? { staff } : {}) } } }
  }

  if (input.action === 'add') {
    const incoming = asRows(input.rows)
    if (!incoming) return fail(400, `Add between 1 and ${MAX_LIST_ROWS} rows at a time.`)
    // Stage (m): a gender, a date of birth and a membership code, read
    // against the club's memberships — a row with one that will not read is
    // held back with why, as a bad number is.
    const cats = incoming.some(r => r.category !== undefined) && store.categories ? await store.categories(clubId) : []
    const today = irishToday(now)
    const extrasWhy = (r: ListRow) => { const x = resolveExtras(r, cats, today); return x.ok ? null : x.why }
    const extrasOf = (r: ListRow) => { const x = resolveExtras(r, cats, today); return x.ok ? x.extras : {} }
    const bad = incoming.map(r => ({ r, why: listRowIssue(r) ?? extrasWhy(r) })).filter(x => x.why)
    const plan = planList(rows.map(r => ({
      id: r.id, name: r.name, memberNumber: r.memberNumber, guiNumber: r.guiNumber, email: r.email, removed: !!r.removedAt,
    })), incoming.filter(r => !listRowIssue(r) && !extrasWhy(r)))
    const skipped = [...bad.map(x => ({ name: x.r.name || '(no name)', why: x.why! })), ...plan.skipped.map(s => ({ name: s.row.name, why: s.why }))]
    let updated = 0
    const batchId = uuidFrom(store.randomBytes(16))
    const lines: ActivityEntry[] = []
    for (const u of plan.updates) {
      const patch: RowPatch = {}
      if (u.patch.name !== undefined) patch.name = u.patch.name
      if (u.patch.memberNumber !== undefined) patch.member_number = u.patch.memberNumber
      if (u.patch.guiNumber !== undefined) patch.gui_number = u.patch.guiNumber
      if (u.patch.email !== undefined) patch.email = u.patch.email
      if (u.restore) patch.removed_at = null
      const was = rows.find(r => r.id === u.id) ?? null
      const x = extrasOf(u.row)
      if (x.categoryId !== undefined && x.categoryId !== (was?.categoryId ?? null)) patch.category_id = x.categoryId
      const details = {
        ...(x.gender !== undefined && x.gender !== (was?.gender ?? null) ? { gender: x.gender } : {}),
        ...(x.birthDate !== undefined && x.birthDate !== (was?.birthDate ?? null) ? { birthDate: x.birthDate } : {}),
      }
      if (!Object.keys(patch).length && !Object.keys(details).length) continue
      let result: 'ok' | 'clash' = 'ok'
      try {
        if (Object.keys(patch).length) result = await store.updateRow(u.id, patch)
        if (result === 'ok' && was) await setDetails(store, was, details)
      } catch (e) {
        if ((e as Error)?.name !== 'TicksNotReady') throw e
        skipped.push({ name: was?.name ?? '', why: 'Memberships, genders and dates of birth aren’t set up yet — try again later.' })
        continue
      }
      if (result === 'clash') skipped.push({ name: u.patch.name ?? was?.name ?? '', why: 'A number is already another person’s on the list.' })
      else {
        updated++
        if (was) {
          const now2: MemberRecord = { ...was, ...(u.patch.name !== undefined ? { name: u.patch.name } : {}),
            ...(u.patch.memberNumber !== undefined ? { memberNumber: u.patch.memberNumber } : {}),
            ...(u.patch.guiNumber !== undefined ? { guiNumber: u.patch.guiNumber } : {}),
            ...(u.patch.email !== undefined ? { email: u.patch.email } : {}),
            ...(u.restore ? { removedAt: null } : {}),
            ...(patch.category_id !== undefined ? { categoryId: patch.category_id } : {}),
            ...(details.gender !== undefined ? { gender: details.gender } : {}),
            ...(details.birthDate !== undefined ? { birthDate: details.birthDate } : {}) }
          lines.push(line(u.restore ? 'row.restore' : 'row.update', was, diff(loggable(was), loggable(now2)), batchId))
        }
      }
    }
    const added = plan.inserts.length ? await store.insertRows(clubId, plan.inserts, plan.inserts.map(extrasOf)) : 0
    const after = await store.rows(clubId)
    for (const r of plan.inserts) {
      const made = after.find(a => a.name === r.name && a.memberNumber === r.memberNumber && a.guiNumber === r.guiNumber && a.email === r.email)
      lines.push(line('row.add', made ?? null, diff({}, { name: r.name, memberNumber: maskNumber(r.memberNumber), guiNumber: maskNumber(r.guiNumber), email: r.email }), batchId))
    }
    await logged(store, lines)
    if (slim) return { status: 200, body: { ok: true, club: me, added, updated, skipped } }
    return { status: 200, body: { ok: true, club: me, list: await listOf(store, after, whole), added, updated, skipped } }
  }

  const target = rows.find(r => r.id === str(input.memberId))
  if (!target) return fail(404, 'That person isn’t on the list.')

  if (input.action === 'update') {
    const patch: RowPatch = {}
    const fields = { name: input.name, memberNumber: input.memberNumber, guiNumber: input.guiNumber, email: input.email }
    if (fields.name !== undefined || fields.memberNumber !== undefined || fields.guiNumber !== undefined || fields.email !== undefined) {
      // A number typed replaces the stored one; left out, it stays — the
      // screen only ever sees it partly hidden.
      const row = cleanRow({
        name: fields.name !== undefined ? str(fields.name) : target.name,
        memberNumber: fields.memberNumber !== undefined ? str(fields.memberNumber) : target.memberNumber,
        guiNumber: fields.guiNumber !== undefined ? str(fields.guiNumber) : target.guiNumber,
        email: fields.email !== undefined ? str(fields.email) : target.email,
      })
      const issue = listRowIssue(row)
      if (issue) return fail(400, issue)
      Object.assign(patch, { name: row.name, member_number: row.memberNumber, gui_number: row.guiNumber, email: row.email })
    }
    // The ticks (D219, D220): each one given or taken by whoever clubMay says.
    const change: Partial<Credentials> = {}
    if (input.playsHere !== undefined) return fail(409, PLAYS_FOLLOWS_MEMBERSHIP)
    for (const k of ['officer', 'clubhouse', 'owner'] as CredentialKey[]) {
      if (input[k] === undefined) continue
      if (typeof input[k] !== 'boolean') return fail(400, 'A tick is on or off.')
      change[k] = input[k] as boolean
    }
    const before = credentialsOf(target)
    if (Object.keys(change).length > 0) {
      const why = credentialChangeIssue(asker, { credentials: before, removed: !!target.removedAt }, change, owners)
      if (why) return fail(why.startsWith('Only') ? 403 : 409, why)
      const next = withChange(before, change)
      if (next.officer !== before.officer || next.clubhouse !== before.clubhouse || next.owner !== before.owner) {
        Object.assign(patch, { officer: next.officer, clubhouse: next.clubhouse, role: storedRole(next) })
      }
    }
    if (typeof input.onBoards === 'boolean') patch.on_boards = input.onBoards
    // Stage (m): the row's membership, and the person's gender and date of
    // birth — one value everywhere (Ross, 17 Nov 2026), so a linked row's go
    // to the account and every list row of theirs.
    const details: { gender?: Gender | null; birthDate?: string | null } = {}
    if (input.gender !== undefined) {
      const g = input.gender === null || input.gender === '' ? null : input.gender
      if (g !== null && g !== 'M' && g !== 'F') return fail(400, 'Male, Female or not given.')
      details.gender = g
    }
    if (input.birthDate !== undefined) {
      if (input.birthDate === null || input.birthDate === '') details.birthDate = null
      else {
        const b = readBirthDate(str(input.birthDate), irishToday(now))
        if (!b.ok) return fail(400, b.why)
        details.birthDate = b.value ?? null
      }
    }
    if (input.categoryId !== undefined) {
      const id = input.categoryId === null || input.categoryId === '' ? null : str(input.categoryId)
      if (id && !(store.categories ? await store.categories(clubId) : []).some(c => c.id === id)) return fail(404, 'That membership isn’t the club’s.')
      patch.category_id = id
    }
    if (details.gender !== undefined || details.birthDate !== undefined) {
      try {
        await setDetails(store, target, details)
      } catch (e) {
        if ((e as Error)?.name === 'TicksNotReady') return fail(503, PEOPLE_LATER)
        throw e
      }
    }
    // D179: the one index — a linked row's is the account's, an unlinked
    // row's its own — through the one writer, logged as the list's.
    if (input.handicapIndex !== undefined) {
      if (!store.handicaps) return fail(503, 'Handicaps aren’t set up yet.')
      const read = readIndex(input.handicapIndex)
      if (!read.ok) return fail(400, read.why)
      try {
        await setIndex(store.handicaps, target.userId ? { userId: target.userId } : { memberId: target.id }, read.value, user.id, 'list')
      } catch {
        return fail(503, 'Could not save the index — try again.')
      }
    }
    if (Object.keys(patch).length > 0) {
      try {
        if ((await store.updateRow(target.id, patch)) === 'clash') return fail(409, 'That number is already another person’s on the list.')
      } catch (e) {
        if ((e as Error)?.name === 'TicksNotReady') return fail(503, patch.category_id !== undefined ? PEOPLE_LATER : TICKS_LATER)
        throw e
      }
    }
    const after: MemberRecord = {
      ...target,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.member_number !== undefined ? { memberNumber: patch.member_number } : {}),
      ...(patch.gui_number !== undefined ? { guiNumber: patch.gui_number } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.on_boards !== undefined ? { onBoards: patch.on_boards } : {}),
      ...(patch.role !== undefined ? { role: patch.role, officer: patch.officer, clubhouse: patch.clubhouse } : {}),
      ...(patch.category_id !== undefined ? { categoryId: patch.category_id } : {}),
      ...(details.gender !== undefined ? { gender: details.gender } : {}),
      ...(details.birthDate !== undefined ? { birthDate: details.birthDate } : {}),
    }
    const changes = diff(loggable(target), loggable(after))
    if (Object.keys(changes).length) await logged(store, [line(patch.role !== undefined ? 'credentials' : 'row.update', target, changes)])
    if (slim) return { status: 200, body: { ok: true, club: me } }
    return await fresh()
  }

  if (input.action === 'remove') {
    const why = removeIssue(asker, { credentials: credentialsOf(target), removed: !!target.removedAt }, owners)
    if (why) return fail(why.startsWith('Only') ? 403 : 409, why)
    // Severed, never deleted: the row stays, the link is cut, the access it
    // gave ends at once — and their account and their golf are untouched.
    // D179: the row keeps a copy of their index, so the list is never blank.
    if (target.userId && store.handicaps) await severIndex(store.handicaps, target.userId, target.id, user.id).catch(e => console.error('index copy failed:', e))
    await store.updateRow(target.id, { removed_at: now.toISOString(), user_id: null, linked_at: null })
    await logged(store, [line('row.remove', target, { removed: [false, true], linked: [!!target.userId, false] })])
    if (slim) return { status: 200, body: { ok: true, club: me } }
    return await fresh()
  }

  if (input.action === 'restore') {
    // Putting back somebody who held Clubhouse gives it back: an owner's or Green Dot's to do.
    const c = credentialsOf(target)
    if ((c.clubhouse && !clubMay('grant_clubhouse', asker)) || (c.owner && !clubMay('grant_owner', asker))) {
      return fail(403, 'Only an owner or Green Dot puts back someone with Clubhouse.')
    }
    await store.updateRow(target.id, { removed_at: null })
    await logged(store, [line('row.restore', target, { removed: [true, false] })])
    if (slim) return { status: 200, body: { ok: true, club: me } }
    return await fresh()
  }

  if (input.action === 'invite') {
    if (target.removedAt) return fail(409, 'Put them back on the list first.')
    if (target.userId) return fail(409, 'Already linked to their account.')
    if (!target.email) return fail(400, 'Add their email first — the code goes to it.')
    const last = await store.lastInviteAt(target.id)
    if (last && now.getTime() - Date.parse(last) < INVITE_RESEND_MINUTES * 60_000) {
      return fail(429, `A code went to them a moment ago — wait ${INVITE_RESEND_MINUTES} minutes before sending another.`)
    }
    const code = inviteCodeFrom(store.randomBytes(16))
    await store.saveInvite({
      memberId: target.id, email: target.email, codeHash: inviteHash(code),
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
    })
    if (store.markInvited) await store.markInvited(target.id, now.toISOString()).catch(() => undefined)
    const mail = inviteEmail({ clubName: club.name, name: target.name, code, site: store.siteOrigin() })
    const sent = await store.sendEmail(target.email, mail.subject, mail.html, mail.text).catch(() => false)
    if (!sent) return fail(503, 'Could not send the email — try again.')
    await logged(store, [line('invite', target, { email: [null, target.email] })])
    return { status: 200, body: { ok: true, sentTo: target.email } }
  }

  return fail(400, 'Nothing to do.')
}

/** A member types the code from the club's email: their account joins that row. */
async function runLink(input: Record<string, unknown> & { address?: string }, user: AuthUser, store: ClubStore, now: Date): Promise<ClubOutcome> {
  const raw = str(input.code)
  const issue = inviteCodeIssue(raw)
  if (issue) return fail(400, issue)
  const key = inviteTryKey(input.address ?? 'unknown')
  const windows = await store.readAttempts([key])
  const w = windows.get(key) ?? null
  if (attemptBlocked(w, INVITE_TRY_LIMIT, now)) return fail(429, TOO_MANY)
  const wrong = async (why: string) => { await store.writeAttempt(key, afterFailure(w, INVITE_TRY_LIMIT, now)); return fail(403, why) }

  const invite = await store.inviteByHash(inviteHash(raw))
  if (!invite) return wrong('That code isn’t right — check the club’s email.')
  if (invite.usedAt) return fail(409, 'That code has been used. Ask the club for a new one.')
  if (Date.parse(invite.expiresAt) <= now.getTime()) return fail(409, 'That code has run out. Ask the club for a new one.')
  const row = await store.row(invite.memberId)
  if (!row) return fail(404, 'That place on the list is gone. Ask the club.')
  if (row.removedAt) return fail(409, 'The club has taken that place off its list. Ask the club.')
  if (row.userId && row.userId !== user.id) return fail(409, 'That place on the list is already linked to another account. Ask the club.')
  const club = await store.club(row.clubId)
  if (!club) return fail(404, 'No such club.')
  if (row.userId === user.id) return { status: 200, body: { ok: true, club: summary(club, row) } }

  // D218, D223: many clubs per account — one place on each club's list.
  const sameClub = (await store.clubsOf(user.id)).find(x => x.club.id === club.id)
  if (sameClub) return fail(409, `Your account is already on ${club.name}’s list. Ask the club if this is a second place for you.`)
  // One GUI number to one account (Ross, 14 Nov 2026): a clash is never
  // quietly moved — the club sorts it out.
  if (row.guiNumber) {
    const holders = (await store.guiHolders(row.guiNumber)).filter(id => id !== user.id)
    if (holders.length > 0) return fail(409, 'That GUI number is linked to another Green Dot account. The club will sort it out — ask them.')
    const mineGuis = (await store.guisOf(user.id)).filter(g => g !== row.guiNumber)
    if (mineGuis.length > 0) return fail(409, 'Your account already has a different GUI number on another club’s list. Ask the club to check your number.')
  }
  if (!(await store.useInvite(invite.id, now.toISOString()))) return fail(409, 'That code has been used. Ask the club for a new one.')
  if ((await store.updateRow(row.id, { user_id: user.id, linked_at: now.toISOString() })) === 'clash') {
    return fail(409, `Your account is already on ${club.name}’s list.`)
  }
  // D179: one index — the account's stands, the row's goes, a difference said once.
  const note = store.handicaps ? await linkIndex(store.handicaps, user.id, row.id, club.name).catch(() => null) : null
  // Stage (m): the same for the gender and date of birth — the account's stand.
  await linkDetails(store, user.id, row).catch(e => console.error('details link failed:', e))
  return { status: 200, body: { ok: true, club: summary(club, row), ...(note ? { note } : {}) } }
}

/**
 * An image for the club's look — its crest, its art, or the optional dark
 * art — from one of its owners or admins. Checked (D126: art landscape and
 * at least 1170 wide), resized and turned to WebP on the server (D156), kept
 * under a fresh name so no phone shows a stale copy, and the old one let go.
 * `bytes: null` takes the image off.
 */
export async function runUpload(
  input: { token: string | null; clubId: unknown; kind: unknown; bytes: Uint8Array | null },
  store: ClubStore,
  images: ImageWork,
): Promise<ClubOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  assetBase = store.assetBase()
  const kind = CLUB_IMAGE_KINDS.find(k => k === input.kind)
  if (!kind) return fail(400, 'Which image?')
  const clubId = str(input.clubId)
  const club = clubId ? await store.club(clubId) : null
  if (!club) return fail(404, 'No such club.')
  const mine = (await store.rows(club.id)).find(r => r.userId === user.id && !r.removedAt)
  if (!mine || !may('set_look', mine)) return fail(403, NOT_LOOK)
  const column = IMAGE_COLUMN[kind]
  const old = kind === 'crest' ? club.crestPath : kind === 'art' ? club.artPath : club.artDarkPath

  if (input.bytes === null) {
    await store.updateClub(club.id, { [column]: null })
    if (old) await store.removeImage(old).catch(() => undefined)
    const after = await store.club(club.id)
    return { status: 200, body: { ok: true, club: summary(after ?? club, mine) } }
  }

  const seen = await images.inspect(input.bytes)
  const issue = clubImageIssue(kind, { format: seen?.format ?? null, width: seen?.width ?? 0, height: seen?.height ?? 0, bytes: input.bytes.length })
  if (issue) return fail(400, issue)
  const webp = await images.prepare(kind, input.bytes)
  const tag = [...store.randomBytes(6)].map(b => (b % 36).toString(36)).join('')
  const path = `${club.id}/${kind}-${tag}.webp`
  await store.putImage(path, webp)
  await store.updateClub(club.id, { [column]: path })
  if (old && old !== path) await store.removeImage(old).catch(() => undefined)
  await logged(store, [{ clubId: club.id, byUser: user.id, byName: mine.name, byStaff: false, action: 'look', memberId: null, memberName: null, changes: { [kind]: [old ?? null, path] }, batchId: null }])
  const after = await store.club(club.id)
  return { status: 200, body: { ok: true, club: summary(after ?? club, mine) } }
}
