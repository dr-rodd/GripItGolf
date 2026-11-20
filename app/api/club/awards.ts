// Golfer of the Year on the server (stage 6; P14) — the route's logic on an
// injected store, so `test:clubs` runs it. The rules are lib/clubAward.ts.
//
// The Clubhouse (`keep_calendar`, staff included) makes, changes and deletes
// a club's awards; anybody on the club's list reads them — the table and
// their own line ("You're 4th, 12 behind"). The standing is never stored:
// every read hands the year's certified Results and match play draws to
// `awardStanding`, and who may appear is judged by the award's entry rules
// on the last day of its year.

import { isAccount, type AuthUser } from '@/lib/account'
import { clubMay, credentialsOf } from '@/lib/clubMay'
import { STAFF_NAME } from '@/lib/clubhouse'
import { entryRefusal, readAgeDate, type Category } from '@/lib/clubMembership'
import { irishToday } from '@/lib/clubs'
import { awardIssue, awardStanding, myStandingLine, readAwardRules, type AwardResult, type AwardRules, type StandingRow } from '@/lib/clubAward'
import type { ActivityEntry, ClubRecord, MemberRecord } from './club'

export interface Award { id: string; clubId: string; year: number; name: string; rules: AwardRules }

/** Thrown by a store before migration 097. */
export class AwardsNotReady extends Error {}

export interface AwardsStore {
  userFromToken(token: string): Promise<AuthUser | null>
  club(clubId: string): Promise<ClubRecord | null>
  rowOf(clubId: string, userId: string): Promise<MemberRecord | null>
  isStaff?(userId: string): Promise<boolean>
  awards(clubId: string, year: number): Promise<Award[]>
  saveAward(a: Omit<Award, 'id'> & { id?: string }): Promise<string>
  deleteAward(clubId: string, id: string): Promise<void>
  /** The year's certified stroke Results and match play draws, by list row. */
  yearResults(clubId: string, year: number): Promise<AwardResult[]>
  /** The club's list. */
  rows(clubId: string): Promise<MemberRecord[]>
  memberships?(clubId: string): Promise<{ categories: Category[]; ageDate: string }>
  logActivity?(entries: ActivityEntry[]): Promise<void>
}

export interface AwardView { id: string; year: number; name: string; rules: AwardRules }

export type AwardsOutcome =
  | { status: 200; body: { ok: true; awards?: AwardView[]; standing?: StandingRow[]; award?: AwardView; mayKeep?: boolean; myRowId?: string | null; mine?: { id: string; name: string; line: string | null }[]; id?: string; ready?: boolean } }
  | { status: 400 | 401 | 403 | 404 | 503; body: { ok: false; error: string } }

type Fail = 400 | 401 | 403 | 404 | 503
const fail = (status: Fail, error: string): AwardsOutcome => ({ status, body: { ok: false, error } })
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const view = (a: Award): AwardView => ({ id: a.id, year: a.year, name: a.name, rules: a.rules })

/** Who may appear in an award: on the list, playing here (D209), and let in by its entry rules on the year's last day. */
export function eligiblePeople(rows: readonly MemberRecord[], rules: AwardRules, year: number, ms: { categories: Category[]; ageDate: string }): { rowId: string; name: string }[] {
  const day = `${year}-12-31`
  return rows
    .filter(r => !r.removedAt && clubMay('play', { row: credentialsOf(r) }))
    .filter(r => !entryRefusal({
      rules: rules.entry, person: { gender: r.gender ?? null, birthDate: r.birthDate ?? null, categoryId: r.categoryId ?? null },
      category: ms.categories.find(c => c.id === r.categoryId) ?? null, day, ageDate: readAgeDate(ms.ageDate), categories: ms.categories,
    }))
    .map(r => ({ rowId: r.id, name: r.name }))
}

export async function runAwards(input: Record<string, unknown> & { token: string | null; action: unknown }, store: AwardsStore, now: Date): Promise<AwardsOutcome> {
  if (!input.token) return fail(401, 'Sign in first.')
  const user = await store.userFromToken(input.token)
  if (!user || !isAccount(user)) return fail(403, 'Sign in to your Green Dot account first.')
  const clubId = str(input.clubId)
  const club = clubId ? await store.club(clubId).catch(() => null) : null
  if (!club || !club.verifiedAt) return fail(404, 'No such club.')
  const [row, staff] = await Promise.all([
    store.rowOf(club.id, user.id).catch(() => null),
    store.isStaff ? store.isStaff(user.id).catch(() => false) : Promise.resolve(false),
  ])
  const mayKeep = clubMay('keep_calendar', { row: row ? credentialsOf(row) : null, staff })
  if (!row && !mayKeep) return fail(403, 'Golfer of the Year is for the club’s members.')
  const action = str(input.action)
  const thisYear = Number(irishToday(now).slice(0, 4))
  const year = Number.isInteger(Number(input.year)) && Number(input.year) >= 2000 ? Number(input.year) : thisYear

  try {
    const ms = () => store.memberships ? store.memberships(club.id).catch(() => ({ categories: [] as Category[], ageDate: '01-01' })) : Promise.resolve({ categories: [] as Category[], ageDate: '01-01' })

    if (action === 'list') {
      return { status: 200, body: { ok: true, ready: true, awards: (await store.awards(club.id, year)).map(view), mayKeep, myRowId: row?.id ?? null } }
    }

    if (action === 'standing') {
      const award = (await store.awards(club.id, year)).find(a => a.id === str(input.id))
      if (!award) return fail(404, 'No such award.')
      const [results, rows, m] = await Promise.all([store.yearResults(club.id, award.year), store.rows(club.id), ms()])
      const standing = awardStanding(award.rules, results, eligiblePeople(rows, award.rules, award.year, m))
      return { status: 200, body: { ok: true, award: view(award), standing, mayKeep, myRowId: row?.id ?? null } }
    }

    // The members' card: each of this year's awards with this member's line — the results read once for all of them.
    if (action === 'mine') {
      const awards = await store.awards(club.id, thisYear)
      if (!awards.length || !row) return { status: 200, body: { ok: true, mine: [] } }
      const [results, rows, m] = await Promise.all([store.yearResults(club.id, thisYear), store.rows(club.id), ms()])
      const mine = awards.flatMap(a => {
        const people = eligiblePeople(rows, a.rules, a.year, m)
        if (!people.some(p => p.rowId === row.id)) return []
        return [{ id: a.id, name: a.name, line: myStandingLine(awardStanding(a.rules, results, people), row.id) }]
      })
      return { status: 200, body: { ok: true, mine } }
    }

    if (action === 'save' || action === 'delete') {
      if (!mayKeep) return fail(403, 'Only someone with Clubhouse keeps the club’s awards.')
      const byName = row?.name ?? STAFF_NAME
      if (action === 'delete') {
        const id = str(input.id)
        const was = (await store.awards(club.id, year)).find(a => a.id === id)
        if (!was) return fail(404, 'No such award.')
        await store.deleteAward(club.id, id)
        await store.logActivity?.([{ clubId: club.id, byUser: user.id, byName, byStaff: !row && staff, action: 'award.delete', memberId: null, memberName: null, changes: { [was.name]: [String(was.year), null] }, batchId: null }]).catch(() => undefined)
        return { status: 200, body: { ok: true } }
      }
      const rules = readAwardRules(input.rules)
      const name = str(input.name).trim().replace(/\s+/g, ' ')
      const issue = awardIssue({ name, year, rules })
      if (issue) return fail(400, issue)
      const id = str(input.id) || undefined
      if (id && !(await store.awards(club.id, year)).some(a => a.id === id)) return fail(404, 'No such award.')
      const saved = await store.saveAward({ id, clubId: club.id, year, name, rules })
      await store.logActivity?.([{ clubId: club.id, byUser: user.id, byName, byStaff: !row && staff, action: id ? 'award.change' : 'award.add', memberId: null, memberName: null, changes: { [name]: [id ? 'changed' : null, String(year)] }, batchId: null }]).catch(() => undefined)
      return { status: 200, body: { ok: true, id: saved } }
    }
  } catch (e) {
    if (e instanceof AwardsNotReady) return action === 'list' || action === 'mine'
      ? { status: 200, body: { ok: true, ready: false, awards: [], mine: [], mayKeep, myRowId: row?.id ?? null } }
      : fail(503, 'Golfer of the Year isn’t set up yet — try again later.')
    console.error('awards failed:', e)
    return fail(503, 'Could not reach Green Dot — try again.')
  }
  return fail(400, 'Unknown request.')
}
