// The Clubhouse's half of /api/club (stage (k1); D202, D207, D210, D212,
// D222). Handed the club route's store, so `test:clubs` runs it on the same
// stand-in. Every answer is for somebody `clubMay` lets into the Clubhouse:
// a Clubhouse holder at that club, or Green Dot staff at any club.
//
// * `clubhouse` — the door at one club: the club, what this account may do
//   there, whether they are staff, and the other clubs they may open. Staff
//   opening a club is logged and shown to it as "Green Dot staff".
// * `find` — staff only: verified clubs by name.
// * `overview` — the list's counts, competitions by phase, "Needs you".
// * `page` — 50 rows of the list, searched, filtered and ordered by the
//   database, numbers whole, each with its index and standing.
// * `export` — the whole list as a file, logged.
// * `season` — every event under the club, a competition's facts with it
//   (stage (k2)): the Competitions table and the Calendar.
// * `bulk` — the ticked rows: a tick given or taken, a code each, off the
//   list or back on it — each row through `clubMay`, what could not be done
//   said by name.

import { clubMay, credentialChangeIssue, credentialsOf, removeIssue, storedRole, withChange, type Asker, type CredentialKey, type Credentials } from '@/lib/clubMay'
import {
  PAGE_SIZE, STAFF_NAME, cleanSearch, listCsv, needsYou, readFilter, readSort,
  type GridRow, type ListCounts, type ListFilter, type ListSort, type SeasonEvent,
} from '@/lib/clubhouse'
import { INVITE_DAYS, INVITE_RESEND_MINUTES, inviteCodeFrom, inviteEmail, irishToday, maskNumber } from '@/lib/clubs'
import { severIndex } from '../handicaps/handicaps'
import { inviteHash } from './invites'
import type { AuthUser } from '@/lib/account'
import type { ActivityEntry, ClubOutcome, ClubRecord, ClubStore, ClubSummary, MemberRecord } from './club'

/** A row as the grid's read returns it: the list row, when its code was last sent, and its own index. */
export type PageRecord = MemberRecord & { invitedAt: string | null; ownIndex: number | null }

export interface ListQuery {
  q: string
  filter: ListFilter
  sort: ListSort
  desc: boolean
  page: number
  size: number
}

/** What the Clubhouse asks of the store beyond the club route's own (all optional: absent, the Clubhouse says it is not set up). */
export interface ClubhouseStore {
  /** This account's row at the club, linked and not taken off. */
  rowOf?(clubId: string, userId: string): Promise<MemberRecord | null>
  /** Whether this account is Green Dot staff (093; false before it). */
  isStaff?(userId: string): Promise<boolean>
  /** Verified clubs whose name holds the words, for staff. */
  searchClubs?(q: string): Promise<ClubRecord[]>
  listPage?(clubId: string, query: ListQuery): Promise<{ rows: PageRecord[]; total: number }>
  listCounts?(clubId: string): Promise<ListCounts>
  /** When codes went out: written beside each new one (093). */
  markInvited?(memberId: string, at: string): Promise<void>
  /** Stage (k2): every event under the club, with a competition's facts. */
  seasonEvents?(clubId: string): Promise<SeasonEvent[]>
}

type Store = ClubStore & ClubhouseStore

const NONE: Credentials = { owner: false, playsHere: false, officer: false, clubhouse: false }
const fail = (status: 400 | 401 | 403 | 404 | 409 | 429 | 503, error: string): ClubOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The actions this file answers. */
export const CLUBHOUSE_ACTIONS = ['clubhouse', 'find', 'overview', 'page', 'export', 'bulk', 'season'] as const

export function isClubhouseAction(a: unknown): boolean {
  return (CLUBHOUSE_ACTIONS as readonly unknown[]).includes(a)
}

/** Who is asking at this club: their row (or none), and whether staff. */
export async function clubhouseAsker(store: Store, clubId: string, userId: string): Promise<{ row: MemberRecord | null; asker: Asker }> {
  const [row, staff] = await Promise.all([
    store.rowOf ? store.rowOf(clubId, userId).catch(() => null) : Promise.resolve(null),
    store.isStaff ? store.isStaff(userId).catch(() => false) : Promise.resolve(false),
  ])
  return { row, asker: { row: row ? credentialsOf(row) : null, staff } }
}

/** A grid row as it is answered — numbers whole (Ross, 16 Nov 2026). */
export function gridRow(r: PageRecord, accountIndex: number | null): GridRow {
  return {
    id: r.id, name: r.name, email: r.email, memberNumber: r.memberNumber, guiNumber: r.guiNumber,
    handicapIndex: r.userId ? accountIndex : r.ownIndex,
    credentials: credentialsOf(r), linked: !!r.userId, removed: !!r.removedAt, invitedAt: r.invitedAt, onBoards: r.onBoards,
  }
}

/** Every row of a page with its one index (D179): a linked row's account's, an unlinked row's own. */
export async function gridRows(store: Store, rows: PageRecord[]): Promise<GridRow[]> {
  const linked = [...new Set(rows.filter(r => r.userId).map(r => r.userId as string))]
  const accounts = linked.length && store.handicaps ? await store.handicaps.accountIndexes(linked).catch(() => new Map<string, number>()) : new Map<string, number>()
  return rows.map(r => gridRow(r, r.userId ? accounts.get(r.userId) ?? null : null))
}

export async function runClubhouse(
  input: Record<string, unknown>,
  user: AuthUser,
  store: Store,
  now: Date,
  summary: (club: ClubRecord, row: MemberRecord | Credentials) => ClubSummary,
): Promise<ClubOutcome> {
  const action = input.action

  if (action === 'find') {
    const staff = store.isStaff ? await store.isStaff(user.id).catch(() => false) : false
    if (!staff) return fail(403, 'Only Green Dot staff find clubs here.')
    const q = cleanSearch(input.q)
    const found = q.length >= 2 && store.searchClubs ? await store.searchClubs(q) : []
    return { status: 200, body: { ok: true, clubs: found.map(c => ({ ...summary(c, NONE), staff: true })) } }
  }

  // The door at one club, by its address.
  if (action === 'clubhouse') {
    const club = await store.clubBySlug(str(input.slug))
    if (!club || !club.verifiedAt) return fail(404, 'No such club.')
    const full = (await store.club(club.id)) ?? club
    const { row, asker } = await clubhouseAsker(store, club.id, user.id)
    if (!clubMay('open_clubhouse', asker)) return fail(403, 'You haven’t been given access to the Clubhouse.')
    // The other clubs this account may open, by name (staff find theirs by search).
    const mine = (await store.clubsOf(user.id).catch(() => []))
      .filter(x => x.club.verifiedAt && clubMay('open_clubhouse', { row: credentialsOf(x.row) }))
      .map(x => ({ slug: x.club.slug, name: x.club.name, toSign: 0 }))
    if (asker.staff && !row && store.logActivity) {
      // D222: a staff visit is the club's to see.
      await store.logActivity([{ clubId: club.id, byUser: user.id, byName: STAFF_NAME, byStaff: true, action: 'staff.open', memberId: null, memberName: null, changes: {}, batchId: null }])
        .catch(e => console.error('club activity not logged:', e))
    }
    return {
      status: 200,
      body: { ok: true, club: { ...summary(full, row ?? NONE), staff: !!asker.staff }, myClubs: mine, me: { name: row?.name ?? STAFF_NAME } },
    }
  }

  // Everything else is one club's, by its id.
  const clubId = str(input.clubId)
  const club = clubId ? await store.club(clubId) : null
  if (!club) return fail(404, 'No such club.')
  const { row: mine, asker } = await clubhouseAsker(store, club.id, user.id)
  if (!clubMay('open_clubhouse', asker)) return fail(403, 'You haven’t been given access to the Clubhouse.')
  const byName = mine?.name ?? STAFF_NAME
  const line = (act: string, target: MemberRecord | null, changes: Record<string, [unknown, unknown]>, batchId: string | null = null): ActivityEntry => ({
    clubId: club.id, byUser: user.id, byName: asker.staff && !mine ? STAFF_NAME : byName, byStaff: !!asker.staff && !mine, action: act,
    memberId: target?.id ?? null, memberName: target?.name ?? null, changes, batchId,
  })
  const logged = async (entries: ActivityEntry[]) => {
    if (store.logActivity && entries.length) await store.logActivity(entries).catch(e => console.error('club activity not logged:', e))
  }

  if (action === 'overview') {
    if (!store.listCounts) return fail(503, 'The Clubhouse isn’t set up yet — try again later.')
    const [counts, events] = await Promise.all([store.listCounts(club.id), store.clubEvents(club.id).catch(() => [])])
    const comps = events.filter(e => e.competition)
    const year = irishToday(now).slice(0, 4)
    const phases = comps.map(e => ({ code: e.code, name: e.name, phase: e.competition!.phase, date: e.startDate }))
    const byPhase: Record<string, number> = {}
    for (const p of phases) if (p.phase !== 'certified' || (p.date ?? '').startsWith(year)) byPhase[p.phase] = (byPhase[p.phase] ?? 0) + 1
    const needs = needsYou({ base: `/clubhouse/${club.slug}`, counts, phases, clubSlug: club.slug, officer: clubMay('run_events', asker) })
    return { status: 200, body: { ok: true, counts, byPhase, needs } }
  }

  if (action === 'page') {
    if (!store.listPage) return fail(503, 'The Clubhouse isn’t set up yet — try again later.')
    const page = Math.max(0, Math.min(1000, Math.floor(Number(input.page) || 0)))
    const query: ListQuery = { q: cleanSearch(input.q), filter: readFilter(input.filter), sort: readSort(input.sort), desc: input.desc === true, page, size: PAGE_SIZE }
    const { rows, total } = await store.listPage(club.id, query)
    return { status: 200, body: { ok: true, grid: await gridRows(store, rows), total } }
  }

  // Stage (k2), D214, D215: the season table and the calendar read one list.
  if (action === 'season') {
    if (!store.seasonEvents) return fail(503, 'The Clubhouse isn’t set up yet — try again later.')
    return { status: 200, body: { ok: true, calendar: await store.seasonEvents(club.id) } }
  }

  if (action === 'export') {
    if (!store.listPage) return fail(503, 'The Clubhouse isn’t set up yet — try again later.')
    const out: PageRecord[] = []
    for (let p = 0; p < 20; p++) {
      const { rows } = await store.listPage(club.id, { q: '', filter: readFilter(input.filter ?? 'all'), sort: 'name', desc: false, page: p, size: 1000 })
      out.push(...rows)
      if (rows.length < 1000) break
    }
    const grid = await gridRows(store, out)
    await logged([line('list.download', null, { rows: [null, grid.length] })])
    return { status: 200, body: { ok: true, csv: listCsv(grid), total: grid.length } }
  }

  if (action === 'bulk') {
    const ids = [...new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(str).filter(Boolean))].slice(0, 500)
    if (!ids.length) return fail(400, 'Tick somebody first.')
    const op = str(input.op)
    const rows = await store.rows(club.id)
    const owners = rows.filter(r => credentialsOf(r).owner && !r.removedAt).length
    const batchId = randomUuid(store)
    const failed: { name: string; why: string }[] = []
    const lines: ActivityEntry[] = []
    let done = 0
    for (const id of ids) {
      const target = rows.find(r => r.id === id)
      if (!target) continue
      const before = credentialsOf(target)
      try {
        if (op === 'tick') {
          const key = str(input.key) as CredentialKey
          if (!['playsHere', 'officer', 'clubhouse'].includes(key) || typeof input.value !== 'boolean') return fail(400, 'Which tick?')
          const change = { [key]: input.value } as Partial<Credentials>
          const why = credentialChangeIssue(asker, { credentials: before, removed: !!target.removedAt }, change, owners)
          if (why) { failed.push({ name: target.name, why }); continue }
          const next = withChange(before, change)
          if (next[key] === before[key]) { done++; continue }
          await store.updateRow(target.id, { plays_here: next.playsHere, officer: next.officer, clubhouse: next.clubhouse, role: storedRole(next) })
          lines.push(line('credentials', target, { [key]: [before[key], next[key]] }, batchId))
          done++
        } else if (op === 'remove') {
          if (target.removedAt) { done++; continue }
          const why = removeIssue(asker, { credentials: before, removed: false }, owners)
          if (why) { failed.push({ name: target.name, why }); continue }
          if (target.userId && store.handicaps) await severIndex(store.handicaps, target.userId, target.id, user.id).catch(e => console.error('index copy failed:', e))
          await store.updateRow(target.id, { removed_at: now.toISOString(), user_id: null, linked_at: null })
          lines.push(line('row.remove', target, { removed: [false, true], linked: [!!target.userId, false] }, batchId))
          done++
        } else if (op === 'restore') {
          if (!target.removedAt) { done++; continue }
          if ((before.clubhouse && !clubMay('grant_clubhouse', asker)) || (before.owner && !clubMay('grant_owner', asker))) {
            failed.push({ name: target.name, why: 'Only an owner or Green Dot puts back someone with Clubhouse.' }); continue
          }
          await store.updateRow(target.id, { removed_at: null })
          lines.push(line('row.restore', target, { removed: [true, false] }, batchId))
          done++
        } else if (op === 'invite') {
          if (target.removedAt || target.userId) { failed.push({ name: target.name, why: target.userId ? 'Already joined.' : 'Taken off the list.' }); continue }
          if (!target.email) { failed.push({ name: target.name, why: 'No email to send it to.' }); continue }
          const last = await store.lastInviteAt(target.id)
          if (last && now.getTime() - Date.parse(last) < INVITE_RESEND_MINUTES * 60_000) { failed.push({ name: target.name, why: 'A code went a moment ago.' }); continue }
          const code = inviteCodeFrom(store.randomBytes(16))
          await store.saveInvite({ memberId: target.id, email: target.email, codeHash: inviteHash(code), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString() })
          if (store.markInvited) await store.markInvited(target.id, now.toISOString()).catch(() => undefined)
          const mail = inviteEmail({ clubName: club.name, name: target.name, code, site: store.siteOrigin() })
          const sent = await store.sendEmail(target.email, mail.subject, mail.html, mail.text).catch(() => false)
          if (!sent) { failed.push({ name: target.name, why: 'Could not send the email.' }); continue }
          lines.push(line('invite', target, { email: [null, target.email] }, batchId))
          done++
        } else {
          return fail(400, 'Nothing to do.')
        }
      } catch (e) {
        if ((e as Error)?.name === 'TicksNotReady') return fail(503, 'The ticks aren’t set up yet — try again later.')
        console.error('bulk change failed:', e)
        failed.push({ name: target.name, why: 'Could not save — try again.' })
      }
    }
    await logged(lines)
    return { status: 200, body: { ok: true, done, failed } }
  }

  return fail(400, 'Nothing to do.')
}

/** A batch id from the store's random bytes. */
function randomUuid(store: Store): string {
  const b = store.randomBytes(16)
  const h = [...b.slice(0, 16)].map((x, i) => ((i === 6 ? (x & 0x0f) | 0x40 : i === 8 ? (x & 0x3f) | 0x80 : x)).toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Numbers as the phone's list shows them — for the log, never the grid. */
export const logNumber = maskNumber
