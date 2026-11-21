// A row of a club's list as stored, and its later columns read fail-soft —
// the credentials (migration 092) and the person's membership, gender and
// date of birth (094). Its own file, imported by every store that reads the
// list — the club's, the booking's, the card's, the entry's, the account's
// — so none of them imports another.

import type { ClubRole } from '@/lib/clubs'
import { playsByMembership } from '@/lib/clubMay'
import type { MemberRecord } from './club'

const BASE_ROW_COLS = 'id, club_id, name, member_number, gui_number, email, role, user_id, removed_at, on_boards'
// Plays here follows the membership (D275): the row's category's days are
// read beside it, and `plays_here` is no longer named — so the column can be
// dropped without a deploy reading it.
const TICK_COLS = 'officer, clubhouse'
const PEOPLE_COLS = 'category_id, gender, birth_date, category:club_categories(days)'

export type RowRow = {
  id: string; club_id: string; name: string; member_number: string | null; gui_number: string | null
  email: string | null; role: ClubRole; user_id: string | null; removed_at: string | null; on_boards: boolean
  /** Migration 092's ticks — absent before it. */
  plays_here?: boolean; officer?: boolean; clubhouse?: boolean
  /** Migration 094's membership and the person's gender and date of birth — absent before it. */
  category_id?: string | null; gender?: 'M' | 'F' | null; birth_date?: string | null
  /** The row's membership's playing days, read beside it (D275). */
  category?: { days: number[] | null } | { days: number[] | null }[] | null
}

/**
 * The later columns are read fail-soft: a query names them while they exist
 * and, refused for a missing column, is asked again without the set that is
 * missing — the error names the column, so 092's and 094's are told apart.
 * Without the ticks every row reads them off its role (`credentialsOf` in
 * lib/clubMay.ts); without 094 nobody has a membership, gender or date of
 * birth. Each is tried again a minute later, so pasting a migration takes
 * effect without a deploy.
 */
let ticksMissingAt = 0
let peopleMissingAt = 0
export function isMissingColumn(e: { code?: string } | null | undefined): boolean {
  // PGRST200: an embed whose table is not there yet (094's club_categories).
  return !!e && (e.code === '42703' || e.code === 'PGRST204' || e.code === 'PGRST200')
}
/** Whether to name 094's columns now. */
export function peopleOn(): boolean {
  return Date.now() - peopleMissingAt > 60_000
}
export function rowCols(ticks: boolean, people = peopleOn()): string {
  return `${BASE_ROW_COLS}${ticks ? `, ${TICK_COLS}` : ''}${people ? `, ${PEOPLE_COLS}` : ''}`
}
/** Whether to name the tick columns now. */
export function ticksOn(): boolean {
  return Date.now() - ticksMissingAt > 60_000
}
/** The tick columns were found missing: read off the role for a minute. */
export function ticksMissing() {
  ticksMissingAt = Date.now()
}
/** 094's columns were found missing: nobody has a membership for a minute. */
export function peopleMissing() {
  peopleMissingAt = Date.now()
}
/** Which set a missing-column error names: 094's, or else 092's. */
export function missingSet(e: { message?: string } | null | undefined): 'people' | 'ticks' {
  return /category_id|gender|birth_date|club_categories/.test(e?.message ?? '') ? 'people' : 'ticks'
}

export async function withTicks<R extends { error: { code?: string; message?: string } | null }>(run: (ticks: boolean) => PromiseLike<R>): Promise<R> {
  let ticks = ticksOn()
  let r = await run(ticks)
  for (let i = 0; i < 2 && isMissingColumn(r.error); i++) {
    if (missingSet(r.error) === 'people' && peopleOn()) peopleMissing()
    else if (ticks) { ticksMissing(); ticks = false }
    else break
    r = await run(ticks)
  }
  return r
}

/** A change to a column whose migration is not in yet (092's ticks, 094's membership). */
export class TicksNotReady extends Error {
  constructor() { super('club_members is missing a column a change needs (migration 092 or 094)'); this.name = 'TicksNotReady' }
}

export const asRow = (r: RowRow): MemberRecord => ({
  id: r.id, clubId: r.club_id, name: r.name, memberNumber: r.member_number, guiNumber: r.gui_number,
  email: r.email, role: r.role, userId: r.user_id, removedAt: r.removed_at, onBoards: r.on_boards,
  ...(typeof r.officer === 'boolean' ? { officer: r.officer, clubhouse: !!r.clubhouse } : {}),
  ...('category_id' in r ? { categoryId: r.category_id ?? null, gender: r.gender ?? null, birthDate: r.birth_date ?? null } : {}),
  playsHere: playsOf(r),
})

/** Plays here, from the membership (D275); before 094 nobody has one, so everybody plays. */
function playsOf(r: RowRow): boolean {
  if (!r.category_id) return true
  const c = Array.isArray(r.category) ? r.category[0] : r.category
  return playsByMembership(c ? c.days ?? [] : null)
}
