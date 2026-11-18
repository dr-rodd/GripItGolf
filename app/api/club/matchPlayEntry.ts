// Entering a club match play (stage 2; Ross, 17 Nov 2026; D264–D271).
//
// A member on the club's list enters themselves on the competition's
// Summary until entries close; their player is made from their place on the
// list (`players.club_member_id`, one per event), with the one handicap
// index (D179) — the draw seeds on it and the match page reads it. Every
// player needs their own account (D94's exception), plays here (D209) and
// may enter by the competition's rules (`entryRefusal`, judged on the day
// entries close). They take themselves out until entries close; only the
// Clubhouse takes anybody else out, until the draw (Ross, 18 Nov 2026 —
// not the Officers), from the office (`office.state`, `office.withdraw`, `keep_calendar`, logged). Singles only
// for now: a pair enters together in stage 4.
//
// Every answer to a member on the list carries the members-only door's
// cookie (D164), as booking does. Handed its store, so `test:clubs` runs it.

import { isAccount, type AuthUser } from '@/lib/account'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { STAFF_NAME } from '@/lib/clubhouse'
import { irishToday } from '@/lib/clubs'
import { entryRefusal, readAgeDate, refusalWords, type Category } from '@/lib/clubMembership'
import { enterIssue, entryDay, matchPlayPhase, overCap, withdrawEntryIssue } from '@/lib/clubMatchPlay'
import type { ActivityEntry, MemberRecord } from './club'
import type { MatchPlayComp } from './matchPlayStore'

export interface Entrant { playerId: string; rowId: string | null; name: string }

export interface MatchPlayEntryStore {
  userFromToken(token: string): Promise<AuthUser | null>
  matchPlay(code: string): Promise<MatchPlayComp | null>
  /** This account's place on the club's list — linked, not taken off. */
  myRow(clubId: string, userId: string): Promise<MemberRecord | null>
  rowsByIds(clubId: string, ids: string[]): Promise<MemberRecord[]>
  /** The one handicap index for a row (D179). */
  indexOf(row: MemberRecord): Promise<number | null>
  /** The field in the order it entered. */
  entrants(tripId: string): Promise<Entrant[]>
  /** 'clash' when this row already has a player in the event. */
  insertPlayer(row: { trip_id: string; name: string; handicap: number | null; club_member_id: string; claimed: boolean; gender: 'M' | 'F' }): Promise<string | 'clash'>
  deletePlayer(tripId: string, playerId: string): Promise<void>
  linkAccount(userId: string, tripId: string, playerId: string): Promise<void>
  /** The members-only door's cookie value, or null when guests may watch. */
  doorToken(publicHash: string | null, code: string): string | null
  memberships?(clubId: string): Promise<{ categories: Category[]; ageDate: string }>
  logActivity?(entries: ActivityEntry[]): Promise<void>
  isStaff?(userId: string): Promise<boolean>
}

export interface EntryBody {
  ok: true
  myRowId?: string
  myPlayerId?: string | null
  /** An Officer: takes anybody out until the draw. */
  admin?: boolean
  /** Why this account may not enter by the rules, if it may not. */
  myRefusal?: string
  /** Why nobody more can enter now, if so. */
  closed?: string
  /** Why this account cannot take itself out now, if it is in and cannot. */
  stuck?: string
  entrants: { rowId: string | null; name: string }[]
  cap: number | null
  phase: string
}

export type EntryOutcome =
  | { status: 200; body: EntryBody; door: { code: string; value: string } | null }
  | { status: 400 | 401 | 403 | 404 | 409 | 503; body: { ok: false; error: string } }

type Fail = 400 | 401 | 403 | 404 | 409 | 503
const fail = (status: Fail, error: string): EntryOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function runMatchPlayEntry(
  input: Record<string, unknown> & { token: string | null; action: unknown },
  store: MatchPlayEntryStore,
  now: Date,
): Promise<EntryOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const mp = await store.matchPlay(str(input.code).trim().toUpperCase())
  if (!mp) return fail(404, 'No such competition.')
  const action = str(input.action)
  const me = await store.myRow(mp.clubId, user.id)

  // The Clubhouse takes an entry out (keep_calendar, D252) — staff included.
  if (action.startsWith('office.')) {
    const staff = store.isStaff ? await store.isStaff(user.id).catch(() => false) : false
    if (!clubMay('keep_calendar', { row: me ? credentialsOf(me) : null, staff })) return fail(403, 'Only someone with Clubhouse keeps the club’s competitions here.')
    if (action === 'office.state') {
      const field = await store.entrants(mp.tripId)
      return { status: 200, door: null, body: { ok: true, entrants: field.map(e => ({ rowId: e.rowId, name: e.name })), cap: mp.setup.maxField, phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won }, now) } }
    }
    if (action !== 'office.withdraw') return fail(400, 'Unknown request.')
    return withdraw({ store, mp, user, rowId: str(input.memberId), mine: false, admin: true, byName: me?.name ?? STAFF_NAME, byStaff: !me && staff, now, answer: null })
  }

  if (!me) return fail(403, 'This competition is for the club’s members. Sign in with the account on its list.')
  const admin = clubMay('run_events', { row: credentialsOf(me) })
  const tokenValue = store.doorToken(mp.publicHash, mp.code)
  const door = tokenValue ? { code: mp.code, value: tokenValue } : null

  const ms = store.memberships ? await store.memberships(mp.clubId).catch(() => ({ categories: [] as Category[], ageDate: '01-01' })) : { categories: [] as Category[], ageDate: '01-01' }
  const refusalOf = (r: Pick<MemberRecord, 'gender' | 'birthDate' | 'categoryId'>) => entryRefusal({
    rules: mp.entry, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null },
    category: ms.categories.find(c => c.id === r.categoryId) ?? null, day: entryDay(mp.setup, irishToday(now)),
    ageDate: readAgeDate(ms.ageDate), categories: ms.categories,
  })

  const answer = async (): Promise<EntryOutcome> => {
    const field = await store.entrants(mp.tripId)
    const mine = field.find(e => e.rowId === me.id)?.playerId ?? null
    const refused = refusalOf(me)
    const closed = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: field.length, admin: false })
    const stuck = mine ? withdrawEntryIssue(mp.setup, { now, drawn: mp.drawn, mine: true, admin: false }) : null
    return {
      status: 200, door,
      body: {
        ok: true, myRowId: me.id, myPlayerId: mine, admin,
        ...(refused ? { myRefusal: refusalWords(refused) } : {}),
        ...(closed ? { closed } : {}),
        ...(stuck ? { stuck } : {}),
        entrants: field.map(e => ({ rowId: e.rowId, name: e.name })),
        cap: mp.setup.maxField,
        phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won }, now),
      },
    }
  }

  if (action === 'state') {
    const field = await store.entrants(mp.tripId)
    const mine = field.find(e => e.rowId === me.id)?.playerId
    if (mine) await store.linkAccount(user.id, mp.tripId, mine).catch(() => undefined)
    return answer()
  }

  if (action === 'enter') {
    // D209: somebody who does not play here is in no field.
    if (!clubMay('play', { row: credentialsOf(me) })) return fail(409, 'You aren’t ticked as playing at the club — ask the office.')
    const refused = refusalOf(me)
    if (refused) return fail(409, refusalWords(refused))
    const field = await store.entrants(mp.tripId)
    if (field.some(e => e.rowId === me.id)) return answer()
    const issue = enterIssue(mp.setup, { now, drawn: mp.drawn, entered: field.length, admin: false })
    if (issue) return fail(409, issue)
    let playerId: string
    try {
      const made = await store.insertPlayer({
        trip_id: mp.tripId, name: me.name, handicap: await store.indexOf(me),
        club_member_id: me.id, claimed: true, gender: me.gender ?? 'M',
      })
      if (made === 'clash') return answer()
      playerId = made
    } catch (e) {
      console.error('match play entry failed:', e)
      return fail(503, 'Could not enter you — try again.')
    }
    // Two members on the last place at once: the later entry is taken back.
    const after = await store.entrants(mp.tripId)
    if (overCap(after.map(e => ({ id: e.playerId })), mp.setup.maxField).includes(playerId)) {
      await store.deletePlayer(mp.tripId, playerId).catch(() => undefined)
      return fail(409, 'Entries have just filled.')
    }
    await store.linkAccount(user.id, mp.tripId, playerId).catch(() => undefined)
    return answer()
  }

  if (action === 'withdraw') {
    const rowId = str(input.memberId) || me.id
    // Your own entry only, until entries close: taking anybody else out is the Clubhouse's (Ross, 18 Nov 2026).
    return withdraw({ store, mp, user, rowId, mine: rowId === me.id, admin: false, byName: me.name, byStaff: false, now, answer })
  }

  return fail(400, 'Unknown request.')
}

/** One entry taken out — yourself, or by an Officer or the office (logged). */
async function withdraw(o: {
  store: MatchPlayEntryStore; mp: MatchPlayComp; user: AuthUser; rowId: string; mine: boolean; admin: boolean
  byName: string; byStaff: boolean; now: Date; answer: (() => Promise<EntryOutcome>) | null
}): Promise<EntryOutcome> {
  const { store, mp } = o
  const field = await store.entrants(mp.tripId)
  const entry = field.find(e => e.rowId === o.rowId)
  if (!entry) return fail(404, 'That member isn’t entered.')
  const issue = withdrawEntryIssue(mp.setup, { now: o.now, drawn: mp.drawn, mine: o.mine, admin: o.admin })
  if (issue) return fail(403, issue)
  try {
    await store.deletePlayer(mp.tripId, entry.playerId)
  } catch (e) {
    console.error('match play withdraw failed:', e)
    return fail(503, 'Could not take the entry out — try again.')
  }
  if (!o.mine && store.logActivity) {
    await store.logActivity([{
      clubId: mp.clubId, byUser: o.user.id, byName: o.byName, byStaff: o.byStaff, action: 'comp.withdraw',
      memberId: entry.rowId, memberName: entry.name, changes: { [mp.code]: ['entered', 'taken out'] }, batchId: null,
    }]).catch(e => console.error('club activity not logged:', e))
  }
  if (o.answer) return o.answer()
  const rest = field.filter(e => e.playerId !== entry.playerId)
  return {
    status: 200, door: null,
    body: { ok: true, entrants: rest.map(e => ({ rowId: e.rowId, name: e.name })), cap: mp.setup.maxField, phase: matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won }, o.now) },
  }
}
