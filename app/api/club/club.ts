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
import { isAccount, type AuthUser } from '@/lib/account'
import { afterFailure, attemptBlocked, type AttemptWindow } from '@/lib/membership'
import {
  INVITE_DAYS, INVITE_RESEND_MINUTES, INVITE_TRY_LIMIT, MAX_CLUBS_MADE, MAX_LIST_ROWS,
  clubNameIssue, clubSlug, clubStatus, cleanRow, inviteCodeFrom, inviteCodeIssue, inviteEmail,
  lastOwnerIssue, listRowIssue, maskNumber, mayAdminister, mayChangeRoles, nextSlug, normaliseClubName,
  normaliseInviteCode, planList, type ClubRole, type ClubStatus, type ListRow,
} from '@/lib/clubs'

export interface ClubRecord { id: string; slug: string; name: string; verifiedAt: string | null; refusedAt: string | null }

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
}

export interface ClubSummary { id: string; slug: string; name: string; status: ClubStatus; role: ClubRole }

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

function summary(club: ClubRecord, role: ClubRole): ClubSummary {
  return { id: club.id, slug: club.slug, name: club.name, status: clubStatus(club), role }
}

function entry(r: MemberRecord): ListEntry {
  return {
    id: r.id, name: r.name,
    memberNumber: maskNumber(r.memberNumber), guiNumber: maskNumber(r.guiNumber), email: r.email,
    role: r.role, linked: !!r.userId, removed: !!r.removedAt, onBoards: r.onBoards,
  }
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

  if (input.action === 'mine') {
    const mine = await store.clubsOf(user.id)
    return { status: 200, body: { ok: true, clubs: mine.map(x => summary(x.club, x.row.role)) } }
  }

  if (input.action === 'create') {
    const issue = clubNameIssue(str(input.name))
    if (issue) return fail(400, issue)
    const yourName = normaliseClubName(str(input.yourName))
    if (!yourName) return fail(400, 'Type your own name, as it goes on the club’s list.')
    if ((await store.clubsMadeBy(user.id)) >= MAX_CLUBS_MADE) return fail(409, `One account sets up at most ${MAX_CLUBS_MADE} clubs.`)
    const name = normaliseClubName(str(input.name))
    const base = clubSlug(name)
    const slug = nextSlug(base, await store.slugsLike(base))
    const club = await store.createClub({ slug, name, createdBy: user.id }, { name: yourName.slice(0, 80), email: user.email, userId: user.id })
    return { status: 200, body: { ok: true, club: summary(club, 'owner') } }
  }

  if (input.action === 'link') return runLink(input, user, store, now)

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
  const listed = (): ClubOutcome => ({ status: 200, body: { ok: true, club: summary(club, mine.role), list: rows.map(entry) } })

  if (input.action === 'members') return listed()

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
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: after.map(entry), added, updated, skipped } }
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
    if (Object.keys(patch).length === 0) return listed()
    if ((await store.updateRow(target.id, patch)) === 'clash') return fail(409, 'That number is already another person’s on the list.')
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: (await store.rows(clubId)).map(entry) } }
  }

  if (input.action === 'remove') {
    if (target.role !== 'member' && !mayChangeRoles(mine.role)) return fail(403, 'Only an owner takes an owner or admin off the list.')
    const why = lastOwnerIssue({ role: target.role, removed: !!target.removedAt }, { remove: true }, owners)
    if (why) return fail(409, why)
    // Severed, never deleted: the row stays, the link is cut, the access it
    // gave ends at once — and their account and their golf are untouched.
    await store.updateRow(target.id, { removed_at: now.toISOString(), user_id: null, linked_at: null })
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: (await store.rows(clubId)).map(entry) } }
  }

  if (input.action === 'restore') {
    await store.updateRow(target.id, { removed_at: null })
    return { status: 200, body: { ok: true, club: summary(club, mine.role), list: (await store.rows(clubId)).map(entry) } }
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
  return { status: 200, body: { ok: true, club: summary(club, row.role) } }
}
