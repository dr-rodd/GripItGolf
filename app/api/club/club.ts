// The server's half of clubs (stage (c); lib/clubs.ts has the rules).
//
// Handed its store, so `test:clubs` runs every path against a stand-in
// (`store.ts` is the service-role store, `route.ts` the plumbing). Every ask
// carries the phone's Supabase token; **every action here needs a Green Dot
// member** — and nothing anybody needs to join, play, score or watch ever
// comes through here (D94).
//
// * `mine` — the clubs this account is on, its role in each.
// * `create` — set up a club: unverified until Ross approves it in /admin,
//   the maker its first owner, linked from the start.
// * `members` — the club's list, for its owners and admins: numbers shown
//   partly hidden, never whole.
// * `add` — rows typed or pasted, matched to the list by GUI number, then
//   member number, then email (`planList`); nobody is taken off by missing.
// * `update`, `remove`, `restore` — one row. Removing keeps the row and cuts
//   its link: the access it gave ends on the next page load. A club never
//   deletes an account. Roles are the owners' to change; a club keeps an owner.
// * `invite` — a code emailed to the address on the row (kept only as a
//   hash, 14 days, one use).
// * `link` — the code typed by a signed-in member: their account joins that
//   row. One GUI number to one account: a clash is held for the club.

import { createHash } from 'crypto'
import { readIndex } from '@/lib/handicapIndex'
import { linkIndex, listIndexes, setIndex, severIndex, type HandicapStore } from '../handicaps/handicaps'
import { isAccount, type AuthUser } from '@/lib/account'
import { cleanHex } from '@/lib/clubColour'
import type { SeasonRow } from '@/lib/cardSummary'
import { afterFailure, attemptBlocked, type AttemptWindow } from '@/lib/membership'
import {
  INVITE_DAYS, INVITE_RESEND_MINUTES, INVITE_TRY_LIMIT, MAX_CLUBS_MADE, MAX_LIST_ROWS,
  clubNameIssue, clubSlug, clubStatus, cleanRow, inviteCodeFrom, inviteCodeIssue, inviteEmail,
  lastOwnerIssue, listRowIssue, maskNumber, mayAdminister, mayChangeRoles, nextSlug, normaliseClubName,
  normaliseInviteCode, planList, oneClubIssue, clubAssetUrl, clubImageIssue, IMAGE_COLUMN, CLUB_IMAGE_KINDS,
  clubEventWhen, irishToday,
  type ClubEvent, type ClubImageKind, type ClubRole, type ClubStatus, type ListRow,
} from '@/lib/clubs'

export interface ClubRecord {
  id: string; slug: string; name: string; verifiedAt: string | null; refusedAt: string | null
  /** The look (086's colour and crest, 087's art) — absent before 087, or unset. */
  colour?: string | null
  crestPath?: string | null
  artPath?: string | null
  artDarkPath?: string | null
  /** Stage (d1), D161: the club's home course (089) — absent before it, or unset. */
  homeCourseId?: string | null
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
}

export type RowPatch = Partial<{
  name: string; member_number: string | null; gui_number: string | null; email: string | null
  role: ClubRole; user_id: string | null; linked_at: string | null; removed_at: string | null; on_boards: boolean
}>

export interface ClubStore {
  userFromToken(token: string): Promise<AuthUser | null>
  /** The rows this account is linked to and not removed from, with their clubs. */
  clubsOf(userId: string): Promise<{ club: ClubRecord; row: MemberRecord }[]>
  clubsMadeBy(userId: string): Promise<number>
  /** Slugs already taken that start with this one. */
  slugsLike(base: string): Promise<string[]>
  createClub(c: { slug: string; name: string; createdBy: string }, owner: { name: string; email: string | null; userId: string }): Promise<ClubRecord>
  club(clubId: string): Promise<ClubRecord | null>
  /** Every row on a club's list, removed ones too. */
  rows(clubId: string): Promise<MemberRecord[]>
  insertRows(clubId: string, rows: ListRow[]): Promise<number>
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
  updateClub(clubId: string, patch: Partial<{ colour: string | null; crest_path: string | null; art_path: string | null; art_dark_path: string | null; home_course_id: string | null }>): Promise<void>
  /** Every event under the club, with who changes it. */
  clubEvents(clubId: string): Promise<ClubEvent[]>
  /** Of those events, the ones this account is linked to a player in (D134). */
  entries(userId: string, codes: string[]): Promise<string[]>
  /** Stage (f): this account's own card summaries for a year, and their courses' names. Empty before 088. */
  seasonRows(userId: string, year: number): Promise<{ rows: SeasonRow[]; courses: Record<string, string> }>
  /** This account's events outside the club — in them or made them — on now or to come (D143's "Outside the club", D144). */
  outsideEvents(userId: string, excludeCodes: string[]): Promise<ClubEvent[]>
  /** The best club-round score in each of these finished events, by code — from the summaries. */
  topScores(codes: string[]): Promise<Record<string, { name: string; points: number }>>
  /** An image kept in the bucket; the old one let go. */
  putImage(path: string, bytes: Uint8Array): Promise<void>
  removeImage(path: string): Promise<void>

  // Stage (d1) — the handicap index (D179) and the home course (D161), migration 089.
  handicaps?: HandicapStore
  /** Whether a course is one of the platform's. */
  courseExists?(courseId: string): Promise<boolean>
}

/** Reading and resizing an uploaded image (sharp, on the server — D156), handed in so tests need no images. */
export interface ImageWork {
  /** Format and size as the photo stands, turned upright. Null when it is not an image at all. */
  inspect(bytes: Uint8Array): Promise<{ format: string | null; width: number; height: number } | null>
  /** Resized and turned to WebP: art 1600 wide, a crest 512 across. */
  prepare(kind: ClubImageKind, bytes: Uint8Array): Promise<Uint8Array>
}

export interface ClubSummary {
  id: string; slug: string; name: string; status: ClubStatus; role: ClubRole
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
  role: ClubRole
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
  entries?: string[]
  /** The name on the club's list, for the greeting. */
  me?: { name: string }
  /** Stage (f): the account's own rounds this year (D143), with their courses. */
  season?: SeasonRow[]
  courses?: Record<string, string>
  outside?: ClubEvent[]
  tops?: Record<string, { name: string; points: number }>
  /** D179: said once on linking, when the club's index differed from the account's. */
  note?: string
}

export type ClubOutcome =
  | { status: 200; body: ClubBody }
  | { status: 400 | 401 | 403 | 404 | 409 | 429 | 503; body: { ok: false; error: string } }

type FailStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503
const fail = (status: FailStatus, error: string): ClubOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const TOO_MANY = 'Too many tries — wait a few minutes and try again.'
const NOT_ON = 'Only the club’s owners and admins keep its list.'

/** An invite code as kept: only ever hashed. */
export function inviteHash(code: string): string {
  return createHash('sha256').update(`club-invite|${normaliseInviteCode(code)}`, 'utf8').digest('hex')
}

/** The count of wrong codes from one address, the address only ever hashed. */
export function inviteTryKey(address: string): string {
  return `club-code:${createHash('sha256').update(`club|code|${address}`, 'utf8').digest('hex')}`
}

let assetBase: string | undefined
function summary(club: ClubRecord, role: ClubRole): ClubSummary {
  return {
    id: club.id, slug: club.slug, name: club.name, status: clubStatus(club), role,
    colour: cleanHex(club.colour),
    homeCourseId: club.homeCourseId ?? null,
    crestUrl: clubAssetUrl(assetBase, club.crestPath ?? null),
    artUrl: clubAssetUrl(assetBase, club.artPath ?? null),
    artDarkUrl: clubAssetUrl(assetBase, club.artDarkPath ?? null),
  }
}

function entry(r: MemberRecord, index: number | null = null): ListEntry {
  return {
    id: r.id, name: r.name,
    memberNumber: maskNumber(r.memberNumber), guiNumber: maskNumber(r.guiNumber), email: r.email,
    role: r.role, linked: !!r.userId, removed: !!r.removedAt, onBoards: r.onBoards, handicapIndex: index,
  }
}

/** A club's list as the screen reads it, each row with its one index (D179). */
async function listOf(store: ClubStore, rows: MemberRecord[]): Promise<ListEntry[]> {
  if (!store.handicaps) return rows.map(r => entry(r))
  const clubId = rows[0]?.clubId
  const indexes = clubId ? await listIndexes(store.handicaps, clubId, rows).catch(() => new Map<string, number | null>()) : new Map()
  return rows.map(r => entry(r, indexes.get(r.id) ?? null))
}

function asRows(v: unknown): ListRow[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_LIST_ROWS) return null
  return v.map(x => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return cleanRow({ name: str(o.name), memberNumber: str(o.memberNumber), guiNumber: str(o.guiNumber), email: str(o.email) })
  })
}

export async function runClub(
  input: Record<string, unknown> & { token: string | null; action: unknown; address?: string },
  store: ClubStore,
  now: Date,
): Promise<ClubOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  assetBase = store.assetBase()

  if (input.action === 'mine') {
    const mine = await store.clubsOf(user.id)
    return { status: 200, body: { ok: true, clubs: mine.map(x => summary(x.club, x.row.role)) } }
  }

  if (input.action === 'create') {
    const issue = clubNameIssue(str(input.name))
    if (issue) return fail(400, issue)
    const yourName = normaliseClubName(str(input.yourName))
    if (!yourName) return fail(400, 'Type your own name, as it goes on the club’s list.')
    // D145, D150: one club per account, said by name.
    const onList = (await store.clubsOf(user.id))[0]
    if (onList) return fail(409, oneClubIssue(onList.club.name))
    if ((await store.clubsMadeBy(user.id)) >= MAX_CLUBS_MADE) return fail(409, `One account sets up at most ${MAX_CLUBS_MADE} clubs.`)
    const name = normaliseClubName(str(input.name))
    const base = clubSlug(name)
    const slug = nextSlug(base, await store.slugsLike(base))
    const club = await store.createClub({ slug, name, createdBy: user.id }, { name: yourName.slice(0, 80), email: user.email, userId: user.id })
    return { status: 200, body: { ok: true, club: summary(club, 'owner') } }
  }

  if (input.action === 'link') return runLink(input, user, store, now)

  // The members home (D157, D159): only for somebody on a verified club's
  // list, linked and not removed. Anybody else is answered "not on the
  // list", and their page stays the public face.
  if (input.action === 'home') {
    const club = await store.clubBySlug(str(input.slug))
    if (!club || !club.verifiedAt) return fail(404, 'No such club.')
    const mineRow = (await store.rows(club.id)).find(r => r.userId === user.id && !r.removedAt)
    if (!mineRow) return fail(403, 'You’re not on this club’s list.')
    const events = await store.clubEvents(club.id)
    const today = irishToday(now)
    const past = events.filter(e => clubEventWhen(e, today) === 'past').map(e => e.code)
    const [entries, season, outside, tops] = await Promise.all([
      events.length ? store.entries(user.id, events.map(e => e.code)) : Promise.resolve([]),
      store.seasonRows(user.id, Number(today.slice(0, 4))),
      store.outsideEvents(user.id, events.map(e => e.code)),
      past.length ? store.topScores(past) : Promise.resolve({}),
    ])
    return {
      status: 200,
      body: {
        ok: true, club: summary(club, mineRow.role), events, entries, me: { name: mineRow.name },
        season: season.rows, courses: season.courses, outside, tops,
      },
    }
  }

  // ─── Everything below is one club's, its owners' and admins' ───
  const clubId = str(input.clubId)
  if (!clubId) return fail(400, 'Which club?')
  const club = await store.club(clubId)
  if (!club) return fail(404, 'No such club.')
  const rows = await store.rows(clubId)
  const mine = rows.find(r => r.userId === user.id && !r.removedAt) ?? null
  if (!mine) return fail(403, 'You’re not on this club’s list.')

  if (input.action === 'club') {
    return { status: 200, body: { ok: true, club: summary(club, mine.role) } }
  }
  if (!mayAdminister(mine.role)) return fail(403, NOT_ON)
  const owners = rows.filter(r => r.role === 'owner' && !r.removedAt).length
  const listed = async (): Promise<ClubOutcome> => ({ status: 200, body: { ok: true, club: summary(club, mine.role), list: await listOf(store, rows) } })

  if (input.action === 'members') return await listed()

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
    return { status: 200, body: { ok: true, club: summary({ ...club, homeCourseId: courseId }, mine.role) } }
  }

  if (input.action === 'colour') {
    const colour = input.colour === null || input.colour === '' ? null : cleanHex(input.colour)
    if (input.colour && !colour) return fail(400, 'Choose a colour.')
    await store.updateClub(clubId, { colour })
    const after = await store.club(clubId)
    return { status: 200, body: { ok: true, club: summary(after ?? club, mine.role) } }
  }

  if (input.action === 'add') {
    const incoming = asRows(input.rows)
    if (!incoming) return fail(400, `Add between 1 and ${MAX_LIST_ROWS} rows at a time.`)
    const bad = incoming.map(r => ({ r, why: listRowIssue(r) })).filter(x => x.why)
    const plan = planList(rows.map(r => ({
      id: r.id, name: r.name, memberNumber: r.memberNumber, guiNumber: r.guiNumber, email: r.email, removed: !!r.removedAt,
    })), incoming.filter(r => !listRowIssue(r)))
    const skipped = [...bad.map(x => ({ name: x.r.name || '(no name)', why: x.why! })), ...plan.skipped.map(s => ({ name: s.row.name, why: s.why }))]
    let updated = 0
    for (const u of plan.updates) {
      const patch: RowPatch = {}
      if (u.patch.name !== undefined) patch.name = u.patch.name
      if (u.patch.memberNumber !== undefined) patch.member_number = u.patch.memberNumber
      if (u.patch.guiNumber !== undefined) patch.gui_number = u.patch.guiNumber
      if (u.patch.email !== undefined) patch.email = u.patch.email
      if (u.restore) patch.removed_at = null
      if ((await store.updateRow(u.id, patch)) === 'clash') skipped.push({ name: u.patch.name ?? rows.find(r => r.id === u.id)?.name ?? '', why: 'A number is already another person’s on the list.' })
      else updated++
    }
    const added = plan.inserts.length ? await store.insertRows(clubId, plan.inserts) : 0
    const after = await store.rows(clubId)
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: await listOf(store, after), added, updated, skipped } }
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
    if (input.role !== undefined) {
      const role = input.role
      if (role !== 'owner' && role !== 'admin' && role !== 'member') return fail(400, 'No such role.')
      if (role !== target.role) {
        if (!mayChangeRoles(mine.role)) return fail(403, 'Only an owner changes who runs the club.')
        const why = lastOwnerIssue({ role: target.role, removed: !!target.removedAt }, { role }, owners)
        if (why) return fail(409, why)
        patch.role = role
      }
    }
    if (typeof input.onBoards === 'boolean') patch.on_boards = input.onBoards
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
    if (Object.keys(patch).length === 0) return { status: 200, body: { ok: true, club: summary(club, mine.role), list: await listOf(store, await store.rows(clubId)) } }
    if ((await store.updateRow(target.id, patch)) === 'clash') return fail(409, 'That number is already another person’s on the list.')
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: await listOf(store, await store.rows(clubId)) } }
  }

  if (input.action === 'remove') {
    if (target.role !== 'member' && !mayChangeRoles(mine.role)) return fail(403, 'Only an owner takes an owner or admin off the list.')
    const why = lastOwnerIssue({ role: target.role, removed: !!target.removedAt }, { remove: true }, owners)
    if (why) return fail(409, why)
    // Severed, never deleted: the row stays, the link is cut, the access it
    // gave ends at once — and their account and their golf are untouched.
    // D179: the row keeps a copy of their index, so the list is never blank.
    if (target.userId && store.handicaps) await severIndex(store.handicaps, target.userId, target.id, user.id).catch(e => console.error('index copy failed:', e))
    await store.updateRow(target.id, { removed_at: now.toISOString(), user_id: null, linked_at: null })
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: await listOf(store, await store.rows(clubId)) } }
  }

  if (input.action === 'restore') {
    await store.updateRow(target.id, { removed_at: null })
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: await listOf(store, await store.rows(clubId)) } }
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
    const mail = inviteEmail({ clubName: club.name, name: target.name, code, site: store.siteOrigin() })
    const sent = await store.sendEmail(target.email, mail.subject, mail.html, mail.text).catch(() => false)
    if (!sent) return fail(503, 'Could not send the email — try again.')
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
  if (row.userId === user.id) return { status: 200, body: { ok: true, club: summary(club, row.role) } }

  const sameClub = (await store.clubsOf(user.id)).find(x => x.club.id === club.id)
  if (sameClub) return fail(409, `Your account is already on ${club.name}’s list. Ask the club if this is a second place for you.`)
  // D145, D150: one club per account, said by name. The tables could hold more.
  const elsewhere = (await store.clubsOf(user.id))[0]
  if (elsewhere) return fail(409, oneClubIssue(elsewhere.club.name))
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
  return { status: 200, body: { ok: true, club: summary(club, row.role), ...(note ? { note } : {}) } }
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
  if (!mine || !mayAdminister(mine.role)) return fail(403, 'Only the club’s owners and admins change its look.')
  const column = IMAGE_COLUMN[kind]
  const old = kind === 'crest' ? club.crestPath : kind === 'art' ? club.artPath : club.artDarkPath

  if (input.bytes === null) {
    await store.updateClub(club.id, { [column]: null })
    if (old) await store.removeImage(old).catch(() => undefined)
    const after = await store.club(club.id)
    return { status: 200, body: { ok: true, club: summary(after ?? club, mine.role) } }
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
  const after = await store.club(club.id)
  return { status: 200, body: { ok: true, club: summary(after ?? club, mine.role) } }
}
